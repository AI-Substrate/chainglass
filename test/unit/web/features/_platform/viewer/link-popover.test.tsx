/**
 * LinkPopover Tests — Phase 3 / T007.
 *
 * Integration tests against a real Tiptap Editor instance. The popover
 * consumes the editor via its `editor` prop and dispatches `setLink` /
 * `unsetLink` / `extendMarkRange` commands; we render a live editor in
 * each test to exercise the full path.
 *
 * Constitution §4/§7 — no mocks, no vi.fn, no vi.spyOn. `window.matchMedia`
 * is assigned directly for viewport-dependent render tests; per dossier
 * Notes this is test-time environment shaping, not mocking.
 *
 * jsdom notes:
 *   - ProseMirror selection inside jsdom doesn't emit DOM range updates
 *     reliably; we use editor commands to set selections.
 *   - `editor.isFocused` is unreliable in jsdom; we assert DOM structure
 *     (presence/absence of <a> nodes) rather than focus state.
 *   - Radix FocusScope's auto-focus in jsdom doesn't always move focus
 *     synchronously; tests that rely on focus-return go to the harness.
 */

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LinkPopover } from '../../../../../../apps/web/src/features/_platform/viewer/components/link-popover';
import { MarkdownWysiwygEditor } from '../../../../../../apps/web/src/features/_platform/viewer/components/markdown-wysiwyg-editor';

/**
 * Assigns window.matchMedia + window.innerWidth consistently. The shared
 * `useIsMobile` hook from `@/hooks/use-mobile` reads BOTH (matchMedia to
 * subscribe, innerWidth for the actual boolean), so we set them together.
 * Constitution §4/§7 — direct property assignment is test-time environment
 * shaping, not mocking. Reset in afterEach so tests don't leak viewport.
 */
function setViewport(isMobileViewport: boolean) {
  const impl = (query: string) => {
    // The shared hook subscribes to `(max-width: 767px)` (MOBILE_BREAKPOINT - 1).
    const matches = isMobileViewport && /max-width:\s*7(6[7-9]|68)px/i.test(query);
    return {
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: impl,
  });
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: isMobileViewport ? 375 : 1280,
  });
}

const originalMatchMedia = window.matchMedia;
const originalInnerWidth = window.innerWidth;

beforeEach(() => {
  // Default: desktop viewport.
  setViewport(false);
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  });
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: originalInnerWidth,
  });
});

/**
 * Test harness — mounts editor + popover with a shared open state and
 * captures the live Editor instance so tests can dispatch commands.
 */
function Harness({
  initialValue,
  initialOpen,
  onEditorRef,
  onOpenChangeSpy,
}: {
  initialValue: string;
  initialOpen: boolean;
  onEditorRef: (e: Editor | null) => void;
  onOpenChangeSpy?: (next: boolean) => void;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [editor, setEditor] = useState<Editor | null>(null);
  return (
    <div>
      <MarkdownWysiwygEditor
        value={initialValue}
        onChange={() => {}}
        onEditorReady={(e) => {
          setEditor(e);
          onEditorRef(e);
        }}
      />
      <LinkPopover
        editor={editor}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          onOpenChangeSpy?.(next);
        }}
      />
    </div>
  );
}

async function waitForEditor(captured: Editor[]): Promise<Editor> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (captured.length > 0 && captured[0]) return captured[0];
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Editor did not become ready');
}

