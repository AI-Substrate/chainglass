import { describe, expect, it } from 'vitest';
import { validateOutput } from '../../../src/agent/validator.js';
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
    withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, 'schema.json'), '{"type":"object"}');
      const result = validateOutput(path.join(dir, 'schema.json'), path.join(dir, 'missing.json'));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not found');
    });
  });

  it('should return error when output file is empty', () => {
    withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, 'schema.json'), '{"type":"object"}');
      fs.writeFileSync(path.join(dir, 'output.json'), '');
      const result = validateOutput(path.join(dir, 'schema.json'), path.join(dir, 'output.json'));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('empty');
    });
  });

  it('should return error when output is not valid JSON', () => {
    withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, 'schema.json'), '{"type":"object"}');
      fs.writeFileSync(path.join(dir, 'output.json'), 'not json {{{');
      const result = validateOutput(path.join(dir, 'schema.json'), path.join(dir, 'output.json'));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not valid JSON');
    });
  });

  it('should return error when schema file not found', () => {
    withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, 'output.json'), '{}');
      const result = validateOutput(path.join(dir, 'missing-schema.json'), path.join(dir, 'output.json'));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Schema file not found');
    });
  });

  it('should validate nested schema requirements', () => {
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
});
