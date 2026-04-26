/**
 * FileViewerPanel Rich-mode integration tests.
 *
 * Plan 083-md-editor / Phase 5 T008 + T009.
 *
 * Scope:
 *   T008 — Cross-mode content sync (Source → Rich → Source via parent state).
 *   T009 — Cmd+S + Save button dispatch through the unified `performSave` helper
 *          with a `FakeSaveFile` injected via the new `saveFileImpl?` optional DI prop.
 *
 * Constitution §4/§7 — NO `vi.mock` / `vi.fn` / `vi.spyOn` for business logic.
 * The only stubs retained are for CodeMirror/DiffViewer (carried over from
 * plan-041's unit-test infra — legacy debt, out of Phase 5's remit per dossier).
 */

import '@testing-library/jest-dom/vitest';
import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// jsdom stubs — ProseMirror's coordsAtPos → scrollToSelection calls getClientRects /
// getBoundingClientRect during transactions; jsdom does not implement them on Range or
// on Element's empty-rects path for contenteditable nodes. Safe zero-rect shims keep
// the editor from throwing during real user-typing transactions.
beforeAll(() => {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () =>
      ({
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* () {},
      }) as unknown as DOMRectList;
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }
  // ProseMirror's mousedown handler calls document.elementFromPoint(x, y) — jsdom does
  // not implement it. Return null to short-circuit the mousedown logic.
  if (typeof document !== 'undefined' && !document.elementFromPoint) {
    (
      document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }
    ).elementFromPoint = () => null;
  }
});

import {
  FileViewerPanel,
  type ViewerMode,
} from '@/features/041-file-browser/components/file-viewer-panel';
import { useState } from 'react';