describe('LinkPopover — render modes', () => {
  it('renders the desktop dialog when viewport > 768px', async () => {
    /*
    Test Doc:
    - Why: Desktop is the default branch. matchMedia returns false for the
      mobile query so useIsMobile resolves false and Popover renders.
    - Contract: role="dialog" + data-testid="link-popover" is visible
      (Popover contents render via Radix portal).
    */
    setViewport(false);
    const captured: Editor[] = [];
    render(
      <Harness
        initialValue={''}
        initialOpen
        onEditorRef={(e) => {
          if (e) captured.push(e);
        }}
      />
    );
    await waitForEditor(captured);
    await waitFor(() => {
      expect(document.querySelector('[data-testid="link-popover"]')).not.toBeNull();
    });
    // Mobile-specific sheet wrapper MUST NOT be present.
    expect(document.querySelector('[data-testid="link-popover-sheet"]')).toBeNull();
  });

  it('renders the mobile sheet variant when viewport <= 768px', async () => {
    /*
    Test Doc:
    - Why: Mobile branch swaps Popover → Sheet side="bottom" (workshop § 5.4).
    - Contract: data-testid="link-popover-sheet" is present; inner body
      data-testid="link-popover" is still present (extracted body shared).
    */
    setViewport(true);
    const captured: Editor[] = [];
    render(
      <Harness
        initialValue={''}
        initialOpen
        onEditorRef={(e) => {
          if (e) captured.push(e);
        }}
      />
    );
    await waitForEditor(captured);
    await waitFor(() => {
      expect(document.querySelector('[data-testid="link-popover-sheet"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="link-popover"]')).not.toBeNull();
    });
  });

  it('disables all controls when editor is null (no flicker)', async () => {
    /*
    Test Doc:
    - Why: The Phase 2 toolbar skeleton pattern — popover mounts with editor=null
      during immediatelyRender: false. Render the full structure with every
      interactive control disabled so the DOM doesn't flash.
    - Contract: render with editor=null, open=true → popover body visible,
      all buttons + inputs marked disabled.
    */
    // Render LinkPopover directly without an editor.
    render(<LinkPopover editor={null} open={true} onOpenChange={() => {}} />);
    const body = document.querySelector('[data-testid="link-popover"]');
    expect(body).not.toBeNull();
    const urlInput = document.querySelector(
      '[data-testid="link-popover-url-input"]'
    ) as HTMLInputElement | null;
    expect(urlInput).not.toBeNull();
    expect(urlInput!.disabled).toBe(true);
    const submit = document.querySelector(
      '[data-testid="link-popover-submit"]'
    ) as HTMLButtonElement | null;
    expect(submit!.disabled).toBe(true);
  });
});

