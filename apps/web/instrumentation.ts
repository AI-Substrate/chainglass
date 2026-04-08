/**
 * Plan 027: Central Domain Event Notification System
 * Plan 067: Event Popper — server.json port discovery
 * Plan 074: Workflow Execution Manager bootstrap
 *
 * Next.js instrumentation hook — called once at server startup.
 * Starts the central notification system (filesystem watcher → SSE events).
 * Writes .chainglass/server.json so CLI tools can discover the server port.
 * Bootstraps WorkflowExecutionManager singleton for workflow execution from web UI.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

const globalForEventPopper = globalThis as typeof globalThis & {
  __eventPopperServerInfoWritten?: boolean;
};

const globalForExec = globalThis as typeof globalThis & {
  __workflowExecutionManagerInitialized?: boolean;
};

export async function register() {
  // CentralWatcherService uses Node.js APIs (chokidar, fs) — skip on Edge runtime.
  // console.log is intentional: this runs at process startup before the DI container
  // or ILogger are available. It's a one-time breadcrumb in the host process logs.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
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
