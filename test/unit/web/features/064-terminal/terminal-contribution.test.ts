import { terminalContribution } from '@/features/064-terminal/sdk/contribution';
import { describe, expect, it } from 'vitest';

describe('terminal SDK contribution', () => {
  it('enables programming ligatures by default', () => {
    const setting = terminalContribution.settings.find(
      (candidate) => candidate.key === 'terminal.ligatures'
    );

    expect(setting).toBeDefined();
    expect(setting?.ui).toBe('toggle');
    expect(setting?.schema.parse(undefined)).toBe(true);
  });
});
