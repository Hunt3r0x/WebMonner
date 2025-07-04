import chalk from 'chalk';

// Professional enterprise color scheme
const colors = {
  primary: chalk.hex('#2563eb'),      // Professional blue
  success: chalk.hex('#059669'),      // Clean green
  warning: chalk.hex('#d97706'),      // Amber warning
  error: chalk.hex('#dc2626'),        // Clean red
  info: chalk.hex('#0891b2'),         // Cyan info
  muted: chalk.hex('#6b7280'),        // Gray muted
  accent: chalk.hex('#7c3aed'),       // Purple accent
  dim: chalk.hex('#9ca3af'),          // Lighter gray
  bright: chalk.white.bold
};

// Professional logging system
export const log = {
  // Clean header
  header: (text) => {
    console.log(colors.primary(`\n▎${text}`));
  },

  // Success message
  success: (text) => {
    console.log(colors.success(`  [OK] ${text}`));
  },

  // Error message
  error: (text) => {
    console.log(colors.error(`  [ERROR] ${text}`));
  },

  // Info message
  info: (text) => {
    console.log(colors.info(`  [INFO] ${text}`));
  },

  // Warning message
  warning: (text) => {
    console.log(colors.warning(`  [WARN] ${text}`));
  },

  // Muted text
  muted: (text) => {
    console.log(colors.muted(`    ${text}`));
  },

  // Status with professional formatting
  status: (status, text) => {
    const statusMap = {
      'NEW': { color: colors.success, prefix: '[NEW]' },
      'CHANGED': { color: colors.warning, prefix: '[MOD]' },
      'UNCHANGED': { color: colors.muted, prefix: '[---]' },
      'FILTERED': { color: colors.dim, prefix: '[SKP]' },
      'ERROR': { color: colors.error, prefix: '[ERR]' }
    };
    
    const statusStyle = statusMap[status] || { color: colors.info, prefix: '[---]' };
    console.log(`    ${statusStyle.color(statusStyle.prefix)} ${text}`);
  },

  // Clean separator
  separator: () => {
    console.log('');
  },

  // Minimal progress indicator
  progress: (text) => {
    console.log(colors.info(`  [INFO] ${text}`));
  }
};

// Professional summary box
export const summary = {
  create: (title, data) => {
    console.log(colors.primary(`\n▎${title}`));
    console.log(colors.muted('  ─'.repeat(40)));
    
    Object.entries(data).forEach(([key, value]) => {
      const keyFormatted = key.padEnd(20);
      const valueFormatted = typeof value === 'number' ? colors.accent(value.toLocaleString()) : colors.bright(value);
      console.log(colors.muted(`  ${keyFormatted} ${valueFormatted}`));
    });
    
    console.log('');
  }
};

// Modern progress bar
export class ProgressBar {
  constructor(total, label = 'Processing') {
    this.total = total;
    this.current = 0;
    this.label = label;
    this.startTime = Date.now();
    this.lastUpdate = 0;
  }

  update(current, text = '') {
    this.current = current;
    const now = Date.now();
    
    // Throttle updates for performance
    if (now - this.lastUpdate < 300 && current < this.total) {
      return;
    }
    
    this.lastUpdate = now;
    const percentage = Math.round((this.current / this.total) * 100);
    
    // Clean progress bar
    const barWidth = 20;
    const filled = Math.round((percentage / 100) * barWidth);
    const empty = barWidth - filled;
    
    const bar = colors.primary('█'.repeat(filled)) + colors.dim('░'.repeat(empty));
    const percent = colors.accent(`${percentage}%`.padStart(4));
    
    // Clear line and show progress
    process.stdout.write('\r');
    const progressLine = `  ${bar} ${percent} ${colors.muted(this.label)} ${colors.bright(text)}`;
    process.stdout.write(progressLine);
    
    // Add newline if complete
    if (current >= this.total) {
      console.log('');
    }
  }

  finish(text = 'Complete') {
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const duration = formatDuration(elapsed);
    log.success(`${this.label} ${text} (${duration})`);
  }
}

