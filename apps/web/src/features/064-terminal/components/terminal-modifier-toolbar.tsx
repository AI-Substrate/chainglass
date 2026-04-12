'use client';

import { useCallback, useEffect, useState } from 'react';

export interface ModifierState {
  ctrl: boolean;
  alt: boolean;
}

export interface TerminalModifierToolbarHandle {
  resetModifiers: () => void;
}

export interface TerminalModifierToolbarProps {
  onKey: (data: string) => void;
  onModifierChange?: (state: ModifierState) => void;
  toolbarRef?: (handle: TerminalModifierToolbarHandle) => void;
}

const ARROW_KEYS = [
  { label: '←', seq: '\x1b[D' },
  { label: '↑', seq: '\x1b[A' },
  { label: '↓', seq: '\x1b[B' },
  { label: '→', seq: '\x1b[C' },
];

const buttonBase: React.CSSProperties = {
  border: 'none',
  background: 'var(--muted, #27272a)',
  color: 'var(--foreground, #fafafa)',
  borderRadius: '4px',
  fontSize: '12px',
  fontWeight: 500,
  fontFamily: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  touchAction: 'manipulation',
};

const modifierSize: React.CSSProperties = { minWidth: '44px', height: '28px' };
const arrowSize: React.CSSProperties = { minWidth: '36px', height: '28px' };
const activeStyle: React.CSSProperties = {
  background: 'var(--primary, #3b82f6)',
  color: 'var(--primary-foreground, #fff)',
};

/**
 * TerminalModifierToolbar — keyboard-docked toolbar for mobile terminal.
 *
 * Provides Esc, Tab, Ctrl (toggle), Alt (toggle), and arrow keys.
 * Ctrl/Alt are toggle keys that activate on tap and must be reset
 * externally after the modified keypress is sent.
 *
 * Plan 078: Mobile Experience — Phase 2
 */
export function TerminalModifierToolbar({
  onKey,
  onModifierChange,
  toolbarRef,
}: TerminalModifierToolbarProps) {
  const [modifiers, setModifiers] = useState<ModifierState>({ ctrl: false, alt: false });

  const updateModifiers = useCallback(
    (next: ModifierState) => {
      setModifiers(next);
      onModifierChange?.(next);
    },
    [onModifierChange]
  );

  const resetModifiers = useCallback(() => {
    updateModifiers({ ctrl: false, alt: false });
  }, [updateModifiers]);

  // Expose resetModifiers to parent via ref callback
  useEffect(() => {
    toolbarRef?.({ resetModifiers });
  }, [toolbarRef, resetModifiers]);

  const handleCtrl = useCallback(() => {
    const next = { ...modifiers, ctrl: !modifiers.ctrl };
    updateModifiers(next);
  }, [modifiers, updateModifiers]);

  const handleAlt = useCallback(() => {
    const next = { ...modifiers, alt: !modifiers.alt };
    updateModifiers(next);
  }, [modifiers, updateModifiers]);

  return (
    <div
      style={{
        height: '36px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '0 6px',
        borderTop: '1px solid var(--border, #27272a)',
        background: 'var(--background, #09090b)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Modifier keys */}
      <button
        type="button"
        style={{ ...buttonBase, ...modifierSize }}
        onClick={() => onKey('\x1b')}
      >
        Esc
      </button>
      <button type="button" style={{ ...buttonBase, ...modifierSize }} onClick={() => onKey('\t')}>
        Tab
      </button>
      <button
        type="button"
        style={{ ...buttonBase, ...modifierSize, ...(modifiers.ctrl ? activeStyle : {}) }}
        onClick={handleCtrl}
      >
        Ctrl
      </button>
      <button
        type="button"
        style={{ ...buttonBase, ...modifierSize, ...(modifiers.alt ? activeStyle : {}) }}
        onClick={handleAlt}
      >
        Alt
      </button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Arrow keys */}
      {ARROW_KEYS.map((key) => (
        <button
          key={key.label}
          type="button"
          style={{ ...buttonBase, ...arrowSize }}
          onClick={() => onKey(key.seq)}
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}
