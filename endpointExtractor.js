import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { log, formatFileSize } from './utils.js';
import esprima from 'esprima';
import chalk from 'chalk';

class EndpointExtractor {
  constructor() {
    this.endpoints = new Set();
    this.patterns = this.initializePatterns();
    this.confidence = {
      HIGH: 'HIGH',
      MEDIUM: 'MEDIUM', 
      LOW: 'LOW'
    };
  }

  initializePatterns() {
    return {
      // URL patterns with high confidence
      urlPatterns: [
        // API endpoints
        /['"`]\/api\/[^'"`\s]+['"`]/gi,
        /['"`]\/v\d+\/[^'"`\s]+['"`]/gi,
        /['"`]\/api\/v\d+\/[^'"`\s]+['"`]/gi,
        /['"`]\/rest\/[^'"`\s]+['"`]/gi,
        /['"`]\/graphql[^'"`\s]*['"`]/gi,
        
        // Common endpoints
        /['"`]\/auth\/[^'"`\s]+['"`]/gi,
        /['"`]\/user[s]?\/[^'"`\s]+['"`]/gi,
        /['"`]\/admin\/[^'"`\s]+['"`]/gi,
        /['"`]\/dashboard\/[^'"`\s]+['"`]/gi,
        /['"`]\/login[^'"`\s]*['"`]/gi,
        /['"`]\/logout[^'"`\s]*['"`]/gi,
        /['"`]\/register[^'"`\s]*['"`]/gi,
        /['"`]\/signin[^'"`\s]*['"`]/gi,
        /['"`]\/signup[^'"`\s]*['"`]/gi,
        /['"`]\/profile[^'"`\s]*['"`]/gi,
        /['"`]\/settings[^'"`\s]*['"`]/gi,
        /['"`]\/config[^'"`\s]*['"`]/gi,
        /['"`]\/status[^'"`\s]*['"`]/gi,
        /['"`]\/health[^'"`\s]*['"`]/gi,
        /['"`]\/metrics[^'"`\s]*['"`]/gi,
        /['"`]\/debug[^'"`\s]*['"`]/gi,
        
        // Data endpoints
        /['"`]\/data\/[^'"`\s]+['"`]/gi,
        /['"`]\/search[^'"`\s]*['"`]/gi,
        /['"`]\/upload[^'"`\s]*['"`]/gi,
        /['"`]\/download[^'"`\s]*['"`]/gi,
        /['"`]\/export[^'"`\s]*['"`]/gi,
        /['"`]\/import[^'"`\s]*['"`]/gi,
        
        // Generic paths that might be endpoints
        /['"`]\/[a-zA-Z0-9][a-zA-Z0-9_\-\/]*\.[a-zA-Z0-9]+['"`]/gi,
        /['"`]\/[a-zA-Z0-9][a-zA-Z0-9_\-\/]*\/[a-zA-Z0-9][a-zA-Z0-9_\-]*['"`]/gi,
      ],

      // HTTP method patterns
      httpMethodPatterns: [
        /\.get\s*\(\s*['"`]([^'"`]+)['"`]/gi,
        /\.post\s*\(\s*['"`]([^'"`]+)['"`]/gi,
        /\.put\s*\(\s*['"`]([^'"`]+)['"`]/gi,
        /\.patch\s*\(\s*['"`]([^'"`]+)['"`]/gi,
        /\.delete\s*\(\s*['"`]([^'"`]+)['"`]/gi,
        /\.head\s*\(\s*['"`]([^'"`]+)['"`]/gi,
        /\.options\s*\(\s*['"`]([^'"`]+)['"`]/gi,
        /method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)['"`][^}]*url\s*:\s*['"`]([^'"`]+)['"`]/gi,
        /['"`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)['"`][^}]*['"`]([^'"`]+)['"`]/gi,
      ],

      // Fetch/Ajax patterns
      fetchPatterns: [
        /fetch\s*\(\s*['"`]([^'"`]+)['"`]/gi,
        /\$\.ajax\s*\(\s*['"`]([^'"`]+)['"`]/gi,
        /\$\.get\s*\(\s*['"`]([^'"`]+)['"`]/gi,
        /\$\.post\s*\(\s*['"`]([^'"`]+)['"`]/gi,
        /axios\.[a-zA-Z]+\s*\(\s*['"`]([^'"`]+)['"`]/gi,
        /axios\s*\(\s*['"`]([^'"`]+)['"`]/gi,
        /xhr\.open\s*\(\s*['"`][^'"`]+['"`]\s*,\s*['"`]([^'"`]+)['"`]/gi,
        /XMLHttpRequest[^}]*\.open\s*\([^)]*['"`]([^'"`]+)['"`]/gi,
      ],

      // Router patterns
      routerPatterns: [
        /router\.[a-zA-Z]+\s*\(\s*['"`]([^'"`]+)['"`]/gi,
        /app\.[a-zA-Z]+\s*\(\s*['"`]([^'"`]+)['"`]/gi,
        /route\s*:\s*['"`]([^'"`]+)['"`]/gi,
        /path\s*:\s*['"`]([^'"`]+)['"`]/gi,
        /endpoint\s*:\s*['"`]([^'"`]+)['"`]/gi,
      ],

      // WebSocket patterns
      websocketPatterns: [
        /new\s+WebSocket\s*\(\s*['"`]([^'"`]+)['"`]/gi,
        /ws:\/\/[^'"`\s]+/gi,
        /wss:\/\/[^'"`\s]+/gi,
      ],

      // Full URL patterns
      fullUrlPatterns: [
        /https?:\/\/[^'"`\s]+/gi,
        /['"`]https?:\/\/[^'"`\s]+['"`]/gi,
      ],

      // Environment/config patterns
      configPatterns: [
        /API_URL[^'"`]*['"`]([^'"`]+)['"`]/gi,
        /BASE_URL[^'"`]*['"`]([^'"`]+)['"`]/gi,
        /ENDPOINT[^'"`]*['"`]([^'"`]+)['"`]/gi,
        /apiUrl[^'"`]*['"`]([^'"`]+)['"`]/gi,
        /baseUrl[^'"`]*['"`]([^'"`]+)['"`]/gi,
        /endpoint[^'"`]*['"`]([^'"`]+)['"`]/gi,
      ],

      // Dynamic/concatenation patterns (regex approximation)
      dynamicPatterns: [
        // String concatenation patterns
        /['"`]([^'"`]*\/[^'"`]*?)['"`]\s*\+\s*['"`]([^'"`]+?)['"`]/gi,
        /['"`]([^'"`]+?)['"`]\s*\+\s*['"`]([^'"`]*\/[^'"`]*?)['"`]/gi,
        
        // Variable + string patterns (basic detection)
        /\w+\s*\+\s*['"`](\/[^'"`]+?)['"`]/gi,
        /['"`](\/[^'"`]+?)['"`]\s*\+\s*\w+/gi,
        
        // Template literal fragments
        /\$\{[^}]*\}(\/[^'"`\s}]+)/gi,
        /(\/[^'"`\s{]+)\$\{[^}]*\}/gi,
        
        // Common URL building patterns
        /const\s+\w+\s*=\s*['"`]([^'"`]*\/[^'"`]+?)['"`]/gi,
        /let\s+\w+\s*=\s*['"`]([^'"`]*\/[^'"`]+?)['"`]/gi,
        /var\s+\w+\s*=\s*['"`]([^'"`]*\/[^'"`]+?)['"`]/gi,
      ],

      // Obfuscated/split patterns
      obfuscatedPatterns: [
        // Split strings that might be endpoints
        /['"`]([^'"`]{2,}?)['"`]\s*\+\s*['"`]([^'"`]{2,}?)['"`]/gi,
        
        // Property access patterns that might build URLs
        /\.\w+\s*\+\s*['"`](\/[^'"`]+?)['"`]/gi,
        /['"`](\/[^'"`]+?)['"`]\s*\+\s*\.\w+/gi,
        
        // Array join patterns for URL building
        /\[[^\]]*['"`]([^'"`]*\/[^'"`]+?)['"`][^\]]*\]\.join\(/gi,
      ]
    };
  }

  // Extract endpoints from JavaScript content
  extractEndpoints(content, fileUrl) {
    const endpoints = new Map();
    const lines = content.split('\n');
    
    // Method 1: Regex-based extraction
    this.extractWithRegex(content, fileUrl, endpoints);
    
    // Method 2: AST-based extraction (more accurate)
    this.extractWithAST(content, fileUrl, endpoints);
    
    // Method 3: Line-by-line context analysis
    this.extractWithLineAnalysis(lines, fileUrl, endpoints);
    
    // Deduplicate endpoints by URL (keep highest confidence)
    return this.deduplicateEndpoints(Array.from(endpoints.values()));
  }

  // Deduplicate endpoints by URL, keeping the highest confidence version
  deduplicateEndpoints(endpoints) {
    const urlMap = new Map();
    const confidenceOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    
    endpoints.forEach(endpoint => {
      const existing = urlMap.get(endpoint.url);
      if (!existing) {
        urlMap.set(endpoint.url, endpoint);
      } else {
        // Keep the endpoint with higher confidence
        const existingScore = confidenceOrder[existing.confidence] || 0;
        const newScore = confidenceOrder[endpoint.confidence] || 0;
        
        if (newScore > existingScore) {
          urlMap.set(endpoint.url, endpoint);
        } else if (newScore === existingScore) {
          // If same confidence, prefer network calls over static patterns
          const preferredCategories = ['network_call', 'network_call_resolved', 'fetchPatterns'];
          if (preferredCategories.includes(endpoint.category) && 
              !preferredCategories.includes(existing.category)) {
            urlMap.set(endpoint.url, endpoint);
          }
        }
      }
    });
    
    return Array.from(urlMap.values());
  }

  extractWithRegex(content, fileUrl, endpoints) {
    // Extract URLs with different patterns
    Object.entries(this.patterns).forEach(([category, patterns]) => {
      patterns.forEach(pattern => {
        let matches;
        const globalPattern = new RegExp(pattern.source, 'gi');
        
        while ((matches = globalPattern.exec(content)) !== null) {
          // Handle different match groups for different pattern types
          let endpoint = null;
          
          if (category === 'dynamicPatterns' && matches.length > 2) {
            // For concatenation patterns, try to combine the parts
            const part1 = this.cleanEndpoint(matches[1] || '');
            const part2 = this.cleanEndpoint(matches[2] || '');
            if (part1 && part2) {
              endpoint = part1 + part2;
            }
          } else if (category === 'obfuscatedPatterns' && matches.length > 2) {
            // For obfuscated patterns, try to combine parts intelligently
            const part1 = this.cleanEndpoint(matches[1] || '');
            const part2 = this.cleanEndpoint(matches[2] || '');
            if (part1 && part2) {
              // Check if they form a valid endpoint when combined
              const combined = part1 + part2;
              if (this.isValidEndpoint(combined)) {
                endpoint = combined;
              } else if (this.isValidEndpoint(part1)) {
                endpoint = part1;
              } else if (this.isValidEndpoint(part2)) {
                endpoint = part2;
              }
            }
          } else {
            // Standard single match extraction
            endpoint = this.cleanEndpoint(matches[1] || matches[0]);
          }
          
          if (endpoint && this.isValidEndpoint(endpoint)) {
            const key = `${endpoint}_${category}_${matches.index}`;
            if (!endpoints.has(key)) {
              endpoints.set(key, {
                url: endpoint,
                source: fileUrl,
                method: this.detectHttpMethod(content, matches.index),
                category: category,
                confidence: this.calculateConfidence(endpoint, category, content, matches.index),
                context: this.extractContext(content, matches.index),
                line: this.getLineNumber(content, matches.index),
                extractionMethod: 'regex'
              });
            }
          }
        }
      });
    });
  }

  extractWithAST(content, fileUrl, endpoints) {
    try {
      const ast = esprima.parseScript(content, { 
        loc: true,
        range: true,
        tolerant: true 
      });
      
      // Initialize variables map for this extraction
      this.variables = this.variables || new Map();
      this.variables.clear();
      
      // First pass: collect variable assignments and constants
      this.collectVariables(ast, content);
      
      // Second pass: traverse and extract endpoints with variable resolution
      this.traverseAST(ast, content, fileUrl, endpoints);
    } catch (error) {
      // AST parsing failed, continue with regex only
      if (process.env.DEBUG) {
        console.log(`AST parsing failed for ${fileUrl}: ${error.message}`);
      }
    }
  }

  // Collect variable assignments that might contain URL parts
  collectVariables(node, content) {
    if (!node || typeof node !== 'object') return;
    
    // Variable declarations: const api = '/api/users'
    if (node.type === 'VariableDeclaration') {
      node.declarations.forEach(decl => {
        if (decl.id && decl.id.name && decl.init) {
          if (decl.init.type === 'Literal' && typeof decl.init.value === 'string') {
            this.variables.set(decl.id.name, {
              type: 'literal',
              value: decl.init.value,
              line: decl.loc ? decl.loc.start.line : 0
            });
          } else if (decl.init.type === 'TemplateLiteral') {
            const templateValue = this.reconstructTemplate(decl.init);
            if (templateValue) {
              this.variables.set(decl.id.name, {
                type: 'template',
                value: templateValue,
                line: decl.loc ? decl.loc.start.line : 0
              });
            }
          } else if (decl.init.type === 'BinaryExpression' && decl.init.operator === '+') {
            const concatenated = this.resolveBinaryExpression(decl.init);
            if (concatenated) {
              this.variables.set(decl.id.name, {
                type: 'concatenation',
                value: concatenated,
                line: decl.loc ? decl.loc.start.line : 0
              });
            }
          }
        }
      });
    }
    
    // Property assignments: config.apiUrl = '/api'
    if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression') {
      const propertyName = this.getMemberExpressionName(node.left);
      if (propertyName && node.right) {
        if (node.right.type === 'Literal' && typeof node.right.value === 'string') {
          this.variables.set(propertyName, {
            type: 'property',
            value: node.right.value,
            line: node.loc ? node.loc.start.line : 0
          });
        }
      }
    }
    
    // Recursively traverse
    for (const key in node) {
      if (key !== 'parent' && node[key] && typeof node[key] === 'object') {
        if (Array.isArray(node[key])) {
          node[key].forEach(child => this.collectVariables(child, content));
        } else {
          this.collectVariables(node[key], content);
        }
      }
    }
  }

  // Resolve binary expressions (string concatenation)
  resolveBinaryExpression(node) {
    if (!node || node.type !== 'BinaryExpression' || node.operator !== '+') {
      return null;
    }
    
    const left = this.resolveValue(node.left);
    const right = this.resolveValue(node.right);
    
    if (left !== null && right !== null) {
      return String(left) + String(right);
    }
    
    return null;
  }
  
  // Resolve a node value (literal, variable, or expression)
  resolveValue(node) {
    if (!node) return null;
    
    if (node.type === 'Literal') {
      return node.value;
    }
    
    if (node.type === 'Identifier') {
      const variable = this.variables && this.variables.get(node.name);
      return variable ? variable.value : null;
    }
    
    if (node.type === 'BinaryExpression' && node.operator === '+') {
      return this.resolveBinaryExpression(node);
    }
    
    if (node.type === 'TemplateLiteral') {
      return this.reconstructTemplateWithVariables(node);
    }
    
    if (node.type === 'MemberExpression') {
      const memberName = this.getMemberExpressionName(node);
      if (memberName && this.variables) {
        const variable = this.variables.get(memberName);
        return variable ? variable.value : null;
      }
    }
    
    return null;
  }
  
  // Get member expression name (e.g., config.api.url -> config.api.url)
  getMemberExpressionName(node) {
    if (!node || node.type !== 'MemberExpression') return null;
    
    const parts = [];
    let current = node;
    
    while (current) {
      if (current.type === 'MemberExpression') {
        if (current.property && current.property.name) {
          parts.unshift(current.property.name);
        }
        current = current.object;
      } else if (current.type === 'Identifier') {
        parts.unshift(current.name);
        break;
      } else {
        break;
      }
    }
    
    return parts.length > 0 ? parts.join('.') : null;
  }

  traverseAST(node, content, fileUrl, endpoints) {
    if (!node || typeof node !== 'object') return;
    
    // Check for string literals that might be endpoints
    if (node.type === 'Literal' && typeof node.value === 'string') {
      const endpoint = this.cleanEndpoint(node.value);
      if (this.isValidEndpoint(endpoint)) {
        const key = `${endpoint}_ast_literal`;
        if (!endpoints.has(key)) {
          endpoints.set(key, {
            url: endpoint,
            source: fileUrl,
            method: 'UNKNOWN',
            category: 'ast_literal',
            confidence: this.calculateConfidence(endpoint, 'ast_literal', content, node.range[0]),
            context: this.extractContext(content, node.range[0]),
            line: node.loc ? node.loc.start.line : 0,
            extractionMethod: 'ast'
          });
        }
      }
    }
    
    // Check for template literals with variable resolution
    if (node.type === 'TemplateLiteral') {
      const templateValue = this.reconstructTemplateWithVariables(node);
      if (templateValue && this.isValidEndpoint(templateValue)) {
        const key = `${templateValue}_template`;
        if (!endpoints.has(key)) {
          endpoints.set(key, {
            url: templateValue,
            source: fileUrl,
            method: 'UNKNOWN',
            category: 'template_literal_resolved',
            confidence: this.calculateConfidence(templateValue, 'template_literal_resolved', content, node.range[0]),
            context: this.extractContext(content, node.range[0]),
            line: node.loc ? node.loc.start.line : 0,
            extractionMethod: 'ast'
          });
        }
      }
    }
    
    // Check for binary expressions (string concatenation)
    if (node.type === 'BinaryExpression' && node.operator === '+') {
      const concatenated = this.resolveBinaryExpression(node);
      if (concatenated && this.isValidEndpoint(concatenated)) {
        const key = `${concatenated}_concatenation`;
        if (!endpoints.has(key)) {
          endpoints.set(key, {
            url: concatenated,
            source: fileUrl,
            method: 'UNKNOWN',
            category: 'string_concatenation',
            confidence: this.calculateConfidence(concatenated, 'string_concatenation', content, node.range[0]),
            context: this.extractContext(content, node.range[0]),
            line: node.loc ? node.loc.start.line : 0,
            extractionMethod: 'ast'
          });
        }
      }
    }
    
    // Check for function calls (fetch, axios, etc.)
    if (node.type === 'CallExpression') {
      this.extractFromCallExpression(node, content, fileUrl, endpoints);
    }
    
    // Check for assignment expressions that might build URLs
    if (node.type === 'AssignmentExpression') {
      const resolved = this.resolveValue(node.right);
      if (resolved && this.isValidEndpoint(resolved)) {
        const key = `${resolved}_assignment`;
        if (!endpoints.has(key)) {
          endpoints.set(key, {
            url: resolved,
            source: fileUrl,
            method: 'UNKNOWN',
            category: 'variable_assignment',
            confidence: this.calculateConfidence(resolved, 'variable_assignment', content, node.range[0]),
            context: this.extractContext(content, node.range[0]),
            line: node.loc ? node.loc.start.line : 0,
            extractionMethod: 'ast'
          });
        }
      }
    }
    
    // Recursively traverse child nodes
    for (const key in node) {
      if (key !== 'parent' && node[key] && typeof node[key] === 'object') {
        if (Array.isArray(node[key])) {
          node[key].forEach(child => this.traverseAST(child, content, fileUrl, endpoints));
        } else {
          this.traverseAST(node[key], content, fileUrl, endpoints);
        }
      }
    }
  }

  extractFromCallExpression(node, content, fileUrl, endpoints) {
    const callee = node.callee;
    let methodName = '';
    
    if (callee.type === 'MemberExpression') {
      methodName = callee.property.name;
    } else if (callee.type === 'Identifier') {
      methodName = callee.name;
    }
    
    // Check if this is a network call
    const networkMethods = ['fetch', 'get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'ajax'];
    if (networkMethods.includes(methodName.toLowerCase())) {
      const firstArg = node.arguments[0];
      if (firstArg) {
        // Try to resolve the URL from various node types
        const endpoint = this.resolveValue(firstArg);
        if (endpoint && this.isValidEndpoint(endpoint)) {
          const key = `${endpoint}_${methodName}_resolved`;
          if (!endpoints.has(key)) {
            endpoints.set(key, {
              url: endpoint,
              source: fileUrl,
              method: methodName.toUpperCase(),
              category: 'network_call_resolved',
              confidence: this.confidence.HIGH,
              context: this.extractContext(content, firstArg.range[0]),
              line: firstArg.loc ? firstArg.loc.start.line : 0,
              extractionMethod: 'ast'
            });
          }
        }
        
        // Also handle direct literals (fallback)
        if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
          const directEndpoint = this.cleanEndpoint(firstArg.value);
          if (this.isValidEndpoint(directEndpoint)) {
            const key = `${directEndpoint}_${methodName}_literal`;
            if (!endpoints.has(key)) {
              endpoints.set(key, {
                url: directEndpoint,
                source: fileUrl,
                method: methodName.toUpperCase(),
                category: 'network_call',
                confidence: this.confidence.HIGH,
                context: this.extractContext(content, firstArg.range[0]),
                line: firstArg.loc ? firstArg.loc.start.line : 0,
                extractionMethod: 'ast'
              });
            }
          }
        }
      }
    }
  }

  // Enhanced template reconstruction with variable resolution
  reconstructTemplateWithVariables(node) {
    if (!node.quasis || !node.expressions) return null;
    
    let result = '';
    for (let i = 0; i < node.quasis.length; i++) {
      result += node.quasis[i].value.cooked || node.quasis[i].value.raw;
      if (i < node.expressions.length) {
        const expression = node.expressions[i];
        const resolved = this.resolveValue(expression);
        if (resolved && typeof resolved === 'string') {
          result += resolved;
        } else {
          // If we can't resolve, use a placeholder but still mark as potentially valid
          result += '${...}';
        }
      }
    }
    
    return result;
  }

  extractWithLineAnalysis(lines, fileUrl, endpoints) {
    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      
      // Skip comments and empty lines
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || !trimmedLine) {
        return;
      }
      
      // Look for URL-like patterns in context
      const urlPatterns = [
        /['"`]([^'"`]*\/[^'"`\s]*\.[^'"`\s]*?)['"`]/g,
        /['"`](\/[^'"`\s]*\/[^'"`\s]*?)['"`]/g,
        /(['"`])(https?:\/\/[^'"`\s]+)\1/g
      ];
      
      urlPatterns.forEach(pattern => {
        let matches;
        while ((matches = pattern.exec(trimmedLine)) !== null) {
          const endpoint = this.cleanEndpoint(matches[1] || matches[2]);
          if (this.isValidEndpoint(endpoint)) {
            const key = `${endpoint}_line_${index}`;
            if (!endpoints.has(key)) {
              endpoints.set(key, {
                url: endpoint,
                source: fileUrl,
                method: this.detectHttpMethodFromLine(trimmedLine),
                category: 'line_analysis',
                confidence: this.calculateConfidence(endpoint, 'line_analysis', trimmedLine, 0),
                context: trimmedLine,
                line: index + 1,
                extractionMethod: 'line_analysis'
              });
            }
          }
        }
      });
    });
  }

  cleanEndpoint(endpoint) {
    if (!endpoint) return '';
    
    // Remove quotes and whitespace
    endpoint = endpoint.replace(/^['"`]|['"`]$/g, '').trim();
    
    // Remove trailing commas, semicolons, etc.
    endpoint = endpoint.replace(/[,;)}\]]+$/, '');
    
    return endpoint;
  }

  isValidEndpoint(endpoint) {
    if (!endpoint || typeof endpoint !== 'string') return false;
    
    // Minimum length check
    if (endpoint.length < 2) return false;
    
    // Skip obviously invalid patterns
    const invalidPatterns = [
      /^[a-zA-Z]$/, // Single letters
      /^[0-9]+$/, // Just numbers
      /^[^a-zA-Z0-9\/]/, // Starts with special chars (except /)
      /^(true|false|null|undefined)$/i, // Boolean/null values
      /^[a-zA-Z]{1,2}$/, // Very short strings
      /^(var|let|const|function|return|if|else|for|while|class)$/i, // JavaScript keywords
      /^[\s\n\r\t]+$/, // Only whitespace
      /^['"`,;(){}[\]]+$/, // Only punctuation
    ];
    
    if (invalidPatterns.some(pattern => pattern.test(endpoint))) {
      return false;
    }
    
    // Valid patterns (expanded to catch more dynamic URLs)
    const validPatterns = [
      /^\/[a-zA-Z0-9]/, // Starts with /
      /^https?:\/\//, // Full URL
      /^ws[s]?:\/\//, // WebSocket URL
      /\.[a-zA-Z0-9]+$/, // Ends with file extension
      /\/[a-zA-Z0-9]/, // Contains /
      /^[a-zA-Z0-9][a-zA-Z0-9._-]*\//, // Domain-like start with /
      /api|graphql|rest|auth|login|admin|dashboard|config|upload|download|data|users?|profile|settings/i, // Contains endpoint keywords
      /\$\{[^}]*\}/, // Template literal placeholder
      /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._/-]+/, // Path-like structure
    ];
    
    return validPatterns.some(pattern => pattern.test(endpoint));
  }

  detectHttpMethod(content, index) {
    const contextStart = Math.max(0, index - 100);
    const contextEnd = Math.min(content.length, index + 100);
    const context = content.slice(contextStart, contextEnd).toLowerCase();
    
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
    for (const method of methods) {
      if (context.includes(method)) {
        return method.toUpperCase();
      }
    }
    
    return 'UNKNOWN';
  }

  detectHttpMethodFromLine(line) {
    const lowerLine = line.toLowerCase();
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
    
    for (const method of methods) {
      if (lowerLine.includes(method)) {
        return method.toUpperCase();
      }
    }
    
    return 'UNKNOWN';
  }

  calculateConfidence(endpoint, category, content, index) {
    let score = 0;
    
    // Category-based scoring
    const categoryScores = {
      'urlPatterns': 3,
      'httpMethodPatterns': 4,
      'fetchPatterns': 5,
      'routerPatterns': 4,
      'websocketPatterns': 5,
      'fullUrlPatterns': 5,
      'configPatterns': 3,
      'dynamicPatterns': 4,
      'obfuscatedPatterns': 3,
      'network_call': 5,
      'network_call_resolved': 5,
      'ast_literal': 2,
      'template_literal': 3,
      'template_literal_resolved': 4,
      'string_concatenation': 4,
      'variable_assignment': 3,
      'line_analysis': 1
    };
    
    score += categoryScores[category] || 1;
    
    // Endpoint pattern scoring
    if (endpoint.startsWith('/api/')) score += 3;
    if (endpoint.startsWith('/v') && /\/v\d+/.test(endpoint)) score += 2;
    if (endpoint.includes('graphql')) score += 2;
    if (endpoint.startsWith('http')) score += 2;
    if (endpoint.startsWith('ws')) score += 2;
    if (endpoint.includes('auth')) score += 1;
    if (endpoint.includes('user')) score += 1;
    if (endpoint.includes('admin')) score += 1;
    
    // Context scoring
    const context = this.extractContext(content, index).toLowerCase();
    if (context.includes('fetch')) score += 2;
    if (context.includes('axios')) score += 2;
    if (context.includes('ajax')) score += 2;
    if (context.includes('request')) score += 1;
    if (context.includes('url')) score += 1;
    
    // Convert to confidence level
    if (score >= 8) return this.confidence.HIGH;
    if (score >= 4) return this.confidence.MEDIUM;
    return this.confidence.LOW;
  }

  extractContext(content, index) {
    const contextStart = Math.max(0, index - 50);
    const contextEnd = Math.min(content.length, index + 50);
    return content.slice(contextStart, contextEnd).replace(/\s+/g, ' ').trim();
  }

  getLineNumber(content, index) {
    return content.slice(0, index).split('\n').length;
  }

  reconstructTemplate(node) {
    if (!node.quasis || !node.expressions) return null;
    
    let result = '';
    for (let i = 0; i < node.quasis.length; i++) {
      result += node.quasis[i].value.cooked || node.quasis[i].value.raw;
      if (i < node.expressions.length) {
        result += '${...}'; // Placeholder for expressions
      }
    }
    
    return result;
  }
}

// Save endpoints to organized files with size management
export function saveEndpoints(domain, fileUrl, endpoints, options = {}) {
  const { 
    quiet = false, 
    debug = false,
    maxEndpointsPerDomain = 1000,
    maxFilesPerDomain = 100
  } = options;
  
  if (!endpoints || endpoints.length === 0) {
    return { saved: false, count: 0, newCount: 0, summary: { total: 0, high_confidence: 0, medium_confidence: 0, low_confidence: 0, by_method: {}, by_category: {} } };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = encodeURIComponent(fileUrl).replace(/%/g, '_');
  
  // Create directory structure
  const endpointsDir = `data/${domain}/endpoints`;
  const allEndpointsPath = `data/${domain}/endpoints/all-endpoints.json`;
  const fileEndpointsPath = `data/${domain}/endpoints/${fileName}_${timestamp}.json`;
  const summaryPath = `data/${domain}/endpoints/summary.json`;
  
  fs.mkdirSync(endpointsDir, { recursive: true });
  
  // Load existing endpoints
  let allEndpoints = [];
  if (fs.existsSync(allEndpointsPath)) {
    try {
      allEndpoints = JSON.parse(fs.readFileSync(allEndpointsPath, 'utf-8'));
    } catch (error) {
      allEndpoints = [];
    }
  }
  
  // Prepare new endpoints with metadata (optimized storage)
  const newEndpoints = endpoints.map(endpoint => ({
    url: endpoint.url,
    method: endpoint.method,
    confidence: endpoint.confidence,
    category: endpoint.category,
    source: path.basename(endpoint.source), // Store only filename, not full path
    line: endpoint.line,
    timestamp: new Date().toISOString(),
    hash: crypto.createHash('sha256').update(endpoint.url).digest('hex').substring(0, 16)
  }));
  
  // Simple approach: Compare against all stored endpoints
  const existingDomainUrls = new Set(allEndpoints.map(ep => ep.url));
  const genuinelyNewEndpoints = newEndpoints.filter(ep => !existingDomainUrls.has(ep.url));
  
  // Check storage limits
  const totalAfterAdd = allEndpoints.length + genuinelyNewEndpoints.length;
  if (totalAfterAdd > maxEndpointsPerDomain) {
    // Remove oldest endpoints to make room
    const excessCount = totalAfterAdd - maxEndpointsPerDomain;
    allEndpoints.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    allEndpoints.splice(0, excessCount);
    
    if (debug) {
      console.log(`[STORAGE] Trimmed ${excessCount} oldest endpoints to maintain limit of ${maxEndpointsPerDomain}`);
    }
  }
  
  // Clean up old per-file endpoint files
  cleanupOldEndpointFiles(domain, maxFilesPerDomain);
  
  // Prepare file-specific endpoints data
  let fileEndpointsData = null;
  if (newEndpoints.length > 0) {
    fileEndpointsData = {
      fileUrl: path.basename(fileUrl), // Store only filename
      domain,
      timestamp: new Date().toISOString(),
      endpoints: newEndpoints.slice(0, 50), // Limit per-file storage
      summary: {
        total: newEndpoints.length,
        high_confidence: newEndpoints.filter(ep => ep.confidence === 'HIGH').length,
        medium_confidence: newEndpoints.filter(ep => ep.confidence === 'MEDIUM').length,
        low_confidence: newEndpoints.filter(ep => ep.confidence === 'LOW').length,
        by_method: newEndpoints.reduce((acc, ep) => {
          acc[ep.method] = (acc[ep.method] || 0) + 1;
          return acc;
        }, {}),
        by_category: newEndpoints.reduce((acc, ep) => {
          acc[ep.category] = (acc[ep.category] || 0) + 1;
          return acc;
        }, {})
      }
    };
    
    // Save file-specific endpoints (only if we have new endpoints)
    fs.writeFileSync(fileEndpointsPath, JSON.stringify(fileEndpointsData, null, 2));
  }
  
  // Update all endpoints with new ones
  allEndpoints.push(...genuinelyNewEndpoints);
  fs.writeFileSync(allEndpointsPath, JSON.stringify(allEndpoints, null, 2));
  
  // Create simple text file with all endpoints (last line = newest endpoint)
  createEndpointsTextFile(domain, allEndpoints);
  
  // Clean up unnecessary files
  cleanupUnnecessaryFiles(domain, debug);
  
  // Update summary
  const summary = {
    domain,
    lastUpdated: new Date().toISOString(),
    totalEndpoints: allEndpoints.length,
    totalFiles: fs.readdirSync(endpointsDir).filter(f => f.endsWith('.json') && f !== 'all-endpoints.json' && f !== 'summary.json').length,
    endpoints: {
      high_confidence: allEndpoints.filter(ep => ep.confidence === 'HIGH').length,
      medium_confidence: allEndpoints.filter(ep => ep.confidence === 'MEDIUM').length,
      low_confidence: allEndpoints.filter(ep => ep.confidence === 'LOW').length,
    },
    methods: allEndpoints.reduce((acc, ep) => {
      acc[ep.method] = (acc[ep.method] || 0) + 1;
      return acc;
    }, {}),
    categories: allEndpoints.reduce((acc, ep) => {
      acc[ep.category] = (acc[ep.category] || 0) + 1;
      return acc;
    }, {})
  };
  
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  
  return {
    saved: true,
    count: newEndpoints.length,
    newCount: genuinelyNewEndpoints.length,
    filePath: newEndpoints.length > 0 ? fileEndpointsPath : null,
    summary: fileEndpointsData ? fileEndpointsData.summary : {
      total: 0,
      high_confidence: 0,
      medium_confidence: 0,
      low_confidence: 0,
      by_method: {},
      by_category: {}
    }
  };
}

// Generate readable endpoint report
export function generateEndpointReport(domain, options = {}) {
  const { quiet = false } = options;
  
  const endpointsDir = `data/${domain}/endpoints`;
  const allEndpointsPath = `data/${domain}/endpoints/all-endpoints.json`;
  const reportPath = `data/${domain}/endpoints/endpoint-report.md`;
  
  if (!fs.existsSync(allEndpointsPath)) {
    return null;
  }
  
  const allEndpoints = JSON.parse(fs.readFileSync(allEndpointsPath, 'utf-8'));
  
  // Group endpoints by confidence and method
  const byConfidence = allEndpoints.reduce((acc, ep) => {
    acc[ep.confidence] = acc[ep.confidence] || [];
    acc[ep.confidence].push(ep);
    return acc;
  }, {});
  
  const byMethod = allEndpoints.reduce((acc, ep) => {
    acc[ep.method] = acc[ep.method] || [];
    acc[ep.method].push(ep);
    return acc;
  }, {});
  
  // Generate markdown report
  const report = [
    `# Endpoint Report for ${domain}`,
    `Generated: ${new Date().toISOString()}`,
    `Total Endpoints: ${allEndpoints.length}`,
    ``,
    `## Summary`,
    ``,
    `### By Confidence Level`,
    `- **High Confidence**: ${byConfidence.HIGH?.length || 0} endpoints`,
    `- **Medium Confidence**: ${byConfidence.MEDIUM?.length || 0} endpoints`, 
    `- **Low Confidence**: ${byConfidence.LOW?.length || 0} endpoints`,
    ``,
    `### By HTTP Method`,
    ...Object.entries(byMethod).map(([method, endpoints]) => 
      `- **${method}**: ${endpoints.length} endpoints`
    ),
    ``,
    `## High Confidence Endpoints`,
    `These endpoints are very likely to be real API endpoints:`,
    ``,
    ...(byConfidence.HIGH || []).map(ep => 
      `- \`${ep.method}\` **${ep.url}** (from \`${path.basename(ep.source)}\`)`
    ),
    ``,
    `## Medium Confidence Endpoints`,
    `These endpoints are likely to be real but may need verification:`,
    ``,
    ...(byConfidence.MEDIUM || []).map(ep => 
      `- \`${ep.method}\` **${ep.url}** (from \`${path.basename(ep.source)}\`)`
    ),
    ``,
    `## All Endpoints by Category`,
    ``,
    ...Object.entries(
      allEndpoints.reduce((acc, ep) => {
        acc[ep.category] = acc[ep.category] || [];
        acc[ep.category].push(ep);
        return acc;
      }, {})
    ).map(([category, endpoints]) => [
      `### ${category.replace(/_/g, ' ').toUpperCase()}`,
      ...endpoints.map(ep => `- \`${ep.method}\` **${ep.url}** (${ep.confidence})`),
      ``
    ]).flat()
  ].join('\n');
  
  fs.writeFileSync(reportPath, report);
  
  return {
    reportPath,
    totalEndpoints: allEndpoints.length,
    byConfidence,
    byMethod
  };
}

// Cleanup old endpoint files to prevent excessive disk usage
function cleanupOldEndpointFiles(domain, maxFiles = 100) {
  try {
    const endpointsDir = `data/${domain}/endpoints`;
    if (!fs.existsSync(endpointsDir)) return;
    
    const files = fs.readdirSync(endpointsDir)
      .filter(file => file.endsWith('.json') && !['all-endpoints.json', 'summary.json'].includes(file))
      .map(file => ({
        name: file,
        path: `${endpointsDir}/${file}`,
        stats: fs.statSync(`${endpointsDir}/${file}`)
      }))
      .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime()); // Newest first
    
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
        console.log(`[CLEANUP] Removed ${deletedCount} old endpoint files, freed ${formatFileSize(savedSpace)}`);
      }
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

// Get endpoint storage statistics
export function getEndpointStorageStats(domain) {
  try {
    const endpointsDir = `data/${domain}/endpoints`;
    if (!fs.existsSync(endpointsDir)) return null;
    
    let totalSize = 0;
    let fileCount = 0;
    
    const files = fs.readdirSync(endpointsDir);
    files.forEach(file => {
      const filePath = `${endpointsDir}/${file}`;
      const stats = fs.statSync(filePath);
      totalSize += stats.size;
      fileCount++;
    });
    
    // Count total endpoints
    const allEndpointsPath = `${endpointsDir}/all-endpoints.json`;
    let endpointCount = 0;
    if (fs.existsSync(allEndpointsPath)) {
      try {
        const allEndpoints = JSON.parse(fs.readFileSync(allEndpointsPath, 'utf-8'));
        endpointCount = allEndpoints.length;
      } catch (error) {
        // Ignore parsing errors
      }
    }
    
    return {
      domain,
      totalSize,
      fileCount,
      endpointCount,
      averageEndpointSize: endpointCount > 0 ? Math.round(totalSize / endpointCount) : 0
    };
  } catch (error) {
    return null;
  }
}

// Clean up all endpoint data for all domains
export function cleanupAllEndpointData(options = {}) {
  const { maxEndpointsPerDomain = 1000, maxFilesPerDomain = 100, quiet = false, debug = false } = options;
  
  try {
    const dataDir = 'data';
    if (!fs.existsSync(dataDir)) return null;
    
    const domains = fs.readdirSync(dataDir).filter(item => 
      fs.statSync(`${dataDir}/${item}`).isDirectory() && 
      fs.existsSync(`${dataDir}/${item}/endpoints`)
    );
    
    let totalCleaned = 0;
    let totalSpaceSaved = 0;
    
    domains.forEach(domain => {
      const stats = getEndpointStorageStats(domain);
      if (stats) {
        const sizeBefore = stats.totalSize;
        cleanupOldEndpointFiles(domain, maxFilesPerDomain);
        
        // Also cleanup excessive endpoints in all-endpoints.json
        const allEndpointsPath = `data/${domain}/endpoints/all-endpoints.json`;
        if (fs.existsSync(allEndpointsPath)) {
          try {
            const allEndpoints = JSON.parse(fs.readFileSync(allEndpointsPath, 'utf-8'));
            if (allEndpoints.length > maxEndpointsPerDomain) {
              // Keep only the most recent endpoints
              allEndpoints.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
              const trimmed = allEndpoints.slice(0, maxEndpointsPerDomain);
              fs.writeFileSync(allEndpointsPath, JSON.stringify(trimmed, null, 2));
              
              if (debug) {
                console.log(`[STORAGE] Trimmed ${domain} endpoints from ${allEndpoints.length} to ${maxEndpointsPerDomain}`);
              }
            }
          } catch (error) {
            // Ignore JSON parsing errors
          }
        }
        
        const statsAfter = getEndpointStorageStats(domain);
        if (statsAfter) {
          const spaceSaved = sizeBefore - statsAfter.totalSize;
          totalSpaceSaved += spaceSaved;
          totalCleaned++;
        }
      }
    });
    
    return {
      domainsProcessed: totalCleaned,
      spaceSaved: totalSpaceSaved,
      domains: domains.map(domain => getEndpointStorageStats(domain)).filter(Boolean)
    };
  } catch (error) {
    return null;
  }
}

// Create simple text file with all endpoints (newest at bottom)
function createEndpointsTextFile(domain, endpoints) {
  try {
    const endpointsDir = `data/${domain}/endpoints`;
    const textFilePath = `${endpointsDir}/endpoints.txt`;
    
    // Sort endpoints by timestamp (newest last)
    const sortedEndpoints = [...endpoints].sort((a, b) => {
      const timeA = new Date(a.timestamp || 0);
      const timeB = new Date(b.timestamp || 0);
      return timeA - timeB;
    });
    
    // Filter out junk endpoints and keep only clean ones
    const cleanEndpoints = sortedEndpoints.filter(ep => isCleanEndpoint(ep.url));
    
    // Format as simple text lines
    const lines = cleanEndpoints.map(ep => {
      const method = ep.method || 'GET';
      const confidence = ep.confidence || 'LOW';
      const url = ep.url;
      return `${method} ${url} [${confidence}]`;
    });
    
    // Add header
    const header = [
      `# Endpoints for ${domain}`,
      `# Total: ${cleanEndpoints.length} clean endpoints (${endpoints.length} raw)`,
      `# Updated: ${new Date().toISOString()}`,
      `# Format: METHOD URL [CONFIDENCE]`,
      `# Last line = newest endpoint`,
      '',
      ...lines
    ];
    
    fs.writeFileSync(textFilePath, header.join('\n'));
  } catch (error) {
    // Ignore text file creation errors
  }
}

// Check if endpoint is clean and valid
function isCleanEndpoint(url) {
  if (!url || typeof url !== 'string') return false;
  
  // Remove common junk patterns
  const junkPatterns = [
    /^UNKNOWN\s/i,                    // "UNKNOWN Contents of..."
    /\bcontents?\s+of\b/i,            // "Contents of /etc/passwd"
    /\berror\s+(fetching|loading)/i,  // "Error fetching /etc/passwd"
    /\b(failed|error|exception)\b/i,  // General error terms
    /\b(undefined|null|NaN)\b/i,      // JavaScript error values
    /^console\./i,                    // console.log statements
    /^alert\(/i,                      // alert() calls
    /^document\./i,                   // document.something
    /^window\./i,                     // window.something
    /\.(log|warn|error|debug)\(/i,    // logging statements
    /\bthis\.(get|post|put|delete)\b/i, // method references
    /\$\{.*\}.*\$\{.*\}/,            // Multiple template literals (likely corrupted)
    /[a-z]{3,}[z]{3,}/i,             // Corrupted text like "passwdzzzaa"
    /(.)\1{4,}/,                     // Repeated characters (5+ times)
  ];
  
  // Check against junk patterns
  for (const pattern of junkPatterns) {
    if (pattern.test(url)) {
      return false;
    }
  }
  
  // Must contain valid endpoint characteristics
  const validPatterns = [
    /^https?:\/\//,                   // Full URLs
    /^\/[a-zA-Z0-9\/_-]+/,           // Paths starting with /
    /^\/api\//,                       // API paths
    /^\/v\d+\//,                      // Versioned APIs
    /\.(json|xml|api)$/,              // API file extensions
    /\/graphql/i,                     // GraphQL endpoints
    /\/rest/i,                        // REST endpoints
    /\/(users?|auth|login|logout|admin|data|config)/i, // Common API terms
  ];
  
  // Check for valid patterns
  const hasValidPattern = validPatterns.some(pattern => pattern.test(url));
  
  // Additional checks for URL structure
  const isValidStructure = (
    url.length >= 3 &&                // Minimum length
    url.length <= 500 &&              // Maximum reasonable length
    !url.includes('..') &&            // No path traversal
    !/[\x00-\x1f\x7f]/.test(url) &&  // No control characters
    !/[<>"\s]/.test(url.trim())       // No HTML/spaces (after trim)
  );
  
  return hasValidPattern && isValidStructure;
}

// Clean up unnecessary files in endpoints directory
function cleanupUnnecessaryFiles(domain, debug = false) {
  try {
    const endpointsDir = `data/${domain}/endpoints`;
    
    if (!fs.existsSync(endpointsDir)) {
      return;
    }
    
    const files = fs.readdirSync(endpointsDir);
    const keepFiles = [
      'all-endpoints.json',
      'summary.json', 
      'endpoints.txt'
    ];
    
    let removedCount = 0;
    let freedSpace = 0;
    
    files.forEach(file => {
      if (!keepFiles.includes(file)) {
        const filePath = `${endpointsDir}/${file}`;
        try {
          const stats = fs.statSync(filePath);
          const sizeKB = (stats.size / 1024).toFixed(1);
          
          fs.unlinkSync(filePath);
          removedCount++;
          freedSpace += stats.size;
        } catch (error) {
          // Ignore file removal errors
        }
      }
    });
    
    if (removedCount > 0 && debug) {
      const freedKB = (freedSpace / 1024).toFixed(1);
      console.log(`[CLEANUP] Removed ${removedCount} unnecessary endpoint files, freed ${freedKB} KB`);
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

export const endpointExtractor = new EndpointExtractor(); 