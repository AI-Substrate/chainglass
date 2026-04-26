/**
 * Type-only module for MarkdownWysiwygEditor and WysiwygToolbar.
 *
 * Defined before implementation per Constitution §2 (Interface-First).
 * Tiptap `Editor` is imported as a type-only symbol — erased at compile
 * time, so nothing from this module pulls Tiptap into the eager bundle.
 */

import type React from 'react';

import type { Editor } from '@tiptap/react';

/**
 * Resolves an image's `src` attribute for rendering in the editor.
 *
 * Returns the rewritten URL for relative paths that need to route through
 * the raw-file API; returns `null` for absolute, data-URL, protocol-relative,
 * or otherwise non-resolvable inputs (caller keeps the original `src`).
 *
 * This shape is shared with `MarkdownPreview` so both surfaces render
 * images identically.
 */
export type ImageUrlResolver = (args: {
  src: string | undefined;
  currentFilePath: string | undefined;
  rawFileBaseUrl: string | undefined;
}) => string | null;

/**
 * Front-matter split/rejoin helpers. In Phase 1 these are a passthrough
 * stub; Phase 4 replaces them with full YAML-aware implementations.
 */
export interface FrontMatterCodec {
  split: (md: string) => { frontMatter: string; body: string };
  join: (frontMatter: string, body: string) => string;
}

/**
 * Props for MarkdownWysiwygEditor.
 *
 * The editor consumes `value` as a complete markdown string, parses the
 * body through Tiptap, and emits markdown back via `onChange` — ONLY when
 * the user triggers a real edit (Tiptap's `transaction.docChanged === true`).
 * Remounting or receiving the same `value` does not emit.
 */
export interface MarkdownWysiwygEditorProps {
  /** Current markdown string, including any YAML front-matter. */
  value: string;
  /** Emitted on user-initiated edits only, never on mount. */
  onChange: (markdown: string) => void;
  /** When true, disables typing and Tiptap commands. Default: false. */
  readOnly?: boolean;
  /** Placeholder shown on an empty document. Default: 'Start writing…'. */
  placeholder?: string;
  /**
   * Optional image URL resolver. When provided, each image node's `src`
   * is passed through this resolver at render time; relative paths are
   * rewritten, absolutes are preserved.
   */
  imageUrlResolver?: ImageUrlResolver;
  /** File path of the markdown being edited — used by the image resolver. */
  currentFilePath?: string;
  /** Base URL for the raw-file API — used by the image resolver. */
  rawFileBaseUrl?: string;
  /** Optional wrapper className override. */
  className?: string;
  /**
   * Called once the Tiptap Editor instance is ready (after the initial
   * `immediatelyRender: false` null-phase). Optional; consumers that need
   * the raw editor (e.g., a sibling toolbar) use it to subscribe.
   */
  onEditorReady?: (editor: Editor | null) => void;
  /**
   * Invoked when the user presses `Mod-k` inside the editor. Phase 3 wires
   * this to the parent's LinkPopover open-state. No-op if not provided.
   * Ref-stable internally so callback identity changes don't re-register
   * the Tiptap Link extension.
   */
  onOpenLinkDialog?: () => void;
  /**
   * Phase 6 / T006: Called when the editor fails to mount or encounters
   * a post-mount error. FileViewerPanel wires this to switch back to Source mode.
   */
  onFallback?: () => void;
}

/**
 * Names of lucide-react icons used by the toolbar. Keeps the config
 * declarative and decouples it from lucide's runtime module layout.
 */
export type ToolbarIconName =
  | 'Heading1'
  | 'Heading2'
  | 'Heading3'
  | 'Pilcrow'
  | 'Bold'
  | 'Italic'
  | 'Strikethrough'
  | 'Code'
  | 'List'
  | 'ListOrdered'
  | 'Quote'
  | 'SquareCode'
  | 'Minus'
  | 'Link'
  | 'Undo2'
  | 'Redo2';

/**
 * Single toolbar action — pure-data description that a render layer
 * turns into a `<Button>`. Predicates are pure functions of editor state.
 */
export interface ToolbarAction {
  /** Stable id used for `data-testid` and React keys. */
  id: string;
  /** Accessible label (`aria-label`). */
  label: string;
  /** Plain tooltip text (shown via `title`, shortcut appended if present). */
  tooltip: string;
  /** Human-readable shortcut hint (e.g. "⌘B"). Undefined for actions without one. */
  shortcut?: string;
  /** Icon name in `lucide-react`. */
  iconName: ToolbarIconName;
  /** Whether this action is "pressed" given the current editor state. */
  isActive?: (editor: Editor) => boolean;
  /** Whether this action is currently disabled. */
  isDisabled?: (editor: Editor) => boolean;
  /** Executes the action — the Link action calls `onOpenLinkDialog` instead. */
  run: (editor: Editor, options: { onOpenLinkDialog?: () => void }) => void;
}

/** A visually-grouped row of actions in the toolbar, separated by dividers. */
export interface ToolbarGroup {
  id: string;
  actions: ToolbarAction[];
}

/**
 * Props for the `<WysiwygToolbar />` component.
 *
 * `editor` may be `null` during the brief `immediatelyRender: false` gap,
 * in which case the toolbar renders a disabled skeleton to avoid flicker.
 */
export interface WysiwygToolbarProps {
  editor: Editor | null;
  /** Invoked by the Link button; Phase 3 wires this to the real popover. */
  onOpenLinkDialog?: () => void;
  /**
   * Optional ref to forward to the Link toolbar button's underlying
   * <button> element. When supplied, Phase 3's LinkPopover uses it as
   * the Radix PopoverAnchor virtualRef so the popover positions
   * relative to the Link button instead of viewport (0,0).
   */
  linkButtonRef?: React.Ref<HTMLButtonElement>;
  className?: string;
}

/**
 * Configuration passed to the Tiptap extension builder.
 * Kept as a structural type so `wysiwyg-extensions.ts`'s caller can
 * satisfy it without importing Tiptap here.
 */
export interface TiptapExtensionConfig {
  placeholder: string;
  imageUrlResolver?: ImageUrlResolver;
  currentFilePath?: string;
  rawFileBaseUrl?: string;
}

/**
 * Discriminated-union result of `sanitizeLinkHref(raw)`. Callers
 * pattern-match on `ok` rather than sentinel values.
 *
 * Reasons:
 *   - `javascript-scheme` — the input resolved to a disallowed scheme
 *     (javascript/data/vbscript/file/etc.) after control-char stripping,
 *     case folding, and paranoid `%XX` prefix guards.
 *   - `empty` — whitespace-only or empty string after trimming.
 */
export type SanitizedHref =
  | { ok: true; href: string }
  | { ok: false; reason: 'javascript-scheme' | 'empty' };

/**
 * Props for `<LinkPopover />`.
 *
 * - `editor` — the live Tiptap Editor instance (or null during the
 *   immediatelyRender: false gap). Popover disables controls when null.
 * - `open` / `onOpenChange` — controlled-open pattern; the parent owns
 *   open state so both the toolbar Link button and the editor's Mod-k
 *   shortcut can open the same popover.
 * - `anchorRef` — the DOM element the popover positions against
 *   (typically the toolbar Link button's <button ref>). When supplied,
 *   the desktop variant uses Radix `PopoverAnchor virtualRef` to
 *   position the content without wrapping the anchor element.
 * - `className` — optional wrapper override.
 */
export interface LinkPopoverProps {
  editor: Editor | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}
