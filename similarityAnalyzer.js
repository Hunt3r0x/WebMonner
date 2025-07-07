import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { log } from './utils.js';

// Extract meaningful code features for similarity analysis
export class CodeSimilarityAnalyzer {
  constructor() {
    this.similarityThreshold = 0.7; // 70% similarity threshold
    this.functionSignatureWeight = 0.4;
    this.importExportWeight = 0.3;
    this.contentHashWeight = 0.3;
  }

  // Extract function signatures from JavaScript code
  extractFunctionSignatures(code) {
    const signatures = new Set();
    
    // Extract function declarations
    const functionDeclarations = code.match(/function\s+(\w+)\s*\([^)]*\)/g);
    if (functionDeclarations) {
      functionDeclarations.forEach(sig => signatures.add(sig.trim()));
    }
    
    // Extract arrow functions assigned to variables
    const arrowFunctions = code.match(/(?:const|let|var)\s+(\w+)\s*=\s*\([^)]*\)\s*=>/g);
    if (arrowFunctions) {
      arrowFunctions.forEach(sig => signatures.add(sig.trim()));
    }
    
    // Extract method definitions
    const methodDefinitions = code.match(/(\w+)\s*\([^)]*\)\s*{/g);
    if (methodDefinitions) {
      methodDefinitions.forEach(sig => signatures.add(sig.trim()));
    }
    
    // Extract class definitions
    const classDefinitions = code.match(/class\s+(\w+)(?:\s+extends\s+\w+)?/g);
    if (classDefinitions) {
      classDefinitions.forEach(sig => signatures.add(sig.trim()));
    }
    
    return Array.from(signatures);
  }

  // Extract import/export statements
  extractImportExports(code) {
    const statements = new Set();
    
    // Extract import statements
    const imports = code.match(/import\s+[^;]+;/g);
    if (imports) {
      imports.forEach(imp => statements.add(imp.trim()));
    }
    
    // Extract export statements
    const exports = code.match(/export\s+[^;]+;?/g);
    if (exports) {
      exports.forEach(exp => statements.add(exp.trim()));
    }
    
    return Array.from(statements);
  }

  // Generate content-based hash (ignoring whitespace and comments)
  generateContentHash(code) {
    // Remove comments and normalize whitespace
    const normalizedCode = code
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .replace(/\/\/.*$/gm, '') // Remove single-line comments
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    return crypto.createHash('sha256').update(normalizedCode).digest('hex');
  }

  // Create a fingerprint for a JavaScript file
  createCodeFingerprint(code) {
    const functionSignatures = this.extractFunctionSignatures(code);
    const importExports = this.extractImportExports(code);
    const contentHash = this.generateContentHash(code);
    
    return {
      functionSignatures: functionSignatures.sort(),
      importExports: importExports.sort(),
      contentHash,
      signatureCount: functionSignatures.length,
      importExportCount: importExports.length,
      codeLength: code.length
    };
  }

  // Calculate similarity between two code fingerprints
  calculateSimilarity(fingerprint1, fingerprint2) {
    // Calculate function signature similarity
    const commonSignatures = fingerprint1.functionSignatures.filter(sig => 
      fingerprint2.functionSignatures.includes(sig)
    );
    const totalSignatures = new Set([
      ...fingerprint1.functionSignatures,
      ...fingerprint2.functionSignatures
    ]).size;
    
    const signatureSimilarity = totalSignatures > 0 ? 
      commonSignatures.length / totalSignatures : 0;

    // Calculate import/export similarity
    const commonImportExports = fingerprint1.importExports.filter(ie => 
      fingerprint2.importExports.includes(ie)
    );
    const totalImportExports = new Set([
      ...fingerprint1.importExports,
      ...fingerprint2.importExports
    ]).size;
    
    const importExportSimilarity = totalImportExports > 0 ? 
      commonImportExports.length / totalImportExports : 0;

    // Content hash similarity (exact match or not)
    const contentSimilarity = fingerprint1.contentHash === fingerprint2.contentHash ? 1 : 0;

    // Calculate weighted similarity score
    const similarity = 
      (signatureSimilarity * this.functionSignatureWeight) +
      (importExportSimilarity * this.importExportWeight) +
      (contentSimilarity * this.contentHashWeight);

    return {
      overall: similarity,
      signatures: signatureSimilarity,
      importExports: importExportSimilarity,
      content: contentSimilarity,
      details: {
        commonSignatures: commonSignatures.length,
        totalSignatures,
        commonImportExports: commonImportExports.length,
        totalImportExports
      }
    };
  }

  // Find potentially renamed files by comparing with existing files
  findPotentialRenames(domain, newFileUrl, newFileContent) {
    const newFingerprint = this.createCodeFingerprint(newFileContent);
    const originalDir = `data/${domain}/original`;
    const fingerprintPath = `data/${domain}/fingerprints.json`;
    
    // Load existing fingerprints
    let existingFingerprints = {};
    if (fs.existsSync(fingerprintPath)) {
      try {
        existingFingerprints = JSON.parse(fs.readFileSync(fingerprintPath, 'utf-8'));
      } catch (error) {
        log.warning(`Failed to load fingerprints for ${domain}: ${error.message}`);
      }
    }

    const potentialMatches = [];

    // Compare against all existing files
    for (const [existingUrl, existingFingerprint] of Object.entries(existingFingerprints)) {
      const similarity = this.calculateSimilarity(newFingerprint, existingFingerprint);
      
      if (similarity.overall >= this.similarityThreshold) {
        potentialMatches.push({
          url: existingUrl,
          similarity: similarity.overall,
          details: similarity,
          fingerprint: existingFingerprint
        });
      }
    }

    // Sort by similarity (highest first)
    potentialMatches.sort((a, b) => b.similarity - a.similarity);

    // Save new fingerprint
    existingFingerprints[newFileUrl] = newFingerprint;
    fs.mkdirSync(path.dirname(fingerprintPath), { recursive: true });
    fs.writeFileSync(fingerprintPath, JSON.stringify(existingFingerprints, null, 2));

    return {
      newFingerprint,
      potentialMatches,
      isLikelyRenamed: potentialMatches.length > 0
    };
  }

  // Analyze all files in a domain for relationships
  analyzeFileRelationships(domain) {
    const originalDir = `data/${domain}/original`;
    const relationshipPath = `data/${domain}/file-relationships.json`;
    
    if (!fs.existsSync(originalDir)) {
      return null;
    }

    const files = fs.readdirSync(originalDir).filter(file => file.endsWith('.js'));
    const relationships = {
      timestamp: new Date().toISOString(),
      domain,
      totalFiles: files.length,
      clusters: [],
      singletons: []
    };

    const fingerprints = {};
    
    // Create fingerprints for all files
    for (const file of files) {
      try {
        const filePath = path.join(originalDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const url = this.decodeFileName(file);
        
        fingerprints[url] = {
          fingerprint: this.createCodeFingerprint(content),
          file,
          filePath
        };
      } catch (error) {
        log.warning(`Failed to analyze ${file}: ${error.message}`);
      }
    }

    // Find clusters of similar files
    const processed = new Set();
    const urls = Object.keys(fingerprints);

    for (let i = 0; i < urls.length; i++) {
      const url1 = urls[i];
      if (processed.has(url1)) continue;

      const cluster = [url1];
      processed.add(url1);

      for (let j = i + 1; j < urls.length; j++) {
        const url2 = urls[j];
        if (processed.has(url2)) continue;

        const similarity = this.calculateSimilarity(
          fingerprints[url1].fingerprint,
          fingerprints[url2].fingerprint
        );

        if (similarity.overall >= this.similarityThreshold) {
          cluster.push(url2);
          processed.add(url2);
        }
      }

      if (cluster.length > 1) {
        relationships.clusters.push({
          urls: cluster,
          similarity: 'high',
          likelyReason: 'renamed_or_moved_files'
        });
      } else {
        relationships.singletons.push(url1);
      }
    }

    // Save relationships
    fs.writeFileSync(relationshipPath, JSON.stringify(relationships, null, 2));
    
    return relationships;
  }

  // Decode the encoded filename back to URL
  decodeFileName(fileName) {
    try {
      // Remove the .js extension first
      const withoutExtension = fileName.replace(/\.js$/, '');
      // Replace underscores with percent signs and decode
      const decoded = decodeURIComponent(withoutExtension.replace(/_/g, '%'));
      return decoded;
    } catch (error) {
      // If decoding fails, return the original filename without extension
      // This handles malformed URLs gracefully
      return fileName.replace(/\.js$/, '');
    }
  }

  // Generate similarity report for a domain
  generateSimilarityReport(domain) {
    const relationships = this.analyzeFileRelationships(domain);
    if (!relationships) return null;

    const reportPath = `data/${domain}/similarity-report.md`;
    const report = [
      `# Code Similarity Analysis for ${domain}`,
      `Generated: ${new Date().toISOString()}`,
      ``,
      `## Summary`,
      `- Total Files: ${relationships.totalFiles}`,
      `- File Clusters: ${relationships.clusters.length}`,
      `- Unique Files: ${relationships.singletons.length}`,
      ``,
      `## File Clusters (Likely Renamed/Moved Files)`,
      `These groups contain files that are very similar and likely represent the same functionality:`,
      ``
    ];

    relationships.clusters.forEach((cluster, index) => {
      report.push(`### Cluster ${index + 1}`);
      report.push(`**Likely Reason:** ${cluster.likelyReason}`);
      report.push(`**Files:**`);
      cluster.urls.forEach(url => {
        report.push(`- \`${url}\``);
      });
      report.push(``);
    });

    if (relationships.singletons.length > 0) {
      report.push(`## Unique Files`);
      report.push(`These files appear to be unique with no similar counterparts:`);
      report.push(``);
      relationships.singletons.forEach(url => {
        report.push(`- \`${url}\``);
      });
    }

    const reportContent = report.join('\n');
    fs.writeFileSync(reportPath, reportContent);
    
    return {
      reportPath,
      relationships,
      summary: {
        totalFiles: relationships.totalFiles,
        clusters: relationships.clusters.length,
        singletons: relationships.singletons.length
      }
    };
  }

  // Clean up old fingerprints for files that no longer exist
  cleanupOldFingerprints(domain) {
    const originalDir = `data/${domain}/original`;
    const fingerprintPath = `data/${domain}/fingerprints.json`;
    
    if (!fs.existsSync(originalDir) || !fs.existsSync(fingerprintPath)) {
      return;
    }

    try {
      const existingFiles = fs.readdirSync(originalDir)
        .filter(file => file.endsWith('.js'))
        .map(file => this.decodeFileName(file));

      const fingerprints = JSON.parse(fs.readFileSync(fingerprintPath, 'utf-8'));
      const updatedFingerprints = {};

      // Keep only fingerprints for files that still exist
      for (const url of existingFiles) {
        if (fingerprints[url]) {
          updatedFingerprints[url] = fingerprints[url];
        }
      }

      fs.writeFileSync(fingerprintPath, JSON.stringify(updatedFingerprints, null, 2));
      
      const removedCount = Object.keys(fingerprints).length - Object.keys(updatedFingerprints).length;
      if (removedCount > 0) {
        log.info(`Cleaned up ${removedCount} old fingerprints for ${domain}`);
      }
    } catch (error) {
      log.warning(`Failed to cleanup fingerprints for ${domain}: ${error.message}`);
    }
  }
}

// Export a default instance
export const codeAnalyzer = new CodeSimilarityAnalyzer(); 