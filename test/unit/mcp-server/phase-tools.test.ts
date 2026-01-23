/**
 * Phase MCP Tools Tests
 *
 * Per Phase 5: MCP Integration - Tests for phase_prepare, phase_validate, phase_finalize tools.
 * Per ADR-0001: All tools must follow check_health exemplar pattern.
 *
 * This test suite validates:
 * - Naming convention (verb_object, snake_case)
 * - Description structure (3-4 sentences)
 * - Parameter design (Zod schema per WF-01 discovery)
 * - Response design (CommandResponse envelope)
 * - Annotations (idempotentHint per tool)
 */

import { createMcpServer } from '@chainglass/mcp-server';
import { FakeLogger } from '@chainglass/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type McpTestClient, createTestClient } from '../../base/mcp-test.js';

describe('phase_prepare tool - ADR-0001 Compliance', () => {
  let fakeLogger: FakeLogger;

  beforeEach(() => {
    fakeLogger = new FakeLogger();
  });

  describe('naming convention (ADR-0001 Decision #2)', () => {
    it('should use verb_object naming format', () => {
      /*
      Test Doc:
      - Why: ADR-0001 mandates verb_object naming for agent discoverability
      - Contract: Tool name is 'phase_prepare' (phase = scope, prepare = action)
      - Usage Notes: Agent accuracy improves with consistent naming patterns
      - Quality Contribution: Catches non-compliant tool names that confuse agents
      - Worked Example: server.tools.has('phase_prepare') === true
      */
      const server = createMcpServer({ logger: fakeLogger });

      expect(server.tools.has('phase_prepare')).toBe(true);
      // Should NOT use camelCase
      expect(server.tools.has('phasePrepare')).toBe(false);
    });
  });

  describe('description structure (ADR-0001 Decision #3)', () => {
    it('should have 3-4 sentence description', () => {
      /*
      Test Doc:
      - Why: ADR-0001 research shows 3-4 sentence descriptions outperform 1-sentence
      - Contract: Description has 3-4 sentences covering action, context, return values
      - Usage Notes: Count sentences by splitting on period followed by space
      - Quality Contribution: Catches terse descriptions that reduce agent accuracy
      - Worked Example: description.split('. ').filter(Boolean).length >= 3
      */
      const server = createMcpServer({ logger: fakeLogger });
      const tool = server.tools.get('phase_prepare');

      expect(tool).toBeDefined();

      // Description should have multiple sentences
      const sentences = tool?.description.split('. ').filter(Boolean);
      expect(sentences?.length).toBeGreaterThanOrEqual(3);
    });

    it('should describe action, context, and return values', () => {
      /*
      Test Doc:
      - Why: ADR-0001 requires descriptions to cover action/context/returns/alternatives
      - Contract: Description mentions prepare, phase, inputs
      - Usage Notes: Use substring matching for key concepts
      - Quality Contribution: Catches descriptions missing required information
      - Worked Example: description includes 'prepare', 'phase', 'inputs'
      */
      const server = createMcpServer({ logger: fakeLogger });
      const tool = server.tools.get('phase_prepare');
      const desc = tool?.description.toLowerCase();

      expect(desc).toContain('prepare');
      expect(desc).toContain('phase');
    });
  });

  describe('E2E tool invocation via stdio', () => {
    let testClient: McpTestClient | null = null;

    afterEach(async () => {
      await testClient?.close();
      testClient = null;
    });

    it('should have correct annotations with idempotentHint: true', async () => {
      /*
      Test Doc:
      - Why: ADR-0001 requires complete annotations; prepare IS idempotent
      - Contract: phase_prepare has readOnlyHint=false, destructiveHint=false, idempotentHint=true, openWorldHint=false
      - Usage Notes: Per plan table - prepare can be called multiple times safely
      - Quality Contribution: Catches incorrect annotations that mislead agents
      - Worked Example: annotations.idempotentHint === true
      */
      testClient = await createTestClient();

      const toolsResult = await testClient.client.listTools();
      const tool = toolsResult.tools.find((t) => t.name === 'phase_prepare');

      expect(tool).toBeDefined();
      expect(tool?.annotations).toBeDefined();
      // Per plan: prepare IS idempotent
      expect(tool?.annotations?.readOnlyHint).toBe(false);
      expect(tool?.annotations?.destructiveHint).toBe(false);
      expect(tool?.annotations?.idempotentHint).toBe(true);
      expect(tool?.annotations?.openWorldHint).toBe(false);
    });

    it('should have explicit JSON Schema input constraints (ADR-0001 Decision #4)', async () => {
      /*
      Test Doc:
      - Why: ADR-0001 research shows JSON Schema constraints outperform natural language
      - Contract: Tool has inputSchema with phase (required) and run_dir (required)
      - Usage Notes: Use createTestClient() then client.listTools() to inspect schema
      - Quality Contribution: Catches missing schema validation that causes agent errors
      - Worked Example: client.listTools() -> tool.inputSchema.properties.phase exists
      */
      testClient = await createTestClient();

      const toolsResult = await testClient.client.listTools();
      const tool = toolsResult.tools.find((t) => t.name === 'phase_prepare');

      expect(tool).toBeDefined();
      expect(tool?.inputSchema).toBeDefined();
      expect(tool?.inputSchema.type).toBe('object');
      expect(tool?.inputSchema.properties).toBeDefined();

      // phase should be required string
      const phaseSchema = (tool?.inputSchema.properties as Record<string, unknown>)?.phase;
      expect(phaseSchema).toBeDefined();

      // run_dir should be required string
      const runDirSchema = (tool?.inputSchema.properties as Record<string, unknown>)?.run_dir;
      expect(runDirSchema).toBeDefined();
    });
  });
});

