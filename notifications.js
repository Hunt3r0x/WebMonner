import fs from 'fs';

// Discord notification handler
export class DiscordNotifier {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
    this.enabled = !!webhookUrl;
    this.sentNotifications = new Map(); // Track sent notifications to prevent duplicates
    this.rateLimitReset = 0; // Track rate limit reset time
    this.pendingNotifications = []; // Queue for pending notifications
    // New: Batch changes for summary notifications
    this.batchedChanges = {
      newFiles: [],
      changedFiles: [],
      errors: [],
      endpointsFound: []
    };
    // New: Track last sent summary to prevent duplicates
    this.lastSummarySignature = null;
    this.lastSummaryTime = 0;
    this.summaryMinInterval = 300000; // 5 minutes minimum between identical summaries
  }

  // New: Add change to batch instead of sending immediately
  addToBatch(type, data) {
    if (!this.enabled) return;

    switch (type) {
      case 'new_file':
        this.batchedChanges.newFiles.push(data);
        break;
      case 'file_changed':
        this.batchedChanges.changedFiles.push(data);
        break;
      case 'error':
        this.batchedChanges.errors.push(data);
        break;
      case 'endpoints_found':
        this.batchedChanges.endpointsFound.push(data);
        break;
    }
  }

  // New: Send batched summary at end of scan
  async sendBatchedSummary() {
    if (!this.enabled) return;

    const { newFiles, changedFiles, errors, endpointsFound } = this.batchedChanges;
    const totalChanges = newFiles.length + changedFiles.length;
    const totalEndpoints = endpointsFound.reduce((sum, ep) => sum + ep.newEndpoints, 0);

    // Only send if there are changes, endpoints, or errors
    if (totalChanges === 0 && errors.length === 0 && totalEndpoints === 0) {
      this.clearBatch();
      return;
    }

    // Create a signature of the summary content to prevent duplicate notifications
    const summarySignature = this.createSummarySignature(newFiles, changedFiles, errors, endpointsFound);
    const currentTime = Date.now();
    
    // Check if this is a duplicate summary and not enough time has passed
    if (this.lastSummarySignature === summarySignature && 
        (currentTime - this.lastSummaryTime) < this.summaryMinInterval) {
      console.log('Skipping duplicate summary notification (same content within 5 minutes)');
      this.clearBatch();
      return;
    }

    try {
      const embed = this.createBatchedSummaryEmbed(newFiles, changedFiles, errors, endpointsFound);
      const payload = {
        username: 'WebMonner',
        embeds: [embed]
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        // Update last sent summary info
        this.lastSummarySignature = summarySignature;
        this.lastSummaryTime = currentTime;
        console.log(`Discord summary sent: ${totalChanges} changes, ${totalEndpoints} endpoints, ${errors.length} errors`);
      } else if (response.status === 429) {
        // Handle rate limiting
        const retryAfter = response.headers.get('Retry-After') || 60;
        this.rateLimitReset = Date.now() + (retryAfter * 1000);
        console.log(`Discord rate limited, retry after ${retryAfter} seconds`);
      } else {
        console.error(`Discord summary failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Discord summary error: ${error.message}`);
    }

    // Clear batch after sending
    this.clearBatch();
  }

  // New: Create a signature for summary content to detect duplicates
  createSummarySignature(newFiles, changedFiles, errors, endpointsFound) {
    const parts = [];
    
    // Add new files info
    parts.push(`new:${newFiles.length}`);
    newFiles.forEach(file => {
      parts.push(`nf:${file.url}:${file.lines}`);
    });
    
    // Add changed files info
    parts.push(`changed:${changedFiles.length}`);
    changedFiles.forEach(file => {
      parts.push(`cf:${file.url}:${file.addedLines}:${file.removedLines}`);
    });
    
    // Add errors info
    parts.push(`errors:${errors.length}`);
    errors.forEach(error => {
      parts.push(`err:${error.url}:${error.type}`);
    });
    
    // Add endpoints info (this is likely the main duplicate source)
    parts.push(`endpoints:${endpointsFound.length}`);
    endpointsFound.forEach(ep => {
      parts.push(`ep:${ep.url}:${ep.newEndpoints}:${ep.highConfidence}:${ep.mediumConfidence}:${ep.lowConfidence}`);
    });
    
    // Create a simple hash of the combined data
    const signature = parts.join('|');
    return this.simpleHash(signature);
  }

  // Simple hash function for creating signatures
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  // New: Create batched summary embed with domain organization
  createBatchedSummaryEmbed(newFiles, changedFiles, errors, endpointsFound = []) {
    const timestamp = new Date().toISOString();
    const totalChanges = newFiles.length + changedFiles.length;
    const totalEndpoints = endpointsFound.reduce((sum, ep) => sum + ep.newEndpoints, 0);
    
    // Group data by domain
    const domainGroups = this.groupDataByDomain(newFiles, changedFiles, errors, endpointsFound);
    const domainCount = Object.keys(domainGroups).length;
    
    let title = '';
    let color = 0x808080; // Gray default
    
    if (totalChanges > 0 || totalEndpoints > 0) {
      const parts = [];
      if (totalChanges > 0) parts.push(`${totalChanges} Change${totalChanges > 1 ? 's' : ''}`);
      if (totalEndpoints > 0) parts.push(`${totalEndpoints} Endpoint${totalEndpoints > 1 ? 's' : ''}`);
      
      title = `📊 Scan Summary - ${parts.join(', ')} on ${domainCount} Domain${domainCount > 1 ? 's' : ''}`;
      color = 0x00ff00; // Green for changes/endpoints
    } else if (errors.length > 0) {
      title = `❌ Scan Summary - ${errors.length} Error${errors.length > 1 ? 's' : ''} on ${domainCount} Domain${domainCount > 1 ? 's' : ''}`;
      color = 0xff0000; // Red for errors only
    }

    const fields = [];

    // Add domain overview section
    if (domainCount > 0) {
      const domainOverview = Object.entries(domainGroups).map(([domain, data]) => {
        const domainChanges = data.newFiles.length + data.changedFiles.length;
        const domainEndpoints = data.endpointsFound.reduce((sum, ep) => sum + ep.newEndpoints, 0);
        const domainErrors = data.errors.length;
        
        let domainSummary = `**${domain}**`;
        const summaryParts = [];
        if (domainChanges > 0) summaryParts.push(`${domainChanges} file${domainChanges > 1 ? 's' : ''}`);
        if (domainEndpoints > 0) summaryParts.push(`${domainEndpoints} endpoint${domainEndpoints > 1 ? 's' : ''}`);
        if (domainErrors > 0) summaryParts.push(`${domainErrors} error${domainErrors > 1 ? 's' : ''}`);
        
        if (summaryParts.length > 0) {
          domainSummary += ` - ${summaryParts.join(', ')}`;
        }
        
        return domainSummary;
      }).join('\n');
      
      fields.push({
        name: `🌐 Domain Overview (${domainCount} domains)`,
        value: domainOverview,
        inline: false
      });
    }

    // Add domain-specific sections
    Object.entries(domainGroups).forEach(([domain, data]) => {
      const domainChanges = data.newFiles.length + data.changedFiles.length;
      const domainEndpoints = data.endpointsFound.reduce((sum, ep) => sum + ep.newEndpoints, 0);
      const domainErrors = data.errors.length;
      
      if (domainChanges > 0 || domainEndpoints > 0 || domainErrors > 0) {
        const domainSections = [];
        
        // New files for this domain
        if (data.newFiles.length > 0) {
          const fileList = data.newFiles.slice(0, 3).map(file => {
            const fileName = file.url.split('/').pop() || 'unknown.js';
            const shortName = fileName.length > 20 ? fileName.substring(0, 17) + '...' : fileName;
            return `• **${shortName}** (${file.lines} lines)`;
          }).join('\n');
          const moreFiles = data.newFiles.length > 3 ? `\n+ ${data.newFiles.length - 3} more...` : '';
          domainSections.push(`🆕 **New Files (${data.newFiles.length}):**\n${fileList}${moreFiles}`);
        }
        
        // Changed files for this domain
        if (data.changedFiles.length > 0) {
          const fileList = data.changedFiles.slice(0, 3).map(file => {
            const fileName = file.url.split('/').pop() || 'unknown.js';
            const shortName = fileName.length > 20 ? fileName.substring(0, 17) + '...' : fileName;
            const changes = `+${file.addedLines}/-${file.removedLines}`;
            return `• **${shortName}** (${changes})`;
          }).join('\n');
          const moreFiles = data.changedFiles.length > 3 ? `\n+ ${data.changedFiles.length - 3} more...` : '';
          domainSections.push(`🔄 **Changed Files (${data.changedFiles.length}):**\n${fileList}${moreFiles}`);
        }
        
        // Endpoints for this domain
        if (data.endpointsFound.length > 0) {
          const endpointList = data.endpointsFound.slice(0, 2).map(epData => {
            const fileName = epData.url.split('/').pop() || 'unknown.js';
            const shortName = fileName.length > 20 ? fileName.substring(0, 17) + '...' : fileName;
            const confidence = `H:${epData.highConfidence} M:${epData.mediumConfidence} L:${epData.lowConfidence}`;
            return `• **${shortName}** - ${epData.newEndpoints} endpoints (${confidence})`;
          }).join('\n');
          const moreEndpoints = data.endpointsFound.length > 2 ? `\n+ ${data.endpointsFound.length - 2} more...` : '';
          domainSections.push(`🎯 **Endpoints (${domainEndpoints}):**\n${endpointList}${moreEndpoints}`);
        }
        
        // Errors for this domain
        if (data.errors.length > 0) {
          const errorList = data.errors.slice(0, 2).map(error => {
            const fileName = error.url ? error.url.split('/').pop() : 'Unknown';
            const shortName = fileName.length > 20 ? fileName.substring(0, 17) + '...' : fileName;
            const shortMessage = error.message.length > 50 ? error.message.substring(0, 47) + '...' : error.message;
            return `• **${shortName}**: ${shortMessage}`;
          }).join('\n');
          const moreErrors = data.errors.length > 2 ? `\n+ ${data.errors.length - 2} more...` : '';
          domainSections.push(`❌ **Errors (${data.errors.length}):**\n${errorList}${moreErrors}`);
        }
        
        // Add domain field
        fields.push({
          name: `📍 ${domain}`,
          value: domainSections.join('\n\n'),
          inline: false
        });
      }
    });

    // Add summary statistics
    if (totalChanges > 0 || totalEndpoints > 0) {
      const totalLines = [...newFiles, ...changedFiles].reduce((sum, file) => {
        return sum + (file.addedLines || file.lines || 0);
      }, 0);
      
      let statsValue = `**Scan Time:** ${timestamp.split('T')[1].split('.')[0]}\n**Domains Monitored:** ${domainCount}`;
      
      if (totalLines > 0) {
        statsValue += `\n**Total Lines Added:** ${totalLines}`;
      }
      
      if (totalEndpoints > 0) {
        const totalHighConfidence = endpointsFound.reduce((sum, ep) => sum + ep.highConfidence, 0);
        const totalMediumConfidence = endpointsFound.reduce((sum, ep) => sum + ep.mediumConfidence, 0);
        const totalLowConfidence = endpointsFound.reduce((sum, ep) => sum + ep.lowConfidence, 0);
        
        statsValue += `\n**High Confidence:** ${totalHighConfidence}`;
        statsValue += `\n**Medium Confidence:** ${totalMediumConfidence}`;
        statsValue += `\n**Low Confidence:** ${totalLowConfidence}`;
      }
      
      fields.push({
        name: '📈 Statistics',
        value: statsValue,
        inline: true
      });
    }

    let description = '';
    if (totalChanges > 0 || totalEndpoints > 0) {
      const domainList = Object.keys(domainGroups).slice(0, 3).join(', ');
      const moreDomains = domainCount > 3 ? ` and ${domainCount - 3} more` : '';
      description = `Activity detected on: **${domainList}${moreDomains}**`;
    } else {
      description = 'Scan completed with errors. No changes or endpoints detected.';
    }

    return {
      title,
      description,
      color,
      fields,
      footer: { text: 'WebMonner Domain Summary' },
      timestamp
    };
  }

  // Helper method to group data by domain
  groupDataByDomain(newFiles, changedFiles, errors, endpointsFound) {
    const domainGroups = {};
    
    // Group new files by domain
    newFiles.forEach(file => {
      const domain = file.domain || 'unknown';
      if (!domainGroups[domain]) {
        domainGroups[domain] = { newFiles: [], changedFiles: [], errors: [], endpointsFound: [] };
      }
      domainGroups[domain].newFiles.push(file);
    });
    
    // Group changed files by domain
    changedFiles.forEach(file => {
      const domain = file.domain || 'unknown';
      if (!domainGroups[domain]) {
        domainGroups[domain] = { newFiles: [], changedFiles: [], errors: [], endpointsFound: [] };
      }
      domainGroups[domain].changedFiles.push(file);
    });
    
    // Group errors by domain
    errors.forEach(error => {
      const domain = error.domain || (error.url ? this.getDomainFromUrl(error.url) : 'unknown');
      if (!domainGroups[domain]) {
        domainGroups[domain] = { newFiles: [], changedFiles: [], errors: [], endpointsFound: [] };
      }
      domainGroups[domain].errors.push(error);
    });
    
    // Group endpoints by domain
    endpointsFound.forEach(endpoint => {
      const domain = endpoint.domain || 'unknown';
      if (!domainGroups[domain]) {
        domainGroups[domain] = { newFiles: [], changedFiles: [], errors: [], endpointsFound: [] };
      }
      domainGroups[domain].endpointsFound.push(endpoint);
    });
    
    return domainGroups;
  }

  // Helper method to get domain from URL
  getDomainFromUrl(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  // New: Clear batched changes
  clearBatch() {
    this.batchedChanges = {
      newFiles: [],
      changedFiles: [],
      errors: [],
      endpointsFound: []
    };
  }

  // Keep existing methods for backward compatibility but modify behavior
  async sendNotification(type, data) {
    if (!this.enabled) return;

    // For file changes, errors, and endpoints, add to batch instead of sending immediately
    if (type === 'new_file' || type === 'file_changed' || type === 'error' || type === 'endpoints_found') {
      this.addToBatch(type, data);
      return;
    }

    // For other notification types, send immediately
    // Create unique key for deduplication
    const notificationKey = this.createNotificationKey(type, data);
    
    // Check if we've already sent this notification recently
    if (this.shouldSkipNotification(type, notificationKey)) {
      return;
    }

    // Check rate limiting
    if (this.isRateLimited()) {
      console.log('Discord rate limited, queuing notification...');
      this.queueNotification(type, data, notificationKey);
      return;
    }

    try {
      const embed = this.createEmbed(type, data);
      const payload = {
        username: 'WebMonner',
        embeds: [embed]
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        // Mark notification as sent
        this.markNotificationSent(type, notificationKey);
        console.log(`Discord notification sent: ${type}`);
      } else if (response.status === 429) {
        // Handle rate limiting
        const retryAfter = response.headers.get('Retry-After') || 60;
        this.rateLimitReset = Date.now() + (retryAfter * 1000);
        console.log(`Discord rate limited, retry after ${retryAfter} seconds`);
        this.queueNotification(type, data, notificationKey);
      } else {
        console.error(`Discord notification failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Discord notification error: ${error.message}`);
    }
  }

  // Create unique key for notification deduplication
  createNotificationKey(type, data) {
    if (type === 'file_changed' || type === 'new_file') {
      return `${type}:${data.url}`;
    }
    return `${type}:${Date.now()}`; // For other types, use timestamp to allow multiple
  }

  // Check if notification should be skipped (deduplication)
  shouldSkipNotification(type, key) {
    if (type === 'file_changed' || type === 'new_file') {
      const lastSent = this.sentNotifications.get(key);
      if (lastSent && (Date.now() - lastSent) < 300000) { // 5 minutes cooldown
        return true;
      }
    }
    return false;
  }

  // Mark notification as sent
  markNotificationSent(type, key) {
    if (type === 'file_changed' || type === 'new_file') {
      this.sentNotifications.set(key, Date.now());
      
      // Clean up old entries (older than 1 hour)
      const oneHourAgo = Date.now() - 3600000;
      for (const [k, timestamp] of this.sentNotifications.entries()) {
        if (timestamp < oneHourAgo) {
          this.sentNotifications.delete(k);
        }
      }
    }
  }

  // Check if currently rate limited
  isRateLimited() {
    return Date.now() < this.rateLimitReset;
  }

  // Queue notification for later sending
  queueNotification(type, data, key) {
    this.pendingNotifications.push({ type, data, key, timestamp: Date.now() });
    
    // Clean up old queued notifications (older than 1 hour)
    const oneHourAgo = Date.now() - 3600000;
    this.pendingNotifications = this.pendingNotifications.filter(
      notification => notification.timestamp > oneHourAgo
    );
  }

  // Process queued notifications (call this periodically)
  async processQueuedNotifications() {
    if (this.pendingNotifications.length === 0 || this.isRateLimited()) {
      return;
    }

    console.log(`Processing ${this.pendingNotifications.length} queued notifications...`);
    
    const notificationsToSend = [...this.pendingNotifications];
    this.pendingNotifications = [];

    for (const notification of notificationsToSend) {
      // Check if we should still send this notification
      if (!this.shouldSkipNotification(notification.type, notification.key)) {
        await this.sendNotification(notification.type, notification.data);
        
        // Add delay between notifications to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  createEmbed(type, data) {
    const timestamp = new Date().toISOString();
    const domain = data.domain || 'unknown';

    switch (type) {
      case 'new_file':
        const newFileName = data.url.split('/').pop() || 'unknown.js';
        return {
          title: `🆕 New JS File on ${domain}`,
          description: `New JavaScript file detected: **${newFileName}**`,
          color: 0x00ff00, // Green
          fields: [
            { name: '🌐 Domain', value: `**${domain}**`, inline: true },
            { name: '📁 File Name', value: `\`${newFileName}\``, inline: true },
            { name: '📏 Lines of Code', value: data.lines.toString(), inline: true },
            { name: '📊 File Size', value: data.fileSize, inline: true },
            { name: '🔗 URL', value: `\`${data.url}\``, inline: false }
          ],
          footer: { text: 'WebMonner Domain Alert' },
          timestamp
        };

      case 'file_changed':
        const fileName = data.url.split('/').pop() || 'unknown.js';
        const changeType = data.addedLines > data.removedLines ? 'expanded' : 
                          data.addedLines < data.removedLines ? 'reduced' : 'modified';
        return {
          title: `🔄 JS File Changed on ${domain}`,
          description: `JavaScript file **${fileName}** has been ${changeType}`,
          color: 0xffa500, // Orange
          fields: [
            { name: '🌐 Domain', value: `**${domain}**`, inline: true },
            { name: '📁 File Name', value: `\`${fileName}\``, inline: true },
            { name: '📈 Changes', value: `+${data.addedLines}/-${data.removedLines}`, inline: true },
            { name: '📊 File Size', value: data.fileSize, inline: true },
            { name: '📏 Total Lines', value: data.totalLines.toString(), inline: true },
            { name: '🔧 Code Sections', value: data.newCodeSections.toString(), inline: true },
            { name: '🔗 URL', value: `\`${data.url}\``, inline: false }
          ],
          footer: { text: 'WebMonner Domain Alert' },
          timestamp
        };

      case 'scan_complete':
        return {
          title: '✅ Multi-Domain Scan Complete',
          description: `Monitoring scan finished across all domains.`,
          color: 0x0099ff, // Blue
          fields: [
            { name: '🌐 URLs Processed', value: data.urlsProcessed.toString(), inline: true },
            { name: '📁 JS Files Found', value: data.totalFiles.toString(), inline: true },
            { name: '🆕 New Files', value: data.newFiles.toString(), inline: true },
            { name: '🔄 Changed Files', value: data.changedFiles.toString(), inline: true },
            { name: '🚫 Filtered Files', value: data.filteredFiles.toString(), inline: true },
            { name: '❌ Errors', value: data.errors.toString(), inline: true },
            { name: '⏱️ Scan Duration', value: data.duration, inline: true },
            { name: '⏰ Next Scan', value: data.nextScan || 'Manual', inline: true }
          ],
          footer: { text: 'WebMonner Domain Report' },
          timestamp
        };

      case 'error':
        const errorDomain = data.domain || (data.url ? this.getDomainFromUrl(data.url) : 'unknown');
        return {
          title: `❌ Error on ${errorDomain}`,
          description: `Monitoring error occurred on domain: **${errorDomain}**`,
          color: 0xff0000, // Red
          fields: [
            { name: '🌐 Domain', value: `**${errorDomain}**`, inline: true },
            { name: '⚠️ Error Type', value: data.type, inline: true },
            { name: '🔗 URL', value: data.url ? `\`${data.url}\`` : 'N/A', inline: false },
            { name: '📝 Message', value: `\`${data.message}\``, inline: false }
          ],
          footer: { text: 'WebMonner Domain Error' },
          timestamp
        };

      case 'live_monitoring_start':
        return {
          title: '🔴 Live Monitoring Started',
          description: `WebMonner is now actively monitoring JavaScript files across domains.`,
          color: 0x9932cc, // Purple
          fields: [
            { name: '🌐 URLs Monitored', value: data.urlCount.toString(), inline: true },
            { name: '⏱️ Scan Interval', value: data.interval, inline: true },
            { name: '🔍 Domain Filter', value: data.domainFilter || 'All Domains', inline: true },
            { name: '🔐 Authentication', value: data.authEnabled ? 'Enabled' : 'Disabled', inline: true }
          ],
          footer: { text: 'WebMonner Domain Monitor' },
          timestamp
        };

      default:
        return {
          title: '📢 WebMonner Notification',
          description: data.message || 'Unknown notification type',
          color: 0x808080, // Gray
          footer: { text: 'WebMonner Domain System' },
          timestamp
        };
    }
  }

  // Send a test notification to verify webhook
  async sendTestNotification() {
    await this.sendNotification('default', {
      message: '🧪 Discord notifications are working! WebMonner is ready to send alerts.'
    });
  }

  // Get notification statistics
  getNotificationStats() {
    return {
      sentCount: this.sentNotifications.size,
      queuedCount: this.pendingNotifications.length,
      isRateLimited: this.isRateLimited(),
      rateLimitReset: this.rateLimitReset > 0 ? new Date(this.rateLimitReset).toLocaleTimeString() : 'None',
      lastSummaryTime: this.lastSummaryTime > 0 ? new Date(this.lastSummaryTime).toLocaleTimeString() : 'None',
      summaryMinInterval: `${this.summaryMinInterval / 60000} minutes`
    };
  }

  // Clear all notification history (useful for testing)
  clearNotificationHistory() {
    this.sentNotifications.clear();
    this.pendingNotifications = [];
    this.rateLimitReset = 0;
    this.lastSummarySignature = null;
    this.lastSummaryTime = 0;
  }

  // Force send next summary (bypass deduplication)
  forceSendNextSummary() {
    this.lastSummarySignature = null;
    this.lastSummaryTime = 0;
    console.log('Next summary will be sent regardless of deduplication');
  }

  // Send new code preview as a Discord message
  async sendCodePreview(url, codeData) {
    if (!this.enabled) return;

    try {
      const fileName = url.split('/').pop() || 'unknown.js';
      const codePreview = codeData.newCode.slice(0, 10).join('\n');
      const truncated = codeData.newCode.length > 10;

      const embed = {
        title: '👀 New Code Preview',
        description: `New JavaScript code detected in: **${fileName}**`,
        color: 0x00ff00,
        fields: [
          {
            name: 'File Name',
            value: `\`${fileName}\``,
            inline: true
          },
          {
            name: 'URL',
            value: `\`${url}\``,
            inline: false
          },
          {
            name: 'Code Preview',
            value: `\`\`\`javascript\n${codePreview}${truncated ? '\n...(truncated)' : ''}\n\`\`\``,
            inline: false
          },
          {
            name: 'Details',
            value: `**Lines Added:** ${codeData.addedLines}\n**Total Sections:** ${codeData.sections}`,
            inline: true
          }
        ],
        footer: { text: 'WebMonner Code Alert' },
        timestamp: new Date().toISOString()
      };

      const payload = {
        username: 'WebMonner',
        avatar_url: 'https://i.imgur.com/2fQqPp0.png',
        embeds: [embed]
      };

      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error(`Discord code preview failed: ${error.message}`);
    }
  }
}

// Helper function to extract domain from URL
export function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

// Helper function to format file size
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Helper function to format duration
export function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
} 