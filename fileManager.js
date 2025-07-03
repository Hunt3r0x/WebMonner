import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import beautify from 'js-beautify';
import { diffLines, createPatch } from 'diff';
import { log, formatFileSize } from './utils.js';
import chalk from 'chalk';

// Extract new/added code sections from diff
function extractNewCode(diff, maxLines = 10) {
  const addedSections = [];
  let currentSection = [];
  let lineNumber = 1;
  
  for (const part of diff) {
    if (part.added) {
      // This is new code
      const lines = part.value.split('\n').filter(line => line.trim() !== '');
      currentSection.push({
        type: 'added',
        lines: lines.slice(0, maxLines),
        lineNumber: lineNumber,
        truncated: lines.length > maxLines
      });
      
      if (currentSection.length > 0) {
        addedSections.push([...currentSection]);
        currentSection = [];
      }
    } else if (part.removed) {
      // This is removed code (for context)
      const lines = part.value.split('\n').filter(line => line.trim() !== '');
      currentSection.push({
        type: 'removed',
        lines: lines.slice(0, 5), // Show fewer removed lines
        lineNumber: lineNumber,
        truncated: lines.length > 5
      });
    } else {
      // Unchanged code (for context)
      const lines = part.value.split('\n').filter(line => line.trim() !== '');
      if (lines.length > 0 && currentSection.length > 0) {
        // Add a bit of context
        currentSection.push({
          type: 'context',
          lines: lines.slice(0, 2),
          lineNumber: lineNumber,
          truncated: lines.length > 2
        });
      }
    }
    
    lineNumber += part.count || 0;
  }
  
  return addedSections;
}

// Display new code sections in a clean format
function displayNewCode(sections, title, options = {}) {
  const { quiet = false, showCodePreview = true } = options;
  
  if (quiet || !showCodePreview || sections.length === 0) return;
  
  log.separator();
  log.info(`${title} - New/Changed Code:`);
  log.separator();
  
  sections.forEach((section, index) => {
    log.muted(`─── Section ${index + 1} ───`);
    
    for (const part of section) {
      for (const line of part.lines) {
        const lineNum = `${part.lineNumber}`.padStart(4, ' ');
        const trimmedLine = line.trim();
        
        if (part.type === 'added') {
          log.muted(`${chalk.green('+')} ${chalk.dim(lineNum)} ${chalk.green(trimmedLine)}`);
        } else if (part.type === 'removed') {
          log.muted(`${chalk.red('-')} ${chalk.dim(lineNum)} ${chalk.red(trimmedLine)}`);
        } else {
          log.muted(`${chalk.dim(' ')} ${chalk.dim(lineNum)} ${chalk.dim(trimmedLine)}`);
        }
      }
      
      if (part.truncated) {
        log.muted(`${chalk.dim('   ...')} ${chalk.dim('(truncated)')}`);
      }
    }
    
    log.muted('');
  });
}

// Save code sections to file for detailed analysis
function saveCodeSections(sections, filePath, title) {
  const content = {
    title,
    timestamp: new Date().toISOString(),
    sections: sections.map(section => 
      section.map(part => ({
        type: part.type,
        lines: part.lines,
        lineNumber: part.lineNumber,
        truncated: part.truncated
      }))
    )
  };
  
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
}

// Save new code sections as readable JavaScript files
function saveNewCodeAsJS(sections, filePath, title) {
  if (sections.length === 0) return null;
  
  // Extract only the added (new) code lines
  const newCodeLines = [];
  let sectionNumber = 1;
  
  sections.forEach(section => {
    // Add section header comment
    newCodeLines.push(`// ===== SECTION ${sectionNumber} =====`);
    newCodeLines.push(`// Extracted from: ${title}`);
    newCodeLines.push(`// Timestamp: ${new Date().toISOString()}`);
    newCodeLines.push('');
    
    for (const part of section) {
      if (part.type === 'added') {
        // Add the actual new code lines
        newCodeLines.push(...part.lines);
        if (part.truncated) {
          newCodeLines.push('// ... (truncated)');
        }
      }
    }
    
    newCodeLines.push('');
    newCodeLines.push('');
    sectionNumber++;
  });
  
  // Save as .js file
  const jsContent = newCodeLines.join('\n');
  fs.writeFileSync(filePath, jsContent);
  
  return filePath;
}

