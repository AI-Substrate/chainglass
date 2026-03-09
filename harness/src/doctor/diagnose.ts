/**
 * Diagnostic cascade — imperative checks like `flutter doctor`.
 *
 * Runs layered checks from infrastructure up:
 *   Layer 0: Prerequisites (Docker, harness deps)
 *   Layer 1: Ports (.env vs computed port mismatch)
 *   Layer 2: Container (exists, running, age)
 *   Layer 3: Application (app, MCP)
 *   Layer 4: Services (terminal, CDP)
 *   Layer 5: Ready
 *
 * Stops at the first failing LAYER, but reports ALL failures within that layer.
 * Every failure includes an exact fix command.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  isDockerAvailable,
  isContainerRunning,
  getContainerAge,
  getContainerLogs,
} from '../docker/lifecycle.js';
import { probeApp, probeMcp, probeTerminal, probeCdp } from '../health/probe.js';
import { computePorts, type HarnessPorts } from '../ports/allocator.js';

const HARNESS_ROOT = path.resolve(import.meta.dirname ?? '.', '../..');

export interface DoctorCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'skip';
  message: string;
  fix?: string;
  detail?: string;
}

export interface DoctorResult {
  healthy: boolean;
  layer: 'prerequisites' | 'ports' | 'container' | 'application' | 'services' | 'ready';
  checks: DoctorCheck[];
  summary: string;
  action?: string;
  ports: HarnessPorts;
}

function check(
  name: string,
  status: DoctorCheck['status'],
  message: string,
  fix?: string,
  detail?: string,
): DoctorCheck {
  return { name, status, message, ...(fix && { fix }), ...(detail && { detail }) };
}

function hasFailures(checks: DoctorCheck[]): boolean {
  return checks.some((c) => c.status === 'fail');
}

function hasWarnings(checks: DoctorCheck[]): boolean {
  return checks.some((c) => c.status === 'warn');
}

function firstFix(checks: DoctorCheck[]): string | undefined {
  return checks.find((c) => c.fix)?.fix;
}

export async function diagnose(): Promise<DoctorResult> {
  const ports = computePorts();
  const checks: DoctorCheck[] = [];

  // --- Layer 0: Prerequisites ---

  const dockerOk = await isDockerAvailable();
  if (dockerOk) {
    checks.push(check('docker', 'pass', 'Docker running'));
  } else {
    checks.push(check('docker', 'fail', 'Docker is not running', 'orbctl start'));
  }

  const nodeModulesExist = existsSync(path.join(HARNESS_ROOT, 'node_modules'));
  if (nodeModulesExist) {
    checks.push(check('harness-deps', 'pass', 'Harness dependencies installed'));
  } else {
    checks.push(check('harness-deps', 'fail', 'Harness dependencies not installed', 'just harness-install'));
  }

  if (hasFailures(checks)) {
    return {
      healthy: false,
      layer: 'prerequisites',
      checks,
      summary: checks.filter((c) => c.status === 'fail').map((c) => c.message).join('. '),
      action: firstFix(checks),
      ports,
    };
  }

  // --- Layer 1: Port configuration ---

  const envPath = path.join(HARNESS_ROOT, '.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    const envAppPort = envContent.match(/HARNESS_APP_PORT=(\d+)/)?.[1];
    if (envAppPort && Number(envAppPort) !== ports.app) {
      checks.push(check(
        'ports',
        'warn',
        `Port mismatch: .env has app port ${envAppPort} but this worktree (${ports.worktree}) expects ${ports.app}`,
        'just harness dev',
        'The .env file was written by a different worktree or an old run. Running "just harness dev" will regenerate it.',
      ));
    } else {
      checks.push(check('ports', 'pass', `Ports: app=${ports.app} terminal=${ports.terminal} cdp=${ports.cdp}`));
    }
  } else {
    checks.push(check(
      'ports',
      'warn',
      'No .env file found — docker compose will use fallback ports which may not match this worktree',
      'just harness dev',
      'Running "just harness dev" will generate .env with the correct ports for this worktree.',
    ));
  }

  if (hasFailures(checks)) {
    return {
      healthy: false,
      layer: 'ports',
      checks,
      summary: checks.filter((c) => c.status === 'fail').map((c) => c.message).join('. '),
      action: firstFix(checks),
      ports,
    };
  }

  // --- Layer 2: Container ---

  const containerRunning = await isContainerRunning();
  if (!containerRunning) {
    const logs = await getContainerLogs(5);
    checks.push(check(
      'container',
      'fail',
      `No running harness container found (chainglass-${ports.worktree})`,
      'just harness dev',
      logs.trim() ? `Last logs:\n${logs.trim().slice(-300)}` : undefined,
    ));
    return {
      healthy: false,
      layer: 'container',
      checks,
      summary: `No running harness container. Run: just harness dev`,
      action: 'just harness dev',
      ports,
    };
  }

  checks.push(check('container', 'pass', `Container running (chainglass-${ports.worktree})`));

  const age = await getContainerAge();
  if (age !== null && age < 180) {
    checks.push(check(
      'container-age',
      'warn',
      `Container started ${age}s ago — may still be cold-booting (deps install + build takes ~2-3 min)`,
      'just harness doctor --wait',
      'Cold boot installs node_modules and builds packages. Subsequent boots are fast (~10s).',
    ));
  } else if (age !== null) {
    checks.push(check('container-age', 'pass', `Container up for ${age}s`));
  }

  // --- Layer 3: Application ---

  const appResult = await probeApp(`http://127.0.0.1:${ports.app}`);
  if (appResult.status === 'up') {
    checks.push(check('app', 'pass', `App responding on :${ports.app} (${appResult.code})`));
  } else {
    const ageNote = age !== null && age < 180
      ? ` Container is only ${age}s old — still building.`
      : ' Container has been up a while — check logs: docker compose -f harness/docker-compose.yml logs --tail=20';
    checks.push(check(
      'app',
      'fail',
      `App not responding on :${ports.app}.${ageNote}`,
      age !== null && age < 180 ? 'just harness doctor --wait' : 'just harness dev',
    ));
  }

  const mcpResult = await probeMcp(`http://127.0.0.1:${ports.app}/_next/mcp`);
  if (mcpResult.status === 'up') {
    checks.push(check('mcp', 'pass', `MCP endpoint accessible (${mcpResult.code})`));
  } else {
    checks.push(check('mcp', 'fail', 'MCP endpoint not responding. App may still be starting.'));
  }

  if (hasFailures(checks.filter((c) => c.name === 'app' || c.name === 'mcp'))) {
    return {
      healthy: false,
      layer: 'application',
      checks,
      summary: checks.filter((c) => c.status === 'fail').map((c) => c.message).join('. '),
      action: firstFix(checks.filter((c) => c.status === 'fail')),
      ports,
    };
  }

  // --- Layer 4: Services ---

  const terminalResult = await probeTerminal('127.0.0.1', ports.terminal);
  if (terminalResult.status === 'up') {
    checks.push(check('terminal', 'pass', `Terminal sidecar on :${ports.terminal}`));
  } else {
    checks.push(check('terminal', 'fail', `Terminal sidecar not responding on :${ports.terminal}`, undefined, 'Check entrypoint.sh logs for terminal process errors.'));
  }

  const cdpResult = await probeCdp(`http://127.0.0.1:${ports.cdp}`);
  if (cdpResult.status === 'up') {
    checks.push(check('cdp', 'pass', `CDP/Chromium on :${ports.cdp} (${cdpResult.browser})`));
  } else {
    checks.push(check(
      'cdp',
      'fail',
      `CDP not available on :${ports.cdp}. Chromium may still be starting.`,
      'just harness build && just harness dev',
      'If persistent, rebuild the Docker image to reinstall Chromium.',
    ));
  }

  if (hasFailures(checks.filter((c) => c.name === 'terminal' || c.name === 'cdp'))) {
    return {
      healthy: false,
      layer: 'services',
      checks,
      summary: checks.filter((c) => c.status === 'fail').map((c) => c.message).join('. '),
      action: firstFix(checks.filter((c) => c.status === 'fail')),
      ports,
    };
  }

  // --- Layer 5: Ready ---

  const summary = `Harness is healthy and ready.\n  App:      http://127.0.0.1:${ports.app}\n  Terminal: ws://127.0.0.1:${ports.terminal}\n  CDP:      http://127.0.0.1:${ports.cdp}`;

  return {
    healthy: true,
    layer: 'ready',
    checks,
    summary,
    ports,
  };
}

export function formatStderr(result: DoctorResult): string {
  const lines: string[] = [];
  for (const c of result.checks) {
    const icon = c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : '⏳';
    lines.push(`  ${icon} ${c.message}`);
    if (c.fix) lines.push(`    → Run: ${c.fix}`);
    if (c.detail) lines.push(`    ${c.detail.split('\n').join('\n    ')}`);
  }
  return lines.join('\n');
}
