# 🕷️ webmonner

A powerful web monitoring tool that tracks JavaScript files loaded on websites, detects changes with **100% accuracy**, provides **live monitoring**, supports **domain filtering**, **multi-URL monitoring**, and shows **actual new code sections**.

## 🚀 Features

- **🔴 Live Monitoring**: Continuous monitoring that runs automatically at specified intervals
- **🎯 100% Accurate Detection**: Enhanced JavaScript file detection with multiple patterns
- **📊 Detailed Diff Analysis**: Line-by-line comparison with comprehensive change reports
- **🔍 New Code Preview**: See actual new/changed JavaScript code in both original and beautified formats
- **🌐 Multi-URL Support**: Monitor multiple websites from a single command
- **🔍 Domain Filtering**: Include/exclude JS files based on domain patterns (e.g., *.felixforus.ca)
- **🔒 Authentication Support**: Built-in login functionality for protected websites
- **📡 Custom Headers**: Support for custom HTTP headers including cookies
- **🗂️ Organized Storage**: Saves original, beautified, diff, and new code sections
- **📈 Change Analytics**: Detailed statistics on additions, deletions, and modifications
- **🔄 Hash Tracking**: SHA-256 hashing for reliable change detection
- **🌐 Enhanced Detection**: Supports .js, .mjs, .jsx, .ts, .tsx files and content-type detection
- **🎨 Professional UI**: Clean, colored terminal output with progress bars and summaries

## 📦 Installation

```bash
# Clone the repository
git clone <repository-url>
cd webmonner

# Install dependencies
npm install
```

## 🔧 Configuration

Edit `config.json` to configure authentication settings:

```json
{
  "targetUrl": "https://example.com",
  "auth": {
    "loginUrl": "https://your-api.com/api/auth",
    "email": "your-email@example.com",
    "password": "your-password"
  }
}
```

## 💻 Usage

### 🔍 **Domain Filtering (Your Use Case)**

```bash
# Monitor only JS files from *.felixforus.ca domains
node cli.js --url https://bugcrowd.charm.felixforus.ca --include-domain "*.felixforus.ca"

# Live monitoring with domain filtering
node cli.js --urls urls.txt --live --include-domain "*.felixforus.ca"

# Exclude specific domains
node cli.js --url https://example.com --exclude-domain "*.google.com"
```

### 🌐 **Multi-URL Monitoring**

Create a `urls.txt` file:
```
# webmonner URL list
https://bugcrowd.charm.felixforus.ca
https://bugcrowd.lucky.felixforus.ca
https://admin.felixforus.ca
https://app.felixforus.ca
```

```bash
# Monitor multiple URLs
node cli.js --urls urls.txt --include-domain "*.felixforus.ca"

# Live monitoring of multiple URLs
node cli.js --urls urls.txt --live --interval 60 --include-domain "*.felixforus.ca"
```

### 👁️ **New Code Preview**

```bash
# Show new code sections (default)
node cli.js --url https://example.com

# Disable code preview for faster processing
node cli.js --url https://example.com --no-code-preview

# Customize lines shown per section
node cli.js --url https://example.com --max-lines 20

# Quiet mode - minimal output
node cli.js --url https://example.com --quiet
```

### 🔴 **Live Monitoring**

```bash
# Start live monitoring with default 30-second intervals
node cli.js --url https://example.com --live

# Custom monitoring interval (60 seconds)
node cli.js --url https://example.com --live --interval 60

# Live monitoring with authentication
node cli.js --url https://example.com --live --auth --interval 30
```

### 🎯 **One-Time Scan**

```bash
# Basic single scan
node cli.js --url https://example.com

# Single scan with authentication
node cli.js --url https://example.com --auth
```

### 🔧 **Advanced Filtering**

```bash
# Include only specific domain pattern
node cli.js --urls urls.txt --include-domain "*.felixforus.ca"

# Exclude specific domain pattern
node cli.js --url https://example.com --exclude-domain "*.ads.com"

# Include only specific URL patterns
node cli.js --url https://example.com --include-url "*jquery*"

# Exclude specific URL patterns
node cli.js --url https://example.com --exclude-url "*analytics*"

# Combine multiple filters
node cli.js --urls urls.txt \
  --include-domain "*.felixforus.ca" \
  --exclude-url "*tracking*" \
  --live --interval 45
```

## 📁 Enhanced Output Structure

```
data/
└── [domain]/
    ├── original/              # Raw JavaScript files
    ├── beautified/            # Beautified JavaScript files
    ├── diffs/                 # Detailed diff files with timestamps
    ├── new-code/              # New code sections (raw & beautified)
    ├── hashes.json            # Hash tracking database
    └── change-report.json     # Latest scan summary
```

## 👁️ New Code Preview Example

When changes are detected, webmonner shows you the actual new code:

```
╭─ Original JavaScript - New/Changed Code:
│
│ ─── Section 1 ───
│ +  247 function newFeature() {
│ +  248   console.log('New functionality added');
│ +  249   return true;
│ +  250 }
│ 
│ ─── Section 2 ───
│ -  180   // Old code removed
│ +  180   // Updated implementation
│ +  181   const enhanced = true;
│ 
╭─ Beautified JavaScript - New/Changed Code:
│
│ ─── Section 1 ───
│ +  247 function newFeature() {
│ +  248   console.log('New functionality added');
│ +  249   return true;
│ +  250 }
│
╭─ Change Summary
│
│ File: 45.2 KB | Lines: 1,247
│ Added: 15 | Removed: 3
│ New sections: 2 raw, 2 beautified
│ Files saved:
│   • Diff: data/example.com/diffs/app_2024-01-15T10-30-45.diff
│   • New code: data/example.com/new-code/app_2024-01-15T10-30-45_raw.json
│   • Beautified: data/example.com/new-code/app_2024-01-15T10-30-45_beautified.json
```