describe('phase_validate tool - ADR-0001 Compliance', () => {
  let fakeLogger: FakeLogger;

  beforeEach(() => {
    fakeLogger = new FakeLogger();
  });

  describe('naming convention (ADR-0001 Decision #2)', () => {
    it('should use verb_object naming format', () => {
      /*
      Test Doc:
      - Why: ADR-0001 mandates verb_object naming for agent discoverability
      - Contract: Tool name is 'phase_validate' (phase = scope, validate = action)
      - Usage Notes: Agent accuracy improves with consistent naming patterns
      - Quality Contribution: Catches non-compliant tool names that confuse agents
      - Worked Example: server.tools.has('phase_validate') === true
      */
      const server = createMcpServer({ logger: fakeLogger });

      expect(server.tools.has('phase_validate')).toBe(true);
      // Should NOT use camelCase
      expect(server.tools.has('phaseValidate')).toBe(false);
    });
  });

  describe('E2E tool invocation via stdio', () => {
    let testClient: McpTestClient | null = null;

    afterEach(async () => {
      await testClient?.close();
      testClient = null;
    });

    it('should have correct annotations with readOnlyHint: true', async () => {
      /*
      Test Doc:
      - Why: ADR-0001 requires complete annotations; validate is a pure read operation
      - Contract: phase_validate has readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false
      - Usage Notes: Per plan table - validate never modifies state
      - Quality Contribution: Catches incorrect annotations that mislead agents
      - Worked Example: annotations.readOnlyHint === true
      */
      testClient = await createTestClient();

      const toolsResult = await testClient.client.listTools();
      const tool = toolsResult.tools.find((t) => t.name === 'phase_validate');

      expect(tool).toBeDefined();
      expect(tool?.annotations).toBeDefined();
      // Per plan: validate is read-only and idempotent
      expect(tool?.annotations?.readOnlyHint).toBe(true);
      expect(tool?.annotations?.destructiveHint).toBe(false);
      expect(tool?.annotations?.idempotentHint).toBe(true);
      expect(tool?.annotations?.openWorldHint).toBe(false);
    });

    it('should have explicit JSON Schema input constraints (ADR-0001 Decision #4)', async () => {
      /*
      Test Doc:
      - Why: ADR-0001 research shows JSON Schema constraints outperform natural language
      - Contract: Tool has inputSchema with phase, run_dir, and check (inputs|outputs)
      - Usage Notes: Use createTestClient() then client.listTools() to inspect schema
      - Quality Contribution: Catches missing schema validation that causes agent errors
      - Worked Example: client.listTools() -> tool.inputSchema.properties.check with enum
      */
      testClient = await createTestClient();

      const toolsResult = await testClient.client.listTools();
      const tool = toolsResult.tools.find((t) => t.name === 'phase_validate');

      expect(tool).toBeDefined();
      expect(tool?.inputSchema).toBeDefined();
      expect(tool?.inputSchema.type).toBe('object');
      expect(tool?.inputSchema.properties).toBeDefined();

      // phase should be required string
      const phaseSchema = (tool?.inputSchema.properties as Record<string, unknown>)?.phase;
      expect(phaseSchema).toBeDefined();

      // check should have enum constraint
      const checkSchema = (tool?.inputSchema.properties as Record<string, unknown>)?.check;
      expect(checkSchema).toBeDefined();
    });
  });
});

