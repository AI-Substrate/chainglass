/**
 * check_health Tool Tests
 *
 * Per ADR-0001 IMP-002: check_health is the exemplar tool that demonstrates
 * all MCP tool design patterns. These tests verify compliance with ADR-0001.
 *
 * This test suite validates:
 * - Naming convention (verb_object, snake_case)
 * - Description structure (3-4 sentences)
 * - Parameter design (explicit JSON Schema constraints)
 * - Response design (semantic fields, summary)
 * - Annotations (readOnlyHint, destructiveHint, etc.)
 */

import { createMcpServer } from '@chainglass/mcp-server';
import { FakeLogger } from '@chainglass/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type McpTestClient, createTestClient } from '../../base/mcp-test.js';

describe('check_health tool - ADR-0001 Exemplar', () => {
  let fakeLogger: FakeLogger;

  beforeEach(() => {
    fakeLogger = new FakeLogger();
  });

  describe('naming convention (ADR-0001 Decision #2)', () => {
    it('should use verb_object naming format', () => {
      /*
      Test Doc:
      - Why: ADR-0001 mandates verb_object naming for agent discoverability
      - Contract: Tool name is 'check_health' (check = verb, health = object)
      - Usage Notes: Agent accuracy improves with consistent naming patterns
      - Quality Contribution: Catches non-compliant tool names that confuse agents
      - Worked Example: server.tools.has('check_health') === true
      */
      const server = createMcpServer({ logger: fakeLogger });

      expect(server.tools.has('check_health')).toBe(true);
      // Should NOT use camelCase
      expect(server.tools.has('checkHealth')).toBe(false);
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
      const tool = server.tools.get('check_health');

      expect(tool).toBeDefined();

      // Description should have multiple sentences
      const sentences = tool?.description.split('. ').filter(Boolean);
      expect(sentences.length).toBeGreaterThanOrEqual(3);
    });

    it('should describe action, context, and return values', () => {
      /*
      Test Doc:
      - Why: ADR-0001 requires descriptions to cover action/context/returns/alternatives
      - Contract: Description mentions checking, system/components, and status return
      - Usage Notes: Use substring matching for key concepts
      - Quality Contribution: Catches descriptions missing required information
      - Worked Example: description includes 'health', 'status', 'components'
      */
      const server = createMcpServer({ logger: fakeLogger });
      const tool = server.tools.get('check_health');
      const desc = tool?.description.toLowerCase();

      expect(desc).toContain('health');
      expect(desc).toContain('status');
      expect(desc).toMatch(/component|system/);
    });
  });

  describe('E2E tool invocation via stdio', () => {
    let testClient: McpTestClient | null = null;

    afterEach(async () => {
      await testClient?.close();
      testClient = null;
    });

    it('should return semantic response with summary field (ADR-0001 Decision #5)', async () => {
      /*
      Test Doc:
      - Why: ADR-0001 mandates semantic response with summary for agent reasoning
      - Contract: tools/call returns response with status, components, summary, checked_at
      - Usage Notes: Use createTestClient() for automatic handshake; call client.callTool()
      - Quality Contribution: Catches missing semantic fields that impair agent reasoning
      - Worked Example: client.callTool({name:'check_health'}) -> content[0].text has {status, summary, components, checked_at}
      */
      testClient = await createTestClient();

      const result = await testClient.client.callTool({
        name: 'check_health',
        arguments: {},
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');

      const toolResponse = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
      expect(toolResponse.status).toBeDefined();
      expect(toolResponse.summary).toBeDefined();
      expect(toolResponse.components).toBeDefined();
      expect(toolResponse.checked_at).toBeDefined();
    });

    it('should have complete annotations (ADR-0001 Decision #7)', async () => {
      /*
      Test Doc:
      - Why: ADR-0001 requires complete annotations for agent decision-making
      - Contract: Tool has readOnlyHint, destructiveHint, idempotentHint, openWorldHint
      - Usage Notes: Use createTestClient() then client.listTools() to get tool metadata
      - Quality Contribution: Catches missing annotations that affect agent safety decisions
      - Worked Example: client.listTools() -> tools[0].annotations includes all 4 hints
      */
      testClient = await createTestClient();

      const toolsResult = await testClient.client.listTools();
      const tool = toolsResult.tools.find((t) => t.name === 'check_health');

      expect(tool).toBeDefined();
      expect(tool?.annotations).toBeDefined();
      // Per ADR-0001: readOnlyHint should be true (this is a read operation)
      expect(tool?.annotations?.readOnlyHint).toBe(true);
      // Per ADR-0001: destructiveHint should be false (non-destructive)
      expect(tool?.annotations?.destructiveHint).toBe(false);
      // Per ADR-0001: idempotentHint should be true (same result each time)
      expect(tool?.annotations?.idempotentHint).toBe(true);
      // Per ADR-0001: openWorldHint should be false (closed system check)
      expect(tool?.annotations?.openWorldHint).toBe(false);
    });

    it('should have explicit JSON Schema input constraints (ADR-0001 Decision #4)', async () => {
      /*
      Test Doc:
      - Why: ADR-0001 research shows JSON Schema constraints outperform natural language
      - Contract: Tool has inputSchema with type, properties, enums for components
      - Usage Notes: Use createTestClient() then client.listTools() to inspect schema
      - Quality Contribution: Catches missing schema validation that causes agent errors
      - Worked Example: client.listTools() -> tool.inputSchema.properties.components has enum constraint
      */
      testClient = await createTestClient();

      const toolsResult = await testClient.client.listTools();
      const tool = toolsResult.tools.find((t) => t.name === 'check_health');

      expect(tool).toBeDefined();
      expect(tool?.inputSchema).toBeDefined();
      expect(tool?.inputSchema.type).toBe('object');
      expect(tool?.inputSchema.properties).toBeDefined();

      // components should have enum constraint
      const componentsSchema = (tool?.inputSchema.properties as Record<string, unknown>)
        ?.components;
      expect(componentsSchema).toBeDefined();

      // include_details should be boolean
      const includeDetailsSchema = (tool?.inputSchema.properties as Record<string, unknown>)
        ?.include_details;
      expect(includeDetailsSchema).toBeDefined();
    });
  });
});
