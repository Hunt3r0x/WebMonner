# WebMonner - JavaScript Security Scanner

A comprehensive web security scanner that monitors JavaScript files for changes and analyzes code similarity to track renamed/moved files.

## Features

- **JavaScript File Monitoring**: Automatically detects and tracks all JavaScript files
- **Endpoint Extraction**: Comprehensive extraction of API endpoints and URLs from JavaScript files
- **Code Similarity Analysis**: Identifies renamed/moved files with similar functionality
- **Change Detection**: Tracks file modifications with detailed diff analysis
- **Live Monitoring**: Continuous monitoring with customizable intervals
- **Discord Notifications**: Real-time alerts via Discord webhooks
- **Filtering**: Advanced domain and URL filtering capabilities
- **Authentication**: Support for authenticated scanning
- **Comprehensive Reporting**: Detailed analysis reports and summaries

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

### Basic Scanning

```bash
# Scan a single URL
node cli.js --url https://example.com

# Scan multiple URLs from a file
node cli.js --urls urls.txt

# Scan with verbose output
node cli.js --url https://example.com --verbose

# Scan with custom similarity threshold
node cli.js --url https://example.com --similarity-threshold 0.8
```

### Live Monitoring

```bash
# Monitor every 60 seconds
node cli.js --url https://example.com --live --interval 60

# Monitor with Discord notifications
node cli.js --url https://example.com --live --discord-webhook https://discord.com/api/webhooks/...
```

### Filtering

```bash
# Only monitor specific domains
node cli.js --url https://example.com --include-domain "*.example.com,*.cdn.com"

# Exclude specific domains
node cli.js --url https://example.com --exclude-domain "*.ads.com,*.tracking.com"

# Filter by URL patterns
node cli.js --url https://example.com --include-url "*/api/*" --exclude-url "*/test/*"
```

### Similarity Analysis

```bash
# Analyze file similarity for a specific domain
node cli.js --analyze-similarity example.com

# Analyze all domains
node cli.js --analyze-all-domains

# Use custom similarity threshold (0.0-1.0)
node cli.js --analyze-similarity example.com --similarity-threshold 0.8
```

### Endpoint Extraction

```bash
# Extract endpoints from JavaScript files
node cli.js --url https://example.com --extract-endpoints

# Extract endpoints with detailed output
node cli.js --url https://example.com --extract-endpoints --show-endpoints

# Generate endpoint report for a specific domain
node cli.js --generate-endpoint-report example.com

# Generate endpoint reports for all domains
node cli.js --generate-all-endpoint-reports
```

### Authentication

```bash
# Enable authentication (requires config.json)
node cli.js --url https://example.com --auth

# Add custom headers
node cli.js --url https://example.com --header "Cookie: session=abc123" --header "Authorization: Bearer token"
```

### Utility Commands

```bash
# Clean up old diff files
node cli.js --cleanup-diffs

# Test Discord notifications
node cli.js --test-discord --discord-webhook https://discord.com/api/webhooks/...

# Debug color support
node cli.js --debug-colors
```

## Configuration

### config.json

```json
{
  "auth": {
    "loginUrl": "https://example.com/login",
    "username": "your-username",
    "password": "your-password",
    "usernameSelector": "#username",
    "passwordSelector": "#password",
    "submitSelector": "#login-button"
  }
}
```

### urls.txt

```
https://example.com
https://another-site.com
# Comments are supported
https://third-site.com
```

## Similarity Analysis

The similarity analysis feature helps identify renamed/moved JavaScript files by analyzing:

1. **Function Signatures**: Compares function names and signatures
2. **Import/Export Statements**: Analyzes module dependencies
3. **Content Hash**: Compares normalized code content
4. **Weighted Scoring**: Combines multiple factors for accurate similarity

### Understanding Similarity Reports

The system generates several types of reports:

- **`similarity-report.md`**: Human-readable analysis of file relationships
- **`fingerprints.json`**: Code fingerprints for each file
- **`file-relationships.json`**: Detailed relationship data

Example similarity report:

```markdown
# Code Similarity Analysis for example.com

## File Clusters (Likely Renamed/Moved Files)

### Cluster 1
**Likely Reason:** renamed_or_moved_files
**Files:**
- `https://example.com/js/app.abc123.js`
- `https://example.com/js/app.def456.js`

### Cluster 2  
**Likely Reason:** renamed_or_moved_files
**Files:**
- `https://example.com/js/vendor.old.js`
- `https://example.com/js/vendor.new.js`
```

## Endpoint Extraction

The endpoint extraction feature provides comprehensive detection of API endpoints, URLs, and routes from JavaScript files with high accuracy. This is particularly useful for security research, API discovery, and reconnaissance.

### Detection Methods

The system uses three complementary extraction methods:

1. **Regex Pattern Matching**: Identifies common URL patterns and API endpoints
2. **AST (Abstract Syntax Tree) Analysis**: Parses JavaScript code for accurate endpoint extraction
3. **Line-by-line Context Analysis**: Analyzes code context for additional endpoint discovery

### Confidence Levels

Endpoints are classified into three confidence levels:

- **High Confidence**: API calls, fetch requests, axios calls, and clear endpoint patterns
- **Medium Confidence**: URL patterns, router definitions, and configuration endpoints
- **Low Confidence**: File paths and less certain patterns

### Endpoint Categories

The system categorizes endpoints by type:

- **API Endpoints**: `/api/*`, `/v1/*`, `/rest/*`, `/graphql`
- **Authentication**: `/auth/*`, `/login`, `/signup`, `/oauth`
- **Admin Routes**: `/admin/*`, `/dashboard/*`, `/config`
- **Data Endpoints**: `/data/*`, `/upload/*`, `/download/*`
- **WebSocket URLs**: `ws://`, `wss://`
- **Full URLs**: `https://`, `http://`

### Understanding Endpoint Reports

Example endpoint report structure:

```markdown
# Endpoint Report for example.com

## Summary
- **High Confidence**: 15 endpoints
- **Medium Confidence**: 23 endpoints
- **Low Confidence**: 8 endpoints

## High Confidence Endpoints
- `GET` **/api/users** (from `app.js`)
- `POST` **/api/auth/login** (from `auth.js`)
- `GET` **/api/v1/posts** (from `posts.js`)

