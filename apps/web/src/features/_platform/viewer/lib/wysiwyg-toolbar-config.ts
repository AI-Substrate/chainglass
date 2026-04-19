/**
 * WysiwygToolbar configuration — 5 groups / 16 actions.
 *
 * Pure-data module: imports the `ToolbarGroup` type but no runtime
 * dependencies. The Tiptap `Editor` is consumed only inside each action's
 * predicates/runners at call time, so the config can be unit-tested as
 * plain data and mounted headlessly.
 *
 * Groups + ordering are authoritative per workshop § 2.3:
 *   Block   : [H1, H2, H3, Paragraph]
 *   Inline  : [Bold, Italic, Strike, InlineCode]
 *   List    : [UL, OL, Blockquote]
 *   Insert  : [CodeBlock, HR, Link]
 *   History : [Undo, Redo]
 *
 * Keybindings are NOT registered here — they ship with StarterKit's
 * default extensions (see Phase 2 dossier T005). `shortcut` strings are
 * purely decorative (tooltip text).
 */

import type { ToolbarAction, ToolbarGroup } from './wysiwyg-extensions';

/** Set of actions disabled when the caret is inside a code block (workshop § 2.4). */
const DISABLED_IN_CODE_BLOCK = new Set([
  'h1',
  'h2',
  'h3',
  'bold',
  'italic',
  'strike',
  'inline-code',
  'link',
]);

/** Returns a predicate: true when caret is inside a code block. */
const inCodeBlock: ToolbarAction['isDisabled'] = (editor) => editor.isActive('codeBlock');

const blockGroup: ToolbarGroup = {
  id: 'block',
  actions: [
    {
      id: 'h1',
      label: 'Heading 1',
      tooltip: 'Heading 1',
      shortcut: '⌘Alt+1',
      iconName: 'Heading1',
      isActive: (editor) => editor.isActive('heading', { level: 1 }),
      isDisabled: inCodeBlock,
      run: (editor) => {
        editor.chain().focus().toggleHeading({ level: 1 }).run();
      },
    },
    {
      id: 'h2',
      label: 'Heading 2',
      tooltip: 'Heading 2',
      shortcut: '⌘Alt+2',
      iconName: 'Heading2',
      isActive: (editor) => editor.isActive('heading', { level: 2 }),
      isDisabled: inCodeBlock,
      run: (editor) => {
        editor.chain().focus().toggleHeading({ level: 2 }).run();
      },
    },
    {
      id: 'h3',
      label: 'Heading 3',
      tooltip: 'Heading 3',
      shortcut: '⌘Alt+3',
      iconName: 'Heading3',
      isActive: (editor) => editor.isActive('heading', { level: 3 }),
      isDisabled: inCodeBlock,
      run: (editor) => {
        editor.chain().focus().toggleHeading({ level: 3 }).run();
      },
    },
    {
      id: 'paragraph',
      label: 'Paragraph',
      tooltip: 'Paragraph',
      shortcut: '⌘Alt+0',
      iconName: 'Pilcrow',
      isActive: (editor) => editor.isActive('paragraph'),
      run: (editor) => {
        editor.chain().focus().setParagraph().run();
      },
    },
  ],
};

const inlineGroup: ToolbarGroup = {
  id: 'inline',
  actions: [
    {
      id: 'bold',
      label: 'Bold',
      tooltip: 'Bold',
      shortcut: '⌘B',
      iconName: 'Bold',
      isActive: (editor) => editor.isActive('bold'),
      isDisabled: inCodeBlock,
      run: (editor) => {
        editor.chain().focus().toggleBold().run();
      },
    },
    {
      id: 'italic',
      label: 'Italic',
      tooltip: 'Italic',
      shortcut: '⌘I',
      iconName: 'Italic',
      isActive: (editor) => editor.isActive('italic'),
      isDisabled: inCodeBlock,
      run: (editor) => {
        editor.chain().focus().toggleItalic().run();
      },
    },
    {
      id: 'strike',
      label: 'Strikethrough',
      tooltip: 'Strikethrough',
      shortcut: '⌘Shift+S',
      iconName: 'Strikethrough',
      isActive: (editor) => editor.isActive('strike'),
      isDisabled: inCodeBlock,
      run: (editor) => {
        editor.chain().focus().toggleStrike().run();
      },
    },
    {
      id: 'inline-code',
      label: 'Inline code',
      tooltip: 'Inline code',
      shortcut: '⌘E',
      iconName: 'Code',
      isActive: (editor) => editor.isActive('code'),
      isDisabled: inCodeBlock,
      run: (editor) => {
        editor.chain().focus().toggleCode().run();
      },
    },
  ],
};

