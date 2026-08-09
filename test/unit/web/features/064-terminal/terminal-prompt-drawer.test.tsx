/**
 * Plan 092 phase 1 — prompt drawer surface (tk-0007).
 *
 * Covers the four things phase 1 can actually prove, and deliberately not the
 * send path: ph-0001 is send-free, the row actions call an injected callback
 * and nothing here touches tmux, the pty or the websocket.
 *
 * The Escape suite is the load-bearing one. `terminal-overlay-panel.tsx` binds
 * its close-on-Escape at the DOCUMENT in the BUBBLE phase, and the drawer's
 * toggle is a SIBLING of the drawer inside `TerminalPaneHeader` — so a test
 * that dispatches Escape *on a drawer node* passes while the feature is
 * broken, because that is the one focus position where a React
 * stopPropagation would have worked. These tests therefore fire Escape from
 * the TERMINAL and from the TOGGLE, which is where the user's focus actually
 * is, and assert a stand-in for the overlay's bubble listener never runs.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/064-terminal/components/terminal-theme-select', () => ({
  TerminalThemeSelect: () => <button type="button" aria-label="Terminal color theme" />,
}));

vi.mock('@/features/064-terminal/components/terminal-viewport', () => ({
  // Stands in for the singleton's xterm host. Focusable so Escape can be
  // fired from "the terminal" the way it reaches the document in the app.
  TerminalViewport: ({ id }: { id: string }) => (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: stand-in for the focusable xterm textarea
    <div data-testid="viewport" data-viewport-id={id} tabIndex={0} />
  ),
}));

const connectionStatus = { current: 'connected' as 'connected' | 'disconnected' };
vi.mock('@/features/064-terminal/components/terminal-singleton-provider', () => ({
  useTerminalSingleton: () => ({ connectionStatus: connectionStatus.current }),
}));

import { TerminalPaneHeader } from '@/features/064-terminal/components/terminal-pane-header';
import { TerminalPromptDrawer } from '@/features/064-terminal/components/terminal-prompt-drawer';
import { TerminalSplitPane } from '@/features/064-terminal/components/terminal-split-pane';
import {
  PROMPT_LABEL_MAX_CHARS,
  TERMINAL_PROMPTS,
  parsePromptList,
  promptLabel,
} from '@/features/064-terminal/lib/terminal-prompts';

beforeEach(() => {
  connectionStatus.current = 'connected';
});

describe('prompt source module — tk-0002', () => {
  it('prompts.non-empty: ships at least one prompt with full untruncated text', () => {
    expect(TERMINAL_PROMPTS.length).toBeGreaterThan(0);
    for (const prompt of TERMINAL_PROMPTS) {
      expect(prompt.text.length).toBeGreaterThan(0);
      expect(prompt.text).not.toContain('…');
    }
  });

  it('prompts.ids-unique: every prompt has a distinct id for keys and selectors', () => {
    const ids = TERMINAL_PROMPTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('promptLabel.truncates-with-ellipsis: long text is cut and ellipsised', () => {
    const long = 'x'.repeat(PROMPT_LABEL_MAX_CHARS + 20);
    const label = promptLabel(long);

    expect(label.endsWith('…')).toBe(true);
    expect(label.length).toBeLessThanOrEqual(PROMPT_LABEL_MAX_CHARS + 1);
  });

  it('promptLabel.leaves-short-text-alone: no ellipsis when it all fits', () => {
    expect(promptLabel('short prompt')).toBe('short prompt');
  });

  it('promptLabel.collapses-newlines: a multi-line prompt still reads as one row', () => {
    expect(promptLabel('line one\nline two')).toBe('line one line two');
  });

  it('parsePromptList.extracts-backticked-entries: prose and comments are ignored', () => {
    // Inline fixture, NOT the real list file: `scratch/*` is gitignored
    // (.gitignore:152) so a file-reading parity test would be red on a bare CI
    // checkout. That test is deferred until oq-0003 rules where the file lives.
    const markdown = [
      '# Prompt drawer — list content',
      '',
      'Some prose that must not be parsed as a prompt.',
      '',
      '1. `first prompt text`',
      '2. `second prompt text`',
      '',
      '<!-- more to come -->',
    ].join('\n');

    expect(parsePromptList(markdown)).toEqual(['first prompt text', 'second prompt text']);
  });

  it('parsePromptList.fails-loudly-when-empty: never silently agrees with nothing', () => {
    expect(() => parsePromptList('# heading only\n\nno entries here')).toThrow(
      /no prompt entries found/
    );
  });
});

/**
 * Parity between the shipped list and Jordan's authoring file — tk-0002,
 * dw-0201 / dw-0202 / dw-0203.
 *
 * The markdown file is the authority for the drawer's contents; `TERMINAL_PROMPTS`
 * is its typed mirror. Nothing stops the two drifting except this suite, so it
 * reads the real file off disk rather than a fixture.
 *
 * It must be HONEST ON A CLEAN CHECKOUT, which is three separate obligations:
 *   - it resolves from the repo root (`import.meta.dirname` walked up), not from
 *     `process.cwd()`, so it does not quietly pass or fail on where vitest was invoked;
 *   - it FAILS rather than skips when the file is missing — a check that stops
 *     checking when its input disappears is worse than no check at all, and
 *     "missing file" is exactly the failure this guards (the list used to live in
 *     gitignored `scratch/`);
 *   - it asserts the file is GIT-TRACKED, not merely present, because a present-
 *     but-ignored file passes on the author's machine and vanishes in CI.
 */
