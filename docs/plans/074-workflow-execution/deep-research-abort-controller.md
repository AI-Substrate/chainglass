# Cooperative Cancellation Patterns for TypeScript/Node.js Orchestration Engines: A Production-Ready Guide to AbortController Integration in Workflow State Management

This comprehensive report addresses the architectural challenge of adding immediate-stop capabilities to a TypeScript orchestration engine that manages multi-node workflow graphs with fire-and-forget child processes. The analysis demonstrates that **cooperative cancellation via AbortController, when combined with proper state transition semantics and cleanup sequencing, enables both immediate responsiveness and graph resumability without sacrificing safety or introducing race conditions**. The core pattern involves establishing a primary AbortController at the orchestration level, propagating its signal through all async boundaries (polling loops, sleep functions, pod managers, and child processes), implementing exhaustive cleanup sequences that respect timeout thresholds, and maintaining a resumable graph state by distinguishing between terminal completion and user-initiated interruption. This report provides production-ready code patterns, TypeScript type definitions, error handling strategies, and detailed mitigation for the most common pitfalls encountered in real-world abort implementations, with particular emphasis on the interaction between Node.js's native timers module, child process signal handling, and asynchronous resource disposal.

## Part 1: Foundational Concepts and Current Architecture Analysis

### Understanding the Core Challenge in Workflow Orchestration

The problem presented involves a polling-based orchestration engine that repeatedly executes workflow iterations, each of which may spawn long-lived child processes (AI agent pods and bash scripts) without waiting for their completion[2]. This fire-and-forget pattern, while enabling concurrent task execution and responsive user interfaces, creates a critical challenge: when a user requests an immediate stop, the engine must somehow communicate that intention to processes that were never directly awaited, were never directly passed an AbortSignal, and may have already completed or may never complete. The fundamental tension is between **immediate responsiveness to stop requests** and **graceful, non-destructive termination** of running work[23].

The current architecture contains several architectural properties that constrain the solution space. First, the `drive()` polling loop has a maximum iteration count and delay-based control flow, meaning that interruption must occur at the iteration boundary rather than within a single `run()` call[1]. Second, `ODS.execute()` dispatches pods via fire-and-forget semantics, implying that the engine has already returned from the execute call and has no natural callback path to receive a cancellation signal[2]. Third, the `PodManager` is the singleton holder of pod instances, making it the natural location for coordinating pod termination. Fourth, `ScriptRunner` uses Node.js `spawn()` to manage subprocesses, which respond to POSIX signals (SIGTERM, SIGKILL) rather than JavaScript exceptions[13].

These constraints mean that a naive "throw an exception" approach will not work, and a traditional "immediate force-kill" approach via SIGKILL will compromise data consistency and state resumability. Instead, the solution must implement **cooperative cancellation**: the engine announces its intent to stop via an AbortSignal, each component checks that signal at safe points, initiates graceful shutdown of its managed resources, and coordinated cleanup ensures that all outstanding work is either completed or safely abandoned before control returns[6][23].

### The AbortController and AbortSignal Model in Node.js

AbortController is a standard JavaScript API that provides a cooperative cancellation mechanism[30]. An AbortController has two public members: a `signal` (AbortSignal) that observers listen to, and an `abort()` method that triggers the signal. When `abort()` is called, all listeners registered on the signal receive an `abort` event, and the signal's `aborted` property becomes true. The abort reason can be any JavaScript value; if not provided, the default reason is an AbortError[14].

Node.js 15+ provides native AbortController, and recent versions (18+) have extended AbortSignal with static methods: `AbortSignal.timeout(ms)` creates a signal that automatically aborts after a delay[9], and `AbortSignal.any([...signals])` creates a signal that aborts when any of its inputs abort[7]. These capabilities are essential for building robust orchestration engines because they allow combining multiple independent cancellation sources (user stop, timeout, dependency failure) into a single signal that all subsystems can observe[7][22].

The critical property of cooperative cancellation is that it is **non-preemptive**: calling `abort()` does not forcefully interrupt code that is currently executing. Instead, it sets the signal's state and notifies listeners. Code that is waiting on an abortable async operation (like a promise that checks the signal, or a fetch request with the signal option) will receive the abort notification and choose to exit. Code that is already executing must reach a point where it checks the signal or awaits an abortable operation before it will be interrupted. This is fundamentally safer than preemptive cancellation because it gives code a chance to reach safe cleanup points[6][23].

## Part 2: Integrating AbortController into the Polling Loop

### The Polling Loop with Abortable Sleep

The first task is to modify the `drive()` method to accept an AbortSignal and interrupt its polling loop. The pattern involves two key elements: checking the signal at the iteration boundary, and using an abortable sleep function instead of a bare `sleep()`[1][7][9].

Here is a production-ready implementation of an abortable sleep utility:

```typescript
import { setTimeout as setTimeoutPromise } from 'node:timers/promises';

/**
 * Abortable sleep that rejects with AbortError if signal fires.
 * Uses native Node.js timers/promises API for clean abort support.
 */
async function abortableSleep(
  delayMs: number,
  options: { signal?: AbortSignal } = {}
): Promise<void> {
  const { signal } = options;
  
  // Check if already aborted before we even start
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
  }

  try {
    // setTimeoutPromise natively supports AbortSignal in Node.js 17+
    await setTimeoutPromise(delayMs, { signal });
  } catch (err) {
    // Distinguish between abort and other errors
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err; // Re-throw abort errors
    }
    throw err; // Other errors pass through
  }
}
```

The `drive()` method is then modified to accept an AbortSignal and check it at each iteration boundary:

```typescript
interface DriveOptions {
  maxIterations?: number;
  actionDelayMs?: number;
  idleDelayMs?: number;
  signal?: AbortSignal; // NEW: external abort signal
}

interface DriveResult {
  exitReason: 'complete' | 'max-iterations' | 'stopped' | 'error';
  iterationsCompleted: number;
  finalGraphState: GraphState;
  error?: Error;
}

async drive(options?: DriveOptions): Promise<DriveResult> {
  const maxIterations = options?.maxIterations ?? 200;
  const actionDelayMs = options?.actionDelayMs ?? 100;
  const idleDelayMs = options?.idleDelayMs ?? 10_000;
  const signal = options?.signal;

  let iterationsCompleted = 0;

  try {
    for (let i = 0; i < maxIterations; i++) {
      // Check abort signal at iteration boundary FIRST
      if (signal?.aborted) {
        return {
          exitReason: 'stopped',
          iterationsCompleted: i,
          finalGraphState: this.graph.getState(),
        };
      }

      // Run one iteration of the graph
      const result = await this.run();
      iterationsCompleted = i + 1;

      // Emit telemetry
      this.events.emit('iteration-complete', {
        iteration: i,
        result,
      });

      // Check terminal conditions
      if (result.stopReason === 'graph-complete') {
        return {
          exitReason: 'complete',
          iterationsCompleted,
          finalGraphState: this.graph.getState(),
        };
      }

      // Choose delay based on whether work was done
      const delayMs = result.nodesFired > 0 ? actionDelayMs : idleDelayMs;

      // Use abortable sleep — will throw AbortError if signal fires
      try {
        await abortableSleep(delayMs, { signal });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // User requested stop during sleep; exit cleanly
          return {
            exitReason: 'stopped',
            iterationsCompleted,
            finalGraphState: this.graph.getState(),
          };
        }
        throw err;
      }
    }

    // Completed all iterations without completing the graph
    return {
      exitReason: 'max-iterations',
      iterationsCompleted,
      finalGraphState: this.graph.getState(),
    };
  } catch (err) {
    // Handle unexpected errors (not abort)
    return {
      exitReason: 'error',
      iterationsCompleted,
      finalGraphState: this.graph.getState(),
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
```