// Legacy plan-041 stubs (debt — out of Phase 5's scope per dossier Test-Boundary Note).
vi.mock('@/features/_platform/themes', () => ({
  FileIcon: ({ className }: { className?: string }) => (
    <img className={className} alt="" data-testid="file-icon" />
  ),
}));
vi.mock('@uiw/react-codemirror', () => ({
  __esModule: true,
  default: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea
      data-testid="code-editor"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));
vi.mock('@/components/viewers/diff-viewer', () => ({
  DiffViewer: () => <div data-testid="diff-viewer" />,
}));

afterEach(() => {
  cleanup();
});

/**
 * Fake save implementation — captures every invocation's content. No `vi.fn()`;
 * the instance acts as both the dispatch target and the assertion surface.
 */
class FakeSaveFile {
  readonly calls: Array<{ content: string }> = [];
  invoke = async (content: string): Promise<void> => {
    this.calls.push({ content });
  };
}

/** Wrapper that owns mode + editContent state, simulating browser-client. */
function Harness({
  initialMode,
  initialContent,
  language = 'markdown',
  saveFileImpl,
}: {
  initialMode: ViewerMode;
  initialContent: string;
  language?: string;
  saveFileImpl?: (content: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<ViewerMode>(initialMode);
  const [editContent, setEditContent] = useState<string>(initialContent);
  return (
    <FileViewerPanel
      filePath="README.md"
      content={initialContent}
      language={language}
      mtime="2026-04-19T00:00:00Z"
      mode={mode}
      onModeChange={setMode}
      onSave={() => {}}
      onRefresh={() => {}}
      editContent={editContent}
      onEditChange={setEditContent}
      saveFileImpl={saveFileImpl}
    />
  );
}

async function waitForRichEditor(container: HTMLElement, budgetMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < budgetMs) {
    if (container.querySelector('[data-testid="md-wysiwyg-root"]')) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('Rich editor did not mount within budget');
}

describe('FileViewerPanel — Rich-mode integration (T008)', () => {
  it('exposes a Rich button for markdown files and switches into the Rich branch on click', async () => {
    /*
    Test Doc:
    - Why: AC-01 + AC-07 — Rich mode must be reachable via the toolbar for markdown files.
    - Contract: clicking Rich mounts the editor (`[data-testid="md-wysiwyg-root"]`) AND the
      toolbar (`[data-testid="wysiwyg-toolbar"]`), both present as siblings of the mount wrapper.
    */
    const user = userEvent.setup();
    const { container } = render(<Harness initialMode="source" initialContent={'# Heading\n'} />);

    const richBtn = screen.getByRole('button', { name: /^rich$/i });
    expect(richBtn).toBeInTheDocument();
    await user.click(richBtn);
    await waitForRichEditor(container);

    expect(container.querySelector('[data-testid="md-wysiwyg-root"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="wysiwyg-toolbar"]')).toBeInTheDocument();
    expect(container.querySelector('.md-wysiwyg-editor-mount')).toBeInTheDocument();
  });

  it('synchronises edits from Rich back into the parent-controlled edit state', async () => {
    /*
    Test Doc:
    - Why: AC-07 — Source ↔ Rich must share a single in-memory markdown string so a
      keystroke in Rich is visible to Source on mode switch.
    - Contract: after mounting Rich, a typed character emits onChange via the parent
      wrapper; flipping back to Source lands the same content in the CodeEditor stub.
    */
    const user = userEvent.setup();
    const { container } = render(<Harness initialMode="source" initialContent={'# Heading\n'} />);

    await user.click(screen.getByRole('button', { name: /^rich$/i }));
    await waitForRichEditor(container);

    const editorRoot = container.querySelector(
      '[data-testid="md-wysiwyg-root"] [contenteditable="true"]'
    );
    expect(editorRoot).not.toBeNull();
    // Focus + type into the ProseMirror contenteditable.
    await act(async () => {
      (editorRoot as HTMLElement).focus();
      await user.type(editorRoot as HTMLElement, ' edited');
    });

    // Parent should see updated markdown flow through onEditChange.
    const mount = container.querySelector<HTMLElement>('.md-wysiwyg-editor-mount');
    expect(mount?.dataset.emittedMarkdown ?? '').toMatch(/edited/);

    // Flip back to Source → the CodeEditor stub receives the updated content.
    await user.click(screen.getByRole('button', { name: /source/i }));
    const codeEditor = await screen.findByTestId('code-editor');
    expect((codeEditor as HTMLTextAreaElement).value).toMatch(/edited/);
  });
});

describe('FileViewerPanel — FakeSaveFile DI (T009)', () => {
  it('invokes saveFileImpl with the current content when Cmd+S fires in Source mode', async () => {
    /*
    Test Doc:
    - Why: AC-06 — Cmd+S saves from editable modes via the unified performSave helper.
    - Contract: Cmd+S on the content wrapper calls saveFileImpl exactly once with the
      current edit content — not the original file content.
    */
    const fake = new FakeSaveFile();
    render(
      <Harness
        initialMode="source"
        initialContent={'initial'}
        language="typescript"
        saveFileImpl={fake.invoke}
      />
    );

    const editor = await screen.findByTestId('code-editor');
    // Simulate an edit via the CodeMirror stub's onChange.
    await act(async () => {
      fireEvent.change(editor, { target: { value: 'initial edited' } });
    });

    const wrapper = editor.parentElement as HTMLElement;
    const event = createEvent.keyDown(wrapper, { key: 's', metaKey: true });
    await act(async () => {
      fireEvent(wrapper, event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].content).toBe('initial edited');
  });

  it('routes the Save button through the same saveFileImpl (unified dispatch)', async () => {
    /*
    Test Doc:
    - Why: T009 unified-dispatch contract — Save button and Cmd+S must land on the same
      `performSave` helper so the DI priority is identical across both user paths.
    - Contract: clicking the Save button with `saveFileImpl` supplied invokes the fake
      exactly once with the current edit content.
    */
    const user = userEvent.setup();
    const fake = new FakeSaveFile();
    render(
      <Harness
        initialMode="source"
        initialContent={'alpha'}
        language="typescript"
        saveFileImpl={fake.invoke}
      />
    );

    const editor = await screen.findByTestId('code-editor');
    await act(async () => {
      fireEvent.change(editor, { target: { value: 'alpha beta' } });
    });

    await user.click(screen.getByRole('button', { name: /save file/i }));
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].content).toBe('alpha beta');
  });

  it('falls back to onSave when saveFileImpl is not supplied', async () => {
    /*
    Test Doc:
    - Why: Backward compat — every existing caller (browser-client + every FileViewerPanel
      consumer across plans 041, 046, 047) passes no saveFileImpl and must keep receiving
      onSave calls exactly as before. Without this guard, the T009 DI surface could
      regress production save behavior the first time someone forgets to pass the prop.
    - Contract: with no saveFileImpl, the Save button click invokes the onSave prop exactly
      once with the current editContent value.
    - Usage Notes: Do NOT supply saveFileImpl in this test — the whole point is the
      absence of the optional DI prop. Use onSave with a plain array push as the assertion
      surface (no vi.fn, per Constitution §4/§7). Use userEvent.click on the Save button
      (not fireEvent) so the test exercises the real click pipeline including the
      performSave helper's fallback branch.
    - Quality Contribution: Locks in the "optional DI prop is truly optional" contract
      so the Phase 5 `saveFileImpl?` can never silently break the existing onSave path.
      Catches any future refactor that accidentally routes through saveFileImpl even when
      it's undefined (e.g. `saveFileImpl!(content)` or `saveFileImpl ?? onSave`
      miscomposed).
    - Worked Example: render <FileViewerPanel mode="source" editContent="body edited"
      onSave={push}/> → user.click(SaveButton) → calls === ['body edited'].
    */
    const user = userEvent.setup();
    const calls: string[] = [];
    render(
      <FileViewerPanel
        filePath="x.ts"
        content={'body'}
        language="typescript"
        mtime="2026-04-19T00:00:00Z"
        mode="source"
        onModeChange={() => {}}
        onSave={(content) => calls.push(content)}
        onRefresh={() => {}}
        editContent="body edited"
        onEditChange={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: /save file/i }));
    expect(calls).toEqual(['body edited']);
  });
});

describe('FileViewerPanel — table warn banner (T005 / AC-11)', () => {
  // sessionStorage state leaks across tests in the same file; reset to keep
  // the dismissal assertion deterministic.
  afterEach(() => {
    try {
      sessionStorage.removeItem('md-wysiwyg:dismissed-table-banners');
    } catch {
      // ignore
    }
  });

  const TABLE_MARKDOWN = '# Doc\n\n| Col A | Col B |\n|-------|-------|\n| a     | b     |\n';

  it('renders the table warn banner in Rich mode when content has a GFM table', async () => {
    /*
    Test Doc:
    - Why: AC-11 — Rich mode must warn users that tables may be reformatted, since
      Tiptap normalises GFM table whitespace even when nothing else about the doc
      changed. Without this regression guard, a future refactor could silently drop
      the banner and users would lose table formatting without any heads-up.
    - Contract: mounting <FileViewerPanel mode="rich" ...> with table-bearing content
      renders an element with `data-testid="rich-mode-table-warning"` whose text
      includes the "may reformat them" warning string.
    - Usage Notes: use the Harness wrapper (owns mode + editContent state) so the
      component sees the exact prop shape browser-client supplies in production. No
      vi.mock — the banner path runs through hasTables() from the real viewer barrel.
    - Quality Contribution: locks the `hasTables(currentContent) && mode==='rich'`
      trigger into the Phase 5 test suite so Phase 6.4 (mobile audit) or Phase 6.8
      (domain.md refresh) can't accidentally drop the banner while reshuffling.
    - Worked Example: render Harness with fixture containing `| Col A | Col B |...`
      → [data-testid="rich-mode-table-warning"] appears containing "may reformat them".
    */
    const { container } = render(<Harness initialMode="rich" initialContent={TABLE_MARKDOWN} />);
    await waitForRichEditor(container);

    const banner = container.querySelector('[data-testid="rich-mode-table-warning"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent ?? '').toMatch(/may reformat them/i);
  });

  it('does NOT render the table warn banner when Rich content has no tables', async () => {
    /*
    Test Doc:
    - Why: Banner must only surface when tables are actually present — otherwise it's
      noise that trains users to ignore warnings.
    - Contract: mounting Rich mode with table-free content renders no element with
      data-testid="rich-mode-table-warning".
    - Usage Notes: identical setup to the positive test but with a heading-only
      fixture; asserts the negative path of the `hasTables(currentContent)` guard.
    - Quality Contribution: pins the gate's specificity so a broken detector (e.g. a
      future hasTables() that returns true for `|` in inline code) would fail here.
    - Worked Example: render Harness with '# just a heading' → querySelector for the
      banner testid returns null.
    */
    const { container } = render(
      <Harness initialMode="rich" initialContent={'# just a heading\n'} />
    );
    await waitForRichEditor(container);

    expect(container.querySelector('[data-testid="rich-mode-table-warning"]')).toBeNull();
  });

  it('dismissing the banner writes the file path into sessionStorage and removes the banner', async () => {
    /*
    Test Doc:
    - Why: AC-11 dismiss path — the × button must persist dismissal in sessionStorage
      keyed by filePath so the warning doesn't nag the user every time they switch
      into Rich on the same file within one tab session.
    - Contract: clicking the dismiss button hides the banner element AND writes a
      JSON array containing the current filePath ("README.md" in Harness) to
      sessionStorage['md-wysiwyg:dismissed-table-banners'].
    - Usage Notes: userEvent.setup + user.click on the "Dismiss table warning"
      aria-label button (not fireEvent — exercises the full click pipeline). Reset
      sessionStorage in afterEach to keep tests independent.
    - Quality Contribution: guards both halves of the dismissal contract — UI
      removal + persistence — so a regression in either the state hook or the
      sessionStorage writer is caught immediately.
    - Worked Example: banner visible → click × → banner disappears + sessionStorage
      contains ["README.md"].
    */
    const user = userEvent.setup();
    const { container } = render(<Harness initialMode="rich" initialContent={TABLE_MARKDOWN} />);
    await waitForRichEditor(container);

    const banner = container.querySelector('[data-testid="rich-mode-table-warning"]');
    expect(banner).not.toBeNull();

    await user.click(screen.getByRole('button', { name: /dismiss table warning/i }));

    // Banner is gone.
    expect(container.querySelector('[data-testid="rich-mode-table-warning"]')).toBeNull();

    // sessionStorage has the filePath recorded for this session.
    const raw = sessionStorage.getItem('md-wysiwyg:dismissed-table-banners');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? '[]') as string[];
    expect(parsed).toContain('README.md');
  });
});
