/**
 * markdown-frontmatter Tests — Phase 4 / T002 + T003 (TDD).
 *
 * Pure-function YAML front-matter split/join for the WYSIWYG editor.
 * Finding 03 (Critical): a bug here = silent user data loss.
 *
 * Invariant (documented on splitFrontMatter / joinFrontMatter):
 *   For ALL inputs x:  split(x).frontMatter + split(x).body === x
 *   For well-formed (fm, body) pairs: split(join(fm, body)) === { frontMatter: fm, body }
 *
 * Constitution §3 (TDD), §4/§7 (no mocks, no vi.fn, no vi.spyOn).
 */

import { describe, expect, it } from 'vitest';

import {
  joinFrontMatter,
  splitFrontMatter,
} from '../../../../../../apps/web/src/features/_platform/viewer/lib/markdown-frontmatter';

// -----------------------------------------------------------------------------
// splitFrontMatter
// -----------------------------------------------------------------------------

describe('splitFrontMatter — happy path', () => {
  it('(1) splits a well-formed YAML front-matter doc', () => {
    const input = '---\nkey: value\n---\nbody';
    expect(splitFrontMatter(input)).toEqual({
      frontMatter: '---\nkey: value\n---\n',
      body: 'body',
    });
  });
});

describe('splitFrontMatter — absence / passthrough', () => {
  it('(2) passes through when there is no front-matter', () => {
    const input = '# Just Markdown\n\nbody text\n';
    expect(splitFrontMatter(input)).toEqual({ frontMatter: '', body: input });
  });

  it('(3) passes through when the open fence has no close fence', () => {
    const input = '---\nno close fence here\nmore body\n';
    expect(splitFrontMatter(input)).toEqual({ frontMatter: '', body: input });
  });

  it('(11) passes through when file is "---" + one non-close line (malformed 2-line)', () => {
    const input = '---\nnot a close';
    expect(splitFrontMatter(input)).toEqual({ frontMatter: '', body: input });
  });

  it('(8) handles empty string', () => {
    expect(splitFrontMatter('')).toEqual({ frontMatter: '', body: '' });
  });

  it('(9) handles whitespace-only input (no front-matter)', () => {
    expect(splitFrontMatter('   \n  \n')).toEqual({
      frontMatter: '',
      body: '   \n  \n',
    });
  });
});

describe('splitFrontMatter — body containing fence-like tokens', () => {
  it('(4) returns frontMatter ending at FIRST close; later "---" in body is left in body', () => {
    // Once the open fence at line 0 is matched with the close at line 2,
    // any subsequent "---" (here, inside a fenced code block in the body) stays in body.
    const input = '---\nkey: value\n---\n```\n---\n```\nmore';
    const out = splitFrontMatter(input);
    expect(out.frontMatter).toBe('---\nkey: value\n---\n');
    expect(out.body).toBe('```\n---\n```\nmore');
    expect(out.frontMatter + out.body).toBe(input);
  });

  it('(15) setext-heading "---" in body must NOT be treated as a second close', () => {
    const input = '---\nkey: value\n---\nHeading\n---\nnot a close fence';
    const out = splitFrontMatter(input);
    expect(out.frontMatter).toBe('---\nkey: value\n---\n');
    expect(out.body).toBe('Heading\n---\nnot a close fence');
  });
});

describe('splitFrontMatter — CRLF and BOM', () => {
  it('(5) preserves CRLF line endings byte-for-byte', () => {
    const input = '---\r\nkey: v\r\n---\r\nbody';
    expect(splitFrontMatter(input)).toEqual({
      frontMatter: '---\r\nkey: v\r\n---\r\n',
      body: 'body',
    });
  });

  it('(6) preserves a leading UTF-8 BOM inside frontMatter', () => {
    const input = '\ufeff---\nkey: v\n---\nbody';
    expect(splitFrontMatter(input)).toEqual({
      frontMatter: '\ufeff---\nkey: v\n---\n',
      body: 'body',
    });
  });

  it('(13) preserves BOM + CRLF combined (hostile cross-platform case)', () => {
    const input = '\ufeff---\r\nk: v\r\n---\r\nbody';
    expect(splitFrontMatter(input)).toEqual({
      frontMatter: '\ufeff---\r\nk: v\r\n---\r\n',
      body: 'body',
    });
  });
});

describe('splitFrontMatter — fm-only / empty-body edge cases', () => {
  it('(7) front-matter-only file with trailing newline after close', () => {
    const input = '---\nfoo: bar\n---\n';
    expect(splitFrontMatter(input)).toEqual({
      frontMatter: '---\nfoo: bar\n---\n',
      body: '',
    });
  });

  it('(16) close fence with no trailing newline at EOF', () => {
    const input = '---\nk: v\n---';
    expect(splitFrontMatter(input)).toEqual({
      frontMatter: '---\nk: v\n---',
      body: '',
    });
  });

  it('(10) "---\\n---\\n" immediate close (empty front-matter body) with body after', () => {
    const input = '---\n---\nbody';
    expect(splitFrontMatter(input)).toEqual({
      frontMatter: '---\n---\n',
      body: 'body',
    });
  });

  it('(14) blank line after close fence is retained in body', () => {
    const input = '---\nk: v\n---\n\nbody';
    expect(splitFrontMatter(input)).toEqual({
      frontMatter: '---\nk: v\n---\n',
      body: '\nbody',
    });
  });
});

