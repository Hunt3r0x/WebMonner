#!/usr/bin/env node

import { program } from 'commander';
import fs from 'fs';
import runCrawler from './crawler.js';
import { showBanner, log, summary, SleepTimer, showColorSupport, getColorSupport } from './utils.js';
import { DiscordNotifier } from './notifications.js';
import { cleanupAllOldDiffs, getDomainDiskUsage } from './fileManager.js';

// Show professional banner
showBanner();

program
  .option('--url <url>', 'Target URL (single URL)')
  .option('--urls <file>', 'File containing list of URLs (one per line)')
  .option('--auth', 'Enable auth login')
  .option('--header <header...>', 'Custom headers, e.g., "Cookie: sessionid=abc123"')
  .option('--live', 'Enable live monitoring (runs continuously)')
  .option('--interval <seconds>', 'Monitoring interval in seconds (default: 30)', '30')
  .option('--include-domain <pattern>', 'Only monitor JS files from domains matching this pattern (e.g., *.felixforus.ca)')
  .option('--exclude-domain <pattern>', 'Exclude JS files from domains matching this pattern')
  .option('--include-url <pattern>', 'Only monitor JS files matching this URL pattern')
  .option('--exclude-url <pattern>', 'Exclude JS files matching this URL pattern')
  .option('--quiet', 'Reduce output verbosity')
  .option('--verbose', 'Show all file statuses including unchanged files')
  .option('--no-color', 'Disable colored output (for compatibility)')
  .option('--debug-colors', 'Show color support information and exit')
  .option('--no-code-preview', 'Disable showing new code sections in output')
  .option('--max-lines <number>', 'Maximum lines to show per code section (default: 10)', '10')
  .option('--discord-webhook <url>', 'Discord webhook URL for notifications')
  .option('--test-discord', 'Send a test Discord notification and exit')
  .option('--no-diff', 'Disable saving diff files to save disk space')
  .option('--max-diff-files <number>', 'Maximum diff files to keep per domain (default: 50)', '50')
  .option('--no-cleanup', 'Disable automatic cleanup of old diff files')
  .option('--cleanup-diffs', 'Clean up old diff files and exit');

program.parse(process.argv);
const opts = program.opts();

// Initialize Discord notifier
const discordNotifier = new DiscordNotifier(opts.discordWebhook);

// Handle debug colors command
if (opts.debugColors) {
  console.log('Terminal Color Support Debug Information:');
  console.log('========================================');
  console.log(`TERM: ${process.env.TERM || 'not set'}`);
  console.log(`COLORTERM: ${process.env.COLORTERM || 'not set'}`);
  console.log(`NO_COLOR: ${process.env.NO_COLOR || 'not set'}`);
  console.log(`--no-color flag: ${opts.noColor ? 'yes' : 'no'}`);
  console.log(`tmux/screen: ${process.env.TERM && (process.env.TERM.includes('tmux') || process.env.TERM.includes('screen')) ? 'yes' : 'no'}`);
  console.log('');
  showColorSupport();
  console.log('');
  console.log('Test colors:');
  const colorSupport = getColorSupport();
  if (colorSupport === 'full') {
    console.log('[FULL] Full color support detected');
  } else if (colorSupport === 'basic') {
    console.log('[BASIC] Basic color support detected');
  } else {
    console.log('[NONE] No color support detected');
  }
  process.exit(0);
}

// Handle cleanup command
if (opts.cleanupDiffs) {
  log.info('Cleaning up old diff files...');
  const result = cleanupAllOldDiffs(parseInt(opts.maxDiffFiles) || 50);
  if (result) {
    log.success(`Cleanup complete: Deleted ${result.deletedFiles} files, saved ${result.savedSpace} bytes`);
  } else {
    log.info('No cleanup needed or no diff files found.');
  }
  process.exit(0);
}

// Handle test Discord notification
if (opts.testDiscord) {
  if (!opts.discordWebhook) {
    log.error('Discord webhook URL required for testing. Use --discord-webhook <url>');
    process.exit(1);
  }
  
  log.info('Sending test Discord notification...');
  try {
    await discordNotifier.sendTestNotification();
    log.success('Test notification sent! Check your Discord channel.');
  } catch (error) {
    log.error(`Test notification failed: ${error.message}`);
  }
  process.exit(0);
}

// Validate URL input
if (!opts.url && !opts.urls) {
  log.error('Must provide either --url or --urls option');
  process.exit(1);
}

if (opts.url && opts.urls) {
  log.error('Cannot use both --url and --urls options together');
  process.exit(1);
}

