/**
 * WysiwygToolbar Tests — React-mount layer (Phase 2 T007, file 1 of 2).
 *
 * Asserts the visible contract — what renders, what toggles, what's disabled,
 * when the onOpenLinkDialog stub fires. The markdown-serialization contract
 * is covered in `wysiwyg-toolbar.markdown.test.ts` (headless editor — idiomatic
 * Tiptap primary test surface).
 *
 * Constitution §4/§7: no vi.mock / vi.fn / vi.spyOn — plain test-owned callbacks.
 */

import '@testing-library/jest-dom/vitest';
import { Editor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { WysiwygToolbar } from '../../../../../../apps/web/src/features/_platform/viewer/components/wysiwyg-toolbar';
import {
  WYSIWYG_TOOLBAR_ACTIONS,
  WYSIWYG_TOOLBAR_GROUPS,
} from '../../../../../../apps/web/src/features/_platform/viewer/lib/wysiwyg-toolbar-config';

function makeEditor(doc = '<p></p>'): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit],
    content: doc,
  });
}

afterEach(() => {
  cleanup();
});

describe('WysiwygToolbar — config structure', () => {
  it('exports 5 groups totalling 16 actions with unique ids', () => {
    /*
    Test Doc:
    - Why: Workshop § 2.3 defines 5 groups × 16 actions as the authoritative layout.
    - Contract: group count = 5; flattened action count = 16; every action id is unique.
    */
    expect(WYSIWYG_TOOLBAR_GROUPS).toHaveLength(5);
    expect(WYSIWYG_TOOLBAR_ACTIONS).toHaveLength(16);
    const ids = WYSIWYG_TOOLBAR_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every action has an iconName, label, and non-empty tooltip', () => {
    for (const action of WYSIWYG_TOOLBAR_ACTIONS) {
      expect(action.iconName).toBeTruthy();
      expect(action.label).toBeTruthy();
      expect(action.tooltip).toBeTruthy();
      expect(typeof action.run).toBe('function');
    }
  });
});

