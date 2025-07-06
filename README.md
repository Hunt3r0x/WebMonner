# WebMonner

JavaScript security monitoring platform for enterprise environments. Tracks JavaScript files across web applications, detects code changes, and provides detailed analysis for security teams.

## Overview

WebMonner monitors JavaScript files loaded by web applications and detects changes with precision. It supports continuous monitoring, domain filtering, authentication, and provides detailed diff analysis for security assessment.

## Installation

```bash
git clone <repository-url>
cd webmonner
npm install
```
<!-- 
## Configuration

Create `config.json` for authentication settings:

```json
{
  "targetUrl": "https://example.com",
  "auth": {
    "loginUrl": "https://your-api.com/api/auth",
    "email": "your-email@example.com",
    "password": "your-password"
  }
}
``` -->

## Usage

### Basic Scan

```bash
# Single URL scan
node cli.js --url https://example.com

# Multiple URLs from file
node cli.js --urls targets.txt
```

### Domain Filtering

```bash
# Monitor only specific domains
node cli.js --url https://app.example.com --include-domain "*.example.com"

# Monitor multiple domains
node cli.js --url https://app.example.com --include-domain "*.example.com" --include-domain "*.api.com"

# Exclude specific domains
node cli.js --url https://example.com --exclude-domain "*.analytics.com"

# Exclude multiple domains
node cli.js --url https://example.com --exclude-domain "*.analytics.com" --exclude-domain "*.ads.com"
```

### Multiple Filters

**Multiple Flag Approach:**
```bash
# Multiple include domains
node cli.js --urls targets.txt --include-domain "*.example.com" --include-domain "*.api.com" --include-domain "*.admin.com"

# Multiple exclude domains
node cli.js --urls targets.txt --exclude-domain "*.analytics.com" --exclude-domain "*.ads.com" --exclude-domain "*.tracking.com"

# Complex filtering with multiple patterns
node cli.js --urls targets.txt \
  --include-domain "*.example.com" \
  --include-domain "*.api.com" \
  --exclude-domain "*.cdn.example.com" \
  --exclude-url "*.min.js" \
  --exclude-url "*vendor*"
```

**Comma-Separated Approach:**
```bash
# Multiple include domains (comma-separated)
node cli.js --urls targets.txt --include-domain "*.example.com,*.api.com,*.admin.com"

# Multiple exclude domains (comma-separated)
node cli.js --urls targets.txt --exclude-domain "*.analytics.com,*.ads.com,*.tracking.com"

# Multiple URL filters (comma-separated)
node cli.js --urls targets.txt --include-url "*admin*,*api*" --exclude-url "*.min.js,*vendor*"
```

**Mixed Approach (both methods work together):**
```bash
# Combine comma-separated and multiple flags
node cli.js --urls targets.txt \
  --include-domain "*.example.com,*.api.com" \
  --include-domain "*.admin.com" \
  --exclude-domain "*.cdn.example.com" \
  --exclude-url "*.min.js,*vendor*"
```

### Continuous Monitoring

```bash
# Live monitoring with 60-second intervals
node cli.js --url https://example.com --live --interval 60

# Live monitoring with domain filtering
node cli.js --urls targets.txt --live --include-domain "*.example.com"

# Live monitoring with multiple filters
node cli.js --urls targets.txt --live --include-domain "*.example.com" --include-domain "*.api.com"
```

### Authentication

```bash
# Enable authentication
node cli.js --url https://example.com --auth

# Custom headers
node cli.js --url https://example.com --header "Authorization: Bearer token123"
```

### Output Control

```bash
# Quiet mode
node cli.js --url https://example.com --quiet

# Verbose mode
node cli.js --url https://example.com --verbose

# Debug mode (detailed technical information)
node cli.js --url https://example.com --debug

# Disable colors (for CI/CD)
node cli.js --url https://example.com --no-color
```

### Debug Mode

The `--debug` flag provides detailed technical information for troubleshooting:

```bash
node cli.js --url https://example.com --debug
```

**Debug output includes:**
- HTTP response headers (Content-Type, Content-Encoding, etc.)
- Response status codes and error details
- Puppeteer buffer vs direct fetch comparisons
- SHA256 hash calculations and comparisons
- File filtering decisions
- Cache behavior and 304 responses
- Protocol errors and fallback mechanisms

## Command Line Options

```
URL Options:
  --url <url>                  Target URL
  --urls <file>                File containing URLs (one per line)

Filtering:
  --include-domain <pattern>   Include domains matching pattern (comma-separated or multiple flags)
  --exclude-domain <pattern>   Exclude domains matching pattern (comma-separated or multiple flags)
  --include-url <pattern>      Include URLs matching pattern (comma-separated or multiple flags)
  --exclude-url <pattern>      Exclude URLs matching pattern (comma-separated or multiple flags)

Monitoring:
  --live                       Enable continuous monitoring
  --interval <seconds>         Monitoring interval (default: 30)
  --auth                       Enable authentication

Output:
  --quiet                      Minimal output
  --verbose                    Show all file status information
  --debug                      Enable detailed debugging output
  --no-color                   Disable colored output
  --no-code-preview           Disable code change preview
  --max-lines <number>        Lines per code section (default: 10)

Debugging:
  --debug-colors              Show color support information
  --test-discord              Test Discord notifications
```

## URL File Format

Create a text file with URLs (one per line):

```
# Comments start with #
https://app.example.com
https://admin.example.com
https://api.example.com
```

## Pattern Matching

Supports wildcard patterns:
- `*.example.com` matches any subdomain of example.com
- `*jquery*` matches any URL containing "jquery"
- `*.min.js` matches any minified JavaScript file

## Data Storage

Files are organized by domain:

```
data/
├── example.com/
│   ├── original/        # Raw JavaScript files
│   ├── beautified/      # Formatted JavaScript files
│   ├── diffs/           # Change analysis files
│   ├── new-code/        # New code sections
│   └── hashes.json      # File integrity tracking
```

## File Detection

Detects JavaScript files by:
- File extensions: .js, .mjs, .jsx, .ts, .tsx
- Content-Type headers: application/javascript, text/javascript
- Response analysis for dynamic content

## Change Detection

Uses SHA-256 hashing for reliable change detection:
- Tracks all JavaScript files per domain
- Identifies new, modified, and removed files
- Provides line-by-line diff analysis
- Preserves change history

## Discord Integration

```bash
# Configure Discord webhook
node cli.js --url https://example.com --discord-webhook "https://discord.com/api/webhooks/..."

# Test notifications
node cli.js --test-discord --discord-webhook "https://discord.com/api/webhooks/..."
```

## Notifications

Supports Discord notifications for:
- New files detected
- File modifications
- Scan completion
- Error conditions

## Security Features

- Request authentication support
- Custom HTTP headers
- SSL/TLS validation
- Rate limiting compliance
- Session management

## Terminal Compatibility

Automatically detects terminal capabilities:
- Full color support (24-bit)
- Basic color support (ANSI)
- Plain text fallback
- tmux/screen compatibility

## Performance

- Concurrent file processing
- Efficient change detection
- Memory-optimized diff analysis
- Configurable scan intervals

## Error Handling

- Network timeout handling
- SSL certificate validation
- DNS resolution errors
- Rate limit detection
- Graceful degradation

## Production Deployment

```bash
# Environment variables
export NO_COLOR=1                    # Disable colors
export DISCORD_WEBHOOK=https://...   # Discord integration

# Systemd service example
node cli.js --urls production.txt --live --interval 300 --quiet
```

## Maintenance

```bash
# Clean up old diff files
node cli.js --cleanup-diffs

# Set maximum diff files per domain
node cli.js --max-diff-files 100
```

## Requirements

- Node.js 16.0 or higher
- npm or yarn
- Network access to target URLs

## License

MIT License - see LICENSE file for details. 