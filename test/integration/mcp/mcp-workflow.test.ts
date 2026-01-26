/**
 * MCP Workflow Integration Tests (E2E)
 *
 * Per Phase 5: MCP Integration - Tests full workflow via MCP tools.
 * Per ADR-0001: E2E tests verify complete compose→prepare→validate→finalize flow.
 *
 * These tests use the real MCP server via subprocess, verifying:
 * - All workflow tools are discoverable
 * - Tool invocations return CommandResponse envelope
 * - Full workflow flow works end-to-end
 * - STDIO compliance (stdout = JSON-RPC only)
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type McpTestClient, createTestClient } from '../../base/mcp-test.js';

// Path to development exemplar template
const projectRoot = path.resolve(import.meta.dirname, '../../..');
const exemplarTemplatePath = path.join(projectRoot, 'dev/examples/wf/template/hello-workflow');

describe('MCP Workflow Integration - E2E', () => {
  let testClient: McpTestClient | null = null;
  let tempDir: string;

  beforeAll(() => {
    // Create temp directory for test runs
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-wf-test-'));
  });

  afterAll(() => {
    // Cleanup temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await testClient?.close();
    testClient = null;
  });

  describe('tool discovery', () => {
    it('should list all workflow and phase tools', async () => {
      /*
      Test Doc:
      - Why: Agents need to discover all workflow tools for autonomous operation
      - Contract: listTools() returns wf_compose, phase_prepare, phase_validate, phase_finalize
      - Usage Notes: Create client, call listTools(), verify all 4 tools present
      - Quality Contribution: Catches missing tool registration
      - Worked Example: listTools().tools includes all 4 workflow tools
      */
      testClient = await createTestClient();

      const toolsResult = await testClient.client.listTools();

      const toolNames = toolsResult.tools.map((t) => t.name);
      expect(toolNames).toContain('wf_compose');
      expect(toolNames).toContain('phase_prepare');
      expect(toolNames).toContain('phase_validate');
      expect(toolNames).toContain('phase_finalize');
    });

    it('should have consistent annotations for all workflow tools', async () => {
      /*
      Test Doc:
      - Why: Agents rely on annotations for safety decisions
      - Contract: Each tool has all 4 annotation hints defined
      - Usage Notes: Check each tool's annotations after listTools()
      - Quality Contribution: Catches inconsistent annotation patterns
      - Worked Example: Every workflow tool has readOnlyHint, destructiveHint, idempotentHint, openWorldHint
      */
      testClient = await createTestClient();

      const toolsResult = await testClient.client.listTools();
      const workflowTools = toolsResult.tools.filter((t) =>
        ['wf_compose', 'phase_prepare', 'phase_validate', 'phase_finalize'].includes(t.name)
      );

      for (const tool of workflowTools) {
        expect(tool.annotations).toBeDefined();
        expect(tool.annotations).toHaveProperty('readOnlyHint');
        expect(tool.annotations).toHaveProperty('destructiveHint');
        expect(tool.annotations).toHaveProperty('idempotentHint');
        expect(tool.annotations).toHaveProperty('openWorldHint');
      }
    });
  });

  describe('wf_compose integration', () => {
    it('should return CommandResponse envelope on success', async () => {
      /*
      Test Doc:
      - Why: MCP must return same envelope format as CLI --json for agent parsing
      - Contract: wf_compose returns { success, command, timestamp, data }
      - Usage Notes: Use exemplar template path for reliable success
      - Quality Contribution: Catches envelope format inconsistencies
      - Worked Example: wf_compose({ template_slug: exemplarPath }) returns success envelope
      */
      testClient = await createTestClient();

      const runsDir = path.join(tempDir, 'runs-success');
      fs.mkdirSync(runsDir, { recursive: true });

      const result = await testClient.client.callTool({
        name: 'wf_compose',
        arguments: {
          template_slug: exemplarTemplatePath,
          runs_dir: runsDir,
        },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
      expect(response.success).toBe(true);
      expect(response.command).toBe('wf.compose');
      expect(response.timestamp).toBeDefined();
      expect(response.data).toBeDefined();
      expect(response.data.runDir).toContain(runsDir);
      expect(response.data.template).toBe('hello-workflow');
      expect(response.data.phases).toBeDefined();
    });

    it('should return CommandResponse error envelope on failure', async () => {
      /*
      Test Doc:
      - Why: Agents need structured errors for autonomous recovery
      - Contract: wf_compose returns { success: false, error: { code, message, action } }
      - Usage Notes: Use nonexistent template to trigger E030 error (workflow not found in registry)
      - Quality Contribution: Catches missing error formatting
      - Worked Example: wf_compose({ template_slug: 'nonexistent' }) returns error envelope
      */
      testClient = await createTestClient();

      const result = await testClient.client.callTool({
        name: 'wf_compose',
        arguments: {
          template_slug: 'definitely-not-a-real-template',
          runs_dir: path.join(tempDir, 'runs-error'),
        },
      });

      expect(result.content).toBeDefined();
      const response = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);

      expect(response.success).toBe(false);
      expect(response.command).toBe('wf.compose');
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe('E030'); // E030 = workflow not found in registry (Phase 3)
      expect(response.error.action).toBeDefined();
    });
  });

  describe('phase_prepare integration', () => {
    let runDir: string;

    beforeAll(async () => {
      // Create a run to test with
      const runsDir = path.join(tempDir, 'runs-prepare');
      fs.mkdirSync(runsDir, { recursive: true });

      const tempClient = await createTestClient();
      try {
        const result = await tempClient.client.callTool({
          name: 'wf_compose',
          arguments: {
            template_slug: exemplarTemplatePath,
            runs_dir: runsDir,
          },
        });
        const response = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
        runDir = response.data.runDir;
      } finally {
        await tempClient.close();
      }
    });

    it('should return CommandResponse envelope on success', async () => {
      /*
      Test Doc:
      - Why: phase_prepare must return structured envelope for agent parsing
      - Contract: phase_prepare returns { success, command, timestamp, data }
      - Usage Notes: Use run created in beforeAll, prepare 'gather' phase
      - Quality Contribution: Catches envelope format inconsistencies
      - Worked Example: phase_prepare({ phase: 'gather', run_dir }) returns success envelope
      */
      testClient = await createTestClient();

      const result = await testClient.client.callTool({
        name: 'phase_prepare',
        arguments: {
          phase: 'gather',
          run_dir: runDir,
        },
      });

      expect(result.content).toBeDefined();
      const response = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);

      expect(response.success).toBe(true);
      expect(response.command).toBe('phase.prepare');
      expect(response.data).toBeDefined();
      expect(response.data.phase).toBe('gather');
      expect(response.data.status).toBe('ready');
    });

    it('should return E020 error for nonexistent phase', async () => {
      /*
      Test Doc:
      - Why: Agents need clear errors when phase doesn't exist
      - Contract: phase_prepare returns error with code E020
      - Usage Notes: Use valid run but nonexistent phase name
      - Quality Contribution: Catches missing error codes
      - Worked Example: phase_prepare({ phase: 'nonexistent' }) returns E020
      */
      testClient = await createTestClient();

      const result = await testClient.client.callTool({
        name: 'phase_prepare',
        arguments: {
          phase: 'nonexistent-phase',
          run_dir: runDir,
        },
      });

      expect(result.content).toBeDefined();
      const response = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('E020');
    });
  });

  describe('STDIO compliance (T011)', () => {
    it('should log to stderr only, not stdout', async () => {
      /*
      Test Doc:
      - Why: STDIO mode reserves stdout for JSON-RPC; logs must go to stderr
      - Contract: Server logs appear in stderr capture, not polluting stdout
      - Usage Notes: createTestClient captures stderr; verify logs present there
      - Quality Contribution: Catches stdout pollution that breaks MCP protocol
      - Worked Example: testClient.stderr contains log messages after tool calls
      */
      testClient = await createTestClient();

      // Make a tool call to generate log output
      await testClient.client.callTool({
        name: 'check_health',
        arguments: {},
      });

      // Stderr should have log entries (startup + tool invocation)
      const stderrOutput = testClient.stderr.join('');
      expect(stderrOutput.length).toBeGreaterThan(0);

      // The fact that callTool succeeded means stdout wasn't polluted
      // (if it were, JSON-RPC parsing would fail)
    });
  });
});
