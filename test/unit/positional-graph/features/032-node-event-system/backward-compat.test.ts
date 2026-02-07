/*
Test Doc:
- Why: Verify old state.json files without the events array still parse correctly (AC-17)
- Contract: NodeStateEntrySchema accepts entries with and without events; StateSchema accepts old and new format
- Usage Notes: The events field is .optional() — old state files omit it entirely
- Quality Contribution: Catches regressions if events field becomes required or if old status values break parsing
- Worked Example: { status: 'starting' } parses successfully (no events); { status: 'starting', events: [] } also parses
*/

import { describe, expect, it } from 'vitest';

import {
  NodeStateEntrySchema,
  StateSchema,
} from '../../../../../packages/positional-graph/src/schemas/state.schema.js';

describe('Backward compatibility: state.json without events', () => {
  it('parses a NodeStateEntry without events field', () => {
    /*
    Test Doc:
    - Why: Old state.json entries have no events array
    - Contract: NodeStateEntrySchema.safeParse succeeds when events is absent
    - Usage Notes: This is the most common case during migration
    - Quality Contribution: Catches if events becomes required
    - Worked Example: { status: 'starting' } → success, events undefined
    */
    const entry = { status: 'starting', started_at: '2026-02-07T10:00:00.000Z' };
    const result = NodeStateEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.events).toBeUndefined();
    }
  });

  it('parses a NodeStateEntry with empty events array', () => {
    /*
    Test Doc:
    - Why: New entries start with an empty events array
    - Contract: NodeStateEntrySchema.safeParse succeeds when events is []
    - Usage Notes: First event raise initializes events as []
    - Quality Contribution: Catches if empty array is rejected
    - Worked Example: { status: 'agent-accepted', events: [] } → success
    */
    const entry = { status: 'agent-accepted', started_at: '2026-02-07T10:00:00.000Z', events: [] };
    const result = NodeStateEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.events).toEqual([]);
    }
  });

  it('parses a full old-format state.json without events on any node', () => {
    /*
    Test Doc:
    - Why: Full state.json from before Phase 2 has no events anywhere
    - Contract: StateSchema.safeParse succeeds for complete old-format state
    - Usage Notes: Exercises the full schema chain including node records
    - Quality Contribution: Catches cascading parse failures from the events addition
    - Worked Example: { graph_status: 'in_progress', nodes: { 'n1': { status: 'starting' } } } → success
    */
    const oldState = {
      graph_status: 'in_progress',
      updated_at: '2026-02-07T10:00:00.000Z',
      nodes: {
        'node-1': { status: 'starting', started_at: '2026-02-07T10:00:00.000Z' },
        'node-2': {
          status: 'complete',
          started_at: '2026-02-07T09:00:00.000Z',
          completed_at: '2026-02-07T09:30:00.000Z',
        },
      },
    };
    const result = StateSchema.safeParse(oldState);
    expect(result.success).toBe(true);
  });

  it('parses a new-format state.json with events on one node', () => {
    /*
    Test Doc:
    - Why: During migration, some nodes have events and some don't
    - Contract: StateSchema.safeParse succeeds for mixed state (some nodes with events, some without)
    - Usage Notes: Events are per-node — migration is incremental
    - Quality Contribution: Catches if mixed state is rejected
    - Worked Example: node-1 has events, node-2 doesn't → both parse
    */
    const newState = {
      graph_status: 'in_progress',
      updated_at: '2026-02-07T10:00:00.000Z',
      nodes: {
        'node-1': {
          status: 'agent-accepted',
          started_at: '2026-02-07T10:00:00.000Z',
          events: [
            {
              event_id: 'evt_abc123_1234',
              event_type: 'node:accepted',
              source: 'agent',
              payload: {},
              status: 'handled',
              stops_execution: false,
              created_at: '2026-02-07T10:00:01.000Z',
              acknowledged_at: '2026-02-07T10:00:01.000Z',
              handled_at: '2026-02-07T10:00:01.000Z',
            },
          ],
        },
        'node-2': { status: 'starting', started_at: '2026-02-07T10:00:00.000Z' },
      },
    };
    const result = StateSchema.safeParse(newState);
    expect(result.success).toBe(true);
  });

  it('rejects old "running" status value', () => {
    /*
    Test Doc:
    - Why: The 'running' status has been removed — it must not parse
    - Contract: NodeStateEntrySchema.safeParse fails for status 'running'
    - Usage Notes: Any old state.json with 'running' needs migration
    - Quality Contribution: Catches if 'running' is accidentally re-added to the enum
    - Worked Example: { status: 'running' } → failure
    */
    const entry = { status: 'running' };
    const result = NodeStateEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });

  it('accepts all new status values', () => {
    /*
    Test Doc:
    - Why: Verify all new enum values are accepted
    - Contract: Each of starting, agent-accepted, waiting-question, blocked-error, complete parse successfully
    - Usage Notes: Exercises the complete enum
    - Quality Contribution: Catches if any status value is missing from the enum
    - Worked Example: { status: 'starting' } → success for each status
    */
    const statuses = [
      'starting',
      'agent-accepted',
      'waiting-question',
      'blocked-error',
      'complete',
    ];
    for (const status of statuses) {
      const result = NodeStateEntrySchema.safeParse({ status });
      expect(result.success, `Expected '${status}' to be valid`).toBe(true);
    }
  });
});
