import type { HarnessVerb } from '@ai-substrate/engineering-harness/contract';

const boot: HarnessVerb = {
  name: 'boot',
  summary: 'Wraps `just typecheck`.',
  async run(ctx) {
    const started = Date.now();
    const r = await ctx.exec('just', ['typecheck']);
    const durationMs = Date.now() - started;
    const tail = r.stdout.trimEnd().split('\n').slice(-20).join('\n');
    return r.ok
      ? ctx.ok({ command: 'just typecheck', durationMs, stdout: tail })
      : ctx.error('E1', `just typecheck failed (exit ${r.code})`, {
          details: r.stderr,
          next_action: 'Fix the failure above, then re-run `harness boot`.',
        });
  },
};

export default boot;
