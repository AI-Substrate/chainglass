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
  ChevronDown,
  ClipboardCopy,
  MessageSquareText,
  Pencil,
  Plus,
  Scaling,
  Search,
  TerminalSquare,
  X,
} from 'lucide-react';
import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { AGENT_MARK } from '../lib/agent-kind';
import { contextLabel } from '../lib/context-fill';
import { copyTmuxBuffer } from '../lib/copy-tmux-buffer';
import { NEW_WINDOW_AGENTS, type NewWindowAgent } from '../lib/new-window-agents';
import { CHILD_BUSY_FRACTION, formatIdle } from '../lib/window-activity';
import {
  type DropIndicatorGeometry,
  WINDOW_DRAG_THRESHOLD_PX,
  computeWindowDropTarget,
  resolveMoveTarget,
} from '../lib/window-drag-reorder';
import { getWindowNameValidationError } from '../lib/window-name-validation';
import { matchesQuery } from '../lib/window-overview';
import { recencyHeat, useWindowRecency } from '../lib/window-recency';
import type { ConnectionStatus } from '../types';
import { ConnectionStatusBadge } from './connection-status-badge';
import { ContextFillBar } from './context-fill-bar';
import { TerminalPromptDrawer } from './terminal-prompt-drawer';
import { useTerminalSingleton } from './terminal-singleton-provider';
import { TerminalThemeSelect } from './terminal-theme-select';
import { TerminalWindowOverview } from './terminal-window-overview';

