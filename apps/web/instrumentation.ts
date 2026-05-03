/**
 * Plan 027: Central Domain Event Notification System
 * Plan 067: Event Popper — server.json port discovery
 * Plan 074: Workflow Execution Manager bootstrap
 * Plan 084: Bootstrap-code auth — boot-time misconfig assertion + file write
 *
 * Next.js instrumentation hook — called once at server startup.
 * Starts the central notification system (filesystem watcher → SSE events).
 * Writes .chainglass/server.json so CLI tools can discover the server port.
 * Bootstraps WorkflowExecutionManager singleton for workflow execution from web UI.
 * Bootstrap-code: asserts AUTH_SECRET / GitHub-OAuth wiring, ensures
 * .chainglass/bootstrap-code.json exists for cookie HMAC + terminal-WS HKDF.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

const globalForEventPopper = globalThis as typeof globalThis & {
  __eventPopperServerInfoWritten?: boolean;
};

const globalForExec = globalThis as typeof globalThis & {
  __workflowExecutionManagerInitialized?: boolean;
};

const globalForBootstrap = globalThis as typeof globalThis & {
  __bootstrapCodeWritten?: boolean;
};

export async function register() {
  // CentralWatcherService uses Node.js APIs (chokidar, fs) — skip on Edge runtime.
  // console.log is intentional: this runs at process startup before the DI container
  // or ILogger are available. It's a one-time breadcrumb in the host process logs.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Plan 084 Phase 2 — bootstrap-code: assert wiring + ensure file exists.
    // process.exit() is Node-only; this branch already guards against Edge runtime.
    const { checkBootstrapMisconfiguration, writeBootstrapCodeOnBoot } = await import(
      './src/auth-bootstrap/boot'
    );
    const misconfig = checkBootstrapMisconfiguration(process.env);
    if (!misconfig.ok) {
      console.error('[bootstrap-code] FATAL:', misconfig.reason);
      process.exit(1);
    }
    if (!globalForBootstrap.__bootstrapCodeWritten) {
      globalForBootstrap.__bootstrapCodeWritten = true;
      if (process.env.CHAINGLASS_CONTAINER === 'true') {
        console.warn(
          '[bootstrap-code] CHAINGLASS_CONTAINER=true: skipping boot-time file write; expecting .chainglass/bootstrap-code.json on a mounted volume.'
        );
      } else {
        // Plan 084 FX003: walk up to the workspace root so `pnpm dev` (which
        // runs Next at cwd=apps/web/) lands the file at
        // <workspace-root>/.chainglass/bootstrap-code.json — the same path
        // the popup tells operators to read. Wrapped in try/catch so a
        // malformed parent-dir package.json or fs error during walk-up
        // cannot crash boot; we fall back to raw process.cwd() (the
        // pre-FX003 behavior) on any failure.
        const { findWorkspaceRoot } = await import('@chainglass/shared/auth-bootstrap-code');
        let cwd: string;
        try {
          cwd = findWorkspaceRoot(process.cwd());
        } catch (err) {
          console.warn(
            '[bootstrap-code] FX003 findWorkspaceRoot failed; falling back to process.cwd():',
            err,
          );
          cwd = process.cwd();
        }
        await writeBootstrapCodeOnBoot(cwd);
      }
    }

    console.log('[central-notifications] instrumentation.register() called');
    const { startCentralNotificationSystem } = await import(
      './src/features/027-central-notify-events/start-central-notifications'
    );
    await startCentralNotificationSystem();

    // Plan 067: Write server.json for CLI port discovery (HMR-safe)
    // FX003: Skip in container — host bind-mount causes file conflict
    if (
      !globalForEventPopper.__eventPopperServerInfoWritten &&
      process.env.CHAINGLASS_CONTAINER !== 'true'
    ) {
      globalForEventPopper.__eventPopperServerInfoWritten = true;

      const { writeServerInfo, removeServerInfo } = await import('@chainglass/shared/event-popper');
      const { randomUUID } = await import('node:crypto');
      const worktreePath = process.cwd();
      const port = Number.parseInt(process.env.PORT ?? '3000', 10);
      const localToken = randomUUID();

      writeServerInfo(worktreePath, {
        port,
        pid: process.pid,
        startedAt: new Date().toISOString(),
        localToken,
      });
      console.log(
        `[event-popper] server.json written (port: ${port}, pid: ${process.pid}, localToken: yes)`
      );

      // Plan 080: Seed global hooks to ~/.chainglass/hooks/
      try {
        const { seedGlobalHooks } = await import('./src/features/064-terminal/server/seed-hooks');
        seedGlobalHooks(port);
      } catch (error) {
        console.warn('[hooks] Failed to seed global hooks (non-fatal):', error);
      }

      const cleanup = () => {
        removeServerInfo(worktreePath);
        console.log('[event-popper] server.json removed (shutdown)');
      };
      process.on('SIGTERM', cleanup);
      process.on('SIGINT', cleanup);
    }

    // Plan 074: Bootstrap WorkflowExecutionManager singleton (HMR-safe)
    if (!globalForExec.__workflowExecutionManagerInitialized) {
      globalForExec.__workflowExecutionManagerInitialized = true;

      try {
        const { createWorkflowExecutionManager } = await import(
          './src/features/074-workflow-execution/create-execution-manager'
        );
        const manager = await createWorkflowExecutionManager();
        globalThis.__workflowExecutionManager = manager;

        // Phase 5: Resume workflows that were running before server stopped.
        // P5-DYK #3: Separate try/catch — resumeAll failure must NOT prevent startup.
        try {
          await manager.resumeAll();
        } catch (resumeError) {
          console.warn('[workflow-execution] resumeAll() failed (non-fatal):', resumeError);
          // P5-DYK #3: Self-healing — delete corrupt registry so next restart is clean
          try {
            const { removeRegistry } = await import(
              './src/features/074-workflow-execution/execution-registry'
            );
            removeRegistry();
          } catch {
            // ignore registry cleanup errors
          }
        }

        process.on('SIGTERM', async () => {
          // P5-DYK #1: Best-effort persist BEFORE cleanup (cleanup is slow)
          try {
            manager.persistRegistry();
          } catch {
            // Best-effort — don't block cleanup
          }
          await manager.cleanup();
        });

        console.log('[workflow-execution] Manager initialized');
      } catch (error) {
        globalForExec.__workflowExecutionManagerInitialized = false;
        console.error('[workflow-execution] Failed to initialize:', error);
      }
    }
  }
}
