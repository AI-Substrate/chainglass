/**
 * LineTransitionGate — Visual indicator between workflow lines.
 *
 * Shows auto (arrow) or manual (lock) transition.
 *
 * Phase 2: Canvas Core + Layout — Plan 050
 */

export interface LineTransitionGateProps {
  transition: 'auto' | 'manual';
  precedingComplete: boolean;
}

export function LineTransitionGate({ transition, precedingComplete }: LineTransitionGateProps) {
  return (
    <div data-testid="line-transition-gate" className="flex items-center justify-center py-2">
      {transition === 'auto' ? (
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-px h-3 bg-border/40" />
          <div className="w-5 h-5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shadow-sm">
            <svg
              aria-hidden="true"
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              className="text-muted-foreground/50"
            >
              <path
                d="M5 2v6M3 6l2 2 2-2"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="w-px h-3 bg-border/40" />
        </div>
      ) : (
        <span
          className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors ${
            precedingComplete
              ? 'border-primary/30 text-primary cursor-pointer hover:bg-primary/10'
              : 'border-border/30 text-muted-foreground/50'
          }`}
        >
          🔒 Manual
        </span>
      )}
    </div>
  );
}
