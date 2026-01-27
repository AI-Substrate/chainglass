'use client';

/**
 * useRelativeTime - Auto-updating relative time display
 *
 * Returns a formatted relative time string that updates every 60 seconds.
 * Uses the same format as run-row.tsx: "just now", "Xm ago", "Xh ago", "Xd ago"
 *
 * Part of Plan 015: Better Agents - Session Management
 */

import { useEffect, useState } from 'react';

/**
 * Format a timestamp to relative time string.
 * Exported for use without the hook (static rendering).
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

/**
 * Hook that returns an auto-updating relative time string.
 *
 * @param timestamp - Unix timestamp in milliseconds (Date.now() format)
 * @param intervalMs - Update interval in milliseconds (default: 60000 = 1 minute)
 * @returns Formatted relative time string that updates automatically
 *
 * @example
 * const relativeTime = useRelativeTime(session.lastActiveAt);
 * // Returns "2h ago" and updates every minute
 */
export function useRelativeTime(timestamp: number, intervalMs = 60000): string {
  const [formatted, setFormatted] = useState(() => formatRelativeTime(timestamp));

  useEffect(() => {
    // Update immediately when timestamp changes
    setFormatted(formatRelativeTime(timestamp));

    // Set up interval for auto-updates
    const interval = setInterval(() => {
      setFormatted(formatRelativeTime(timestamp));
    }, intervalMs);

    return () => clearInterval(interval);
  }, [timestamp, intervalMs]);

  return formatted;
}

export default useRelativeTime;
