import { describe, expect, it } from 'vitest';
import { parseMetaOptions } from '../../../../apps/cli/src/features/034-agentic-cli/parse-meta-options.js';

describe('parseMetaOptions', () => {
  it('returns undefined for no meta', () => {
    expect(parseMetaOptions()).toBeUndefined();
    expect(parseMetaOptions([])).toBeUndefined();
  });

  it('parses single key=value', () => {
    expect(parseMetaOptions(['env=production'])).toEqual({ env: 'production' });
  });

  it('parses multiple metas', () => {
    expect(parseMetaOptions(['a=1', 'b=2'])).toEqual({ a: '1', b: '2' });
  });

  it('handles empty value (key=)', () => {
    expect(parseMetaOptions(['key='])).toEqual({ key: '' });
  });

  it('handles value with equals (key=a=b)', () => {
    expect(parseMetaOptions(['key=a=b'])).toEqual({ key: 'a=b' });
  });

  it('throws on invalid format (no equals)', () => {
    expect(() => parseMetaOptions(['invalid'])).toThrow(/Invalid --meta format/);
  });
});
