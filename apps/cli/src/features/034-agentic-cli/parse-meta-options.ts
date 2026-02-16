/**
 * Plan 034: Agentic CLI — Parse Meta Options
 *
 * Parses `--meta key=value` repeatable CLI options into a metadata record.
 * Values are split on the first `=` only, so `key=a=b` → { key: 'a=b' }.
 */

/**
 * Parse an array of `key=value` strings into a metadata record.
 * Returns undefined if no meta options provided.
 *
 * @throws Error if a meta entry has no `=` separator
 */
export function parseMetaOptions(meta?: string[]): Record<string, unknown> | undefined {
  if (!meta || meta.length === 0) return undefined;

  const result: Record<string, unknown> = {};
  for (const entry of meta) {
    const eqIndex = entry.indexOf('=');
    if (eqIndex === -1) {
      throw new Error(`Invalid --meta format: "${entry}". Expected key=value.`);
    }
    const key = entry.slice(0, eqIndex);
    const value = entry.slice(eqIndex + 1);
    result[key] = value;
  }
  return result;
}
