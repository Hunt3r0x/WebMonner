#!/usr/bin/env node

import { program } from 'commander';
import fs from 'fs';
import runCrawler from './crawler.js';
import { showBanner, log, summary, SleepTimer, showColorSupport, getColorSupport } from './utils.js';
import { DiscordNotifier } from './notifications.js';
import { cleanupAllOldDiffs, getDomainDiskUsage } from './fileManager.js';
import { codeAnalyzer } from './similarityAnalyzer.js';
import { generateEndpointReport, getEndpointStorageStats, cleanupAllEndpointData } from './endpointExtractor.js';
import { formatFileSize } from './utils.js';

// Show professional banner
showBanner();

program
  .option('--url <url>', 'Target URL (single URL)')
  .option('--urls <file>', 'File containing list of URLs (one per line)')
  .option('--auth', 'Enable auth login')
  .option('--header <header...>', 'Custom headers, e.g., "Cookie: sessionid=abc123"')
  .option('--live', 'Enable live monitoring (runs continuously)')
  .option('--interval <seconds>', 'Monitoring interval in seconds (default: 30)', '30')
  .option('--include-domain <pattern...>', 'Only monitor JS files from domains matching these patterns (comma-separated or multiple flags)')
  .option('--exclude-domain <pattern...>', 'Exclude JS files from domains matching these patterns (comma-separated or multiple flags)')
  .option('--include-url <pattern...>', 'Only monitor JS files matching these URL patterns (comma-separated or multiple flags)')
  .option('--exclude-url <pattern...>', 'Exclude JS files matching these URL patterns (comma-separated or multiple flags)')
  .option('--quiet', 'Reduce output verbosity')
  .option('--verbose', 'Show all file statuses including unchanged files')
  .option('--debug', 'Enable detailed debugging output')
  .option('--no-color', 'Disable colored output (for compatibility)')
  .option('--debug-colors', 'Show color support information and exit')
  .option('--no-code-preview', 'Disable showing new code sections in output')
  .option('--max-lines <number>', 'Maximum lines to show per code section (default: 10)', '10')
  .option('--discord-webhook <url>', 'Discord webhook URL for notifications')
  .option('--test-discord', 'Send a test Discord notification and exit')
  .option('--no-diff', 'Disable saving diff files to save disk space')
  .option('--max-diff-files <number>', 'Maximum diff files to keep per domain (default: 50)', '50')
  .option('--no-cleanup', 'Disable automatic cleanup of old diff files')
  .option('--cleanup-diffs', 'Clean up old diff files and exit')
  .option('--analyze-similarity <domain>', 'Analyze file similarity for a specific domain and exit')
  .option('--analyze-all-domains', 'Analyze file similarity for all domains and exit')
  .option('--similarity-threshold <number>', 'Similarity threshold (0.0-1.0, default: 0.7)', '0.7')
  .option('--extract-endpoints', 'Enable endpoint extraction from JavaScript files')
  .option('--show-endpoints', 'Show extracted endpoints in output')
  .option('--endpoint-regex <pattern...>', 'Custom regex patterns for endpoint extraction (can be used multiple times)')
  .option('--generate-endpoint-report <domain>', 'Generate comprehensive endpoint report for a domain and exit')
  .option('--generate-all-endpoint-reports', 'Generate endpoint reports for all domains and exit')
  .option('--cleanup-endpoints', 'Clean up excessive endpoint data and exit')
  .option('--endpoint-storage-stats', 'Show endpoint storage statistics for all domains and exit')
  .option('--max-endpoints <number>', 'Maximum endpoints to store per domain (default: 1000)', '1000')
  .option('--max-endpoint-files <number>', 'Maximum endpoint files to keep per domain (default: 100)', '100');

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

// Handle similarity analysis commands
if (opts.analyzeSimilarity) {
  log.info(`Analyzing file similarity for domain: ${opts.analyzeSimilarity}`);
  try {
    // Set custom similarity threshold if provided
    const threshold = parseFloat(opts.similarityThreshold);
    if (threshold >= 0 && threshold <= 1) {
      codeAnalyzer.similarityThreshold = threshold;
      log.info(`Using similarity threshold: ${threshold}`);
    }
    
    const report = codeAnalyzer.generateSimilarityReport(opts.analyzeSimilarity);
    if (report) {
      log.success(`Similarity report generated: ${report.reportPath}`);
      log.info(`Analysis Summary:`);
      log.info(`  Total Files: ${report.summary.totalFiles}`);
      log.info(`  File Clusters: ${report.summary.clusters}`);
      log.info(`  Unique Files: ${report.summary.singletons}`);
      
      if (report.summary.clusters > 0) {
        log.info(`File clusters identified: ${report.summary.clusters} groups`);
        log.info(`Analysis suggests renamed or relocated files with similar functionality`);
      }
      
      // Clean up old fingerprints
      codeAnalyzer.cleanupOldFingerprints(opts.analyzeSimilarity);
    } else {
      log.warning(`No data found for domain: ${opts.analyzeSimilarity}`);
    }
  } catch (error) {
    log.error(`Similarity analysis failed: ${error.message}`);
  }
  process.exit(0);
}

