// @vitest-environment node
import { createCommandExecutor } from '@/features/064-terminal/server/exec-command';
import { describe, expect, it } from 'vitest';

describe('terminal sidecar command runner', () => {
  it('gives up on a command that outlives its timeout, naming the command', async () => {
    const exec = createCommandExecutor(100);
    const started = Date.now();
    await expect(exec('sleep', ['5'])).rejects.toThrow('sleep 5 timed out after 100ms');
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('passes argv through without a shell and returns stdout', async () => {
    const exec = createCommandExecutor();
    expect(await exec('printf', ['%s|', 'a b', '$(echo no)'])).toBe('a b|$(echo no)|');
  });
});
