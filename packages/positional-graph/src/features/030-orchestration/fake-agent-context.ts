/**
 * FakeAgentContextService — Escape hatch for forcing context source outputs.
 *
 * ODS tests should prefer the real getContextSource() pure function by default
 * (DYK-I12). Use this fake only when you need to override context decisions
 * without constructing a full PositionalGraphReality.
 *
 * @packageDocumentation
 */

import type { ContextSourceResult } from './agent-context.schema.js';
import type { IAgentContextService } from './agent-context.types.js';
import type { PositionalGraphReality } from './reality.types.js';

interface ContextCall {
  readonly nodeId: string;
  readonly reality: PositionalGraphReality;
}

export class FakeAgentContextService implements IAgentContextService {
  private readonly overrides = new Map<string, ContextSourceResult>();
  private readonly history: ContextCall[] = [];

  /** Set a canned result for a specific nodeId. */
  setContextSource(nodeId: string, result: ContextSourceResult): void {
    this.overrides.set(nodeId, result);
  }

  /** Get the call history. */
  getHistory(): readonly ContextCall[] {
    return [...this.history];
  }

  /** Reset overrides and call history. */
  reset(): void {
    this.overrides.clear();
    this.history.length = 0;
  }

  getContextSource(reality: PositionalGraphReality, nodeId: string): ContextSourceResult {
    this.history.push({ nodeId, reality });

    const override = this.overrides.get(nodeId);
    if (override) {
      return override;
    }

    return {
      source: 'not-applicable',
      reason: `FakeAgentContextService: no override set for '${nodeId}'`,
    };
  }
}
