import fs from 'fs';

// Discord notification handler
export class DiscordNotifier {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
    this.enabled = !!webhookUrl;
    this.sentNotifications = new Map(); // Track sent notifications to prevent duplicates
    this.rateLimitReset = 0; // Track rate limit reset time
    this.pendingNotifications = []; // Queue for pending notifications
  }

  async sendNotification(type, data) {
    if (!this.enabled) return;

    // Create unique key for deduplication (only for file changes and new files)
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

    switch (type) {
      case 'new_file':
        const newFileName = data.url.split('/').pop() || 'unknown.js';
        return {
          title: '🆕 New JavaScript File Detected',
          description: `New file found: **${newFileName}**`,
          color: 0x00ff00, // Green
          fields: [
            { name: 'File Name', value: `\`${newFileName}\``, inline: true },
            { name: 'URL', value: `\`${data.url}\``, inline: false },
            { name: 'Domain', value: data.domain, inline: true },
            { name: 'File Size', value: data.fileSize, inline: true },
            { name: 'Lines of Code', value: data.lines.toString(), inline: true }
          ],
          footer: { text: 'WebMonner Alert' },
          timestamp
        };

      case 'file_changed':
        const fileName = data.url.split('/').pop() || 'unknown.js';
        return {
          title: '🔄 JavaScript File Changed',
          description: `Changes detected in: **${fileName}**`,
          color: 0xffa500, // Orange
          fields: [
            { name: 'File Name', value: `\`${fileName}\``, inline: true },
            { name: 'URL', value: `\`${data.url}\``, inline: false },
            { name: 'Domain', value: data.domain, inline: true },
            { name: 'Lines Added', value: data.addedLines.toString(), inline: true },
            { name: 'Lines Removed', value: data.removedLines.toString(), inline: true },
            { name: 'File Size', value: data.fileSize, inline: true },
            { name: 'Total Lines', value: data.totalLines.toString(), inline: true },
            { name: 'New Code Sections', value: data.newCodeSections.toString(), inline: true }
          ],
          footer: { text: 'WebMonner Alert' },
          timestamp
        };

      case 'scan_complete':
        return {
          title: '✅ Scan Complete',
          description: `Monitoring scan finished successfully.`,
          color: 0x0099ff, // Blue
          fields: [
            { name: 'URLs Processed', value: data.urlsProcessed.toString(), inline: true },
            { name: 'JS Files Found', value: data.totalFiles.toString(), inline: true },
            { name: 'New Files', value: data.newFiles.toString(), inline: true },
            { name: 'Changed Files', value: data.changedFiles.toString(), inline: true },
            { name: 'Filtered Files', value: data.filteredFiles.toString(), inline: true },
            { name: 'Errors', value: data.errors.toString(), inline: true },
            { name: 'Scan Duration', value: data.duration, inline: true },
            { name: 'Next Scan', value: data.nextScan || 'Manual', inline: true }
          ],
          footer: { text: 'WebMonner Report' },
          timestamp
        };

      case 'error':
        return {
          title: '❌ Monitoring Error',
          description: `An error occurred during monitoring.`,
          color: 0xff0000, // Red
          fields: [
            { name: 'Error Type', value: data.type, inline: true },
            { name: 'URL', value: data.url || 'N/A', inline: true },
            { name: 'Message', value: `\`${data.message}\``, inline: false }
          ],
          footer: { text: 'WebMonner Error' },
          timestamp
        };

      case 'live_monitoring_start':
        return {
          title: '🔴 Live Monitoring Started',
          description: `WebMonner is now actively monitoring JavaScript files.`,
          color: 0x9932cc, // Purple
          fields: [
            { name: 'URLs Monitored', value: data.urlCount.toString(), inline: true },
            { name: 'Scan Interval', value: data.interval, inline: true },
            { name: 'Domain Filter', value: data.domainFilter || 'None', inline: true },
            { name: 'Authentication', value: data.authEnabled ? 'Enabled' : 'Disabled', inline: true }
          ],
          footer: { text: 'WebMonner Status' },
          timestamp
        };

      default:
        return {
          title: '📢 WebMonner Notification',
          description: data.message || 'Unknown notification type',
          color: 0x808080, // Gray
          footer: { text: 'WebMonner' },
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
      rateLimitReset: this.rateLimitReset > 0 ? new Date(this.rateLimitReset).toLocaleTimeString() : 'None'
    };
  }

  // Clear all notification history (useful for testing)
  clearNotificationHistory() {
    this.sentNotifications.clear();
    this.pendingNotifications = [];
    this.rateLimitReset = 0;
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