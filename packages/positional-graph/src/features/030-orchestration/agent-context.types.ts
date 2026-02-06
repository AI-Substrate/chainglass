/**
 * Non-schema types for AgentContextService.
 *
 * Type guards for ContextSourceResult narrowing.
 * IAgentContextService interface for injection.
 *
 * @packageDocumentation
 */

import type {
  ContextSourceResult,
  InheritContextResult,
  NewContextResult,
  NotApplicableResult,
} from './agent-context.schema.js';
import type { PositionalGraphReality } from './reality.types.js';

// ── Type Guards ─────────────────────────────────────

export function isInheritContext(result: ContextSourceResult): result is InheritContextResult {
  return result.source === 'inherit';
}

export function isNewContext(result: ContextSourceResult): result is NewContextResult {
  return result.source === 'new';
}

export function isNotApplicable(result: ContextSourceResult): result is NotApplicableResult {
  return result.source === 'not-applicable';
}

// ── IAgentContextService Interface ──────────────────

export interface IAgentContextService {
  getContextSource(reality: PositionalGraphReality, nodeId: string): ContextSourceResult;
}
