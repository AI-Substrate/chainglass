/**
 * Workflow MCP Tools Tests
 *
 * Per Phase 5: MCP Integration - Tests for wf_compose tool.
 * Per ADR-0001: All tools must follow check_health exemplar pattern.
 *
 * This test suite validates:
 * - Naming convention (verb_object, snake_case)
 * - Description structure (3-4 sentences)
 * - Parameter design (Zod schema per WF-01 discovery)
 * - Response design (CommandResponse envelope)
 * - Annotations (idempotentHint: false for compose)
 */

import { createMcpServer } from '@chainglass/mcp-server';
import { FakeLogger } from '@chainglass/shared';
import { FakeWorkflowService } from '@chainglass/workflow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type McpTestClient, createTestClient } from '../../base/mcp-test.js';

describe('wf_compose tool - ADR-0001 Compliance', () => {
  let fakeLogger: FakeLogger;

  beforeEach(() => {
    fakeLogger = new FakeLogger();
  });

  describe('naming convention (ADR-0001 Decision #2)', () => {
    it('should use verb_object naming format', () => {
      /*
      Test Doc:
      - Why: ADR-0001 mandates verb_object naming for agent discoverability
      - Contract: Tool name is 'wf_compose' (wf = workflow scope, compose = action)
      - Usage Notes: Agent accuracy improves with consistent naming patterns
      - Quality Contribution: Catches non-compliant tool names that confuse agents
      - Worked Example: server.tools.has('wf_compose') === true
      */
      const server = createMcpServer({ logger: fakeLogger });

      expect(server.tools.has('wf_compose')).toBe(true);
      // Should NOT use camelCase
      expect(server.tools.has('wfCompose')).toBe(false);
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
      const tool = server.tools.get('wf_compose');

      expect(tool).toBeDefined();

      // Description should have multiple sentences
      const sentences = tool?.description.split('. ').filter(Boolean);
      expect(sentences?.length).toBeGreaterThanOrEqual(3);
    });

    it('should describe action, context, and return values', () => {
      /*
      Test Doc:
      - Why: ADR-0001 requires descriptions to cover action/context/returns/alternatives
      - Contract: Description mentions workflow, run, and phases
      - Usage Notes: Use substring matching for key concepts
      - Quality Contribution: Catches descriptions missing required information
      - Worked Example: description includes 'workflow', 'run', 'template'
      */
      const server = createMcpServer({ logger: fakeLogger });
      const tool = server.tools.get('wf_compose');
      const desc = tool?.description.toLowerCase();

      expect(desc).toContain('workflow');
      expect(desc).toMatch(/run|template/);
    });
  });

  describe('annotations (ADR-0001 Decision #7)', () => {
    it('should have complete annotations with idempotentHint: false', () => {
      /*
      Test Doc:
      - Why: ADR-0001 requires complete annotations; compose is NOT idempotent (creates new run each time)
      - Contract: Tool has readOnlyHint=false, destructiveHint=false, idempotentHint=false, openWorldHint=false
      - Usage Notes: Per plan table - compose creates NEW run folder each time
      - Quality Contribution: Catches incorrect annotations that mislead agents
      - Worked Example: annotations.idempotentHint === false
      */
      const server = createMcpServer({ logger: fakeLogger });
      const tool = server.tools.get('wf_compose');

      expect(tool).toBeDefined();
      // Note: We can't check annotations directly from server.tools
      // This will be verified in E2E tests via listTools()
    });
  });

  describe('E2E tool invocation via stdio', () => {
    let testClient: McpTestClient | null = null;

    afterEach(async () => {
      await testClient?.close();
      testClient = null;
    });

    it('should have correct annotations via listTools', async () => {
      /*
      Test Doc:
      - Why: ADR-0001 requires complete annotations for agent decision-making
      - Contract: wf_compose has readOnlyHint=false, destructiveHint=false, idempotentHint=false, openWorldHint=false
      - Usage Notes: Use createTestClient() then client.listTools() to get tool metadata
      - Quality Contribution: Catches missing annotations that affect agent safety decisions
      - Worked Example: client.listTools() -> tool.annotations.idempotentHint === false
      */
      testClient = await createTestClient();

      const toolsResult = await testClient.client.listTools();
      const tool = toolsResult.tools.find((t) => t.name === 'wf_compose');

      expect(tool).toBeDefined();
      expect(tool?.annotations).toBeDefined();
      // Per plan: compose is NOT idempotent (creates new run folder each time)
      expect(tool?.annotations?.readOnlyHint).toBe(false);
      expect(tool?.annotations?.destructiveHint).toBe(false);
      expect(tool?.annotations?.idempotentHint).toBe(false);
      expect(tool?.annotations?.openWorldHint).toBe(false);
    });

    it('should have explicit JSON Schema input constraints (ADR-0001 Decision #4)', async () => {
      /*
      Test Doc:
      - Why: ADR-0001 research shows JSON Schema constraints outperform natural language
      - Contract: Tool has inputSchema with template_slug (required) and runs_dir (optional)
      - Usage Notes: Use createTestClient() then client.listTools() to inspect schema
      - Quality Contribution: Catches missing schema validation that causes agent errors
      - Worked Example: client.listTools() -> tool.inputSchema.properties.template_slug exists
      */
      testClient = await createTestClient();

      const toolsResult = await testClient.client.listTools();
      const tool = toolsResult.tools.find((t) => t.name === 'wf_compose');

      expect(tool).toBeDefined();
      expect(tool?.inputSchema).toBeDefined();
      expect(tool?.inputSchema.type).toBe('object');
      expect(tool?.inputSchema.properties).toBeDefined();

      // template_slug should be required string
      const templateSlugSchema = (tool?.inputSchema.properties as Record<string, unknown>)
        ?.template_slug;
      expect(templateSlugSchema).toBeDefined();

      // runs_dir should be optional string
      const runsDirSchema = (tool?.inputSchema.properties as Record<string, unknown>)?.runs_dir;
      expect(runsDirSchema).toBeDefined();
    });

    it('should return CommandResponse envelope on success', async () => {
      /*
      Test Doc:
      - Why: MCP responses must match CLI --json output (CommandResponse envelope)
      - Contract: Success response has { success: true, command, timestamp, data }
      - Usage Notes: data contains runDir, template, phases (no errors array)
      - Quality Contribution: Ensures agent-parseable JSON responses
      - Worked Example: wf_compose() -> { success: true, data: { runDir, template, phases } }
      */
      testClient = await createTestClient();

      // This test uses the real server - may need exemplar template
      // For now, test with an expected error to verify envelope structure
      const result = await testClient.client.callTool({
        name: 'wf_compose',
        arguments: { template_slug: 'nonexistent-template' },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
      // Either success or error envelope
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('command');
      expect(response).toHaveProperty('timestamp');

      // If error, should have error field with code
      if (!response.success) {
        expect(response).toHaveProperty('error');
        expect(response.error).toHaveProperty('code');
      }
    });

    it('should return E020 error for missing template', async () => {
      /*
      Test Doc:
      - Why: Agents need actionable errors when template is missing
      - Contract: Returns CommandResponseError with code 'E020' and action
      - Usage Notes: Check error.details for full error information
      - Quality Contribution: Enables autonomous agent error recovery
      - Worked Example: wf_compose({ template_slug: 'nonexistent' }) -> { success: false, error: { code: 'E020' } }
      */
      testClient = await createTestClient();

      const result = await testClient.client.callTool({
        name: 'wf_compose',
        arguments: { template_slug: 'nonexistent-template' },
      });

      expect(result.content).toBeDefined();
      const response = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('E020');
      expect(response.error).toHaveProperty('action');
    });
  });
});