export interface TerminalPaneHeaderProps {
  /** Session name shown on the left. */
  sessionName: string;
  /** Live WS connection status for the badge. */
  connectionStatus: ConnectionStatus;
  /** Optional close handler — when provided, renders the X button (overlay). */
  onClose?: () => void;
}

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
    moveWindow,
  } = useTerminalSingleton();
  // Recency heat bar along each button's top edge: strongest on the active window, one step
  // weaker per window visited before it, none beyond RECENCY_STEPS.
  const activeWindowId = windows.find((w) => w.active)?.id ?? null;
  const { order: recencyOrder, unseen } = useWindowRecency(
    sessionName,
    windows.map((w) => w.id),
    activeWindowId
  );
  // "+" at the end of the strip: pick an agent, name the window, create and select it.
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [newAgent, setNewAgent] = useState<NewWindowAgent | null>(null);
  const [newName, setNewName] = useState('');
  const [newNameError, setNewNameError] = useState<string | null>(null);
  const handleCreateWindow = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!newAgent) return;
      // Optional: blank lets pij name the window after its seat once the harness registers.
      const error = newName.trim().length > 0 ? getWindowNameValidationError(newName) : null;
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
  // ▾ after "+": the fold-down windows overview.
  const [overviewOpen, setOverviewOpen] = useState(false);
  const overviewToggleRef = useRef<HTMLButtonElement>(null);
  const closeOverview = useCallback(() => setOverviewOpen(false), []);
  // Window-name search: non-modal popover; closing it (click away, Escape) clears the query.
  const [searchOpen, setSearchOpen] = useState(false);
  const [windowQuery, setWindowQuery] = useState('');
  const query = windowQuery.trim().toLowerCase();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setWindowQuery('');
  }, []);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  // Non-modal: the box floats over the terminal, so the strip never moves; any click outside it
  // (other than its own toggle) closes and clears it.
  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (searchBoxRef.current?.contains(target) || searchToggleRef.current?.contains(target)) {
        return;
      }
      closeSearch();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [searchOpen, closeSearch]);
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

  // Drag-to-reorder state for the tmux window strip. A drag only engages once the pointer moves
  // past WINDOW_DRAG_THRESHOLD_PX so plain clicks still select and tooltips stay untouched.
  const stripRef = useRef<HTMLElement>(null);
  const windowButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const windowsRef = useRef(windows);
  windowsRef.current = windows;
  const moveWindowRef = useRef(moveWindow);
  moveWindowRef.current = moveWindow;
  const dragSessionRef = useRef<{
    sourceKey: string;
    sourceId: string;
    sourceIndex: number;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
    cancelled: boolean;
    slotIndex: number | null;
  } | null>(null);
  const suppressNextClickRef = useRef(false);
  const suppressClickTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const [dragVisual, setDragVisual] = useState<{
    sourceKey: string;
    slotIndex: number;
    indicator: DropIndicatorGeometry;
  } | null>(null);

  const armClickSuppression = useCallback(() => {
    suppressNextClickRef.current = true;
    clearTimeout(suppressClickTimerRef.current);
    suppressClickTimerRef.current = setTimeout(() => {
      suppressNextClickRef.current = false;
      suppressClickTimerRef.current = undefined;
    }, 0);
  }, []);

  const cancelWindowDrag = useCallback(() => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
    dragSessionRef.current = null;
    setDragVisual(null);
  }, []);

  useEffect(
    () => () => {
      cancelWindowDrag();
      clearTimeout(suppressClickTimerRef.current);
    },
    [cancelWindowDrag]
  );
  // Attach window-level listeners only while a pointer press on a window button is tracked.
  const attachDragListeners = useCallback(() => {
    const updateDropTarget = (clientX: number, clientY: number) => {
      const drag = dragSessionRef.current;
      const stripEl = stripRef.current;
      if (!drag || !stripEl) return;
      const currentWindows = windowsRef.current;
      const rects: DOMRect[] = [];
      for (const w of currentWindows) {
        const el = windowButtonRefs.current.get(`${w.id}:${w.index}`);
        if (!el) return;
        rects.push(el.getBoundingClientRect());
      }
      const target = computeWindowDropTarget(
        clientX,
        clientY,
        rects,
        stripEl.getBoundingClientRect()
      );
      if (!target) {
        drag.slotIndex = null;
        setDragVisual(null);
        return;
      }
      drag.slotIndex = target.slotIndex;
      setDragVisual({
        sourceKey: drag.sourceKey,
        slotIndex: target.slotIndex,
        indicator: target.indicator,
      });
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerCancel, true);
      window.removeEventListener('keydown', onKeyDown, true);
      if (dragCleanupRef.current === cleanup) dragCleanupRef.current = null;
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragSessionRef.current;
      if (!drag || drag.cancelled || event.pointerId !== drag.pointerId) return;
      if (!drag.active) {
        if (
          Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <
          WINDOW_DRAG_THRESHOLD_PX
        ) {
          return;
        }
        drag.active = true;
      }
      event.preventDefault();
      updateDropTarget(event.clientX, event.clientY);
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragSessionRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      cleanup();
      dragSessionRef.current = null;
      setDragVisual(null);
      if (!drag.active) return;
      // Swallow the synthetic click the browser dispatches in the same turn after mouseup.
      armClickSuppression();
      if (drag.cancelled || drag.slotIndex === null) return;
      const currentWindows = windowsRef.current;
      const sourcePos = currentWindows.findIndex(
        (w) => w.id === drag.sourceId && w.index === drag.sourceIndex
      );
      if (sourcePos === -1) return;
      const request = resolveMoveTarget(currentWindows, sourcePos, drag.slotIndex);
      if (request) moveWindowRef.current?.(request);
    };

    const onPointerCancel = (event: PointerEvent) => {
      const drag = dragSessionRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      cleanup();
      cancelWindowDrag();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const drag = dragSessionRef.current;
      if (!drag || drag.cancelled) return;
      if (drag.active) {
        // Keep the overlay's Escape (close terminal) from firing when cancelling a drag, and
        // wait for pointerup so releasing over the dragged button won't select it.
        event.preventDefault();
        event.stopPropagation();
        drag.cancelled = true;
        setDragVisual(null);
        return;
      }
      cleanup();
      cancelWindowDrag();
    };

    dragCleanupRef.current?.();
    dragCleanupRef.current = cleanup;
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerCancel, true);
    window.addEventListener('keydown', onKeyDown, true);
  }, [armClickSuppression, cancelWindowDrag]);

  const handleWindowPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, windowId: string, windowIndex: number) => {
      // Primary mouse/pen button only (touch dragging is out of scope); needs >1 window to reorder.
      if (event.button !== 0 || event.pointerType === 'touch') return;
      if (connectionStatus !== 'connected' || !moveWindow || windowsRef.current.length < 2) return;
      dragSessionRef.current = {
        sourceKey: `${windowId}:${windowIndex}`,
        sourceId: windowId,
        sourceIndex: windowIndex,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        cancelled: false,
        slotIndex: null,
      };
      attachDragListeners();
    },
    [attachDragListeners, connectionStatus, moveWindow]
  );

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
            ref={stripRef}
            aria-label="tmux windows"
            className="relative flex min-w-0 flex-1 flex-wrap items-center gap-1"
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
              // A seat whose window is named something else: show its pij id too.
              const seatLabel =
                window.seatId && window.seatId !== window.name ? window.seatId : null;
              // Search wins over the background outline while a query is active.
              const matchTone =
                query.length === 0
                  ? ''
                  : matchesQuery(window, query)
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
              const context = window.context ? contextLabel(window.context) : null;
              const heat = window.active ? 1 : recencyHeat(recencyOrder.indexOf(window.id));
              return (
                // Wrapper exists for the "new" badge: the button clips its own overflow, so a
                // badge centred on its top-right corner has to live outside it.
                <span key={`${window.id}:${window.index}`} className="relative flex shrink-0">
                  {unseen.has(window.id) ? (
                    // New since this viewer last looked; cleared by selecting it.
                    <span
                      aria-hidden="true"
                      data-window-new="true"
                      className="pointer-events-none absolute top-0 right-0 z-10 grid size-3 translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-sky-500 text-[7px] leading-none text-white ring-2 ring-background"
                    >
                      ★
                    </span>
                  ) : null}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        ref={(el) => {
                          const key = `${window.id}:${window.index}`;
                          if (el) windowButtonRefs.current.set(key, el);
                          else windowButtonRefs.current.delete(key);
                        }}
                        type="button"
                        onPointerDown={(event) =>
                          handleWindowPointerDown(event, window.id, window.index)
                        }
                        onClick={() => {
                          if (suppressNextClickRef.current) {
                            suppressNextClickRef.current = false;
                            return;
                          }
                          selectWindow?.(window.id, window.index);
                        }}
                        disabled={connectionStatus !== 'connected' || !selectWindow}
                        aria-label={`Window ${window.index}: ${window.name}${seatLabel ? ` (${seatLabel})` : ''}${agent ? `, ${agent.label}` : ''}${status ? `, ${status}` : ''}${background ? `, ${background.jobs.length} background ${background.jobs.length === 1 ? 'job' : 'jobs'}` : ''}${context ? `, ${context}` : ''}`}
                        aria-pressed={window.active}
                        data-output-active={outputActive ? 'true' : 'false'}
                        data-dragging={
                          dragVisual?.sourceKey === `${window.id}:${window.index}`
                            ? 'true'
                            : undefined
                        }
                        className={`relative flex h-7 min-w-8 shrink-0 select-none flex-col items-center overflow-hidden rounded px-1 pt-0.5 text-[11px] font-medium leading-none tabular-nums focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50 ${tone} ${matchTone} ${dragVisual?.sourceKey === `${window.id}:${window.index}` ? 'opacity-40 cursor-grabbing' : ''}`}
                      >
                        {heat > 0 ? (
                          // Recency heat: the button's overflow-hidden + rounded clips this to
                          // the button's own corners. Drawn before the agent mark so it sits under it.
                          <span
                            aria-hidden="true"
                            data-recency-heat={heat.toFixed(2)}
                            className="absolute inset-x-0 top-0 h-[2px] bg-sky-500"
                            style={{ opacity: heat }}
                          />
                        ) : null}
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
                        {showBackground && fillQuarters === 0 ? (
                          // Jobs exist but are barely working: a thin line says "something is running".
                          <span
                            aria-hidden="true"
                            data-background-quarters={0}
                            className="absolute inset-x-0 h-[3px] border-b border-white bg-emerald-500"
                            style={{ bottom: AGENT_SLICE_PX }}
                          />
                        ) : null}
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
                        <ContextFillBar
                          context={window.context}
                          className="absolute inset-y-0 right-0 w-[3px]"
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-72">
                      <div className="font-medium">{window.name}</div>
                      {seatLabel ? <div className="font-mono opacity-80">{seatLabel}</div> : null}
                      <div className="opacity-80">
                        {[agent?.label, status, context].filter(Boolean).join(' · ')}
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
                </span>
              );
            })}
            {dragVisual ? (
              <span
                aria-hidden="true"
                data-window-drop-indicator="true"
                data-drop-slot={dragVisual.slotIndex}
                className="pointer-events-none absolute z-30 w-[2px] -translate-x-1/2 rounded-full bg-black"
                style={{
                  left: `${dragVisual.indicator.left}px`,
                  top: `${dragVisual.indicator.top}px`,
                  height: `${dragVisual.indicator.height}px`,
                }}
              />
            ) : null}
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
            <button
              ref={overviewToggleRef}
              type="button"
              onClick={() => {
                setDrawerOpen(false);
                setOverviewOpen((open) => !open);
              }}
              aria-label="Windows overview"
              aria-expanded={overviewOpen}
              title="Windows overview"
              className="flex h-7 min-w-8 shrink-0 items-center justify-center rounded bg-muted px-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-expanded:bg-accent aria-expanded:text-foreground"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${overviewOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            ref={searchToggleRef}
            type="button"
            onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
            className="rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-accent aria-expanded:bg-accent aria-expanded:text-foreground"
            aria-label="Search windows"
            aria-expanded={searchOpen}
            title="Search windows by name, pij seat or text"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
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

      {searchOpen ? (
        // Centred over the terminal just below the window buttons, never covering them.
        <div
          ref={searchBoxRef}
          className="absolute left-1/2 z-40 mt-2 flex w-72 -translate-x-1/2 items-center gap-2 rounded-lg border bg-popover p-2 text-popover-foreground shadow-xl animate-in fade-in-0 slide-in-from-top-1 duration-100"
          style={{ top: `${headerHeight}px` }}
        >
          <input
            type="search"
            value={windowQuery}
            onChange={(event) => setWindowQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              // Keep the overlay's Escape (close terminal) from seeing it.
              event.stopPropagation();
              closeSearch();
            }}
            placeholder="Window, seat or text…"
            aria-label="Search windows by name, pij seat or text"
            ref={searchInputRef}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {query.length > 0 ? (
            <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
              {windows.filter((window) => matchesQuery(window, query)).length} of {windows.length}
            </span>
          ) : null}
        </div>
      ) : null}

      <TerminalWindowOverview
        open={overviewOpen}
        onClose={closeOverview}
        topOffset={headerHeight}
        windows={windows}
        onSelect={selectWindow ?? undefined}
        connected={connectionStatus === 'connected'}
        toggleRef={overviewToggleRef}
      />

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
                Window name <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <input
                id="terminal-new-window-name"
                value={newName}
                placeholder="Blank: named after its pij seat"
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
