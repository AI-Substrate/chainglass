/**
 * MCP Workflow Tool Exclusion Tests
 *
 * Per Phase 5 T017 and ADR-0001 NEG-005: Workflow management tools are NOT exposed
 * via MCP. These are CLI-only commands for user workflow management, not AI agent operations.
 *
 * Rationale: Workflow checkpoint/restore/list/info are human-centric management tasks
 * that don't benefit from AI automation. Exposing them via MCP would add unnecessary
 * complexity without value.
 */

import { FakeLogger } from '@chainglass/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMcpServer } from '../../../packages/mcp-server/src/server';

describe('MCP Workflow Tool Exclusion (ADR-0001 NEG-005)', () => {
  let logger: FakeLogger;

  beforeEach(() => {
    logger = new FakeLogger();
  });

  it('should NOT expose workflow_list tool', () => {
    /*
    Test Doc:
    - Why: Per ADR-0001 NEG-005, workflow management is CLI-only
    - Contract: MCP server toolRegistry does NOT contain workflow_list
    - Usage Notes: Users manage workflows via CLI, not AI agents
    - Quality Contribution: Prevents accidental MCP exposure
    - Worked Example: server.tools.has('workflow_list') === false
    */
    const server = createMcpServer({ logger });

    expect(server.tools.has('workflow_list')).toBe(false);
  });

  it('should NOT expose workflow_info tool', () => {
    /*
    Test Doc:
    - Why: Workflow info is user-facing CLI command
    - Contract: MCP server does NOT expose workflow_info
    - Usage Notes: AI agents don't need workflow metadata discovery
    - Quality Contribution: Maintains clear CLI/MCP boundary
    - Worked Example: server.tools.has('workflow_info') === false
    */
    const server = createMcpServer({ logger });

    expect(server.tools.has('workflow_info')).toBe(false);
  });

  it('should NOT expose workflow_checkpoint tool', () => {
    /*
    Test Doc:
    - Why: Checkpoints are human-created versioning decisions
    - Contract: MCP server does NOT expose workflow_checkpoint
    - Usage Notes: AI agents should work with existing checkpoints, not create them
    - Quality Contribution: Prevents AI agents from creating unauthorized versions
    - Worked Example: server.tools.has('workflow_checkpoint') === false
    */
    const server = createMcpServer({ logger });

    expect(server.tools.has('workflow_checkpoint')).toBe(false);
  });

  it('should NOT expose workflow_restore tool', () => {
    /*
    Test Doc:
    - Why: Restore is a potentially destructive management operation
    - Contract: MCP server does NOT expose workflow_restore
    - Usage Notes: Only humans should decide when to restore workflow versions
    - Quality Contribution: Prevents accidental version changes by AI agents
    - Worked Example: server.tools.has('workflow_restore') === false
    */
    const server = createMcpServer({ logger });

    expect(server.tools.has('workflow_restore')).toBe(false);
  });

  it('should NOT expose workflow_versions tool', () => {
    /*
    Test Doc:
    - Why: Version history is for human decision-making
    - Contract: MCP server does NOT expose workflow_versions
    - Usage Notes: AI agents use compose with specific checkpoints
    - Quality Contribution: Keeps MCP surface area minimal
    - Worked Example: server.tools.has('workflow_versions') === false
    */
    const server = createMcpServer({ logger });

    expect(server.tools.has('workflow_versions')).toBe(false);
  });

  it('should expose wf_compose tool (allowed per ADR-0001)', () => {
    /*
    Test Doc:
    - Why: wf_compose IS needed for AI agents to create runs
    - Contract: MCP server DOES expose wf_compose
    - Usage Notes: AI agents need to compose runs from checkpoints
    - Quality Contribution: Verifies wf_compose is still available
    - Worked Example: server.tools.has('wf_compose') === true
    */
    const server = createMcpServer({ logger });

    expect(server.tools.has('wf_compose')).toBe(true);
  });

  it('should expose check_health tool (exemplar per ADR-0001)', () => {
    /*
    Test Doc:
    - Why: check_health is the exemplar tool per ADR-0001
    - Contract: MCP server DOES expose check_health
    - Usage Notes: AI agents should verify system health
    - Quality Contribution: Verifies exemplar is still registered
    - Worked Example: server.tools.has('check_health') === true
    */
    const server = createMcpServer({ logger });

    expect(server.tools.has('check_health')).toBe(true);
  });
});