if (opts.analyzeAllDomains) {
  log.info('Analyzing file similarity for all domains...');
  try {
    // Set custom similarity threshold if provided
    const threshold = parseFloat(opts.similarityThreshold);
    if (threshold >= 0 && threshold <= 1) {
      codeAnalyzer.similarityThreshold = threshold;
      log.info(`Using similarity threshold: ${threshold}`);
    }
    
    // Find all domains with data
    const dataDir = 'data';
    if (!fs.existsSync(dataDir)) {
      log.warning('No data directory found. Run a scan first.');
      process.exit(1);
    }
    
    const domains = fs.readdirSync(dataDir).filter(item => 
      fs.statSync(`${dataDir}/${item}`).isDirectory()
    );
    
    if (domains.length === 0) {
      log.warning('No domains found in data directory.');
      process.exit(1);
    }
    
    log.info(`Found ${domains.length} domains to analyze`);
    log.separator();
    
    let totalClusters = 0;
    let analyzedDomains = 0;
    
    for (const domain of domains) {
      try {
        log.info(`Analyzing ${domain}...`);
        const report = codeAnalyzer.generateSimilarityReport(domain);
        if (report) {
          log.success(`Report: ${report.reportPath}`);
          log.muted(`  Files: ${report.summary.totalFiles}, Clusters: ${report.summary.clusters}, Unique: ${report.summary.singletons}`);
          
          if (report.summary.clusters > 0) {
            totalClusters += report.summary.clusters;
            log.info(`  🔍 Found ${report.summary.clusters} groups of similar files`);
          }
          
          // Clean up old fingerprints
          codeAnalyzer.cleanupOldFingerprints(domain);
          analyzedDomains++;
        } else {
          log.muted(`  No data found for ${domain}`);
        }
      } catch (error) {
        log.warning(`  Failed to analyze ${domain}: ${error.message}`);
      }
    }
    
    log.separator();
    log.success(`Analysis complete: ${analyzedDomains} domains analyzed`);
    if (totalClusters > 0) {
      log.info(`Total file clusters identified: ${totalClusters}`);
      log.info(`Results suggest renamed or relocated files with similar functionality`);
    }
  } catch (error) {
    log.error(`Similarity analysis failed: ${error.message}`);
  }
  process.exit(0);
}

// Handle endpoint report generation
if (opts.generateEndpointReport) {
  log.info(`Generating endpoint report for domain: ${opts.generateEndpointReport}`);
  try {
    const report = generateEndpointReport(opts.generateEndpointReport);
    if (report) {
      log.success(`Endpoint report generated: ${report.reportPath}`);
      log.info(`Report Summary:`);
      log.info(`  Total Endpoints: ${report.totalEndpoints}`);
      log.info(`  High Confidence: ${report.byConfidence.HIGH?.length || 0}`);
      log.info(`  Medium Confidence: ${report.byConfidence.MEDIUM?.length || 0}`);
      log.info(`  Low Confidence: ${report.byConfidence.LOW?.length || 0}`);
      
      if (report.totalEndpoints > 0) {
        log.info(`Unique endpoints discovered: ${report.totalEndpoints}`);
        log.info(`Detailed analysis available in report file`);
      }
    } else {
      log.warning(`No endpoint data found for domain: ${opts.generateEndpointReport}`);
    }
  } catch (error) {
    log.error(`Endpoint report generation failed: ${error.message}`);
  }
  process.exit(0);
}