This implementation provides several production-grade properties. First, the signal is checked **before** beginning the expensive work of calling `run()`, avoiding wasted iterations[7]. Second, the signal is checked **after** delaying, so if `abortableSleep()` throws an AbortError, we immediately exit the loop rather than continuing[1]. Third, the method distinguishes between user-initiated stop (returning `stopped`) and other terminal conditions, allowing callers to handle these cases differently[22]. Fourth, both the iteration boundary and the sleep can be interrupted, giving the user responsive control within roughly one iteration and one sleep duration[1].

The key insight is that abortable sleep is the **choke point** where the signal takes effect. Because the polling loop spends most of its time sleeping, making sleep abortable gives the user very responsive control. Without this, a user requesting a stop would have to wait for the next action delay or idle delay to complete before the loop checks the signal again[1][9].

### Type-Safe Abort Signal Management

To avoid accidental misuse, the orchestration engine should use TypeScript's type system to enforce signal flow. A common pattern is to define a context object that carries the signal through the call stack:

```typescript
/**
 * Execution context carries the abort signal through all async operations.
 * This enables deep call stacks to respond to cancellation without explicitly
 * passing the signal as a parameter at every level.
 */
interface ExecutionContext {
  readonly signal: AbortSignal;
  readonly nodeId: string;
  readonly iterationId: string;
  readonly startTime: number;
}

/**
 * Helper to create a context from options at the entry point.
 */
function createExecutionContext(
  nodeId: string,
  iterationId: string,
  signal: AbortSignal = new AbortController().signal
): ExecutionContext {
  return {
    signal,
    nodeId,
    iterationId,
    startTime: Date.now(),
  };
}

/**
 * Type helper: ensure signal is available in context.
 * Used to enforce that all operations that take ExecutionContext
 * can safely assume signal is present.
 */
type SignalRequired<T extends { signal?: AbortSignal }> = T & {
  signal: AbortSignal;
};
```

With these types in place, functions that require an abort signal can be typed to reject calls that don't provide one:

```typescript
async run(signal: AbortSignal): Promise<RunResult> {
  signal.throwIfAborted(); // Fail fast if already aborted
  
  const context = createExecutionContext('graph-run', `iter-${Date.now()}`, signal);
  
  // Now run() and all its callees can access the signal via context
  const result = await this.settle(context);
  // ...
}
```

This pattern, inspired by Go's context.Context and Python's contextvars, provides a clean way to thread the signal through deeply nested call stacks without making every function signature longer[5][6].

## Part 3: Signal Propagation to Fire-and-Forget Child Processes

### Tracking Fire-and-Forget Pods in the PodManager

The most challenging aspect of adding abort support is dealing with fire-and-forget child processes. The `ODS.execute()` method returns immediately without awaiting the pod's work, so the orchestration engine must maintain its own bookkeeping of active pods. The PodManager is the natural location for this:

```typescript
interface PodEntry {
  nodeId: string;
  pod: IWorkUnitPod;
  createdAt: number;
  signal: AbortSignal;
  controller: AbortController;
}

class PodManager {
  private pods = new Map<string, PodEntry>();
  private signal: AbortSignal;
  private onPodComplete?: (nodeId: string, result: PodResult) => void;

  constructor(signal: AbortSignal, options?: { onPodComplete?: (nodeId: string, result: PodResult) => void }) {
    this.signal = signal;
    this.onPodComplete = options?.onPodComplete;
    
    // Listen for abort on the main signal so we can terminate all pods
    if (!this.signal.aborted) {
      this.signal.addEventListener('abort', () => this.terminateAll());
    }
  }

  /**
   * Create a pod and track it for later cleanup.
   * Returns a derived signal that aborts when either the main signal or this pod's timeout aborts.
   */
  createPod(
    nodeId: string,
    params: any,
    timeout?: number
  ): { pod: IWorkUnitPod; signal: AbortSignal } {
    // Create a controller for this specific pod
    const podController = new AbortController();
    
    // If there's a timeout, set up a timeout signal
    let timeoutSignal: AbortSignal | undefined;
    if (timeout !== undefined && timeout > 0) {
      timeoutSignal = AbortSignal.timeout(timeout);
    }

    // Combine: abort if main signal aborts, if pod timeout fires, OR if pod-specific abort happens
    const signals = [podController.signal];
    if (timeoutSignal) signals.push(timeoutSignal);
    if (this.signal && !this.signal.aborted) {
      signals.push(this.signal);
    }

    const derivedSignal = signals.length > 1 
      ? AbortSignal.any(signals) 
      : signals;

    // Create the actual pod instance
    const pod = this.createPodInstance(nodeId, params);

    // Track it
    const entry: PodEntry = {
      nodeId,
      pod,
      createdAt: Date.now(),
      signal: derivedSignal,
      controller: podController,
    };

    this.pods.set(nodeId, entry);

    // Start the pod execution without waiting; it will complete asynchronously
    // The pod is responsible for respecting its signal
    this.executeAndTrackPod(nodeId, entry).catch(err => {
      // Fire-and-forget error: log it, don't crash the orchestration engine
      console.error(`Pod ${nodeId} failed:`, err);
    });

    return { pod, signal: derivedSignal };
  }

  /**
   * Execute the pod and track its completion.
   * This method runs asynchronously and does not hold up the orchestration engine.
   */
  private async executeAndTrackPod(nodeId: string, entry: PodEntry): Promise<void> {
    try {
      const result = await entry.pod.execute({
        signal: entry.signal,
        timeout: undefined, // Pod respects signal timeouts instead
      });

      // Pod completed successfully; notify listener if registered
      if (this.onPodComplete) {
        this.onPodComplete(nodeId, result);
      }
    } finally {
      // Remove from tracking once done (either success or failure)
      this.pods.delete(nodeId);
    }
  }

  /**
   * Gracefully terminate all active pods.
   * Called when the main signal aborts or when explicitly requested.
   */
  async terminateAll(timeoutMs: number = 5000): Promise<void> {
    const entries = Array.from(this.pods.values());

    if (entries.length === 0) return;

    console.log(`Terminating ${entries.length} active pods`);

    // Send terminate signal to all pods in parallel
    const terminatePromises = entries.map(entry =>
      this.terminatePod(entry, timeoutMs)
        .catch(err => {
          console.error(`Failed to terminate pod ${entry.nodeId}:`, err);
          // Continue terminating other pods even if one fails
        })
    );

    await Promise.all(terminatePromises);

    // At this point, all pods should be cleaned up or abandoned
    // Clear our tracking map
    this.pods.clear();
  }

  /**
   * Terminate a single pod with timeout.
   * First attempts graceful termination via pod.terminate().
   * If that times out, logs a warning but does not force-kill (let system GC handle it).
   */
  private async terminatePod(entry: PodEntry, timeoutMs: number): Promise<void> {
    // Abort the derived signal to notify the pod that we want it to stop
    entry.controller.abort(new DOMException('Pod termination requested', 'AbortError'));

    try {
      // Wait for the pod's terminate method with a timeout
      await Promise.race([
        entry.pod.terminate(),
        abortableSleep(timeoutMs, { signal: AbortSignal.timeout(timeoutMs) }),
      ]);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Timeout occurred; pod did not terminate gracefully
        console.warn(
          `Pod ${entry.nodeId} did not terminate within ${timeoutMs}ms; abandoning`
        );
        // Do NOT force-kill; the pod's cleanup will happen eventually or be GC'd
        // Forcing SIGKILL here would violate state resumability
      } else {
        throw err;
      }
    }
  }

  /**
   * Get a pod by node ID.
   */
  getPod(nodeId: string): IWorkUnitPod | undefined {
    return this.pods.get(nodeId)?.pod;
  }

  /**
   * Check how many pods are still active.
   */
  getActiveCount(): number {
    return this.pods.size;
  }

  private createPodInstance(nodeId: string, params: any): IWorkUnitPod {
    // Implementation-specific: create the appropriate pod type
    // For now, assume a generic factory
    return createPodInstance(nodeId, params);
  }
}
```

