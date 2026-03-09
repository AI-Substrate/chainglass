import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the dependencies before importing diagnose
vi.mock('../../../src/docker/lifecycle.js', () => ({
  isDockerAvailable: vi.fn(),
  isContainerRunning: vi.fn(),
  getContainerAge: vi.fn(),
  getContainerLogs: vi.fn(),
}));

vi.mock('../../../src/health/probe.js', () => ({
  probeApp: vi.fn(),
  probeMcp: vi.fn(),
  probeTerminal: vi.fn(),
  probeCdp: vi.fn(),
}));

vi.mock('../../../src/ports/allocator.js', () => ({
  computePorts: vi.fn(() => ({
    app: 3159, terminal: 4659, cdp: 9281, slot: 59, worktree: '066-wf-real-agents',
  })),
}));

import { diagnose, formatStderr } from '../../../src/doctor/diagnose.js';
import { isDockerAvailable, isContainerRunning, getContainerAge, getContainerLogs } from '../../../src/docker/lifecycle.js';
import { probeApp, probeMcp, probeTerminal, probeCdp } from '../../../src/health/probe.js';

const mockDocker = vi.mocked(isDockerAvailable);
const mockContainer = vi.mocked(isContainerRunning);
const mockAge = vi.mocked(getContainerAge);
const mockLogs = vi.mocked(getContainerLogs);
const mockApp = vi.mocked(probeApp);
const mockMcp = vi.mocked(probeMcp);
const mockTerminal = vi.mocked(probeTerminal);
const mockCdp = vi.mocked(probeCdp);

