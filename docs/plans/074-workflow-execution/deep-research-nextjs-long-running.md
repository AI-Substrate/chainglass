# Hosting Long-Running Workflow Orchestration in Next.js 16: A Comprehensive Architecture Guide

This report provides a production-ready architectural framework for hosting long-running workflow orchestration engines in Next.js 16.1.6 with App Router, addressing the fundamental constraint that server actions are request-scoped and cannot sustain multi-minute polling loops. The recommended approach combines a `globalThis`-based singleton execution manager bootstrapped during server initialization, a dedicated event-driven architecture using Server-Sent Events for progress reporting, and strategic use of Node.js primitives (AbortController, worker threads, or child processes) depending on workload characteristics. The solution preserves execution state across Hot Module Replacement in development while maintaining production-ready isolation and observability. Key implementation patterns include: (1) a stateful `WorkflowExecutionManager` registered in `instrumentation.ts`, (2) server actions that trigger execution start/stop without awaiting completion, (3) SSE multiplexing for progress broadcast, and (4) filesystem-backed checkpoint state for recovery on server restart. Race conditions are mitigated through atomic operations and execution locking mechanisms, while memory leaks are prevented by explicit cleanup hooks and process resource tracking. This architecture scales to support concurrent workflows across multiple users and integrates seamlessly with existing Next.js ecosystem tools including dependency injection containers and middleware-based request isolation.

## Understanding the Runtime Constraints of Next.js Server Actions and Serverless Contexts

The foundational issue underlying this architecture problem stems from a deep incompatibility between the ephemeral nature of serverless function execution and the long-lived stateful processes required by workflow orchestration. Server actions in Next.js 16 App Router are implemented as POST-only endpoints that execute once per invocation and terminate when the response is sent[1]. While this design provides excellent isolation, automatic caching integration, and serialization safety, it directly contradicts the requirements of a polling orchestration loop that must maintain state across multiple cycles and respond to external events over minutes.

The architectural problem compounds when considering how Next.js handles development mode. In development with Hot Module Replacement (HMR), the server receives a SIGTERM signal on file changes and reinitializes the process[6]. Any background task spawned from a server action during one HMR cycle will be orphaned when the next reload occurs, leading to resource leaks and silent failures. Similarly, in production when using Vercel's serverless platform or container-based deployments, function lifecycle is tied strictly to request duration. Attempting to fire-and-forget a background task via `fetch()` without awaiting it fails because un-awaited promises are not guaranteed to complete before the function exits[3].

The solution requires shifting the execution model from request-scoped to process-scoped. This means bootstrapping the orchestration infrastructure during server initialization—before any request arrives—and maintaining execution state in memory or on the filesystem in a way that survives request boundaries, HMR cycles, and server restarts.

## The Singleton Pattern with globalThis: Guaranteeing Single-Instance Bootstrapping

The most robust pattern for hosting a long-running service in Next.js is the singleton manager bootstrapped in `instrumentation.ts`, stored in `globalThis`, and guarded against multiple instantiation. This approach guarantees that the expensive initialization happens exactly once per server process lifecycle, even as the application code is reloaded via HMR[2][10].

The pattern works because `instrumentation.ts` is evaluated exactly once when the Next.js server instance is initiated, before route handlers or server components are executed[16]. The `register()` function exported from this file has special semantics: it is called once per server lifecycle and must complete before the server is ready to handle requests. By contrast, route handlers and server components are reloaded on HMR, breaking singleton guarantees if the orchestration manager is instantiated there.

In development mode, although HMR reloads the app code multiple times, `instrumentation.ts` is not re-executed on every file change—only on server restart. This creates a "stable singleton window" where the manager remains in memory across HMR cycles. However, this is not guaranteed by documentation and relies on implementation details, so the pattern must include defensive checks:

```typescript
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node')
  }
}

// instrumentation-node.ts
import { WorkflowExecutionManager } from '@/services/workflow/execution-manager'

declare global {
  var workflowExecutionManager: WorkflowExecutionManager | undefined
}

if (!globalThis.workflowExecutionManager) {
  globalThis.workflowExecutionManager = new WorkflowExecutionManager()
  console.log('[Instrumentation] WorkflowExecutionManager initialized')
}

export const getExecutionManager = () => {
  if (!globalThis.workflowExecutionManager) {
    throw new Error(
      'WorkflowExecutionManager not initialized. ' +
      'This should only happen if called from Edge runtime.'
    )
  }
  return globalThis.workflowExecutionManager
}
```

This pattern solves the single-instantiation problem but introduces a secondary concern: the manager must be aware that it may receive SIGTERM during HMR in development[6]. The manager should register a signal handler that gracefully terminates running executions:

```typescript
export class WorkflowExecutionManager {
  private executions = new Map<string, WorkflowExecution>()
  private signalHandler?: () => Promise<void>

  constructor() {
    this.setupSignalHandlers()
  }

  private setupSignalHandlers() {
    const cleanup = async () => {
      console.log('[WorkflowExecutionManager] Received SIGTERM, cleaning up')
      
      // Signal all running executions to stop
      const stopPromises = Array.from(this.executions.values()).map(exec => 
        exec.stop()
      )
      
      await Promise.allSettled(stopPromises)
      
      // Wait for graceful shutdown (max 5 seconds)
      await Promise.race([
        Promise.all(
          Array.from(this.executions.values()).map(exec => exec.waitForTermination())
        ),
        new Promise(resolve => setTimeout(resolve, 5000))
      ])
      
      console.log('[WorkflowExecutionManager] Cleanup complete')
    }
    
    this.signalHandler = cleanup
    process.on('SIGTERM', cleanup)
  }
}
```

A critical limitation of the `globalThis` singleton pattern is that Webpack's bundling strategy can create multiple chunks during the build phase, each containing a copy of the instrumentation code[10]. In development with Turbopack, this risk is lower, but in production builds with the standalone output, developers must verify that the instrumentation file is correctly placed in the standalone folder and that no module duplication occurs. This can be validated by examining the `.nft.json` trace files emitted during `next build`[15].

The pattern also requires explicit understanding of when the singleton is safe to use. It is safe to access from:
- Route handlers (API routes and catch-all routes)
- Server components in layouts and pages
- Server actions (invoked from client components)
- Other instrumentation code

It is **not** safe to access from client components, even though they may import the file, because they cannot use the `globalThis` reference that points to server-side state.

## Worker Threads vs. Child Processes: Threading Model Decisions

Once the orchestration manager is bootstrapped in `globalThis`, the next architectural decision concerns where the actual orchestration loop runs. The manager itself must live in the Node.js main thread to remain accessible to request handlers, but the inner polling loop—which calls `drive()` repeatedly—can be offloaded to either a worker thread or a child process.

**Worker threads** are lighter-weight than child processes. They share the same V8 heap and are cheaper to spawn and communicate with[4]. When the orchestration loop is moved to a worker thread via `new Worker()`, the main thread remains free to handle HTTP requests while the worker executes the `drive()` method in a separate thread. Communication happens via `postMessage()`, which is efficient for structured data:

```typescript
import { Worker } from 'worker_threads'
import path from 'path'

export class WorkflowExecution {
  private worker?: Worker
  private abortController = new AbortController()

  async start(graphId: string, config: OrchestrationType) {
    const workerPath = path.resolve(
      process.cwd(),
      require.resolve('@/workers/orchestration.worker.ts')
    )

    this.worker = new Worker(workerPath, {
      workerData: { graphId, config }
    })

    this.worker.on('message', (event: DriveEvent) => {
      this.onEvent(event)
    })

    this.worker.on('error', (error) => {
      console.error(`[WorkflowExecution ${graphId}] Worker error:`, error)
      this.abortController.abort(error)
    })

    this.worker.on('exit', (code) => {
      if (code !== 0 && !this.abortController.signal.aborted) {
        console.error(`[WorkflowExecution ${graphId}] Worker exited with code ${code}`)
        this.abortController.abort(new Error(`Worker exited with code ${code}`))
      }
    })
  }

  async stop() {
    this.abortController.abort()
    if (this.worker) {
      await this.worker.terminate()
    }
  }
}
```

```typescript
// workers/orchestration.worker.ts
import { workerData, parentPort } from 'worker_threads'
import { GraphOrchestration } from '@/services/workflow/orchestration'

const { graphId, config } = workerData
const orchestration = new GraphOrchestration(graphId, config)

orchestration.on('event', (event) => {
  parentPort?.postMessage(event)
})

const abortController = new AbortController()
parentPort?.on('message', (msg) => {
  if (msg.type === 'stop') {
    abortController.abort()
  }
})

// Run the orchestration loop
orchestration.drive(abortController.signal)
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('Orchestration error:', error)
    process.exit(1)
  })
```

**Child processes**, by contrast, are heavier but provide complete process isolation. Spawning a child process via `child_process.fork()` creates a separate Node.js runtime with its own heap, garbage collector, and resource allocations[14]. This isolation prevents memory leaks in the main process and allows for process-level resource limits (CPU, memory). Communication happens via the same `send()`/`on('message')` IPC protocol that worker threads use, but with higher overhead.

The choice depends on workload characteristics. For CPU-bound orchestration with heavy computation (e.g., AI inference, large data processing), worker threads offer better throughput because they share the heap and avoid serialization overhead. For long-running workflows that might accumulate memory or hold resource handles, child processes provide better isolation and allow graceful cleanup via process termination. In the case of the described orchestration engine—which mostly coordinates I/O (spawning agent pods, polling state) rather than computing—a child process is justified because:

1. Each execution is logically independent; isolation prevents state leaks
2. The orchestration loop can fail catastrophically without blocking other executions
3. Resource cleanup via `kill()` is simpler and more reliable than manual memory management
4. Process monitoring tools can track resource consumption per workflow

Child process spawning in Next.js requires careful configuration. When using `next build --output standalone`, the output folder contains a `server.js` file and a `.next/standalone` directory. Worker files must be manually placed in the correct location because the bundler does not automatically include them[4]:

```javascript
// next.config.js
module.exports = {
  output: 'standalone',
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.output.publicPath = ''
    }
    return config
  }
}
```

Then, after building, copy worker scripts to the standalone folder:

```bash
cp -r src/workers .next/standalone/
```

In production, the child process path must be resolved relative to the standalone runtime:

```typescript
const workerPath = path.resolve(
  process.cwd(),
  'workers/orchestration.worker.js' // relative to server.js in standalone
)

const worker = spawn('node', [workerPath], {
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  signal: this.abortController.signal
})
```

A crucial performance consideration: spawning child processes is expensive in Node.js, with a throughput limit around 40 spawns/second on a single thread without optimization[18]. For a workflow orchestration system that may spawn many agent pods during execution, moving the spawn calls themselves to worker threads can dramatically improve throughput:

```typescript
// Main thread spawns a worker pool
const workerPool = [
  new Worker('./pod-spawner.worker.ts'),
  new Worker('./pod-spawner.worker.ts'),
  new Worker('./pod-spawner.worker.ts')
]

let roundRobinIndex = 0

async function spawnAgentPod(podSpec: PodSpec): Promise<string> {
  const worker = workerPool[roundRobinIndex % workerPool.length]
  roundRobinIndex++
  
  return new Promise((resolve, reject) => {
    const messageId = crypto.randomUUID()
    const timeout = setTimeout(() => reject(new Error('Spawn timeout')), 30000)
    
    const handler = (msg: { id: string; podId?: string; error?: string }) => {
      if (msg.id === messageId) {
        clearTimeout(timeout)
        worker.off('message', handler)
        if (msg.error) reject(new Error(msg.error))
        else resolve(msg.podId!)
      }
    }
    
    worker.on('message', handler)
    worker.postMessage({ id: messageId, spec: podSpec })
  })
}
```

This pattern sacrifices some isolation for throughput and is appropriate when the spawned processes are short-lived and numerous.

## API Routes vs. Server Actions: The Triggering Mechanism

With the execution manager bootstrapped in `globalThis` and ready to manage long-running workflows, the next question is how to trigger execution from the web UI. Two patterns are viable: server actions and API routes.

**Server actions** are lighter-weight and integrate naturally with forms and client event handlers[1]. A server action can start an execution synchronously and return a run ID:

```typescript
'use server'

import { getExecutionManager } from '@/instrumentation-node'

export async function startWorkflow(graphId: string) {
  const manager = getExecutionManager()
  const runId = await manager.startExecution(graphId)
  return { runId }
}

export async function stopWorkflow(runId: string) {
  const manager = getExecutionManager()
  await manager.stopExecution(runId)
}
```

The advantage of this pattern is that it requires no additional endpoint code and integrates with `useFormState` hooks for error handling. However, server actions have a hard timeout of 15 seconds on Vercel's serverless platform—if the `startExecution()` method performs any non-trivial work (e.g., initializing the execution state, creating filesystem checkpoints), it may timeout[22].

**API routes** offer more control over timeouts and can be configured with `maxDuration` to extend execution time to 300 seconds:

```typescript
// app/api/workflows/start/route.ts
'use server'

export const maxDuration = 30 // seconds

export async function POST(request: Request) {
  const { graphId } = await request.json()
  const manager = getExecutionManager()
  
  try {
    const runId = await manager.startExecution(graphId)
    return Response.json({ runId }, { status: 200 })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

The recommended pattern is a hybrid approach: use **server actions for simple triggering** (which should be nearly instantaneous, returning immediately after queuing), and **API routes for operations that require extended execution time** (e.g., initializing from a checkpoint, performing a blocking pre-flight validation). The key is to distinguish between:

1. **Trigger operations**: Start/stop signals that queue work but do not wait for completion
2. **Status operations**: Synchronous reads of current execution state
3. **Initialization operations**: Expensive one-time setup that may take multiple seconds

Trigger operations should complete in milliseconds:

```typescript
export async function startWorkflow(graphId: string) {
  const manager = getExecutionManager()
  const runId = manager.queueExecution(graphId) // Returns immediately
  return { runId }
}
```

The actual `drive()` loop begins asynchronously after the request completes, triggered by the queuing operation.

## The SSE Bridge: Streaming Progress from Long-Running Processes to Browsers

Once the orchestration loop is running in a background process or worker thread, progress updates must be streamed to connected browsers in real time. The described architecture already has SSE infrastructure via `/api/events/mux`, so the integration point is bridging from the `DriveEvent` callback to the multiplexed SSE channel.

The orchestration manager maintains a list of active listeners for each execution:

```typescript
export class WorkflowExecutionManager {
  private eventListeners = new Map<string, Set<(event: DriveEvent) => void>>()

  registerEventListener(runId: string, listener: (event: DriveEvent) => void) {
    if (!this.eventListeners.has(runId)) {
      this.eventListeners.set(runId, new Set())
    }
    this.eventListeners.get(runId)!.add(listener)
    
    return () => {
      this.eventListeners.get(runId)?.delete(listener)
    }
  }

