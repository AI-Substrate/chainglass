/**
 * AgentListView Component Tests
 *
 * Tests for the list view showing all agent sessions.
 * Implements Full TDD for Phase 2: Core Chat.
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat)
 */

import { AgentListView } from '@/components/agents/agent-list-view';
import type { AgentSession } from '@/lib/schemas/agent-session.schema';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

// ============ Test Helpers ============

function createTestSession(overrides: Partial<AgentSession> = {}): AgentSession {
  const id = overrides.id ?? `session-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    name: `Session ${id.slice(0, 8)}`,
    agentType: 'claude-code',
    status: 'idle',
    messages: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    ...overrides,
  };
}

// ============ Callback Tracker ============

class FakeSelectHandler {
  calls: string[] = [];

  onSelect = (sessionId: string) => {
    this.calls.push(sessionId);
  };

  assertCalledWith(sessionId: string) {
    expect(this.calls).toContain(sessionId);
  }

  assertCalledOnce() {
    expect(this.calls).toHaveLength(1);
  }
}

// ============ T015: AgentListView Tests ============

describe('AgentListView', () => {
  let handler: FakeSelectHandler;

  beforeEach(() => {
    handler = new FakeSelectHandler();
  });

  describe('list rendering', () => {
    it('should render list of sessions', () => {
      /*
      Test Doc:
      - Why: Users need to see all their sessions
      - Contract: Each session renders as a list item
      - Usage Notes: Shows session name and status
      - Quality Contribution: Basic list rendering
      - Worked Example: 3 sessions → 3 list items
      */
      const sessions = [
        createTestSession({ id: '1', name: 'Session One' }),
        createTestSession({ id: '2', name: 'Session Two' }),
        createTestSession({ id: '3', name: 'Session Three' }),
      ];

      render(<AgentListView sessions={sessions} activeSessionId="1" onSelect={handler.onSelect} />);

      expect(screen.getByText('Session One')).toBeInTheDocument();
      expect(screen.getByText('Session Two')).toBeInTheDocument();
      expect(screen.getByText('Session Three')).toBeInTheDocument();
    });

    it('should show empty state when no sessions', () => {
      /*
      Test Doc:
      - Why: New users have no sessions
      - Contract: Empty state message shown when sessions=[]
      - Usage Notes: Encourages user to create first session
      - Quality Contribution: UX for new users
      - Worked Example: sessions=[] → "No sessions" message
      */
      render(<AgentListView sessions={[]} activeSessionId={null} onSelect={handler.onSelect} />);

      expect(screen.getByText(/no sessions/i)).toBeInTheDocument();
    });

    it('should display session status', () => {
      /*
      Test Doc:
      - Why: Users need to see session state
      - Contract: Status indicator shown for each session
      - Usage Notes: Uses AgentStatusIndicator component in compact mode (icon only)
      - Quality Contribution: Status visibility
      - Worked Example: running session → shows spinning loader icon
      */
      const sessions = [createTestSession({ id: '1', name: 'Test Session', status: 'running' })];

      render(<AgentListView sessions={sessions} activeSessionId="1" onSelect={handler.onSelect} />);

      // Should show status icon (compact mode uses span with title)
      expect(screen.getByTitle('Running')).toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('should call onSelect when session is clicked', async () => {
      /*
      Test Doc:
      - Why: Users switch between sessions by clicking
      - Contract: Click on session calls onSelect(sessionId)
      - Usage Notes: Entire row is clickable
      - Quality Contribution: Session switching
      - Worked Example: click "Session Two" → onSelect("2")
      */
      const user = userEvent.setup();
      const sessions = [
        createTestSession({ id: '1', name: 'Session One' }),
        createTestSession({ id: '2', name: 'Session Two' }),
      ];

      render(<AgentListView sessions={sessions} activeSessionId="1" onSelect={handler.onSelect} />);

      await user.click(screen.getByText('Session Two'));

      handler.assertCalledOnce();
      handler.assertCalledWith('2');
    });

    it('should highlight active session', () => {
      /*
      Test Doc:
      - Why: Users need to know which session is selected
      - Contract: Active session has distinct styling
      - Usage Notes: Uses violet/primary highlight color
      - Quality Contribution: Visual selection feedback
      - Worked Example: activeSessionId="1" → first item highlighted
      */
      const sessions = [
        createTestSession({ id: '1', name: 'Session One' }),
        createTestSession({ id: '2', name: 'Session Two' }),
      ];

      render(<AgentListView sessions={sessions} activeSessionId="1" onSelect={handler.onSelect} />);

      // First session should have active styling (aria-selected="true" on li with role=option)
      const activeItem = screen.getByText('Session One').closest('li');
      expect(activeItem).toBeInTheDocument();
      expect(activeItem?.getAttribute('aria-selected')).toBe('true');
    });
  });

  describe('accessibility', () => {
    it('should have accessible list role', () => {
      /*
      Test Doc:
      - Why: Screen readers need list structure
      - Contract: List has list/listbox role
      - Usage Notes: Items have listitem/option role
      - Quality Contribution: Screen reader navigation
      - Worked Example: listbox role present
      */
      const sessions = [createTestSession({ id: '1', name: 'Session One' })];

      render(<AgentListView sessions={sessions} activeSessionId="1" onSelect={handler.onSelect} />);

      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('should support keyboard selection', async () => {
      /*
      Test Doc:
      - Why: Keyboard navigation is required
      - Contract: Enter on focused item triggers selection
      - Usage Notes: Tab moves focus, Enter selects
      - Quality Contribution: Keyboard accessibility
      - Worked Example: focus + Enter → onSelect called
      */
      const user = userEvent.setup();
      const sessions = [
        createTestSession({ id: '1', name: 'Session One' }),
        createTestSession({ id: '2', name: 'Session Two' }),
      ];

      render(
        <AgentListView sessions={sessions} activeSessionId={null} onSelect={handler.onSelect} />
      );

      // Tab to first item and press Enter
      await user.tab();
      await user.keyboard('{Enter}');

      handler.assertCalledOnce();
    });
  });
});
