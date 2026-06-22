/**
 * Production wiring for the daemon-backed RemoteViewService (Plan 088 Phase 5 — T003).
 *
 * Assembles the real adapter from the T001 daemon manager + the live HTTP
 * `/sessions` transport. This is the one piece intentionally NOT unit-tested in
 * T003: it binds node primitives (child_process spawn, fetch, jose mint) and
 * resolves the live daemon config (web port, signed-bundle inner-binary path,
 * bootstrap-code path). Construction does **no I/O** — the daemon spawns lazily on
 * the first `attach()`. The live spawn/proxy path is verified in Phase 6, and the
 * route integration that calls `ensureDaemon` lands in T004.
 */
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { getBootstrapCodeAndKey } from '@/lib/bootstrap-code';
import { findWorkspaceRoot } from '@chainglass/shared/auth-bootstrap-code';
import { SignJWT } from 'jose';

import { type DaemonHealth, createDaemonManager } from './daemon-manager';
import { REMOTE_VIEW_JWT_AUDIENCE, REMOTE_VIEW_JWT_ISSUER } from './remote-view-auth';
import {
  type IRemoteViewService,
  createHttpDaemonSessionsClient,
  createRealRemoteViewService,
} from './remote-view-service';

/** This web build's protocol version — a mismatch drives the manager's respawn. */
const PROTOCOL_VERSION = 1;
const TOKEN_EXPIRY = '5m';

/** Phase-4 signed bundle inner binary (`just streamd-install` target). */
function resolveInnerBinaryPath(): string {
  return join(
    homedir(),
    'Library/Application Support/chainglass/streamd/ChainglassStreamd.app/Contents/MacOS/streamd'
  );
}

/** Absolute path to the bootstrap-code JSON the daemon verifies tokens against. */
function resolveBootstrapPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.chainglass', 'bootstrap-code.json');
}

/** Mint a short-lived daemon JWT (same HKDF key + claims as the WS token route, Finding 03). */
async function mintDaemonToken(): Promise<string> {
  const { key } = await getBootstrapCodeAndKey();
  return new SignJWT({
    iss: REMOTE_VIEW_JWT_ISSUER,
    aud: REMOTE_VIEW_JWT_AUDIENCE,
    sub: 'chainglass-server',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(key);
}

/** Resolved daemon config — every path keyed off the CANONICAL workspace root. */
export interface ProductionDaemonConfig {
  webPort: number;
  workspaceRoot: string;
  innerBinaryPath: string;
  bootstrapPath: string;
  daemonPortOverride?: number;
}

/**
 * Resolve the daemon config from the canonical workspace root — NOT raw
 * `process.cwd()` (F001 / Plan 084 FX003). Under `just dev`/Turbo, Next runs from
 * `apps/web/`, but `getBootstrapCodeAndKey()` mints/verifies the bootstrap code
 * from `findWorkspaceRoot(process.cwd())` (the repo root holding `.chainglass/`).
 * The daemon's `--bootstrap`/`--registry` paths MUST point at that same root, or
 * the daemon verifies tokens against `apps/web/.chainglass/` while the web process
 * signs against `<repo>/.chainglass/` and live `/sessions` auth fails on the first
 * attach. `cwd`/`findRoot`/`env` are injectable so the seam is unit-testable with
 * no real filesystem walk (construction still does no I/O on the real path).
 */
export function resolveProductionDaemonConfig(
  deps: {
    cwd?: string;
    findRoot?: (startDir: string) => string;
    env?: NodeJS.ProcessEnv;
  } = {}
): ProductionDaemonConfig {
  const cwd = deps.cwd ?? process.cwd();
  const findRoot = deps.findRoot ?? findWorkspaceRoot;
  const env = deps.env ?? process.env;
  const workspaceRoot = findRoot(cwd);
  return {
    webPort: Number(env.PORT ?? 3000),
    workspaceRoot,
    innerBinaryPath: resolveInnerBinaryPath(),
    bootstrapPath: resolveBootstrapPath(workspaceRoot),
    daemonPortOverride: env.CG_REMOTE_VIEW__DAEMON_PORT
      ? Number(env.CG_REMOTE_VIEW__DAEMON_PORT)
      : undefined,
  };
}

/**
 * Build the production daemon-backed RemoteViewService. Called by the prod DI
 * factory (di-container). The web port defaults to `process.env.PORT` (Next's own
 * port) — Phase-6 live verification confirms the registry-filename match.
 */
export function createProductionRemoteViewService(
  opts: { logger?: Pick<Console, 'info' | 'warn' | 'error'> } = {}
): IRemoteViewService {
  const { webPort, workspaceRoot, innerBinaryPath, bootstrapPath, daemonPortOverride } =
    resolveProductionDaemonConfig();

  const manager = createDaemonManager(
    {
      webPort,
      workspaceRoot,
      innerBinaryPath,
      bootstrapPath,
      expectedProtocolVersion: PROTOCOL_VERSION,
      daemonPortOverride,
    },
    {
      spawnDaemon: (binaryPath, args) => {
        const child = spawn(binaryPath, args, { detached: true, stdio: 'ignore' });
        child.unref();
      },
      fetchHealth: async (daemonPort): Promise<DaemonHealth | null> => {
        try {
          const res = await fetch(`http://127.0.0.1:${daemonPort}/health`);
          if (!res.ok) return null;
          return (await res.json()) as DaemonHealth;
        } catch {
          return null;
        }
      },
      shutdownDaemon: async (daemonPort) => {
        try {
          await fetch(`http://127.0.0.1:${daemonPort}/shutdown`, { method: 'POST' });
        } catch {
          /* best-effort graceful shutdown before respawn */
        }
      },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now(),
      logger: opts.logger,
    }
  );

  const sessions = createHttpDaemonSessionsClient({ mintToken: mintDaemonToken });
  return createRealRemoteViewService({
    ensureDaemon: manager.ensureDaemon,
    sessions,
    logger: opts.logger,
  });
}