  private broadcastEvent(runId: string, event: DriveEvent) {
    this.eventListeners.get(runId)?.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        console.error('Error in event listener:', error)
      }
    })
  }
}
```

The SSE route establishes a long-lived HTTP connection and subscribes to execution events, forwarding them to the multiplexed channel:

```typescript
// app/api/events/mux/route.ts
import { getExecutionManager } from '@/instrumentation-node'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const runId = searchParams.get('runId')
  
  if (!runId) {
    return Response.json({ error: 'Missing runId' }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const controller = new ReadableStreamDefaultController<Uint8Array>()
  
  const readable = new ReadableStream({
    start: async (ctrl) => {
      const manager = getExecutionManager()
      
      // Subscribe to execution events
      const unsubscribe = manager.registerEventListener(runId, (event) => {
        const data = JSON.stringify({ channel: runId, data: event })
        const encoded = encoder.encode(`data: ${data}\n\n`)
        ctrl.enqueue(encoded)
      })

      // Keep connection alive and detect disconnection
      request.signal.addEventListener('abort', () => {
        unsubscribe()
        ctrl.close()
      })

      // Periodically send heartbeat to detect stale connections
      const heartbeatInterval = setInterval(() => {
        const heartbeat = encoder.encode(`: heartbeat\n\n`)
        ctrl.enqueue(heartbeat)
      }, 30000)

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeatInterval)
      })
    }
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream;charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  })
}
```

On the client side, React hooks consume the SSE stream and update UI state:

```typescript
// hooks/useWorkflowProgress.ts
'use client'

import { useEffect, useState } from 'react'

export function useWorkflowProgress(runId: string) {
  const [events, setEvents] = useState<DriveEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!runId) return

    let eventSource: EventSource | null = null
    let reconnectTimeout: NodeJS.Timeout

    const connect = () => {
      try {
        eventSource = new EventSource(`/api/events/mux?runId=${encodeURIComponent(runId)}`)
        
        eventSource.addEventListener('message', (event) => {
          try {
            const { channel, data } = JSON.parse(event.data)
            if (channel === runId) {
              setEvents(prev => [...prev, data])
              setError(null)
            }
          } catch (e) {
            console.error('Failed to parse event:', e)
          }
        })

        eventSource.addEventListener('error', () => {
          setConnected(false)
          eventSource?.close()
          
          // Exponential backoff reconnection
          reconnectTimeout = setTimeout(connect, 5000)
        })

        setConnected(true)
      } catch (e) {
        setError(e instanceof Error ? e : new Error('Connection failed'))
        reconnectTimeout = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      eventSource?.close()
      clearTimeout(reconnectTimeout)
    }
  }, [runId])

  return { events, connected, error }
}
```

This pattern achieves real-time progress reporting without polling. The latency is bounded by the SSE channel (typically sub-100ms) and there is no request thundering because the browser maintains a single persistent connection per run ID.

## Designing the Execution Manager: State, Locking, and Concurrency

The `WorkflowExecutionManager` is the central coordinator that manages the lifecycle of multiple concurrent executions. It must handle:

1. Starting executions (queuing work, spawning background processes)
2. Tracking running executions by ID
3. Broadcasting events to listeners
4. Stopping executions gracefully
5. Cleaning up resources when executions complete
6. Recovering from crashes or unexpected termination

The manager maintains an in-memory state machine per execution:

```typescript
type ExecutionState = 
  | 'queued'
  | 'initializing'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'failed'
  | 'completed'

export interface WorkflowExecution {
  runId: string
  graphId: string
  state: ExecutionState
  progress: {
    iteration: number
    nodesCompleted: number
    nodesTotalCount: number
  }
  error?: Error
  startedAt: Date
  completedAt?: Date
}

export class WorkflowExecutionManager {
  private executions = new Map<string, WorkflowExecution>()
  private workers = new Map<string, Worker>()
  private eventListeners = new Map<string, Set<(event: DriveEvent) => void>>()
  private executionMutex = new Map<string, Promise<void>>()

  async startExecution(graphId: string, config?: OrchestrationType): Promise<string> {
    const runId = crypto.randomUUID()
    
    // Serialize concurrent modifications to the same graphId
    const previousMutex = this.executionMutex.get(graphId) ?? Promise.resolve()
    const mutex = previousMutex.then(async () => {
      const execution: WorkflowExecution = {
        runId,
        graphId,
        state: 'queued',
        progress: { iteration: 0, nodesCompleted: 0, nodesTotalCount: 0 },
        startedAt: new Date()
      }
      
      this.executions.set(runId, execution)
      this.broadcastEvent(runId, { type: 'status', state: 'queued' })
      
      // Spawn orchestration loop asynchronously
      setImmediate(() => this.initializeAndRun(runId, graphId, config))
    })
    
    this.executionMutex.set(graphId, mutex)
    await mutex
    
    return runId
  }

