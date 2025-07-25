import puppeteer from 'puppeteer';
import fs from 'fs';
import { loginAndGetToken } from './auth.js';
import { saveJSFile, generateChangeReport, generateNewCodeSummary } from './fileManager.js';
import { codeAnalyzer } from './similarityAnalyzer.js';
import { endpointExtractor, saveEndpoints, generateEndpointReport } from './endpointExtractor.js';
import { log, summary, formatUrl, formatFileSize, formatTime, formatDuration, showErrors } from './utils.js';
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
    
    // Check include domain filter - must match at least one pattern if specified
    if (filters.includeDomain && filters.includeDomain.length > 0) {
      if (!filters.includeDomain.some(pattern => matchesPattern(domain, pattern))) {
        return false;
      }
    }
    
    // Check exclude domain filter - must not match any pattern if specified
    if (filters.excludeDomain && filters.excludeDomain.length > 0) {
      if (filters.excludeDomain.some(pattern => matchesPattern(domain, pattern))) {
        return false;
      }
    }
    
    // Check include URL filter - must match at least one pattern if specified
    if (filters.includeUrl && filters.includeUrl.length > 0) {
      if (!filters.includeUrl.some(pattern => matchesPattern(url, pattern))) {
        return false;
      }
    }
    
    // Check exclude URL filter - must not match any pattern if specified
    if (filters.excludeUrl && filters.excludeUrl.length > 0) {
      if (filters.excludeUrl.some(pattern => matchesPattern(url, pattern))) {
        return false;
      }
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
  const { urls, authEnabled, customHeaders, liveMode, filters, quiet, verbose, debug, showCodePreview, maxLines, discordNotifier, extractEndpoints, showEndpoints, maxEndpointsPerDomain, maxEndpointFilesPerDomain, customEndpointRegex } = options;
  
  let browser;
  const scanStartTime = Date.now();
  
  try {
    const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
    
    log.header('JavaScript Security Scan');
    log.info(`Processing ${urls.length} URL(s) at ${formatTime()}`);
    log.separator();
    
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
      errorDetails: [],
      totalEndpoints: 0,
      newEndpoints: 0,
      endpointFiles: 0
    };
    
    // Process each URL
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      
      // Clean scan start indicator
      log.header(`Scanning URL ${i + 1}/${urls.length}`);
      log.info(`Target: ${formatUrl(url)}`);
      
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

        // Collect status messages to display cleanly later
        const statusMessages = {
          new: [],
          changed: [],
          unchanged: [],
          filtered: [],
          errors: [],
          changeSummaries: [],
          endpoints: []
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
              
              if (debug) {
                const headers = response.headers();
                log.debug(`Detected JS: ${respUrl}`);
                log.debug(`  Content-Type: ${contentType}`);
                log.debug(`  Content-Length: ${headers['content-length'] || 'unknown'}`);
                log.debug(`  Content-Encoding: ${headers['content-encoding'] || 'none'}`);
                log.debug(`  Cache-Control: ${headers['cache-control'] || 'none'}`);
                log.debug(`  ETag: ${headers['etag'] || 'none'}`);
              }
              
              // Apply filters
              if (!shouldProcessJSFile(respUrl, filters)) {
                filteredFiles.add(respUrl);
                urlResults.filtered++;
                results.filteredFiles++;
                statusMessages.filtered.push(respUrl);
                if (debug) {
                  log.debug(`  FILTERED OUT by domain/URL patterns`);
                }
                return;
              }
              
              if (debug) {
                log.debug(`  ACCEPTED for processing`);
              }
              
              urlResults.processed++;
              results.totalFiles++;
              
                            // USE DIRECT FETCH AS PRIMARY METHOD (more reliable than Puppeteer buffer)
              let buffer;
              try {
                // Check response status first
                const status = response.status();
                const statusText = response.statusText();
                
                if (status !== 200 && status !== 206 && status !== 304) {
                  // Skip files with error status codes
                  if (!quiet) {
                    log.warning(`${respUrl} returned ${status} ${statusText}, skipping file`);
                  }
                  return;
                }
                
                if (debug) {
                  log.debug(`${respUrl} → HTTP ${status}, using direct fetch (more reliable)`);
                }
                
                // Use direct fetch as primary method - works for 200, 304, and 206
                const directResponse = await page.evaluate(async (url) => {
                  const response = await fetch(url);
                  if (response.ok) {
                    return await response.text();
                  }
                  throw new Error(`Direct fetch failed: ${response.status} ${response.statusText}`);
                }, respUrl);
                
                buffer = Buffer.from(directResponse, 'utf8');
                
                if (debug) {
                  log.debug(`${respUrl} → Direct fetch successful: ${buffer.length} bytes`);
                }
                
              } catch (fetchError) {
                if (!quiet) {
                  log.warning(`Failed to fetch ${respUrl}: ${fetchError.message}, skipping file`);
                }
                return; // Skip this file
              }
              
              // Now process the captured buffer
              try {
                
                const hash = crypto.createHash('sha256').update(buffer).digest('hex');

                if (debug) {
                  log.debug(`${respUrl} → Processing file content`);
                  log.debug(`  File size: ${buffer.length} bytes`);
                  log.debug(`  SHA256: ${hash.substring(0, 16)}...`);
                }

                const hashPath = `data/${domain}/hashes.json`;
                let hashes = {};
                
                // Load existing hashes
                if (fs.existsSync(hashPath)) {
                  try {
                    hashes = JSON.parse(fs.readFileSync(hashPath, 'utf-8'));
                    if (debug) {
                      log.debug(`  Loaded ${Object.keys(hashes).length} existing hashes for ${domain}`);
                    }
                  } catch (parseError) {
                    hashes = {};
                    if (debug) {
                      log.debug(`  Hash file corrupted, starting fresh: ${parseError.message}`);
                    }
                  }
                } else {
                  if (debug) {
                    log.debug(`  No existing hash file for ${domain}, first scan`);
                  }
                }

                const prevHash = hashes[respUrl];
                const isNewFile = !prevHash;
                const hasChanged = !prevHash || prevHash !== hash;

                if (debug) {
                  if (isNewFile) {
                    log.debug(`  STATUS: NEW FILE (no previous hash)`);
                  } else if (hasChanged) {
                    log.debug(`  STATUS: CHANGED (${prevHash.substring(0, 16)}... → ${hash.substring(0, 16)}...)`);
                  } else {
                    log.debug(`  STATUS: UNCHANGED (${hash.substring(0, 16)}...)`);
                  }
                }

                if (hasChanged) {
                  // Save file with diff analysis and new code preview FIRST
                  const saveOptions = {
                    quiet: quiet,
                    showCodePreview: showCodePreview,
                    maxLines: maxLines
                  };
                  
                  const result = saveJSFile(domain, respUrl, buffer, isNewFile, saveOptions);
                  hashes[respUrl] = result.hash;
                  
                  if (isNewFile) {
                    urlResults.new++;
                    results.newFiles++;
                    statusMessages.new.push(respUrl);
                    
                    // No need to store summaries for new files - they clutter output
                    
                    // Add to batch for Discord notification
                    if (discordNotifier && discordNotifier.enabled) {
                      discordNotifier.addToBatch('new_file', {
                        url: respUrl,
                        domain: domain,
                        fileSize: formatFileSize(buffer.length),
                        lines: buffer.toString().split('\n').length
                      });
                    }
                  } else {
                    urlResults.changed++;
                    results.changedFiles++;
                    statusMessages.changed.push(respUrl);
                  }
                  
                  // Count new code sections and send Discord notification for changes
                  if (result.diffInfo && result.diffInfo.newCodeSections) {
                    const sections = result.diffInfo.newCodeSections.raw + result.diffInfo.newCodeSections.beautified;
                    urlResults.newCodeSections += sections;
                    results.newCodeSections += sections;
                    
                    // Store change summary for organized display
                    statusMessages.changeSummaries.push({
                      url: respUrl,
                      diffInfo: result.diffInfo
                    });
                    
                    // Add to batch for Discord notification
                    if (!isNewFile && discordNotifier && discordNotifier.enabled) {
                      discordNotifier.addToBatch('file_changed', {
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
                  statusMessages.unchanged.push(respUrl);
                }
                
                // Extract endpoints if enabled
                if (extractEndpoints) {
                  try {
                    const content = buffer.toString();
                    const extractedEndpoints = endpointExtractor.extractEndpoints(content, respUrl, customEndpointRegex);
                    
                    if (extractedEndpoints.length > 0) {
                      const endpointResult = saveEndpoints(domain, respUrl, extractedEndpoints, { 
                        quiet,
                        debug,
                        filters,
                        maxEndpointsPerDomain: maxEndpointsPerDomain || 1000,
                        maxFilesPerDomain: maxEndpointFilesPerDomain || 100,
                        customRegex: customEndpointRegex
                      });
                      
                      if (endpointResult.saved) {
                        // Add endpoint info to status messages
                        statusMessages.endpoints.push({
                          url: respUrl,
                          count: endpointResult.count,
                          newCount: endpointResult.newCount,
                          summary: endpointResult.summary
                        });
                        
                        // Update global results counters
                        results.totalEndpoints += endpointResult.count;
                        results.newEndpoints += endpointResult.newCount;
                        results.endpointFiles++;
                        
                        // Add to batch for Discord notification (only summary at end)
                        if (discordNotifier && discordNotifier.enabled && endpointResult.newCount > 0) {
                          discordNotifier.addToBatch('endpoints_found', {
                            url: respUrl,
                            domain: domain,
                            totalEndpoints: endpointResult.count,
                            newEndpoints: endpointResult.newCount,
                            highConfidence: endpointResult.summary.high_confidence,
                            mediumConfidence: endpointResult.summary.medium_confidence,
                            lowConfidence: endpointResult.summary.low_confidence
                          });
                        }
                        
                        if (debug) {
                          log.debug(`${respUrl} → Extracted ${endpointResult.count} endpoints (${endpointResult.newCount} new)`);
                        }
                      }
                    }
                  } catch (endpointError) {
                    if (!quiet) {
                      log.warning(`Endpoint extraction failed for ${respUrl}: ${endpointError.message}`);
                    }
                  }
                }
              } catch (fileError) {
                const errorMsg = `File processing error: ${fileError.message}`;
                statusMessages.errors.push({ url: respUrl, message: errorMsg });
                results.errors++;
                results.errorDetails.push({ url: respUrl, type: 'FILE_ERROR', message: errorMsg });
                
                // Add to batch for Discord notification
                if (discordNotifier && discordNotifier.enabled) {
                  discordNotifier.addToBatch('error', {
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
          statusMessages.errors.push({ url: url, message: errorInfo.message });
          results.errorDetails.push({ url, type: errorInfo.type, message: errorInfo.message });
          
          if (!errorInfo.recoverable) {
            throw gotoError;
          }
        }

        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

        // Only continue if navigation was successful
        if (urlSuccess) {
          // Wait for dynamic content
          try {
            await sleep(3000);

            // Scroll to trigger lazy loading
            await page.evaluate(() => {
              window.scrollTo(0, document.body.scrollHeight);
            });
            
            await sleep(2000);
          } catch (dynamicError) {
            // Continue even if dynamic content loading fails
            if (!quiet) {
              log.warning(`Dynamic content loading failed: ${dynamicError.message}`);
            }
          }

          results.urlsProcessed++;
          
          // Show organized URL results if not quiet
          if (!quiet && urlResults.found > 0) {
            log.separator();
            log.header('Analysis Results');
            log.info(`Target: ${formatUrl(url)}`);
            log.muted(`${urlResults.found} files found, ${urlResults.processed} analyzed, ${urlResults.filtered} filtered`);
            log.muted(`${urlResults.new} new, ${urlResults.changed} modified, ${urlResults.unchanged} unchanged`);
            if (urlResults.newCodeSections > 0) {
              log.muted(`${urlResults.newCodeSections} code changes detected`);
            }
            
            // Show organized status messages
            if (statusMessages.new.length > 0) {
              log.separator();
              log.muted('New Files:');
              statusMessages.new.forEach(url => log.status('NEW', formatUrl(url)));
            }
            
            if (statusMessages.changed.length > 0) {
              log.separator();
              log.muted('Modified Files:');
              statusMessages.changed.forEach(url => log.status('CHANGED', formatUrl(url)));
            }
            
            if (statusMessages.unchanged.length > 0) {
              if (verbose || statusMessages.unchanged.length <= 5) {
                log.separator();
                log.muted('Unchanged Files:');
                statusMessages.unchanged.forEach(url => log.status('UNCHANGED', formatUrl(url)));
              } else {
                log.separator();
                log.muted(`${statusMessages.unchanged.length} files unchanged (use --verbose to see all)`);
              }
            }
            
            if (statusMessages.filtered.length > 0) {
              log.separator();
              log.muted(`${statusMessages.filtered.length} files filtered`);
            }
            
            // Show endpoint extraction results if enabled
            if (extractEndpoints && statusMessages.endpoints && statusMessages.endpoints.length > 0) {
              log.separator();
              log.header('Endpoint Extraction Summary');
              
              let totalEndpoints = 0;
              let totalNewEndpoints = 0;
              let totalHighConfidence = 0;
              let totalMediumConfidence = 0;
              let totalLowConfidence = 0;
              
              statusMessages.endpoints.forEach(endpointInfo => {
                totalEndpoints += endpointInfo.count;
                totalNewEndpoints += endpointInfo.newCount;
                totalHighConfidence += endpointInfo.summary.high_confidence;
                totalMediumConfidence += endpointInfo.summary.medium_confidence;
                totalLowConfidence += endpointInfo.summary.low_confidence;
                
                if (showEndpoints) {
                  log.info(`File: ${formatUrl(endpointInfo.url)}`);
                  log.muted(`  Total endpoints: ${endpointInfo.count}`);
                  log.muted(`  New endpoints: ${endpointInfo.newCount}`);
                  log.muted(`  High confidence: ${endpointInfo.summary.high_confidence}`);
                  log.muted(`  Medium confidence: ${endpointInfo.summary.medium_confidence}`);
                  log.muted(`  Low confidence: ${endpointInfo.summary.low_confidence}`);
                  log.separator();
                }
              });
              
              if (!showEndpoints) {
                log.info(`Total endpoints extracted: ${totalEndpoints}`);
                log.info(`New endpoints discovered: ${totalNewEndpoints}`);
                log.muted(`Confidence distribution:`);
                log.muted(`  High: ${totalHighConfidence}`);
                log.muted(`  Medium: ${totalMediumConfidence}`);
                log.muted(`  Low: ${totalLowConfidence}`);
                log.separator();
                log.muted(`Generate detailed report: node cli.js --generate-endpoint-report ${domain}`);
              }
            }
            
            // Show change summaries ONLY for modified files (not new files)
            const modifiedSummaries = statusMessages.changeSummaries.filter(summary => !summary.diffInfo.isNewFile);
            if (modifiedSummaries.length > 0) {
              modifiedSummaries.forEach(summary => {
                const diffInfo = summary.diffInfo;
                log.separator();
                log.info(`Change Summary`);
                log.muted(`File: ${formatFileSize(diffInfo.fileSize)} | Lines: ${diffInfo.totalLines}`);
                log.muted(`Added: ${diffInfo.addedLines} | Removed: ${diffInfo.removedLines}`);
                log.muted(`New sections: ${diffInfo.newCodeSections.raw} raw, ${diffInfo.newCodeSections.beautified} beautified`);
                
                if (diffInfo.savedFiles) {
                  log.muted(`Files saved:`);
                  if (diffInfo.savedFiles.diffPath) {
                    log.muted(`  • Diff: ${diffInfo.savedFiles.diffPath}`);
                  }
                  if (diffInfo.savedFiles.rawJSFile) {
                    log.muted(`  • Raw JS: ${diffInfo.savedFiles.rawJSFile}`);
                  }
                  if (diffInfo.savedFiles.beautifiedJSFile) {
                    log.muted(`  • Beautified JS: ${diffInfo.savedFiles.beautifiedJSFile}`);
                  }
                }
              });
            }
            
            if (statusMessages.errors.length > 0) {
              log.separator();
              log.muted('Processing Errors:');
              statusMessages.errors.forEach(error => {
                log.status('ERROR', `${formatUrl(error.url)} - ${error.message}`);
              });
            }
            
            // Clean section separator
            log.divider();
          }
        } else {
          results.urlsFailed++;
          
          // Show error messages for failed URLs
          if (!quiet && statusMessages.errors.length > 0) {
            log.separator();
            log.header('Processing Failed');
            log.info(`Target: ${formatUrl(url)}`);
            statusMessages.errors.forEach(error => {
              log.status('ERROR', `${formatUrl(error.url)} - ${error.message}`);
            });
            
            // Clean section separator
            log.divider();
          }
        }

      } catch (pageError) {
        const errorInfo = handleNetworkError(pageError, url);
        statusMessages.errors.push({ url: url, message: errorInfo.message });
        results.errors++;
        results.urlsFailed++;
        results.errorDetails.push({ url, type: errorInfo.type, message: errorInfo.message });
        
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

    // Calculate scan duration
    const scanDuration = Math.round((Date.now() - scanStartTime) / 1000);
    
    // Clean completion message
    log.separator();
    log.header('Scan Complete');
    log.success(`Processed ${results.urlsProcessed}/${urls.length} URLs in ${formatDuration(scanDuration)}`);

    // Generate final summary with error details
    const summaryData = {
      'URLs Processed': results.urlsProcessed,
      'URLs Failed': results.urlsFailed,
      'Total Files': results.totalFiles + results.filteredFiles,
      'Files Analyzed': results.totalFiles,
      'Files Filtered': results.filteredFiles,
      'New Files': results.newFiles,
      'Modified Files': results.changedFiles,
      'Code Changes': results.newCodeSections,
      'Errors': results.errors,
      'Duration': formatDuration(scanDuration),
      'Completed': formatTime()
    };
    
    // Add endpoint data if extraction was enabled
    if (extractEndpoints && results.totalEndpoints > 0) {
      summaryData['Files with Endpoints'] = results.endpointFiles;
      summaryData['Total Endpoints'] = results.totalEndpoints;
      summaryData['New Endpoints'] = results.newEndpoints;
    }

    summary.create('Scan Results', summaryData);

    // Send Discord batched summary for changes and errors
    if (discordNotifier && discordNotifier.enabled) {
      await discordNotifier.sendBatchedSummary();
    }

    // Show error summary if there were errors
    if (results.errorDetails.length > 0 && !quiet) {
      showErrors(results.errorDetails);
    }

    // Generate new code summary for each domain if there were changes
    if (results.newCodeSections > 0 && !quiet) {
      log.separator();
      log.info('Generating code analysis reports...');
      
      const domains = new Set();
      urls.forEach(url => domains.add(new URL(url).hostname));
      
      for (const domain of domains) {
        const summaryPath = generateNewCodeSummary(domain);
        if (summaryPath) {
          log.muted(`Report: ${summaryPath}`);
        }
      }
    }

    // Generate similarity analysis reports for all domains
    if (results.totalFiles > 0 && !quiet) {
      log.separator();
      log.info('Generating similarity analysis reports...');
      
      const domains = new Set();
      urls.forEach(url => domains.add(new URL(url).hostname));
      
      for (const domain of domains) {
        try {
          const similarityReport = codeAnalyzer.generateSimilarityReport(domain);
          if (similarityReport) {
            log.muted(`Similarity Report: ${similarityReport.reportPath}`);
            
            // Display key findings
            if (similarityReport.summary.clusters > 0) {
              log.info(`File clusters identified: ${similarityReport.summary.clusters} groups in ${domain}`);
              log.muted(`Analysis suggests these may be renamed or relocated files`);
            }
            
            // Clean up old fingerprints
            codeAnalyzer.cleanupOldFingerprints(domain);
          }
        } catch (error) {
          log.warning(`Failed to generate similarity report for ${domain}: ${error.message}`);
        }
      }
    }
    
    // Generate endpoint reports if extraction was enabled
    if (extractEndpoints && results.totalEndpoints > 0 && !quiet) {
      log.separator();
      log.info('Generating endpoint reports...');
      
      const domains = new Set();
      urls.forEach(url => domains.add(new URL(url).hostname));
      
      for (const domain of domains) {
        try {
          const endpointReport = generateEndpointReport(domain);
                  if (endpointReport) {
          log.muted(`Endpoint Report: ${endpointReport.reportPath}`);
          
          // Display key findings
          if (endpointReport.totalEndpoints > 0) {
            log.info(`Endpoints discovered: ${endpointReport.totalEndpoints} in ${domain}`);
            log.muted(`Confidence breakdown - High: ${endpointReport.byConfidence.HIGH?.length || 0}, Medium: ${endpointReport.byConfidence.MEDIUM?.length || 0}, Low: ${endpointReport.byConfidence.LOW?.length || 0}`);
          }
        }
        } catch (error) {
          log.warning(`Failed to generate endpoint report for ${domain}: ${error.message}`);
        }
      }
    }

  } catch (error) {
    const errorInfo = handleNetworkError(error, 'crawler');
    log.error(`Crawler error: ${errorInfo.message}`);
    
    // Add to batch for Discord notification
    if (discordNotifier && discordNotifier.enabled) {
      discordNotifier.addToBatch('error', {
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