import puppeteer from 'puppeteer';
import fs from 'fs';
import { loginAndGetToken } from './auth.js';
import { saveJSFile, generateChangeReport, generateNewCodeSummary } from './fileManager.js';
import { log, summary, ProgressBar, formatUrl, formatFileSize, formatTime, formatDuration } from './utils.js';
import crypto from 'crypto';

// Pattern matching function for domain/URL filters
function matchesPattern(text, pattern) {
  if (!pattern) return true;
  
  // Convert wildcard pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')  // Escape dots
    .replace(/\*/g, '.*')   // Convert * to .*
    .replace(/\?/g, '.');   // Convert ? to .
  
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(text);
}

// Filter function for JS files
function shouldProcessJSFile(url, filters) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    // Check include domain filter
    if (filters.includeDomain && !matchesPattern(domain, filters.includeDomain)) {
      return false;
    }
    
    // Check exclude domain filter
    if (filters.excludeDomain && matchesPattern(domain, filters.excludeDomain)) {
      return false;
    }
    
    // Check include URL filter
    if (filters.includeUrl && !matchesPattern(url, filters.includeUrl)) {
      return false;
    }
    
    // Check exclude URL filter
    if (filters.excludeUrl && matchesPattern(url, filters.excludeUrl)) {
      return false;
    }
    
    return true;
  } catch (error) {
    if (!quiet) log.warning(`Error parsing URL for filtering: ${url}`);
    return false;
  }
}

// Enhanced error handler for network issues
function handleNetworkError(error, url) {
  const errorMessage = error.message || error.toString();
  
  if (errorMessage.includes('net::ERR_NAME_NOT_RESOLVED')) {
    return {
      type: 'DNS_ERROR',
      message: `Domain not found: ${new URL(url).hostname}`,
      recoverable: true
    };
  } else if (errorMessage.includes('net::ERR_CONNECTION_REFUSED')) {
    return {
      type: 'CONNECTION_REFUSED',
      message: `Connection refused: ${new URL(url).hostname}`,
      recoverable: true
    };
  } else if (errorMessage.includes('net::ERR_CONNECTION_TIMED_OUT') || errorMessage.includes('TimeoutError')) {
    return {
      type: 'TIMEOUT',
      message: `Connection timeout: ${new URL(url).hostname}`,
      recoverable: true
    };
  } else if (errorMessage.includes('net::ERR_CERT_')) {
    return {
      type: 'SSL_ERROR',
      message: `SSL certificate error: ${new URL(url).hostname}`,
      recoverable: true
    };
  } else if (errorMessage.includes('net::ERR_TOO_MANY_REDIRECTS')) {
    return {
      type: 'REDIRECT_ERROR',
      message: `Too many redirects: ${new URL(url).hostname}`,
      recoverable: true
    };
  } else if (errorMessage.includes('net::ERR_BLOCKED_BY_')) {
    return {
      type: 'BLOCKED',
      message: `Access blocked: ${new URL(url).hostname}`,
      recoverable: true
    };
  } else {
    return {
      type: 'UNKNOWN_ERROR',
      message: `Network error: ${errorMessage.substring(0, 100)}`,
      recoverable: false
    };
  }
}

