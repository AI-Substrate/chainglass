/**
 * The context-fill bar: a thin vertical track filled from the bottom to the share of the agent's
 * context window in use, coloured by band (see `lib/context-fill.ts`). Renders nothing when the
 * window's seat reports no context. The caller positions the track (`className`).
 */

import {
  type ContextBand,
  type SeatContext,
  contextBand,
  contextFill,
  contextLabel,
} from '../lib/context-fill';

const BAND_FILL: Record<ContextBand, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-yellow-400',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
};

export function ContextFillBar({
  context,
  className,
}: {
  context: SeatContext | null;
  className: string;
}) {
  if (!context) return null;
  const fill = contextFill(context);
  const band = contextBand(fill);
  const label = contextLabel(context);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-context-band={band}
      className={`overflow-hidden rounded-full bg-current/25 ${className}`}
    >
      <span
        className={`absolute inset-x-0 bottom-0 ${BAND_FILL[band]}`}
        style={{ height: `${fill * 100}%` }}
      />
    </span>
  );
}