export function saveJSFile(domain, url, buffer, isNewFile = false, options = {}) {
  const { 
    quiet = false, 
    showCodePreview = true, 
    maxLines = 10,
    saveDiff = true,
    maxDiffFiles = 50,
    cleanupOldDiffs = true
  } = options;
  
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  const fileName = encodeURIComponent(url).replace(/%/g, '_');
  const rawPath = `data/${domain}/original/${fileName}.js`;
  const beautifiedPath = `data/${domain}/beautified/${fileName}.js`;
  const diffPath = `data/${domain}/diffs/${fileName}_${timestamp}.diff`;
  const newCodePath = `data/${domain}/new-code/${fileName}_${timestamp}.json`;

  // Create directories
  fs.mkdirSync(path.dirname(rawPath), { recursive: true });
  fs.mkdirSync(path.dirname(beautifiedPath), { recursive: true });
  fs.mkdirSync(path.dirname(diffPath), { recursive: true });
  fs.mkdirSync(path.dirname(newCodePath), { recursive: true });

  // Beautify the content
  const beautified = beautify.js(buffer.toString(), { 
    indent_size: 2,
    preserve_newlines: true,
    max_preserve_newlines: 2,
    wrap_line_length: 80
  });

  // Check if files exist for diff comparison
  let oldRawContent = '';
  let oldBeautifiedContent = '';
  let diffInfo = null;

  if (fs.existsSync(rawPath) && fs.existsSync(beautifiedPath)) {
    oldRawContent = fs.readFileSync(rawPath, 'utf-8');
    oldBeautifiedContent = fs.readFileSync(beautifiedPath, 'utf-8');

    // Generate detailed diff
    const rawDiff = diffLines(oldRawContent, buffer.toString());
    const beautifiedDiff = diffLines(oldBeautifiedContent, beautified);

    // Extract new code sections
    const rawNewCode = extractNewCode(rawDiff, maxLines);
    const beautifiedNewCode = extractNewCode(beautifiedDiff, maxLines);

    // Create comprehensive diff patch
    const rawPatch = createPatch(
      `${fileName}.js (original)`,
      oldRawContent,
      buffer.toString(),
      'Previous version',
      'Current version'
    );

    const beautifiedPatch = createPatch(
      `${fileName}.js (beautified)`,
      oldBeautifiedContent,
      beautified,
      'Previous version',
      'Current version'
    );

    // Count changes
    const rawChanges = rawDiff.filter(part => part.added || part.removed);
    const beautifiedChanges = beautifiedDiff.filter(part => part.added || part.removed);

    diffInfo = {
      timestamp,
      url,
      hash,
      rawChanges: rawChanges.length,
      beautifiedChanges: beautifiedChanges.length,
      totalLines: buffer.toString().split('\n').length,
      addedLines: rawDiff.filter(part => part.added).reduce((sum, part) => sum + part.count, 0),
      removedLines: rawDiff.filter(part => part.removed).reduce((sum, part) => sum + part.count, 0),
      fileSize: buffer.length,
      newCodeSections: {
        raw: rawNewCode.length,
        beautified: beautifiedNewCode.length
      }
    };

    // Save diff files only if enabled
    if (saveDiff) {
      const diffContent = {
        metadata: diffInfo,
        rawPatch,
        beautifiedPatch,
        detailedChanges: {
          raw: rawDiff,
          beautified: beautifiedDiff
        },
        newCodeSections: {
          raw: rawNewCode,
          beautified: beautifiedNewCode
        }
      };

      fs.writeFileSync(diffPath, JSON.stringify(diffContent, null, 2));
      
      // Cleanup old diff files if enabled
      if (cleanupOldDiffs) {
        cleanupOldDiffFiles(domain, maxDiffFiles);
      }
    }
    
    // Save new code as readable JavaScript files only
    const rawJSFile = saveNewCodeAsJS(rawNewCode, newCodePath.replace('.json', '_raw.js'), 'Original JavaScript');
    const beautifiedJSFile = saveNewCodeAsJS(beautifiedNewCode, newCodePath.replace('.json', '_beautified.js'), 'Beautified JavaScript');
    
    // Display new code sections
    if (rawNewCode.length > 0) {
      displayNewCode(rawNewCode, 'Original JavaScript', options);
    }
    
    if (beautifiedNewCode.length > 0) {
      displayNewCode(beautifiedNewCode, 'Beautified JavaScript', options);
    }
    
    // Log detailed changes summary
    if (!quiet) {
      log.separator();
      log.info(`Change Summary`);
      log.muted(`File: ${formatFileSize(diffInfo.fileSize)} | Lines: ${diffInfo.totalLines}`);
      log.muted(`Added: ${diffInfo.addedLines} | Removed: ${diffInfo.removedLines}`);
      log.muted(`New sections: ${diffInfo.newCodeSections.raw} raw, ${diffInfo.newCodeSections.beautified} beautified`);
      log.muted(`Files saved:`);
      if (saveDiff) {
        log.muted(`  • Diff: ${diffPath}`);
      }
      log.muted(`  • Raw JS: ${rawJSFile}`);
      log.muted(`  • Beautified JS: ${beautifiedJSFile}`);
    }
  } else if (isNewFile) {
    if (!quiet) {
      log.info(`New file: ${formatFileSize(buffer.length)} | ${buffer.toString().split('\n').length} lines`);
    }
    
    // Save new file preview as JavaScript
    const previewJSContent = [
      `// ===== NEW FILE PREVIEW =====`,
      `// File: ${url}`,
      `// Timestamp: ${new Date().toISOString()}`,
      `// Size: ${formatFileSize(buffer.length)} | Lines: ${buffer.toString().split('\n').length}`,
      `// This is a preview of the first ${maxLines} lines`,
      ``,
      ...buffer.toString().split('\n').slice(0, maxLines),
      ``,
      `// ... and ${Math.max(0, buffer.toString().split('\n').length - maxLines)} more lines`
    ].join('\n');
    
    const previewJSPath = newCodePath.replace('.json', '_preview.js');
    fs.writeFileSync(previewJSPath, previewJSContent);
    
    // For new files, show a preview of the content
    if (showCodePreview && !quiet) {
      const lines = buffer.toString().split('\n');
      const preview = lines.slice(0, maxLines).map((line, index) => 
        `${String(index + 1).padStart(4, ' ')} ${line.trim()}`
      ).join('\n');
      
      log.separator();
      log.info(`File Preview (first ${maxLines} lines):`);
      log.muted(preview);
      if (lines.length > maxLines) {
        log.muted(`... and ${lines.length - maxLines} more lines`);
      }
      log.muted(`Preview saved: ${previewJSPath}`);
    }
  }

  // Always save current versions
  fs.writeFileSync(rawPath, buffer);
  fs.writeFileSync(beautifiedPath, beautified);

  return { hash, diffInfo };
}

