'use client';

/**
 * WysiwygToolbar — 16-button formatting toolbar for MarkdownWysiwygEditor.
 *
 * Reads state from a Tiptap `Editor` instance via `useEditorState`, which
 * memoizes per-selector-key and only re-renders when a specific slice
 * changes. This avoids running 16 `editor.isActive(...)` predicates per
 * keystroke on the consumer.
 *
 * When `editor === null` (brief `immediatelyRender: false` gap, or before
 * Phase 1 `onEditorReady` fires), the toolbar renders a full skeleton with
 * every button disabled — prevents flicker when the editor hydrates.
 *
 * Accessibility:
 *   - `role="toolbar"` + `aria-label="Formatting toolbar"` on the container
 *     (semantic grouping for screen readers — workshop § 12).
 *   - `aria-label` on each button (tooltip redundancy).
 *   - `aria-pressed` reflects `isActive` state (toggle semantics).
 *   - `disabled` HTML attr only (NOT `aria-disabled` — dual attrs are an
 *     anti-pattern; `disabled` is both semantic and screen-reader correct).
 *
 * Styling: shadcn `Button` `variant="ghost"` by default, `"secondary"` when
 * active. Horizontal overflow (mobile) via `overflow-x-auto no-scrollbar`.
 */

import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Undo2,
} from 'lucide-react';
import type { ComponentType, Ref } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type {
  ToolbarAction,
  ToolbarIconName,
  WysiwygToolbarProps,
} from '../lib/wysiwyg-extensions';
import { WYSIWYG_TOOLBAR_GROUPS } from '../lib/wysiwyg-toolbar-config';

type LucideIcon = ComponentType<{ className?: string }>;

const ICONS: Record<ToolbarIconName, LucideIcon> = {
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  SquareCode,
  Minus,
  Link,
  Undo2,
  Redo2,
};

/**
 * Snapshot of the 16 action states — one `active_<id>` + `disabled_<id>`
 * boolean per action. Shape is flat for `useEditorState`'s shallow-compare.
 */
type ToolbarState = Record<string, boolean>;

function computeState(editor: Editor | null): ToolbarState {
  const state: ToolbarState = {};
  for (const group of WYSIWYG_TOOLBAR_GROUPS) {
    for (const action of group.actions) {
      if (!editor) {
        state[`active_${action.id}`] = false;
        state[`disabled_${action.id}`] = true;
        continue;
      }
      state[`active_${action.id}`] = action.isActive?.(editor) ?? false;
      state[`disabled_${action.id}`] = action.isDisabled?.(editor) ?? false;
    }
  }
  return state;
}

function ToolbarButton({
  action,
  editor,
  state,
  onOpenLinkDialog,
  buttonRef,
}: {
  action: ToolbarAction;
  editor: Editor | null;
  state: ToolbarState;
  onOpenLinkDialog?: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const Icon = ICONS[action.iconName];
  const active = state[`active_${action.id}`] ?? false;
  const disabled = !editor || (state[`disabled_${action.id}`] ?? false);
  const title = action.shortcut ? `${action.tooltip} (${action.shortcut})` : action.tooltip;

  return (
    <Button
      ref={buttonRef}
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      aria-label={action.label}
      aria-pressed={active}
      disabled={disabled}
      title={title}
      data-testid={`toolbar-${action.id}`}
      onClick={() => {
        if (!editor) return;
        action.run(editor, { onOpenLinkDialog });
      }}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );
}

export function WysiwygToolbar({
  editor,
  onOpenLinkDialog,
  linkButtonRef,
  className,
}: WysiwygToolbarProps) {
  // `useEditorState` returns `null` when `editor` is null; the selector only
  // runs when a real editor exists. Fall back to a fresh null-state snapshot
  // so the render below is uniform in both branches.
  const liveState = useEditorState({
    editor,
    selector: ({ editor: ctxEditor }) => computeState(ctxEditor),
  });
  const state = liveState ?? computeState(null);

  return (
    <div
      role="toolbar"
      aria-label="Formatting toolbar"
      className={cn(
        'flex items-center gap-0.5 overflow-x-auto no-scrollbar px-2 py-1 border-b',
        className
      )}
      data-testid="wysiwyg-toolbar"
    >
      {WYSIWYG_TOOLBAR_GROUPS.map((group, index) => (
        <div key={group.id} className="flex items-center gap-0.5">
          {index > 0 ? (
            <div className="mx-1 h-5 w-px bg-border" role="separator" aria-orientation="vertical" />
          ) : null}
          {group.actions.map((action) => (
            <ToolbarButton
              key={action.id}
              action={action}
              editor={editor}
              state={state}
              onOpenLinkDialog={onOpenLinkDialog}
              buttonRef={action.id === 'link' ? linkButtonRef : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