const listGroup: ToolbarGroup = {
  id: 'list',
  actions: [
    {
      id: 'bullet-list',
      label: 'Bulleted list',
      tooltip: 'Bulleted list',
      shortcut: '⌘Shift+8',
      iconName: 'List',
      isActive: (editor) => editor.isActive('bulletList'),
      run: (editor) => {
        editor.chain().focus().toggleBulletList().run();
      },
    },
    {
      id: 'ordered-list',
      label: 'Ordered list',
      tooltip: 'Ordered list',
      shortcut: '⌘Shift+7',
      iconName: 'ListOrdered',
      isActive: (editor) => editor.isActive('orderedList'),
      run: (editor) => {
        editor.chain().focus().toggleOrderedList().run();
      },
    },
    {
      id: 'blockquote',
      label: 'Blockquote',
      tooltip: 'Blockquote',
      shortcut: '⌘Shift+B',
      iconName: 'Quote',
      isActive: (editor) => editor.isActive('blockquote'),
      run: (editor) => {
        editor.chain().focus().toggleBlockquote().run();
      },
    },
  ],
};

const insertGroup: ToolbarGroup = {
  id: 'insert',
  actions: [
    {
      id: 'code-block',
      label: 'Code block',
      tooltip: 'Code block',
      shortcut: '⌘Alt+C',
      iconName: 'SquareCode',
      isActive: (editor) => editor.isActive('codeBlock'),
      run: (editor) => {
        editor.chain().focus().toggleCodeBlock().run();
      },
    },
    {
      id: 'hr',
      label: 'Horizontal rule',
      tooltip: 'Horizontal rule',
      iconName: 'Minus',
      run: (editor) => {
        editor.chain().focus().setHorizontalRule().run();
      },
    },
    {
      id: 'link',
      label: 'Insert/edit link',
      tooltip: 'Insert link',
      shortcut: '⌘K',
      iconName: 'Link',
      isActive: (editor) => editor.isActive('link'),
      isDisabled: inCodeBlock,
      run: (_editor, { onOpenLinkDialog }) => {
        onOpenLinkDialog?.();
      },
    },
  ],
};

const historyGroup: ToolbarGroup = {
  id: 'history',
  actions: [
    {
      id: 'undo',
      label: 'Undo',
      tooltip: 'Undo',
      shortcut: '⌘Z',
      iconName: 'Undo2',
      isDisabled: (editor) => !editor.can().undo(),
      run: (editor) => {
        editor.chain().focus().undo().run();
      },
    },
    {
      id: 'redo',
      label: 'Redo',
      tooltip: 'Redo',
      shortcut: '⌘Shift+Z',
      iconName: 'Redo2',
      isDisabled: (editor) => !editor.can().redo(),
      run: (editor) => {
        editor.chain().focus().redo().run();
      },
    },
  ],
};

/** Authoritative toolbar layout — exported for rendering and structural tests. */
export const WYSIWYG_TOOLBAR_GROUPS: readonly ToolbarGroup[] = [
  blockGroup,
  inlineGroup,
  listGroup,
  insertGroup,
  historyGroup,
] as const;

/** Flattened action list — convenient for structural assertions. */
export const WYSIWYG_TOOLBAR_ACTIONS: readonly ToolbarAction[] = WYSIWYG_TOOLBAR_GROUPS.flatMap(
  (group) => group.actions,
);

export { DISABLED_IN_CODE_BLOCK };
