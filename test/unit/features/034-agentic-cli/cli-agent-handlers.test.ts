import { beforeEach, describe, expect, it } from 'vitest';
import { handleAgentCompact } from '../../../../apps/cli/src/features/034-agentic-cli/agent-compact-handler.js';
import { handleAgentRun } from '../../../../apps/cli/src/features/034-agentic-cli/agent-run-handler.js';
import { FakeAgentManagerService } from '../../../../packages/shared/src/features/034-agentic-cli/fakes/fake-agent-manager-service.js';

describe('handleAgentRun', () => {
  let manager: FakeAgentManagerService;
  let output: string[];

  beforeEach(() => {
    manager = new FakeAgentManagerService();
    output = [];
  });

  const write = (s: string) => {
    output.push(s);
  };

  const baseDeps = () => ({
    agentManager: manager,
    write,
  });

  // ── Instance creation (AC-29, AC-30) ──────────────

  it('creates via getNew when no --session (AC-29)', async () => {
    await handleAgentRun({ type: 'claude-code', prompt: 'hello' }, baseDeps());
    const agents = manager.getCreatedAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0]?.getRunHistory()).toHaveLength(1);
    expect(agents[0]?.getRunHistory()[0]?.prompt).toBe('hello');
  });

  it('creates via getWithSessionId when --session (AC-30)', async () => {
    await handleAgentRun({ type: 'claude-code', prompt: 'hello', session: 'ses-1' }, baseDeps());
    // Same-instance guarantee: getWithSessionId again returns same object
    const same = manager.getWithSessionId('ses-1', {
      name: 'x',
      type: 'claude-code',
      workspace: '/tmp',
    });
    const agents = manager.getCreatedAgents();
    expect(same).toBe(agents[0]); // proves getWithSessionId path was used
  });

  // ── Output modes (DYK-P3#1, AC-31, AC-32) ────────

  it('no event handler attached by default (JSON-only per DYK-P3#1)', async () => {
    await handleAgentRun({ type: 'claude-code', prompt: 'hello' }, baseDeps());
    // Result is output as JSON
    expect(output.length).toBeGreaterThan(0);
    const lastOutput = output[output.length - 1] ?? '';
    expect(() => JSON.parse(lastOutput)).not.toThrow();
  });

  it('attaches verbose handler when --verbose (AC-31)', async () => {
    // FakeAgentInstance emits events configured on the manager's default options
    const mgr = new FakeAgentManagerService({
      defaultInstanceOptions: {
        events: [
          { type: 'text_delta', timestamp: new Date().toISOString(), data: { content: 'hi' } },
        ],
      },
    });
    await handleAgentRun(
      { type: 'claude-code', prompt: 'hello', verbose: true },
      { agentManager: mgr, write }
    );
    // Verbose handler should have written event output with [name] prefix
    const allOutput = output.join('');
    expect(allOutput).toContain('[agent-claude-code]');
  });

  it('no event output when --quiet', async () => {
    await handleAgentRun({ type: 'claude-code', prompt: 'hello', quiet: true }, baseDeps());
    // Quiet mode: no result output at all
    expect(output).toHaveLength(0);
  });

  // ── Mutual exclusivity (DYK-P3#2) ────────────────

  it('rejects when --stream and --verbose both set', async () => {
    await expect(
      handleAgentRun(
        { type: 'claude-code', prompt: 'hello', stream: true, verbose: true },
        baseDeps()
      )
    ).rejects.toThrow(/Cannot combine/);
  });

  it('rejects when --stream and --quiet both set', async () => {
    await expect(
      handleAgentRun(
        { type: 'claude-code', prompt: 'hello', stream: true, quiet: true },
        baseDeps()
      )
    ).rejects.toThrow(/Cannot combine/);
  });

  // ── Session ID and exit code (AC-33, AC-34) ──────

  it('outputs result JSON containing sessionId (AC-33)', async () => {
    const { result } = await handleAgentRun({ type: 'claude-code', prompt: 'hello' }, baseDeps());
    expect(result.sessionId).toBeTruthy();
  });

  it('returns exit code 0 on completed (AC-34)', async () => {
    const { exitCode } = await handleAgentRun({ type: 'claude-code', prompt: 'hello' }, baseDeps());
    expect(exitCode).toBe(0);
  });

  it('returns exit code 1 on failed', async () => {
    const mgr = new FakeAgentManagerService({
      defaultInstanceOptions: {
        runResult: { output: '', sessionId: 'ses-1', status: 'failed', exitCode: 1, tokens: null },
      },
    });
    const { exitCode } = await handleAgentRun(
      { type: 'claude-code', prompt: 'hello' },
      { agentManager: mgr, write }
    );
    expect(exitCode).toBe(1);
  });

  // ── Metadata and name (--meta, --name) ────────────

  it('passes --meta to instance metadata', async () => {
    await handleAgentRun(
      { type: 'claude-code', prompt: 'hello', meta: ['env=prod', 'run=42'] },
      baseDeps()
    );
    const agents = manager.getCreatedAgents();
    expect(agents[0]?.metadata).toEqual({ env: 'prod', run: '42' });
  });

  it('passes --name to instance name', async () => {
    await handleAgentRun({ type: 'claude-code', prompt: 'hello', name: 'my-agent' }, baseDeps());
    const agents = manager.getCreatedAgents();
    expect(agents[0]?.name).toBe('my-agent');
  });

  it('defaults name to agent-<type>', async () => {
    await handleAgentRun({ type: 'claude-code', prompt: 'hello' }, baseDeps());
    const agents = manager.getCreatedAgents();
    expect(agents[0]?.name).toBe('agent-claude-code');
  });

  // ── Validation ────────────────────────────────────

  it('throws on invalid agent type', async () => {
    await expect(handleAgentRun({ type: 'invalid', prompt: 'hello' }, baseDeps())).rejects.toThrow(
      /Invalid agent type/
    );
  });

  it('throws when no prompt provided', async () => {
    await expect(handleAgentRun({ type: 'claude-code' }, baseDeps())).rejects.toThrow(
      /--prompt or --prompt-file/
    );
  });
});