describe('LinkPopover — Insert mode', () => {
  it('shows "Insert link" title with Cancel + Insert footer', async () => {
    /*
    Test Doc:
    - Why: Workshop § 5.2 layout — plain insert has two buttons, not three.
    - Contract: title text contains "Insert link"; unlink button absent.
    */
    const captured: Editor[] = [];
    render(
      <Harness
        initialValue={'hello\n'}
        initialOpen
        onEditorRef={(e) => {
          if (e) captured.push(e);
        }}
      />
    );
    await waitForEditor(captured);
    await waitFor(() => {
      const title = document.getElementById('link-popover-title');
      expect(title?.textContent).toContain('Insert link');
    });
    expect(document.querySelector('[data-testid="link-popover-unlink"]')).toBeNull();
    expect(document.querySelector('[data-testid="link-popover-submit"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="link-popover-cancel"]')).not.toBeNull();
  });

  it('labels inputs correctly so getByLabelText resolves them', async () => {
    /*
    Test Doc:
    - Why: A11y — shadcn Label does NOT auto-bind, so explicit htmlFor/id
      wiring is load-bearing for screen readers + useByLabelText queries.
    - Contract: <Label htmlFor="link-popover-text"> + <Input id="link-popover-text">
      and the matching URL pair are both present.
    */
    const captured: Editor[] = [];
    render(
      <Harness
        initialValue={''}
        initialOpen
        onEditorRef={(e) => {
          if (e) captured.push(e);
        }}
      />
    );
    await waitForEditor(captured);
    await waitFor(() => {
      const textLabel = document.querySelector('label[for="link-popover-text"]');
      const urlLabel = document.querySelector('label[for="link-popover-url"]');
      expect(textLabel).not.toBeNull();
      expect(urlLabel).not.toBeNull();
      expect(document.getElementById('link-popover-text')).not.toBeNull();
      expect(document.getElementById('link-popover-url')).not.toBeNull();
    });
  });

  it('inserts a link when URL is typed and Enter is pressed', async () => {
    /*
    Test Doc:
    - Why: Workshop § 5.1 step 5 — Enter submits the form.
    - Contract: type 'https://example.com' + Enter → editor DOM contains
      <a href="https://example.com"> and onOpenChange(false) fired.
    */
    const captured: Editor[] = [];
    const openChanges: boolean[] = [];
    render(
      <Harness
        initialValue={'body'}
        initialOpen
        onEditorRef={(e) => {
          if (e) captured.push(e);
        }}
        onOpenChangeSpy={(next) => openChanges.push(next)}
      />
    );
    const editor = await waitForEditor(captured);
    // Select some text so the link wraps it.
    act(() => {
      editor.chain().focus().selectAll().run();
    });
    await waitFor(() => {
      expect(document.querySelector('[data-testid="link-popover-url-input"]')).not.toBeNull();
    });
    const urlInput = document.querySelector(
      '[data-testid="link-popover-url-input"]'
    ) as HTMLInputElement;
    act(() => {
      fireEvent.change(urlInput, { target: { value: 'https://example.com' } });
      fireEvent.keyDown(urlInput, { key: 'Enter' });
    });
    await waitFor(() => {
      const root = document.querySelector('[data-testid="md-wysiwyg-root"]') as HTMLElement;
      expect(root.querySelector('a[href="https://example.com"]')).not.toBeNull();
    });
    expect(openChanges).toContain(false);
  });

  it('prepends https:// to scheme-less URLs', async () => {
    /*
    Test Doc:
    - Why: Workshop § 5.5 — typing 'example.com' should create
      href="https://example.com" (sanitizer's prepend branch).
    */
    const captured: Editor[] = [];
    render(
      <Harness
        initialValue={'body'}
        initialOpen
        onEditorRef={(e) => {
          if (e) captured.push(e);
        }}
      />
    );
    const editor = await waitForEditor(captured);
    act(() => {
      editor.chain().focus().selectAll().run();
    });
    await waitFor(() => {
      expect(document.querySelector('[data-testid="link-popover-url-input"]')).not.toBeNull();
    });
    const urlInput = document.querySelector(
      '[data-testid="link-popover-url-input"]'
    ) as HTMLInputElement;
    act(() => {
      fireEvent.change(urlInput, { target: { value: 'example.com' } });
      fireEvent.keyDown(urlInput, { key: 'Enter' });
    });
    await waitFor(() => {
      const root = document.querySelector('[data-testid="md-wysiwyg-root"]') as HTMLElement;
      expect(root.querySelector('a[href="https://example.com"]')).not.toBeNull();
    });
  });

  it('rejects javascript: URLs silently and surfaces inline error', async () => {
    /*
    Test Doc:
    - Why: AC-13 / workshop § 5.5 — javascript: inputs must not produce
      anchors. The popover stays open and shows link-popover-error so the
      user knows why the submit didn't land.
    - Contract: after Enter, no <a> in editor DOM, popover still present,
      error element visible.
    */
    const captured: Editor[] = [];
    render(
      <Harness
        initialValue={'body'}
        initialOpen
        onEditorRef={(e) => {
          if (e) captured.push(e);
        }}
      />
    );
    const editor = await waitForEditor(captured);
    act(() => {
      editor.chain().focus().selectAll().run();
    });
    await waitFor(() => {
      expect(document.querySelector('[data-testid="link-popover-url-input"]')).not.toBeNull();
    });
    const urlInput = document.querySelector(
      '[data-testid="link-popover-url-input"]'
    ) as HTMLInputElement;
    act(() => {
      fireEvent.change(urlInput, { target: { value: 'javascript:alert(1)' } });
      fireEvent.keyDown(urlInput, { key: 'Enter' });
    });
    await waitFor(() => {
      expect(document.querySelector('[data-testid="link-popover-error"]')).not.toBeNull();
    });
    const root = document.querySelector('[data-testid="md-wysiwyg-root"]') as HTMLElement;
    expect(root.querySelector('a')).toBeNull();
    // Popover is still open
    expect(document.querySelector('[data-testid="link-popover"]')).not.toBeNull();
  });

  it('closes on Cancel click without mutating the editor', async () => {
    /*
    Test Doc:
    - Why: Workshop § 5.2 — Cancel discards the form without side effects.
    - Contract: click Cancel → onOpenChange(false) fired; editor DOM has
      no <a> nodes.
    */
    const captured: Editor[] = [];
    const openChanges: boolean[] = [];
    render(
      <Harness
        initialValue={'body'}
        initialOpen
        onEditorRef={(e) => {
          if (e) captured.push(e);
        }}
        onOpenChangeSpy={(next) => openChanges.push(next)}
      />
    );
    await waitForEditor(captured);
    await waitFor(() => {
      expect(document.querySelector('[data-testid="link-popover-cancel"]')).not.toBeNull();
    });
    const cancel = document.querySelector(
      '[data-testid="link-popover-cancel"]'
    ) as HTMLButtonElement;
    act(() => {
      fireEvent.click(cancel);
    });
    await waitFor(() => {
      expect(openChanges).toContain(false);
    });
    const root = document.querySelector('[data-testid="md-wysiwyg-root"]') as HTMLElement;
    expect(root.querySelector('a')).toBeNull();
  });

  it('preserves balanced parens in the href (Wikipedia-style)', async () => {
    /*
    Test Doc:
    - Why: Finding — tiptap-markdown may truncate unescaped parentheses on
      round-trip, silently corrupting Wikipedia/JIRA-style URLs. At the DOM
      level, insertion itself must preserve the byte-for-byte href.
    */
    const captured: Editor[] = [];
    render(
      <Harness
        initialValue={'body'}
        initialOpen
        onEditorRef={(e) => {
          if (e) captured.push(e);
        }}
      />
    );
    const editor = await waitForEditor(captured);
    act(() => {
      editor.chain().focus().selectAll().run();
    });
    await waitFor(() => {
      expect(document.querySelector('[data-testid="link-popover-url-input"]')).not.toBeNull();
    });
    const urlInput = document.querySelector(
      '[data-testid="link-popover-url-input"]'
    ) as HTMLInputElement;
    const href = 'https://en.wikipedia.org/wiki/Foo_(bar)';
    act(() => {
      fireEvent.change(urlInput, { target: { value: href } });
      fireEvent.keyDown(urlInput, { key: 'Enter' });
    });
    await waitFor(() => {
      const root = document.querySelector('[data-testid="md-wysiwyg-root"]') as HTMLElement;
      expect(root.querySelector(`a[href="${href}"]`)).not.toBeNull();
    });
  });
});

