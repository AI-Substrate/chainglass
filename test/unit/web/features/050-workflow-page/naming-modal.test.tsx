/**
 * NamingModal tests — kebab-case validation and creation flow.
 *
 * Phase 3: Drag-and-Drop + Persistence — Plan 050
 * AC-21, AC-22, AC-22b
 */

import { NamingModal, validateSlug } from '@/features/050-workflow-page/components/naming-modal';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('validateSlug', () => {
  it('returns null for valid slugs', () => {
    expect(validateSlug('my-workflow')).toBeNull();
    expect(validateSlug('test')).toBeNull();
    expect(validateSlug('a1b2-c3d4')).toBeNull();
  });

  it('rejects empty string', () => {
    expect(validateSlug('')).toBe('Name is required');
  });

  it('rejects uppercase', () => {
    expect(validateSlug('MyWorkflow')).not.toBeNull();
  });

  it('rejects starting with number', () => {
    expect(validateSlug('1workflow')).not.toBeNull();
  });

  it('rejects spaces', () => {
    expect(validateSlug('my workflow')).not.toBeNull();
  });

  it('rejects special characters', () => {
    expect(validateSlug('my_workflow')).not.toBeNull();
    expect(validateSlug('my.workflow')).not.toBeNull();
  });
});

describe('NamingModal', () => {
  it('renders with title and input', () => {
    render(<NamingModal title="New Workflow" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('New Workflow')).toBeDefined();
    expect(screen.getByTestId('naming-input')).toBeDefined();
  });

  it('disables confirm button when input is empty', () => {
    render(<NamingModal title="New" onConfirm={() => {}} onCancel={() => {}} />);
    const btn = screen.getByTestId('naming-confirm');
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('enables confirm button for valid slug', () => {
    render(<NamingModal title="New" onConfirm={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId('naming-input'), { target: { value: 'valid-slug' } });
    const btn = screen.getByTestId('naming-confirm');
    expect(btn.hasAttribute('disabled')).toBe(false);
  });

  it('shows error for invalid slug', () => {
    render(<NamingModal title="New" onConfirm={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId('naming-input'), {
      target: { value: '1-starts-with-number' },
    });
    expect(screen.getByTestId('naming-error')).toBeDefined();
  });

  it('calls onConfirm with slug value', () => {
    const onConfirm = vi.fn();
    render(<NamingModal title="New" onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId('naming-input'), { target: { value: 'test-wf' } });
    fireEvent.click(screen.getByTestId('naming-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('test-wf');
  });

  it('calls onCancel on cancel button', () => {
    const onCancel = vi.fn();
    render(<NamingModal title="New" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('pre-fills initial value', () => {
    render(
      <NamingModal
        title="Save"
        initialValue="my-graph"
        onConfirm={() => {}}
        onCancel={() => {}}
        confirmLabel="Save"
      />
    );
    const input = screen.getByTestId('naming-input') as HTMLInputElement;
    expect(input.value).toBe('my-graph');
  });
});
