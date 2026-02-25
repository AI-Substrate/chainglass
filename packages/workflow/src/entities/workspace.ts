/**
 * Workspace entity - represents a registered workspace in the global registry.
 *
 * Per Plan 014: Workspaces - A workspace is a folder registered in the global
 * registry (~/.config/chainglass/workspaces.json). Workspaces can contain
 * multiple git worktrees, each with their own per-worktree data storage.
 *
 * Per DYK-03: toJSON() uses camelCase keys, undefined→null, Date→ISO string.
 * Per DYK Session: No fromJSON() - adapter handles deserialization via create().
 *
 * Entity pattern:
 * - Private constructor enforces invariants
 * - Static factory method create() for new workspaces
 * - Optional slug/createdAt parameters for loading existing workspaces
 */

import slugify from 'slugify';

// ==================== Preferences ====================

/**
 * Workspace preferences for visual identity and display.
 * Stored in the global registry alongside workspace metadata.
 */
/** Per-worktree visual identity — emoji + color override workspace defaults */
export interface WorktreeVisualPreferences {
  emoji: string;
  color: string;
}

export interface WorkspacePreferences {
  /** Workspace emoji for visual identification (empty = not yet assigned) */
  emoji: string;
  /** Accent color name from curated palette (empty = not yet assigned) */
  color: string;
  /** Whether workspace is starred/pinned to top */
  starred: boolean;
  /** Display order within starred/unstarred group (lower = first) */
  sortOrder: number;
  /** Worktree paths that are starred/pinned to top of picker */
  starredWorktrees: string[];
  /** Per-worktree emoji + color overrides, keyed by absolute worktree path */
  worktreePreferences: Record<string, WorktreeVisualPreferences>;
  /** SDK settings overrides, keyed by 'domain.settingName'. Only non-default values. */
  sdkSettings: Record<string, unknown>;
  /** SDK keyboard shortcut overrides, keyed by shortcut string, value is command ID */
  sdkShortcuts: Record<string, string>;
  /** SDK most-recently-used command IDs for command palette ordering */
  sdkMru: string[];
}

/**
 * Default preferences for new or migrated workspaces.
 * Empty emoji/color means "not yet assigned" — UI shows fallback.
 */
export const DEFAULT_PREFERENCES: WorkspacePreferences = {
  emoji: '',
  color: '',
  starred: false,
  sortOrder: 0,
  starredWorktrees: [],
  worktreePreferences: {},
  sdkSettings: {},
  sdkShortcuts: {},
  sdkMru: [],
};

/**
 * Input for creating a new workspace.
 *
 * When creating a new workspace, only name and path are required.
 * slug and createdAt are auto-generated.
 *
 * When loading an existing workspace from the registry, the adapter
 * provides slug and createdAt from the stored data.
 */
export interface WorkspaceInput {
  /** Display name of the workspace */
  readonly name: string;

  /** Absolute path to the workspace root folder */
  readonly path: string;

  /**
   * Optional slug for loading existing workspaces.
   * If not provided, generated from name using slugify.
   */
  readonly slug?: string;

  /**
   * Optional creation timestamp for loading existing workspaces.
   * If not provided, defaults to current time.
   */
  readonly createdAt?: Date;

  /**
   * Optional preferences for loading existing workspaces.
   * If not provided (or partially provided), merges with DEFAULT_PREFERENCES.
   */
  readonly preferences?: Partial<WorkspacePreferences>;
}

/**
 * Serialized Workspace for JSON output.
 *
 * Per DYK-03:
 * - camelCase property names
 * - Date → ISO-8601 string
 */
export interface WorkspaceJSON {
  /** URL-safe identifier generated from name */
  slug: string;

  /** Display name of the workspace */
  name: string;

  /** Absolute path to the workspace root folder */
  path: string;

  /** When the workspace was registered (ISO-8601 string) */
  createdAt: string;

