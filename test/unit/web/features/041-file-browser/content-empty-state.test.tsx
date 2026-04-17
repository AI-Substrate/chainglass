import { ContentEmptyState } from '@/features/041-file-browser/components/content-empty-state';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('ContentEmptyState', () => {
  it('renders heading text', () => {
    render(<ContentEmptyState />);
    expect(screen.getByText('Select a file')).toBeDefined();
  });

  it('renders FileText icon', () => {
    const { container } = render(<ContentEmptyState />);
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
  });

  it('renders Browse Files button when onBrowseFiles provided', () => {
    render(<ContentEmptyState onBrowseFiles={() => {}} />);
    expect(screen.getByRole('button', { name: /browse files/i })).toBeDefined();
  });

  it('does not render Browse Files button when onBrowseFiles not provided', () => {
    render(<ContentEmptyState />);
    expect(screen.queryByRole('button', { name: /browse files/i })).toBeNull();
  });

  it('calls onBrowseFiles when button is clicked', () => {
    const onBrowseFiles = vi.fn();
    render(<ContentEmptyState onBrowseFiles={onBrowseFiles} />);
    fireEvent.click(screen.getByRole('button', { name: /browse files/i }));
    expect(onBrowseFiles).toHaveBeenCalledOnce();
  });
});
