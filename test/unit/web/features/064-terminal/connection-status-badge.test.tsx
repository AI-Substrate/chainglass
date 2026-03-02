import { ConnectionStatusBadge } from '@/features/064-terminal/components/connection-status-badge';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('ConnectionStatusBadge', () => {
  it('renders connecting state with pulse animation', () => {
    /*
    Test Doc:
    - Why: Guard regression in status visualization for pending WS connections
    - Contract: status='connecting' shows yellow pulsing dot and "Connecting" label
    - Usage Notes: Render with status prop; no reconnect handler needed for connecting state
    - Quality Contribution: Detects accidental CSS class or config map regressions
    - Worked Example: status='connecting' => label 'Connecting', dot has 'bg-yellow-500' + 'animate-pulse'
    */
    render(<ConnectionStatusBadge status="connecting" />);
    expect(screen.getByText('Connecting')).toBeTruthy();
    const dot = screen.getByLabelText('Connecting');
    expect(dot.className).toContain('animate-pulse');
    expect(dot.className).toContain('bg-yellow-500');
  });

  it('renders connected state without pulse', () => {
    /*
    Test Doc:
    - Why: Guard regression in status visualization for active WS sessions
    - Contract: status='connected' shows green dot and no pulse animation
    - Usage Notes: Render with status prop only; no reconnect handler required
    - Quality Contribution: Detects accidental class/config regressions
    - Worked Example: status='connected' => label 'Connected', dot has 'bg-green-500', no 'animate-pulse'
    */
    render(<ConnectionStatusBadge status="connected" />);
    expect(screen.getByText('Connected')).toBeTruthy();
    const dot = screen.getByLabelText('Connected');
    expect(dot.className).not.toContain('animate-pulse');
    expect(dot.className).toContain('bg-green-500');
  });

  it('renders disconnected state with reconnect button when handler provided', () => {
    /*
    Test Doc:
    - Why: Ensure reconnect affordance appears when connection drops and handler is available
    - Contract: status='disconnected' + onReconnect shows gray dot, label, and clickable Reconnect button
    - Usage Notes: Pass onReconnect callback to enable manual reconnection UX
    - Quality Contribution: Prevents silent disconnection with no user recourse (DYK-01)
    - Worked Example: status='disconnected' + onReconnect => 'Disconnected' label, 'Reconnect' button, 'bg-gray-400' dot
    */
    const onReconnect = () => {};
    render(<ConnectionStatusBadge status="disconnected" onReconnect={onReconnect} />);
    expect(screen.getByText('Disconnected')).toBeTruthy();
    expect(screen.getByText('Reconnect')).toBeTruthy();
    const dot = screen.getByLabelText('Disconnected');
    expect(dot.className).toContain('bg-gray-400');
  });

  it('hides label when showLabel is false', () => {
    /*
    Test Doc:
    - Why: Badge must work in compact mode (icon-only) for tight layouts like overlay headers
    - Contract: showLabel=false suppresses text label but keeps aria-label dot for accessibility
    - Usage Notes: Use showLabel={false} in space-constrained contexts
    - Quality Contribution: Guards compact mode rendering path
    - Worked Example: showLabel=false => no visible 'Connected' text, but aria-label dot still present
    */
    render(<ConnectionStatusBadge status="connected" showLabel={false} />);
    expect(screen.queryByText('Connected')).toBeNull();
    expect(screen.getByLabelText('Connected')).toBeTruthy();
  });

  it('hides reconnect button when no handler provided', () => {
    /*
    Test Doc:
    - Why: Reconnect button must only appear when consumer provides a handler
    - Contract: status='disconnected' without onReconnect omits Reconnect button
    - Usage Notes: Omit onReconnect when reconnection is managed externally
    - Quality Contribution: Prevents dangling UI affordance without backing action
    - Worked Example: status='disconnected', no onReconnect => no 'Reconnect' button in DOM
    */
    render(<ConnectionStatusBadge status="disconnected" />);
    expect(screen.queryByText('Reconnect')).toBeNull();
  });
});
