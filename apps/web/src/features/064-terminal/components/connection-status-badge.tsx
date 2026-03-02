import type { ConnectionStatus } from '../types';

const STATUS_CONFIG: Record<ConnectionStatus, { color: string; label: string; pulse: boolean }> = {
  connecting: { color: 'bg-yellow-500', label: 'Connecting', pulse: true },
  connected: { color: 'bg-green-500', label: 'Connected', pulse: false },
  disconnected: { color: 'bg-gray-400', label: 'Disconnected', pulse: false },
};

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus;
  showLabel?: boolean;
  onReconnect?: () => void;
}

export function ConnectionStatusBadge({
  status,
  showLabel = true,
  onReconnect,
}: ConnectionStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-block h-2 w-2 rounded-full ${config.color} ${config.pulse ? 'animate-pulse' : ''}`}
        aria-label={config.label}
      />
      {showLabel && <span className="text-xs text-muted-foreground">{config.label}</span>}
      {status === 'disconnected' && onReconnect && (
        <button
          type="button"
          onClick={onReconnect}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Reconnect
        </button>
      )}
    </div>
  );
}