export function compareHashes(oldHash, newHash) {
  return oldHash !== newHash;
}

export function generateChangeReport(domain) {
  const hashPath = `data/${domain}/hashes.json`;
  const reportPath = `data/${domain}/change-report.json`;

  if (!fs.existsSync(hashPath)) {
    return null;
  }

  const hashes = JSON.parse(fs.readFileSync(hashPath, 'utf-8'));
  const report = {
    timestamp: new Date().toISOString(),
    domain,
    totalFiles: Object.keys(hashes).length,
    files: hashes
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return report;
}

// Generate a summary of all new code files for easy access
export function generateNewCodeSummary(domain) {
  const newCodeDir = `data/${domain}/new-code`;
  const summaryPath = `data/${domain}/new-code-summary.md`;
  
  if (!fs.existsSync(newCodeDir)) {
    return null;
  }
  
  const files = fs.readdirSync(newCodeDir);
  const jsFiles = files.filter(file => file.endsWith('.js'));
  
  const summary = [
    `# New Code Summary for ${domain}`,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `## JavaScript Files (Readable Code)`,
    `These files contain the actual new/changed JavaScript code that you can read and analyze:`,
    ``,
    ...jsFiles.map(file => `- [${file}](./new-code/${file})`),
    ``,
    `## Quick Access`,
    `To view the latest changes, look for files with the most recent timestamp.`,
    `Files ending in \`.js\` contain the actual code you can read and run.`,
    `Files ending in \`_preview.js\` are previews of new files.`,
    `Files ending in \`_raw.js\` contain new code in original format.`,
    `Files ending in \`_beautified.js\` contain new code in beautified format.`
  ].join('\n');
  
  fs.writeFileSync(summaryPath, summary);
  return summaryPath;
}

// Cleanup old diff files to save space
function cleanupOldDiffFiles(domain, maxFiles = 50) {
  try {
    const diffDir = `data/${domain}/diffs`;
    if (!fs.existsSync(diffDir)) return;
    
    const files = fs.readdirSync(diffDir)
      .filter(file => file.endsWith('.diff'))
      .map(file => ({
        name: file,
        path: `${diffDir}/${file}`,
        stats: fs.statSync(`${diffDir}/${file}`)
      }))
      .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());
    
    // Keep only the most recent files
    if (files.length > maxFiles) {
      const filesToDelete = files.slice(maxFiles);
      let deletedCount = 0;
      let savedSpace = 0;
      
      filesToDelete.forEach(file => {
        try {
          savedSpace += file.stats.size;
          fs.unlinkSync(file.path);
          deletedCount++;
        } catch (error) {
          // Ignore deletion errors
        }
      });
      
      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} old diff files, saved ${formatFileSize(savedSpace)}`);
      }
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

// Get disk usage statistics for a domain
export function getDomainDiskUsage(domain) {
  try {
    const domainPath = `data/${domain}`;
    if (!fs.existsSync(domainPath)) return null;
    
    let totalSize = 0;
    let fileCount = 0;
    let diffSize = 0;
    let diffCount = 0;
    
    function calculateSize(dir) {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = `${dir}/${item}`;
        const stats = fs.statSync(itemPath);
        
        if (stats.isDirectory()) {
          calculateSize(itemPath);
        } else {
          totalSize += stats.size;
          fileCount++;
          
          if (dir.includes('/diffs/')) {
            diffSize += stats.size;
            diffCount++;
          }
        }
      }
    }
    
    calculateSize(domainPath);
    
    return {
      domain,
      totalSize,
      totalFiles: fileCount,
      diffSize,
      diffFiles: diffCount,
      otherSize: totalSize - diffSize,
      otherFiles: fileCount - diffCount
    };
  } catch (error) {
    return null;
  }
}

// Cleanup all old diff files across all domains
export function cleanupAllOldDiffs(maxFiles = 50) {
  try {
    const dataDir = 'data';
    if (!fs.existsSync(dataDir)) return;
    
    const domains = fs.readdirSync(dataDir).filter(item => 
      fs.statSync(`${dataDir}/${item}`).isDirectory()
    );
    
    let totalDeleted = 0;
    let totalSaved = 0;
    
    domains.forEach(domain => {
      const usage = getDomainDiskUsage(domain);
      if (usage && usage.diffFiles > maxFiles) {
        cleanupOldDiffFiles(domain, maxFiles);
        totalDeleted += usage.diffFiles - maxFiles;
        totalSaved += usage.diffSize;
      }
    });
    
    if (totalDeleted > 0) {
      console.log(`🧹 Global cleanup: Deleted ${totalDeleted} diff files, saved ${formatFileSize(totalSaved)}`);
    }
    
    return { deletedFiles: totalDeleted, savedSpace: totalSaved };
  } catch (error) {
    console.error('Cleanup error:', error.message);
    return null;
  }
} 