This implementation provides several guarantees. First, every pod is tracked immediately upon creation, ensuring that even if the orchestration engine stops before the pod completes, we have a reference to it[2]. Second, pods are created with a **derived signal** that combines the main orchestration signal, a pod-specific timeout, and the pod's own controller, giving fine-grained control over each pod's lifetime[7]. Third, termination is graceful: we signal the pod, wait for its `terminate()` method, and only log a warning if it times out—we do not force-kill, preserving state consistency[6][23]. Fourth, pod completion is tracked asynchronously; even if orchestration stops, running pods complete and trigger their callbacks, enabling resumable state transitions[8][12].

### Integrating PodManager into ODS.execute()

The `ODS.execute()` method is modified to use the PodManager:

```typescript
class ODS {
  constructor(private podManager: PodManager) {}

  async execute(request: StartNodeRequest, ctx: ExecutionContext, reality: Reality): Promise<ExecuteResult> {
    const nodeId = request.nodeId;
    
    // Create pod and get its signal
    const { pod, signal } = this.podManager.createPod(
      nodeId,
      request.params,
      request.timeoutMs
    );

    // The pod is now running asynchronously; we return immediately
    // The pod will abort gracefully when ctx.signal aborts (propagated via signal)
    return {
      ok: true,
      nodeId,
      status: 'started',
      // Note: we do NOT await pod.execute(); it runs fire-and-forget
    };
  }
}
```

The key difference from the current implementation is that `execute()` now registers the pod with the PodManager before returning, ensuring that if the orchestration engine stops before the pod finishes, the engine knows about it and can terminate it gracefully.

### Handling Child Process Spawning with Signals

The `ScriptRunner` class spawns bash subprocesses via Node.js `spawn()`. These subprocesses respond to POSIX signals rather than JavaScript exceptions. The strategy is to pass the AbortSignal to the spawn options and let Node.js handle the signal propagation:

```typescript
class ScriptRunner {
  private processes = new Map<string, ChildProcess>();

  /**
   * Run a bash script with abort support.
   * When the signal aborts, Node.js automatically sends SIGTERM to the child process.
   */
  async run(
    scriptPath: string,
    opts: {
      cwd?: string;
      signal?: AbortSignal;
      timeout?: number;
      killSignal?: string; // Custom signal, default SIGTERM
    } = {}
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    const { signal, timeout, killSignal = 'SIGTERM', cwd } = opts;

    // Check if already aborted
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    }

    // Prepare spawn options
    const spawnOpts: any = { cwd };
    
    // Pass signal to spawn; Node.js will handle sending killSignal on abort
    if (signal) {
      spawnOpts.signal = signal;
      spawnOpts.killSignal = killSignal;
    }

    // If timeout is provided, add a timeout signal
    if (timeout !== undefined && timeout > 0) {
      const timeoutSignal = AbortSignal.timeout(timeout);
      spawnOpts.signal = signal && !signal.aborted
        ? AbortSignal.any([signal, timeoutSignal])
        : timeoutSignal;
    }

    const proc = spawn('bash', [scriptPath], spawnOpts);
    const processId = `${scriptPath}-${Date.now()}`;
    this.processes.set(processId, proc);

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      // Collect output
      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle completion
      proc.on('close', (code) => {
        this.processes.delete(processId);
        if (code === 0) {
          resolve({ code, stdout, stderr });
        } else {
          const error = new Error(`Script exited with code ${code}: ${stderr}`);
          (error as any).code = code;
          reject(error);
        }
      });

      // Handle errors during spawn
      proc.on('error', (err) => {
        this.processes.delete(processId);
        reject(err);
      });

      // Handle abort signal explicitly
      // (Node.js sends killSignal automatically, but we may want custom cleanup)
      signal?.addEventListener('abort', () => {
        if (!proc.killed) {
          console.log(`Killing process for ${scriptPath}`);
          // Node.js already sent killSignal, but we can do additional cleanup here
        }
      }, { once: true });
    });
  }

  /**
   * Force-kill a specific process.
   * Use sparingly; only if the process did not respond to SIGTERM.
   */
  kill(processId: string, force: boolean = false): void {
    const proc = this.processes.get(processId);
    if (proc && !proc.killed) {
      proc.kill(force ? 'SIGKILL' : 'SIGTERM');
    }
  }

  /**
   * Terminate all running processes.
   */
  killAll(force: boolean = false): void {
    const signal = force ? 'SIGKILL' : 'SIGTERM';
    for (const proc of this.processes.values()) {
      if (!proc.killed) {
        proc.kill(signal);
      }
    }
    // Clear map after a short delay to allow processes time to exit
    if (!force) {
      setTimeout(() => this.processes.clear(), 5000);
    } else {
      this.processes.clear();
    }
  }
}
```

