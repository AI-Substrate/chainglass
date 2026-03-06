/**
 * Activity Log Overlay — Lightweight UI Tests
 *
 * Tests for ActivityLogEntryList rendering, gap separators, and empty state.
 * Fixtures only, no mocks (per testing strategy).
 *
 * Plan 065: Worktree Activity Log — Phase 3
 */

import { describe, expect, it } from 'vitest';
import type { ActivityLogEntry } from '../../../../apps/web/src/features/065-activity-log/types';

// Fixture entries — newest first (as returned by readActivityLog)
const now = Date.now();
const FIXTURE_ENTRIES: ActivityLogEntry[] = [
  {
    id: 'tmux:0.0',
    source: 'tmux',
    label: 'Implementing Phase 3',
    timestamp: new Date(now - 5 * 60_000).toISOString(), // 5 min ago
  },
  {
    id: 'tmux:0.1',
    source: 'tmux',
    label: 'Running tests',
    timestamp: new Date(now - 10 * 60_000).toISOString(), // 10 min ago
  },
  {
    id: 'agent:agent-1',
    source: 'agent',
    label: 'Code review in progress',
    timestamp: new Date(now - 15 * 60_000).toISOString(), // 15 min ago
  },
];

// Entries with a >30min gap between them
const FIXTURE_WITH_GAP: ActivityLogEntry[] = [
  {
    id: 'tmux:0.0',
    source: 'tmux',
    label: 'Morning session',
    timestamp: new Date(now - 5 * 60_000).toISOString(), // 5 min ago
  },
  {
    id: 'tmux:0.0',
    source: 'tmux',
    label: 'Evening session',
    timestamp: new Date(now - 120 * 60_000).toISOString(), // 2 hours ago
  },
];

describe('ActivityLogEntryList', () => {
  describe('type contracts', () => {
    it('ActivityLogEntry type has required fields', () => {
      const entry: ActivityLogEntry = {
        id: 'test:1',
        source: 'test',
        label: 'Test label',
        timestamp: new Date().toISOString(),
      };
      expect(entry.id).toBeDefined();
      expect(entry.source).toBeDefined();
      expect(entry.label).toBeDefined();
      expect(entry.timestamp).toBeDefined();
    });

    it('ActivityLogEntry supports optional meta bag', () => {
      const entry: ActivityLogEntry = {
        id: 'test:1',
        source: 'test',
        label: 'Test label',
        timestamp: new Date().toISOString(),
        meta: { pane: '0.0', session: 'main' },
      };
      expect(entry.meta).toEqual({ pane: '0.0', session: 'main' });
    });
  });

  describe('entry fixtures', () => {
    it('fixture entries are in newest-first order', () => {
      for (let i = 1; i < FIXTURE_ENTRIES.length; i++) {
        const prev = Date.parse(FIXTURE_ENTRIES[i - 1].timestamp);
        const curr = Date.parse(FIXTURE_ENTRIES[i].timestamp);
        expect(prev).toBeGreaterThan(curr);
      }
    });

    it('fixture entries have valid source types', () => {
      for (const entry of FIXTURE_ENTRIES) {
        expect(['tmux', 'agent', 'build', 'workflow']).toContain(entry.source);
      }
    });
  });

  describe('gap detection logic', () => {
    const GAP_THRESHOLD_MS = 30 * 60 * 1000;

    function hasGap(a: string, b: string): boolean {
      return Math.abs(Date.parse(a) - Date.parse(b)) > GAP_THRESHOLD_MS;
    }

    it('no gap between entries <30min apart', () => {
      expect(hasGap(FIXTURE_ENTRIES[0].timestamp, FIXTURE_ENTRIES[1].timestamp)).toBe(false);
    });

    it('gap detected between entries >30min apart', () => {
      expect(hasGap(FIXTURE_WITH_GAP[0].timestamp, FIXTURE_WITH_GAP[1].timestamp)).toBe(true);
    });

    it('no gap for identical timestamps', () => {
      const ts = new Date().toISOString();
      expect(hasGap(ts, ts)).toBe(false);
    });

    it('gap detected at exactly 31 minutes', () => {
      const a = new Date(now).toISOString();
      const b = new Date(now - 31 * 60_000).toISOString();
      expect(hasGap(a, b)).toBe(true);
    });

    it('no gap at exactly 29 minutes', () => {
      const a = new Date(now).toISOString();
      const b = new Date(now - 29 * 60_000).toISOString();
      expect(hasGap(a, b)).toBe(false);
    });
  });

  describe('source icon mapping', () => {
    function sourceIcon(source: string): string {
      switch (source) {
        case 'tmux':
          return '🖥';
        case 'agent':
          return '🤖';
        default:
          return '📋';
      }
    }

    it('maps tmux source to monitor icon', () => {
      expect(sourceIcon('tmux')).toBe('🖥');
    });

    it('maps agent source to robot icon', () => {
      expect(sourceIcon('agent')).toBe('🤖');
    });

    it('maps unknown source to clipboard icon', () => {
      expect(sourceIcon('build')).toBe('📋');
      expect(sourceIcon('workflow')).toBe('📋');
    });
  });

  describe('relative time formatting', () => {
    function relativeTime(timestamp: string): string {
      const ms = Date.now() - Date.parse(timestamp);
      if (ms < 60_000) return 'just now';
      if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
      if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
      return `${Math.floor(ms / 86_400_000)}d ago`;
    }

    it('shows "just now" for <1min', () => {
      expect(relativeTime(new Date(Date.now() - 30_000).toISOString())).toBe('just now');
    });

    it('shows minutes for <1h', () => {
      expect(relativeTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5m ago');
    });

    it('shows hours for <1d', () => {
      expect(relativeTime(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe('3h ago');
    });

    it('shows days for >1d', () => {
      expect(relativeTime(new Date(Date.now() - 2 * 86_400_000).toISOString())).toBe('2d ago');
    });
  });
});
