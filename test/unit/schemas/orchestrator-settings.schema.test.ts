/**
 * GraphOrchestratorSettingsSchema — agentType field tests.
 *
 * Purpose: Verify GraphOrchestratorSettingsSchema validates the agentType
 * field correctly: accepts valid enum values, rejects invalid strings,
 * applies 'copilot' as default when omitted, and preserves explicit values.
 *
 * Quality Contribution: Prevents regressions in agent type validation
 * that would cause ODS to receive invalid adapter types at runtime.
 *
 * Acceptance Criteria: AC-10 (GraphOrchestratorSettingsSchema includes
 * optional agentType field defaulting to 'copilot')
 */
import { describe, expect, it } from 'vitest';
import { GraphOrchestratorSettingsSchema } from '@chainglass/positional-graph';

describe('GraphOrchestratorSettingsSchema agentType', () => {
  it('accepts claude-code', () => {
    const result = GraphOrchestratorSettingsSchema.parse({ agentType: 'claude-code' });
    expect(result.agentType).toBe('claude-code');
  });

  it('accepts copilot', () => {
    const result = GraphOrchestratorSettingsSchema.parse({ agentType: 'copilot' });
    expect(result.agentType).toBe('copilot');
  });

  it('rejects invalid agent type', () => {
    const result = GraphOrchestratorSettingsSchema.safeParse({ agentType: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('defaults to copilot when omitted', () => {
    const result = GraphOrchestratorSettingsSchema.parse({});
    expect(result.agentType).toBe('copilot');
  });

  it('preserves explicit value (does not override with default)', () => {
    const result = GraphOrchestratorSettingsSchema.parse({ agentType: 'claude-code' });
    expect(result.agentType).toBe('claude-code');
  });
});
