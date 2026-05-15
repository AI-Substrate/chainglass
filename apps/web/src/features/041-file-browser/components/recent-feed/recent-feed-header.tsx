/**
 * RecentFeedHeader — feed chrome strip: title · live indicator · counter ·
 * pause/resume · refresh · settings cog. Workshop §5.
 *
 * Plan recent-changes-feed T010.
 */

'use client';

import { cn } from '@/lib/utils';
import { Pause, Play, RefreshCw, Settings2 } from 'lucide-react';

export interface RecentFeedHeaderProps {
  itemCount: number;
  /** True when the SSE connection is live (green dot). */
  isLive: boolean;
  /** True when the user has paused live promotion. */
  isPaused: boolean;
  /** When paused, the number of buffered changes ready to drain. */
  bufferedChanges?: number;
  onTogglePause: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  className?: string;
}

export function RecentFeedHeader({
  itemCount,
  isLive,
  isPaused,
  bufferedChanges = 0,
  onTogglePause,
  onRefresh,
  onOpenSettings,
  className,
}: RecentFeedHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 border-b border-border bg-background sticky top-0 z-10',
        className
      )}
    >
      <h2 className="text-sm font-semibold text-card-foreground">Recent changes</h2>
      <span
        className={cn(
          'flex items-center gap-1 text-[11px]',
          isLive && !isPaused ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
        )}
        aria-live="polite"
        aria-label={
          isPaused ? `Paused — ${bufferedChanges} buffered` : isLive ? 'Live' : 'Disconnected'
        }
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            isLive && !isPaused ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/50'
          )}
          aria-hidden="true"
        />
        {isPaused ? `Paused (${bufferedChanges})` : isLive ? 'Live' : 'Offline'}
      </span>
      <span className="text-xs text-muted-foreground" aria-label={`${itemCount} items`}>
        {itemCount} {itemCount === 1 ? 'item' : 'items'}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <IconButton
          onClick={onTogglePause}
          title={isPaused ? 'Resume' : 'Pause'}
          icon={isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        />
        <IconButton
          onClick={onRefresh}
          title="Refresh"
          icon={<RefreshCw className="h-3.5 w-3.5" />}
        />
        <IconButton
          onClick={onOpenSettings}
          title="Settings"
          icon={<Settings2 className="h-3.5 w-3.5" />}
        />
      </div>
    </div>
  );
}

interface IconButtonProps {
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
}

function IconButton({ onClick, title, icon }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
    >
      {icon}
    </button>
  );
}
