const MAX_RANDOM_ATTEMPTS = 100;
const ID_SPACE_SIZE = 4096; // 0x000 to 0xFFF

function generateHex3(): string {
  const randomValue = Math.floor(Math.random() * ID_SPACE_SIZE);
  return randomValue.toString(16).padStart(3, '0');
}

export function generateLineId(existingIds: string[]): string {
  const existingSet = new Set(existingIds);

  // Fast path: try random sampling
  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt++) {
    const hex = generateHex3();
    const lineId = `line-${hex}`;
    if (!existingSet.has(lineId)) {
      return lineId;
    }
  }

  // Slow path: deterministic enumeration to find any remaining free ID
  for (let i = 0; i < ID_SPACE_SIZE; i++) {
    const hex = i.toString(16).padStart(3, '0');
    const lineId = `line-${hex}`;
    if (!existingSet.has(lineId)) {
      return lineId;
    }
  }

  throw new Error('Cannot generate unique line ID — ID space exhausted (all 4096 IDs in use)');
}

export function generateNodeId(unitSlug: string, existingIds: string[]): string {
  const existingSet = new Set(existingIds);

  // Fast path: try random sampling
  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt++) {
    const hex = generateHex3();
    const nodeId = `${unitSlug}-${hex}`;
    if (!existingSet.has(nodeId)) {
      return nodeId;
    }
  }

  // Slow path: deterministic enumeration
  for (let i = 0; i < ID_SPACE_SIZE; i++) {
    const hex = i.toString(16).padStart(3, '0');
    const nodeId = `${unitSlug}-${hex}`;
    if (!existingSet.has(nodeId)) {
      return nodeId;
    }
  }

  throw new Error(
    `Cannot generate unique node ID for '${unitSlug}' — ID space exhausted (all 4096 IDs for this slug in use)`
  );
}
