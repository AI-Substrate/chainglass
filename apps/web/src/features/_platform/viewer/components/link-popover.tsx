'use client';

/**
 * LinkPopover — desktop-Popover / mobile-Sheet form for inserting,
 * editing, and unlinking Tiptap Link marks.
 *
 * Phase 3. Covers workshop §§ 5.1–5.5 + 11.3 + 12.
 *
 * Opens via (a) the toolbar Link button's onClick handler, or (b) the
 * editor's Mod-k keyboard shortcut (T006). Both set the same `open`
 * state on the parent, which threads it here as a controlled prop.
 *
 * Branches:
 *   - Desktop (viewport > 768 px): shadcn `Popover` with `modal={true}`
 *     so Radix FocusScope traps focus (default `modal={false}` does NOT).
 *     Anchored via `PopoverAnchor virtualRef={anchorRef}` to the Link
 *     toolbar button — without an anchor Radix positions at viewport
 *     (0, 0).
 *   - Mobile (viewport <= 768 px): shadcn `Sheet side="bottom"` — Dialog
 *     primitive traps focus by default. Stacked footer on narrow.
 *
 * Modes (derived from `editor.isActive('link')`):
 *   - Insert: title "🔗 Insert link", footer [Cancel] [Insert]. If a
 *     non-empty selection exists at open time, its text pre-fills the
 *     Text field so `⌘K` over a selected word wraps it.
 *   - Edit: title "🔗 Edit link", footer [Unlink] [Cancel] [Update].
 *     Both fields pre-fill from the link mark's attrs + range text.
 *
 * A11y:
 *   - role="dialog" + aria-labelledby on the body.
 *   - Every Input has an explicit <Label htmlFor> / <Input id> pair
 *     (shadcn Label does NOT auto-bind).
 *   - URL field auto-focuses on open.
 *   - Enter on URL submits; Esc closes (Radix-managed).
 *   - Mod-k while popover is open is SWALLOWED at the popover root so
 *     the browser's chrome shortcut (Chrome omnibox / Firefox search
 *     bar) never fires; URL input stays focused.
 *   - Focus-return: on open, capture document.activeElement into
 *     openerRef; on close (Radix onCloseAutoFocus), prevent default and
 *     restore focus to the captured node. This makes Esc return to the
 *     Link button (click path) OR back into the editor (Mod-k path)
 *     depending on where the user was.
 *
 * Security: defense-in-depth via `sanitizeLinkHref`. T006 also wires
 * the same function into `Link.configure({ isAllowedUri })` so even a
 * programmatic `setLink({ href: 'javascript:…' })` is refused.
 */

import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { Link2Off } from 'lucide-react';
import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

import { sanitizeLinkHref } from '../lib/sanitize-link-href';
import type { LinkPopoverProps } from '../lib/wysiwyg-extensions';

type Mode = 'insert' | 'edit';

// Phone/tablet boundary uses the shared hook (`useIsMobile` from
// `@/hooks/use-mobile` — viewport width < 768 is phone). Keeping this
// consistent with the rest of the app avoids a 1-px breakpoint drift
// where the link popover would render as a bottom-sheet at exactly 768px
// while every other responsive component still rendered as desktop.

/**
 * Reads the visible text of the link mark the caret is inside plus the
 * href attribute. Uses Tiptap's `extendMarkRange('link')` to move the
 * selection to cover the whole mark, then reads `textBetween`. The
 * selection-extension is a desirable side-effect: Update's subsequent
 * `setLink` replaces the natural unit (the whole link).
 *
 * Returns empty strings when no link mark is active at the caret.
 */
function readLinkTextAndHref(editor: Editor): { text: string; href: string } {
  const href = (editor.getAttributes('link').href as string | undefined) ?? '';
  if (!editor.isActive('link')) return { text: '', href };
  // extendMarkRange is idempotent; dispatching it snaps the selection to
  // the mark's boundaries. `.focus()` ensures the editor stays active.
  editor.chain().focus().extendMarkRange('link').run();
  const { from, to } = editor.state.selection;
  return { text: editor.state.doc.textBetween(from, to) || '', href };
}

