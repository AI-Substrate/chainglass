/**
 * Unit tests for Sample entity.
 *
 * Per Phase 3: Sample Domain (Exemplar)
 * Per Testing Philosophy: Full TDD - tests written first
 *
 * T026: Tests for Sample.create() factory and toJSON()
 */

import { Sample } from '@chainglass/workflow';
import { describe, expect, it } from 'vitest';

describe('Sample entity', () => {
  describe('create() factory', () => {
    it('should generate slug from name', () => {
      /*
      Test Doc:
      - Why: Slugs are URL-safe identifiers used for file names
      - Contract: Sample.create() generates slug from name (lowercase, hyphenated)
      - Usage Notes: Name "My Sample" → slug "my-sample"
      - Quality Contribution: Prevents invalid file names in storage
      - Worked Example: create({ name: "My Sample", description: "Test" }) → slug: "my-sample"
      */
      const sample = Sample.create({ name: 'My Sample', description: 'Test description' });
      expect(sample.slug).toBe('my-sample');
    });

    it('should preserve name and description', () => {
      /*
      Test Doc:
      - Why: Name and description are required fields that must be preserved
      - Contract: Sample.create() preserves input name and description
      - Quality Contribution: Ensures data integrity
      - Worked Example: create({ name: "Test", description: "Some text" }) → same values
      */
      const sample = Sample.create({
        name: 'Test Sample',
        description: 'This is a test description',
      });
      expect(sample.name).toBe('Test Sample');
      expect(sample.description).toBe('This is a test description');
    });

    it('should set createdAt to current time when not provided', () => {
      /*
      Test Doc:
      - Why: Track when sample was created
      - Contract: Sample.create() defaults createdAt to current time
      - Quality Contribution: Ensures timestamp is always present
      - Worked Example: create({ name: "Test", description: "x" }) → createdAt within last second
      */
      const before = new Date();
      const sample = Sample.create({ name: 'Test', description: 'Test' });
      const after = new Date();

      expect(sample.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(sample.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set updatedAt to createdAt when not provided', () => {
      /*
      Test Doc:
      - Why: New samples have same createdAt and updatedAt
      - Contract: Sample.create() defaults updatedAt to createdAt
      - Quality Contribution: Consistent timestamp behavior
      - Worked Example: New sample → createdAt === updatedAt
      */
      const sample = Sample.create({ name: 'Test', description: 'Test' });

      expect(sample.updatedAt.getTime()).toBe(sample.createdAt.getTime());
    });

    it('should use provided createdAt when loading existing sample', () => {
      /*
      Test Doc:
      - Why: Adapter provides createdAt when loading from storage
      - Contract: Sample.create() uses provided createdAt if given
      - Quality Contribution: Enables accurate persistence roundtrip
      - Worked Example: create({ ..., createdAt: pastDate }) → preserves date
      */
      const pastDate = new Date('2025-06-15T10:30:00Z');
      const sample = Sample.create({
        name: 'Loaded Sample',
        description: 'Loaded from storage',
        createdAt: pastDate,
      });

      expect(sample.createdAt).toEqual(pastDate);
    });

    it('should use provided updatedAt when loading existing sample', () => {
      /*
      Test Doc:
      - Why: Adapter provides updatedAt when loading from storage
      - Contract: Sample.create() uses provided updatedAt if given
      - Quality Contribution: Enables accurate persistence roundtrip
      - Worked Example: create({ ..., updatedAt: laterDate }) → preserves date
      */
      const createdDate = new Date('2025-06-15T10:30:00Z');
      const updatedDate = new Date('2025-06-16T14:00:00Z');
      const sample = Sample.create({
        name: 'Updated Sample',
        description: 'Has been updated',
        createdAt: createdDate,
        updatedAt: updatedDate,
      });

      expect(sample.createdAt).toEqual(createdDate);
      expect(sample.updatedAt).toEqual(updatedDate);
    });

    it('should use provided slug when loading existing sample', () => {
      /*
      Test Doc:
      - Why: Adapter provides slug when loading from storage
      - Contract: Sample.create() uses provided slug if given
      - Quality Contribution: Enables accurate persistence roundtrip
      - Worked Example: create({ ..., slug: "custom-slug" }) → preserves slug
      */
      const sample = Sample.create({
        name: 'Different Name',
        description: 'Test',
        slug: 'custom-slug',
      });

      expect(sample.slug).toBe('custom-slug');
    });

    describe('slug generation edge cases', () => {
      it('should handle special characters in name', () => {
        /*
        Test Doc:
        - Why: Slug must be filesystem-safe
        - Contract: Special characters removed or replaced with hyphens
        - Quality Contribution: Prevents invalid file names
        - Worked Example: "My Sample (2023)!" → "my-sample-2023"
        */
        const sample = Sample.create({
          name: 'My Sample (2023)!',
          description: 'Test',
        });
        expect(sample.slug).toBe('my-sample-2023');
      });

      it('should handle names starting with numbers', () => {
        /*
        Test Doc:
        - Why: Slugs must start with a letter per pattern /^[a-z][a-z0-9-]*$/
        - Contract: Names starting with numbers get prefix
        - Quality Contribution: Ensures valid slug pattern
        - Worked Example: "123 Sample" → "n123-sample" or similar
        */
        const sample = Sample.create({ name: '123 Sample', description: 'Test' });
        expect(sample.slug).toMatch(/^[a-z]/); // Must start with letter
        expect(sample.slug).toMatch(/^[a-z][a-z0-9-]*$/); // Must match pattern
      });

      it('should handle Unicode characters', () => {
        /*
        Test Doc:
        - Why: Support international sample names
        - Contract: Unicode converted to ASCII or removed safely
        - Quality Contribution: International user support
        - Worked Example: "Café Sample" → "cafe-sample" or "caf-sample"
        */
        const sample = Sample.create({ name: 'Café Sample', description: 'Test' });
        expect(sample.slug).toMatch(/^[a-z][a-z0-9-]*$/); // ASCII-only slug
      });

      it('should handle names with only special characters', () => {
        /*
        Test Doc:
        - Why: Edge case - name with no alphanumeric content
        - Contract: Should produce fallback slug "sample"
        - Quality Contribution: Robust error handling
        - Worked Example: "!!!" → "sample"
        */
        const sample = Sample.create({ name: '!!!', description: 'Test' });
        expect(sample.slug).toBe('sample');
      });

      it('should handle empty-ish names with whitespace', () => {
        /*
        Test Doc:
        - Why: Edge case - name with only whitespace
        - Contract: Should produce fallback slug
        - Quality Contribution: Robust error handling
        */
        const sample = Sample.create({ name: '   ', description: 'Test' });
        expect(sample.slug).toBe('sample');
      });

      it('should trim leading and trailing hyphens', () => {
        /*
        Test Doc:
        - Why: Slugs shouldn't start/end with hyphens
        - Contract: Leading/trailing special chars removed
        - Quality Contribution: Clean slug output
        - Worked Example: " - My Sample - " → "my-sample"
        */
        const sample = Sample.create({ name: ' - My Sample - ', description: 'Test' });
        expect(sample.slug).not.toMatch(/^-/);
        expect(sample.slug).not.toMatch(/-$/);
      });

      it('should collapse multiple hyphens', () => {
        /*
        Test Doc:
        - Why: Slugs shouldn't have repeated hyphens
        - Contract: Multiple special chars collapse to single hyphen
        - Quality Contribution: Clean slug output
        - Worked Example: "My   Sample" → "my-sample" (not "my---sample")
        */
        const sample = Sample.create({ name: 'My   Sample', description: 'Test' });
        expect(sample.slug).not.toMatch(/--/);
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
      - Worked Example: { slug, name, description, createdAt, updatedAt }
      */
      const sample = Sample.create({ name: 'Test', description: 'Test desc' });
      const json = sample.toJSON();

      expect(json).toHaveProperty('slug');
      expect(json).toHaveProperty('name');
      expect(json).toHaveProperty('description');
      expect(json).toHaveProperty('createdAt');
      expect(json).toHaveProperty('updatedAt');
    });

    it('should serialize Dates to ISO-8601 strings', () => {
      /*
      Test Doc:
      - Why: Dates must be serializable to JSON
      - Contract: toJSON().createdAt and updatedAt are ISO-8601 strings
      - Quality Contribution: Standard date format
      - Worked Example: "2026-01-27T12:00:00.000Z"
      */
      const createdDate = new Date('2026-01-27T12:00:00.000Z');
      const updatedDate = new Date('2026-01-28T14:30:00.000Z');
      const sample = Sample.create({
        name: 'Test',
        description: 'Test',
        createdAt: createdDate,
        updatedAt: updatedDate,
      });
      const json = sample.toJSON();

      expect(json.createdAt).toBe('2026-01-27T12:00:00.000Z');
      expect(json.updatedAt).toBe('2026-01-28T14:30:00.000Z');
      expect(typeof json.createdAt).toBe('string');
      expect(typeof json.updatedAt).toBe('string');
    });

    it('should preserve all field values in toJSON()', () => {
      /*
      Test Doc:
      - Why: Data integrity during serialization
      - Contract: toJSON() preserves all field values
      - Quality Contribution: Accurate persistence
      */
      const sample = Sample.create({
        name: 'My Sample',
        description: 'A detailed description of the sample',
        slug: 'custom-slug',
        createdAt: new Date('2025-06-15T10:30:00Z'),
        updatedAt: new Date('2025-06-16T14:00:00Z'),
      });
      const json = sample.toJSON();

      expect(json.slug).toBe('custom-slug');
      expect(json.name).toBe('My Sample');
      expect(json.description).toBe('A detailed description of the sample');
      expect(json.createdAt).toBe('2025-06-15T10:30:00.000Z');
      expect(json.updatedAt).toBe('2025-06-16T14:00:00.000Z');
    });

    it('should support roundtrip through JSON.stringify/parse', () => {
      /*
      Test Doc:
      - Why: Samples are stored as JSON files
      - Contract: Entity can be serialized and restored via adapter
      - Quality Contribution: Reliable persistence
      - Usage Notes: Adapter uses JSON.parse() then Sample.create()
      */
      const original = Sample.create({
        name: 'Test Sample',
        description: 'Test description',
      });

      // Serialize
      const json = JSON.stringify(original.toJSON());

      // Deserialize (simulating what adapter does)
      const parsed = JSON.parse(json);
      const restored = Sample.create({
        name: parsed.name,
        description: parsed.description,
        slug: parsed.slug,
        createdAt: new Date(parsed.createdAt),
        updatedAt: new Date(parsed.updatedAt),
      });

      expect(restored.slug).toBe(original.slug);
      expect(restored.name).toBe(original.name);
      expect(restored.description).toBe(original.description);
      expect(restored.createdAt.getTime()).toBe(original.createdAt.getTime());
      expect(restored.updatedAt.getTime()).toBe(original.updatedAt.getTime());
    });
  });
});
