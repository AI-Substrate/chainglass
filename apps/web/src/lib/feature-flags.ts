/**
 * Feature Flags for Progressive Rollout
 *
 * Simple environment-based feature flags for controlling feature visibility.
 * Uses NEXT_PUBLIC_* prefix for client-side access in Next.js.
 *
 * Usage:
 *   if (FEATURES.WORKFLOW_VISUALIZATION) {
 *     // Render workflow visualization
 *   }
 *
 * To enable features, set environment variables:
 *   NEXT_PUBLIC_ENABLE_WORKFLOW=true
 *   NEXT_PUBLIC_ENABLE_KANBAN=true
 *   NEXT_PUBLIC_ENABLE_SSE=true
 */
export const FEATURES = {
  /** Enable ReactFlow workflow visualization */
  WORKFLOW_VISUALIZATION: process.env.NEXT_PUBLIC_ENABLE_WORKFLOW === 'true',

  /** Enable dnd-kit Kanban board */
  KANBAN_BOARD: process.env.NEXT_PUBLIC_ENABLE_KANBAN === 'true',

  /** Enable Server-Sent Events for real-time updates */
  SSE_UPDATES: process.env.NEXT_PUBLIC_ENABLE_SSE === 'true',
} as const;

/** Type for feature flag keys */
export type FeatureFlag = keyof typeof FEATURES;

/** Check if a specific feature is enabled */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURES[flag];
}