  /** Workspace preferences (visual identity, display) */
  preferences: WorkspacePreferences;
}

/**
 * Workspace entity - represents a registered workspace.
 *
 * A Workspace is a folder registered in the global registry. It tracks:
 * - slug: URL-safe identifier (generated from name)
 * - name: Human-readable display name
 * - path: Absolute filesystem path to the workspace root
 * - createdAt: When the workspace was registered
 *
 * Use the create() factory method to create instances (constructor is private).
 */
export class Workspace {
  /** URL-safe identifier generated from name */
  readonly slug: string;

  /** Display name of the workspace */
  readonly name: string;

  /** Absolute path to the workspace root folder */
  readonly path: string;

  /** When the workspace was registered */
  readonly createdAt: Date;

  /** Workspace preferences (visual identity, display) */
  readonly preferences: WorkspacePreferences;

  /**
   * Private constructor - use create() factory method instead.
   */
  private constructor(
    slug: string,
    name: string,
    path: string,
    createdAt: Date,
    preferences: WorkspacePreferences
  ) {
    this.slug = slug;
    this.name = name;
    this.path = path;
    this.createdAt = createdAt;
    this.preferences = preferences;
  }

  /**
   * Create a Workspace entity.
   *
   * When creating a new workspace:
   * - Provide name and path
   * - slug is auto-generated from name
   * - createdAt defaults to current time
   *
   * When loading from registry:
   * - Adapter provides all fields including slug and createdAt
   *
   * @param input - Workspace data
   * @returns Workspace entity
   */
  static create(input: WorkspaceInput): Workspace {
    // Generate slug from name if not provided
    // Implementation will use slugify library (T003)
    const slug = input.slug ?? Workspace.generateSlug(input.name);

    // Use provided createdAt or default to now
    const createdAt = input.createdAt ?? new Date();

    // Merge provided preferences with defaults
    const preferences: WorkspacePreferences = {
      ...DEFAULT_PREFERENCES,
      ...input.preferences,
    };

    return new Workspace(slug, input.name, input.path, createdAt, preferences);
  }

  /**
   * Create a new Workspace with updated preferences (immutable).
   *
   * Returns a new Workspace instance with the merged preferences.
   * The original workspace is not modified.
   *
   * @param prefs - Partial preferences to merge with existing
   * @returns New Workspace with updated preferences
   */
  withPreferences(prefs: Partial<WorkspacePreferences>): Workspace {
    return Workspace.create({
      slug: this.slug,
      name: this.name,
      path: this.path,
      createdAt: this.createdAt,
      preferences: { ...this.preferences, ...prefs },
    });
  }

  /**
   * Generate a URL-safe slug from a name.
   *
   * Uses slugify library with strict mode for reliable slug generation.
   * Must match pattern: /^[a-z][a-z0-9-]*$/
   *
   * @param name - Display name to convert
   * @returns URL-safe slug
   */
  private static generateSlug(name: string): string {
    // Use slugify with strict mode to handle Unicode, special chars, etc.
    let slug = slugify(name, {
      lower: true,
      strict: true, // Remove all special characters
      trim: true,
    });

    // Handle edge cases where slugify produces empty result
    // (e.g., name is only special characters like "!!!")
    if (!slug || slug.length === 0) {
      slug = 'workspace';
    }

    // Ensure slug starts with a letter (required by pattern /^[a-z][a-z0-9-]*$/)
    if (/^\d/.test(slug)) {
      slug = `n${slug}`;
    }

    return slug;
  }

  /**
   * Serialize to JSON for API/web consumption.
   *
   * Per DYK-03:
   * - camelCase property names
   * - Date → ISO-8601 string
   */
  toJSON(): WorkspaceJSON {
    return {
      slug: this.slug,
      name: this.name,
      path: this.path,
      createdAt: this.createdAt.toISOString(),
      preferences: { ...this.preferences },
    };
  }
}
