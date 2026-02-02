import { generateLineId, generateNodeId } from '@chainglass/positional-graph';
import { describe, expect, it } from 'vitest';

// ============================================
// generateLineId
// ============================================

describe('generateLineId', () => {
  it('returns id matching line-<hex3> format', () => {
    const id = generateLineId([]);
    expect(id).toMatch(/^line-[0-9a-f]{3}$/);
  });

  it('generates unique id not in existingIds', () => {
    const existing = ['line-000', 'line-001', 'line-002'];
    const id = generateLineId(existing);
    expect(existing).not.toContain(id);
  });

  it('generates different ids across multiple calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      ids.add(generateLineId([]));
    }
    // With 4096 possible values, 20 calls should produce at least 2 unique
    expect(ids.size).toBeGreaterThan(1);
  });

  it('avoids collision with existing ids', () => {
    // Fill most of the hex3 space to force collision avoidance
    const existing: string[] = [];
    for (let i = 0; i < 4090; i++) {
      existing.push(`line-${i.toString(16).padStart(3, '0')}`);
    }
    const id = generateLineId(existing);
    expect(id).toMatch(/^line-[0-9a-f]{3}$/);
    expect(existing).not.toContain(id);
  });
});

// ============================================
// generateNodeId
// ============================================

describe('generateNodeId', () => {
  it('returns id matching <slug>-<hex3> format', () => {
    const id = generateNodeId('sample-coder', []);
    expect(id).toMatch(/^sample-coder-[0-9a-f]{3}$/);
  });

  it('generates unique id not in existingIds', () => {
    const existing = ['sample-coder-000', 'sample-coder-001'];
    const id = generateNodeId('sample-coder', existing);
    expect(existing).not.toContain(id);
  });

  it('uses the provided slug as prefix', () => {
    const id = generateNodeId('research-concept', []);
    expect(id.startsWith('research-concept-')).toBe(true);
  });

  it('generates hex3 suffix (3 lowercase hex chars)', () => {
    const id = generateNodeId('test-unit', []);
    const suffix = id.slice('test-unit-'.length);
    expect(suffix).toMatch(/^[0-9a-f]{3}$/);
  });

  it('avoids collision with existing ids', () => {
    const existing: string[] = [];
    for (let i = 0; i < 4090; i++) {
      existing.push(`my-unit-${i.toString(16).padStart(3, '0')}`);
    }
    const id = generateNodeId('my-unit', existing);
    expect(id).toMatch(/^my-unit-[0-9a-f]{3}$/);
    expect(existing).not.toContain(id);
  });

  it('throws on max attempts exceeded', () => {
    // Fill the entire hex3 space
    const existing: string[] = [];
    for (let i = 0; i < 4096; i++) {
      existing.push(`full-unit-${i.toString(16).padStart(3, '0')}`);
    }
    expect(() => generateNodeId('full-unit', existing)).toThrow();
  });
});
