// @vitest-environment node
/**
 * Plan 088 Phase 5 — T006: daemon-state SSE envelopes from the daemon manager.
 *
 * `ensureDaemon()` emits a `remote-view` `daemon-state` event so open clients can
 * reflect the daemon's lifecycle (ready vs down). Emitted from the manager (the one
 * place that knows the spawn/handshake outcome) over an OPTIONAL notifier dep — the
 * T001 manager tests construct it without one and must keep passing.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type DaemonHealth,
  type RegistryEntry,
  createDaemonManager,
  streamdRegistryPath,
} from '@/features/088-remote-view/server/daemon-manager';
import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/fake-central-event-notifier';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const WEB_PORT = 4607;
const EXPECTED_PROTOCOL = 1;
const BUNDLE_PATH = '/Apps/ChainglassStreamd.app';
const INNER_BINARY = `${BUNDLE_PATH}/Contents/MacOS/streamd`;
const DAEMON_PORT = WEB_PORT + 1501;

function entry(over: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    pid: 84210,
    port: DAEMON_PORT,
    protocolVersion: EXPECTED_PROTOCOL,
    daemonVersion: '0.1.0',
    bundleId: 'com.chainglass.streamd',
    bundlePath: BUNDLE_PATH,
    startedAt: '2026-06-21T00:00:00.000Z',
    ...over,
  };
}

function health(over: Partial<DaemonHealth> = {}): DaemonHealth {
  return {
    ok: true,
    daemonVersion: '0.1.0',
    protocolVersion: EXPECTED_PROTOCOL,
    permissions: { screenRecording: 'granted', accessibility: 'granted' },
    ...over,
  };
}

describe('daemon manager — daemon-state SSE events (T006)', () => {
  let root: string;
  let registryPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cg-streamd-state-'));
    registryPath = streamdRegistryPath(root, WEB_PORT);
    mkdirSync(join(root, '.chainglass'), { recursive: true });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function build(
    notifier: FakeCentralEventNotifier,
    healthByPort: (port: number) => DaemonHealth | null
  ) {
    // Advancing clock — a constant `now` would make pollUntilHealthy's deadline
    // (now()+timeout) unreachable and loop forever on the unhealthy path.
    let clock = 0;
    return createDaemonManager(
      {
        webPort: WEB_PORT,
        workspaceRoot: root,
        innerBinaryPath: INNER_BINARY,
        bootstrapPath: '/abs/.chainglass/bootstrap-code.json',
        expectedProtocolVersion: EXPECTED_PROTOCOL,
        readinessTimeoutMs: 200,
        pollIntervalMs: 10,
      },
      {
        spawnDaemon: () => {},
        fetchHealth: async (port) => healthByPort(port),
        shutdownDaemon: async () => {},
        sleep: async () => {},
        now: () => {
          clock += 100;
          return clock;
        },
        notifier,
      }
    );
  }

  it('emits daemon-state "ready" when a healthy, version-matched daemon resolves', async () => {
    /*
    Test Doc:
    - Why: clients need to know the daemon came up so a pending remote-view session can stream (lifecycle UX).
    - Contract: a healthy registry entry → ensureDaemon emits ('remote-view','daemon-state',{state:'ready',daemonVersion,protocolVersion}).
    - Usage Notes: domain value IS the channel id; the manager is the single emit source (the routes/adapter ride on ensureDaemon).
    - Quality Contribution: pins the ready envelope on the happy path.
    - Worked Example: entry+health v1 → daemon-state ready, daemonVersion '0.1.0', protocolVersion 1.
    */
    writeFileSync(registryPath, JSON.stringify(entry()), 'utf8');
    const notifier = new FakeCentralEventNotifier();
    const manager = build(notifier, () => health());
    await manager.ensureDaemon();
    expect(notifier.emittedEvents).toContainEqual({
      domain: WorkspaceDomain.RemoteView,
      eventType: 'daemon-state',
      data: { state: 'ready', daemonVersion: '0.1.0', protocolVersion: EXPECTED_PROTOCOL },
    });
  });

  it('emits daemon-state "down" when the daemon never becomes healthy', async () => {
    /*
    Test Doc:
    - Why: a failed spawn must surface to clients as a down daemon, not a silent hang (the route throws 5xx; the event lets an open client show the outage).
    - Contract: fetchHealth always null → ensureDaemon rejects AND emits ('remote-view','daemon-state',{state:'down',...}).
    - Usage Notes: emitted on the throw paths before the error propagates.
    - Quality Contribution: pins the down envelope on the failure path.
    - Worked Example: no healthy daemon within the readiness window → rejects + daemon-state down.
    */
    const notifier = new FakeCentralEventNotifier();
    const manager = build(notifier, () => null);
    await expect(manager.ensureDaemon()).rejects.toThrow();
    expect(
      notifier.emittedEvents.some((e) => e.eventType === 'daemon-state' && e.data.state === 'down')
    ).toBe(true);
  });
});
