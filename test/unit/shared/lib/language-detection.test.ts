/**
 * Language Detection Tests - TDD RED Phase
 *
 * Tests for the language detection utility that maps filenames to Shiki language names.
 * Uses two-tier detection: (1) special filenames, (2) extension-based lookup.
 *
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import { detectLanguage } from '../../../../packages/shared/src/lib/language-detection';

describe('detectLanguage', () => {
  describe('extension-based detection', () => {
    it('should map TypeScript extensions', () => {
      /*
      Test Doc:
      - Why: TypeScript is the primary language for this project
      - Contract: .ts → 'typescript', .tsx → 'tsx'
      - Usage Notes: Extensions are case-insensitive
      - Quality Contribution: Catches incorrect TypeScript mapping
      - Worked Example: 'file.ts' → 'typescript', 'Button.tsx' → 'tsx'
      */
      expect(detectLanguage('file.ts')).toBe('typescript');
      expect(detectLanguage('Button.tsx')).toBe('tsx');
    });

    it('should map JavaScript extensions', () => {
      /*
      Test Doc:
      - Why: JavaScript files are common in web projects
      - Contract: .js → 'javascript', .jsx → 'jsx'
      - Usage Notes: Same extension-to-language mapping as TypeScript variants
      - Quality Contribution: Catches JavaScript mapping errors
      - Worked Example: 'index.js' → 'javascript', 'App.jsx' → 'jsx'
      */
      expect(detectLanguage('index.js')).toBe('javascript');
      expect(detectLanguage('App.jsx')).toBe('jsx');
    });

    it('should map Python extension', () => {
      /*
      Test Doc:
      - Why: Python is commonly used in automation and data processing
      - Contract: .py → 'python'
      - Usage Notes: Single extension mapping
      - Quality Contribution: Catches Python language mapping
      - Worked Example: 'script.py' → 'python'
      */
      expect(detectLanguage('script.py')).toBe('python');
    });

    it('should map C# extension', () => {
      /*
      Test Doc:
      - Why: C# is used in backend and game development
      - Contract: .cs → 'csharp'
      - Usage Notes: Shiki uses 'csharp' not 'c#'
      - Quality Contribution: Catches language ID mismatch
      - Worked Example: 'Program.cs' → 'csharp'
      */
      expect(detectLanguage('Program.cs')).toBe('csharp');
    });

    it('should map Go extension', () => {
      /*
      Test Doc:
      - Why: Go is a common backend language
      - Contract: .go → 'go'
      - Usage Notes: Direct mapping
      - Quality Contribution: Verifies Go support
      - Worked Example: 'main.go' → 'go'
      */
      expect(detectLanguage('main.go')).toBe('go');
    });

    it('should map Rust extension', () => {
      /*
      Test Doc:
      - Why: Rust is increasingly popular for systems programming
      - Contract: .rs → 'rust'
      - Usage Notes: Direct mapping
      - Quality Contribution: Verifies Rust support
      - Worked Example: 'lib.rs' → 'rust'
      */
      expect(detectLanguage('lib.rs')).toBe('rust');
    });

    it('should map JSON extension', () => {
      /*
      Test Doc:
      - Why: JSON is ubiquitous in config and data files
      - Contract: .json → 'json'
      - Usage Notes: Direct mapping
      - Quality Contribution: Verifies JSON support
      - Worked Example: 'package.json' → 'json'
      */
      expect(detectLanguage('package.json')).toBe('json');
    });

    it('should map YAML extensions', () => {
      /*
      Test Doc:
      - Why: YAML is common for config files
      - Contract: .yml and .yaml → 'yaml'
      - Usage Notes: Both extensions map to same language
      - Quality Contribution: Catches missed YAML variant
      - Worked Example: 'config.yml' → 'yaml', 'config.yaml' → 'yaml'
      */
      expect(detectLanguage('config.yml')).toBe('yaml');
      expect(detectLanguage('config.yaml')).toBe('yaml');
    });

    it('should map CSS extensions', () => {
      /*
      Test Doc:
      - Why: CSS is fundamental for web styling
      - Contract: .css → 'css', .scss → 'scss', .less → 'less'
      - Usage Notes: Each CSS variant has its own language
      - Quality Contribution: Catches CSS preprocessor support
      - Worked Example: 'styles.css' → 'css'
      */
      expect(detectLanguage('styles.css')).toBe('css');
      expect(detectLanguage('styles.scss')).toBe('scss');
      expect(detectLanguage('styles.less')).toBe('less');
    });

    it('should map HTML extension', () => {
      /*
      Test Doc:
      - Why: HTML is the foundation of web documents
      - Contract: .html and .htm → 'html'
      - Usage Notes: Both extensions map to same language
      - Quality Contribution: Verifies HTML support
      - Worked Example: 'index.html' → 'html'
      */
      expect(detectLanguage('index.html')).toBe('html');
      expect(detectLanguage('page.htm')).toBe('html');
    });

    it('should map Markdown extensions', () => {
      /*
      Test Doc:
      - Why: Markdown is used for documentation
      - Contract: .md and .markdown → 'markdown'
      - Usage Notes: Both extensions map to same language
      - Quality Contribution: Verifies Markdown support
      - Worked Example: 'README.md' → 'markdown'
      */
      expect(detectLanguage('README.md')).toBe('markdown');
      expect(detectLanguage('docs.markdown')).toBe('markdown');
    });

    it('should map shell script extensions', () => {
      /*
      Test Doc:
      - Why: Shell scripts are common in automation
      - Contract: .sh and .bash → 'bash'
      - Usage Notes: Both extensions use bash highlighting
      - Quality Contribution: Verifies shell script support
      - Worked Example: 'install.sh' → 'bash'
      */
      expect(detectLanguage('install.sh')).toBe('bash');
      expect(detectLanguage('build.bash')).toBe('bash');
    });

    it('should return text for unknown extensions', () => {
      /*
      Test Doc:
      - Why: Unknown extensions should not crash, just show plain text
      - Contract: Unknown extension → 'text'
      - Usage Notes: Fallback for unsupported file types
      - Quality Contribution: Prevents crashes from unknown files
      - Worked Example: 'data.xyz' → 'text'
      */
      expect(detectLanguage('data.xyz')).toBe('text');
      expect(detectLanguage('unknown.abc')).toBe('text');
    });
  });

  describe('special filename detection (tier 1)', () => {
    it('should detect Dockerfile (no extension)', () => {
      /*
      Test Doc:
      - Why: Dockerfiles are common but have no extension
      - Contract: 'Dockerfile' → 'dockerfile'
      - Usage Notes: Exact filename match, case-insensitive
      - Quality Contribution: Catches extensionless file support
      - Worked Example: 'Dockerfile' → 'dockerfile'
      */
      expect(detectLanguage('Dockerfile')).toBe('dockerfile');
    });

    it('should detect justfile (no extension)', () => {
      /*
      Test Doc:
      - Why: justfile is used for task automation in this project
      - Contract: 'justfile' → 'just' (or 'makefile' if Shiki doesn't support just)
      - Usage Notes: Exact filename match
      - Quality Contribution: Catches justfile support
      - Worked Example: 'justfile' → language for just syntax
      */
      expect(detectLanguage('justfile')).toBe('just');
    });

    it('should detect Makefile (no extension)', () => {
      /*
      Test Doc:
      - Why: Makefiles are common for build automation
      - Contract: 'Makefile' → 'makefile'
      - Usage Notes: Exact filename match
      - Quality Contribution: Catches Makefile support
      - Worked Example: 'Makefile' → 'makefile'
      */
      expect(detectLanguage('Makefile')).toBe('makefile');
    });

    it('should detect .gitignore (dot-prefixed)', () => {
      /*
      Test Doc:
      - Why: .gitignore files need syntax highlighting
      - Contract: '.gitignore' → 'gitignore'
      - Usage Notes: Dot-prefixed files without extension
      - Quality Contribution: Catches dotfile support
      - Worked Example: '.gitignore' → 'gitignore'
      */
      expect(detectLanguage('.gitignore')).toBe('gitignore');
    });

    it('should detect .env files', () => {
      /*
      Test Doc:
      - Why: .env files are common for configuration
      - Contract: '.env' → 'dotenv' or 'properties'
      - Usage Notes: May vary based on Shiki support
      - Quality Contribution: Catches env file support
      - Worked Example: '.env' → appropriate language
      */
      expect(detectLanguage('.env')).toBe('dotenv');
      expect(detectLanguage('.env.local')).toBe('dotenv');
    });

    it('should detect LICENSE files', () => {
      /*
      Test Doc:
      - Why: LICENSE files are standard in repos
      - Contract: 'LICENSE' → 'text'
      - Usage Notes: Plain text display
      - Quality Contribution: Handles common special files
      - Worked Example: 'LICENSE' → 'text'
      */
      expect(detectLanguage('LICENSE')).toBe('text');
    });
  });

  describe('edge cases', () => {
    it('should handle uppercase extensions', () => {
      /*
      Test Doc:
      - Why: Some files have uppercase extensions
      - Contract: Extension detection is case-insensitive
      - Usage Notes: .TS, .JS, etc. should work
      - Quality Contribution: Catches case-sensitivity bugs
      - Worked Example: 'file.TS' → 'typescript'
      */
      expect(detectLanguage('file.TS')).toBe('typescript');
      expect(detectLanguage('file.JS')).toBe('javascript');
      expect(detectLanguage('file.JSON')).toBe('json');
    });

    it('should handle multiple dots in filename', () => {
      /*
      Test Doc:
      - Why: Files like 'config.test.ts' have multiple dots
      - Contract: Uses last extension segment
      - Usage Notes: Split and take last element
      - Quality Contribution: Catches incorrect dot splitting
      - Worked Example: 'config.test.ts' → 'typescript'
      */
      expect(detectLanguage('config.test.ts')).toBe('typescript');
      expect(detectLanguage('app.module.css')).toBe('css');
      expect(detectLanguage('package.lock.json')).toBe('json');
    });

    it('should handle empty filename gracefully', () => {
      /*
      Test Doc:
      - Why: Edge case that shouldn't crash
      - Contract: Empty string → 'text'
      - Usage Notes: Defensive programming
      - Quality Contribution: Prevents crashes on edge input
      - Worked Example: '' → 'text'
      */
      expect(detectLanguage('')).toBe('text');
    });

    it('should handle filename with only extension', () => {
      /*
      Test Doc:
      - Why: Files like '.ts' are technically valid
      - Contract: Single dot with extension → use extension
      - Usage Notes: Rare but possible edge case
      - Quality Contribution: Handles unusual filenames
      - Worked Example: '.ts' → 'typescript'
      */
      expect(detectLanguage('.ts')).toBe('typescript');
    });
  });

  describe('additional language coverage (20+ languages)', () => {
    it('should map Ruby extension', () => {
      expect(detectLanguage('app.rb')).toBe('ruby');
    });

    it('should map PHP extension', () => {
      expect(detectLanguage('index.php')).toBe('php');
    });

    it('should map Java extension', () => {
      expect(detectLanguage('Main.java')).toBe('java');
    });

    it('should map Kotlin extension', () => {
      expect(detectLanguage('App.kt')).toBe('kotlin');
    });

    it('should map Swift extension', () => {
      expect(detectLanguage('ViewController.swift')).toBe('swift');
    });

    it('should map SQL extension', () => {
      expect(detectLanguage('query.sql')).toBe('sql');
    });

    it('should map GraphQL extension', () => {
      expect(detectLanguage('schema.graphql')).toBe('graphql');
      expect(detectLanguage('query.gql')).toBe('graphql');
    });

    it('should map XML extension', () => {
      expect(detectLanguage('config.xml')).toBe('xml');
    });

    it('should map C/C++ extensions', () => {
      expect(detectLanguage('main.c')).toBe('c');
      expect(detectLanguage('main.cpp')).toBe('cpp');
      expect(detectLanguage('header.h')).toBe('c');
      expect(detectLanguage('header.hpp')).toBe('cpp');
    });

    it('should map TOML extension', () => {
      expect(detectLanguage('Cargo.toml')).toBe('toml');
    });

    it('should map Vue extension', () => {
      expect(detectLanguage('App.vue')).toBe('vue');
    });

    it('should map Svelte extension', () => {
      expect(detectLanguage('Component.svelte')).toBe('svelte');
    });
  });
});