  private async initializeAndRun(
    runId: string,
    graphId: string,
    config?: OrchestrationType
  ) {
    const execution = this.executions.get(runId)!
    
    try {
      execution.state = 'initializing'
      this.broadcastEvent(runId, { type: 'status', state: 'initializing' })
      
      // Initialize orchestration engine
      const orchestration = new GraphOrchestration(graphId, config)
      
      // Restore from checkpoint if available
      const checkpoint = await this.loadCheckpoint(runId)
      if (checkpoint) {
        orchestration.restoreState(checkpoint)
        this.broadcastEvent(runId, { type: 'status', message: 'Resumed from checkpoint' })
      }
      
      execution.state = 'running'
      this.broadcastEvent(runId, { type: 'status', state: 'running' })
      
      // Run the orchestration loop
      const abortController = new AbortController()
      
      // Listen for stop signal
      const stopListener = () => {
        abortController.abort()
      }
      this.eventListeners.get(runId)?.add(stopListener)
      
      await orchestration.drive(abortController.signal, (event) => {
        // Bridge DriveEvent to SSE
        execution.progress = {
          iteration: event.iteration ?? execution.progress.iteration,
          nodesCompleted: event.nodesCompleted ?? execution.progress.nodesCompleted,
          nodesTotalCount: event.nodesTotalCount ?? execution.progress.nodesTotalCount
        }
        this.broadcastEvent(runId, event)
      })
      
      execution.state = 'completed'
      execution.completedAt = new Date()
      this.broadcastEvent(runId, { type: 'status', state: 'completed' })
      
    } catch (error) {
      execution.state = 'failed'
      execution.error = error instanceof Error ? error : new Error(String(error))
      execution.completedAt = new Date()
      this.broadcastEvent(runId, {
        type: 'error',
        message: execution.error.message
      })
    } finally {
      // Clean up
      this.executions.delete(runId)
      this.workers.delete(runId)
      this.eventListeners.delete(runId)
    }
  }