// Professional countdown timer
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
      
      this.displayCountdown(remaining);
      
      this.interval = setInterval(() => {
        remaining--;
        
        if (remaining <= 0) {
          clearInterval(this.interval);
          process.stdout.write('\r');
          log.success(`${this.label} starting`);
          resolve();
        } else {
          this.displayCountdown(remaining);
        }
      }, 1000);
    });
  }

  displayCountdown(remaining) {
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    const nextScanTime = new Date(Date.now() + (remaining * 1000)).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
    
    process.stdout.write('\r');
    const countdownLine = `  ${colors.warning('[WAIT]')} ${colors.bright(timeStr)} ${colors.muted(this.label)} ${colors.dim(`(at ${nextScanTime})`)}`;
    process.stdout.write(countdownLine);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

// Clean time formatting
export function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m${remainingSeconds > 0 ? ` ${remainingSeconds}s` : ''}`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`;
  }
}

// Professional URL formatting
export const formatUrl = (url) => {
  try {
    if (!url.startsWith('http')) {
      return colors.muted(url);
    }

    const urlObj = new URL(url);

    const protocol = colors.dim(urlObj.protocol + '//');
    const domain = colors.highlight(urlObj.hostname);
    const port = urlObj.port ? ':' + urlObj.port : '';
    const path = colors.muted(urlObj.pathname || '/');
    const query = urlObj.search ? colors.info(urlObj.search) : '';
    const hash = urlObj.hash ? colors.info(urlObj.hash) : '';

    return `${protocol}${domain}${port}${path}${query}${hash}`;
  } catch {
    return colors.muted(url);
  }
};


// Clean file size formatting
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
  return `${size} ${sizes[i]}`;
};

// Professional time formatting
export const formatTime = (date = new Date()) => {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

// Clean enterprise banner
export const showBanner = () => {
  console.clear();
  console.log(colors.primary.bold('\n  ██╗    ██╗███████╗██████╗ ███╗   ███╗ ██████╗ ███╗   ██╗███╗   ██╗███████╗██████╗'));
  console.log(colors.primary.bold('  ██║    ██║██╔════╝██╔══██╗████╗ ████║██╔═══██╗████╗  ██║████╗  ██║██╔════╝██╔══██╗'));
  console.log(colors.primary.bold('  ██║ █╗ ██║█████╗  ██████╔╝██╔████╔██║██║   ██║██╔██╗ ██║██╔██╗ ██║█████╗  ██████╔╝'));
  console.log(colors.primary.bold('  ██║███╗██║██╔══╝  ██╔══██╗██║╚██╔╝██║██║   ██║██║╚██╗██║██║╚██╗██║██╔══╝  ██╔══██╗'));
  console.log(colors.primary.bold('  ╚███╔███╔╝███████╗██████╔╝██║ ╚═╝ ██║╚██████╔╝██║ ╚████║██║ ╚████║███████╗██║  ██║'));
  console.log(colors.primary.bold('   ╚══╝╚══╝ ╚══════╝╚═════╝ ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝'));
  console.log(colors.muted('\n  Enterprise JavaScript Security Monitoring Platform'));
  console.log(colors.dim('  Real-time code change detection and analysis\n'));
};

// Enterprise metrics display
export const showMetrics = (metrics) => {
  if (!metrics || Object.keys(metrics).length === 0) return;
  
  console.log(colors.primary('\n▎Performance Metrics'));
  console.log(colors.muted('  ─'.repeat(40)));
  
  Object.entries(metrics).forEach(([key, value]) => {
    const keyFormatted = key.padEnd(20);
    const valueFormatted = colors.accent(value);
    console.log(colors.muted(`  ${keyFormatted} ${valueFormatted}`));
  });
  
  console.log('');
};

// Professional error display
export const showErrors = (errors) => {
  if (!errors || errors.length === 0) return;
  
  console.log(colors.error('\n▎Error Summary'));
  console.log(colors.muted('  ─'.repeat(40)));
  
  const errorTypes = {};
  errors.forEach(error => {
    errorTypes[error.type] = (errorTypes[error.type] || 0) + 1;
  });
  
  Object.entries(errorTypes).forEach(([type, count]) => {
    console.log(colors.muted(`  ${type.padEnd(20)} ${colors.error(count)}`));
  });
  
  if (errors.length <= 5) {
    console.log('');
    errors.forEach(error => {
      console.log(colors.muted(`    [ERR] ${formatUrl(error.url)}`));
      console.log(colors.dim(`      ${error.message}`));
    });
  }
  
  console.log('');
}; 