interface BodyProps {
  mode: Mode;
  disabled: boolean;
  text: string;
  url: string;
  error: string | null;
  setText: (v: string) => void;
  setUrl: (v: string) => void;
  onSubmit: () => void;
  onUnlink: () => void;
  onCancel: () => void;
  className?: string;
}

function LinkPopoverBody({
  mode,
  disabled,
  text,
  url,
  error,
  setText,
  setUrl,
  onSubmit,
  onUnlink,
  onCancel,
  className,
}: BodyProps) {
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the URL input on open. Focus runs after first paint so the
  // Radix FocusScope mount effect doesn't fight us.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      urlInputRef.current?.focus();
      urlInputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const swallowModK = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      e.stopPropagation();
      urlInputRef.current?.focus();
    }
  }, []);

  return (
    <div
      role="dialog"
      aria-labelledby="link-popover-title"
      data-testid="link-popover"
      onKeyDown={swallowModK}
      className={cn('flex flex-col gap-3 min-w-[280px]', className)}
    >
      <h3 id="link-popover-title" className="text-sm font-semibold">
        {mode === 'edit' ? '🔗 Edit link' : '🔗 Insert link'}
      </h3>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="link-popover-text" className="text-xs">
            Text
          </Label>
          <Input
            id="link-popover-text"
            data-testid="link-popover-text-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="link-popover-url" className="text-xs">
            URL
          </Label>
          <Input
            ref={urlInputRef}
            id="link-popover-url"
            data-testid="link-popover-url-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSubmit();
              }
            }}
            disabled={disabled}
            placeholder="https://…"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>
      {error ? (
        <p role="alert" data-testid="link-popover-error" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {mode === 'edit' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onUnlink}
            disabled={disabled}
            data-testid="link-popover-unlink"
            className="sm:mr-auto"
          >
            <Link2Off className="h-3.5 w-3.5 mr-1" />
            Unlink
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={disabled}
          data-testid="link-popover-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onSubmit}
          disabled={disabled}
          data-testid="link-popover-submit"
        >
          {mode === 'edit' ? 'Update' : 'Insert'}
        </Button>
      </div>
    </div>
  );
}