  async stopExecution(runId: string): Promise<void> {
    const execution = this.executions.get(runId)
    if (!execution) {
      throw new Error(`Execution ${runId} not found`)
    }
    
    execution.state = 'stopping'
    this.broadcastEvent(runId, { type: 'status', state: 'stopping' })
    
    // Signal all listeners (including the abort controller in drive loop)
    const listeners = this.eventListeners.get(runId) ?? new Set()
    listeners.forEach(listener => {
      try {
        listener({ type: 'stop' } as any)
      } catch (e) {
        // Ignore listener errors during shutdown
      }
    })
    
    // Wait for graceful termination (with timeout)
    await Promise.race([
      new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (execution.state === 'stopped' || execution.state === 'failed') {
            clearInterval(checkInterval)
            resolve(undefined)
          }
        }, 100)
      }),
      new Promise(resolve => setTimeout(resolve, 10000))
    ])
  }

  private async loadCheckpoint(runId: string): Promise<OrchestrationState | null> {
    const checkpointPath = path.join(process.cwd(), 'checkpoints', `${runId}.json`)
    try {
      const data = await fs.promises.readFile(checkpointPath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  }
}
```

The mutex pattern here prevents concurrent modifications to the same graphId's state, which is important because multiple users might trigger overlapping workflows on the same graph. The `executionMutex` map ensures that state initialization is serialized even though the orchestration loop itself runs asynchronously.

## Hot Module Replacement and Server Restart Handling

The singleton pattern creates a subtle race condition during HMR in development. When the file watcher detects a change, Next.js:

1. Broadcasts a reload event to connected clients
2. Gracefully shuts down the server (or waits for connections to close)
3. Reinitializes the server with new code

If an orchestration loop is running during step 2, the SIGTERM signal must be caught and handled gracefully. The instrumentation setup should register a SIGTERM handler that gives the execution manager time to clean up:

```typescript
// instrumentation-node.ts
if (!globalThis.workflowExecutionManager) {
  globalThis.workflowExecutionManager = new WorkflowExecutionManager()
  
  // Setup graceful shutdown for HMR
  process.on('SIGTERM', async () => {
    console.log('[Instrumentation] Received SIGTERM, initiating graceful shutdown')
    
    const manager = globalThis.workflowExecutionManager
    const executions = manager.getAllExecutions()
    
    // Signal all executions to stop
    const stopPromises = executions.map(exec =>
      manager.stopExecution(exec.runId).catch(e => {
        console.error(`Failed to stop execution ${exec.runId}:`, e)
      })
    )
    
    // Wait for graceful shutdown (up to 5 seconds)
    await Promise.race([
      Promise.all(stopPromises),
      new Promise(resolve => setTimeout(resolve, 5000))
    ])
    
    console.log('[Instrumentation] Graceful shutdown complete, exiting')
    process.exit(0)
  })
}
```

However, there is a deeper issue: if the orchestration loop is running in a child process spawned by the manager, that child process will not automatically receive SIGTERM when the parent shuts down. The parent must explicitly terminate child processes before exiting:

```typescript
private async cleanup() {
  const promises = Array.from(this.workers.values()).map(worker => {
    return new Promise<void>((resolve) => {
      worker.kill('SIGTERM')
      
      const timeout = setTimeout(() => {
        worker.kill('SIGKILL')
        resolve()
      }, 2000)
      
      worker.on('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
    })
  })
  
  await Promise.all(promises)
}
```

In production with `next build --output standalone`, the server runs as a single process (`node .next/standalone/server.js`). The orchestration manager survives across the lifetime of that process. When deploying a new version, the container is stopped (SIGTERM sent), old container exits, and new container starts with fresh `globalThis` state. This is the intended behavior: executions do not persist across deployments.

For deployments that require execution persistence (e.g., long-running workflows that must survive a rolling update), the manager must save checkpoint state to the filesystem and implement recovery logic that runs during initialization. The `loadCheckpoint()` pattern shown earlier supports this.

## Filesystem-Based Checkpointing for Disaster Recovery

The orchestration engine already persists state to the filesystem after each iteration. This provides the foundation for recovery from crashes or unexpected restarts. The execution manager can leverage this by:

1. Detecting incomplete executions on startup
2. Attempting to resume them from the last checkpoint
3. Notifying users that execution resumed

```typescript
export class WorkflowExecutionManager {
  async initialize() {
    const checkpointDir = path.join(process.cwd(), 'checkpoints')
    
    try {
      const files = await fs.promises.readdir(checkpointDir)
      const checkpointFiles = files.filter(f => f.endsWith('.json'))
      
      for (const file of checkpointFiles) {
        const checkpointPath = path.join(checkpointDir, file)
        const data = await fs.promises.readFile(checkpointPath, 'utf-8')
        const checkpoint = JSON.parse(data)
        
        if (checkpoint.state === 'running' || checkpoint.state === 'initializing') {
          console.log(`[ExecutionManager] Found incomplete execution ${checkpoint.runId}, attempting recovery`)
          
          // Resume execution asynchronously
          setImmediate(() => {
            this.initializeAndRun(
              checkpoint.runId,
              checkpoint.graphId,
              checkpoint.config
            )
          })
        }
      }
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        console.error('[ExecutionManager] Error during checkpoint recovery:', error)
      }
    }
  }
}

// Call during instrumentation setup
if (!globalThis.workflowExecutionManager) {
  globalThis.workflowExecutionManager = new WorkflowExecutionManager()
  await globalThis.workflowExecutionManager.initialize()
}
```

Checkpoint structure should include metadata for recovery:

```json
{
  "runId": "abc-123",
  "graphId": "my-graph",
  "state": "running",
  "lastIteration": 42,
  "startedAt": "2026-03-13T22:00:00Z",
  "checkpointedAt": "2026-03-13T22:05:30Z",
  "orchestrationState": { }
}
```

With this pattern, a workflow interrupted by a server crash can be automatically resumed from the exact iteration where it left off, with no data loss beyond the incomplete current iteration.

## Race Conditions and Atomic Operations

When multiple server processes or request handlers interact with the execution manager, race conditions can arise. The primary concern is concurrent modifications to execution state. Using a mutex per graphId prevents concurrent start operations on the same graph, but other scenarios require additional protection:

**Scenario 1: Concurrent stop requests**. If two clients send stop signals for the same execution, the second should be idempotent:

```typescript
async stopExecution(runId: string): Promise<void> {
  const execution = this.executions.get(runId)
  if (!execution) {
    throw new Error(`Execution ${runId} not found`)
  }
  
  // Only stop if not already stopping
  if (execution.state === 'stopping' || execution.state === 'stopped') {
    return
  }
  
  execution.state = 'stopping'
  // ... broadcast and wait ...
}
```

**Scenario 2: Concurrent checkpoint writes**. The orchestration engine writes checkpoints after each iteration. To prevent partial writes, use atomic operations:

```typescript
private async saveCheckpoint(runId: string, state: OrchestrationState) {
  const checkpointDir = path.join(process.cwd(), 'checkpoints')
  const checkpointPath = path.join(checkpointDir, `${runId}.json`)
  const tempPath = `${checkpointPath}.tmp`
  
  // Write to temp file first
  await fs.promises.writeFile(
    tempPath,
    JSON.stringify(state, null, 2),
    'utf-8'
  )
  
  // Atomically move temp to final location
  await fs.promises.rename(tempPath, checkpointPath)
}
```

The atomic rename ensures that the checkpoint file is never in a partially-written state.

## Production Deployment and Observability

When deploying to production, several considerations apply:

**Resource Limits**: In containerized deployments, the orchestration engine may be limited by memory or CPU quotas. The execution manager should monitor resource usage and gracefully degrade:

```typescript
async initializeAndRun(runId: string, graphId: string, config?: OrchestrationType) {
  const resourceMonitor = setInterval(() => {
    const memUsage = process.memoryUsage()
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100
    
    if (heapUsedPercent > 90) {
      console.warn(`[ExecutionManager] Heap usage critical (${heapUsedPercent.toFixed(1)}%), forcing GC`)
      if (global.gc) global.gc()
    }
  }, 10000)
  
  try {
    // ... run orchestration ...
  } finally {
    clearInterval(resourceMonitor)
  }
}
```

**Logging and Observability**: Each event should include metadata for debugging:

```typescript
private broadcastEvent(runId: string, event: DriveEvent) {
  const enrichedEvent = {
    ...event,
    runId,
    timestamp: new Date().toISOString(),
    iteration: this.executions.get(runId)?.progress.iteration ?? 0
  }
  
  // Log to standard output for observability platforms
  console.log(JSON.stringify({
    level: event.type === 'error' ? 'error' : 'info',
    event: enrichedEvent
  }))
  
  // Broadcast to connected clients
  this.eventListeners.get(runId)?.forEach(listener => {
    try {
      listener(enrichedEvent)
    } catch (error) {
      console.error('Error in event listener:', error)
    }
  })
}
```

**Scaled Deployments**: If the Next.js application is deployed with multiple instances (e.g., on Kubernetes with 3 replicas), each instance maintains its own `globalThis` orchestration manager. This means orchestrations are not automatically distributed across instances. For true distributed orchestration, consider:

1. Replacing the in-memory manager with a distributed coordination service (Redis, Etcd)
2. Running orchestrations in a separate long-lived service (not in Next.js)
3. Using managed workflow platforms (Temporal, Conductor) for orchestration

For simpler use cases where a single instance or sticky sessions are acceptable, the in-process manager is sufficient.

## Complete Implementation Example

Here is a complete working example integrating all patterns:

```typescript
// lib/workflow/execution-manager.ts
import { EventEmitter } from 'events'
import { Worker } from 'worker_threads'
import path from 'path'
import crypto from 'crypto'
import { fs } from 'fs/promises'

export type DriveEventType = 'iteration' | 'idle' | 'status' | 'error' | 'stop'

export interface DriveEvent {
  type: DriveEventType
  iteration?: number
  nodesCompleted?: number
  nodesTotalCount?: number
  message?: string
  state?: string
}

type ExecutionState = 'queued' | 'initializing' | 'running' | 'stopping' | 'stopped' | 'failed' | 'completed'

export interface WorkflowExecution {
  runId: string
  graphId: string
  state: ExecutionState
  progress: {
    iteration: number
    nodesCompleted: number
    nodesTotalCount: number
  }
  error?: Error
  startedAt: Date
  completedAt?: Date
}

export class WorkflowExecutionManager extends EventEmitter {
  private executions = new Map<string, WorkflowExecution>()
  private workers = new Map<string, Worker>()
  private executionMutex = new Map<string, Promise<void>>()
  private abortControllers = new Map<string, AbortController>()

  constructor() {
    super()
    this.setupSignalHandlers()
  }

  private setupSignalHandlers() {
    const gracefulShutdown = async () => {
      console.log('[WorkflowExecutionManager] Graceful shutdown initiated')
      
      const stopPromises = Array.from(this.executions.values()).map(exec =>
        this.stopExecution(exec.runId).catch(e => 
          console.error(`Failed to stop ${exec.runId}:`, e)
        )
      )
      
      await Promise.race([
        Promise.all(stopPromises),
        new Promise(resolve => setTimeout(resolve, 5000))
      ])
      
      console.log('[WorkflowExecutionManager] Shutdown complete')
    }
    
    process.on('SIGTERM', gracefulShutdown)
    process.on('SIGINT', gracefulShutdown)
  }

  startExecution(graphId: string): string {
    const runId = crypto.randomUUID()
    const execution: WorkflowExecution = {
      runId,
      graphId,
      state: 'queued',
      progress: { iteration: 0, nodesCompleted: 0, nodesTotalCount: 0 },
      startedAt: new Date()
    }
    
    this.executions.set(runId, execution)
    this.emit('event', runId, { type: 'status', state: 'queued' })
    
    // Initialize asynchronously
    setImmediate(() => this.initializeAndRun(runId, graphId))
    
    return runId
  }

  private async initializeAndRun(runId: string, graphId: string) {
    const execution = this.executions.get(runId)!
    const abortController = new AbortController()
    this.abortControllers.set(runId, abortController)
    
    try {
      execution.state = 'initializing'
      this.emit('event', runId, { type: 'status', state: 'initializing' })
      
      // In production, spawn a worker thread or child process
      // For this example, we'll simulate async orchestration
      await new Promise(resolve => setTimeout(resolve, 500))
      
      execution.state = 'running'
      this.emit('event', runId, { type: 'status', state: 'running' })
      
      // Simulate orchestration loop
      for (let iteration = 0; iteration < 5; iteration++) {
        if (abortController.signal.aborted) break
        
        execution.progress.iteration = iteration
        this.emit('event', runId, {
          type: 'iteration',
          iteration,
          nodesCompleted: iteration * 10,
          nodesTotalCount: 50
        })
        
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
      execution.state = 'completed'
      execution.completedAt = new Date()
      this.emit('event', runId, { type: 'status', state: 'completed' })
      
    } catch (error) {
      execution.state = 'failed'
      execution.error = error instanceof Error ? error : new Error(String(error))
      execution.completedAt = new Date()
      this.emit('event', runId, {
        type: 'error',
        message: execution.error.message
      })
    } finally {
      this.executions.delete(runId)
      this.abortControllers.delete(runId)
      this.workers.delete(runId)
    }
  }

  async stopExecution(runId: string): Promise<void> {
    const execution = this.executions.get(runId)
    if (!execution) throw new Error(`Execution ${runId} not found`)
    
    if (execution.state === 'stopping' || execution.state === 'stopped') {
      return
    }
    
    execution.state = 'stopping'
    this.emit('event', runId, { type: 'status', state: 'stopping' })
    
    const abortController = this.abortControllers.get(runId)
    if (abortController) {
      abortController.abort()
    }
    
    const worker = this.workers.get(runId)
    if (worker) {
      await worker.terminate()
    }
    
    execution.state = 'stopped'
    this.emit('event', runId, { type: 'status', state: 'stopped' })
  }

  getExecution(runId: string): WorkflowExecution | undefined {
    return this.executions.get(runId)
  }

  getAllExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values())
  }
}
```

```typescript
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node')
  }
}