describe('prompt list parity with the authoring file — tk-0002', () => {
  const REPO_ROOT = join(import.meta.dirname, '../../../../..');
  const PROMPT_LIST_RELATIVE = 'apps/web/src/features/064-terminal/lib/prompt-drawer-list.md';
  const PROMPT_LIST_PATH = join(REPO_ROOT, PROMPT_LIST_RELATIVE);

  it('parity.list-file-exists: fails loudly when the authoring file is absent, never skips', () => {
    expect(
      existsSync(PROMPT_LIST_PATH),
      `The prompt list file is missing at ${PROMPT_LIST_RELATIVE}. TERMINAL_PROMPTS mirrors that file, so without it nothing holds the shipped list to Jordan's. If the file moved, update PROMPT_LIST_RELATIVE here — do not delete or skip this test.`
    ).toBe(true);
  });

  it('parity.list-file-is-git-tracked: present on a bare checkout, not just on one machine', () => {
    // `--error-unmatch` exits non-zero for an untracked or ignored path, which is
    // the precise distinction that matters: a file inside a gitignored directory
    // still passes existsSync locally and is simply absent in CI.
    expect(() =>
      execFileSync('git', ['ls-files', '--error-unmatch', PROMPT_LIST_RELATIVE], {
        cwd: REPO_ROOT,
        stdio: 'pipe',
      })
    ).not.toThrow();
  });

  it('parity.shipped-list-matches-file: the shipped prompts are the file, in order', () => {
    const markdown = readFileSync(PROMPT_LIST_PATH, 'utf8');
    // parsePromptList throws when it finds nothing, so an emptied or reformatted
    // file surfaces here as a failure rather than as two empty lists agreeing.
    const fromFile = parsePromptList(markdown);

    expect(
      TERMINAL_PROMPTS.map((prompt) => prompt.text),
      `The shipped prompt list has drifted from ${PROMPT_LIST_RELATIVE}. The file is the authority — update TERMINAL_PROMPTS in terminal-prompts.ts to match it.`
    ).toEqual(fromFile);
  });
});