if (opts.generateAllEndpointReports) {
  log.info('Generating endpoint reports for all domains...');
  try {
    // Find all domains with data
    const dataDir = 'data';
    if (!fs.existsSync(dataDir)) {
      log.warning('No data directory found. Run a scan first.');
      process.exit(1);
    }
    
    const domains = fs.readdirSync(dataDir).filter(item => 
      fs.statSync(`${dataDir}/${item}`).isDirectory()
    );
    
    if (domains.length === 0) {
      log.warning('No domains found in data directory.');
      process.exit(1);
    }
    
    log.info(`Found ${domains.length} domains to analyze`);
    log.separator();
    
    let totalEndpoints = 0;
    let processedDomains = 0;
    
    for (const domain of domains) {
      try {
        log.info(`Generating endpoint report for ${domain}...`);
        const report = generateEndpointReport(domain);
        if (report) {
          log.success(`Report: ${report.reportPath}`);
          log.muted(`  Endpoints: ${report.totalEndpoints} (H:${report.byConfidence.HIGH?.length || 0}, M:${report.byConfidence.MEDIUM?.length || 0}, L:${report.byConfidence.LOW?.length || 0})`);
          
          totalEndpoints += report.totalEndpoints;
          processedDomains++;
        } else {
          log.muted(`  No endpoint data found for ${domain}`);
        }
      } catch (error) {
        log.warning(`  Failed to generate report for ${domain}: ${error.message}`);
      }
    }
    
    log.separator();
    log.success(`Report generation complete: ${processedDomains} domains processed`);
    if (totalEndpoints > 0) {
      log.info(`Total endpoints discovered: ${totalEndpoints}`);
      log.info(`Review individual report files for detailed analysis`);
    }
  } catch (error) {
    log.error(`Endpoint report generation failed: ${error.message}`);
  }
  process.exit(0);
}

// Handle endpoint cleanup
if (opts.cleanupEndpoints) {
  log.info('Cleaning up excessive endpoint data...');
  try {
    const result = cleanupAllEndpointData({
      maxEndpointsPerDomain: parseInt(opts.maxEndpoints) || 1000,
      maxFilesPerDomain: parseInt(opts.maxEndpointFiles) || 100,
      quiet: opts.quiet,
      debug: opts.debug
    });
    
    if (result) {
      log.success(`Cleanup complete - Processed ${result.domainsProcessed} domains`);
      if (result.spaceSaved > 0) {
        log.info(`Storage freed: ${formatFileSize(result.spaceSaved)}`);
      }
      
      // Show stats for each domain
      if (result.domains.length > 0 && !opts.quiet) {
        log.separator();
        log.header('Post-Cleanup Storage Statistics');
        result.domains.forEach(stats => {
          log.info(`Domain: ${stats.domain}`);
          log.muted(`  Endpoints: ${stats.endpointCount}`);
          log.muted(`  Files: ${stats.fileCount}`);
          log.muted(`  Storage: ${formatFileSize(stats.totalSize)}`);
          log.separator();
        });
      }
    } else {
      log.info('No endpoint data found or cleanup not required');
    }
  } catch (error) {
    log.error(`Endpoint cleanup failed: ${error.message}`);
  }
  process.exit(0);
}