// instrumentation-node.ts
import { WorkflowExecutionManager } from '@/lib/workflow/execution-manager'

declare global {
  var workflowExecutionManager: WorkflowExecutionManager | undefined
}

if (!globalThis.workflowExecutionManager) {
  globalThis.workflowExecutionManager = new WorkflowExecutionManager()
  console.log('[Instrumentation] WorkflowExecutionManager initialized')
}
```

```typescript
// app/api/workflows/start/route.ts
import { getExecutionManager } from '@/lib/workflow/get-manager'

export async function POST(request: Request) {
  const { graphId } = await request.json()
  const manager = getExecutionManager()
  
  const runId = manager.startExecution(graphId)
  return Response.json({ runId })
}

// app/api/events/mux/route.ts
import { getExecutionManager } from '@/lib/workflow/get-manager'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const runId = searchParams.get('runId')
  
  if (!runId) return Response.json({ error: 'Missing runId' }, { status: 400 })
  
  const encoder = new TextEncoder()
  const manager = getExecutionManager()
  
  const readable = new ReadableStream({
    start: (ctrl) => {
      const handler = (eventRunId: string, event: any) => {
        if (eventRunId === runId) {
          const data = encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          ctrl.enqueue(data)
        }
      }
      
      manager.on('event', handler)
      request.signal.addEventListener('abort', () => {
        manager.off('event', handler)
        ctrl.close()
      })
    }
  })
  
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream;charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
}
```

## Conclusion

Hosting long-running workflow orchestration in Next.js requires a shift from the default request-scoped execution model to a process-scoped singleton architecture. The recommended pattern combines an `instrumentation.ts`-bootstrapped `WorkflowExecutionManager` singleton, asynchronous orchestration execution via child processes or worker threads, SSE-based progress streaming, and filesystem-backed checkpointing for recovery. This architecture naturally integrates with Next.js' ecosystem, survives Hot Module Replacement in development, scales to production deployments, and provides observability through structured event logging and client-side progress tracking.

The key insight is that long-running processes cannot live within request handlers—they must be explicitly managed outside the request lifecycle, with clear state management and signal handling to gracefully shut down during HMR or container termination. By following this pattern, developers can build sophisticated workflow orchestration experiences in Next.js without relying on external services or compromising application stability.

Citations:
[1] https://nextjs.org/docs/14/app/building-your-application/data-fetching/server-actions-and-mutations
[2] https://github.com/vercel/next.js/discussions/68572
[3] https://community.vercel.com/t/fire-and-forget-next-js-api-route/15865
[4] https://github.com/vercel/next.js/discussions/56635
[5] https://upstash.com/blog/sse-streaming-llm-responses
[6] https://github.com/vercel/next.js/discussions/26427
[7] https://blog.appsignal.com/2025/02/12/managing-asynchronous-operations-in-nodejs-with-abortcontroller.html
[8] https://www.youtube.com/watch?v=7KZS0syLrUo
[9] https://github.com/vercel/next.js/discussions/14950
[10] https://github.com/vercel/next.js/issues/65350
[11] https://dev.to/bardaq/long-running-tasks-with-nextjs-a-journey-of-reinventing-the-wheel-1cjg
[12] https://dev.to/behnamrhp/how-we-fixed-nextjs-at-scale-di-clean-architecture-secrets-from-production-gnj
[13] https://github.com/meirwah/awesome-workflow-engines
[14] https://nodejs.org/api/child_process.html
[15] https://nextjs.org/docs/pages/api-reference/config/next-config-js/output
[16] https://nextjs.org/docs/app/guides/instrumentation
[17] https://developer.mozilla.org/en-US/docs/Web/API/AbortController
[18] https://blog.val.town/blog/node-spawn-performance/
[19] https://aws.amazon.com/blogs/machine-learning/customize-agent-workflows-with-advanced-orchestration-techniques-using-strands-agents/
[20] https://github.com/vercel/next.js/discussions/49426
[21] https://dev.to/arfatapp/tutorial-streaming-responses-in-nextjs-with-function-yield-and-readablestream-3bna
[22] https://github.com/vercel/next.js/discussions/64437
[23] https://github.com/Dokploy/dokploy/issues/3332
[24] https://blog.kubukoz.com/flavors-of-shared-state/
[25] https://agentic-patterns.com/patterns/filesystem-based-agent-state/
[26] https://arhamtechnosoft.com/next-js-vs-node-js-key-differences/
[27] https://github.com/vercel/next.js/discussions/76247
[28] https://lobehub.com/skills/jackspace-claudeskillz-checkpoint-workflow-builder
[29] https://oneuptime.com/blog/post/2026-01-15-retry-logic-exponential-backoff-react/view
[30] https://nextjs.org/docs/pages/api-reference/edge
[31] https://blog.bitsrc.io/4-ways-to-communicate-across-browser-tabs-in-realtime-e4f5f6cbedca
