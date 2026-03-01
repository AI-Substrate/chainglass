/**
 * Tests for InputOutputCardList component and validation utilities.
 *
 * Plan 058, Phase 3, T007.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import type { InputOutputItem } from '@/features/058-workunit-editor/components/input-output-card';
import {
  hydrateClientIds,
  stripClientIds,
  validateItems,
} from '@/features/058-workunit-editor/components/input-output-card-list';

// ─── hydrateClientIds ────────────────────────────────────────────────

describe('hydrateClientIds', () => {
  it('assigns unique _clientId to each item', () => {
    const items = [
      { name: 'input_a', type: 'data' as const, data_type: 'text' as const, required: true },
      { name: 'input_b', type: 'file' as const, required: false },
    ];
    const hydrated = hydrateClientIds(items);

    expect(hydrated).toHaveLength(2);
    expect(hydrated[0]._clientId).toBeDefined();
    expect(hydrated[1]._clientId).toBeDefined();
    expect(hydrated[0]._clientId).not.toBe(hydrated[1]._clientId);
    // Original fields preserved
    expect(hydrated[0].name).toBe('input_a');
    expect(hydrated[1].type).toBe('file');
  });

  it('handles empty array', () => {
    expect(hydrateClientIds([])).toEqual([]);
  });
});

// ─── stripClientIds ──────────────────────────────────────────────────

describe('stripClientIds', () => {
  it('removes _clientId from all items', () => {
    const items: InputOutputItem[] = [
      {
        _clientId: 'abc-123',
        name: 'input_a',
        type: 'data',
        data_type: 'text',
        required: true,
      },
    ];
    const stripped = stripClientIds(items);

    expect(stripped).toHaveLength(1);
    expect(stripped[0]).toEqual({
      name: 'input_a',
      type: 'data',
      data_type: 'text',
      required: true,
    });
    expect('_clientId' in stripped[0]).toBe(false);
  });
});

// ─── validateItems ───────────────────────────────────────────────────

describe('validateItems', () => {
  function makeItem(overrides: Partial<InputOutputItem> = {}): InputOutputItem {
    return {
      _clientId: crypto.randomUUID(),
      name: 'valid_name',
      type: 'data',
      data_type: 'text',
      required: true,
      ...overrides,
    };
  }

  it('returns empty errors for valid items', () => {
    const items = [makeItem({ name: 'input_a' }), makeItem({ name: 'input_b' })];
    expect(validateItems(items)).toEqual({});
  });

  it('flags empty name as required', () => {
    const item = makeItem({ name: '' });
    const errors = validateItems([item]);
    expect(errors[item._clientId]).toBeDefined();
    expect(errors[item._clientId].some((e) => e.field === 'name')).toBe(true);
  });

  it('flags invalid name format', () => {
    const item = makeItem({ name: 'Invalid-Name' });
    const errors = validateItems([item]);
    expect(errors[item._clientId]).toBeDefined();
    expect(errors[item._clientId][0].field).toBe('name');
    expect(errors[item._clientId][0].message).toContain('a-z');
  });

  it('flags names starting with number', () => {
    const item = makeItem({ name: '0invalid' });
    const errors = validateItems([item]);
    expect(errors[item._clientId]).toBeDefined();
  });

  it('accepts valid snake_case names', () => {
    const item = makeItem({ name: 'my_input_123' });
    expect(validateItems([item])).toEqual({});
  });

  it('flags duplicate names on both occurrences', () => {
    const item1 = makeItem({ name: 'dup_name' });
    const item2 = makeItem({ name: 'dup_name' });
    const errors = validateItems([item1, item2]);

    expect(errors[item1._clientId]).toBeDefined();
    expect(errors[item2._clientId]).toBeDefined();
    expect(errors[item1._clientId].some((e) => e.message === 'Duplicate name')).toBe(true);
    expect(errors[item2._clientId].some((e) => e.message === 'Duplicate name')).toBe(true);
  });

  it('flags missing data_type when type is data', () => {
    const item = makeItem({ type: 'data', data_type: undefined });
    const errors = validateItems([item]);
    expect(errors[item._clientId]).toBeDefined();
    expect(errors[item._clientId].some((e) => e.field === 'data_type')).toBe(true);
  });

  it('does not flag missing data_type when type is file', () => {
    const item = makeItem({ type: 'file', data_type: undefined });
    expect(validateItems([item])).toEqual({});
  });

  it('allows reserved-style names with hyphens to fail regex', () => {
    // Reserved params use hyphens — user names can't collide because regex rejects hyphens
    const item = makeItem({ name: 'main-prompt' });
    const errors = validateItems([item]);
    expect(errors[item._clientId]).toBeDefined();
    expect(errors[item._clientId][0].field).toBe('name');
  });
});
