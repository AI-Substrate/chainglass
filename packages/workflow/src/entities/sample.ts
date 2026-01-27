/**
 * Sample entity - demonstrates workspace-scoped data storage patterns.
 *
 * Per Plan 014: Workspaces - Phase 3: Sample Domain (Exemplar)
 * This entity validates patterns before applying to real domains (agents, workflows, prompts).
 *
 * Per DYK-P3-01: Constructor injection pattern - WorkspaceContext is path data only.
 * Per DYK-P3-02: Adapter owns updatedAt - entity.create() sets both timestamps,
 *                adapter overwrites updatedAt on every save.
 * Per DYK-03: toJSON() uses camelCase keys, undefined→null, Date→ISO string.
 *
 * Entity pattern (same as Workspace):
 * - Private constructor enforces invariants
 * - Static factory method create() for new samples
 * - Optional slug/timestamps for loading existing samples
 */

import slugify from 'slugify';

/**
 * Input for creating a new sample.
 *
 * When creating a new sample, name and description are required.
 * slug and timestamps are auto-generated.
 *
 * When loading an existing sample, the adapter provides all fields
 * including slug, createdAt, and updatedAt.
 */
export interface SampleInput {
  /** Display name of the sample */
  readonly name: string;

  /** Description of the sample */
  readonly description: string;

  /**
   * Optional slug for loading existing samples.
   * If not provided, generated from name using slugify.
   */
  readonly slug?: string;

  /**
   * Optional creation timestamp for loading existing samples.
   * If not provided, defaults to current time.
   */
  readonly createdAt?: Date;

  /**
   * Optional update timestamp for loading existing samples.
   * If not provided, defaults to createdAt.
   * Per DYK-P3-02: Adapter overwrites this on every save.
   */
  readonly updatedAt?: Date;
}

/**
 * Serialized Sample for JSON output.
 *
 * Per DYK-03:
 * - camelCase property names
 * - Date → ISO-8601 string
 */
export interface SampleJSON {
  /** URL-safe identifier generated from name */
  slug: string;

  /** Display name of the sample */
  name: string;

  /** Description of the sample */
  description: string;

  /** When the sample was created (ISO-8601 string) */
  createdAt: string;

  /** When the sample was last updated (ISO-8601 string) */
  updatedAt: string;
}

/**
 * Sample entity - demonstrates workspace-scoped data storage.
 *
 * A Sample is stored in per-worktree storage at:
 * `<worktree>/.chainglass/data/samples/<slug>.json`
 *
 * It tracks:
 * - slug: URL-safe identifier (generated from name)
 * - name: Human-readable display name
 * - description: Sample content/description
 * - createdAt: When the sample was created
 * - updatedAt: When the sample was last modified
 *
 * Use the create() factory method to create instances (constructor is private).
 */
export class Sample {
  /** URL-safe identifier generated from name */
  readonly slug: string;

  /** Display name of the sample */
  readonly name: string;

  /** Description of the sample */
  readonly description: string;

  /** When the sample was created */
  readonly createdAt: Date;

  /** When the sample was last updated */
  readonly updatedAt: Date;

  /**
   * Private constructor - use create() factory method instead.
   */
  private constructor(
    slug: string,
    name: string,
    description: string,
    createdAt: Date,
    updatedAt: Date
  ) {
    this.slug = slug;
    this.name = name;
    this.description = description;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  /**
   * Create a Sample entity.
   *
   * When creating a new sample:
   * - Provide name and description
   * - slug is auto-generated from name
   * - timestamps default to current time
   *
   * When loading from storage:
   * - Adapter provides all fields including slug and timestamps
   *
   * @param input - Sample data
   * @returns Sample entity
   */
  static create(input: SampleInput): Sample {
    // Generate slug from name if not provided
    const slug = input.slug ?? Sample.generateSlug(input.name);

    // Use provided createdAt or default to now
    const createdAt = input.createdAt ?? new Date();

    // Use provided updatedAt or default to createdAt
    const updatedAt = input.updatedAt ?? createdAt;

    return new Sample(slug, input.name, input.description, createdAt, updatedAt);
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
      slug = 'sample';
    }

    // Ensure slug starts with a letter (required by pattern /^[a-z][a-z0-9-]*$/)
    if (/^\d/.test(slug)) {
      slug = `n${slug}`;
    }

    return slug;
  }

  /**
   * Serialize to JSON for API/web consumption and storage.
   *
   * Per DYK-03:
   * - camelCase property names
   * - Date → ISO-8601 string
   */
  toJSON(): SampleJSON {
    return {
      slug: this.slug,
      name: this.name,
      description: this.description,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