export function LinkPopover({
  editor,
  open,
  onOpenChange,
  anchorRef,
  className,
}: LinkPopoverProps) {
  const isMobile = useIsMobile();

  // `useEditorState` subscribes to the is-in-link slice. Returns `false`
  // when editor is null (first render / immediatelyRender gap).
  const isInLinkRaw = useEditorState({
    editor,
    selector: (ctx) => ctx.editor?.isActive('link') ?? false,
  });
  const isInLink = isInLinkRaw ?? false;
  const mode: Mode = isInLink ? 'edit' : 'insert';

  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Capture-and-restore opener across the open boundary. Radix's default
  // onCloseAutoFocus targets the Trigger element, which is wrong for the
  // Mod-k open path (no trigger was clicked).
  const openerRef = useRef<HTMLElement | null>(null);
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    }
    prevOpenRef.current = open;
  }, [open]);

  // Prefill per mode. Runs once per open cycle — when the popover first
  // has both `open === true` AND a non-null `editor`. Resets on close so
  // the next open triggers a fresh read of the selection / link mark.
  // Keeping this separate from the opener capture above handles the race
  // where the editor is null at open time and arrives asynchronously.
  const hasPrefilledRef = useRef(false);
  useEffect(() => {
    if (!open) {
      hasPrefilledRef.current = false;
      return;
    }
    if (!editor || hasPrefilledRef.current) return;
    if (isInLink) {
      const { text: t, href: h } = readLinkTextAndHref(editor);
      setText(t);
      setUrl(h);
    } else {
      const { from, to } = editor.state.selection;
      const selText = from !== to ? editor.state.doc.textBetween(from, to) : '';
      setText(selText);
      setUrl('');
    }
    setError(null);
    hasPrefilledRef.current = true;
  }, [open, editor, isInLink]);

  const restoreOpenerFocus = useCallback((e: Event) => {
    e.preventDefault();
    const target = openerRef.current;
    openerRef.current = null;
    if (target && typeof target.focus === 'function') {
      // requestAnimationFrame yields to Radix's unmount cycle so the
      // focus lands on the real element after Radix has released its
      // FocusScope hold.
      requestAnimationFrame(() => target.focus?.());
    }
  }, []);

  const handleSubmit = useCallback(() => {
    if (!editor) return;
    const result = sanitizeLinkHref(url);
    if (!result.ok) {
      setError(result.reason === 'empty' ? 'URL cannot be empty.' : 'URL scheme is not allowed.');
      return;
    }
    const href = result.href;

    let ok: boolean;
    if (isInLink) {
      // Edit mode — extend to cover the whole link, then either re-apply
      // setLink (preserves nested marks like bold-inside-link) or
      // replace text first if user edited it.
      const { text: originalText } = readLinkTextAndHref(editor);
      const chain = editor.chain().focus().extendMarkRange('link');
      if (text && text !== originalText) {
        ok = chain.insertContent(text).setLink({ href }).run();
      } else {
        ok = chain.setLink({ href }).run();
      }
    } else {
      // Insert mode
      const { from, to } = editor.state.selection;
      const hasSelection = from !== to;
      if (hasSelection) {
        const selText = editor.state.doc.textBetween(from, to);
        if (text && text !== selText) {
          ok = editor.chain().focus().insertContent(text).setLink({ href }).run();
        } else {
          ok = editor.chain().focus().setLink({ href }).run();
        }
      } else if (text) {
        ok = editor.chain().focus().insertContent(text).setLink({ href }).run();
      } else {
        // No selection, no Text — fall back to visible-text = URL.
        ok = editor.chain().focus().insertContent(href).setLink({ href }).run();
      }
    }

    if (ok) {
      setError(null);
      onOpenChange(false);
    } else {
      setError('Could not insert link.');
    }
  }, [editor, isInLink, text, url, onOpenChange]);

  const handleUnlink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setError(null);
    onOpenChange(false);
  }, [editor, onOpenChange]);

  const handleCancel = useCallback(() => {
    setError(null);
    onOpenChange(false);
  }, [onOpenChange]);

  const bodyProps: BodyProps = {
    mode,
    disabled: !editor,
    text,
    url,
    error,
    setText,
    setUrl,
    onSubmit: handleSubmit,
    onUnlink: handleUnlink,
    onCancel: handleCancel,
    className,
  };

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[50vh] p-4"
          data-testid="link-popover-sheet"
          onCloseAutoFocus={restoreOpenerFocus}
        >
          {/* Radix Dialog requires a Title + Description for screen-reader users.
              Our visible title lives inside the body's <h3>; the aria-labelledby
              on the body points at it. We add a sr-only SheetTitle + Description
              here solely to satisfy Radix's a11y gate without duplicating the
              visible label. */}
          <SheetTitle className="sr-only">
            {mode === 'edit' ? 'Edit link' : 'Insert link'}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Enter a URL and optional display text.
          </SheetDescription>
          <LinkPopoverBody {...bodyProps} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal>
      {anchorRef ? (
        <PopoverAnchor virtualRef={anchorRef as RefObject<HTMLElement>} asChild={false} />
      ) : null}
      <PopoverContent className="w-auto p-3" align="start" onCloseAutoFocus={restoreOpenerFocus}>
        <LinkPopoverBody {...bodyProps} />
      </PopoverContent>
    </Popover>
  );
}