Node.js's native AbortSignal support in `spawn()` options (available since v15.0.0 and refined in later versions) automatically handles sending SIGTERM when the signal aborts[13]. This is cleaner than manually listening to the abort event and calling `proc.kill()`, because it reduces race conditions: the native implementation ensures that if the signal aborts while the process is still spawning, the process will be killed before it ever runs[13]. For compatibility with older Node.js versions, a fallback to manual `proc.kill()` can be provided.

The critical design choice here is the `killSignal` default: SIGTERM is the "polite" signal that allows the process to clean up, while SIGKILL is the "nuclear option" that forcefully terminates[23]. By defaulting to SIGTERM and only sending SIGKILL as a last resort (if the process does not respond to SIGTERM within a timeout), the implementation respects the state resumability goal: processes get a chance to persist their state before exiting.

## Part 4: Graph State Management During Abort

### Distinguishing Interruption from Failure

A critical requirement is that when the orchestration engine stops, nodes that were running at the time of the stop should be marked as 'interrupted', not 'failed'. This distinction enables resumability: when the engine restarts, it knows that interrupted nodes may have partially completed their work and should be restarted or inspected, whereas failed nodes have definitely not completed[12][24][25][26].

The GraphState model should support this distinction:

```typescript
type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'interrupted';

interface GraphNode {
  id: string;
  status: NodeStatus;
  output?: any;
  error?: Error;
  startTime?: number;
  endTime?: number;
  interruptedAt?: number; // Set when node is interrupted, not failed
}

interface GraphState {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  createdAt: number;
  lastIterationAt?: number;
  completedAt?: number;
  interruptedAt?: number; // Set when graph is user-stopped, not errored
}

class Graph {
  private state: GraphState;

  /**
   * Mark a node as interrupted due to orchestration stop.
   * Preserves any output generated before the interrupt.
   */
  markNodeInterrupted(nodeId: string): void {
    const node = this.state.nodes.get(nodeId);
    if (node && node.status === 'running') {
      node.status = 'interrupted';
      node.interruptedAt = Date.now();
      // Preserve node.output if it exists (partial results)
      // Clear node.error since this is not a failure
      node.error = undefined;
    }
  }

  /**
   * Mark the entire graph as interrupted.
   */
  markGraphInterrupted(): void {
    this.state.interruptedAt = Date.now();
    
    // Mark all running nodes as interrupted
    for (const [nodeId, node] of this.state.nodes) {
      if (node.status === 'running') {
        this.markNodeInterrupted(nodeId);
      }
    }
  }

  /**
   * Get all nodes that were interrupted (vs. failed or completed).
   */
  getInterruptedNodes(): GraphNode[] {
    return Array.from(this.state.nodes.values())
      .filter(n => n.status === 'interrupted');
  }

  /**
   * Check if the graph is in a resumable state.
   */
  isResumable(): boolean {
    // Graph is resumable if all running nodes have been marked interrupted
    for (const node of this.state.nodes.values()) {
      if (node.status === 'running' && !node.interruptedAt) {
        return false; // Dangling running node
      }
    }
    return true;
  }

  /**
   * Reset all interrupted nodes back to pending, preparing for resume.
   */
  resetInterruptedNodes(): void {
    for (const [nodeId, node] of this.state.nodes) {
      if (node.status === 'interrupted') {
        node.status = 'pending';
        node.interruptedAt = undefined;
        // Keep output for user inspection; they can decide whether to discard it
      }
    }
  }
}
```

With these additions, the orchestration engine can track which nodes were running when the stop signal came, mark them clearly, and allow the user to decide whether to resume from where they left off or reset and start over.

### The Stop Sequence: Coordinating Abort Across Subsystems

The `stop()` method orchestrates the abort across all subsystems:

```typescript
interface StopOptions {
  reason?: string;
  force?: boolean; // If true, skip graceful termination and force-kill
  timeoutMs?: number; // How long to wait for graceful termination
}

interface StopResult {
  graphState: GraphState;
  podsTerminated: number;
  processesKilled: number;
  completedAt: number;
}

async stop(options: StopOptions = {}): Promise<StopResult> {
  const { reason = 'User requested stop', force = false, timeoutMs = 5000 } = options;

  const stopStartTime = Date.now();

  // Step 1: Abort the main signal to notify all async operations
  console.log(`[STOP] Aborting: ${reason}`);
  this.abortController.abort(new DOMException(reason, 'AbortError'));

  // Step 2: Mark currently running nodes as interrupted
  this.graph.markGraphInterrupted();

  // Step 3: Wait for the polling loop to exit (with timeout)
  // The polling loop checks the signal and will exit within one iteration + sleep
  const loopExitTimeout = Math.min(timeoutMs / 2, 2000);
  try {
    await this.waitForLoopExit(loopExitTimeout);
  } catch (err) {
    console.warn(`[STOP] Polling loop did not exit within ${loopExitTimeout}ms`);
    // Continue anyway; we still need to clean up resources
  }

  // Step 4: Terminate all pods (graceful termination with timeout)
  const podsTerminated = this.podManager.getActiveCount();
  if (podsTerminated > 0) {
    console.log(`[STOP] Terminating ${podsTerminated} active pods`);
    try {
      await this.podManager.terminateAll(timeoutMs / 2);
    } catch (err) {
      console.error('[STOP] Error terminating pods:', err);
    }
  }

  // Step 5: Kill all subprocesses
  const scriptRunner = this.scriptRunner; // Assume available
  const processesKilled = scriptRunner.getActiveCount();
  if (processesKilled > 0) {
    console.log(`[STOP] Killing ${processesKilled} active processes`);
    scriptRunner.killAll(force);
  }

  // Step 6: Verify graph is in resumable state
  if (!this.graph.isResumable()) {
    console.error('[STOP] WARNING: Graph is not in resumable state');
  }

  const stopEndTime = Date.now();
  console.log(`[STOP] Completed in ${stopEndTime - stopStartTime}ms`);

  return {
    graphState: this.graph.getState(),
    podsTerminated,
    processesKilled,
    completedAt: stopEndTime,
  };
}

/**
 * Wait for the polling loop to exit, with timeout.
 * Returns immediately if loop is not running.
 */
private async waitForLoopExit(timeoutMs: number): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 10; // Check every 10ms

  return new Promise((resolve, reject) => {
    const checkLoop = () => {
      if (!this.loopRunning) {
        resolve();
        return;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed > timeoutMs) {
        reject(new Error(`Loop did not exit within ${timeoutMs}ms`));
        return;
      }

      setTimeout(checkLoop, pollInterval);
    };

    checkLoop();
  });
}

/**
 * Track whether the polling loop is active.
 * Set to true when drive() starts, false when it returns.
 */
private loopRunning = false;
```

