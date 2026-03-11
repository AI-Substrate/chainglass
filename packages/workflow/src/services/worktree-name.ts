/**
 * Worktree naming allocator — pure functions for ordinal naming.
 *
 * Per Plan 069 Phase 2, Workshop 001, DYK D12:
 * All functions are pure — they take pre-fetched data as input and
 * return computed results. No process or git dependency.
 *
 * Naming convention: NNN-normalized-slug
 * - NNN is a zero-padded ordinal (minimum 3 digits)
 * - slug is lowercase, hyphen-separated, alphanumeric
 *
 * The allocator mirrors the behavior of plan-ordinal.py without
 * shelling out to external scripts.
 */

// ==================== Types ====================

/**
 * Parsed result from user input — either a plain slug or a pasted NNN-slug.
 */
export interface ParsedWorktreeName {
  /** The normalized slug portion (e.g., "my-feature") */
  slug: string;
  /** If user pasted NNN-slug, the provided ordinal. Undefined for plain slugs. */
  providedOrdinal?: number;
}

/**
 * Pre-fetched branch and plan data for ordinal allocation.
 * The caller (WorkspaceService) fetches this data via IGitWorktreeManager
 * and passes it in.
 */
export interface OrdinalSources {
  /** Local branch names (e.g., ["main", "067-foo", "068-bar"]) */
  localBranches: string[];
  /** Remote branch names (e.g., ["origin/main", "origin/067-foo"]) */
  remoteBranches: string[];
  /** Plan folder names under docs/plans/ (e.g., ["067-foo", "068-bar"]) */
  planFolders: string[];
}

/**
 * Result of building a worktree name from allocated ordinal + slug.
 */
export interface WorktreeNameResult {
  /** The allocated ordinal number */
  ordinal: number;
  /** The normalized slug */
  slug: string;
  /** The full branch name (e.g., "069-my-feature") */
  branchName: string;
}

// ==================== Slug Normalization ====================

/**
 * Normalize a raw slug string to the canonical format.
 *
 * Rules:
 * 1. Trim whitespace
 * 2. Lowercase
 * 3. Replace non-alphanumeric characters with hyphens
 * 4. Collapse consecutive hyphens
 * 5. Trim leading/trailing hyphens
 * 6. Reject empty results
 *
 * @param raw - Raw slug input (e.g., "My Feature!!", "  hello--world  ")
 * @returns Normalized slug or null if empty after normalization
 */
export function normalizeSlug(raw: string): string | null {
  const result = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

  return result.length > 0 ? result : null;
}

// ==================== Input Parsing ====================

const ORDINAL_PREFIX_PATTERN = /^(\d{3,})-(.+)$/;

/**
 * Parse user input into slug + optional provided ordinal.
 *
 * Supports two input formats:
 * - Plain slug: "my-feature" → { slug: "my-feature", providedOrdinal: undefined }
 * - Pasted NNN-slug: "069-my-feature" → { slug: "my-feature", providedOrdinal: 69 }
 *
 * Per Workshop 001: When a user pastes a full NNN-slug, the ordinal
 * bypasses allocation and the system uses it directly (with validation).
 *
 * @param input - Raw user input
 * @returns Parsed result or null if input is empty/invalid after normalization
 */
export function parseRequestedName(input: string): ParsedWorktreeName | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  // Check for pasted NNN-slug format
  const match = trimmed.match(ORDINAL_PREFIX_PATTERN);
  if (match) {
    const providedOrdinal = Number.parseInt(match[1], 10);
    const slugPart = normalizeSlug(match[2]);
    if (!slugPart) return null;
    return { slug: slugPart, providedOrdinal };
  }

  // Plain slug
  const slug = normalizeSlug(trimmed);
  if (!slug) return null;
  return { slug };
}

// ==================== Ordinal Extraction ====================

/**
 * Extract ordinal numbers from a list of names matching the NNN-slug pattern.
 *
 * @param names - Array of branch names, folder names, etc.
 * @returns Array of ordinal numbers found
 */
export function extractOrdinals(names: string[]): number[] {
  const ordinals: number[] = [];
  for (const name of names) {
    // Strip remote prefix (e.g., "origin/069-foo" → "069-foo")
    const stripped = name.includes('/') ? (name.split('/').pop() ?? name) : name;
    const match = stripped.match(ORDINAL_PREFIX_PATTERN);
    if (match) {
      ordinals.push(Number.parseInt(match[1], 10));
    }
  }
  return ordinals;
}

// ==================== Ordinal Allocation ====================

/**
 * Allocate the next available ordinal by scanning all three sources.
 *
 * Per Workshop 001: Scans local branches, remote branches, and plan folders
 * to find the maximum ordinal, then returns max + 1.
 *
 * @param sources - Pre-fetched branch and plan data
 * @returns The next available ordinal (minimum 1)
 */
export function allocateOrdinal(sources: OrdinalSources): number {
  const allOrdinals = [
    ...extractOrdinals(sources.localBranches),
    ...extractOrdinals(sources.remoteBranches),
    ...extractOrdinals(sources.planFolders),
  ];

  if (allOrdinals.length === 0) return 1;
  return Math.max(...allOrdinals) + 1;
}

// ==================== Name Building ====================

/**
 * Build a worktree branch name from ordinal and slug.
 *
 * @param ordinal - The ordinal number
 * @param slug - The normalized slug
 * @returns Full branch name (e.g., "069-my-feature")
 */
export function buildWorktreeName(ordinal: number, slug: string): string {
  const paddedOrdinal = String(ordinal).padStart(3, '0');
  return `${paddedOrdinal}-${slug}`;
}

// ==================== Full Resolution ====================

/**
 * Resolve a complete worktree name from user input and ordinal sources.
 *
 * This is the main entry point for the naming allocator.
 *
 * For plain slug input: allocates the next ordinal from sources.
 * For pasted NNN-slug input: uses the provided ordinal directly.
 *
 * Per DYK D14: If the caller detects the allocated ordinal is stale
 * (e.g., between preview and create), the caller should re-invoke
 * this function with fresh sources. If the re-allocated name also
 * conflicts, that's a hard block.
 *
 * @param input - Raw user input (plain slug or pasted NNN-slug)
 * @param sources - Pre-fetched branch and plan data
 * @returns WorktreeNameResult or null if input is invalid
 */
export function resolveWorktreeName(
  input: string,
  sources: OrdinalSources
): WorktreeNameResult | null {
  const parsed = parseRequestedName(input);
  if (!parsed) return null;

  const ordinal = parsed.providedOrdinal ?? allocateOrdinal(sources);
  const branchName = buildWorktreeName(ordinal, parsed.slug);

  return {
    ordinal,
    slug: parsed.slug,
    branchName,
  };
}

/**
 * Check if a branch name already exists in the given sources.
 *
 * @param branchName - The branch name to check (e.g., "069-my-feature")
 * @param sources - Pre-fetched branch data
 * @returns true if the name conflicts with an existing branch
 */
export function hasBranchConflict(branchName: string, sources: OrdinalSources): boolean {
  const allBranches = [
    ...sources.localBranches,
    ...sources.remoteBranches.map((b) => (b.includes('/') ? (b.split('/').pop() ?? b) : b)),
  ];
  return allBranches.includes(branchName);
}