function setAllHealthy() {
  mockDocker.mockResolvedValue(true);
  mockContainer.mockResolvedValue(true);
  mockAge.mockResolvedValue(600);
  mockLogs.mockResolvedValue('');
  mockApp.mockResolvedValue({ status: 'up', code: '200' });
  mockMcp.mockResolvedValue({ status: 'up', code: '406' });
  mockTerminal.mockResolvedValue({ status: 'up' });
  mockCdp.mockResolvedValue({ status: 'up', browser: 'Chrome/136' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Doctor diagnostic cascade', () => {
  it('Layer 0: reports Docker not running with orbctl fix', async () => {
    /*
    Test Doc:
    - Why: Docker unavailable is the most common cold-start failure.
    - Contract: diagnose() returns layer=prerequisites, fix=orbctl start.
    - Usage Notes: Mocks isDockerAvailable to false.
    - Quality Contribution: Validates the cascade stops early and gives actionable fix.
    - Worked Example: diagnose() → {healthy:false, layer:"prerequisites", action:"orbctl start"}
    */
    mockDocker.mockResolvedValue(false);
    const result = await diagnose();
    expect(result.healthy).toBe(false);
    expect(result.layer).toBe('prerequisites');
    expect(result.checks.find((c) => c.name === 'docker')?.fix).toBe('orbctl start');
    // Should NOT have checked container or app
    expect(mockContainer).not.toHaveBeenCalled();
    expect(mockApp).not.toHaveBeenCalled();
  });

  it('Layer 2: reports container not running with just harness dev fix', async () => {
    /*
    Test Doc:
    - Why: Missing container is the next most common failure after Docker.
    - Contract: diagnose() returns layer=container with fix="just harness dev".
    - Usage Notes: Docker is up but container is missing.
    - Quality Contribution: Validates layer progression and skip logic.
    - Worked Example: diagnose() → {layer:"container", action:"just harness dev"}
    */
    mockDocker.mockResolvedValue(true);
    mockContainer.mockResolvedValue(false);
    mockLogs.mockResolvedValue('some error log');
    const result = await diagnose();
    expect(result.healthy).toBe(false);
    expect(result.layer).toBe('container');
    expect(result.action).toBe('just harness dev');
    // Should NOT have checked app
    expect(mockApp).not.toHaveBeenCalled();
  });

  it('Layer 2: warns when container is young (cold booting)', async () => {
    /*
    Test Doc:
    - Why: Cold boot takes 2-3 min; doctor should say "wait" not "broken".
    - Contract: Container age < 180s → warn status with wait guidance.
    - Usage Notes: Container running but young.
    - Quality Contribution: Prevents agents from treating cold boot as failure.
    - Worked Example: age=45 → check.status="warn", message contains "cold-booting"
    */
    setAllHealthy();
    mockAge.mockResolvedValue(45);
    const result = await diagnose();
    const ageCheck = result.checks.find((c) => c.name === 'container-age');
    expect(ageCheck?.status).toBe('warn');
    expect(ageCheck?.message).toContain('45s');
  });

  it('Layer 3: reports app down with context-aware fix', async () => {
    /*
    Test Doc:
    - Why: App down could be cold boot or actual failure — fix differs.
    - Contract: App down + young container → "still building"; old container → "check logs".
    - Usage Notes: Tests the age-aware messaging.
    - Quality Contribution: Gives agents the right next action based on container age.
    - Worked Example: app down + age=60 → fix="just harness doctor --wait"
    */
    setAllHealthy();
    mockApp.mockResolvedValue({ status: 'down', code: '0' });
    mockAge.mockResolvedValue(60);
    const result = await diagnose();
    expect(result.healthy).toBe(false);
    expect(result.layer).toBe('application');
    const appCheck = result.checks.find((c) => c.name === 'app');
    expect(appCheck?.fix).toContain('doctor --wait');
  });

  it('Layer 4: reports BOTH terminal and CDP down in one pass', async () => {
    /*
    Test Doc:
    - Why: DYK #2 — report all failures within a layer, not just the first.
    - Contract: Both terminal and CDP down → both appear in checks with fixes.
    - Usage Notes: This tests the "all failures within layer" design decision.
    - Quality Contribution: Saves agents from doctor→fix→doctor→fix loops.
    - Worked Example: terminal down + cdp down → 2 fail checks in services layer
    */
    setAllHealthy();
    mockTerminal.mockResolvedValue({ status: 'down' });
    mockCdp.mockResolvedValue({ status: 'down', browser: null });
    const result = await diagnose();
    expect(result.healthy).toBe(false);
    expect(result.layer).toBe('services');
    const failures = result.checks.filter((c) => c.status === 'fail');
    expect(failures.length).toBe(2);
    expect(failures.map((f) => f.name)).toContain('terminal');
    expect(failures.map((f) => f.name)).toContain('cdp');
  });

  it('Layer 5: reports healthy with endpoint URLs', async () => {
    /*
    Test Doc:
    - Why: The happy path must include endpoint URLs so agents know where to connect.
    - Contract: All healthy → layer=ready, summary contains port numbers.
    - Usage Notes: Full mock of all services up.
    - Quality Contribution: Validates the complete cascade produces actionable output.
    - Worked Example: diagnose() → {healthy:true, layer:"ready", summary contains ":3159"}
    */
    setAllHealthy();
    const result = await diagnose();
    expect(result.healthy).toBe(true);
    expect(result.layer).toBe('ready');
    expect(result.summary).toContain('3159');
    expect(result.summary).toContain('9281');
    expect(result.summary).toContain('4659');
  });

  it('formatStderr produces readable output with icons', async () => {
    /*
    Test Doc:
    - Why: Human-readable stderr is critical for debugging.
    - Contract: formatStderr includes ✓/✗/⏳ icons and fix suggestions.
    - Usage Notes: Tests the formatting, not the cascade logic.
    - Quality Contribution: Catches formatting regressions.
    - Worked Example: formatStderr({checks:[{status:"pass",message:"Docker running"}]}) → "  ✓ Docker running"
    */
    setAllHealthy();
    const result = await diagnose();
    const stderr = formatStderr(result);
    expect(stderr).toContain('✓');
    expect(stderr).toContain('Docker running');
    expect(stderr).toContain('App responding');
  });
});
