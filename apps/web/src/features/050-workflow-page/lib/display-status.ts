/**
 * Compute a display-only status for workflow node cards.
 *
 * `awaiting-input` is a UI-only concept — it NEVER appears in state.json,
 * CLI output, or the engine. It is computed here from three primitives
 * (unitType + status + ready) and used solely for rendering the node badge.
 */
export function getDisplayStatus(unitType: string, status: string, ready: boolean): string {
  if (unitType === 'user-input' && (status === 'pending' || status === 'ready') && ready) {
    return 'awaiting-input';
  }
  return status;
}