## 🔍 Filtering System

### 📋 **Filter Types**

| Filter | Description | Example |
|--------|-------------|---------|
| `--include-domain` | Only process JS files from matching domains | `*.felixforus.ca` |
| `--exclude-domain` | Skip JS files from matching domains | `*.ads.com` |
| `--include-url` | Only process JS files with matching URLs | `*jquery*` |
| `--exclude-url` | Skip JS files with matching URLs | `*tracking*` |

### 🎯 **Pattern Matching**

- **Wildcards**: Use `*` for any characters, `?` for single character
- **Case Insensitive**: All patterns are case-insensitive
- **Domain Examples**:
  - `*.felixforus.ca` matches `admin.felixforus.ca`, `app.felixforus.ca`
  - `felixforus.ca` matches exactly `felixforus.ca`
- **URL Examples**:
  - `*jquery*` matches any URL containing "jquery"
  - `*.min.js` matches any minified JS file

## 🔍 Multi-URL File Format

Create a text file with URLs (one per line):

```
# Comments start with #
https://bugcrowd.charm.felixforus.ca
https://bugcrowd.lucky.felixforus.ca
https://admin.felixforus.ca

# More URLs
https://app.felixforus.ca
https://api.felixforus.ca
```

## 🔧 Complete CLI Options

```bash
node cli.js [options]

URL Options:
  --url <url>                  Single target URL
  --urls <file>                File containing list of URLs

Filter Options:
  --include-domain <pattern>   Only monitor domains matching pattern
  --exclude-domain <pattern>   Exclude domains matching pattern
  --include-url <pattern>      Only monitor URLs matching pattern
  --exclude-url <pattern>      Exclude URLs matching pattern

Monitoring Options:
  --live                       Enable live monitoring
  --interval <seconds>         Monitoring interval (default: 30)
  --auth                       Enable authentication
  --header <header...>         Custom headers

Output Options:
  --quiet                      Reduce output verbosity
  --no-code-preview           Disable showing new code sections
  --max-lines <number>        Maximum lines per code section (default: 10)

Help:
  -h, --help                   Display help
```

## 📊 Example Output with New Code Preview

```
╭─────────────────────────────────────────────────────────────────────────
│
│  ██╗    ██╗███████╗██████╗ ███╗   ███╗ ██████╗ ███╗   ██╗███╗   ██╗███████╗██████╗ 
│  ██║    ██║██╔════╝██╔══██╗████╗ ████║██╔═══██╗████╗  ██║████╗  ██║██╔════╝██╔══██╗
│  ██║ █╗ ██║█████╗  ██████╔╝██╔████╔██║██║   ██║██╔██╗ ██║██╔██╗ ██║█████╗  ██████╔╝
│  ██║███╗██║██╔══╝  ██╔══██╗██║╚██╔╝██║██║   ██║██║╚██╗██║██║╚██╗██║██╔══╝  ██╔══██╗
│  ╚███╔███╔╝███████╗██████╔╝██║ ╚═╝ ██║╚██████╔╝██║ ╚████║██║ ╚████║███████╗██║  ██║
│   ╚══╝╚══╝ ╚══════╝╚═════╝ ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝
│
│  Professional JavaScript Monitoring Tool
│
╰─────────────────────────────────────────────────────────────────────────

╭─ Configuration
│
│ Target URLs          3
│ Authentication       Enabled
│ Live Mode           Every 60s
│ Custom Headers       0
│ Domain Filter        *.felixforus.ca
│ URL Filter          None
│ Code Preview         Enabled
│ Max Lines           10
╰─────────────────────────────────────────────────────────────────────────

╭─ Starting Web Crawler
│
│ ℹ Processing 3 URL(s)
│
│ [████████████████████] 100% Crawling URLs Processing app.felixforus.ca | 45s elapsed | ETA: 0s
│ ✓ Crawling URLs Complete in 45s

╭─ Scan Complete
│
│ URLs Processed       3
│ JS Files Found       12
│ Files Processed      8
│ Files Filtered       4
│ New Files           2
│ Changed Files        1
│ New Code Sections    6
│ Errors              0
│ Scan Time           10:30:45 AM
╰─────────────────────────────────────────────────────────────────────────
```

## 🎯 Perfect for Your Use Case

**Your requirement: Only monitor `*.felixforus.ca` files and see new code**

```bash
# Single URL with domain filtering and code preview
node cli.js --url https://bugcrowd.charm.felixforus.ca --include-domain "*.felixforus.ca"

# Multiple URLs with domain filtering and custom code preview
node cli.js --urls urls.txt --include-domain "*.felixforus.ca" --max-lines 15

# Live monitoring with domain filtering
node cli.js --urls urls.txt --live --include-domain "*.felixforus.ca" --interval 60
```

This will:
- ✅ Process JS files from `cdn.felixforus.ca`, `admin.felixforus.ca`, etc.
- 🚫 Skip JS files from `google.com`, `facebook.com`, etc.
- 👁️ Show you the exact new/changed JavaScript code
- 📊 Display both original and beautified code changes
- 🔄 Monitor multiple URLs simultaneously
- 💾 Save detailed diff files for later analysis

## 🔒 Security Notes

- Store sensitive credentials securely
- Use environment variables for production
- Respect website terms of service
- Be mindful of rate limiting with live monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License. 