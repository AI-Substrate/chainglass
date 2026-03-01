/**
 * Tests for InputOutputCardList component and validation utilities.
 *
 * Plan 058, Phase 3, T007.
 *
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { InputOutputItem } from '@/features/058-workunit-editor/components/input-output-card';
import {
  InputOutputCardList,
  hydrateClientIds,
  stripClientIds,
  validateItems,
} from '@/features/058-workunit-editor/components/input-output-card-list';

// ─── Helper ──────────────────────────────────────────────────────────

let idCounter = 0;
function makeItem(overrides: Partial<InputOutputItem> = {}): InputOutputItem {
  idCounter += 1;
  return {
    _clientId: `test-id-${idCounter}`,
    name: 'valid_name',
    type: 'data',
    data_type: 'text',
    required: true,
    ...overrides,
  };
}

// ─── hydrateClientIds ────────────────────────────────────────────────

describe('hydrateClientIds', () => {
  it('assigns unique _clientId to each item', () => {
    /*
    Test Doc:
    - Why: Preserve stable sortable identity for drag operations
    - Contract: hydrateClientIds returns one unique _clientId per item
    - Usage Notes: Input items from server must be hydrated before rendering
    - Quality Contribution: Catches identity collisions that break DnD reorder
    - Worked Example: [{name:'a'},{name:'b'}] => two distinct _clientId values
    */
    const items = [
      { name: 'input_a', type: 'data' as const, data_type: 'text' as const, required: true },
      { name: 'input_b', type: 'file' as const, required: false },
    ];
    const hydrated = hydrateClientIds(items);

    expect(hydrated).toHaveLength(2);
    expect(hydrated[0]._clientId).toBeDefined();
    expect(hydrated[1]._clientId).toBeDefined();
    expect(hydrated[0]._clientId).not.toBe(hydrated[1]._clientId);
    expect(hydrated[0].name).toBe('input_a');
    expect(hydrated[1].type).toBe('file');
  });

  it('handles empty array', () => {
    /*
    Test Doc:
    - Why: Empty inputs are valid (units can have zero user-defined inputs)
    - Contract: hydrateClientIds([]) returns []
    - Usage Notes: New units start with empty inputs array
    - Quality Contribution: Prevents crash on fresh unit with no inputs
    - Worked Example: [] => []
    */
    expect(hydrateClientIds([])).toEqual([]);
  });
});

// ─── stripClientIds ──────────────────────────────────────────────────

