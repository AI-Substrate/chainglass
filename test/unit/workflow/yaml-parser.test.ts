import { describe, it, expect, beforeEach } from 'vitest';
import { YamlParserAdapter, FakeYamlParser, YamlParseError } from '@chainglass/workflow';

/**
 * Tests for IYamlParser implementations.
 *
 * Per Critical Discovery 06: YAML parse errors must include line/column
 * information for agent-friendly error messages.
 */

describe('YamlParserAdapter', () => {
  const parser = new YamlParserAdapter();

  describe('parse()', () => {
    it('should parse valid YAML', () => {
      /*
      Test Doc:
      - Why: Core operation - parsing wf.yaml files
      - Contract: parse() returns JavaScript object from YAML string
      - Usage Notes: Returns typed result via generic
      - Quality Contribution: Ensures YAML parsing works correctly
      - Worked Example: parse('name: test') → { name: 'test' }
      */
      const yaml = `
name: hello-workflow
version: "1.0.0"
phases:
  gather:
    order: 1
`;
      const result = parser.parse<{ name: string; version: string }>(yaml, 'test.yaml');
      expect(result.name).toBe('hello-workflow');
      expect(result.version).toBe('1.0.0');
    });

    it('should throw YamlParseError on syntax error', () => {
      /*
      Test Doc:
      - Why: Error handling - YAML errors need precise location
      - Contract: parse() throws YamlParseError with line/column
      - Usage Notes: Check line and column properties for precise location
      - Quality Contribution: Enables agent-friendly error messages
      - Worked Example: parse('invalid: [') → throws YamlParseError
      */
      const invalidYaml = `
name: test
items: [
  unclosed
`;
      try {
        parser.parse(invalidYaml, 'test.yaml');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlParseError);
        const yamlErr = err as YamlParseError;
        expect(yamlErr.line).toBeGreaterThan(0);
        expect(yamlErr.column).toBeGreaterThan(0);
        expect(yamlErr.filePath).toBe('test.yaml');
        expect(yamlErr.message).toContain('test.yaml');
      }
    });

    it('should parse null/undefined values', () => {
      const yaml = 'value: null';
      const result = parser.parse<{ value: null }>(yaml, 'test.yaml');
      expect(result.value).toBeNull();
    });

    it('should parse arrays', () => {
      const yaml = `
items:
  - a
  - b
  - c
`;
      const result = parser.parse<{ items: string[] }>(yaml, 'test.yaml');
      expect(result.items).toEqual(['a', 'b', 'c']);
    });
  });

  describe('stringify()', () => {
    it('should stringify object to YAML', () => {
      /*
      Test Doc:
      - Why: Writing phase outputs as YAML
      - Contract: stringify() returns valid YAML string
      - Usage Notes: Result can be parsed back
      - Quality Contribution: Ensures YAML round-trip works
      - Worked Example: stringify({ name: 'test' }) → 'name: test\n'
      */
      const obj = { name: 'test', count: 42 };
      const yaml = parser.stringify(obj);
      expect(yaml).toContain('name: test');
      expect(yaml).toContain('count: 42');
    });
  });
});

describe('FakeYamlParser', () => {
  let parser: FakeYamlParser;

  beforeEach(() => {
    parser = new FakeYamlParser();
  });

  describe('test helpers', () => {
    it('setParseResult should return preset result', () => {
      const preset = { name: 'preset-value' };
      parser.setParseResult('some yaml', preset);
      const result = parser.parse('some yaml', 'test.yaml');
      expect(result).toBe(preset);
    });

    it('setParseError should throw preset error', () => {
      const error = new YamlParseError('Test error', 5, 10, 'test.yaml');
      parser.setParseError('bad yaml', error);

      try {
        parser.parse('bad yaml', 'test.yaml');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBe(error);
      }
    });

    it('reset should clear all state', () => {
      parser.setParseResult('content', { preset: true });
      parser.reset();
      // Should use real parsing now
      const result = parser.parse('name: real', 'test.yaml');
      expect(result).toEqual({ name: 'real' });
    });
  });

  describe('parse()', () => {
    it('should use real parsing by default', () => {
      const yaml = 'name: test';
      const result = parser.parse<{ name: string }>(yaml, 'test.yaml');
      expect(result.name).toBe('test');
    });

    it('should throw YamlParseError on syntax error', () => {
      const invalidYaml = 'items: [unclosed';
      try {
        parser.parse(invalidYaml, 'test.yaml');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlParseError);
      }
    });
  });
});
