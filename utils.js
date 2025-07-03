import chalk from 'chalk';

// Professional color scheme
const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.blue,
  muted: chalk.gray,
  highlight: chalk.magenta,
  dim: chalk.dim
};

// Clean logging functions
export const log = {
  // Header with clean formatting
  header: (text) => {
    console.log(colors.primary.bold(`\n╭─ ${text}`));
    console.log(colors.primary(`│`));
  },

  // Success message
  success: (text) => {
    console.log(colors.success(`│ ✓ ${text}`));
  },

  // Error message
  error: (text) => {
    console.log(colors.error(`│ ✗ ${text}`));
  },

  // Info message
  info: (text) => {
    console.log(colors.info(`│ ℹ ${text}`));
  },

  // Warning message
  warning: (text) => {
    console.log(colors.warning(`│ ⚠ ${text}`));
  },

  // Muted/secondary info
  muted: (text) => {
    console.log(colors.muted(`│ ${text}`));
  },

  // Progress indicator
  progress: (current, total, text) => {
    const percentage = Math.round((current / total) * 100);
    const bar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
    console.log(colors.info(`│ [${bar}] ${percentage}% ${text}`));
  },

  // Status with clean formatting
  status: (status, text) => {
    const statusColors = {
      'NEW': colors.success,
      'CHANGED': colors.warning,
      'UNCHANGED': colors.muted,
      'FILTERED': colors.dim,
      'ERROR': colors.error
    };
    const statusColor = statusColors[status] || colors.info;
    console.log(statusColor(`│ ${status.padEnd(9)} ${text}`));
  },

  // Footer
  footer: () => {
    console.log(colors.primary(`╰─────────────────────────────────────────────────────────────────────────`));
  },

  // Separator
  separator: () => {
    console.log(colors.muted(`│`));
  },

  // Clean table header
  tableHeader: (headers) => {
    console.log(colors.primary(`│ ${headers.join(' │ ')}`));
    console.log(colors.primary(`│ ${headers.map(h => '─'.repeat(h.length)).join('─┼─')}`));
  },

  // Clean table row
  tableRow: (cells) => {
    console.log(colors.muted(`│ ${cells.join(' │ ')}`));
  }
};

// Summary formatting
export const summary = {
  create: (title, data) => {
    log.header(title);
    log.separator();
    
    Object.entries(data).forEach(([key, value]) => {
      const formattedKey = key.padEnd(20);
      if (typeof value === 'number') {
        log.muted(`${formattedKey} ${colors.highlight(value)}`);
      } else {
        log.muted(`${formattedKey} ${value}`);
      }
    });
    
    log.footer();
  }
};

// Progress bar for operations
export class ProgressBar {
  constructor(total, label = 'Progress') {
    this.total = total;
    this.current = 0;
    this.label = label;
    this.startTime = Date.now();
    this.lastUpdate = 0;
  }

  update(current, text = '') {
    this.current = current;
    const now = Date.now();
    
    // Only update every 500ms or on completion to avoid spam
    if (now - this.lastUpdate < 500 && current < this.total) {
      return;
    }
    
    this.lastUpdate = now;
    const percentage = Math.round((this.current / this.total) * 100);
    
    // Create progress bar
    const barLength = 20;
    const filledLength = Math.round((percentage / 100) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    
    // Clean progress display without timing
    process.stdout.write('\r');
    const progressText = `│ [${colors.info(bar)}] ${colors.highlight(percentage + '%')} ${this.label} ${text}`;
    console.log(progressText);
  }

  finish(text = 'Complete') {
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const elapsedStr = formatDuration(elapsed);
    log.success(`${this.label} ${text} in ${elapsedStr}`);
  }
}

// Sleep timer for live monitoring intervals
export class SleepTimer {
  constructor(durationSeconds, label = 'Next scan') {
    this.duration = durationSeconds;
    this.label = label;
    this.interval = null;
    this.startTime = Date.now();
  }

  async start() {
    return new Promise((resolve) => {
      let remaining = this.duration;
      
      // Initial display
      this.displayCountdown(remaining);
      
      this.interval = setInterval(() => {
        remaining--;
        
        if (remaining <= 0) {
          clearInterval(this.interval);
          // Clear the countdown line and show completion
          process.stdout.write('\r');
          console.log(colors.success(`│ ✓ ${this.label} starting now`));
          resolve();
        } else {
          this.displayCountdown(remaining);
        }
      }, 1000);
    });
  }

  displayCountdown(remaining) {
    const totalSeconds = this.duration;
    const elapsed = totalSeconds - remaining;
    const percentage = Math.round((elapsed / totalSeconds) * 100);
    
    // Create progress bar
    const barLength = 20;
    const filledLength = Math.round((percentage / 100) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    
    // Format remaining time
    const remainingStr = formatDuration(remaining);
    const nextScanTime = new Date(Date.now() + (remaining * 1000)).toLocaleTimeString();
    
    // Clear line and update
    process.stdout.write('\r');
    const countdownText = `│ [${colors.warning(bar)}] ${colors.highlight(percentage + '%')} ${this.label} in ${colors.highlight(remainingStr)} | Next scan at ${colors.dim(nextScanTime)}`;
    process.stdout.write(countdownText);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

// Format duration in seconds to human readable format
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

// Clean URL formatting
export const formatUrl = (url) => {
  try {
    const urlObj = new URL(url);
    const domain = colors.highlight(urlObj.hostname);
    const path = colors.muted(urlObj.pathname);
    return `${domain}${path}`;
  } catch {
    return colors.muted(url);
  }
};

// File size formatting
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// Time formatting
export const formatTime = (date = new Date()) => {
  return colors.muted(date.toLocaleTimeString());
};

// Clean startup banner
export const showBanner = () => {
  console.clear();
  console.log(colors.primary.bold('╭─────────────────────────────────────────────────────────────────────────'));
  console.log(colors.primary.bold('│'));
  console.log(colors.primary.bold('│  ██╗    ██╗███████╗██████╗ ███╗   ███╗ ██████╗ ███╗   ██╗███╗   ██╗███████╗██████╗ '));
  console.log(colors.primary.bold('│  ██║    ██║██╔════╝██╔══██╗████╗ ████║██╔═══██╗████╗  ██║████╗  ██║██╔════╝██╔══██╗'));
  console.log(colors.primary.bold('│  ██║ █╗ ██║█████╗  ██████╔╝██╔████╔██║██║   ██║██╔██╗ ██║██╔██╗ ██║█████╗  ██████╔╝'));
  console.log(colors.primary.bold('│  ██║███╗██║██╔══╝  ██╔══██╗██║╚██╔╝██║██║   ██║██║╚██╗██║██║╚██╗██║██╔══╝  ██╔══██╗'));
  console.log(colors.primary.bold('│  ╚███╔███╔╝███████╗██████╔╝██║ ╚═╝ ██║╚██████╔╝██║ ╚████║██║ ╚████║███████╗██║  ██║'));
  console.log(colors.primary.bold('│   ╚══╝╚══╝ ╚══════╝╚═════╝ ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝'));
  console.log(colors.primary.bold('│'));
  console.log(colors.primary.bold('│  Professional JavaScript Monitoring Tool'));
  console.log(colors.primary.bold('│'));
  console.log(colors.primary.bold('╰─────────────────────────────────────────────────────────────────────────'));
  console.log('');
}; 