export default async function runCrawler(options) {
  const { urls, authEnabled, customHeaders, liveMode, filters, quiet, showCodePreview, maxLines, discordNotifier } = options;
  
  let browser;
  let progressBar;
  const scanStartTime = Date.now();
  
  try {
    const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
    
    log.header('Starting Web Crawler');
    log.info(`Processing ${urls.length} URL(s)`);
    log.separator();
    
    // Initialize progress bar
    progressBar = new ProgressBar(urls.length, 'Crawling URLs');
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--ignore-certificate-errors',
        '--ignore-ssl-errors',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    const results = {
      totalFiles: 0,
      newFiles: 0,
      changedFiles: 0,
      filteredFiles: 0,
      errors: 0,
      newCodeSections: 0,
      urlsProcessed: 0,
      urlsFailed: 0,
      errorDetails: []
    };
    
    // Process each URL
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      
      // Update progress at start of URL processing
      progressBar.update(i, `Processing ${formatUrl(url)}`);
      
      let page;
      let urlSuccess = false;
      
      try {
        // Validate URL format first
        try {
          new URL(url);
        } catch (urlError) {
          throw new Error(`Invalid URL format: ${url}`);
        }
        
        page = await browser.newPage();
        
        // Enhanced user agent and headers
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Set default page settings
        await page.setDefaultNavigationTimeout(60000);
        await page.setDefaultTimeout(30000);

        let finalHeaders = { ...customHeaders };

        // Handle authentication with error recovery
        if (authEnabled) {
          if (!quiet) log.info('Authenticating...');
          try {
            const token = await loginAndGetToken(page, config);
            finalHeaders['Authorization'] = `Bearer ${token}`;
            if (!quiet) log.success('Authentication successful');
          } catch (authError) {
            const errorMsg = `Authentication failed: ${authError.message}`;
            log.warning(errorMsg);
            results.errorDetails.push({ url, type: 'AUTH_ERROR', message: errorMsg });
            // Continue without auth
          }
        }

        await page.setExtraHTTPHeaders(finalHeaders);
        await page.setRequestInterception(true);

        const domain = new URL(url).hostname;
        const jsFiles = new Set();
        const processedUrls = new Set();
        const filteredFiles = new Set();
        const urlResults = {
          found: 0,
          processed: 0,
          filtered: 0,
          new: 0,
          changed: 0,
          unchanged: 0,
          newCodeSections: 0
        };

        // Enhanced JavaScript detection patterns
        const jsPatterns = [
          /\.js$/i,
          /\.js\?/i,
          /\.mjs$/i,
          /\.jsx$/i,
          /\.ts$/i,
          /\.tsx$/i,
          /application\/javascript/i,
          /application\/x-javascript/i,
          /text\/javascript/i
        ];

        const isJavaScriptFile = (url, contentType) => {
          return jsPatterns.some(pattern => 
            pattern.test(url) || (contentType && pattern.test(contentType))
          );
        };

        page.on('request', request => {
          try {
            request.continue();
          } catch (reqError) {
            // Ignore request interception errors
          }
        });

        page.on('response', async response => {
          try {
            const respUrl = response.url();
            const contentType = response.headers()['content-type'] || '';
            
            // Skip if already processed
            if (processedUrls.has(respUrl)) {
              return;
            }

            if (isJavaScriptFile(respUrl, contentType)) {
              processedUrls.add(respUrl);
              jsFiles.add(respUrl);
              urlResults.found++;
              
              // Apply filters
              if (!shouldProcessJSFile(respUrl, filters)) {
                filteredFiles.add(respUrl);
                urlResults.filtered++;
                results.filteredFiles++;
                return;
              }
              
              urlResults.processed++;
              results.totalFiles++;
              
              try {
                const buffer = await response.buffer();
                const hash = crypto.createHash('sha256').update(buffer).digest('hex');

                const hashPath = `data/${domain}/hashes.json`;
                let hashes = {};
                
                // Load existing hashes
                if (fs.existsSync(hashPath)) {
                  try {
                    hashes = JSON.parse(fs.readFileSync(hashPath, 'utf-8'));
                  } catch (parseError) {
                    hashes = {};
                  }
                }

                const prevHash = hashes[respUrl];
                const isNewFile = !prevHash;
                const hasChanged = !prevHash || prevHash !== hash;

                if (hasChanged) {
                  if (isNewFile) {
                    urlResults.new++;
                    results.newFiles++;
                    log.status('NEW', formatUrl(respUrl));
                    
                    // Send Discord notification for new file
                    if (discordNotifier && discordNotifier.enabled) {
                      await discordNotifier.sendNotification('new_file', {
                        url: respUrl,
                        domain: domain,
                        fileSize: formatFileSize(buffer.length),
                        lines: buffer.toString().split('\n').length
                      });
                    }
                  } else {
                    urlResults.changed++;
                    results.changedFiles++;
                    log.status('CHANGED', formatUrl(respUrl));
                  }
                  
                  // Save file with diff analysis and new code preview
                  const saveOptions = {
                    quiet: quiet,
                    showCodePreview: showCodePreview,
                    maxLines: maxLines
                  };
                  
                  const result = saveJSFile(domain, respUrl, buffer, isNewFile, saveOptions);
                  hashes[respUrl] = result.hash;
                  
                  // Count new code sections and send Discord notification for changes
                  if (result.diffInfo && result.diffInfo.newCodeSections) {
                    const sections = result.diffInfo.newCodeSections.raw + result.diffInfo.newCodeSections.beautified;
                    urlResults.newCodeSections += sections;
                    results.newCodeSections += sections;
                    
                    // Send Discord notification for file changes
                    if (!isNewFile && discordNotifier && discordNotifier.enabled) {
                      await discordNotifier.sendNotification('file_changed', {
                        url: respUrl,
                        domain: domain,
                        addedLines: result.diffInfo.addedLines,
                        removedLines: result.diffInfo.removedLines,
                        fileSize: formatFileSize(result.diffInfo.fileSize),
                        totalLines: result.diffInfo.totalLines,
                        newCodeSections: sections
                      });
                    }
                  }
                  
                  // Update hash file
                  fs.mkdirSync(`data/${domain}`, { recursive: true });
                  fs.writeFileSync(hashPath, JSON.stringify(hashes, null, 2));
                } else {
                  urlResults.unchanged++;
                  if (!quiet) log.status('UNCHANGED', formatUrl(respUrl));
                }
              } catch (fileError) {
                const errorMsg = `File processing error: ${fileError.message}`;
                log.status('ERROR', `${formatUrl(respUrl)} - ${errorMsg}`);
                results.errors++;
                results.errorDetails.push({ url: respUrl, type: 'FILE_ERROR', message: errorMsg });
                
                // Send Discord notification for error
                if (discordNotifier && discordNotifier.enabled) {
                  await discordNotifier.sendNotification('error', {
                    type: 'FILE_PROCESSING_ERROR',
                    url: respUrl,
                    message: errorMsg
                  });
                }
              }
            }
          } catch (responseError) {
            // Ignore response handling errors to not break the entire scan
            if (!quiet) {
              log.warning(`Response handling error: ${responseError.message}`);
            }
          }
        });

        // Navigate with enhanced error handling
        try {
          await page.goto(url, { 
            waitUntil: ['load', 'domcontentloaded', 'networkidle2'],
            timeout: 60000 
          });
          
          urlSuccess = true;
        } catch (gotoError) {
          const errorInfo = handleNetworkError(gotoError, url);
          log.status('ERROR', `${formatUrl(url)} - ${errorInfo.message}`);
          results.errorDetails.push({ url, type: errorInfo.type, message: errorInfo.message });
          
          if (!errorInfo.recoverable) {
            throw gotoError;
          }
        }

        // Only continue if navigation was successful
        if (urlSuccess) {
          // Wait for dynamic content
          try {
            await page.waitForTimeout(3000);

            // Scroll to trigger lazy loading
            await page.evaluate(() => {
              window.scrollTo(0, document.body.scrollHeight);
            });
            
            await page.waitForTimeout(2000);
          } catch (dynamicError) {
            // Continue even if dynamic content loading fails
            if (!quiet) {
              log.warning(`Dynamic content loading failed: ${dynamicError.message}`);
            }
          }

          results.urlsProcessed++;
          
          // Final progress update for this URL
          progressBar.update(i + 1, `Completed ${formatUrl(url)} (${urlResults.processed} files)`);
          
          // Show URL results if not quiet
          if (!quiet && urlResults.found > 0) {
            log.separator();
            log.info(`Results for ${formatUrl(url)}`);
            log.muted(`Found: ${urlResults.found} | Processed: ${urlResults.processed} | Filtered: ${urlResults.filtered}`);
            log.muted(`New: ${urlResults.new} | Changed: ${urlResults.changed} | Unchanged: ${urlResults.unchanged}`);
            if (urlResults.newCodeSections > 0) {
              log.muted(`New code sections: ${urlResults.newCodeSections}`);
            }
          }
        } else {
          results.urlsFailed++;
          progressBar.update(i + 1, `Failed ${formatUrl(url)}`);
        }

      } catch (pageError) {
        const errorInfo = handleNetworkError(pageError, url);
        log.error(`Error processing ${formatUrl(url)}: ${errorInfo.message}`);
        results.errors++;
        results.urlsFailed++;
        results.errorDetails.push({ url, type: errorInfo.type, message: errorInfo.message });
        
        // Update progress even on error
        progressBar.update(i + 1, `Error: ${formatUrl(url)}`);
        
        // Don't throw in live mode
        if (!liveMode && !errorInfo.recoverable) {
          throw pageError;
        }
      } finally {
        if (page) {
          try {
            await page.close();
          } catch (closeError) {
            // Ignore page close errors
          }
        }
      }
    }

    // Final progress update
    progressBar.update(urls.length, `All URLs processed`);
    
    // Small delay to show completed progress
    await new Promise(resolve => setTimeout(resolve, 500));
    
    progressBar.finish();

    // Calculate scan duration
    const scanDuration = Math.round((Date.now() - scanStartTime) / 1000);

    // Generate final summary with error details
    const summaryData = {
      'URLs Processed': results.urlsProcessed,
      'URLs Failed': results.urlsFailed,
      'JS Files Found': results.totalFiles + results.filteredFiles,
      'Files Processed': results.totalFiles,
      'Files Filtered': results.filteredFiles,
      'New Files': results.newFiles,
      'Changed Files': results.changedFiles,
      'New Code Sections': results.newCodeSections,
      'Errors': results.errors,
      'Scan Time': formatTime()
    };

    summary.create('Scan Complete', summaryData);

    // Send Discord notification for scan completion
    if (discordNotifier && discordNotifier.enabled) {
      const nextScan = liveMode ? `in ${Math.round(options.interval / 1000)}s` : null;
      await discordNotifier.sendNotification('scan_complete', {
        urlsProcessed: results.urlsProcessed,
        totalFiles: results.totalFiles + results.filteredFiles,
        newFiles: results.newFiles,
        changedFiles: results.changedFiles,
        filteredFiles: results.filteredFiles,
        errors: results.errors,
        duration: formatDuration(scanDuration),
        nextScan: nextScan
      });
    }

    // Show error summary if there were errors
    if (results.errorDetails.length > 0 && !quiet) {
      log.separator();
      log.header('Error Summary');
      const errorTypes = {};
      results.errorDetails.forEach(error => {
        errorTypes[error.type] = (errorTypes[error.type] || 0) + 1;
      });
      
      Object.entries(errorTypes).forEach(([type, count]) => {
        log.muted(`${type}: ${count} occurrences`);
      });
      
      if (results.errorDetails.length <= 5) {
        log.separator();
        results.errorDetails.forEach(error => {
          log.muted(`${formatUrl(error.url)}: ${error.message}`);
        });
      }
      log.footer();
    }

    // Generate new code summary for each domain if there were changes
    if (results.newCodeSections > 0 && !quiet) {
      log.separator();
      log.info('Generating new code summaries...');
      
      const domains = new Set();
      urls.forEach(url => domains.add(new URL(url).hostname));
      
      for (const domain of domains) {
        const summaryPath = generateNewCodeSummary(domain);
        if (summaryPath) {
          log.muted(`Summary generated: ${summaryPath}`);
        }
      }
    }

  } catch (error) {
    const errorInfo = handleNetworkError(error, 'crawler');
    log.error(`Crawler error: ${errorInfo.message}`);
    
    // Send Discord notification for critical error
    if (discordNotifier && discordNotifier.enabled) {
      await discordNotifier.sendNotification('error', {
        type: 'CRAWLER_ERROR',
        message: errorInfo.message,
        url: 'System'
      });
    }
    
    if (!liveMode) throw error;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (browserError) {
        // Ignore browser close errors
      }
    }
  }
} 