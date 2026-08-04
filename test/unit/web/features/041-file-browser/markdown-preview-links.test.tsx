/**
 * MarkdownPreview link activation tests.
 *
 * Purpose: relative markdown links carrying a `#fragment` must navigate to the
 * FILE and surface the fragment separately. Treating `other.md#rows` as an
 * opaque path asks the file API for a file named `other.md#rows`, which never
 * exists — the URL shows it as `file=...%23rows` and the viewer renders
 * "not found".
 *
 * Regression: cross-file signpost links in dd docs
 * (`[rows](../../backpressure.dd.md#rows)`).
 */

import { MarkdownPreview } from '@/features/041-file-browser/components/markdown-preview';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));

beforeAll(() => {
  // jsdom implements neither
  Element.prototype.scrollIntoView = vi.fn();
});

const CURRENT = 'docs/plans/065/exemplar/tasks/phase-2/tasks.dd.md';

function renderWithLink(href: string, onNavigateToFile = vi.fn()) {
  render(
    <MarkdownPreview
      html={`<a href="${href}" data-testid="link">go</a>`}
      currentFilePath={CURRENT}
      onNavigateToFile={onNavigateToFile}
    />
  );
  return onNavigateToFile;
}

describe('MarkdownPreview relative link activation', () => {
  it('splits the #fragment off a relative path before navigating', () => {
    const onNavigateToFile = renderWithLink('../../backpressure.dd.md#rows');

    fireEvent.click(screen.getByTestId('link'));

    expect(onNavigateToFile).toHaveBeenCalledWith(
      'docs/plans/065/exemplar/backpressure.dd.md',
      'rows'
    );
  });

  it('never lets a # reach the resolved path', () => {
    const onNavigateToFile = renderWithLink('../../backpressure.dd.md#rows');

    fireEvent.click(screen.getByTestId('link'));

    const [resolvedPath] = onNavigateToFile.mock.calls[0];
    expect(resolvedPath).not.toContain('#');
  });

  it('still navigates plain relative links, with no fragment', () => {
    const onNavigateToFile = renderWithLink('./sibling.dd.md');

    fireEvent.click(screen.getByTestId('link'));

    expect(onNavigateToFile).toHaveBeenCalledWith(
      'docs/plans/065/exemplar/tasks/phase-2/sibling.dd.md',
      undefined
    );
  });

  it('treats a fragment-only link as a same-document scroll, not a navigation', () => {
    const onNavigateToFile = renderWithLink('#rows');

    fireEvent.click(screen.getByTestId('link'));

    expect(onNavigateToFile).not.toHaveBeenCalled();
  });

  it('does not navigate when a relative link resolves back to the open file', () => {
    const onNavigateToFile = renderWithLink('./tasks.dd.md#rows');

    fireEvent.click(screen.getByTestId('link'));

    expect(onNavigateToFile).not.toHaveBeenCalled();
  });

  it('leaves external links to the browser', () => {
    const onNavigateToFile = renderWithLink('https://example.com/doc.md#rows');

    fireEvent.click(screen.getByTestId('link'));

    expect(onNavigateToFile).not.toHaveBeenCalled();
  });

  it('activates on keyboard the same way as on click', () => {
    const onNavigateToFile = renderWithLink('../../backpressure.dd.md#rows');

    fireEvent.keyDown(screen.getByTestId('link'), { key: 'Enter' });

    expect(onNavigateToFile).toHaveBeenCalledWith(
      'docs/plans/065/exemplar/backpressure.dd.md',
      'rows'
    );
  });
});

describe('MarkdownPreview scrollToAnchor', () => {
  it('scrolls to the anchor id once the destination document renders', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    render(
      <MarkdownPreview
        html={'<h2 id="rows">Rows</h2>'}
        currentFilePath="docs/plans/065/exemplar/backpressure.dd.md"
        scrollToAnchor="rows"
      />
    );

    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('does not throw when the anchor is absent from the document', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    render(
      <MarkdownPreview
        html={'<h2 id="something-else">Other</h2>'}
        currentFilePath="docs/plans/065/exemplar/backpressure.dd.md"
        scrollToAnchor="rows"
      />
    );

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
