'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ModifierState {
  ctrl: boolean;
  alt: boolean;
}

export interface TerminalModifierToolbarHandle {
  resetModifiers: () => void;
}

export interface TerminalModifierToolbarProps {
  onKey: (data: string) => void;
  /** Send composed text to terminal (for voice input overlay) */
  onSendText?: (text: string) => void;
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

const modifierSize: React.CSSProperties = { minWidth: '38px', height: '28px' };
const arrowSize: React.CSSProperties = { minWidth: '30px', height: '28px' };
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
  onSendText,
  onModifierChange,
  toolbarRef,
}: TerminalModifierToolbarProps) {
  const [modifiers, setModifiers] = useState<ModifierState>({ ctrl: false, alt: false });
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const voiceInputRef = useRef<HTMLInputElement>(null);

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

  const handleVoiceSend = useCallback(() => {
    if (voiceText.trim()) {
      const text = voiceText;
      onSendText?.(text);
      // Auto-press Enter after a short delay so the command executes
      setTimeout(() => onKey('\r'), 500);
      setVoiceText('');
    }
    setVoiceOpen(false);
  }, [voiceText, onSendText, onKey]);

  const handleVoiceToggle = useCallback(() => {
    setVoiceOpen((prev) => {
      if (!prev) {
        // Focus input after render
        requestAnimationFrame(() => voiceInputRef.current?.focus());
      }
      return !prev;
    });
    setVoiceText('');
  }, []);

  return (
    <div>
      {/* Voice input bar — above modifier toolbar */}
      {voiceOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleVoiceSend();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 6px',
            borderTop: '1px solid var(--border, #27272a)',
            background: 'var(--background, #09090b)',
          }}
        >
          <input
            ref={voiceInputRef}
            type="text"
            value={voiceText}
            onChange={(e) => setVoiceText(e.target.value)}
            placeholder="Dictate or type..."
            style={{
              flex: 1,
              height: '32px',
              fontSize: '16px',
              padding: '0 8px',
              border: '1px solid var(--border, #27272a)',
              borderRadius: '6px',
              background: 'var(--muted, #27272a)',
              color: 'var(--foreground, #fafafa)',
              outline: 'none',
            }}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
          />
          <button
            type="submit"
            style={{
              ...buttonBase,
              minWidth: '44px',
              height: '32px',
              fontSize: '16px',
              background: 'var(--primary, #3b82f6)',
              color: 'var(--primary-foreground, #fff)',
            }}
          >
            ↵
          </button>
        </form>
      )}

      {/* Modifier keys toolbar */}
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
        {/* Modifier keys — preventDefault on mousedown keeps xterm focused */}
        <button
          type="button"
          style={{ ...buttonBase, ...modifierSize }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onKey('\x1b')}
        >
          Esc
        </button>
        <button
          type="button"
          style={{ ...buttonBase, ...modifierSize }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onKey('\t')}
        >
          Tab
        </button>
        <button
          type="button"
          style={{ ...buttonBase, ...modifierSize, ...(modifiers.ctrl ? activeStyle : {}) }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleCtrl}
        >
          Ctrl
        </button>
        <button
          type="button"
          style={{ ...buttonBase, ...modifierSize, ...(modifiers.alt ? activeStyle : {}) }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleAlt}
        >
          Alt
        </button>

        {/* Mic toggle — preventDefault on mousedown keeps xterm focused so keyboard stays open */}
        <button
          type="button"
          style={{ ...buttonBase, ...modifierSize, ...(voiceOpen ? activeStyle : {}) }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleVoiceToggle}
          aria-label="Voice input"
        >
          🎤
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Arrow keys */}
        {ARROW_KEYS.map((key) => (
          <button
            key={key.label}
            type="button"
            style={{ ...buttonBase, ...arrowSize }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onKey(key.seq)}
          >
            {key.label}
          </button>
        ))}
      </div>
    </div>
  );
}
