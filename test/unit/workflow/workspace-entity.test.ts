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
import { Workspace, WorkspaceRegistryAdapter } from '@chainglass/workflow';
import { describe, expect, it } from 'vitest';

describe('Workspace entity', () => {
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

    // Verify directory doesn't exist initially
    expect(await fs.exists('~/.config/chainglass')).toBe(false);

    const workspace = Workspace.create({
      name: 'Test',
      path: '/home/user/project',
    });

    const result = await adapter.save(workspace);

    expect(result.ok).toBe(true);
    // Verify directory was created
    expect(await fs.exists('~/.config/chainglass')).toBe(true);
    // Verify registry file was created
    expect(await fs.exists('~/.config/chainglass/workspaces.json')).toBe(true);
  });
});
