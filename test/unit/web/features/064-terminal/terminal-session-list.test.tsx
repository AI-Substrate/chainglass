import { TerminalSessionList } from '@/features/064-terminal/components/terminal-session-list';
import type { TerminalSession } from '@/features/064-terminal/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const MOCK_SESSIONS: TerminalSession[] = [
  { name: '064-tmux', attached: 1, windows: 2, created: 1700000000, isCurrentWorktree: true },
  { name: '063-login', attached: 0, windows: 1, created: 1699999000, isCurrentWorktree: false },
  { name: '065-new', attached: 2, windows: 3, created: 1700001000, isCurrentWorktree: false },
];

describe('TerminalSessionList', () => {
  it('renders all sessions with correct names', () => {
    /*
    Test Doc:
    - Why: Session list must display all available tmux sessions for selection
    - Contract: Each session renders as a button with session name text
    - Usage Notes: Pass sessions array + handlers; activeSession highlights selection
    - Quality Contribution: Catches rendering regressions in session enumeration
    - Worked Example: 3 sessions => 3 buttons with names '064-tmux', '063-login', '065-new'
    */
    render(
      <TerminalSessionList
        sessions={MOCK_SESSIONS}
        activeSession="064-tmux"
        loading={false}
        onSelect={() => {}}
        onRefresh={() => {}}
      />
    );
    expect(screen.getByText('064-tmux')).toBeTruthy();
    expect(screen.getByText('063-login')).toBeTruthy();
    expect(screen.getByText('065-new')).toBeTruthy();
  });

  it('highlights current worktree session with badge', () => {
    /*
    Test Doc:
    - Why: Current worktree must be visually distinct for quick identification
    - Contract: Session with isCurrentWorktree=true shows "current" badge
    - Usage Notes: Badge only appears for the session matching the active worktree branch
    - Quality Contribution: Guards worktree-identification UX (AC-09)
    - Worked Example: '064-tmux' with isCurrentWorktree=true => 'current' badge visible
    */
    render(
      <TerminalSessionList
        sessions={MOCK_SESSIONS}
        activeSession={null}
        loading={false}
        onSelect={() => {}}
        onRefresh={() => {}}
      />
    );
    expect(screen.getByText('current')).toBeTruthy();
  });

  it('shows status dots for attached/detached sessions', () => {
    /*
    Test Doc:
    - Why: Attached count determines session status dot color (green vs gray)
    - Contract: attached > 0 shows green dot (aria-label "attached"); 0 shows gray (aria-label "detached")
    - Usage Notes: Status dots use aria-labels for accessibility testing
    - Quality Contribution: Ensures visual status indicator correctness (AC-09)
    - Worked Example: '064-tmux' attached=1 => 'attached' dot; '063-login' attached=0 => 'detached' dot
    */
    render(
      <TerminalSessionList
        sessions={MOCK_SESSIONS}
        activeSession={null}
        loading={false}
        onSelect={() => {}}
        onRefresh={() => {}}
      />
    );
    const attachedDots = screen.getAllByLabelText('attached');
    const detachedDots = screen.getAllByLabelText('detached');
    expect(attachedDots.length).toBe(2); // 064-tmux (1) + 065-new (2)
    expect(detachedDots.length).toBe(1); // 063-login (0)
  });

  it('shows loading state when loading with no sessions', () => {
    /*
    Test Doc:
    - Why: Initial load must show loading indicator before sessions are fetched
    - Contract: loading=true + empty sessions => 'Loading sessions…' text
    - Usage Notes: Loading indicator only appears when sessions array is empty
    - Quality Contribution: Guards initial load UX path
    - Worked Example: loading=true, sessions=[] => 'Loading sessions…' visible
    */
    render(
      <TerminalSessionList
        sessions={[]}
        activeSession={null}
        loading={true}
        onSelect={() => {}}
        onRefresh={() => {}}
      />
    );
    expect(screen.getByText('Loading sessions…')).toBeTruthy();
  });

  it('shows empty state with refresh button when no sessions', () => {
    /*
    Test Doc:
    - Why: Empty state must offer recovery action when no sessions exist
    - Contract: loading=false + empty sessions => 'No tmux sessions found' + Refresh button
    - Usage Notes: Refresh button triggers onRefresh callback for manual retry (DYK-03)
    - Quality Contribution: Guards empty-state recovery UX
    - Worked Example: loading=false, sessions=[] => 'No tmux sessions found' + 'Refresh' button
    */
    render(
      <TerminalSessionList
        sessions={[]}
        activeSession={null}
        loading={false}
        onSelect={() => {}}
        onRefresh={() => {}}
      />
    );
    expect(screen.getByText('No tmux sessions found')).toBeTruthy();
    expect(screen.getByText('Refresh')).toBeTruthy();
  });
});