## Medium Confidence Endpoints
- `GET` **/admin/dashboard** (from `admin.js`)
- `UNKNOWN` **/config/settings** (from `config.js`)
```

## Output Structure

```
data/
├── domain.com/
│   ├── original/           # Original JavaScript files
│   ├── beautified/         # Beautified versions
│   ├── diffs/              # Change diffs
│   ├── new-code/           # New code sections
│   ├── endpoints/          # Extracted endpoints
│   │   ├── all-endpoints.json      # All discovered endpoints
│   │   ├── summary.json            # Endpoint summary
│   │   ├── endpoint-report.md      # Human-readable report
│   │   └── filename_timestamp.json # Per-file endpoints
│   ├── hashes.json         # File hashes
│   ├── fingerprints.json   # Code fingerprints
│   ├── file-relationships.json  # Similarity relationships
│   ├── similarity-report.md     # Human-readable report
│   └── new-code-summary.md      # Code change summary
```

## CLI Options

| Option | Description |
|--------|-------------|
| `--url <url>` | Target URL (single URL) |
| `--urls <file>` | File containing list of URLs |
| `--auth` | Enable authentication |
| `--header <header>` | Custom headers |
| `--live` | Enable live monitoring |
| `--interval <seconds>` | Monitoring interval (default: 30) |
| `--include-domain <pattern>` | Include domain patterns |
| `--exclude-domain <pattern>` | Exclude domain patterns |
| `--include-url <pattern>` | Include URL patterns |
| `--exclude-url <pattern>` | Exclude URL patterns |
| `--quiet` | Reduce output verbosity |
| `--verbose` | Show all file statuses |
| `--debug` | Enable detailed debugging |
| `--no-color` | Disable colored output |
| `--no-code-preview` | Disable code preview |
| `--max-lines <number>` | Max lines per code section (default: 10) |
| `--discord-webhook <url>` | Discord webhook URL |
| `--test-discord` | Test Discord notifications |
| `--analyze-similarity <domain>` | Analyze similarity for domain |
| `--analyze-all-domains` | Analyze all domains |
| `--similarity-threshold <number>` | Similarity threshold (default: 0.7) |
| `--extract-endpoints` | Enable endpoint extraction |
| `--show-endpoints` | Show extracted endpoints in output |
| `--generate-endpoint-report <domain>` | Generate endpoint report for domain |
| `--generate-all-endpoint-reports` | Generate endpoint reports for all domains |
| `--cleanup-endpoints` | Clean up excessive endpoint data |
| `--endpoint-storage-stats` | Show endpoint storage statistics |
| `--max-endpoints <number>` | Max endpoints per domain (default: 1000) |
| `--max-endpoint-files <number>` | Max endpoint files per domain (default: 100) |
| `--cleanup-diffs` | Clean up old diff files |

## Examples

### Comprehensive Monitoring Setup

```bash
# Monitor multiple sites with filtering and notifications
node cli.js --urls production-sites.txt \
  --live --interval 120 \
  --include-domain "*.mycompany.com" \
  --exclude-url "*/test/*,*/dev/*" \
  --discord-webhook "https://discord.com/api/webhooks/..." \
  --verbose
```

### Security Research Workflow

```bash
# 1. Initial scan with endpoint extraction
node cli.js --url https://target.com --extract-endpoints --show-endpoints --verbose

# 2. Analyze similarities to understand file structure
node cli.js --analyze-similarity target.com

# 3. Generate comprehensive endpoint report
node cli.js --generate-endpoint-report target.com

# 4. Set up monitoring for changes and new endpoints
node cli.js --url https://target.com --live --interval 300 --extract-endpoints
```

### Endpoint Discovery Workflow

```bash
# 1. Extract endpoints from multiple targets
node cli.js --urls targets.txt --extract-endpoints --show-endpoints

# 2. Generate reports for all discovered domains
node cli.js --generate-all-endpoint-reports

# 3. Monitor for new endpoints in live mode
node cli.js --urls targets.txt --live --interval 600 --extract-endpoints
```

### Storage Management

```bash
# Check endpoint storage usage
node cli.js --endpoint-storage-stats

# Clean up excessive endpoint data
node cli.js --cleanup-endpoints

# Set custom limits (prevent large storage)
node cli.js --url https://target.com --extract-endpoints --max-endpoints 500 --max-endpoint-files 50

# Monitor with storage limits
node cli.js --urls targets.txt --live --extract-endpoints --max-endpoints 1000
```

### Batch Analysis

```bash
# Analyze all previously scanned domains
node cli.js --analyze-all-domains --similarity-threshold 0.8

# Clean up old data
node cli.js --cleanup-diffs
```

## Troubleshooting

### Common Issues

1. **No files detected**: Check if the site loads JavaScript files dynamically
2. **Authentication failed**: Verify credentials and selectors in config.json
3. **Similarity analysis empty**: Ensure you've run scans first to collect data
4. **Discord notifications not working**: Test with `--test-discord` flag

### Debug Mode

```bash
# Enable debug output
node cli.js --url https://example.com --debug

# Check color support
node cli.js --debug-colors
```

## License

MIT License - see LICENSE file for details. 