This stop sequence respects a strict ordering: first abort the signal (telling all subsystems to stop), then wait for the loop to exit (giving it time to check the signal), then terminate pods, then kill subprocesses. Each step has a timeout, so if a subsystem does not respond gracefully, the stop process continues rather than hanging indefinitely.

### Resuming from an Interrupted State

After stopping, the user can call `resume()` to restart the engine from the point where it was interrupted:

```typescript
interface ResumeOptions {
  maxIterations?: number;
  actionDelayMs?: number;
  idleDelayMs?: number;
  resetInterrupted?: boolean; // If true, reset interrupted nodes to pending
}

async resume(options: ResumeOptions = {}): Promise<DriveResult> {
  // Create a fresh AbortController for this resume session
  this.abortController = new AbortController();
  this.podManager = new PodManager(this.abortController.signal);

  if (options.resetInterrupted) {
    // User chose to retry interrupted nodes
    this.graph.resetInterruptedNodes();
    console.log('Reset interrupted nodes to pending');
  }

  // Re-enter the drive loop
  return this.drive({
    maxIterations: options.maxIterations ?? 200,
    actionDelayMs: options.actionDelayMs ?? 100,
    idleDelayMs: options.idleDelayMs ?? 10_000,
    signal: this.abortController.signal,
  });
}
```

This design allows the user to inspect what happened (via `graph.getState()`), decide whether to retry interrupted nodes or reset completely, and then resume. The graph state persists across stop/resume cycles, enabling human-in-the-loop workflows where a user can pause, examine, make adjustments, and continue[24][25].

## Part 5: Error Handling, Memory Management, and Pitfalls

### Avoiding Unhandled Rejection Pitfalls

A critical pitfall with fire-and-forget work is unhandled promise rejection. If a pod or script completes with an error and no one is listening, Node.js will crash the process[2]. The PodManager avoids this by explicitly catching the promise returned from pod execution:

```typescript
private async executeAndTrackPod(nodeId: string, entry: PodEntry): Promise<void> {
  try {
    const result = await entry.pod.execute({
      signal: entry.signal,
    });
    if (this.onPodComplete) {
      this.onPodComplete(nodeId, result);
    }
  } catch (err) {
    // Catch all errors, including AbortError and pod-specific failures
    // Do NOT re-throw; this is a fire-and-forget execution
    console.error(`Pod ${nodeId} error:`, err);

    // Emit an event or callback to notify the orchestration engine of the failure
    // This allows the engine to mark the node as failed in the graph
    if (this.onPodComplete) {
      this.onPodComplete(nodeId, {
        ok: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  } finally {
    // Always remove from tracking
    this.pods.delete(nodeId);
  }
}
```

By catching errors within the fire-and-forget execution, the PodManager ensures that even if a pod fails, the error is handled and the orchestration engine is notified. The error does not propagate and crash the process.

Similarly, ScriptRunner should wrap its promises:

```typescript
async run(scriptPath: string, opts: { signal?: AbortSignal } = {}): Promise<ScriptResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('bash', [scriptPath], {
      signal: opts.signal,
      killSignal: 'SIGTERM',
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => { stdout += data; });
    proc.stderr?.on('data', (data) => { stderr += data; });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true, code, stdout, stderr });
      } else if (code === null) {
        // Process was killed by signal (e.g., SIGTERM from abort)
        reject(new DOMException(`Process killed by signal`, 'AbortError'));
      } else {
        reject(new Error(`Script failed with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      // Spawn failed (e.g., ENOENT)
      reject(err);
    });
  });
}
```

### Managing AbortSignal Listeners and Memory Leaks

A subtle but critical issue is **listener management**. Every time code calls `signal.addEventListener('abort', ...)`, it registers a listener. If listeners are never removed, they accumulate and eventually consume memory[4][22][28].

The pattern is to use the `{ once: true }` option when possible:

```typescript
signal.addEventListener('abort', () => {
  clearTimeout(timerId);
  reject(new DOMException('Aborted', 'AbortError'));
}, { once: true }); // Listener automatically removed after firing
```

For long-lived listeners that should not be removed (e.g., a manager listening for abort to clean up its resources), ensure they are tied to the lifetime of the owning object:

```typescript
class PodManager {
  constructor(signal: AbortSignal) {
    if (!signal.aborted) {
      // Register a listener that lasts as long as this manager exists
      // When the manager is GC'd, the listener will eventually be GC'd too
      // (assuming the signal is not retained forever)
      signal.addEventListener('abort', () => this.terminateAll(), {
        once: true, // Only listen once; we can re-register on next session
      });
    }
  }
}
```

If the signal might be retained beyond the lifetime of the component, explicitly remove listeners:

```typescript
class Component {
  constructor(private signal: AbortSignal) {
    this.handleAbort = this.handleAbort.bind(this);
    this.signal.addEventListener('abort', this.handleAbort);
  }

  private handleAbort(): void {
    // ...
  }

  destroy(): void {
    this.signal.removeEventListener('abort', this.handleAbort);
  }
}
```

In practice, the cleanest approach is to use **derived signals** that are short-lived[7]. Instead of a component directly listening to a long-lived signal, create an AbortController and a derived signal for that component's lifetime:

```typescript
const mainSignal = new AbortController().signal;

