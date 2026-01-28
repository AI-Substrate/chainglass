/**
 * Node ID Generation Utilities.
 *
 * Per Discovery 11: Node ID format is `<unit-slug>-<hex3>` (e.g., write-poem-b2c).
 * The 'start' node is reserved and cannot be used as a unit slug.
 */

/**
 * Maximum attempts to generate a unique ID before throwing.
 * With 4096 possible hex values (16^3), this is generous.
 */
const MAX_GENERATION_ATTEMPTS = 5000;

/**
 * Generate a random 3-character lowercase hex string.
 *
 * @returns 3 lowercase hex characters (e.g., 'a7f', 'b2c')
 */
function generateHex3(): string {
  const randomValue = Math.floor(Math.random() * 4096); // 0-4095 (16^3)
  return randomValue.toString(16).padStart(3, '0');
}

/**
 * Generate a unique node ID for a unit.
 *
 * Per Discovery 11:
 * - Format: `<unit-slug>-<hex3>` (e.g., write-poem-b2c)
 * - `start` is reserved and cannot be used as a unit slug
 * - Handles collisions by regenerating
 *
 * @param unitSlug - The unit slug to use as prefix
 * @param existingIds - Array of existing node IDs to avoid collisions
 * @returns A unique node ID
 * @throws Error if 'start' is used as unit slug or hex space exhausted
 */
export function generateNodeId(unitSlug: string, existingIds: string[]): string {
  // Validate that 'start' is not used as unit slug
  if (unitSlug === 'start') {
    throw new Error("Cannot use 'start' as unit slug - it is reserved for the graph entry point");
  }

  // Create a Set for O(1) lookup
  const existingSet = new Set(existingIds);

  // Attempt to generate a unique ID
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const hex = generateHex3();
    const nodeId = `${unitSlug}-${hex}`;

    if (!existingSet.has(nodeId)) {
      return nodeId;
    }
  }

  // All attempts failed - hex space likely exhausted
  throw new Error(
    `Cannot generate unique node ID for unit '${unitSlug}' after ${MAX_GENERATION_ATTEMPTS} attempts. Hex space may be exhausted (max 4096 nodes per unit type).`
  );
}
