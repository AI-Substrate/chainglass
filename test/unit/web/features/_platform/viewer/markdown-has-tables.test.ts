/**
 * markdown-has-tables Tests — Phase 4 / T004 (TDD).
 *
 * GFM table detection for the Rich-mode warn banner (AC-11).
 * Strict detector: requires a pipe-bordered header row immediately followed
 * by a separator row with at least one `-`. Ignores fenced-code tables.
 *
 * Rationale: the banner is dismissible (plan AC-11), so false positives
 * (over-warning) hurt user trust more than false negatives (silent miss).
 * Bias toward strict.
 *
 * Constitution §3/§4/§7 — TDD, pure in/out, no mocks.
 */

import { describe, expect, it } from 'vitest';

import { hasTables } from '../../../../../../apps/web/src/features/_platform/viewer/lib/markdown-has-tables';

describe('hasTables — positive detection', () => {
  it('(1) detects a classic GFM table (header + separator)', () => {
    expect(hasTables('| a | b |\n|---|---|')).toBe(true);
  });

  it('(9) detects a single-column table', () => {
    expect(hasTables('| a |\n|---|')).toBe(true);
  });

  it('(4) detects a table appearing after YAML front-matter', () => {
    const md = '---\ntitle: doc\n---\n\n| a | b |\n|---|---|\nrow\n';
    expect(hasTables(md)).toBe(true);
  });

  it('(10) detects a table with CRLF line endings', () => {
    expect(hasTables('| a | b |\r\n|---|---|')).toBe(true);
  });

  it('(11) detects a table at end of file with no trailing newline', () => {
    expect(hasTables('text before\n| a | b |\n|---|---|')).toBe(true);
  });

  it('(7) detects a table with up to 3 leading spaces', () => {
    expect(hasTables('   | a | b |\n   |---|---|')).toBe(true);
  });

  it('(13) detects a table with alignment colons in the separator row', () => {
    expect(hasTables('| a | b | c |\n|:---|---:|:---:|')).toBe(true);
  });
});

describe('hasTables — negative / strict rejections', () => {
  it('(2) returns false on plain text with no pipes', () => {
    expect(hasTables('just some prose with no tables at all.\n')).toBe(false);
  });

  it('(5) returns false on pipe-containing prose (no separator row)', () => {
    expect(hasTables('| a | b is my favorite character |\nmore prose\n')).toBe(false);
  });

  it('(6) returns false when separator row appears BEFORE header row (reversed)', () => {
    expect(hasTables('|---|---|\n| a | b |')).toBe(false);
  });

  it('(3) returns false when a "table" is inside a triple-backtick fenced code block', () => {
    const md = 'before\n\n```\n| a | b |\n|---|---|\n```\n\nafter\n';
    expect(hasTables(md)).toBe(false);
  });

  it('(8) returns false when a "table" is inside a tilde-fenced code block', () => {
    const md = 'before\n\n~~~\n| a | b |\n|---|---|\n~~~\n\nafter\n';
    expect(hasTables(md)).toBe(false);
  });

  it('(12) returns false when a "table" is indented by 4+ spaces (CommonMark code block)', () => {
    const md = 'text\n\n    | a | b |\n    |---|---|\n\nafter\n';
    expect(hasTables(md)).toBe(false);
  });

  it('(14) returns false when backticks appear inside an open tilde fence (nested fence-type pairing)', () => {
    // The ```` ``` ```` line inside a ~~~ fence does NOT close the ~~~ fence.
    // So the table remains fenced and must NOT be detected.
    const md = '~~~\n```\n| a | b |\n|---|---|\n```\n~~~\n';
    expect(hasTables(md)).toBe(false);
  });

  it('returns false on empty input', () => {
    expect(hasTables('')).toBe(false);
  });

  it('returns false on a single-line input (no "next line" for separator)', () => {
    expect(hasTables('| a | b |')).toBe(false);
  });
});

describe('hasTables — boundary conditions', () => {
  it('returns true when table appears after multiple intervening paragraphs', () => {
    const md = '# Title\n\nSome paragraph.\n\nAnother paragraph.\n\n| a | b |\n|---|---|\nrow\n';
    expect(hasTables(md)).toBe(true);
  });

  it('returns false for a header-like line followed by a non-separator line', () => {
    // The header regex permits `| anything |` — including `|-|` — but the
    // separator check requires the NEXT line to match the separator pattern
    // AND contain a dash. "| just prose |" does neither.
    expect(hasTables('| header cell |\n| just prose |')).toBe(false);
  });
});