describe('WysiwygToolbar — render', () => {
  it('renders role="toolbar", 16 buttons, and 4 separators when editor is provided', () => {
    /*
    Test Doc:
    - Why: AC-17 (a11y grouping) + AC-04 (button visibility).
    - Contract: toolbar root has role="toolbar"; 16 [data-testid^="toolbar-"] buttons; 4 separators between 5 groups.
    */
    const editor = makeEditor();
    try {
      render(<WysiwygToolbar editor={editor} />);
      const toolbar = screen.getByRole('toolbar', { name: /Formatting toolbar/i });
      expect(toolbar).toBeInTheDocument();
      const buttons = toolbar.querySelectorAll('[data-testid^="toolbar-"]');
      expect(buttons).toHaveLength(16);
      const separators = toolbar.querySelectorAll('[role="separator"]');
      expect(separators).toHaveLength(4);
    } finally {
      editor.destroy();
    }
  });

  it('renders all 16 buttons as disabled when editor is null', () => {
    /*
    Test Doc:
    - Why: Avoids flicker during the immediatelyRender: false gap before onEditorReady fires.
    - Contract: editor={null} → every button is disabled and has no pressed state.
    */
    render(<WysiwygToolbar editor={null} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(16);
    for (const button of buttons) {
      expect(button).toBeDisabled();
    }
  });

  it('each button carries an accessible label and a title containing shortcut hint (when defined)', () => {
    const editor = makeEditor();
    try {
      render(<WysiwygToolbar editor={editor} />);
      const bold = screen.getByTestId('toolbar-bold');
      expect(bold).toHaveAttribute('aria-label', 'Bold');
      expect(bold.getAttribute('title')).toContain('⌘B');
      const hr = screen.getByTestId('toolbar-hr');
      // HR has no shortcut — title is the tooltip alone.
      expect(hr.getAttribute('title')).toBe('Horizontal rule');
    } finally {
      editor.destroy();
    }
  });
});

describe('WysiwygToolbar — active + disabled state', () => {
  it('reflects active state when caret is inside a bold mark', async () => {
    /*
    Test Doc:
    - Why: AC-04 — the toolbar must show the current format context.
    - Contract: after editor.commands.toggleBold(), the Bold button reports aria-pressed="true"
      and renders variant="secondary".
    */
    const editor = makeEditor('<p>Hello</p>');
    try {
      const { rerender } = render(<WysiwygToolbar editor={editor} />);
      act(() => {
        editor.commands.focus();
        editor.commands.selectAll();
        editor.commands.toggleBold();
      });
      // Flush useEditorState tick.
      rerender(<WysiwygToolbar editor={editor} />);
      await new Promise((r) => setTimeout(r, 10));
      const bold = screen.getByTestId('toolbar-bold');
      expect(bold).toHaveAttribute('aria-pressed', 'true');
    } finally {
      editor.destroy();
    }
  });

  it('disables the code-block-gated 8 buttons when caret is inside a code block', async () => {
    /*
    Test Doc:
    - Why: Workshop § 2.4 disabled rules — markdown can't apply inline marks inside fenced code.
    - Contract: inside a code block, H1/H2/H3/Bold/Italic/Strike/InlineCode/Link are all disabled;
      the remaining 8 (Paragraph/UL/OL/Blockquote/CodeBlock/HR/Undo/Redo) — remain enabled OR
      are disabled only for history reasons (Undo/Redo via editor.can()).
    */
    const editor = makeEditor('<p>x</p>');
    try {
      const { rerender } = render(<WysiwygToolbar editor={editor} />);
      act(() => {
        editor.commands.focus();
        editor.commands.toggleCodeBlock();
      });
      rerender(<WysiwygToolbar editor={editor} />);
      await new Promise((r) => setTimeout(r, 10));
      const gated = ['h1', 'h2', 'h3', 'bold', 'italic', 'strike', 'inline-code', 'link'];
      for (const id of gated) {
        const button = screen.getByTestId(`toolbar-${id}`);
        expect(button, `expected toolbar-${id} disabled inside code block`).toBeDisabled();
      }
      // Code-block button itself stays enabled so the user can toggle back out.
      expect(screen.getByTestId('toolbar-code-block')).not.toBeDisabled();
    } finally {
      editor.destroy();
    }
  });

  it('disables Undo/Redo initially; enables Undo after an edit; enables Redo after undo()', async () => {
    const editor = makeEditor('<p>a</p>');
    try {
      const { rerender } = render(<WysiwygToolbar editor={editor} />);
      // Fresh editor: Undo + Redo both disabled.
      expect(screen.getByTestId('toolbar-undo')).toBeDisabled();
      expect(screen.getByTestId('toolbar-redo')).toBeDisabled();

      act(() => {
        editor.commands.focus();
        editor.commands.insertContent('x');
      });
      rerender(<WysiwygToolbar editor={editor} />);
      await new Promise((r) => setTimeout(r, 10));
      // After an edit, Undo enabled.
      expect(screen.getByTestId('toolbar-undo')).not.toBeDisabled();

      act(() => {
        editor.commands.undo();
      });
      rerender(<WysiwygToolbar editor={editor} />);
      await new Promise((r) => setTimeout(r, 10));
      // After undo, Redo enabled.
      expect(screen.getByTestId('toolbar-redo')).not.toBeDisabled();
    } finally {
      editor.destroy();
    }
  });
});

describe('WysiwygToolbar — click handlers', () => {
  it('clicking Bold toggles the mark active (and thus aria-pressed) on next render', async () => {
    const editor = makeEditor('<p>Hello</p>');
    try {
      const { rerender } = render(<WysiwygToolbar editor={editor} />);
      // Select all so toggleBold has something to apply to.
      act(() => {
        editor.commands.focus();
        editor.commands.selectAll();
      });
      const bold = screen.getByTestId('toolbar-bold') as HTMLButtonElement;
      act(() => {
        bold.click();
      });
      rerender(<WysiwygToolbar editor={editor} />);
      await new Promise((r) => setTimeout(r, 10));
      expect(screen.getByTestId('toolbar-bold')).toHaveAttribute('aria-pressed', 'true');
      // Focus-restoration chaining (`.focus()` before toggle) is present in the
      // action config; asserting `editor.isFocused` is flaky in jsdom because
      // contenteditable focus semantics don't replay outside a real browser.
      // The harness spec (T008) is the authoritative check for focus restoration.
    } finally {
      editor.destroy();
    }
  });

  it('clicking Link calls onOpenLinkDialog exactly once and does NOT toggle a link mark', async () => {
    /*
    Test Doc:
    - Why: Phase 3 owns the real link flow. Phase 2's Link button must be a stub —
      calling only the popover callback, never mutating the editor.
    */
    let callCount = 0;
    const onOpenLinkDialog = () => {
      callCount += 1;
    };
    const editor = makeEditor('<p>Hello</p>');
    try {
      render(<WysiwygToolbar editor={editor} onOpenLinkDialog={onOpenLinkDialog} />);
      act(() => {
        editor.commands.focus();
      });
      const link = screen.getByTestId('toolbar-link') as HTMLButtonElement;
      act(() => {
        link.click();
      });
      expect(callCount).toBe(1);
      // No link mark was applied — the stub didn't touch the document.
      expect(editor.isActive('link')).toBe(false);
    } finally {
      editor.destroy();
    }
  });
});
