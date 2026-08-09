/**
 * The drawer reaches the REAL sender — Plan 092, tk-0105 / dw-1051.
 *
 * This is deliberately an integration test through the real provider, the real
 * shared header and the real drawer, with only the xterm inner stubbed (jsdom
 * cannot render xterm — DYK-04). Mocking `useTerminalSingleton` here would
 * assert the thing it is supposed to prove.
 *
 * The claim under test is structural: the drawer gets its sender from the
 * singleton context, so NEITHER host surface grows a prop for it. The test
 * enforces that by rendering `<TerminalSplitPane sessionName="…" />` with its
 * only prop — if the sender had to be prop-drilled, no click could ever reach
 * the spy.
 */

import { TerminalOverlayProvider } from '@/features/064-terminal/hooks/use-terminal-overlay';
import type { SendPrompt } from '@/features/064-terminal/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Records what the singleton's inner terminal would have put on the wire. */
const sent: Array<{ text: string; submit: boolean }> = [];
const sendPromptStub: SendPrompt = (text, options) => {
  sent.push({ text, submit: options.submit });
};

vi.mock('@/features/064-terminal/components/terminal-theme-select', () => ({
  TerminalThemeSelect: () => <button type="button" aria-label="Terminal color theme" />,
}));

// Stands in for TerminalInner: registers the sender the same way the real one
// does, and reports the connection so the drawer's actions are enabled.
vi.mock('@/features/064-terminal/components/terminal-inner', () => ({
  default: function MockTerminalInner({
    onSendPromptReady,
    onConnectionChange,
  }: {
    onSendPromptReady?: (fn: SendPrompt | null) => void;
    onConnectionChange?: (status: 'connecting' | 'connected' | 'disconnected') => void;
  }) {
    useEffect(() => {
      onConnectionChange?.('connected');
      onSendPromptReady?.(sendPromptStub);
      return () => onSendPromptReady?.(null);
    }, [onSendPromptReady, onConnectionChange]);
    return <div data-testid="mock-terminal-inner">terminal</div>;
  },
}));

// next/dynamic with ssr:false is a no-op in jsdom (DYK-04) — passthrough so
// the provider's lazily-loaded inner actually mounts. Mirrors the shape in
// terminal-singleton-provider.test.tsx.
vi.mock('next/dynamic', () => ({
  default: <P extends object>(loader: () => Promise<{ default: React.ComponentType<P> }>) => {
    let cached: React.ComponentType<P> | null = null;
    const loadPromise = loader().then((mod) => {
      cached = mod.default;
    });
    return function DynamicMock(props: P) {
      const [, setTick] = useState(0);
      useEffect(() => {
        let active = true;
        loadPromise.then(() => {
          if (active) setTick((t) => t + 1);
        });
        return () => {
          active = false;
        };
      }, []);
      if (!cached) return null;
      const C = cached;
      return <C {...props} />;
    };
  },
}));

import { TerminalSingletonProvider } from '@/features/064-terminal/components/terminal-singleton-provider';
import { TerminalSplitPane } from '@/features/064-terminal/components/terminal-split-pane';
import { TERMINAL_PROMPTS } from '@/features/064-terminal/lib/terminal-prompts';

function withProviders(children: ReactNode) {
  return (
    <TerminalOverlayProvider defaultSessionName="s" defaultCwd="/tmp">
      <TerminalSingletonProvider>{children}</TerminalSingletonProvider>
    </TerminalOverlayProvider>
  );
}

/**
 * Renders the split pane host and opens the drawer once the singleton's inner
 * has mounted and registered its sender.
 */
async function openDrawerOnSplitPane() {
  // The ONLY prop. If the sender needed prop-drilling this call would not
  // compile, let alone reach the stub.
  render(withProviders(<TerminalSplitPane sessionName="s" />));

  await waitFor(() => {
    expect(screen.getByTestId('mock-terminal-inner')).toBeTruthy();
  });

  fireEvent.click(screen.getByLabelText('Prompt drawer'));
  await waitFor(() => {
    expect(screen.getByTestId('terminal-prompt-drawer')).toBeTruthy();
  });
}

beforeEach(() => {
  sent.length = 0;
});

describe('drawer → singleton context → sender (tk-0105)', () => {
  it('send.row-reaches-the-real-sender-with-no-host-props: submit carries the full text', async () => {
    /*
    Test Doc:
    - Why: ac-0004 / ac-0005 / dw-1051 — phase 1 shipped an inert stub. The
      whole point of phase 2 is that a click now actually reaches tmux, and it
      must do so without either host surface growing a prop, because that prop
      is the drift FX014's shared header exists to prevent.
    - Contract: clicking the row body calls the sender registered by the
      singleton's inner terminal, with the prompt's FULL text and submit:true.
    - Usage Notes: the row shows a truncated label; sending the label instead
      of the text would send a prompt ending in an ellipsis.
    - Quality Contribution: dw-1051. Fails if the header keeps the phase 1
      stub, or reads the sender from anywhere but the context.
    */
    await openDrawerOnSplitPane();
    const prompt = TERMINAL_PROMPTS[0];

    fireEvent.click(screen.getByTestId(`prompt-label-${prompt.id}`));

    expect(sent).toEqual([{ text: prompt.text, submit: true }]);
    expect(sent[0].text).not.toContain('…');
  });

  it('send.type-icon-reaches-the-sender-with-submit-false: intent survives the lift', async () => {
    /*
    Test Doc:
    - Why: ac-0004 — the type action must arrive at the sender as an intent,
      not as a newline. The flag has to survive the trip from the drawer
      through the header and the context to the sender.
    - Contract: the type icon calls the sender with submit:false.
    - Quality Contribution: dw-1051 — fails if the header hardcodes the flag.
    */
    await openDrawerOnSplitPane();
    const prompt = TERMINAL_PROMPTS[0];

    fireEvent.click(screen.getByTestId(`prompt-type-${prompt.id}`));

    expect(sent).toEqual([{ text: prompt.text, submit: false }]);
  });

  it('send.enter-icon-and-row-body-are-the-same-single-send: no double submit', async () => {
    /*
    Test Doc:
    - Why: tk-0008 made the row body a second control for the same action. Now
      that the action really sends, a bubbling mistake is a DOUBLE SUBMIT into
      a coding agent, not a harmless duplicate callback.
    - Contract: clicking the Enter icon produces exactly one send.
    - Quality Contribution: guards the structural claim (a button cannot nest
      in a button) now that it has real consequences.
    */
    await openDrawerOnSplitPane();
    const prompt = TERMINAL_PROMPTS[0];

    fireEvent.click(screen.getByTestId(`prompt-submit-${prompt.id}`));

    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({ text: prompt.text, submit: true });
  });
});
