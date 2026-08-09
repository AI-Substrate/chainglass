/**
 * Terminal Domain — Barrel Export
 *
 * Public contracts for the terminal business domain.
 * Domain: terminal
 * Plan 064: Terminal Integration via tmux
 */

// Types
export type {
  TerminalSession,
  TerminalMessage,
  ConnectionStatus,
  TerminalServerOptions,
  PtySpawner,
  PtyProcess,
  CommandExecutor,
  SendPrompt,
  SendPromptResult,
} from './types';

// Components (Phase 2)
export { TerminalView } from './components/terminal-view';
export type { TerminalViewProps } from './components/terminal-view';
export { ConnectionStatusBadge } from './components/connection-status-badge';
export { TerminalSkeleton } from './components/terminal-skeleton';

// Overlay (Phase 4)
export { TerminalOverlayPanel } from './components/terminal-overlay-panel';
export { TerminalOverlayProvider, useTerminalOverlay } from './hooks/use-terminal-overlay';

// Singleton viewport primitives (FX012 — Plan 084 random-enhancements-3)
export {
  TerminalSingletonProvider,
  useTerminalSingleton,
} from './components/terminal-singleton-provider';
export { TerminalViewport } from './components/terminal-viewport';
export type { TerminalViewportProps } from './components/terminal-viewport';

// Utilities
export { sanitizeSessionName } from './lib/sanitize-session-name';

// Theme System (Plan 081)
export type {
  TerminalThemeId,
  TerminalThemeEntry,
  TerminalThemeCategory,
} from './lib/terminal-theme-types';
export {
  TERMINAL_THEMES,
  resolveTerminalTheme,
  getThemesByCategory,
  DEFAULT_TERMINAL_THEME,
} from './lib/terminal-themes';
export { TerminalThemeSelect } from './components/terminal-theme-select';

// Prompt drawer (Plan 092)
export { TerminalPromptDrawer } from './components/terminal-prompt-drawer';
export type { TerminalPromptDrawerProps } from './components/terminal-prompt-drawer';
export type { TerminalPrompt } from './lib/terminal-prompts';
export {
  TERMINAL_PROMPTS,
  PROMPT_LABEL_MAX_CHARS,
  promptLabel,
  parsePromptList,
} from './lib/terminal-prompts';
