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
  /** Called to refocus the terminal after modifier capture completes */
  onRefocusTerminal?: () => void;
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

const modifierSize: React.CSSProperties = { minWidth: '34px', height: '28px' };
const arrowSize: React.CSSProperties = { minWidth: '28px', height: '28px' };
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
  onRefocusTerminal,
  toolbarRef,
}: TerminalModifierToolbarProps) {
  // Which modifier is pending capture: null = none, 'ctrl' or 'alt'
  const [pendingModifier, setPendingModifier] = useState<'ctrl' | 'alt' | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const voiceInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);

  const resetModifiers = useCallback(() => {
    setPendingModifier(null);
  }, []);

  // Expose resetModifiers to parent via ref callback
  useEffect(() => {
    toolbarRef?.({ resetModifiers });
  }, [toolbarRef, resetModifiers]);

  // When a character is captured in the hidden input, convert and send
  const handleCaptureInput = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const char = input.value;
      input.value = '';

      if (!char || char.length === 0 || !pendingModifier) return;

      if (pendingModifier === 'ctrl') {
        const code = char.toUpperCase().charCodeAt(0) & 0x1f;
        onKey(String.fromCharCode(code));
      } else if (pendingModifier === 'alt') {
        onKey(`\x1b${char}`);
      }

      setPendingModifier(null);
      // Refocus terminal so subsequent typing goes to xterm
      requestAnimationFrame(() => onRefocusTerminal?.());
    },
    [pendingModifier, onKey, onRefocusTerminal]
  );

  // If capture input loses focus while modifier is pending, cancel
  const handleCaptureBlur = useCallback(() => {
    setPendingModifier(null);
  }, []);

  const handleCtrl = useCallback(() => {
    if (pendingModifier === 'ctrl') {
      // Toggle off
      setPendingModifier(null);
      onRefocusTerminal?.();
      return;
    }
    setPendingModifier('ctrl');
    // Focus our hidden capture input so the next keypress comes to us
    requestAnimationFrame(() => captureInputRef.current?.focus());
  }, [pendingModifier, onRefocusTerminal]);

  const handleAlt = useCallback(() => {
    if (pendingModifier === 'alt') {
      setPendingModifier(null);
      onRefocusTerminal?.();
      return;
    }
    setPendingModifier('alt');
    requestAnimationFrame(() => captureInputRef.current?.focus());
  }, [pendingModifier, onRefocusTerminal]);

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

  const [toolsOpen, setToolsOpen] = useState(false);

  const handleToolAction = useCallback((action: () => void) => {
    action();
    setToolsOpen(false);
  }, []);

  return (
    <div>
      {/* Hidden capture input for Ctrl/Alt modifier key combos.
          When Ctrl or Alt is tapped, focus moves here. The next character
          typed goes into this input (not xterm), gets converted to a
          control sequence, and sent to the terminal. */}
      <input
        ref={captureInputRef}
        type="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onInput={handleCaptureInput}
        onBlur={handleCaptureBlur}
        style={{
          position: 'absolute',
          opacity: 0,
          width: '1px',
          height: '1px',
          overflow: 'hidden',
          // 16px prevents iOS auto-zoom
          fontSize: '16px',
        }}
        aria-hidden="true"
        tabIndex={-1}
      />
      {/* Voice input bar — above everything */}
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

      {/* Tools popout row — above main toolbar */}
      {toolsOpen && (
        <div
          style={{
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0 6px',
            borderTop: '1px solid var(--border, #27272a)',
            background: 'var(--background, #09090b)',
          }}
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
        >
          <button
            type="button"
            style={{ ...buttonBase, ...modifierSize }}
            onClick={() => handleToolAction(handleVoiceToggle)}
            aria-label="Voice input"
          >
            🎤
          </button>
          <button
            type="button"
            style={{ ...buttonBase, ...modifierSize }}
            onClick={() => handleToolAction(() => onKey('\x02w'))}
            aria-label="Tmux windows"
          >
            W
          </button>
        </div>
      )}

      {/* Main modifier keys toolbar */}
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
        onMouseDown={(e) => e.preventDefault()}
        onTouchStart={(e) => e.preventDefault()}
      >
        {/* Tools toggle */}
        <button
          type="button"
          style={{ ...buttonBase, ...arrowSize, ...(toolsOpen ? activeStyle : {}) }}
          onClick={() => setToolsOpen((prev) => !prev)}
          aria-label="Tools"
        >
          ⚡
        </button>

        {/* Modifier keys */}
        <button
          type="button"
          style={{ ...buttonBase, ...modifierSize }}
          onClick={() => onKey('\x1b')}
        >
          Esc
        </button>
        <button
          type="button"
          style={{ ...buttonBase, ...modifierSize }}
          onClick={() => onKey('\t')}
        >
          Tab
        </button>
        <button
          type="button"
          style={{
            ...buttonBase,
            ...modifierSize,
            ...(pendingModifier === 'ctrl' ? activeStyle : {}),
          }}
          onClick={handleCtrl}
        >
          Ctrl
        </button>
        <button
          type="button"
          style={{
            ...buttonBase,
            ...modifierSize,
            ...(pendingModifier === 'alt' ? activeStyle : {}),
          }}
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
    </div>
  );
}
