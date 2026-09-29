'use client';

/**
 * TerminalPaneHeader — the shared control strip for every terminal surface.
 *
 * FX014 (Plan 084): the floating overlay (Mode A) and the inline split pane
 * (Mode B) previously rendered their own headers — the overlay had the theme
 * picker + copy-buffer button, the split pane had nothing. Splitting therefore
 * lost the theme selector and copy/paste control. This component is the single
 * source of truth for those controls so the two surfaces can never drift
 * again. The `/terminal` page can adopt it too.
 *
 * `onClose` is optional: the overlay passes its close handler (renders the X),
 * the split pane omits it (exit is driven by the split-toggle button in the
 * file-browser toolbar).
 *
 * Plan 092 (tk-0004): the prompt-drawer toggle AND the drawer itself live
 * here for the same reason — one edit reaches both surfaces. The drawer is
 * absolutely positioned, so it anchors to the nearest positioned ancestor:
 * the overlay root is already `fixed`, and the split-pane root was given
 * `relative` for this. Do NOT add a second toggle to either host; that
 * re-creates the exact drift this component exists to end.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ClipboardCopy,
  MessageSquareText,
  Pencil,
  Plus,
  Scaling,
  Search,
  TerminalSquare,
  X,
} from 'lucide-react';
import { type FormEvent, useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { AgentKind } from '../lib/agent-kind';
import { copyTmuxBuffer } from '../lib/copy-tmux-buffer';
import { NEW_WINDOW_AGENTS, type NewWindowAgent } from '../lib/new-window-agents';
import { CHILD_BUSY_FRACTION, formatIdle } from '../lib/window-activity';
import { getWindowNameValidationError } from '../lib/window-name-validation';
import type { ConnectionStatus } from '../types';
import { ConnectionStatusBadge } from './connection-status-badge';
import { TerminalPromptDrawer } from './terminal-prompt-drawer';
import { useTerminalSingleton } from './terminal-singleton-provider';
import { TerminalThemeSelect } from './terminal-theme-select';

export interface TerminalPaneHeaderProps {
  /** Session name shown on the left. */
  sessionName: string;
  /** Live WS connection status for the badge. */
  connectionStatus: ConnectionStatus;
  /** Optional close handler — when provided, renders the X button (overlay). */
  onClose?: () => void;
}

/** Top-left corner mark per coding-agent harness (Jordan, 2026-09-28). */
const AGENT_MARK: Record<AgentKind, { color: string; label: string }> = {
  claude: { color: '#d97757', label: 'Claude Code' },
  copilot: { color: '#d946ef', label: 'Copilot CLI' },
  pi: { color: '#14b8a6', label: 'omp / pi' },
  codex: { color: '#facc15', label: 'Codex' },
};

/**
 * How many quarters of a window box the background-job fill covers: none while the jobs are
 * barely working (under 3% of a core), then one quarter per 25% of a core, rounded up; 100% or
 * more fills it.
 */
/** Height of the bottom slice that belongs to the agent itself (bar / question / idle time). */
const AGENT_SLICE_PX = 10;

function backgroundQuarters(cpu: number): number {
  return cpu < CHILD_BUSY_FRACTION ? 0 : Math.min(4, Math.ceil(cpu / 0.25));
}