// Handle endpoint storage statistics
if (opts.endpointStorageStats) {
  log.info('Gathering endpoint storage statistics...');
  try {
    const dataDir = 'data';
    if (!fs.existsSync(dataDir)) {
      log.warning('No data directory found. Run a scan first.');
      process.exit(1);
    }
    
    const domains = fs.readdirSync(dataDir).filter(item => 
      fs.statSync(`${dataDir}/${item}`).isDirectory() && 
      fs.existsSync(`${dataDir}/${item}/endpoints`)
    );
    
    if (domains.length === 0) {
      log.warning('No domains with endpoint data found.');
      process.exit(1);
    }
    
    log.separator();
    log.header('Endpoint Storage Statistics');
    
    let totalSize = 0;
    let totalEndpoints = 0;
    let totalFiles = 0;
    
    domains.forEach(domain => {
      const stats = getEndpointStorageStats(domain);
      if (stats) {
        totalSize += stats.totalSize;
        totalEndpoints += stats.endpointCount;
        totalFiles += stats.fileCount;
        
        log.info(`Domain: ${domain}`);
        log.muted(`  Endpoints: ${stats.endpointCount}`);
        log.muted(`  Files: ${stats.fileCount}`);
        log.muted(`  Storage: ${formatFileSize(stats.totalSize)}`);
        log.muted(`  Average per endpoint: ${formatFileSize(stats.averageEndpointSize)}`);
        log.separator();
      }
    });
    
    log.header('Overall Statistics');
    log.info(`Domains: ${domains.length}`);
    log.info(`Total Endpoints: ${totalEndpoints}`);
    log.info(`Total Files: ${totalFiles}`);
    log.info(`Total Storage: ${formatFileSize(totalSize)}`);
    log.info(`Average per domain: ${formatFileSize(Math.round(totalSize / domains.length))}`);
    
    // Show warnings for large storage
    if (totalSize > 100 * 1024 * 1024) { // 100MB
      log.separator();
      log.warning(`Large storage usage detected (${formatFileSize(totalSize)})`);
      log.warning(`Consider running: node cli.js --cleanup-endpoints`);
    }
    
    if (totalEndpoints > 10000) {
      log.separator();
      log.warning(`Large number of endpoints stored (${totalEndpoints})`);
      log.warning(`Consider using --max-endpoints to limit storage`);
    }
    
  } catch (error) {
    log.error(`Failed to gather storage stats: ${error.message}`);
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

// Helper function to parse comma-separated and multiple flag patterns
function parseFilterPatterns(input) {
  if (!input) return null;
  
  // Handle both array (multiple flags) and string (single flag) inputs
  const patterns = Array.isArray(input) ? input : [input];
  
  // Split comma-separated values and flatten
  const flattened = patterns.flatMap(pattern => 
    pattern.split(',').map(p => p.trim()).filter(p => p.length > 0)
  );
  
  return flattened.length > 0 ? flattened : null;
}

// Create filters (support both multiple flags and comma-separated patterns)
const filters = {
  includeDomain: parseFilterPatterns(opts.includeDomain),
  excludeDomain: parseFilterPatterns(opts.excludeDomain),
  includeUrl: parseFilterPatterns(opts.includeUrl),
  excludeUrl: parseFilterPatterns(opts.excludeUrl)
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
  debug: opts.debug || false,
  showCodePreview: opts.codePreview !== false,
  maxLines: parseInt(opts.maxLines) || 10,
  discordNotifier: discordNotifier,
  saveDiff: opts.diff !== false,
  maxDiffFiles: parseInt(opts.maxDiffFiles) || 50,
  cleanupOldDiffs: opts.cleanup !== false,
  extractEndpoints: opts.extractEndpoints || false,
  showEndpoints: opts.showEndpoints || false,
  maxEndpointsPerDomain: parseInt(opts.maxEndpoints) || 1000,
  maxEndpointFilesPerDomain: parseInt(opts.maxEndpointFiles) || 100,
  customEndpointRegex: opts.endpointRegex || null
};

// Show configuration summary
const configData = {
  'Target URLs': targetUrls.length,
  'Authentication': config.authEnabled ? 'Enabled' : 'Disabled',
  'Live Mode': config.liveMode ? `Every ${opts.interval}s` : 'Single run',
  'Custom Headers': Object.keys(headers).length,
  'Domain Filter': [
    ...(filters.includeDomain ? filters.includeDomain.map(f => `+${f}`) : []),
    ...(filters.excludeDomain ? filters.excludeDomain.map(f => `-${f}`) : [])
  ].join(', ') || 'None',
  'URL Filter': [
    ...(filters.includeUrl ? filters.includeUrl.map(f => `+${f}`) : []),
    ...(filters.excludeUrl ? filters.excludeUrl.map(f => `-${f}`) : [])
  ].join(', ') || 'None',
  'Endpoint Extraction': config.extractEndpoints ? 'Enabled' : 'Disabled',
  'Custom Endpoint Regex': config.customEndpointRegex ? `${config.customEndpointRegex.length} patterns` : 'None'
};

// Show debug information if requested
if (config.debug) {
  summary.create('Configuration', configData);
  
  // Show custom endpoint regex patterns
  if (config.customEndpointRegex && config.customEndpointRegex.length > 0) {
    log.separator();
    log.header('Custom Endpoint Regex Patterns');
    config.customEndpointRegex.forEach((pattern, index) => {
      log.info(`${index + 1}. ${pattern}`);
    });
  }
} else {
  summary.create('Configuration', configData);
}

// Send Discord notification for live monitoring start
if (config.liveMode && discordNotifier.enabled) {
  await discordNotifier.sendNotification('live_monitoring_start', {
    urlCount: targetUrls.length,
    interval: `${opts.interval}s`,
    domainFilter: [
      ...(filters.includeDomain ? filters.includeDomain.map(f => `+${f}`) : []),
      ...(filters.excludeDomain ? filters.excludeDomain.map(f => `-${f}`) : [])
    ].join(', ') || 'None',
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