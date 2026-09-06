import { describe, expect, it } from 'vitest';
import {
  pijRsAddr,
  pijRsStateDir,
  pijSource,
} from '../../../../apps/web/src/features/089-first-class-pij/server/start-pij-poller';

describe('pij-rs source selection', () => {
  it('defaults to rs and retains explicit legacy selection', () => {
    expect(pijSource({})).toBe('rs');
    expect(pijSource({ PIJ_SOURCE: 'legacy' })).toBe('legacy');
    expect(pijSource({ PIJ_SOURCE: 'rs' })).toBe('rs');
    expect(pijSource({ PIJ_SOURCE: 'unexpected' })).toBe('rs');
  });

  it('honours rs transport configuration without changing its defaults', () => {
    expect(pijRsAddr({})).toBe('127.0.0.1:7461');
    expect(pijRsAddr({ PIJ_RS_ADDR: '127.0.0.1:9999' })).toBe('127.0.0.1:9999');
    expect(pijRsStateDir({ PIJ_RS_STATE_DIR: '/scratch/pij-rs' })).toBe('/scratch/pij-rs');
    expect(pijRsStateDir({})).toMatch(/\.pij-rs$/);
  });
});