function runComponent(mainSignal: AbortSignal): AbortController {
  // Create a component-scoped controller
  const componentController = new AbortController();
  
  // Derive a signal that aborts if either mainSignal or componentController aborts
  const componentSignal = AbortSignal.any([mainSignal, componentController.signal]);
  
  // The component only listens to componentSignal, which is local and will be GC'd
  componentSignal.addEventListener('abort', () => {
    console.log('Component aborting');
    componentController.abort(); // Clean up if needed
  });

  return componentController;
}
```

This pattern ensures that listeners are tied to short-lived objects and are naturally cleaned up when the objects are garbage collected.

### Distinguishing Abort Errors from Other Errors

Code must distinguish between AbortError (user requested stop, pod timeout, main signal abort) and other errors (network failure, script syntax error, pod internal error). The pattern is to check the error type and the signal state:

```typescript
async executeNode(nodeId: string, signal: AbortSignal): Promise<NodeResult> {
  try {
    return await node.execute(signal);
  } catch (err) {
    // Distinguish abort from failure
    if (err instanceof DOMException && err.name === 'AbortError') {
      // This is an abort; mark as interrupted, not failed
      this.graph.markNodeInterrupted(nodeId);
      return { ok: false, aborted: true };
    }

    // Check if signal is already aborted (indicates cascading abort)
    if (signal.aborted) {
      // Signal aborted during error handling; treat as abort
      this.graph.markNodeInterrupted(nodeId);
      return { ok: false, aborted: true };
    }

    // Real error; mark as failed
    const error = err instanceof Error ? err : new Error(String(err));
    this.graph.markNodeFailed(nodeId, error);
    return { ok: false, aborted: false, error };
  }
}
```

This distinction is critical for state management: aborted nodes should not block the entire graph, whereas failed nodes may trigger error-handling paths (retries, compensation, etc.).

### Race Condition: Abort After Resolve

A subtle race condition can occur when an operation completes (resolves) at nearly the same time the abort signal fires[2]. Consider:

```typescript
// UNSAFE: race condition
const promise = doWork();
signal.addEventListener('abort', () => {
  // What if doWork() already resolved?
  reject(signal.reason);
});
return promise;
```

If `doWork()` resolves before the abort listener can reject, the return value will be the successful result, not an error. The fix is to use `Promise.race()`:

```typescript
// SAFE: properly handled
return Promise.race([
  doWork().then(result => {
    // Remove abort listener to allow GC
    signal.removeEventListener('abort', handleAbort);
    return result;
  }),
  new Promise((_, reject) => {
    signal.addEventListener('abort', handleAbort, { once: true });
    function handleAbort() {
      reject(signal.reason);
    }
  }),
]);
```

Or more elegantly using the `AbortSignal.any()` pattern that combines this race check with other signals[7][22]:

```typescript
// SAFE: with timeout
const timeoutSignal = AbortSignal.timeout(5000);
return new Promise((resolve, reject) => {
  const combinedSignal = AbortSignal.any([signal, timeoutSignal]);
  combinedSignal.addEventListener('abort', () => {
    reject(combinedSignal.reason);
  });
  
  doWork().then(result => {
    // Resolve successfully if work completes before abort
    if (!combinedSignal.aborted) {
      resolve(result);
    }
  }).catch(err => {
    if (!combinedSignal.aborted) {
      reject(err);
    }
  });
});
```

The key principle is: **always race an operation against the abort signal, and always check signal state before using a resolved value**.

## Part 6: Practical Implementation: Complete Executable Example

### Full Orchestration Engine with Abort Support

Here is a production-grade implementation that integrates all patterns:

```typescript
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { setTimeout as setTimeoutPromise } from 'timers/promises';

// ============================================================================
// Core Types
// ============================================================================

type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'interrupted';

interface GraphNode {
  id: string;
  status: NodeStatus;
  output?: any;
  error?: Error;
  startTime?: number;
  endTime?: number;
  interruptedAt?: number;
}

interface GraphState {
  nodes: Map<string, GraphNode>;
  createdAt: number;
  lastIterationAt?: number;
  interruptedAt?: number;
}

interface ExecutionContext {
  readonly signal: AbortSignal;
  readonly nodeId: string;
  readonly iterationId: string;
}

// ============================================================================
// PodManager: Tracks and terminates fire-and-forget pods
// ============================================================================

interface IWorkUnitPod {
  execute(opts: { signal?: AbortSignal }): Promise<any>;
  terminate(): Promise<void>;
  readonly status: string;
}

interface PodEntry {
  nodeId: string;
  pod: IWorkUnitPod;
  controller: AbortController;
  createdAt: number;
}

class PodManager extends EventEmitter {
  private pods = new Map<string, PodEntry>();
  private signal: AbortSignal;

  constructor(signal: AbortSignal) {
    super();
    this.signal = signal;

    // Listen for main abort signal to terminate all pods
    if (!signal.aborted) {
      signal.addEventListener('abort', () => this.terminateAll(), { once: true });
    }
  }

  createPod(nodeId: string, params: any): IWorkUnitPod {
    const controller = new AbortController();
    const derivedSignal = AbortSignal.any([this.signal, controller.signal]);

    // Mock pod for demonstration
    const pod: IWorkUnitPod = {
      async execute(opts) {
        if (derivedSignal.aborted) {
          throw derivedSignal.reason;
        }
        // Simulate async work
        return new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ result: 'success' }), 1000);
          derivedSignal.addEventListener('abort', () => {
            clearTimeout(timer);
            throw derivedSignal.reason;
          }, { once: true });
        });
      },
      async terminate() {
        controller.abort(new DOMException('Termination requested', 'AbortError'));
      },
      get status() {
        return 'running';
      },
    };

    const entry: PodEntry = { nodeId, pod, controller, createdAt: Date.now() };
    this.pods.set(nodeId, entry);

    // Execute pod in background without awaiting
    this.executePodInBackground(nodeId, pod).catch(err => {
      console.error(`Pod ${nodeId} error:`, err);
    });

    return pod;
  }

  private async executePodInBackground(nodeId: string, pod: IWorkUnitPod): Promise<void> {
    try {
      const result = await pod.execute({});
      this.emit('pod-complete', { nodeId, result });
    } finally {
      this.pods.delete(nodeId);
    }
  }

  async terminateAll(timeoutMs: number = 5000): Promise<void> {
    const entries = Array.from(this.pods.values());
    if (entries.length === 0) return;

    const terminatePromises = entries.map(entry =>
      Promise.race([
        entry.pod.terminate(),
        setTimeoutPromise(timeoutMs),
      ]).catch(() => {
        console.warn(`Pod ${entry.nodeId} did not terminate gracefully`);
      })
    );

    await Promise.all(terminatePromises);
    this.pods.clear();
  }

  getActiveCount(): number {
    return this.pods.size;
  }
}

// ============================================================================
// Graph: Tracks node states and resumability
// ============================================================================

class Graph {
  private state: GraphState;

  constructor() {
    this.state = {
      nodes: new Map(),
      createdAt: Date.now(),
    };
  }

  addNode(id: string): void {
    this.state.nodes.set(id, {
      id,
      status: 'pending',
    });
  }

  startNode(id: string): void {
    const node = this.state.nodes.get(id);
    if (node) {
      node.status = 'running';
      node.startTime = Date.now();
    }
  }

  completeNode(id: string, output: any): void {
    const node = this.state.nodes.get(id);
    if (node) {
      node.status = 'completed';
      node.output = output;
      node.endTime = Date.now();
    }
  }

  failNode(id: string, error: Error): void {
    const node = this.state.nodes.get(id);
    if (node) {
      node.status = 'failed';
      node.error = error;
      node.endTime = Date.now();
    }
  }