describe('TerminalPromptDrawer — tk-0003', () => {
  const prompts = [
    { id: 'p-long', text: `${'a'.repeat(PROMPT_LABEL_MAX_CHARS + 30)} tail` },
    { id: 'p-short', text: 'summarise that' },
  ];

  it('drawer.hidden-when-closed: renders nothing until opened', () => {
    render(
      <TerminalPromptDrawer
        open={false}
        onClose={vi.fn()}
        onSend={vi.fn()}
        connected
        prompts={prompts}
      />
    );

    expect(screen.queryByTestId('terminal-prompt-drawer')).toBeNull();
  });

  it('drawer.truncates-row-and-titles-full-text: ellipsis on the row, full text on title', () => {
    render(
      <TerminalPromptDrawer open onClose={vi.fn()} onSend={vi.fn()} connected prompts={prompts} />
    );

    const label = screen.getByTestId('prompt-label-p-long');
    expect(label.textContent?.endsWith('…')).toBe(true);
    expect(label.textContent).not.toBe(prompts[0].text);
    // The full text is always reachable even though the row is truncated.
    expect(label.getAttribute('title')).toBe(prompts[0].text);
  });

  it('drawer.type-action-does-not-submit: onSend carries submit false and the drawer stays open', () => {
    const onSend = vi.fn();
    const onClose = vi.fn();
    render(
      <TerminalPromptDrawer open onClose={onClose} onSend={onSend} connected prompts={prompts} />
    );

    fireEvent.click(screen.getByTestId('prompt-type-p-short'));

    // The FULL text is delivered, not the truncated label.
    expect(onSend).toHaveBeenCalledWith('summarise that', { submit: false });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('drawer.submit-action-flags-submit: submit is a flag, never a newline in the text', () => {
    const onSend = vi.fn();
    render(
      <TerminalPromptDrawer open onClose={vi.fn()} onSend={onSend} connected prompts={prompts} />
    );

    fireEvent.click(screen.getByTestId('prompt-submit-p-short'));

    expect(onSend).toHaveBeenCalledWith('summarise that', { submit: true });
    // Workshop 001 §3: a real newline in an agent TUI IS the submit, so the
    // intent must never be smuggled into the payload as a trailing newline.
    const [sentText] = onSend.mock.calls[0];
    expect(sentText).not.toMatch(/\n$/);
  });

  it('drawer.actions-disabled-when-not-connected: a dead socket makes send a silent no-op', () => {
    const onSend = vi.fn();
    render(
      <TerminalPromptDrawer
        open
        onClose={vi.fn()}
        onSend={onSend}
        connected={false}
        prompts={prompts}
      />
    );

    const typeButton = screen.getByTestId('prompt-type-p-short') as HTMLButtonElement;
    const submitButton = screen.getByTestId('prompt-submit-p-short') as HTMLButtonElement;

    expect(typeButton.disabled).toBe(true);
    expect(submitButton.disabled).toBe(true);

    fireEvent.click(typeButton);
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('prompt row body submits — tk-0008', () => {
  const prompts = [
    { id: 'p-long', text: `${'a'.repeat(PROMPT_LABEL_MAX_CHARS + 30)} tail` },
    { id: 'p-short', text: 'summarise that' },
  ];

  it('row.body-click-submits: tapping the line itself sends with submit true', () => {
    const onSend = vi.fn();
    const onClose = vi.fn();
    render(
      <TerminalPromptDrawer open onClose={onClose} onSend={onSend} connected prompts={prompts} />
    );

    fireEvent.click(screen.getByTestId('prompt-label-p-short'));

    // The FULL text, not the truncated label, and submit as a flag.
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('summarise that', { submit: true });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('row.type-icon-does-not-reach-the-row-body: type-only stays type-only', () => {
    const onSend = vi.fn();
    const onClose = vi.fn();
    render(
      <TerminalPromptDrawer open onClose={onClose} onSend={onSend} connected prompts={prompts} />
    );

    const rowBody = screen.getByTestId('prompt-label-p-short');
    const typeButton = screen.getByTestId('prompt-type-p-short');

    // Structural guarantee, not a stopPropagation one: the row body is a
    // SIBLING of the icons, so a click on an icon has no path through it and
    // cannot ever double-fire. If a refactor nests them this fails first.
    expect(rowBody.contains(typeButton)).toBe(false);

    fireEvent.click(typeButton);

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('summarise that', { submit: false });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('row.keyboard-parity: the row body is focusable and Enter and Space both submit', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(
      <TerminalPromptDrawer open onClose={vi.fn()} onSend={onSend} connected prompts={prompts} />
    );

    const rowBody = screen.getByTestId('prompt-label-p-short');
    rowBody.focus();
    expect(document.activeElement).toBe(rowBody);

    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    // Both activations, in order — a div with onClick would answer neither.
    expect(onSend.mock.calls).toEqual([
      ['summarise that', { submit: true }],
      ['summarise that', { submit: true }],
    ]);
  });
});

describe('TerminalPaneHeader prompt toggle — tk-0004', () => {
  it('header.toggle-on-split-pane: the inline split pane gains the toggle in one edit', () => {
    render(<TerminalSplitPane sessionName="my-session" />);
    expect(screen.getByLabelText('Prompt drawer')).toBeTruthy();
  });

  it('header.toggle-on-overlay-shape: the same shared header renders it with a close handler', () => {
    // The overlay passes `onClose`; that is the only shape difference between
    // the two hosts, so exercising the header both ways covers both surfaces
    // without mounting the overlay's measurement/anchor machinery.
    render(
      <TerminalPaneHeader sessionName="my-session" connectionStatus="connected" onClose={vi.fn()} />
    );

    expect(screen.getByLabelText('Prompt drawer')).toBeTruthy();
    expect(screen.getByLabelText('Close terminal overlay')).toBeTruthy();
  });

  it('header.toggle-opens-and-closes-drawer: aria-expanded tracks the drawer', () => {
    render(<TerminalSplitPane sessionName="my-session" />);
    const toggle = screen.getByLabelText('Prompt drawer');

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('terminal-prompt-drawer')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('terminal-prompt-drawer')).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('terminal-prompt-drawer')).toBeNull();
  });

  it('header.drawer-anchors-inside-the-pane: the split root is a positioning context', () => {
    // Without `relative` on the split-pane root the absolutely-positioned
    // drawer escapes the pane and anchors to the viewport (tk-0004).
    const { container } = render(<TerminalSplitPane sessionName="my-session" />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.className).toContain('relative');

    fireEvent.click(screen.getByLabelText('Prompt drawer'));
    const drawer = screen.getByTestId('terminal-prompt-drawer');

    expect(drawer.className).toContain('absolute');
    // The nearest positioned ancestor must be the pane root, not the body.
    expect(root.contains(drawer)).toBe(true);
  });

  it('header.drawer-does-not-remount-the-singleton: same viewport node, no reconnect', () => {
    render(<TerminalSplitPane sessionName="my-session" />);
    const before = screen.getByTestId('viewport');

    fireEvent.click(screen.getByLabelText('Prompt drawer'));

    // Identity, not equality: a remount would produce a different DOM node and
    // a fresh `TerminalInner`, which is what drops the WS and the scrollback.
    expect(screen.getByTestId('viewport')).toBe(before);
    expect(screen.getByTestId('viewport').getAttribute('data-viewport-id')).toBe('inline-3rd');
  });

  it('header.actions-disabled-when-socket-down: connection status reaches the rows', () => {
    connectionStatus.current = 'disconnected';
    render(<TerminalSplitPane sessionName="my-session" />);

    fireEvent.click(screen.getByLabelText('Prompt drawer'));
    const firstPrompt = TERMINAL_PROMPTS[0];
    const typeButton = screen.getByTestId(`prompt-type-${firstPrompt.id}`) as HTMLButtonElement;

    expect(typeButton.disabled).toBe(true);
  });
});

describe('Escape precedence — tk-0005', () => {
  // Stand-in for `terminal-overlay-panel.tsx:71-88`: a DOCUMENT-level keydown
  // in the BUBBLE phase that closes the whole terminal. If the drawer's
  // capture-phase listener is missing or is only a React stopPropagation, this
  // spy fires and the terminal dies with the drawer.
  let closeTerminal: ReturnType<typeof vi.fn>;
  let bubbleListener: (e: KeyboardEvent) => void;

  beforeEach(() => {
    closeTerminal = vi.fn();
    bubbleListener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTerminal();
    };
    document.addEventListener('keydown', bubbleListener);
  });

  afterEach(() => {
    document.removeEventListener('keydown', bubbleListener);
  });

  it('escape.from-terminal-closes-drawer-only: focus on the TERMINAL, not the drawer', () => {
    render(<TerminalSplitPane sessionName="my-session" />);
    fireEvent.click(screen.getByLabelText('Prompt drawer'));
    expect(screen.getByTestId('terminal-prompt-drawer')).toBeTruthy();

    const terminal = screen.getByTestId('viewport');
    terminal.focus();
    fireEvent.keyDown(terminal, { key: 'Escape' });

    expect(screen.queryByTestId('terminal-prompt-drawer')).toBeNull();
    expect(closeTerminal).not.toHaveBeenCalled();
  });

  it('escape.from-toggle-closes-drawer-only: focus on the header TOGGLE, a SIBLING of the drawer', () => {
    render(<TerminalSplitPane sessionName="my-session" />);
    const toggle = screen.getByLabelText('Prompt drawer');
    fireEvent.click(toggle);
    expect(screen.getByTestId('terminal-prompt-drawer')).toBeTruthy();

    toggle.focus();
    fireEvent.keyDown(toggle, { key: 'Escape' });

    expect(screen.queryByTestId('terminal-prompt-drawer')).toBeNull();
    expect(closeTerminal).not.toHaveBeenCalled();
  });

  it('escape.with-drawer-closed-still-closes-terminal: the overlay binding is untouched', () => {
    render(<TerminalSplitPane sessionName="my-session" />);

    const terminal = screen.getByTestId('viewport');
    fireEvent.keyDown(terminal, { key: 'Escape' });

    expect(closeTerminal).toHaveBeenCalledTimes(1);
  });

  it('escape.unbinds-on-close: a second Escape after closing reaches the terminal again', () => {
    render(<TerminalSplitPane sessionName="my-session" />);
    const terminal = screen.getByTestId('viewport');

    fireEvent.click(screen.getByLabelText('Prompt drawer'));
    fireEvent.keyDown(terminal, { key: 'Escape' });
    expect(closeTerminal).not.toHaveBeenCalled();

    // Drawer is gone; the terminal owns Escape again.
    fireEvent.keyDown(terminal, { key: 'Escape' });
    expect(closeTerminal).toHaveBeenCalledTimes(1);
  });

  it('escape.other-keys-pass-through: only Escape is intercepted while open', () => {
    const otherKey = vi.fn();
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'a') otherKey();
    };
    document.addEventListener('keydown', listener);

    render(<TerminalSplitPane sessionName="my-session" />);
    fireEvent.click(screen.getByLabelText('Prompt drawer'));
    fireEvent.keyDown(screen.getByTestId('viewport'), { key: 'a' });

    expect(otherKey).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('terminal-prompt-drawer')).toBeTruthy();

    document.removeEventListener('keydown', listener);
  });
});