describe('splitFrontMatter — scan cap', () => {
  it('(12) does NOT find a close fence beyond the 500-line scan cap', () => {
    const padding = 'x\n'.repeat(501); // 501 non-close lines after the open
    const input = `---\n${padding}---\nbody`;
    expect(splitFrontMatter(input)).toEqual({ frontMatter: '', body: input });
  });

  it('finds a close fence at exactly the 500-line cap', () => {
    // Line 0 = '---' (open), lines 1..499 = 'x', line 500 = '---' (close).
    const padding = 'x\n'.repeat(499);
    const input = `---\n${padding}---\nbody`;
    const out = splitFrontMatter(input);
    expect(out.frontMatter.startsWith('---\n')).toBe(true);
    expect(out.frontMatter.endsWith('---\n')).toBe(true);
    expect(out.body).toBe('body');
    expect(out.frontMatter + out.body).toBe(input);
  });
});

describe('splitFrontMatter — round-trip invariant (forward)', () => {
  it('invariant: split(x).frontMatter + split(x).body === x for all samples', () => {
    const samples = [
      '',
      '# plain\n',
      '---\nkey: value\n---\nbody',
      '---\nfoo: bar\n---\n',
      '---\nk: v\n---',
      '---\nk: v\n---\n\nbody',
      '---\r\nk: v\r\n---\r\nbody',
      '\ufeff---\nk: v\n---\nbody',
      '\ufeff---\r\nk: v\r\n---\r\nbody',
      '---\n---\nbody',
      '---\nkey: value\n---\nHeading\n---\nnot a close',
    ];
    for (const s of samples) {
      const { frontMatter, body } = splitFrontMatter(s);
      expect(frontMatter + body).toBe(s);
    }
  });
});

// -----------------------------------------------------------------------------
// joinFrontMatter
// -----------------------------------------------------------------------------

describe('joinFrontMatter — basic', () => {
  it('empty fm + body → body unchanged', () => {
    expect(joinFrontMatter('', 'hello world')).toBe('hello world');
  });

  it('empty fm + empty body → empty string', () => {
    expect(joinFrontMatter('', '')).toBe('');
  });

  it('non-empty fm + empty body → fm unchanged', () => {
    expect(joinFrontMatter('---\nfoo: bar\n---\n', '')).toBe('---\nfoo: bar\n---\n');
  });

  it('non-empty both → simple concatenation (no separator added)', () => {
    expect(joinFrontMatter('---\nk: v\n---\n', 'body')).toBe('---\nk: v\n---\nbody');
  });
});

describe('joinFrontMatter — forward round-trip over corpus', () => {
  // Hand-picked samples covering every structural edge case we expect to see in real
  // markdown files inside this repo and elsewhere. The corpus is intentionally
  // small (7 samples) — table-driven coverage, no `fast-check` library installed.
  const samples: Array<[string, string]> = [
    ['plain markdown, no fm', '# Plain\n\nparagraph text\n'],
    ['happy YAML', '---\nkey: value\n---\nbody text\n'],
    ['CRLF YAML', '---\r\nkey: v\r\n---\r\nbody\r\n'],
    ['BOM-prefixed YAML', '\ufeff---\ntitle: Test\n---\nbody\n'],
    ['empty string', ''],
    ['fm-only', '---\nfoo: bar\n---\n'],
    ['blank line after close fence', '---\nk: v\n---\n\nbody paragraph\n'],
  ];

  it.each(samples)('forward round-trip: %s', (_label, sample) => {
    const { frontMatter, body } = splitFrontMatter(sample);
    expect(joinFrontMatter(frontMatter, body)).toBe(sample);
  });
});

describe('joinFrontMatter — reverse round-trip over well-formed pairs', () => {
  // Reverse invariant is conditional: split(join(fm, body)) only round-trips when
  // (a) fm is either '' or ends with a proper close-fence marker, and
  // (b) body does not itself open with another `---\n...` that could be mis-parsed.
  // We intentionally pick pairs that satisfy both.
  const pairs: Array<[string, string, string]> = [
    ['no fm', '', 'hello\nworld\n'],
    ['happy fm', '---\nk: v\n---\n', 'body\n'],
    ['fm with blank-line body', '---\nk: v\n---\n', '\nbody paragraph\n'],
    ['fm-only', '---\nfoo: bar\n---\n', ''],
    ['CRLF fm', '---\r\nk: v\r\n---\r\n', 'body\r\n'],
  ];

  it.each(pairs)('reverse round-trip: %s', (_label, fm, body) => {
    const joined = joinFrontMatter(fm, body);
    const reSplit = splitFrontMatter(joined);
    expect(reSplit).toEqual({ frontMatter: fm, body });
  });
});
