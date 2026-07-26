/**
 * Freshness + provenance — Plan 089 Phase 2 (T005).
 *
 * Test Doc:
 * - Why: C-05 says `effort`/`boundModel` render as *pinned* until observed and the context gauge is a
 *   value or an honest `unknown`, never an estimate. Every one of those is a place where a UI can
 *   quietly upgrade a request into a fact.
 * - Contract: AC-09, C-05, domain.md's "observations, never verdicts".
 * - Usage Notes: `now` is injected everywhere; no test reads the wall clock.
 * - Quality Contribution: pins the exact wording of the honest cases — "unknown" rather than 0,
 *   "pinned" rather than silence, "last heard" rather than "stalled".
 * - Worked Example: `contextCurrent: { value: 'unknown' }` renders the word unknown; a seat at 104542
 *   of 1000000 renders the count and 10%.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ContextGauge,
  Freshness,
  Provenance,
  StalenessBanner,
  isRecordsPollStale,
} from '../../../../apps/web/src/features/089-first-class-pij/components/freshness';
import {
  formatElapsed,
  formatLastHeard,
} from '../../../../apps/web/src/features/089-first-class-pij/lib/relative-time';
import { fleetRow, minutesAgo, pollerStatus } from '../../../fixtures/pij/fleet-ui';

const NOW = Date.parse('2026-07-26T12:00:00.000Z');

describe('formatElapsed', () => {
  it('walks seconds → minutes → hours → days', async () => {
    expect(formatElapsed(minutesAgo(0), NOW)).toBe('0s ago');
    expect(formatElapsed(minutesAgo(1), NOW)).toBe('60s ago');
    expect(formatElapsed(minutesAgo(5), NOW)).toBe('5m ago');
    expect(formatElapsed(minutesAgo(60 * 5), NOW)).toBe('5h ago');
    expect(formatElapsed(minutesAgo(60 * 72), NOW)).toBe('3d ago');
  });

  it('renders an absent or unparseable timestamp as an em dash, never as zero', async () => {
    // "0s ago" would claim the seat was heard from this instant. An em dash claims nothing.
    expect(formatElapsed(null, NOW)).toBe('—');
    expect(formatElapsed(undefined, NOW)).toBe('—');
    expect(formatElapsed('not a date', NOW)).toBe('—');
  });

  it('says "no events yet" rather than inventing a duration', async () => {
    expect(formatLastHeard(null, NOW)).toBe('no events yet');
    expect(formatLastHeard(minutesAgo(4), NOW)).toBe('last heard 4m ago');
  });

  it('never renders a verdict about the gap', async () => {
    render(<Freshness at={minutesAgo(600)} now={NOW} />);
    expect(screen.getByText('10h ago')).toBeTruthy();
    expect(screen.queryByText(/stalled|stuck|dead|hung/i)).toBeNull();
  });
});

describe('Provenance (C-05)', () => {
  it('labels an unconfirmed value as pinned', async () => {
    render(<Provenance value="claude-opus-5" observed={false} />);
    expect(screen.getByText('pinned')).toBeTruthy();
  });

  it('labels a confirmed value as observed', async () => {
    render(<Provenance value="claude-opus-5" observed={true} />);
    expect(screen.getByText('observed')).toBeTruthy();
  });

  it('says "not yet observed" rather than leaving a blank that reads as none', async () => {
    render(<Provenance value={null} observed={false} />);
    expect(screen.getByText('not yet observed')).toBeTruthy();
  });
});

describe('ContextGauge (C-05)', () => {
  it('renders the literal unknown as unknown — never as 0', async () => {
    const row = fleetRow('pij-x', {
      contextMax: 1_000_000,
      contextCurrent: { value: 'unknown', asOf: minutesAgo(1), provenance: 'claude-transcript' },
    });
    const { container } = render(<ContextGauge row={row} />);

    expect(screen.getByText('unknown')).toBeTruthy();
    expect(container.textContent).not.toContain('0');
  });

  it('renders a real count with its percentage of the window', async () => {
    const row = fleetRow('pij-y', {
      contextMax: 1_000_000,
      contextCurrent: { value: 104_542, asOf: minutesAgo(1), provenance: 'claude-transcript' },
    });
    render(<ContextGauge row={row} />);

    expect(screen.getByText(/104,542 · 10%/)).toBeTruthy();
  });

  it('renders a count with no window as just the count', async () => {
    const row = fleetRow('pij-z', {
      contextMax: null,
      contextCurrent: { value: 1234, asOf: minutesAgo(1) },
    });
    render(<ContextGauge row={row} />);
    expect(screen.getByText('1,234')).toBeTruthy();
  });
});

describe('StalenessBanner (AC-09)', () => {
  it('stays silent while the slow loop is keeping up', async () => {
    const { container } = render(<StalenessBanner status={pollerStatus()} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('appears once the slow loop is more than three cadences behind', async () => {
    render(
      <StalenessBanner status={pollerStatus({ lastRecordsPollAt: minutesAgo(11) })} now={NOW} />
    );
    const banner = screen.getByTestId('pij-staleness-banner');
    expect(banner.textContent).toContain('not completed a record poll recently');
    expect(banner.textContent).toContain('11m ago');
  });

  it('says so plainly when the reader is stopped', async () => {
    render(<StalenessBanner status={pollerStatus({ running: false })} now={NOW} />);
    expect(screen.getByTestId('pij-staleness-banner').textContent).toContain('is not running');
  });

  it('distinguishes "never polled" from "polled a while ago"', async () => {
    render(<StalenessBanner status={pollerStatus({ lastRecordsPollAt: null })} now={NOW} />);
    expect(screen.getByTestId('pij-staleness-banner').textContent).toContain(
      'has not completed one at all yet'
    );
  });

  it('treats 24s as the boundary — three missed slow loops, not one slow one', async () => {
    const justInside = pollerStatus({ lastRecordsPollAt: new Date(NOW - 20_000).toISOString() });
    const justOutside = pollerStatus({ lastRecordsPollAt: new Date(NOW - 30_000).toISOString() });
    expect(isRecordsPollStale(justInside, NOW)).toBe(false);
    expect(isRecordsPollStale(justOutside, NOW)).toBe(true);
  });
});