  interruptNode(id: string): void {
    const node = this.state.nodes.get(id);
    if (node && node.status === 'running') {
      node.status = 'interrupted';
      node.interruptedAt = Date.now();
    }
  }

  interruptAll(): void {
    this.state.interruptedAt = Date.now();
    for (const [, node] of this.state.nodes) {
      if (node.status === 'running') {
        this.interruptNode(node.id);
      }
    }
  }

  resetInterrupted(): void {
    for (const [, node] of this.state.nodes) {
      if (node.status === 'interrupted') {
        node.status = 'pending';
        node.interruptedAt = undefined;
      }
    }
  }

  getState(): GraphState {
    return this.state;
  }

  getRunningNodes(): GraphNode[] {
    return Array.from(this.state.nodes.values()).filter(n => n.status === 'running');
  }

  isResumable(): boolean {
    return this.getRunningNodes().length === 0 || !this.state.interruptedAt;
  }
}

// ============================================================================
// Utilities
// ============================================================================

async function abortableSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason;
  }
  return setTimeoutPromise(delayMs, { signal });
}

// ============================================================================
// Orchestration Engine
// ============================================================================

interface DriveOptions {
  maxIterations?: number;
  actionDelayMs?: number;
  idleDelayMs?: number;
  signal?: AbortSignal;
}

interface DriveResult {
  exitReason: 'complete' | 'stopped' | 'error';
  iterationsCompleted: number;
  graphState: GraphState;
  error?: Error;
}

interface StopResult {
  graphState: GraphState;
  podsTerminated: number;
  completedAt: number;
}

class OrchestrationEngine extends EventEmitter {
  private graph: Graph = new Graph();
  private podManager: PodManager | null = null;
  private abortController: AbortController | null = null;
  private loopRunning = false;

