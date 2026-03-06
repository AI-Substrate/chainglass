/**
 * Activity Log Overlay — UI Tests
 *
 * Renders real components with fixtures. No mocks.
 *
 * Plan 065: Worktree Activity Log — Phase 3
 */

import { ActivityLogEntryList } from '@/features/065-activity-log/components/activity-log-entry-list';
import type { ActivityLogEntry } from '@/features/065-activity-log/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const now = Date.now();

const FIXTURE_ENTRIES: ActivityLogEntry[] = [
  {
    id: 'tmux:0.0',
    source: 'tmux',
    label: 'Implementing Phase 3',
    timestamp: new Date(now - 5 * 60_000).toISOString(),
    meta: { pane: '0.0', windowName: 'main' },
  },
  {
    id: 'tmux:1.0',
    source: 'tmux',
    label: 'Running tests',
    timestamp: new Date(now - 10 * 60_000).toISOString(),
    meta: { pane: '1.0', windowName: 'test' },
  },
  {
    id: 'agent:agent-1',
    source: 'agent',
    label: 'Code review in progress',
    timestamp: new Date(now - 15 * 60_000).toISOString(),
  },
];

const FIXTURE_WITH_GAP: ActivityLogEntry[] = [
  {
    id: 'tmux:0.0',
    source: 'tmux',
    label: 'Morning session',
    timestamp: new Date(now - 5 * 60_000).toISOString(),
  },
  {
    id: 'tmux:0.0',
    source: 'tmux',
    label: 'Evening session',
    timestamp: new Date(now - 120 * 60_000).toISOString(),
  },
];

describe('ActivityLogEntryList', () => {
  describe('rendering entries', () => {
    it('renders all entries from fixture', () => {
      /*
      Test Doc:
      - Why: Core rendering — entries must appear in the DOM.
      - Contract: ActivityLogEntryList renders one row per entry with label text.
      - Usage Notes: Entries arrive newest-first from reader.
      - Quality Contribution: Catches rendering regressions.
      - Worked Example: 3 fixture entries → 3 labels visible.
      */
      render(<ActivityLogEntryList entries={FIXTURE_ENTRIES} />);
      expect(screen.getByText('Implementing Phase 3')).toBeInTheDocument();
      expect(screen.getByText('Running tests')).toBeInTheDocument();
      expect(screen.getByText('Code review in progress')).toBeInTheDocument();
    });

    it('renders source icons for tmux and agent', () => {
      /*
      Test Doc:
      - Why: Source icons distinguish entry origins visually.
      - Contract: tmux → 🖥, agent → 🤖.
      - Usage Notes: Icons are rendered as title attributes on span.
      - Quality Contribution: Catches icon mapping regressions.
      - Worked Example: tmux entries show 🖥, agent entry shows 🤖.
      */
      render(<ActivityLogEntryList entries={FIXTURE_ENTRIES} />);
      const tmuxIcons = screen.getAllByTitle('tmux');
      expect(tmuxIcons).toHaveLength(2);
      expect(screen.getByTitle('agent')).toBeInTheDocument();
    });

    it('renders window name and index for tmux entries', () => {
      /*
      Test Doc:
      - Why: Window context helps identify which pane generated the entry.
      - Contract: Tmux entries with meta.windowName show "index:windowName" prefix.
      - Usage Notes: Window index extracted from pane (e.g., "0.0" → "0").
      - Quality Contribution: Catches window label regressions.
      - Worked Example: pane "0.0" with windowName "main" → "0:main".
      */
      render(<ActivityLogEntryList entries={FIXTURE_ENTRIES} />);
      expect(screen.getByText('0:main')).toBeInTheDocument();
      expect(screen.getByText('1:test')).toBeInTheDocument();
    });
  });

  describe('gap separators', () => {
    it('renders gap separator between entries >30min apart', () => {
      /*
      Test Doc:
      - Why: AC-13 requires visual gap separators for >30min time gaps.
      - Contract: Gap separator rendered between entries separated by >30 minutes.
      - Usage Notes: Gap detection compares adjacent entry timestamps.
      - Quality Contribution: Directly verifies AC-13 acceptance criterion.
      - Worked Example: 5min ago + 2h ago → gap separator between them.
      */
      render(<ActivityLogEntryList entries={FIXTURE_WITH_GAP} />);
      expect(screen.getByTestId('activity-log-gap')).toBeInTheDocument();
    });

    it('does not render gap separator between entries <30min apart', () => {
      /*
      Test Doc:
      - Why: Gap separators should only appear for significant time gaps.
      - Contract: No gap separator when all entries are within 30 minutes.
      - Usage Notes: FIXTURE_ENTRIES are 5min apart — no gaps expected.
      - Quality Contribution: Prevents false gap separators.
      - Worked Example: entries 5/10/15 min ago → zero gap separators.
      */
      render(<ActivityLogEntryList entries={FIXTURE_ENTRIES} />);
      expect(screen.queryByTestId('activity-log-gap')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('renders empty state when no entries', () => {
      /*
      Test Doc:
      - Why: Users need feedback when activity log is empty.
      - Contract: Empty array → "No activity recorded yet" message.
      - Usage Notes: Uses data-testid="activity-log-empty".
      - Quality Contribution: Catches empty state regressions.
      - Worked Example: [] → empty state message.
      */
      render(<ActivityLogEntryList entries={[]} />);
      expect(screen.getByTestId('activity-log-empty')).toBeInTheDocument();
      expect(screen.getByText('No activity recorded yet')).toBeInTheDocument();
    });
  });

  describe('entry list container', () => {
    it('renders scrollable container with testid', () => {
      /*
      Test Doc:
      - Why: Entry list needs a scrollable container for overflow.
      - Contract: Container has data-testid="activity-log-entry-list".
      - Usage Notes: Used by overlay panel for layout.
      - Quality Contribution: Catches container structure regressions.
      - Worked Example: Non-empty entries → container present.
      */
      render(<ActivityLogEntryList entries={FIXTURE_ENTRIES} />);
      expect(screen.getByTestId('activity-log-entry-list')).toBeInTheDocument();
    });
  });
});
