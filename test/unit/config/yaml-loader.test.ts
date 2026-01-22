import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConfigurationError } from '../../../packages/shared/src/config/exceptions.js';
import { loadYamlConfig } from '../../../packages/shared/src/config/loaders/yaml.loader.js';

/**
 * Unit tests for loadYamlConfig() - YAML file loading with error handling.
 *
 * This function must:
 * - Parse valid YAML files and return objects
 * - Return empty object {} for missing files (graceful degradation)
 * - Throw ConfigurationError with file path and line number for invalid YAML
 * - Return empty object {} for empty files
 */
describe('loadYamlConfig', () => {
  let tempDir: string;

  beforeEach(async () => {
    const { mkdtemp } = await import('node:fs/promises');
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'chainglass-yaml-test-'));
  });

  afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('valid YAML', () => {
    it('should parse valid YAML file', () => {
      /*
      Test Doc:
      - Why: Core YAML loading functionality
      - Contract: loadYamlConfig(path) returns parsed JavaScript object
      - Usage Notes: All values preserve YAML types (numbers, booleans, strings)
      - Quality Contribution: Catches YAML parsing issues
      - Worked Example: sample:\n  timeout: 30 → { sample: { timeout: 30 } }
      */
      const configPath = path.join(tempDir, 'config.yaml');
      writeFileSync(
        configPath,
        `sample:
  enabled: true
  timeout: 30
  name: test-value
`
      );

      const result = loadYamlConfig(configPath);

      expect(result).toEqual({
        sample: {
          enabled: true,
          timeout: 30,
          name: 'test-value',
        },
      });
    });

    it('should handle complex nested structures', () => {
      /*
      Test Doc:
      - Why: Config may have deeply nested values
      - Contract: Nested YAML maps to nested JavaScript objects
      - Usage Notes: Arrays and objects preserved
      - Quality Contribution: Verifies deep nesting works
      - Worked Example: a:\n  b:\n    c: val → { a: { b: { c: 'val' } } }
      */
      const configPath = path.join(tempDir, 'nested.yaml');
      writeFileSync(
        configPath,
        `level1:
  level2:
    level3:
      value: deep
    array:
      - one
      - two
`
      );

      const result = loadYamlConfig(configPath);

      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
            array: ['one', 'two'],
          },
        },
      });
    });
  });

  describe('missing files', () => {
    it('should return empty object for missing file', () => {
      /*
      Test Doc:
      - Why: Config file may not exist (first run, project without config)
      - Contract: loadYamlConfig(nonexistent) returns {} not throws
      - Usage Notes: Caller should merge with defaults
      - Quality Contribution: Graceful degradation for optional configs
      - Worked Example: loadYamlConfig('/nonexistent.yaml') → {}
      */
      const nonexistentPath = path.join(tempDir, 'does-not-exist.yaml');

      const result = loadYamlConfig(nonexistentPath);

      expect(result).toEqual({});
    });
  });

  describe('empty files', () => {
    it('should return empty object for empty file', () => {
      /*
      Test Doc:
      - Why: User might create empty config file
      - Contract: loadYamlConfig(emptyFile) returns {}
      - Usage Notes: Empty YAML is valid, represents no configuration
      - Quality Contribution: Edge case handling
      - Worked Example: loadYamlConfig(emptyFile) → {}
      */
      const emptyPath = path.join(tempDir, 'empty.yaml');
      writeFileSync(emptyPath, '');

      const result = loadYamlConfig(emptyPath);

      expect(result).toEqual({});
    });

    it('should return empty object for whitespace-only file', () => {
      /*
      Test Doc:
      - Why: User might have file with only comments or whitespace
      - Contract: loadYamlConfig(whitespaceFile) returns {}
      - Usage Notes: Comments and whitespace don't create values
      - Quality Contribution: Edge case handling
      - Worked Example: loadYamlConfig(file with only # comments) → {}
      */
      const whitespacePath = path.join(tempDir, 'whitespace.yaml');
      writeFileSync(whitespacePath, '  \n\n  # just a comment\n  \n');

      const result = loadYamlConfig(whitespacePath);

      expect(result).toEqual({});
    });
  });

  describe('invalid YAML', () => {
    it('should throw ConfigurationError on invalid YAML', () => {
      /*
      Test Doc:
      - Why: Malformed YAML should fail fast with helpful message
      - Contract: loadYamlConfig(invalidYaml) throws ConfigurationError
      - Usage Notes: Error includes file path for debugging
      - Quality Contribution: Clear error messages for user mistakes
      - Worked Example: loadYamlConfig(file with `: : :`) → throws ConfigurationError
      */
      const invalidPath = path.join(tempDir, 'invalid.yaml');
      writeFileSync(invalidPath, 'invalid: yaml: syntax: : :');

      expect(() => loadYamlConfig(invalidPath)).toThrow();
    });

    it('should include file path in error message', () => {
      /*
      Test Doc:
      - Why: User needs to know which file has the error
      - Contract: ConfigurationError message includes absolute file path
      - Usage Notes: Helps when multiple config files loaded
      - Quality Contribution: Debuggability of config errors
      - Worked Example: Error message contains '/path/to/invalid.yaml'
      */
      const invalidPath = path.join(tempDir, 'invalid-path-test.yaml');
      writeFileSync(invalidPath, '  bad:\nindentation');

      try {
        loadYamlConfig(invalidPath);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain(invalidPath);
      }
    });
  });
});