// Parse URLs
let targetUrls = [];
if (opts.url) {
  targetUrls = [opts.url];
} else {
  try {
    const urlsContent = fs.readFileSync(opts.urls, 'utf-8');
    targetUrls = urlsContent
      .split('\n')
      .map(url => url.trim())
      .filter(url => url && !url.startsWith('#')); // Remove empty lines and comments
  } catch (error) {
    log.error(`Error reading URLs file: ${error.message}`);
    process.exit(1);
  }
}

if (targetUrls.length === 0) {
  log.error('No valid URLs found');
  process.exit(1);
}

// Parse headers
const headers = {};
if (opts.header) {
  opts.header.forEach(h => {
    const [key, value] = h.split(':').map(s => s.trim());
    headers[key] = value;
  });
}

// Create filters
const filters = {
  includeDomain: opts.includeDomain || null,
  excludeDomain: opts.excludeDomain || null,
  includeUrl: opts.includeUrl || null,
  excludeUrl: opts.excludeUrl || null
};

const config = {
  urls: targetUrls,
  authEnabled: opts.auth || false,
  customHeaders: headers,
  liveMode: opts.live || false,
  interval: parseInt(opts.interval) * 1000, // Convert to milliseconds
  filters: filters,
  quiet: opts.quiet || false,
  verbose: opts.verbose || false,
  showCodePreview: opts.codePreview !== false,
  maxLines: parseInt(opts.maxLines) || 10,
  discordNotifier: discordNotifier,
  saveDiff: opts.diff !== false,
  maxDiffFiles: parseInt(opts.maxDiffFiles) || 50,
  cleanupOldDiffs: opts.cleanup !== false
};

// Show configuration summary
const configData = {
  'Target URLs': targetUrls.length,
  'Authentication': config.authEnabled ? 'Enabled' : 'Disabled',
  'Live Mode': config.liveMode ? `Every ${opts.interval}s` : 'Single run',
  'Custom Headers': Object.keys(headers).length,
  'Domain Filter': filters.includeDomain || filters.excludeDomain || 'None',
  'URL Filter': filters.includeUrl || filters.excludeUrl || 'None',
  'Output Mode': config.quiet ? 'Quiet' : config.verbose ? 'Verbose' : 'Normal',
  'Code Preview': config.showCodePreview ? 'Enabled' : 'Disabled',
  'Max Lines': config.maxLines,
  'Discord Alerts': opts.discordWebhook ? 'Enabled' : 'Disabled',
  'Diff Storage': config.saveDiff ? 'Enabled' : 'Disabled',
  'Max Diff Files': config.maxDiffFiles,
  'Auto Cleanup': config.cleanupOldDiffs ? 'Enabled' : 'Disabled'
};

summary.create('Configuration', configData);

// Send Discord notification for live monitoring start
if (config.liveMode && discordNotifier.enabled) {
  await discordNotifier.sendNotification('live_monitoring_start', {
    urlCount: targetUrls.length,
    interval: `${opts.interval}s`,
    domainFilter: filters.includeDomain || filters.excludeDomain,
    authEnabled: config.authEnabled
  });
}

if (config.liveMode) {
  log.info('Live monitoring active - Press Ctrl+C to stop');
  if (discordNotifier.enabled) {
    log.info('Discord notifications enabled');
  }
  log.separator();
  
  // Initial run
  await runCrawler(config);
  
  // Live monitoring loop with visual countdown
  async function runLiveMonitoring() {
    while (true) {
      try {
        // Process any queued Discord notifications before starting new scan
        if (discordNotifier.enabled) {
          await discordNotifier.processQueuedNotifications();
        }
        
        // Create and start sleep timer
        const sleepTimer = new SleepTimer(parseInt(opts.interval), 'Next scan');
        await sleepTimer.start();
        
        // Run the next scan
        log.header(`Scheduled Scan - ${new Date().toLocaleTimeString()}`);
        await runCrawler(config);
      } catch (error) {
        log.error(`Scheduled scan failed: ${error.message}`);
        
        // Add to batch for Discord notification
        if (discordNotifier.enabled) {
          discordNotifier.addToBatch('error', {
            type: 'SCHEDULED_SCAN_ERROR',
            message: error.message,
            url: 'Live monitoring'
          });
          // Send batched summary for errors
          await discordNotifier.sendBatchedSummary();
        }
        
        // Still show countdown even after error
        const sleepTimer = new SleepTimer(parseInt(opts.interval), 'Next scan (after error)');
        await sleepTimer.start();
      }
    }
  }
  
  // Start live monitoring
  runLiveMonitoring().catch(error => {
    log.error(`Live monitoring failed: ${error.message}`);
    process.exit(1);
  });
} else {
  await runCrawler(config);
} 