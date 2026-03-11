'use client';

/**
 * Notes Overlay — Context + Hook
 *
 * Provides overlay state management for the notes panel and modal.
 * Dispatches overlay:close-all before opening (mutual exclusion with
 * terminal, activity-log, and agent overlays). Uses isOpeningRef guard
 * to prevent self-close when dispatching overlay:close-all (PL-08).
 *
 * Also manages NoteModal state: target file/line for add/edit flows.
 *
 * Plan 071: PR View & File Notes — Phase 2, T002
 */

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface NoteModalTarget {
  /** File path or other target identifier */
  target: string;
  /** Optional line number (file notes only) */
  line?: number;
  /** If editing, the note ID */
  editNoteId?: string;
  /** If editing, pre-fill content */
  editContent?: string;
  /** If editing, pre-fill addressee */
  editTo?: 'human' | 'agent';
  /** If replying, the parent note ID */
  threadId?: string;
}

interface NotesOverlayState {
  isOpen: boolean;
  worktreePath: string | null;
}

interface NotesOverlayContextValue extends NotesOverlayState {
  openNotes: (worktreePath: string) => void;
  closeNotes: () => void;
  toggleNotes: (worktreePath?: string) => void;
  /** Modal state */
  modalTarget: NoteModalTarget | null;
  isModalOpen: boolean;
  openModal: (target: NoteModalTarget) => void;
  closeModal: () => void;
}

const NotesOverlayContext = createContext<NotesOverlayContextValue | null>(null);

interface NotesOverlayProviderProps {
  children: ReactNode;
  defaultWorktreePath?: string;
}

export function NotesOverlayProvider({ children, defaultWorktreePath }: NotesOverlayProviderProps) {
  const [state, setState] = useState<NotesOverlayState>({
    isOpen: false,
    worktreePath: defaultWorktreePath ?? null,
  });

  // Modal state
  const [modalTarget, setModalTarget] = useState<NoteModalTarget | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // PL-08: Guard to prevent self-close when dispatching overlay:close-all
  const isOpeningRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const closeNotes = useCallback(() => {
    setState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
  }, []);

  const openNotes = useCallback((worktreePath: string) => {
    isOpeningRef.current = true;
    window.dispatchEvent(new CustomEvent('overlay:close-all'));
    isOpeningRef.current = false;
    setState({ isOpen: true, worktreePath });
  }, []);

  const toggleNotes = useCallback((worktreePath?: string) => {
    const prev = stateRef.current;
    if (prev.isOpen) {
      setState({ ...prev, isOpen: false });
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const urlWorktree = params.get('worktree');
    const resolved = worktreePath ?? urlWorktree ?? prev.worktreePath;

    if (!resolved) {
      console.warn('[notes-overlay] Cannot open: no worktree path resolved');
      return;
    }

    isOpeningRef.current = true;
    window.dispatchEvent(new CustomEvent('overlay:close-all'));
    isOpeningRef.current = false;

    setState({ isOpen: true, worktreePath: resolved });
  }, []);

  const openModal = useCallback((target: NoteModalTarget) => {
    setModalTarget(target);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setModalTarget(null);
  }, []);

  // Listen for notes:toggle events (from sidebar / SDK)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      toggleNotes(detail?.worktreePath);
    };
    window.addEventListener('notes:toggle', handler);
    return () => window.removeEventListener('notes:toggle', handler);
  }, [toggleNotes]);

  // Listen for overlay:close-all (mutual exclusion with terminal/activity-log/agent)
  useEffect(() => {
    const handler = () => {
      if (isOpeningRef.current) return; // PL-08: skip self-close
      closeNotes();
    };
    window.addEventListener('overlay:close-all', handler);
    return () => window.removeEventListener('overlay:close-all', handler);
  }, [closeNotes]);

  return (
    <NotesOverlayContext.Provider
      value={{
        ...state,
        openNotes,
        closeNotes,
        toggleNotes,
        modalTarget,
        isModalOpen,
        openModal,
        closeModal,
      }}
    >
      {children}
    </NotesOverlayContext.Provider>
  );
}

export function useNotesOverlay(): NotesOverlayContextValue {
  const context = useContext(NotesOverlayContext);
  if (!context) {
    throw new Error('useNotesOverlay must be used within a NotesOverlayProvider');
  }
  return context;
}