describe('handleAgentCompact', () => {
  let manager: FakeAgentManagerService;
  let output: string[];

  beforeEach(() => {
    manager = new FakeAgentManagerService();
    output = [];
  });

  const write = (s: string) => {
    output.push(s);
  };

  it('uses getWithSessionId (AC-34a)', async () => {
    await handleAgentCompact(
      { type: 'claude-code', session: 'ses-1' },
      { agentManager: manager, write }
    );
    const agents = manager.getCreatedAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0]?.sessionId).toBe('ses-1');
  });

  it('calls compact on instance (AC-34b)', async () => {
    await handleAgentCompact(
      { type: 'claude-code', session: 'ses-1' },
      { agentManager: manager, write }
    );
    const agents = manager.getCreatedAgents();
    agents[0]?.assertCompactCalled();
  });

  it('returns exit code 0 on completed', async () => {
    const { exitCode } = await handleAgentCompact(
      { type: 'claude-code', session: 'ses-1' },
      { agentManager: manager, write }
    );
    expect(exitCode).toBe(0);
  });

  it('outputs result JSON', async () => {
    await handleAgentCompact(
      { type: 'claude-code', session: 'ses-1' },
      { agentManager: manager, write }
    );
    expect(output.length).toBeGreaterThan(0);
    expect(() => JSON.parse(output[0] ?? '')).not.toThrow();
  });

  it('quiet mode suppresses output', async () => {
    await handleAgentCompact(
      { type: 'claude-code', session: 'ses-1', quiet: true },
      { agentManager: manager, write }
    );
    expect(output).toHaveLength(0);
  });
});