describe('stripClientIds', () => {
  it('removes _clientId from all items', () => {
    /*
    Test Doc:
    - Why: _clientId is synthetic for UI — must not be persisted to unit.yaml
    - Contract: stripClientIds removes _clientId, preserves all other fields
    - Usage Notes: Always strip before sending to updateUnit server action
    - Quality Contribution: Prevents corrupt YAML with unknown _clientId field
    - Worked Example: [{_clientId:'x', name:'a'}] => [{name:'a'}]
    */
    const items: InputOutputItem[] = [
      { _clientId: 'abc-123', name: 'input_a', type: 'data', data_type: 'text', required: true },
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
  it('returns empty errors for valid items', () => {
    /*
    Test Doc:
    - Why: Valid items must pass without false positives
    - Contract: validateItems returns {} for well-formed items with unique names
    - Usage Notes: Called on every change; empty errors enables save
    - Quality Contribution: Ensures valid input doesn't block save flow
    - Worked Example: [{name:'input_a'},{name:'input_b'}] => {}
    */
    const items = [makeItem({ name: 'input_a' }), makeItem({ name: 'input_b' })];
    expect(validateItems(items)).toEqual({});
  });

  it('flags empty name as required', () => {
    /*
    Test Doc:
    - Why: Empty names produce invalid YAML and break workflow wiring
    - Contract: validateItems flags name='' with 'Name is required' error
    - Usage Notes: New cards start with name='' so error shows immediately
    - Quality Contribution: Prevents saving unnamed inputs that can't be wired
    - Worked Example: [{name:''}] => {id: [{field:'name', message:'Name is required'}]}
    */
    const item = makeItem({ name: '' });
    const errors = validateItems([item]);
    expect(errors[item._clientId]).toBeDefined();
    expect(errors[item._clientId].some((e) => e.field === 'name')).toBe(true);
  });

  it('flags invalid name format', () => {
    /*
    Test Doc:
    - Why: Input names must match /^[a-z][a-z0-9_]*$/ per schema contract
    - Contract: validateItems rejects names with uppercase/hyphens/special chars
    - Usage Notes: Regex prevents collision with reserved params (which use hyphens)
    - Quality Contribution: Catches names that would fail Zod server-side validation
    - Worked Example: [{name:'Invalid-Name'}] => error on 'name' field
    */
    const item = makeItem({ name: 'Invalid-Name' });
    const errors = validateItems([item]);
    expect(errors[item._clientId]).toBeDefined();
    expect(errors[item._clientId][0].field).toBe('name');
    expect(errors[item._clientId][0].message).toContain('a-z');
  });

  it('flags names starting with number', () => {
    /*
    Test Doc:
    - Why: Schema requires names start with lowercase letter
    - Contract: validateItems rejects names starting with digits
    - Usage Notes: Common user mistake when naming params like '1st_input'
    - Quality Contribution: Matches server-side Zod InputNameSchema validation
    - Worked Example: [{name:'0invalid'}] => error on 'name' field
    */
    const item = makeItem({ name: '0invalid' });
    const errors = validateItems([item]);
    expect(errors[item._clientId]).toBeDefined();
  });

  it('accepts valid snake_case names', () => {
    /*
    Test Doc:
    - Why: snake_case with digits is the valid naming convention
    - Contract: validateItems accepts /^[a-z][a-z0-9_]*$/ names
    - Usage Notes: Confirms regex doesn't over-reject valid names
    - Quality Contribution: Prevents false rejections of correct names
    - Worked Example: [{name:'my_input_123'}] => {}
    */
    const item = makeItem({ name: 'my_input_123' });
    expect(validateItems([item])).toEqual({});
  });

  it('flags duplicate names on both occurrences', () => {
    /*
    Test Doc:
    - Why: Duplicate input names break workflow wiring (ambiguous source)
    - Contract: validateItems marks BOTH items with 'Duplicate name' error
    - Usage Notes: Marking both helps user identify which to rename
    - Quality Contribution: Prevents subtle bugs where wrong input is wired
    - Worked Example: [{name:'dup'},{name:'dup'}] => errors on both _clientIds
    */
    const item1 = makeItem({ name: 'dup_name' });
    const item2 = makeItem({ name: 'dup_name' });
    const errors = validateItems([item1, item2]);

    expect(errors[item1._clientId]).toBeDefined();
    expect(errors[item2._clientId]).toBeDefined();
    expect(errors[item1._clientId].some((e) => e.message === 'Duplicate name')).toBe(true);
    expect(errors[item2._clientId].some((e) => e.message === 'Duplicate name')).toBe(true);
  });

  it('flags missing data_type when type is data', () => {
    /*
    Test Doc:
    - Why: data_type is required for type='data' to determine serialization
    - Contract: validateItems flags missing data_type when type='data'
    - Usage Notes: AC-13: data_type conditional on type — required for data, hidden for file
    - Quality Contribution: Prevents saving data inputs without type info
    - Worked Example: [{type:'data',data_type:undefined}] => error on 'data_type'
    */
    const item = makeItem({ type: 'data', data_type: undefined });
    const errors = validateItems([item]);
    expect(errors[item._clientId]).toBeDefined();
    expect(errors[item._clientId].some((e) => e.field === 'data_type')).toBe(true);
  });

  it('does not flag missing data_type when type is file', () => {
    /*
    Test Doc:
    - Why: File inputs don't need data_type — they transfer binary content
    - Contract: validateItems accepts type='file' without data_type
    - Usage Notes: AC-13: data_type hidden when type='file'
    - Quality Contribution: Prevents false validation errors on file inputs
    - Worked Example: [{type:'file',data_type:undefined}] => {}
    */
    const item = makeItem({ type: 'file', data_type: undefined });
    expect(validateItems([item])).toEqual({});
  });

  it('rejects reserved-style names with hyphens', () => {
    /*
    Test Doc:
    - Why: Reserved params use hyphens (main-prompt); regex rejects hyphens
    - Contract: validateItems rejects 'main-prompt' as invalid name format
    - Usage Notes: DYK R1-#3: collision impossible by design — regex vs hyphens
    - Quality Contribution: Confirms regex serves as implicit reserved-name guard
    - Worked Example: [{name:'main-prompt'}] => error on 'name' field
    */
    const item = makeItem({ name: 'main-prompt' });
    const errors = validateItems([item]);
    expect(errors[item._clientId]).toBeDefined();
    expect(errors[item._clientId][0].field).toBe('name');
  });
});

// ─── InputOutputCardList interactions (AC-10, AC-11, AC-14, AC-15) ───

describe('InputOutputCardList interactions', () => {
  it('renders items with correct labels and count badge', () => {
    /*
    Test Doc:
    - Why: Users need to see their input definitions at a glance
    - Contract: List renders section heading, count badge, and item names
    - Usage Notes: AC-10/11: add/edit/reorder/remove inputs and outputs
    - Quality Contribution: Validates basic rendering contract of the list
    - Worked Example: 2 items => heading 'Inputs', badge '2', both names visible
    */
    const items = [makeItem({ name: 'alpha' }), makeItem({ name: 'beta' })];
    render(
      <InputOutputCardList
        label="Inputs"
        items={items}
        onStructuralChange={() => {}}
        onFieldChange={() => {}}
      />
    );

    expect(screen.getByText('Inputs')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('calls onStructuralChange with new item when Add is clicked', async () => {
    /*
    Test Doc:
    - Why: Users must be able to add new input/output definitions
    - Contract: Clicking Add button calls onStructuralChange with appended item
    - Usage Notes: AC-10: add inputs; new item has default type='data', required=true
    - Quality Contribution: Validates the primary add interaction path
    - Worked Example: Click Add => onStructuralChange called with 2 items (original + new)
    */
    const user = userEvent.setup();
    const onChange = vi.fn();
    const items = [makeItem({ name: 'existing' })];

    render(
      <InputOutputCardList
        label="Inputs"
        items={items}
        onStructuralChange={onChange}
        onFieldChange={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: /add input/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const newItems = onChange.mock.calls[0][0];
    expect(newItems).toHaveLength(2);
    expect(newItems[0].name).toBe('existing');
    expect(newItems[1].name).toBe('');
    expect(newItems[1].type).toBe('data');
  });

  it('shows empty state message when no items', () => {
    /*
    Test Doc:
    - Why: Empty list must guide user to add their first input
    - Contract: Empty items array renders helpful empty-state message
    - Usage Notes: DYK R2-#4: new units scaffold with empty inputs
    - Quality Contribution: Prevents blank/confusing UI for new units
    - Worked Example: items=[] => "No inputs defined. Click + to add an input."
    */
    render(
      <InputOutputCardList
        label="Inputs"
        items={[]}
        onStructuralChange={() => {}}
        onFieldChange={() => {}}
      />
    );

    expect(screen.getByText(/no inputs defined/i)).toBeInTheDocument();
  });

  it('renders reserved params as locked and non-draggable', () => {
    /*
    Test Doc:
    - Why: Reserved params are virtual — must be visible but not editable
    - Contract: Reserved params render with lock icon, disabled expand, no delete
    - Usage Notes: AC-14: reserved params read-only; never included in save payload
    - Quality Contribution: Prevents accidental modification of reserved routing params
    - Worked Example: reservedParams=[{name:'main-prompt'}] => locked card visible
    */
    render(
      <InputOutputCardList
        label="Inputs"
        items={[]}
        onStructuralChange={() => {}}
        onFieldChange={() => {}}
        reservedParams={[{ name: 'main-prompt', description: 'Routes to prompt' }]}
      />
    );

    expect(screen.getByText('main-prompt')).toBeInTheDocument();
    // Reserved card expand button should be disabled
    const expandBtn = screen.getByRole('button', { name: /main-prompt/i });
    expect(expandBtn).toBeDisabled();
  });

  it('blocks deleting the last output when requireMinOne is true', () => {
    /*
    Test Doc:
    - Why: Work units must have at least one output to be wired in workflows
    - Contract: Delete button is disabled when requireMinOne and items.length <= 1
    - Usage Notes: AC-15: at least one output enforced
    - Quality Contribution: Prevents creating un-wirable units with zero outputs
    - Worked Example: 1 output + requireMinOne => delete button disabled
    */
    const items = [makeItem({ name: 'only_output' })];
    render(
      <InputOutputCardList
        label="Outputs"
        items={items}
        onStructuralChange={() => {}}
        onFieldChange={() => {}}
        requireMinOne
      />
    );

    const deleteBtn = screen.getByRole('button', { name: /cannot delete last output/i });
    expect(deleteBtn).toBeDisabled();
  });
});