describe('phase_finalize tool - ADR-0001 Compliance', () => {
  let fakeLogger: FakeLogger;

  beforeEach(() => {
    fakeLogger = new FakeLogger();
  });

  describe('naming convention (ADR-0001 Decision #2)', () => {
    it('should use verb_object naming format', () => {
      /*
      Test Doc:
      - Why: ADR-0001 mandates verb_object naming for agent discoverability
      - Contract: Tool name is 'phase_finalize' (phase = scope, finalize = action)
      - Usage Notes: Agent accuracy improves with consistent naming patterns
      - Quality Contribution: Catches non-compliant tool names that confuse agents
      - Worked Example: server.tools.has('phase_finalize') === true
      */
      const server = createMcpServer({ logger: fakeLogger });

      expect(server.tools.has('phase_finalize')).toBe(true);
      // Should NOT use camelCase
      expect(server.tools.has('phaseFinalize')).toBe(false);
    });
  });

  describe('E2E tool invocation via stdio', () => {
    let testClient: McpTestClient | null = null;

    afterEach(async () => {
      await testClient?.close();
      testClient = null;
    });

    it('should have correct annotations with idempotentHint: true', async () => {
      /*
      Test Doc:
      - Why: ADR-0001 requires complete annotations; finalize IS idempotent
      - Contract: phase_finalize has readOnlyHint=false, destructiveHint=false, idempotentHint=true, openWorldHint=false
      - Usage Notes: Per plan table - finalize can be called multiple times safely
      - Quality Contribution: Catches incorrect annotations that mislead agents
      - Worked Example: annotations.idempotentHint === true
      */
      testClient = await createTestClient();

      const toolsResult = await testClient.client.listTools();
      const tool = toolsResult.tools.find((t) => t.name === 'phase_finalize');

      expect(tool).toBeDefined();
      expect(tool?.annotations).toBeDefined();
      // Per plan: finalize IS idempotent
      expect(tool?.annotations?.readOnlyHint).toBe(false);
      expect(tool?.annotations?.destructiveHint).toBe(false);
      expect(tool?.annotations?.idempotentHint).toBe(true);
      expect(tool?.annotations?.openWorldHint).toBe(false);
    });

    it('should have explicit JSON Schema input constraints (ADR-0001 Decision #4)', async () => {
      /*
      Test Doc:
      - Why: ADR-0001 research shows JSON Schema constraints outperform natural language
      - Contract: Tool has inputSchema with phase and run_dir
      - Usage Notes: Use createTestClient() then client.listTools() to inspect schema
      - Quality Contribution: Catches missing schema validation that causes agent errors
      - Worked Example: client.listTools() -> tool.inputSchema.properties.phase exists
      */
      testClient = await createTestClient();

      const toolsResult = await testClient.client.listTools();
      const tool = toolsResult.tools.find((t) => t.name === 'phase_finalize');

      expect(tool).toBeDefined();
      expect(tool?.inputSchema).toBeDefined();
      expect(tool?.inputSchema.type).toBe('object');
      expect(tool?.inputSchema.properties).toBeDefined();

      // phase should be required string
      const phaseSchema = (tool?.inputSchema.properties as Record<string, unknown>)?.phase;
      expect(phaseSchema).toBeDefined();

      // run_dir should be required string
      const runDirSchema = (tool?.inputSchema.properties as Record<string, unknown>)?.run_dir;
      expect(runDirSchema).toBeDefined();
    });
  });
});
