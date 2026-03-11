import { describe, expect, it } from 'vitest';
import { validateSlug, listAgents, createRunFolder, resolveAgent } from '../../../src/agent/folder.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { AgentDefinition } from '../../../src/agent/types.js';

describe('folder.ts', () => {
  describe('validateSlug', () => {
    it('should accept valid slugs', () => {
      /*
      Test Doc:
      - Why: AC-01 — slug is the primary agent identifier; valid slugs must pass without error
      - Contract: validateSlug returns null for slugs matching [A-Za-z0-9_-]{1,64}
      - Usage Notes: Update valid examples here if the slug regex changes
      - Quality Contribution: Catches regressions where the regex accidentally rejects legal slugs
      - Worked Example: 'smoke-test' → null, 'agent123' → null
      */
      expect(validateSlug('smoke-test')).toBeNull();
      expect(validateSlug('hello_world')).toBeNull();
      expect(validateSlug('agent123')).toBeNull();
      expect(validateSlug('A-Z_test')).toBeNull();
    });

    it('should reject empty slug', () => {
      /*
      Test Doc:
      - Why: AC-01 — empty slugs would create invalid folder paths
      - Contract: validateSlug returns descriptive error string for empty input
      - Usage Notes: Error message text is part of the public contract
      - Quality Contribution: Prevents silent acceptance of empty agent identifiers
      - Worked Example: '' → 'Agent slug cannot be empty'
      */
      expect(validateSlug('')).toBe('Agent slug cannot be empty');
    });

    it('should reject path traversal attempts', () => {
      /*
      Test Doc:
      - Why: AC-01 — path traversal in slugs is a directory escape vulnerability
      - Contract: validateSlug rejects slugs containing '..', '/', or '\\'
      - Usage Notes: Security-critical — do not relax without threat review
      - Quality Contribution: Catches path traversal attacks that could write outside run dirs
      - Worked Example: '../etc' → error containing '..', 'foo/bar' → error containing '/'
      */
      expect(validateSlug('../etc')).toContain('..');
      expect(validateSlug('foo/bar')).toContain('/');
      expect(validateSlug('foo\\bar')).toContain('\\');
    });

    it('should reject null bytes', () => {
      /*
      Test Doc:
      - Why: AC-01 — null bytes can truncate paths in C-backed fs implementations
      - Contract: validateSlug rejects slugs containing \0
      - Usage Notes: Security-critical — null byte injection is a known attack vector
      - Quality Contribution: Prevents null-byte injection in agent slug paths
      - Worked Example: 'foo\0bar' → error containing 'null'
      */
      expect(validateSlug('foo\0bar')).toContain('null');
    });

    it('should reject slugs with invalid characters', () => {
      /*
      Test Doc:
      - Why: AC-01 — slugs with spaces or dots break folder naming and CLI arg parsing
      - Contract: validateSlug rejects characters outside [A-Za-z0-9_-]
      - Usage Notes: Dots are intentionally forbidden to avoid extension confusion
      - Quality Contribution: Catches slugs that would create ambiguous filesystem entries
      - Worked Example: 'foo bar' → error containing 'must match', 'foo.bar' → same
      */
      expect(validateSlug('foo bar')).toContain('must match');
      expect(validateSlug('foo.bar')).toContain('must match');
    });

    it('should reject slugs over 64 characters', () => {
      /*
      Test Doc:
      - Why: AC-01 — overly long slugs can exceed OS path length limits when nested in run dirs
      - Contract: validateSlug rejects slugs longer than 64 characters
      - Usage Notes: 64-char limit matches the regex quantifier {1,64}
      - Quality Contribution: Prevents filesystem errors from deeply nested paths
      - Worked Example: 'a'.repeat(65) → error containing 'must match'
      */
      const long = 'a'.repeat(65);
      expect(validateSlug(long)).toContain('must match');
    });
  });

  describe('listAgents', () => {
    it('should return empty array when agents dir does not exist', () => {
      /*
      Test Doc:
      - Why: AC-03 — fresh repos have no agents/ dir; listAgents must not throw
      - Contract: listAgents returns [] when the agents directory is missing
      - Usage Notes: This is the first-run happy path, not an error condition
      - Quality Contribution: Prevents crash on first use before any agent is created
      - Worked Example: listAgents('/tmp/nonexistent') → []
      */
      const result = listAgents('/tmp/nonexistent-harness-root');
      expect(result).toEqual([]);
    });

    it('should discover agents with prompt.md', () => {
      /*
      Test Doc:
      - Why: AC-03 — prompt.md is the required marker file for agent discovery
      - Contract: listAgents returns AgentDefinition[] with slug, null schemaPath/instructionsPath
      - Usage Notes: Temp dir is cleaned up in finally block; safe for CI
      - Quality Contribution: Catches regressions in the directory-walk discovery logic
      - Worked Example: agents/test-agent/prompt.md exists → [{slug:'test-agent', schemaPath:null, ...}]
      */
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
        expect(agents[0].inputSchemaPath).toBeNull();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should detect input-schema.json when present', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
      const agentDir = path.join(tmpDir, 'agents', 'param-agent');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'prompt.md'), '# Prompt');
      fs.writeFileSync(path.join(agentDir, 'input-schema.json'), JSON.stringify({
        type: 'object',
        required: ['file_path'],
        properties: { file_path: { type: 'string' } },
      }));

      try {
        const agents = listAgents(tmpDir);
        expect(agents).toHaveLength(1);
        expect(agents[0].inputSchemaPath).not.toBeNull();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should skip directories without prompt.md', () => {
      /*
      Test Doc:
      - Why: AC-03 — directories without prompt.md are not agents; must not appear in listing
      - Contract: listAgents excludes directories missing the prompt.md marker file
      - Usage Notes: Common case is README-only dirs or work-in-progress agents
      - Quality Contribution: Prevents phantom agents from appearing in the CLI listing
      - Worked Example: agents/no-prompt/ with only readme.md → listAgents returns []
      */
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
      /*
      Test Doc:
      - Why: AC-01 — run folders must have timestamped IDs and frozen prompt copies for reproducibility
      - Contract: createRunFolder creates runDir with prompt.md copy, output/ dir, and ISO-like runId
      - Usage Notes: runId format is YYYY-MM-DDTHH-MM-SS-mmmZ-<hex4> for filesystem safety
      - Quality Contribution: Catches regressions in run folder layout that break downstream runner/validator
      - Worked Example: AgentDefinition → {runDir: '.../runs/<id>', runId: '2024-01-01T00-00-00-000Z-ab12'}
      */
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
        inputSchemaPath: null,
      };

      try {
        const { runDir, runId } = createRunFolder(def);
        expect(fs.existsSync(runDir)).toBe(true);
        expect(fs.existsSync(path.join(runDir, 'prompt.md'))).toBe(true);
        expect(fs.existsSync(path.join(runDir, 'output'))).toBe(true);
        expect(runId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{4}$/);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should freeze input-schema.json into run folder when present', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
      const agentDir = path.join(tmpDir, 'agents', 'test-agent');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'prompt.md'), '# Test prompt');
      const inputSchema = JSON.stringify({ type: 'object', required: ['x'], properties: { x: { type: 'string' } } });
      fs.writeFileSync(path.join(agentDir, 'input-schema.json'), inputSchema);

      const def: AgentDefinition = {
        slug: 'test-agent',
        dir: agentDir,
        promptPath: path.join(agentDir, 'prompt.md'),
        schemaPath: null,
        instructionsPath: null,
        inputSchemaPath: path.join(agentDir, 'input-schema.json'),
      };

      try {
        const { runDir } = createRunFolder(def);
        expect(fs.existsSync(path.join(runDir, 'input-schema.json'))).toBe(true);
        expect(fs.readFileSync(path.join(runDir, 'input-schema.json'), 'utf-8')).toBe(inputSchema);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should create unique run IDs on rapid successive calls', () => {
      /*
      Test Doc:
      - Why: AC-01 — rapid successive runs (e.g., batch mode) must never collide on runId
      - Contract: createRunFolder produces distinct runIds even when called within the same millisecond
      - Usage Notes: Uniqueness relies on the 4-hex-char random suffix appended to the timestamp
      - Quality Contribution: Prevents run folder overwrites during parallel or rapid sequential execution
      - Worked Example: Two immediate calls → r1.runId !== r2.runId
      */
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
        inputSchemaPath: null,
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