describe('LinkPopover — Edit mode', () => {
  it('shows "Edit link" title with Unlink + Cancel + Update when caret is inside a link', async () => {
    /*
    Test Doc:
    - Why: Workshop § 5.3 — caret inside link pre-fills and shows 3 buttons.
    - Contract: seed value '[foo](https://a.test)', place caret inside the
      link while the popover is closed, THEN open → title "Edit link" +
      unlink button + URL pre-filled.
    - Order matters: the prefill effect reads the selection at the moment
      the editor first becomes non-null while `open === true`. Closing first,
      positioning the selection, then opening is the representative path.
    */
    const captured: Editor[] = [];
    let setOpenExternally: ((next: boolean) => void) | null = null;
    function EditHarness() {
      const [open, setOpen] = useState(false);
      setOpenExternally = setOpen;
      const [editor, setEditor] = useState<Editor | null>(null);
      return (
        <div>
          <MarkdownWysiwygEditor
            value={'[foo](https://a.test)\n'}
            onChange={() => {}}
            onEditorReady={(e) => {
              setEditor(e);
              if (e) captured.push(e);
            }}
          />
          <LinkPopover editor={editor} open={open} onOpenChange={setOpen} />
        </div>
      );
    }
    render(<EditHarness />);
    const editor = await waitForEditor(captured);
    // Place caret inside the link mark. Position 2 lands inside 'foo'.
    act(() => {
      editor.chain().focus().setTextSelection(2).run();
    });
    await waitFor(() => {
      expect(editor.isActive('link')).toBe(true);
    });
    // Open the popover now — prefill runs against the current selection.
    act(() => {
      setOpenExternally?.(true);
    });
    await waitFor(() => {
      const title = document.getElementById('link-popover-title');
      expect(title?.textContent).toContain('Edit link');
      expect(document.querySelector('[data-testid="link-popover-unlink"]')).not.toBeNull();
    });
    const urlInput = document.querySelector(
      '[data-testid="link-popover-url-input"]'
    ) as HTMLInputElement;
    expect(urlInput.value).toBe('https://a.test');
    const textInput = document.querySelector(
      '[data-testid="link-popover-text-input"]'
    ) as HTMLInputElement;
    expect(textInput.value).toBe('foo');
  });

  it('removes the link mark on Unlink, preserving the visible text', async () => {
    /*
    Test Doc:
    - Why: Workshop § 5.3 — Unlink removes the anchor but keeps the text.
    - Contract: click Unlink → editor DOM has no <a>, but the text 'foo'
      is still present somewhere in the editor body.
    */
    const captured: Editor[] = [];
    render(
      <Harness
        initialValue={'[foo](https://a.test)\n'}
        initialOpen
        onEditorRef={(e) => {
          if (e) captured.push(e);
        }}
      />
    );
    const editor = await waitForEditor(captured);
    act(() => {
      editor.chain().focus().setTextSelection(2).run();
    });
    await waitFor(() => {
      expect(document.querySelector('[data-testid="link-popover-unlink"]')).not.toBeNull();
    });
    const unlink = document.querySelector(
      '[data-testid="link-popover-unlink"]'
    ) as HTMLButtonElement;
    act(() => {
      fireEvent.click(unlink);
    });
    await waitFor(() => {
      const root = document.querySelector('[data-testid="md-wysiwyg-root"]') as HTMLElement;
      expect(root.querySelector('a')).toBeNull();
      expect(root.textContent).toContain('foo');
    });
  });
});