  async drive(options: DriveOptions = {}): Promise<DriveResult> {
    const maxIterations = options.maxIterations ?? 10;
    const actionDelayMs = options.actionDelayMs ?? 100;
    const idleDelayMs = options.idleDelayMs ?? 500;

    // Create fresh controller if not provided
    const signal = options.signal ?? new AbortController().signal;
    this.abortController = options.signal ? null : (signal as any).controller;

    // Create pod manager
    this.podManager = new PodManager(signal);

    this.loopRunning = true;

    try {
      for (let i = 0; i < maxIterations; i++) {
        // Check abort at iteration boundary
        if (signal.aborted) {
          return {
            exitReason: 'stopped',
            iterationsCompleted: i,
            graphState: this.graph.getState(),
          };
        }

        // Run one iteration
        await this.runIteration();
        this.graph.getState().lastIterationAt = Date.now();

        // Sleep with abort support
        try {
          await abortableSleep(actionDelayMs, signal);
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return {
              exitReason: 'stopped',
              iterationsCompleted: i + 1,
              graphState: this.graph.getState(),
            };
          }
          throw err;
        }
      }

      return {
        exitReason: 'complete',
        iterationsCompleted: maxIterations,
        graphState: this.graph.getState(),
      };
    } catch (err) {
      return {
        exitReason: 'error',
        iterationsCompleted: 0,
        graphState: this.graph.getState(),
        error: err instanceof Error ? err : new Error(String(err)),
      };
    } finally {
      this.loopRunning = false;
    }
  }

  private async runIteration(): Promise<void> {
    const nodeIds = ['node-1', 'node-2', 'node-3'];

    for (const nodeId of nodeIds) {
      this.graph.addNode(nodeId);
      this.graph.startNode(nodeId);

      try {
        if (this.podManager) {
          this.podManager.createPod(nodeId, {});
        }
        // Simulate work
        await new Promise(resolve => setTimeout(resolve, 50));
        this.graph.completeNode(nodeId, { success: true });
      } catch (err) {
        this.graph.failNode(nodeId, err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  async stop(): Promise<StopResult> {
    console.log('[STOP] Initiating graceful shutdown');

    // Abort the signal
    if (this.abortController) {
      this.abortController.abort(new DOMException('User stop', 'AbortError'));
    }

    // Mark running nodes as interrupted
    this.graph.interruptAll();

    // Terminate all pods
    const podsTerminated = this.podManager?.getActiveCount() ?? 0;
    if (this.podManager) {
      await this.podManager.terminateAll();
    }

    // Wait for loop to exit
    let attempts = 0;
    while (this.loopRunning && attempts < 50) {
      await abortableSleep(10);
      attempts++;
    }

    console.log('[STOP] Complete');
    return {
      graphState: this.graph.getState(),
      podsTerminated,
      completedAt: Date.now(),
    };
  }

  async resume(options: { resetInterrupted?: boolean } = {}): Promise<DriveResult> {
    if (options.resetInterrupted) {
      this.graph.resetInterrupted();
    }
    return this.drive({ maxIterations: 10, actionDelayMs: 100 });
  }

  getGraphState(): GraphState {
    return this.graph.getState();
  }
}

// ============================================================================
// Usage Example
// ============================================================================

async function main() {
  const engine = new OrchestrationEngine();

  // Start driving the engine
  const drivePromise = engine.drive({ maxIterations: 100, actionDelayMs: 200 });

  // Simulate user stop after 1 second
  setTimeout(async () => {
    console.log('\n=== USER REQUESTED STOP ===\n');
    const stopResult = await engine.stop();
    console.log('Stop result:', stopResult);
  }, 1000);

  const result = await drivePromise;
  console.log('\nDrive result:', result);
}

main().catch(console.error);
```

This complete example demonstrates:

1. An `OrchestrationEngine` that drives a polling loop with abort support
2. A `PodManager` that tracks fire-and-forget pods and terminates them gracefully
3. A `Graph` that distinguishes between completed, failed, and interrupted nodes
4. An `abortableSleep()` utility that respects abort signals
5. A `stop()` method that coordinates abort across all subsystems
6. Type-safe signal propagation via ExecutionContext

## Part 7: Production Deployment and Operational Patterns

### Integration with CLI and Web Server Contexts

The abort mechanism must work correctly whether the orchestration engine is called from a CLI (where Ctrl+C sends SIGINT) or from a web server (where an HTTP request cancellation comes from the client). The pattern is to create the AbortController at the integration boundary and pass the signal to the engine:

```typescript
// CLI integration
async function runCliCommand() {
  const controller = new AbortController();

  // Listen for SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    console.log('\nInterrupt signal received');
    controller.abort(new DOMException('CLI interrupt', 'AbortError'));
  });

  const engine = new OrchestrationEngine();
  const result = await engine.drive({
    maxIterations: 1000,
    actionDelayMs: 100,
    signal: controller.signal,
  });

  console.log('Engine result:', result);
  process.exit(result.exitReason === 'complete' ? 0 : 1);
}

// Web server integration (Express)
import express from 'express';

const app = express();

app.post('/workflow/start', async (req, res) => {
  const controller = new AbortController();

  // Listen for client disconnect
  req.on('close', () => {
    console.log('Client disconnected');
    controller.abort(new DOMException('Client disconnect', 'AbortError'));
  });

  const engine = new OrchestrationEngine();
  const result = await engine.drive({
    maxIterations: 1000,
    signal: controller.signal,
  });

  res.json({ result });
});

app.post('/workflow/stop', async (req, res) => {
  // Assume engine is stored in app.locals or similar
  const engine = app.locals.currentEngine;
  if (engine) {
    const stopResult = await engine.stop();
    res.json(stopResult);
  } else {
    res.status(404).json({ error: 'No engine running' });
  }
});
```

This approach ensures that the signal is created at the outermost scope where external events can trigger abort (SIGINT from the shell, client disconnect from the web framework), and the signal is propagated inward to the engine and all its subsystems.

### Monitoring and Observability

For production systems, detailed logging of abort and termination events is essential:

```typescript
class ObservableOrchestrationEngine extends OrchestrationEngine {
  private logger = console; // Replace with proper logging library

  async stop(): Promise<StopResult> {
    this.logger.info('STOP_INITIATED', {
      timestamp: new Date().toISOString(),
      graphState: this.getGraphState(),
    });

    const startTime = Date.now();
    const result = await super.stop();

    this.logger.info('STOP_COMPLETED', {
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      ...result,
    });

    return result;
  }

  async drive(options?: DriveOptions): Promise<DriveResult> {
    this.logger.info('DRIVE_STARTED', { options });
    const startTime = Date.now();

    const result = await super.drive(options);

    this.logger.info('DRIVE_COMPLETED', {
      duration: Date.now() - startTime,
      exitReason: result.exitReason,
      iterationsCompleted: result.iterationsCompleted,
      graphState: result.graphState,
    });

    return result;
  }
}
```

Observability enables operators to understand the system's behavior and diagnose issues quickly when abort and termination don't work as expected.

## Part 8: Conclusion and Recommendations

The implementation of cooperative cancellation in a TypeScript/Node.js orchestration engine requires careful coordination across multiple async subsystems. The core pattern—using AbortController/AbortSignal as the primary cancellation mechanism, propagating the signal through all async boundaries, implementing graceful termination sequences with timeouts, and maintaining state resumability by distinguishing interruption from failure—provides both **immediate responsiveness** and **data consistency**.

Key takeaways for production deployment:

First, **always use cooperative cancellation** instead of preemptive force-kill. Cooperative cancellation gives code a chance to reach safe cleanup points, preserving state consistency and enabling resumability[6][23].

Second, **make sleep abortable**. Since the polling loop spends most of its time sleeping, abortable sleep is the choke point that gives users responsive control[1][9].

Third, **track fire-and-forget work explicitly**. Use a manager (PodManager, ScriptRunner) to maintain a registry of all outstanding work, so that when abort is signaled, you can find and gracefully terminate all outstanding work[2].

Fourth, **propagate the signal through all async boundaries**. Use AbortSignal.any() to combine multiple cancellation sources (main signal, timeout, pod-specific timeout) into a single signal that all code can observe[7][22].

Fifth, **distinguish interruption from failure** in graph state. Running nodes that are interrupted by user stop should be marked differently from nodes that failed due to errors, enabling resumable workflows[12][24][25].

Sixth, **handle listener cleanup carefully** to avoid memory leaks. Use { once: true } when appropriate, remove listeners explicitly when components are destroyed, and prefer short-lived derived signals over long-lived listeners[4][22][28].

Seventh, **test race conditions carefully**. The interactions between abort, resolve, timeout, and cleanup can create subtle race conditions. Use Promise.race() to protect against abort-after-resolve scenarios[2].

Finally, **integrate abort at the system boundary**. Create the primary AbortController at the outermost scope where external events trigger cancellation (SIGINT from shell, HTTP disconnect from web framework), and propagate the signal inward to the engine and all subsystems[13][23].

With these patterns in place, the orchestration engine gains the ability to be stopped immediately while remaining in a consistent, resumable state—a critical capability for production systems that must balance responsiveness with reliability[6][23][24].

Citations:
[1] https://gist.github.com/padcom/44ab0edcea7ee6818c68ae66b7c80e27
[2] https://www.sniki.dev/posts/silent-server-killer/
[3] https://github.com/electron/electron/issues/31737
[4] https://dev.to/hexshift/how-to-use-abortcontroller-for-cleaner-event-listener-cleanup-in-react-4hj7
[5] https://docs.python.org/3/library/asyncio-task.html
[6] https://oneuptime.com/blog/post/2025-12-23-handle-thread-abort-exceptions-dotnet/view
[7] https://codedrivendevelopment.com/posts/everything-about-abort-signal-timeout
[8] https://flowcraft.js.org/guide/pausing
[9] https://nodejs.org/api/timers.html
[10] https://github.com/github/copilot-sdk/issues/526
[11] https://dev.to/pipipi-dev/typescript-strict-mode-in-practice-catching-bugs-with-type-safety-2jo9
[12] https://techcommunity.microsoft.com/blog/systemcenterblog/service-management-automation-checkpoint-suspend-and-resume-runbooks/349241
[13] https://nodejs.org/api/child_process.html
[14] https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort
[15] https://zuplo.com/learning-center/api-versioning-backward-compatibility-best-practices
[16] https://www.youtube.com/watch?v=FPVzevl6Ri8
[17] https://docs.microfocus.com/doc/397/25.4/upgraderollback
[18] https://github.com/oven-sh/bun/issues/26392
[19] https://www.30secondsofcode.org/js/s/await-timeout
[20] https://oneuptime.com/blog/post/2026-01-22-nodejs-event-emitters/view
[21] https://github.com/whatwg/streams/issues/1255
[22] https://blog.webdevsimplified.com/2025-06/advanced-abort-controller/
[23] https://www.suse.com/c/observability-sigkill-vs-sigterm-a-developers-guide-to-process-termination/
[24] https://docs.langchain.com/oss/javascript/langgraph/persistence
[25] https://docs.spryker.com/docs/dg/dev/ai/ai-foundation/ai-foundation-workflow-state-machine.html
[26] https://oneuptime.com/blog/post/2026-01-30-typescript-type-safe-state-machines/view
[27] https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/implementing-disposeasync
[28] https://github.com/whatwg/dom/issues/946
[29] https://github.com/tc39/proposal-explicit-resource-management
[30] https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
