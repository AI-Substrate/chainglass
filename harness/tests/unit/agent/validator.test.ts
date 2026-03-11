import { describe, expect, it } from 'vitest';
import { validateOutput, validateInput } from '../../../src/agent/validator.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('validator.ts', () => {
  function withTempDir(fn: (dir: string) => void): void {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-test-'));
    try {
      fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it('should return valid for matching output', () => {
    /*
    Test Doc:
    - Why: AC-03 — valid agent output must pass schema validation cleanly
    - Contract: validateOutput returns {valid: true, errors: []} when output matches schema
    - Usage Notes: Uses a minimal object schema; real schemas will be more complex
    - Quality Contribution: Catches regressions in the Ajv validation pipeline
    - Worked Example: schema requires {status: string}, output {status:'healthy'} → valid: true
    */
    withTempDir((dir) => {
      const schema = { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] };
      const output = { status: 'healthy' };
      fs.writeFileSync(path.join(dir, 'schema.json'), JSON.stringify(schema));
      fs.writeFileSync(path.join(dir, 'output.json'), JSON.stringify(output));

      const result = validateOutput(path.join(dir, 'schema.json'), path.join(dir, 'output.json'));
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  it('should return invalid with errors for non-matching output', () => {
    /*
    Test Doc:
    - Why: AC-03 — type mismatches in agent output must be caught and reported
    - Contract: validateOutput returns {valid: false, errors: [...]} when output violates schema
    - Usage Notes: Error messages come from Ajv; exact text may vary across versions
    - Quality Contribution: Catches regressions where schema violations are silently accepted
    - Worked Example: schema requires {count: number}, output {count:'not-a-number'} → valid: false
    */
    withTempDir((dir) => {
      const schema = { type: 'object', properties: { count: { type: 'number' } }, required: ['count'] };
      const output = { count: 'not-a-number' };
      fs.writeFileSync(path.join(dir, 'schema.json'), JSON.stringify(schema));
      fs.writeFileSync(path.join(dir, 'output.json'), JSON.stringify(output));

      const result = validateOutput(path.join(dir, 'schema.json'), path.join(dir, 'output.json'));
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  it('should return error when output file not found', () => {
    /*
    Test Doc:
    - Why: AC-03 — missing output file is the most common validation failure path
    - Contract: validateOutput returns {valid: false} with 'not found' error for missing files
    - Usage Notes: This is the path hit when agent completes without writing report.json
    - Quality Contribution: Catches regressions where missing files throw instead of returning errors
    - Worked Example: outputPath 'missing.json' → valid: false, errors[0] contains 'not found'
    */
    withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, 'schema.json'), '{"type":"object"}');
      const result = validateOutput(path.join(dir, 'schema.json'), path.join(dir, 'missing.json'));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not found');
    });
  });

  it('should return error when output file is empty', () => {
    /*
    Test Doc:
    - Why: AC-03 — empty output files indicate agent wrote nothing; must not pass validation
    - Contract: validateOutput returns {valid: false} with 'empty' error for zero-byte files
    - Usage Notes: Distinguishes empty file from missing file for better diagnostics
    - Quality Contribution: Catches regressions where empty string parses as valid JSON
    - Worked Example: output.json is '' → valid: false, errors[0] contains 'empty'
    */
    withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, 'schema.json'), '{"type":"object"}');
      fs.writeFileSync(path.join(dir, 'output.json'), '');
      const result = validateOutput(path.join(dir, 'schema.json'), path.join(dir, 'output.json'));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('empty');
    });
  });

  it('should return error when output is not valid JSON', () => {
    /*
    Test Doc:
    - Why: AC-03 — malformed JSON from agent must be caught before schema validation
    - Contract: validateOutput returns {valid: false} with 'not valid JSON' error for unparseable content
    - Usage Notes: JSON.parse errors are caught and wrapped in a user-friendly message
    - Quality Contribution: Catches regressions where parse errors propagate as unhandled exceptions
    - Worked Example: output.json is 'not json {{{' → valid: false, errors[0] contains 'not valid JSON'
    */
    withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, 'schema.json'), '{"type":"object"}');
      fs.writeFileSync(path.join(dir, 'output.json'), 'not json {{{');
      const result = validateOutput(path.join(dir, 'schema.json'), path.join(dir, 'output.json'));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not valid JSON');
    });
  });

  it('should return error when schema file not found', () => {
    /*
    Test Doc:
    - Why: AC-03 — missing schema file indicates broken agent definition, not output failure
    - Contract: validateOutput returns {valid: false} with 'Schema file not found' error
    - Usage Notes: Distinct error message helps distinguish schema issues from output issues
    - Quality Contribution: Catches regressions where missing schema throws instead of returning error
    - Worked Example: schemaPath 'missing-schema.json' → valid: false, errors[0] contains 'Schema file not found'
    */
    withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, 'output.json'), '{}');
      const result = validateOutput(path.join(dir, 'missing-schema.json'), path.join(dir, 'output.json'));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Schema file not found');
    });
  });

  it('should validate nested schema requirements', () => {
    /*
    Test Doc:
    - Why: AC-03 — real agent schemas have nested objects and arrays; validation must recurse
    - Contract: validateOutput correctly validates deeply nested required properties and array items
    - Usage Notes: Exercises Ajv's recursive validation; add more nesting if edge cases emerge
    - Quality Contribution: Catches regressions where only top-level properties are validated
    - Worked Example: schema requires {health:{status:string}, screenshots:string[]} → valid: true
    */
    withTempDir((dir) => {
      const schema = {
        type: 'object',
        properties: {
          health: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] },
          screenshots: { type: 'array', items: { type: 'string' } },
        },
        required: ['health', 'screenshots'],
      };
      const output = { health: { status: 'ok' }, screenshots: ['desktop.png', 'mobile.png'] };
      fs.writeFileSync(path.join(dir, 'schema.json'), JSON.stringify(schema));
      fs.writeFileSync(path.join(dir, 'output.json'), JSON.stringify(output));

      const result = validateOutput(path.join(dir, 'schema.json'), path.join(dir, 'output.json'));
      expect(result.valid).toBe(true);
    });
  });

  describe('validateInput', () => {
    it('should validate params against input schema', () => {
      withTempDir((dir) => {
        const schema = {
          type: 'object',
          required: ['file_path'],
          properties: { file_path: { type: 'string' } },
        };
        fs.writeFileSync(path.join(dir, 'input-schema.json'), JSON.stringify(schema));

        const result = validateInput(path.join(dir, 'input-schema.json'), { file_path: '/tmp/test.ts' });
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });
    });

    it('should reject missing required params', () => {
      withTempDir((dir) => {
        const schema = {
          type: 'object',
          required: ['file_path'],
          properties: { file_path: { type: 'string' } },
        };
        fs.writeFileSync(path.join(dir, 'input-schema.json'), JSON.stringify(schema));

        const result = validateInput(path.join(dir, 'input-schema.json'), {});
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    it('should return error when input schema file not found', () => {
      const result = validateInput('/tmp/nonexistent-schema.json', { file_path: 'test' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not found');
    });
  });
});
