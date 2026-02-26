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
    <div data-testid="line-transition-gate" className="flex items-center justify-center py-1">
      {transition === 'auto' ? (
        <span className="text-muted-foreground text-sm">↓</span>
      ) : (
        <span
          className={`text-xs px-2 py-0.5 rounded border ${
            precedingComplete
              ? 'border-primary text-primary cursor-pointer hover:bg-primary/10'
              : 'border-muted text-muted-foreground'
          }`}
        >
          🔒 Manual
        </span>
      )}
    </div>
  );
}
