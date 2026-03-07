import { describe, expect, it } from 'vitest';
import { validateSlug, listAgents, createRunFolder, resolveAgent } from '../../../src/agent/folder.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { AgentDefinition } from '../../../src/agent/types.js';

describe('folder.ts', () => {
  describe('validateSlug', () => {
    it('should accept valid slugs', () => {
      expect(validateSlug('smoke-test')).toBeNull();
      expect(validateSlug('hello_world')).toBeNull();
      expect(validateSlug('agent123')).toBeNull();
      expect(validateSlug('A-Z_test')).toBeNull();
    });

    it('should reject empty slug', () => {
      expect(validateSlug('')).toBe('Agent slug cannot be empty');
    });

    it('should reject path traversal attempts', () => {
      expect(validateSlug('../etc')).toContain('..');
      expect(validateSlug('foo/bar')).toContain('/');
      expect(validateSlug('foo\\bar')).toContain('\\');
    });

    it('should reject null bytes', () => {
      expect(validateSlug('foo\0bar')).toContain('null');
    });

    it('should reject slugs with invalid characters', () => {
      expect(validateSlug('foo bar')).toContain('must match');
      expect(validateSlug('foo.bar')).toContain('must match');
    });

    it('should reject slugs over 64 characters', () => {
      const long = 'a'.repeat(65);
      expect(validateSlug(long)).toContain('must match');
    });
  });

  describe('listAgents', () => {
    it('should return empty array when agents dir does not exist', () => {
      const result = listAgents('/tmp/nonexistent-harness-root');
      expect(result).toEqual([]);
    });

    it('should discover agents with prompt.md', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
      const agentsDir = path.join(tmpDir, 'agents');
      const agentDir = path.join(agentsDir, 'test-agent');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'prompt.md'), '# Test prompt');

      try {
        const agents = listAgents(tmpDir);
        expect(agents).toHaveLength(1);
        expect(agents[0].slug).toBe('test-agent');
        expect(agents[0].schemaPath).toBeNull();
        expect(agents[0].instructionsPath).toBeNull();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should detect optional schema and instructions', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
      const agentDir = path.join(tmpDir, 'agents', 'full-agent');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'prompt.md'), '# Prompt');
      fs.writeFileSync(path.join(agentDir, 'output-schema.json'), '{}');
      fs.writeFileSync(path.join(agentDir, 'instructions.md'), '# Rules');

      try {
        const agents = listAgents(tmpDir);
        expect(agents[0].schemaPath).not.toBeNull();
        expect(agents[0].instructionsPath).not.toBeNull();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should skip directories without prompt.md', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
      const agentDir = path.join(tmpDir, 'agents', 'no-prompt');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'readme.md'), 'Not a prompt');

      try {
        const agents = listAgents(tmpDir);
        expect(agents).toHaveLength(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('createRunFolder', () => {
    it('should create timestamped run folder with frozen copies', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
      const agentDir = path.join(tmpDir, 'agents', 'test-agent');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'prompt.md'), '# Test prompt');

      const def: AgentDefinition = {
        slug: 'test-agent',
        dir: agentDir,
        promptPath: path.join(agentDir, 'prompt.md'),
        schemaPath: null,
        instructionsPath: null,
      };

      try {
        const { runDir, runId } = createRunFolder(def);
        expect(fs.existsSync(runDir)).toBe(true);
        expect(fs.existsSync(path.join(runDir, 'prompt.md'))).toBe(true);
        expect(fs.existsSync(path.join(runDir, 'output'))).toBe(true);
        expect(runId).toMatch(/^\d{4}\d{2}\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{4}$/);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should create unique run IDs on rapid successive calls', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
      const agentDir = path.join(tmpDir, 'agents', 'test-agent');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'prompt.md'), '# Test');

      const def: AgentDefinition = {
        slug: 'test-agent',
        dir: agentDir,
        promptPath: path.join(agentDir, 'prompt.md'),
        schemaPath: null,
        instructionsPath: null,
      };

      try {
        const r1 = createRunFolder(def);
        const r2 = createRunFolder(def);
        expect(r1.runId).not.toBe(r2.runId);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