export function TerminalPaneHeader({
  sessionName,
  connectionStatus,
  onClose,
}: TerminalPaneHeaderProps) {
  // Plan 092 tk-0105: the real sender comes off the singleton context, not
  // down through props. Both hosts already render inside the provider, so
  // neither of them grows a prop for the drawer — which is the drift FX014
  // created this component to end.
  const {
    sendPrompt,
    renameWindow,
    resizeMode,
    toggleResizeMode,
    windows,
    selectWindow,
    newWindow,
  } = useTerminalSingleton();
  // "+" at the end of the strip: pick an agent, name the window, create and select it.
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [newAgent, setNewAgent] = useState<NewWindowAgent | null>(null);
  const [newName, setNewName] = useState('');
  const [newNameError, setNewNameError] = useState<string | null>(null);
  const handleCreateWindow = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!newAgent) return;
      const error = getWindowNameValidationError(newName);
      if (error) {
        setNewNameError(error);
        return;
      }
      newWindow?.(newAgent, newName.trim());
      setNewAgent(null);
      setNewName('');
      setNewNameError(null);
    },
    [newAgent, newName, newWindow]
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Window-name search: non-modal popover; closing it (click away, Escape) clears the query.
  const [searchOpen, setSearchOpen] = useState(false);
  const [windowQuery, setWindowQuery] = useState('');
  const query = windowQuery.trim().toLowerCase();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [windowName, setWindowName] = useState('');
  const [windowNameError, setWindowNameError] = useState<string | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  // The drawer covers the terminal BODY, not the header — so it starts at the
  // header's bottom edge. Measured rather than hardcoded: the header's height
  // follows its content and a magic pixel constant silently rots. jsdom
  // reports 0 here, which is harmless: the tests assert composition, not
  // layout, and layout is what Jordan exercises under HMR (ac-0009).
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderHeight(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Null only before the singleton's lazily-mounted TerminalInner exists; the
  // drawer's actions are already disabled while the socket is not connected,
  // so the guard is belt-and-braces rather than a live path.
  const handleSend = useCallback(
    (text: string, options: { submit: boolean }) => {
      sendPrompt?.(text, options);
    },
    [sendPrompt]
  );

  const handleRename = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const error = getWindowNameValidationError(windowName);
      if (error) {
        setWindowNameError(error);
        return;
      }
      renameWindow?.(windowName);
      setRenameDialogOpen(false);
      setWindowName('');
      setWindowNameError(null);
    },
    [renameWindow, windowName]
  );

  return (
    <>
      <div
        ref={headerRef}
        className="flex min-w-0 items-start justify-between gap-3 border-b px-3 py-2 shrink-0"
      >
        <div className="flex flex-1 items-start gap-2 min-w-0">
          <TerminalSquare className="mt-1.5 h-4 w-4 text-muted-foreground shrink-0" />
          <span
            className="mt-1 max-w-[40%] truncate text-sm font-medium shrink-0"
            title={sessionName}
          >
            {sessionName}
          </span>
          <nav
            aria-label="tmux windows"
            className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
          >
            {/* Wraps rather than clips: a busy session (unasphere had 30+) pushed the
                later windows off the edge with no way to reach them. */}
            {windows.map((window) => {
              const outputActive = window.activeSeconds !== null;
              const activeLabel = outputActive ? formatIdle(window.activeSeconds ?? 0) : null;
              // Never seen genuinely active: no time at all, rather than a misleading one.
              const idleLabel =
                !outputActive && window.idleSeconds !== null
                  ? formatIdle(window.idleSeconds)
                  : null;
              const tone = window.active
                ? 'bg-primary text-primary-foreground'
                : outputActive
                  ? 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                  : 'bg-zinc-300 text-zinc-700 hover:bg-zinc-400 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600';
              const asking = !outputActive && window.question;
              const agent = window.agent ? AGENT_MARK[window.agent] : null;
              const background = window.background;
              // Background jobs fill upward whatever the agent is doing: above the green bar
              // while it works, above the idle time while it rests.
              const showBackground = background !== null;
              // Search wins over the background outline while a query is active.
              const matchTone =
                query.length === 0
                  ? ''
                  : window.name.toLowerCase().includes(query)
                    ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-background'
                    : 'opacity-30';
              const fillQuarters = showBackground ? backgroundQuarters(background.cpu) : 0;
              const status = activeLabel
                ? `active ${activeLabel}`
                : asking
                  ? `asking a question${idleLabel ? `, idle ${idleLabel}` : ''}`
                  : idleLabel
                    ? `idle ${idleLabel}`
                    : null;
              return (
                <Tooltip key={`${window.id}:${window.index}`}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => selectWindow?.(window.id, window.index)}
                      disabled={connectionStatus !== 'connected' || !selectWindow}
                      aria-label={`Window ${window.index}: ${window.name}${agent ? `, ${agent.label}` : ''}${status ? `, ${status}` : ''}${background ? `, ${background.jobs.length} background ${background.jobs.length === 1 ? 'job' : 'jobs'}` : ''}`}
                      aria-pressed={window.active}
                      data-output-active={outputActive ? 'true' : 'false'}
                      className={`relative flex h-7 min-w-8 shrink-0 flex-col items-center overflow-hidden rounded px-1 pt-0.5 text-[11px] font-medium leading-none tabular-nums focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50 ${tone} ${matchTone}`}
                    >
                      {agent ? (
                        <span
                          aria-hidden="true"
                          className="absolute top-0 left-0 h-0 w-0 border-t-[7px] border-r-[7px] border-r-transparent"
                          style={{ borderTopColor: agent.color }}
                        />
                      ) : null}
                      {/* Five slices: the bottom one is the agent itself (green bar / magenta
                          question / idle time); the four above rise with background-job CPU,
                          one per 25% of a core, as one solid column; a thin white line
                          separates it from the agent slice. */}
                      {fillQuarters > 0 ? (
                        <span
                          aria-hidden="true"
                          data-background-quarters={fillQuarters}
                          className="absolute inset-x-0 border-b border-white bg-emerald-500"
                          style={{
                            bottom: AGENT_SLICE_PX,
                            height: `calc((100% - ${AGENT_SLICE_PX}px) * ${fillQuarters / 4})`,
                          }}
                        />
                      ) : null}
                      <span className={`relative ${fillQuarters >= 3 ? 'text-white' : ''}`}>
                        {window.index}
                      </span>
                      {idleLabel && !asking ? (
                        <span className="relative mt-auto pb-0.5 text-[8px] font-normal opacity-80">
                          {idleLabel}
                        </span>
                      ) : null}
                      {outputActive || asking ? (
                        <span
                          className={`absolute inset-x-0 bottom-0 flex items-center justify-center text-[8px] font-medium text-white ${asking ? 'bg-fuchsia-500' : 'bg-emerald-500'}`}
                          style={{ height: AGENT_SLICE_PX }}
                        >
                          {asking ? idleLabel : activeLabel}
                        </span>
                      ) : null}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-72">
                    <div className="font-medium">{window.name}</div>
                    <div className="opacity-80">
                      {[agent?.label, status].filter(Boolean).join(' · ')}
                    </div>
                    {background ? (
                      <ul className="mt-1 space-y-0.5 tabular-nums">
                        {background.jobs.map((job, index) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: labels can repeat
                          <li key={index} className="flex justify-between gap-3">
                            <span className="truncate">{job.label}</span>
                            <span className="opacity-80">{Math.round(job.cpu * 100)}%</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </TooltipContent>
                </Tooltip>
              );
            })}
            <Popover open={newMenuOpen} onOpenChange={setNewMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={connectionStatus !== 'connected' || !newWindow}
                  aria-label="New agent window"
                  title="New agent window"
                  className="flex h-7 min-w-8 shrink-0 items-center justify-center rounded bg-muted px-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-1">
                {(Object.keys(NEW_WINDOW_AGENTS) as NewWindowAgent[]).map((key) => {
                  const option = NEW_WINDOW_AGENTS[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setNewMenuOpen(false);
                        setNewName('');
                        setNewNameError(null);
                        setNewAgent(key);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: AGENT_MARK[option.kind].color }}
                      />
                      <span className="whitespace-nowrap font-medium">{option.label}</span>
                      <code className="ml-auto truncate text-[11px] text-muted-foreground">
                        {option.command}
                      </code>
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Popover
            open={searchOpen}
            onOpenChange={(open) => {
              setSearchOpen(open);
              if (!open) setWindowQuery('');
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className="rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-accent aria-expanded:bg-accent aria-expanded:text-foreground"
                aria-label="Search windows by name"
                title="Search windows by name"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-64 p-2"
              onOpenAutoFocus={(event) => {
                // Land the caret in the field rather than on the popover container.
                event.preventDefault();
                searchInputRef.current?.focus();
              }}
            >
              <input
                type="search"
                value={windowQuery}
                onChange={(event) => setWindowQuery(event.target.value)}
                placeholder="Window name…"
                aria-label="Window name"
                ref={searchInputRef}
                className="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {query.length > 0 ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {windows.filter((window) => window.name.toLowerCase().includes(query)).length} of{' '}
                  {windows.length} windows match
                </p>
              ) : null}
            </PopoverContent>
          </Popover>
          <TerminalThemeSelect />
          <button
            type="button"
            onClick={() => setDrawerOpen((prev) => !prev)}
            className="rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-accent aria-expanded:bg-accent aria-expanded:text-foreground"
            aria-label="Prompt drawer"
            aria-expanded={drawerOpen}
            title="Saved prompts"
          >
            <MessageSquareText className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => copyTmuxBuffer()}
            className="rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
            aria-label="Copy tmux buffer"
            title="Copy tmux buffer"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setRenameDialogOpen(true)}
            disabled={!renameWindow}
            className="rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Rename tmux window"
            title="Rename tmux window"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleResizeMode}
            disabled={connectionStatus !== 'connected'}
            className="rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-accent aria-pressed:bg-accent aria-pressed:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Resize tmux panes"
            aria-pressed={resizeMode}
            title="Drag tmux pane borders to resize"
          >
            <Scaling className="h-3.5 w-3.5" />
          </button>
          <ConnectionStatusBadge status={connectionStatus} showLabel={false} />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm p-1 hover:bg-accent"
              aria-label="Close terminal overlay"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <TerminalPromptDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        onSend={handleSend}
        connected={connectionStatus === 'connected'}
        topOffset={headerHeight}
      />

      <Dialog
        open={renameDialogOpen}
        onOpenChange={(open) => {
          setRenameDialogOpen(open);
          if (!open) setWindowNameError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename tmux window</DialogTitle>
            <DialogDescription>Set a name for the current tmux window.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRename} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="terminal-window-name" className="text-sm font-medium">
                Window name
              </label>
              <input
                id="terminal-window-name"
                value={windowName}
                onChange={(event) => {
                  setWindowName(event.target.value);
                  setWindowNameError(null);
                }}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                aria-invalid={windowNameError ? true : undefined}
                aria-describedby={windowNameError ? 'terminal-window-name-error' : undefined}
                // biome-ignore lint/a11y/noAutofocus: user-invoked modal — the input is the dialog's only purpose, and the rule targets page-load focus theft, not focus placement inside a dialog the user opened.
                autoFocus
              />
              {windowNameError && (
                <p id="terminal-window-name-error" className="text-sm text-destructive">
                  {windowNameError}
                </p>
              )}
            </div>
            <DialogFooter>
              <button
                type="submit"
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Rename window
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newAgent !== null}
        onOpenChange={(open) => {
          if (!open) {
            setNewAgent(null);
            setNewNameError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              New {newAgent ? NEW_WINDOW_AGENTS[newAgent].label : ''} window
            </DialogTitle>
            <DialogDescription>
              Opens a tmux window in this worktree and runs{' '}
              <code>{newAgent ? NEW_WINDOW_AGENTS[newAgent].command : ''}</code>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateWindow} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="terminal-new-window-name" className="text-sm font-medium">
                Window name
              </label>
              <input
                id="terminal-new-window-name"
                value={newName}
                onChange={(event) => {
                  setNewName(event.target.value);
                  setNewNameError(null);
                }}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                aria-invalid={newNameError ? true : undefined}
                aria-describedby={newNameError ? 'terminal-new-window-name-error' : undefined}
                // biome-ignore lint/a11y/noAutofocus: user-invoked modal whose only purpose is this input.
                autoFocus
              />
              {newNameError && (
                <p id="terminal-new-window-name-error" className="text-sm text-destructive">
                  {newNameError}
                </p>
              )}
            </div>
            <DialogFooter>
              <button
                type="submit"
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Create window
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
