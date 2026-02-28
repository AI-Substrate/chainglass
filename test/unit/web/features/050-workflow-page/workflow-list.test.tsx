/**
 * WorkflowList tests — renders workflow items and empty state.
 *
 * Phase 2: Canvas Core + Layout — Plan 050
 * AC-01, AC-22b
 */

import { WorkflowList } from '@/features/050-workflow-page/components/workflow-list';
import type { WorkflowSummary } from '@/features/050-workflow-page/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const SAMPLE_WORKFLOWS: WorkflowSummary[] = [
  {
    slug: 'demo-serial',
    description: 'Two-line workflow',
    lineCount: 2,
    nodeCount: 2,
    status: 'pending',
  },
  {
    slug: 'demo-complex',
    description: 'Multi-line workflow',
    lineCount: 4,
    nodeCount: 8,
    status: 'in_progress',
  },
  { slug: 'demo-complete', lineCount: 1, nodeCount: 2, status: 'complete' },
];

describe('WorkflowList', () => {
  it('renders empty state when no workflows', () => {
    render(<WorkflowList slug="test-workspace" workflows={[]} />);
    expect(screen.getByTestId('workflow-list-empty')).toBeDefined();
    expect(screen.getByText('No workflows yet')).toBeDefined();
  });

  it('renders workflow items with names', () => {
    render(<WorkflowList slug="test-workspace" workflows={SAMPLE_WORKFLOWS} />);
    expect(screen.getByTestId('workflow-list')).toBeDefined();
    expect(screen.getByTestId('workflow-item-demo-serial')).toBeDefined();
    expect(screen.getByTestId('workflow-item-demo-complex')).toBeDefined();
    expect(screen.getByText('demo-serial')).toBeDefined();
    expect(screen.getByText('demo-complex')).toBeDefined();
  });

  it('shows description when present', () => {
    render(<WorkflowList slug="test-workspace" workflows={SAMPLE_WORKFLOWS} />);
    expect(screen.getByText('Two-line workflow')).toBeDefined();
    expect(screen.getByText('Multi-line workflow')).toBeDefined();
  });

  it('shows line and node counts', () => {
    render(<WorkflowList slug="test-workspace" workflows={SAMPLE_WORKFLOWS} />);
    expect(screen.getByText('2 lines')).toBeDefined();
    expect(screen.getByText('4 lines')).toBeDefined();
    expect(screen.getByText('8 nodes')).toBeDefined();
  });

  it('links to editor page', () => {
    render(<WorkflowList slug="my-workspace" workflows={SAMPLE_WORKFLOWS} />);
    const link = screen.getByTestId('workflow-item-demo-serial');
    expect(link.getAttribute('href')).toBe('/workspaces/my-workspace/workflows/demo-serial');
  });
});
