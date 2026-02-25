'use client';

/**
 * AsciiSpinner — Reusable ASCII character spinner.
 *
 * Cycles through | / — \ at 80ms intervals when active.
 * Extracted from ExplorerPanel for reuse in binary viewers.
 *
 * Plan 046: Binary File Viewers (DYK-05)
 */

import { useEffect, useState } from 'react';

const SPINNER_FRAMES = ['|', '/', '—', '\\'];
const SPINNER_INTERVAL = 80;

export interface AsciiSpinnerProps {
  active: boolean;
  className?: string;
}

export function AsciiSpinner({ active, className }: AsciiSpinnerProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, SPINNER_INTERVAL);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;

  return (
    <span
      className={className ?? 'shrink-0 w-5 text-center font-mono text-sm text-muted-foreground'}
    >
      {SPINNER_FRAMES[frame]}
    </span>
  );
}
