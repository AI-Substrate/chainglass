/**
 * Unit tests for Workspace entity.
 *
 * Per Phase 1: Workspace Entity + Registry Adapter + Contract Tests
 * Per Testing Philosophy: Full TDD - tests written first
 *
 * T002: Tests for Workspace.create() factory
 * T004: Tests for Workspace.toJSON() serialization (added later)
 */

import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import { DEFAULT_PREFERENCES, Workspace, WorkspaceRegistryAdapter } from '@chainglass/workflow';
import type { WorkspacePreferences } from '@chainglass/workflow';
import { describe, expect, it } from 'vitest';

describe('Workspace entity', () => {
  // ==================== T002: WorkspacePreferences type + DEFAULT_PREFERENCES ====================

  describe('preferences defaults (T002)', () => {
    it('should have DEFAULT_PREFERENCES with empty emoji and color', () => {
      /*
      Test Doc:
      - Why: Default preferences indicate "not yet assigned" state
      - Contract: DEFAULT_PREFERENCES has emoji='', color='', starred=false, sortOrder=0
      - Quality Contribution: Ensures consistent defaults across entity creation and migration
      - Worked Example: DEFAULT_PREFERENCES → { emoji: '', color: '', starred: false, sortOrder: 0 }
      */
      expect(DEFAULT_PREFERENCES.emoji).toBe('');
      expect(DEFAULT_PREFERENCES.color).toBe('');
      expect(DEFAULT_PREFERENCES.starred).toBe(false);
      expect(DEFAULT_PREFERENCES.sortOrder).toBe(0);
      expect(DEFAULT_PREFERENCES.starredWorktrees).toEqual([]);
    });

    it('should create workspace with default preferences when none provided', () => {
      /*
      Test Doc:
      - Why: New workspaces start with unassigned preferences
      - Contract: Workspace.create() without preferences uses DEFAULT_PREFERENCES
      - Quality Contribution: Prevents undefined preferences on new entities
      - Worked Example: create({ name: 'Test', path: '/tmp' }) → preferences = DEFAULT_PREFERENCES
      */
      const ws = Workspace.create({ name: 'Test', path: '/tmp/test' });
      expect(ws.preferences.emoji).toBe('');
      expect(ws.preferences.color).toBe('');
      expect(ws.preferences.starred).toBe(false);
      expect(ws.preferences.sortOrder).toBe(0);
      expect(ws.preferences.starredWorktrees).toEqual([]);
    });

    it('should create workspace with partial preferences merged with defaults', () => {
      /*
      Test Doc:
      - Why: Partial preference overrides must merge with defaults
      - Contract: Provided preferences override defaults, missing ones use defaults
      - Quality Contribution: Enables flexible preference creation
      - Worked Example: create({ preferences: { emoji: '🔮' } }) → color='', starred=false
      */
      const ws = Workspace.create({
        name: 'Test',
        path: '/tmp/test',
        preferences: { emoji: '🔮', color: 'purple' },
      });
      expect(ws.preferences.emoji).toBe('🔮');
      expect(ws.preferences.color).toBe('purple');
      expect(ws.preferences.starred).toBe(false);
      expect(ws.preferences.sortOrder).toBe(0);
    });

    it('should create workspace with full preferences', () => {
      /*
      Test Doc:
      - Why: Full preference specification must be preserved exactly
      - Contract: All provided preference fields are stored
      - Quality Contribution: Ensures no data loss on full create
      */
      const ws = Workspace.create({
        name: 'Test',
        path: '/tmp/test',
        preferences: { emoji: '🦊', color: 'orange', starred: true, sortOrder: 5 },
      });
      expect(ws.preferences.emoji).toBe('🦊');
      expect(ws.preferences.color).toBe('orange');
      expect(ws.preferences.starred).toBe(true);
      expect(ws.preferences.sortOrder).toBe(5);
    });
  });

  // ==================== T003: Workspace.withPreferences() ====================

  describe('withPreferences() immutable update (T003)', () => {
    it('should return a new Workspace instance', () => {
      /*
      Test Doc:
      - Why: Entity immutability prevents accidental state corruption
      - Contract: withPreferences() returns a different object than the original
      - Quality Contribution: Enforces immutable entity pattern
      */
      const ws = Workspace.create({ name: 'Test', path: '/tmp/test' });
      const updated = ws.withPreferences({ starred: true });
      expect(updated).not.toBe(ws);
    });

    it('should not modify the original workspace', () => {
      /*
      Test Doc:
      - Why: Original entity must remain unchanged after update
      - Contract: Original workspace preferences unchanged after withPreferences()
      - Quality Contribution: Prevents side effects in service layer
      */
      const ws = Workspace.create({
        name: 'Test',
        path: '/tmp/test',
        preferences: { emoji: '🔮', color: 'purple', starred: false, sortOrder: 0 },
      });
      ws.withPreferences({ starred: true });
      expect(ws.preferences.starred).toBe(false);
    });

    it('should merge partial preferences with existing', () => {
      /*
      Test Doc:
      - Why: Partial updates are the primary use case (e.g., just toggling star)
      - Contract: Only provided fields change, others preserved
      - Quality Contribution: Enables granular preference updates
      - Worked Example: withPreferences({ starred: true }) keeps emoji, color
      */
      const ws = Workspace.create({
        name: 'Test',
        path: '/tmp/test',
        preferences: { emoji: '🔮', color: 'purple', starred: false, sortOrder: 3 },
      });
      const updated = ws.withPreferences({ starred: true });
      expect(updated.preferences.starred).toBe(true);
      expect(updated.preferences.emoji).toBe('🔮');
      expect(updated.preferences.color).toBe('purple');
      expect(updated.preferences.sortOrder).toBe(3);
    });

    it('should preserve all non-preference fields', () => {
      /*
      Test Doc:
      - Why: withPreferences must not alter slug, name, path, createdAt
      - Contract: Non-preference fields identical between original and updated
      - Quality Contribution: Prevents data corruption during updates
      */
      const date = new Date('2025-06-15T10:00:00Z');
      const ws = Workspace.create({
        name: 'My Project',
        path: '/home/user/project',
        slug: 'my-project',
        createdAt: date,
      });
      const updated = ws.withPreferences({ emoji: '🦋' });
      expect(updated.slug).toBe('my-project');
      expect(updated.name).toBe('My Project');
      expect(updated.path).toBe('/home/user/project');
      expect(updated.createdAt.getTime()).toBe(date.getTime());
    });
  });

  // ==================== T004: toJSON() with preferences ====================

  describe('toJSON() with preferences (T004)', () => {
    it('should include preferences in JSON output', () => {
      /*
      Test Doc:
      - Why: Preferences must be serialized for registry storage and API responses
      - Contract: toJSON() output includes preferences object
      - Quality Contribution: Ensures preferences persist through serialization
      */
      const ws = Workspace.create({
        name: 'Test',
        path: '/tmp/test',
        preferences: { emoji: '🔮', color: 'purple', starred: true, sortOrder: 1 },
      });
      const json = ws.toJSON();
      expect(json.preferences).toBeDefined();
      expect(json.preferences.emoji).toBe('🔮');
      expect(json.preferences.color).toBe('purple');
      expect(json.preferences.starred).toBe(true);
      expect(json.preferences.sortOrder).toBe(1);
    });

    it('should include default preferences in JSON when none set', () => {
      /*
      Test Doc:
      - Why: Even unset preferences must serialize (no undefined in JSON)
      - Contract: toJSON() includes preferences even when using defaults
      - Quality Contribution: Prevents undefined fields in registry file
      */
      const ws = Workspace.create({ name: 'Test', path: '/tmp/test' });
      const json = ws.toJSON();
      expect(json.preferences).toBeDefined();
      expect(json.preferences.emoji).toBe('');
      expect(json.preferences.color).toBe('');
      expect(json.preferences.starred).toBe(false);
      expect(json.preferences.sortOrder).toBe(0);
    });

    it('should roundtrip preferences through JSON serialization', () => {
      /*
      Test Doc:
      - Why: Registry stores and loads as JSON — roundtrip must preserve preferences
      - Contract: create→toJSON→parse→create preserves all preferences
      - Quality Contribution: Validates persistence roundtrip with preferences
      - Worked Example: 🦊 orange starred → JSON → parse → same preferences
      */
      const original = Workspace.create({
        name: 'Test',
        path: '/tmp/test',
        preferences: { emoji: '🦊', color: 'orange', starred: true, sortOrder: 42 },
      });
      const json = JSON.stringify(original.toJSON());
      const parsed = JSON.parse(json);
      const restored = Workspace.create({
        name: parsed.name,
        path: parsed.path,
        slug: parsed.slug,
        createdAt: new Date(parsed.createdAt),
        preferences: parsed.preferences,
      });
      expect(restored.preferences.emoji).toBe('🦊');
      expect(restored.preferences.color).toBe('orange');
      expect(restored.preferences.starred).toBe(true);
      expect(restored.preferences.sortOrder).toBe(42);
    });
  });

  describe('create() factory', () => {
    it('should generate slug from name', () => {
      /*
      Test Doc:
      - Why: Slugs are URL-safe identifiers used for lookups
      - Contract: Workspace.create() generates slug from name (lowercase, hyphenated)
      - Usage Notes: Name "My Project" → slug "my-project"
      - Quality Contribution: Prevents invalid slugs in registry
      - Worked Example: create({ name: "My Project", path: "/tmp/test" }) → slug: "my-project"
      */
      const ws = Workspace.create({ name: 'My Project', path: '/tmp/test' });
      expect(ws.slug).toBe('my-project');
    });

    it('should preserve name and path', () => {
      /*
      Test Doc:
      - Why: Name and path are required fields that must be preserved
      - Contract: Workspace.create() preserves input name and path
      - Quality Contribution: Ensures data integrity
      - Worked Example: create({ name: "Test", path: "/home/user/test" }) → same values
      */
      const ws = Workspace.create({ name: 'Test Project', path: '/home/user/test' });
      expect(ws.name).toBe('Test Project');
      expect(ws.path).toBe('/home/user/test');
    });

    it('should set createdAt to current time when not provided', () => {
      /*
      Test Doc:
      - Why: Track when workspace was registered
      - Contract: Workspace.create() defaults createdAt to current time
      - Quality Contribution: Ensures timestamp is always present
      - Worked Example: create({ name: "Test", path: "/tmp" }) → createdAt within last second
      */
      const before = new Date();
      const ws = Workspace.create({ name: 'Test', path: '/tmp' });
      const after = new Date();

      expect(ws.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(ws.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should use provided createdAt when loading existing workspace', () => {
      /*
      Test Doc:
      - Why: Adapter provides createdAt when loading from registry
      - Contract: Workspace.create() uses provided createdAt if given
      - Quality Contribution: Enables accurate persistence roundtrip
      - Worked Example: create({ ..., createdAt: pastDate }) → preserves date
      */
      const pastDate = new Date('2025-06-15T10:30:00Z');
      const ws = Workspace.create({
        name: 'Loaded Project',
        path: '/home/user/loaded',
        createdAt: pastDate,
      });

      expect(ws.createdAt).toEqual(pastDate);
    });

    it('should use provided slug when loading existing workspace', () => {
      /*
      Test Doc:
      - Why: Adapter provides slug when loading from registry
      - Contract: Workspace.create() uses provided slug if given
      - Quality Contribution: Enables accurate persistence roundtrip
      - Worked Example: create({ ..., slug: "custom-slug" }) → preserves slug
      */
      const ws = Workspace.create({
        name: 'Different Name',
        path: '/tmp/test',
        slug: 'custom-slug',
      });

      expect(ws.slug).toBe('custom-slug');
    });

    describe('slug generation edge cases', () => {
      it('should handle special characters in name', () => {
        /*
        Test Doc:
        - Why: Slug must be URL-safe
        - Contract: Special characters removed or replaced with hyphens
        - Quality Contribution: Prevents invalid URLs
        - Worked Example: "My Project (2023)!" → "my-project-2023"
        */
        const ws = Workspace.create({ name: 'My Project (2023)!', path: '/tmp' });
        expect(ws.slug).toBe('my-project-2023');
      });

      it('should handle names starting with numbers', () => {
        /*
        Test Doc:
        - Why: Slugs must start with a letter per pattern /^[a-z][a-z0-9-]*$/
        - Contract: Names starting with numbers get prefix
        - Quality Contribution: Ensures valid slug pattern
        - Worked Example: "123 Project" → "n123-project" or similar
        */
        const ws = Workspace.create({ name: '123 Project', path: '/tmp' });
        expect(ws.slug).toMatch(/^[a-z]/); // Must start with letter
        expect(ws.slug).toMatch(/^[a-z][a-z0-9-]*$/); // Must match pattern
      });

      it('should handle Unicode characters', () => {
        /*
        Test Doc:
        - Why: Support international workspace names
        - Contract: Unicode converted to ASCII or removed safely
        - Quality Contribution: International user support
        - Worked Example: "Café Project" → "cafe-project" or "caf-project"
        */
        const ws = Workspace.create({ name: 'Café Project', path: '/tmp' });
        expect(ws.slug).toMatch(/^[a-z][a-z0-9-]*$/); // ASCII-only slug
      });

      it('should handle names with only special characters', () => {
        /*
        Test Doc:
        - Why: Edge case - name with no alphanumeric content
        - Contract: Should produce some valid slug (not crash)
        - Quality Contribution: Robust error handling
        - Worked Example: "!!!" → some valid slug
        */
        const ws = Workspace.create({ name: '!!!', path: '/tmp' });
        // Should not throw and should produce something
        expect(ws.slug).toBeDefined();
        expect(ws.slug.length).toBeGreaterThan(0);
      });

      it('should handle empty-ish names with whitespace', () => {
        /*
        Test Doc:
        - Why: Edge case - name with only whitespace
        - Contract: Should handle gracefully
        - Quality Contribution: Robust error handling
        */
        const ws = Workspace.create({ name: '   ', path: '/tmp' });
        expect(ws.slug).toBeDefined();
      });

      it('should trim leading and trailing hyphens', () => {
        /*
        Test Doc:
        - Why: Slugs shouldn't start/end with hyphens
        - Contract: Leading/trailing special chars removed
        - Quality Contribution: Clean slug output
        - Worked Example: " - My Project - " → "my-project"
        */
        const ws = Workspace.create({ name: ' - My Project - ', path: '/tmp' });
        expect(ws.slug).not.toMatch(/^-/);
        expect(ws.slug).not.toMatch(/-$/);
      });

      it('should collapse multiple hyphens', () => {
        /*
        Test Doc:
        - Why: Slugs shouldn't have repeated hyphens
        - Contract: Multiple special chars collapse to single hyphen
        - Quality Contribution: Clean slug output
        - Worked Example: "My   Project" → "my-project" (not "my---project")
        */
        const ws = Workspace.create({ name: 'My   Project', path: '/tmp' });
        expect(ws.slug).not.toMatch(/--/);
      });
    });
  });

  describe('toJSON() serialization', () => {
    it('should serialize to JSON with camelCase keys', () => {
      /*
      Test Doc:
      - Why: API compatibility requires camelCase
      - Contract: toJSON() returns object with camelCase property names
      - Quality Contribution: Consistent API response format
      - Worked Example: { slug, name, path, createdAt }
      */
      const ws = Workspace.create({ name: 'Test', path: '/tmp/test' });
      const json = ws.toJSON();

      expect(json).toHaveProperty('slug');
      expect(json).toHaveProperty('name');
      expect(json).toHaveProperty('path');
      expect(json).toHaveProperty('createdAt');
    });

    it('should serialize Date to ISO-8601 string', () => {
      /*
      Test Doc:
      - Why: Dates must be serializable to JSON
      - Contract: toJSON().createdAt is ISO-8601 string
      - Quality Contribution: Standard date format
      - Worked Example: "2026-01-27T12:00:00.000Z"
      */
      const date = new Date('2026-01-27T12:00:00.000Z');
      const ws = Workspace.create({
        name: 'Test',
        path: '/tmp',
        createdAt: date,
      });
      const json = ws.toJSON();

      expect(json.createdAt).toBe('2026-01-27T12:00:00.000Z');
      expect(typeof json.createdAt).toBe('string');
    });

    it('should preserve all field values in toJSON()', () => {
      /*
      Test Doc:
      - Why: Data integrity during serialization
      - Contract: toJSON() preserves all field values
      - Quality Contribution: Accurate persistence
      */
      const ws = Workspace.create({
        name: 'My Project',
        path: '/home/user/projects/my-project',
        slug: 'custom-slug',
        createdAt: new Date('2025-06-15T10:30:00Z'),
      });
      const json = ws.toJSON();

      expect(json.slug).toBe('custom-slug');
      expect(json.name).toBe('My Project');
      expect(json.path).toBe('/home/user/projects/my-project');
      expect(json.createdAt).toBe('2025-06-15T10:30:00.000Z');
    });

    it('should support roundtrip through JSON.stringify/parse', () => {
      /*
      Test Doc:
      - Why: Workspaces are stored as JSON in registry
      - Contract: Entity can be serialized and restored via adapter
      - Quality Contribution: Reliable persistence
      - Usage Notes: Adapter uses JSON.parse() then Workspace.create()
      */
      const original = Workspace.create({
        name: 'Test Project',
        path: '/home/user/test',
      });

      // Serialize
      const json = JSON.stringify(original.toJSON());

      // Deserialize (simulating what adapter does)
      const parsed = JSON.parse(json);
      const restored = Workspace.create({
        name: parsed.name,
        path: parsed.path,
        slug: parsed.slug,
        createdAt: new Date(parsed.createdAt),
      });

      expect(restored.slug).toBe(original.slug);
      expect(restored.name).toBe(original.name);
      expect(restored.path).toBe(original.path);
      expect(restored.createdAt.getTime()).toBe(original.createdAt.getTime());
    });
  });
});

describe('WorkspaceRegistryAdapter path validation', () => {
  it('should reject relative paths', async () => {
    /*
    Test Doc:
    - Why: Security - relative paths could be exploited
    - Contract: save() returns E076 for relative paths
    - Quality Contribution: Prevents security issues
    - Worked Example: "./project" → E076
    */
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

    const workspace = Workspace.create({
      name: 'Test',
      path: './relative/path',
    });

    const result = await adapter.save(workspace);

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('E076');
    expect(result.errorMessage).toContain('absolute');
  });

  it('should reject paths with directory traversal', async () => {
    /*
    Test Doc:
    - Why: Security - directory traversal attack prevention
    - Contract: save() returns E076 for paths with ..
    - Quality Contribution: Prevents security issues
    - Worked Example: "/home/../etc/passwd" → E076
    */
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

    const workspace = Workspace.create({
      name: 'Test',
      path: '/home/../etc/passwd',
    });

    const result = await adapter.save(workspace);

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('E076');
    expect(result.errorMessage).toContain('traversal');
  });

  it('should accept absolute paths', async () => {
    /*
    Test Doc:
    - Why: Absolute paths are valid
    - Contract: save() returns ok=true for absolute paths
    - Quality Contribution: Happy path works
    - Worked Example: "/home/user/project" → ok
    */
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

    const workspace = Workspace.create({
      name: 'Test',
      path: '/home/user/project',
    });

    const result = await adapter.save(workspace);

    expect(result.ok).toBe(true);
  });

  it('should accept tilde paths', async () => {
    /*
    Test Doc:
    - Why: Tilde paths are user-friendly and valid
    - Contract: save() returns ok=true for ~/project paths
    - Quality Contribution: UX convenience
    - Worked Example: "~/project" → ok
    */
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

    const workspace = Workspace.create({
      name: 'Test',
      path: '~/project',
    });

    const result = await adapter.save(workspace);

    expect(result.ok).toBe(true);
  });

  it('should reject URL-encoded directory traversal', async () => {
    /*
    Test Doc:
    - Why: Security - URL encoding can bypass literal string checks
    - Contract: save() returns E076 for URL-encoded traversal paths
    - Quality Contribution: Prevents security bypass
    - Worked Example: "/home/user/%2e%2e/etc/passwd" → E076
    */
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

    // %2e = '.' in URL encoding
    const workspace = Workspace.create({
      name: 'Evil',
      path: '/home/user/%2e%2e/etc/passwd',
    });

    const result = await adapter.save(workspace);

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('E076');
  });

  it('should reject double-encoded directory traversal', async () => {
    /*
    Test Doc:
    - Why: Security - double encoding can bypass single decode
    - Contract: save() returns E076 for double-encoded paths
    - Quality Contribution: Prevents double-encoding attacks
    - Worked Example: "/home/user/%252e%252e/etc" → E076
    */
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

    // %252e = URL-encoded '%2e'
    const workspace = Workspace.create({
      name: 'Evil2',
      path: '/home/user/%252e%252e/etc/passwd',
    });

    const result = await adapter.save(workspace);

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('E076');
  });

  it('should create config directory if it does not exist', async () => {
    /*
    Test Doc:
    - Why: First-time users won't have config directory
    - Contract: save() creates ~/.config/chainglass/ if missing
    - Quality Contribution: Seamless first-run experience
    */
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

    // The adapter expands ~ to HOME env var
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
    const configDir = homeDir ? `${homeDir}/.config/chainglass` : '~/.config/chainglass';

    // Verify directory doesn't exist initially
    expect(await fs.exists(configDir)).toBe(false);

    const workspace = Workspace.create({
      name: 'Test',
      path: '/home/user/project',
    });

    const result = await adapter.save(workspace);

    expect(result.ok).toBe(true);
    // Verify directory was created
    expect(await fs.exists(configDir)).toBe(true);
    // Verify registry file was created
    expect(await fs.exists(`${configDir}/workspaces.json`)).toBe(true);
  });
});
