/**
 * WorkUnitToolbox tests — grouping, search, empty state.
 *
 * Phase 2: Canvas Core + Layout — Plan 050
 * AC-06
 */

import { WorkUnitToolbox } from '@/features/050-workflow-page/components/work-unit-toolbox';
import type { WorkUnitSummary } from '@chainglass/positional-graph';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const SAMPLE_UNITS: WorkUnitSummary[] = [
  { slug: 'sample-coder', type: 'agent', version: '1.0.0' },
  { slug: 'sample-pr-creator', type: 'code', version: '1.0.0' },
  { slug: 'sample-input', type: 'user-input', version: '1.0.0' },
  { slug: 'another-agent', type: 'agent', version: '1.0.0' },
];

describe('WorkUnitToolbox', () => {
  it('renders empty state when no units', () => {
    render(<WorkUnitToolbox units={[]} />);
    expect(screen.getByTestId('toolbox-empty')).toBeDefined();
    expect(screen.getByText('No work units found.')).toBeDefined();
  });

  it('groups units by type', () => {
    render(<WorkUnitToolbox units={SAMPLE_UNITS} />);
    expect(screen.getByTestId('toolbox-group-agent')).toBeDefined();
    expect(screen.getByTestId('toolbox-group-code')).toBeDefined();
    expect(screen.getByTestId('toolbox-group-user-input')).toBeDefined();
    expect(screen.getByText(/Agents \(2\)/)).toBeDefined();
    expect(screen.getByText(/Code \(1\)/)).toBeDefined();
    expect(screen.getByText(/Human Input \(1\)/)).toBeDefined();
  });

  it('renders individual unit items', () => {
    render(<WorkUnitToolbox units={SAMPLE_UNITS} />);
    expect(screen.getByTestId('toolbox-unit-sample-coder')).toBeDefined();
    expect(screen.getByTestId('toolbox-unit-sample-pr-creator')).toBeDefined();
    expect(screen.getByTestId('toolbox-unit-sample-input')).toBeDefined();
  });

  it('filters units by search', () => {
    render(<WorkUnitToolbox units={SAMPLE_UNITS} />);
    const search = screen.getByTestId('toolbox-search');
    fireEvent.change(search, { target: { value: 'coder' } });

    expect(screen.getByTestId('toolbox-unit-sample-coder')).toBeDefined();
    expect(screen.queryByTestId('toolbox-unit-sample-pr-creator')).toBeNull();
    expect(screen.queryByTestId('toolbox-unit-sample-input')).toBeNull();
  });

  it('collapses groups on click', () => {
    render(<WorkUnitToolbox units={SAMPLE_UNITS} />);

    // Agent group should show units initially
    expect(screen.getByTestId('toolbox-unit-sample-coder')).toBeDefined();

    // Click to collapse
    fireEvent.click(screen.getByTestId('toolbox-group-agent'));

    // Units should be hidden
    expect(screen.queryByTestId('toolbox-unit-sample-coder')).toBeNull();
  });
});
