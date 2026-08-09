'use client';

/**
 * TerminalPromptDrawer — saved prompts, one row each, over the right third of
 * the terminal pane (Plan 092, tk-0003 / tk-0005).
 *
 * SEND-FREE BY DESIGN. Both row actions call the injected `onSend` callback.
 * Phase 1 fills it with a stub; phase 2 swaps in the real tmux send-keys path
 * WITHOUT touching this component. Nothing here knows about tmux, the pty or
 * the websocket, and nothing here should learn.
 *
 * `submit` is a FLAG, not a newline. A real newline in an agent TUI is a
 * submit, so a five-line prompt typed literally submits five partial prompts
 * (workshop 001 section 3). The type and the submit are two separate tmux
 * calls with a per-harness settle between them, which only the sender can
 * sequence — so the callback carries intent and the sender owns delivery.
 *
 * ROW BODY IS THE PRIMARY ACTION (tk-0008): the label is a real <button>, not
 * a click handler on the <li>. It is a SIBLING of the icon buttons, never an
 * ancestor — a button cannot nest inside a button, so the icons structurally
 * cannot bubble into it and no `stopPropagation` is needed to stop the type
 * icon also submitting. A native button also gives Enter/Space activation and
 * focus order for free, which a div with an onClick would have to fake and
 * would get subtly wrong.
 *
 * ESCAPE (tk-0005): the drawer owns a CAPTURE-phase document keydown while it
 * is open. A React `stopPropagation` cannot work here —
 * `terminal-overlay-panel.tsx` binds its close-on-Escape at the DOCUMENT in
 * the BUBBLE phase, and the toggle that opens this drawer is a SIBLING of it
 * inside `TerminalPaneHeader`, so in every realistic focus position (the xterm
 * textarea, the toggle) the event never passes through this subtree at all.
 * Capture at the document runs before any of them and before xterm's own
 * handler, so stopping propagation there is what actually keeps Escape from
 * closing the whole terminal. The overlay's binding is left alone — both hosts
 * depend on it when the drawer is closed.
 */

import { CornerDownLeft, Type as TypeIcon, X } from 'lucide-react';
import { useEffect } from 'react';
import { TERMINAL_PROMPTS, type TerminalPrompt, promptLabel } from '../lib/terminal-prompts';

export interface TerminalPromptDrawerProps {
  /** Whether the drawer is showing. Escape ownership is bound only while open. */
  open: boolean;
  /** Close the drawer — from the X, from Escape, and after a submit. */
  onClose: () => void;
  /**
   * Deliver a prompt. `submit` distinguishes "type it into the composer and
   * leave the user to edit" from "type it and submit it". Phase 1 passes a
   * stub; phase 2 passes the real sender.
   */
  onSend: (text: string, options: { submit: boolean }) => void;
  /**
   * False when the terminal websocket is not OPEN. `use-terminal-socket.ts`
   * makes a send a SILENT no-op on a closed socket, so the actions disable
   * rather than letting a click do nothing with no feedback.
   */
  connected: boolean;
  /**
   * Distance in px from the top of the positioned host root to the top of the
   * drawer — i.e. the pane header's height, so the drawer covers the terminal
   * body and leaves the header's controls (including its own toggle) usable.
   */
  topOffset?: number;
  /** Injectable for tests; defaults to the shipped list. */
  prompts?: readonly TerminalPrompt[];
}

export function TerminalPromptDrawer({
  open,
  onClose,
  onSend,
  connected,
  topOffset = 0,
  prompts = TERMINAL_PROMPTS,
}: TerminalPromptDrawerProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Order matters: stop first so neither the overlay's document-level
      // BUBBLE listener nor xterm's key handler ever sees this Escape.
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };

    document.addEventListener('keydown', handleKeyDownCapture, true);
    return () => document.removeEventListener('keydown', handleKeyDownCapture, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="absolute right-0 bottom-0 z-30 flex w-1/3 min-w-64 flex-col rounded-tl-xl border-l bg-popover text-popover-foreground shadow-2xl"
      style={{ top: `${topOffset}px` }}
      data-testid="terminal-prompt-drawer"
      aria-label="Saved prompts"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.09em] text-muted-foreground">
            Prompts
          </span>
          {!connected && (
            <span className="truncate text-[10px] text-muted-foreground/70">
              terminal disconnected
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Close prompt drawer"
        >
          <X className="size-4" />
        </button>
      </div>

      {prompts.length === 0 && (
        <p className="px-3 py-4 text-xs leading-relaxed text-muted-foreground">
          No prompts yet. Add them to{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
            lib/terminal-prompts.ts
          </code>
          .
        </p>
      )}

      <ul className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
        {prompts.map((prompt) => {
          const label = promptLabel(prompt.text);
          const submit = () => {
            onSend(prompt.text, { submit: true });
            // oq-0002: close on submit, stay open on type. Cheap to flip.
            onClose();
          };
          return (
            <li
              key={prompt.id}
              className="group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-accent has-[:focus-visible]:bg-accent"
            >
              <button
                type="button"
                disabled={!connected}
                onClick={submit}
                className="min-w-0 flex-1 truncate rounded-md px-2.5 py-2 text-left text-sm leading-snug text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground"
                title={prompt.text}
                aria-label={`Submit prompt: ${label}`}
                data-testid={`prompt-label-${prompt.id}`}
              >
                {label}
              </button>
              <button
                type="button"
                disabled={!connected}
                onClick={() => onSend(prompt.text, { submit: false })}
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground/50 transition-colors group-hover:text-muted-foreground hover:!text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`Type prompt: ${label}`}
                title="Type into the composer without submitting"
                data-testid={`prompt-type-${prompt.id}`}
              >
                <TypeIcon className="size-4" />
              </button>
              <button
                type="button"
                disabled={!connected}
                onClick={submit}
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground/50 transition-colors group-hover:text-muted-foreground hover:!text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`Type and submit prompt: ${label}`}
                title="Type and submit"
                data-testid={`prompt-submit-${prompt.id}`}
              >
                <CornerDownLeft className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
