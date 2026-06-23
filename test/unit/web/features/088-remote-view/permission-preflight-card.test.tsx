/**
 * Plan 088 Phase 6 — T004: the AC-14 preflight card.
 *
 * Proves the card the picker shows when a TCC grant is missing: it renders nothing when nothing is
 * missing (no nagging on the happy path), names each missing grant with a deep-link to its System
 * Settings pane, and fires `onRecheck` so re-granting recovers without a reload.
 */
import { PermissionPreflightCard } from '@/features/088-remote-view/components/permission-preflight-card';
import { SETTINGS_URL } from '@/features/088-remote-view/components/permissions-ux';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('PermissionPreflightCard (T004, AC-14)', () => {
  it('renders nothing when no grant is missing', () => {
    const { container } = render(<PermissionPreflightCard missing={[]} onRecheck={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('names each missing grant and links to its System Settings pane', () => {
    render(
      <PermissionPreflightCard
        missing={[
          {
            grant: 'screenRecording',
            label: 'Screen Recording',
            why: 'capture',
            settingsUrl: SETTINGS_URL.screenRecording,
          },
          {
            grant: 'accessibility',
            label: 'Accessibility',
            why: 'input',
            settingsUrl: SETTINGS_URL.accessibility,
          },
        ]}
        onRecheck={vi.fn()}
      />
    );

    expect(screen.getByText('Screen Recording')).toBeTruthy();
    expect(screen.getByText('Accessibility')).toBeTruthy();
    expect(
      screen.getByTestId('remote-view-open-settings-screenRecording').getAttribute('href')
    ).toBe(SETTINGS_URL.screenRecording);
    expect(screen.getByTestId('remote-view-open-settings-accessibility').getAttribute('href')).toBe(
      SETTINGS_URL.accessibility
    );
  });

  it('fires onRecheck when the Re-check button is clicked', () => {
    const onRecheck = vi.fn();
    render(
      <PermissionPreflightCard
        missing={[
          {
            grant: 'screenRecording',
            label: 'Screen Recording',
            why: 'capture',
            settingsUrl: SETTINGS_URL.screenRecording,
          },
        ]}
        onRecheck={onRecheck}
      />
    );

    fireEvent.click(screen.getByTestId('remote-view-permission-recheck'));
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });
});
