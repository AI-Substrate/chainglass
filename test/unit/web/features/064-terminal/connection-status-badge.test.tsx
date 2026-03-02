import { ConnectionStatusBadge } from '@/features/064-terminal/components/connection-status-badge';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('ConnectionStatusBadge', () => {
  it('renders connecting state with pulse animation', () => {
    render(<ConnectionStatusBadge status="connecting" />);
    expect(screen.getByText('Connecting')).toBeTruthy();
    const dot = screen.getByLabelText('Connecting');
    expect(dot.className).toContain('animate-pulse');
    expect(dot.className).toContain('bg-yellow-500');
  });

  it('renders connected state without pulse', () => {
    render(<ConnectionStatusBadge status="connected" />);
    expect(screen.getByText('Connected')).toBeTruthy();
    const dot = screen.getByLabelText('Connected');
    expect(dot.className).not.toContain('animate-pulse');
    expect(dot.className).toContain('bg-green-500');
  });

  it('renders disconnected state with reconnect button when handler provided', () => {
    const onReconnect = () => {};
    render(<ConnectionStatusBadge status="disconnected" onReconnect={onReconnect} />);
    expect(screen.getByText('Disconnected')).toBeTruthy();
    expect(screen.getByText('Reconnect')).toBeTruthy();
    const dot = screen.getByLabelText('Disconnected');
    expect(dot.className).toContain('bg-gray-400');
  });

  it('hides label when showLabel is false', () => {
    render(<ConnectionStatusBadge status="connected" showLabel={false} />);
    expect(screen.queryByText('Connected')).toBeNull();
    expect(screen.getByLabelText('Connected')).toBeTruthy();
  });

  it('hides reconnect button when no handler provided', () => {
    render(<ConnectionStatusBadge status="disconnected" />);
    expect(screen.queryByText('Reconnect')).toBeNull();
  });
});
