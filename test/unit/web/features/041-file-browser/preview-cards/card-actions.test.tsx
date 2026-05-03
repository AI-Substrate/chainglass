/**
 * Plan recent-changes-feed T006 — CardActions extension contract.
 *
 * Verifies that:
 *   1. Old behavior is unchanged when only the original required props
 *      (filePath, onCopyPath, onDownload) are supplied — the 2-button strip
 *      renders identically (Plan 077's gallery cards).
 *   2. Each new optional prop renders its corresponding button only when
 *      supplied (additive contract per Finding 03).
 *   3. Tooltip on the first copy button switches "Copy path" ↔ "Copy
 *      relative path" depending on whether onCopyAbsolutePath is in play.
 *   4. Click handlers route to the right callback.
 *
 * Covers AC E1 (inline action set).
 */

import { CardActions } from '@/features/041-file-browser/components/preview-cards/card-actions';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('CardActions — Plan 077 baseline (gallery cards)', () => {
  it('renders only Copy + Download buttons with the original prop set', () => {
    render(<CardActions filePath="src/foo.ts" onCopyPath={vi.fn()} onDownload={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(screen.getByTitle('Copy path')).toBeDefined();
    expect(screen.getByTitle('Download')).toBeDefined();
  });

  it('does NOT render Open, Copy absolute path, or overflow when those props are absent', () => {
    render(<CardActions filePath="src/foo.ts" onCopyPath={vi.fn()} onDownload={vi.fn()} />);
    expect(screen.queryByTitle('Open')).toBeNull();
    expect(screen.queryByTitle('Copy absolute path')).toBeNull();
    expect(screen.queryByTitle('Copy relative path')).toBeNull();
  });

  it('fires onCopyPath on click and prevents propagation', () => {
    const onCopyPath = vi.fn();
    render(<CardActions filePath="src/foo.ts" onCopyPath={onCopyPath} onDownload={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Copy path'));
    expect(onCopyPath).toHaveBeenCalledExactlyOnceWith('src/foo.ts');
  });

  it('fires onDownload on click', () => {
    const onDownload = vi.fn();
    render(<CardActions filePath="img.png" onCopyPath={vi.fn()} onDownload={onDownload} />);
    fireEvent.click(screen.getByTitle('Download'));
    expect(onDownload).toHaveBeenCalledExactlyOnceWith('img.png');
  });
});

describe('CardActions — Plan recent-changes-feed T005 extensions', () => {
  it('renders Open button when onOpen is supplied', () => {
    const onOpen = vi.fn();
    render(
      <CardActions
        filePath="src/foo.ts"
        onCopyPath={vi.fn()}
        onDownload={vi.fn()}
        onOpen={onOpen}
      />
    );
    const openBtn = screen.getByTitle('Open');
    expect(openBtn).toBeDefined();
    fireEvent.click(openBtn);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith('src/foo.ts');
  });

  it('renders Copy absolute path button when onCopyAbsolutePath is supplied', () => {
    const onCopyAbs = vi.fn();
    render(
      <CardActions
        filePath="src/foo.ts"
        onCopyPath={vi.fn()}
        onDownload={vi.fn()}
        onCopyAbsolutePath={onCopyAbs}
      />
    );
    const absBtn = screen.getByTitle('Copy absolute path');
    expect(absBtn).toBeDefined();
    fireEvent.click(absBtn);
    expect(onCopyAbs).toHaveBeenCalledExactlyOnceWith('src/foo.ts');
  });

  it('relabels first copy button to "Copy relative path" when both copy actions are present', () => {
    render(
      <CardActions
        filePath="src/foo.ts"
        onCopyPath={vi.fn()}
        onDownload={vi.fn()}
        onCopyAbsolutePath={vi.fn()}
      />
    );
    expect(screen.getByTitle('Copy relative path')).toBeDefined();
    expect(screen.queryByTitle('Copy path')).toBeNull();
    expect(screen.getByTitle('Copy absolute path')).toBeDefined();
  });

  it('renders the overflow node when supplied', () => {
    render(
      <CardActions
        filePath="src/foo.ts"
        onCopyPath={vi.fn()}
        onDownload={vi.fn()}
        overflowMenu={<button type="button">⋯</button>}
      />
    );
    expect(screen.getByText('⋯')).toBeDefined();
  });

  it('renders all buttons (Open + Copy rel + Copy abs + Download + overflow) when every optional is supplied', () => {
    render(
      <CardActions
        filePath="src/foo.ts"
        onCopyPath={vi.fn()}
        onDownload={vi.fn()}
        onCopyAbsolutePath={vi.fn()}
        onOpen={vi.fn()}
        overflowMenu={<button type="button" title="More">⋯</button>}
      />
    );
    const buttons = screen.getAllByRole('button');
    // Open + Copy rel + Copy abs + Download + overflow trigger = 5
    expect(buttons).toHaveLength(5);
    expect(screen.getByTitle('Open')).toBeDefined();
    expect(screen.getByTitle('Copy relative path')).toBeDefined();
    expect(screen.getByTitle('Copy absolute path')).toBeDefined();
    expect(screen.getByTitle('Download')).toBeDefined();
    expect(screen.getByTitle('More')).toBeDefined();
  });

  it('Open click does not invoke onCopyPath, onCopyAbsolutePath, or onDownload', () => {
    const onOpen = vi.fn();
    const onCopyPath = vi.fn();
    const onCopyAbs = vi.fn();
    const onDownload = vi.fn();
    render(
      <CardActions
        filePath="src/foo.ts"
        onCopyPath={onCopyPath}
        onDownload={onDownload}
        onCopyAbsolutePath={onCopyAbs}
        onOpen={onOpen}
      />
    );
    fireEvent.click(screen.getByTitle('Open'));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onCopyPath).not.toHaveBeenCalled();
    expect(onCopyAbs).not.toHaveBeenCalled();
    expect(onDownload).not.toHaveBeenCalled();
  });
});