describe('LinkPopover — reactive isInLink flip', () => {
  it('flips from Insert to Edit mode when the caret enters a newly-created link', async () => {
    /*
    Test Doc:
    - Why: Workshop § 5.3 — the mode is reactive to the editor selection.
      useEditorState subscribes to isActive('link') so the title flips live.
    - Contract: start with no link + caret in plain text → title "Insert".
      Run editor.chain().insertContent('[x](y)') + place caret inside →
      re-open popover → title "Edit".
    */
    // Start with open=true, no link — title should be "Insert link".
    const captured: Editor[] = [];
    let toggleOpen: ((next: boolean) => void) | null = null;
    function Toggler() {
      const [open, setOpen] = useState(true);
      toggleOpen = setOpen;
      const [editor, setEditor] = useState<Editor | null>(null);
      return (
        <div>
          <MarkdownWysiwygEditor
            value={'plain\n'}
            onChange={() => {}}
            onEditorReady={(e) => {
              setEditor(e);
              if (e) captured.push(e);
            }}
          />
          <LinkPopover editor={editor} open={open} onOpenChange={setOpen} />
        </div>
      );
    }
    render(<Toggler />);
    const editor = await waitForEditor(captured);
    await waitFor(() => {
      const title = document.getElementById('link-popover-title');
      expect(title?.textContent).toContain('Insert link');
    });
    // Close the popover, create a link, place caret inside, re-open.
    act(() => {
      toggleOpen?.(false);
    });
    act(() => {
      editor.chain().focus().selectAll().setLink({ href: 'https://z.test' }).run();
    });
    act(() => {
      editor.chain().focus().setTextSelection(2).run();
    });
    act(() => {
      toggleOpen?.(true);
    });
    await waitFor(() => {
      const title = document.getElementById('link-popover-title');
      expect(title?.textContent).toContain('Edit link');
    });
  });
});
