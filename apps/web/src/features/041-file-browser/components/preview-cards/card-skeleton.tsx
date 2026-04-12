/**
 * CardSkeleton — Shimmer loading skeleton for gallery preview cards.
 *
 * Matches the card dimensions (aspect-video thumb + info bar).
 *
 * Plan 077: Folder Content Preview (T004)
 */

import { cn } from '@/lib/utils';

export function CardSkeleton({
  className,
  style,
}: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn('rounded-xl border border-border bg-card overflow-hidden', className)}
      style={style}
    >
      <div className="aspect-video bg-muted animate-pulse" />
      <div className="p-2.5 border-t border-border flex items-center gap-2">
        <div className="h-4 w-4 rounded bg-muted animate-pulse shrink-0" />
        <div className="h-3 rounded bg-muted animate-pulse w-3/5" />
      </div>
    </div>
  );
}

export function GallerySkeletonGrid() {
  return (
    <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <CardSkeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
          key={i}
          className="animate-in fade-in-0"
          style={{ animationDelay: `${i * 40}ms` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
