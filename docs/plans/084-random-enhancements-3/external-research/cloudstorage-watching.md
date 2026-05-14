# External Research: macOS CloudStorage / File-Provider Watching Reliability

**Source**: Perplexity Deep Research (Sonar Deep Research)
**Date**: 2026-05-10
**Prompt**: see `multi-folder-tree-research.md` § Research Opportunity 1
**Plan**: 084-random-enhancements-3 — multi-folder tree

---

# Reliability of Node.js `fs.watch` on macOS File-Provider Extensions: A Comprehensive Technical Assessment

This report evaluates the current reliability of Node.js `fs.watch` when monitoring files in macOS CloudStorage directories managed by file-provider extensions (OneDrive, iCloud Drive, Dropbox Smart-Sync, Google Drive File Stream) as of 2026, with specific focus on implementation patterns used by production development tools. The core finding is that `fs.watch` exhibits significant reliability issues on macOS CloudStorage paths due to FSEvents coalescing behavior, delayed event delivery, file descriptor resource exhaustion limits, and the indeterminate startup delay on macOS; therefore, production applications targeting CloudStorage folders require either hybrid watch-and-poll strategies, careful detection heuristics to route CloudStorage paths through polling or watchman backends, or architectural redesigns around manual refresh triggers. Major editors including VS Code employ @parcel/watcher with explicit CloudStorage avoidance and fallback polling, while IntelliJ relies on polling-based watchers with configurable intervals. The recommended approach for a Node 22 dev tool targeting up to ten user-added CloudStorage root folders involves backend detection using path prefix matching, mount analysis, and getattrlist inspection; selective routing to watchman or @parcel/watcher for standard mounts; and polling with a 5–10 second interval for confirmed CloudStorage paths, paired with a "manual refresh" affordance to reduce user friction.

## Current State of fs.watch Reliability on macOS

The Node.js runtime delegates file-watching responsibilities on macOS to the underlying libuv library, which in turn uses Apple's **FSEvents** framework as the primary backend[3][5][13]. While FSEvents is Apple's native, efficient file monitoring facility, it has been the source of numerous documented issues over the past several years, particularly when applied to edge cases such as network drives, virtualized environments, and—critically for this analysis—file-provider extensions that implement placeholder-based on-demand materialization semantics. The fundamental contract of `fs.watch` is that it will emit events immediately upon file changes and that the watcher is active as soon as the function returns; however, neither of these guarantees holds consistently on macOS.

A longstanding and widely reported issue documented in the Node.js issue tracker is that `fs.watch` on macOS does not actually begin watching the filesystem until some indeterminate amount of time after the function call returns[1]. This timing variability is a direct consequence of FSEvents' design: unlike the more synchronous and predictable Linux inotify or Windows ReadDirectoryChangesW APIs, FSEvents operates asynchronously with lazy initialization. Developers who call `fs.watch` followed immediately by a read of the filesystem's initial state risk becoming out of sync with reality, because changes that occur during the initialization window will not trigger events[1]. The proposed workaround—inserting a fixed delay such as 200 milliseconds before reading initial state—is neither reliable nor performant and degrades the responsiveness that developers expect from a dev tool.

A second major category of issues concerns FSEvents' behavior with respect to event coalescing and throttling, particularly under high-frequency file modifications. When a developer watches a single file being written to repeatedly (for example, during a build process), `fs.watch` with FSEvents as the backend may coalesce multiple write events into a single notification, or may simply drop events entirely if the rate of changes exceeds FSEvents' internal buffering capacity[17]. In one documented performance test, watching a parent folder containing just one file and performing synchronous writes resulted in FSEvents reporting fewer than 3% of the expected events—a 97% miss rate[17]. By contrast, watching the file directly yielded far better coverage, but the parent-directory scenario is common in hierarchical file monitoring systems and developer tools.

The file descriptor resource exhaustion problem on macOS is acute. Each `fs.watch` call consumes file descriptor resources, and FSEvents itself may consume additional resources internally. The documented limit on macOS is approximately 4,096 open file descriptors per process by default, and hitting this limit (typically around 4,097 watchers) triggers an `EMFILE: too many open files` error[4]. While macOS Sonoma 14.5 and later versions introduced improved recovery behavior allowing new watchers to be created after closing existing ones below the limit, the underlying constraint remains immutable without manual system tuning (via `ulimit`)[4].

Additionally, when `fs.watch` is used with the recursive option on macOS, it attempts to watch an entire directory tree efficiently via FSEvents. However, FSEvents' behavior with respect to nested directories created in rapid succession is unreliable, and the framework can sometimes fail to report events for directories that were created after the watch was initially established[19].

## FSEvents and kqueue Architecture on CloudStorage Mounts

To understand why CloudStorage paths present particular challenges, it is necessary to examine the technical implementation of both FSEvents and the underlying kqueue kernel interface. The `kqueue()` system call creates a kernel event queue that can be used to subscribe to file system events[3]. FSEvents wraps kqueue internally but adds a user-space daemon layer that coalesces and buffers events before delivering them to applications[3][5]. This multi-layer architecture introduces latency and potential points of failure, especially when the filesystem being monitored is not a local APFS/HFS+ volume but rather a virtual mount provided by a file-provider extension.

File-provider extensions on macOS operate via the FileProvider framework, which virtualizes a directory tree and materializes files on demand when accessed. When an application reads from a file in a CloudStorage directory managed by OneDrive, iCloud Drive, or Dropbox Smart-Sync, the file-provider daemon intercepts the request and either returns cached data (if the file has already been downloaded locally) or initiates a download[2][16]. From the perspective of FSEvents and kqueue, these operations may not generate events in the expected manner, because the file-provider daemon is the true source of filesystem mutations, and the virtual mount may not properly propagate change notifications back through the FSEvents layer.

Moreover, file-provider extensions can introduce significant latency in stat operations and file access, which can impact polling-based watches. When a polling loop calls `fs.stat()` on a file in a CloudStorage directory, if that file is a placeholder that has not yet been materialized locally, the stat call may trigger a network request, with response times in the hundreds of milliseconds to seconds depending on network conditions and file size[16].

The Watchman tool, developed by Meta and used by several large projects, operates by maintaining a daemon that monitors filesystem changes and caches historical change information[10][13]. On macOS, Watchman uses FSEvents internally (similar to libuv) but wraps it with additional state management and can handle edge cases more gracefully. However, Watchman also has documented issues: when the user-space FSEvents interface gets into a bad state, the system may be unable to recover without restarting the Watchman daemon[4][10]. Additionally, a documented issue from recent years shows that opening VS Code with a Sapling extension that queries Watchman can result in several thousand Watchman processes spawning, effectively a resource exhaustion denial of service[18].

## System Resource Limits and Catastrophic Failure Modes

The maximal open file descriptor limit is not merely a soft constraint that gracefully degrades performance; it is a hard limit that causes immediate, unrecoverable failures. When an application attempting to create an `fs.watch` watcher hits the EMFILE limit on macOS, all existing watchers throw an error, and new watchers cannot be created even after existing ones are closed—a state from which recovery is extremely difficult[4]. While macOS Sonoma 14.5+ improved this behavior to allow recovery after closing watchers, the fact that the problem exists at all is concerning for production tools that may remain running indefinitely and accumulate watchers over time.

For a dev tool supporting up to ten user-added CloudStorage folders, each of which may contain dozens or hundreds of files and subdirectories being watched recursively, the risk of hitting this limit is material. If the application also watches the main project directory (which may contain thousands of files), the cumulative load can easily exceed 4,096 watchers, especially if any third-party plugins or Node.js modules also create their own watchers without proper cleanup.

Watchman, which is sometimes positioned as a solution to FSEvents reliability problems, introduces its own resource limits and can create pathological scenarios. The documented incident in which a single VS Code window spawned thousands of Watchman processes indicates that resource controls are not well understood or enforced by consumers of Watchman[18].

Furthermore, the Watchman documentation explicitly acknowledges that hitting system resource limits is "the most common cause of problems" with Watchman[10]. The primary recommendation is to ensure the system is not resource-starved and to keep Watchman up to date, but there is no guarantee that these conditions will be met in production environments where users may be running many applications simultaneously.

## Patterns Observed in Production Development Tools

Visual Studio Code employs a third-party file watcher called `@parcel/watcher`[6][13], which is a native C++ Node.js module that provides backends for FSEvents on macOS, inotify on Linux, and ReadDirectoryChangesW on Windows[13]. When `@parcel/watcher` is used on macOS, it defaults to FSEvents but can fall back to Watchman if installed, or to kqueue as an alternative[13]. VS Code configures a separate file watcher process per window, which helps isolate watcher failures to individual windows rather than bringing down the entire application[6].

Despite using a sophisticated watcher backend, VS Code users have reported file watcher problems on Mac, particularly in scenarios involving large projects or CloudStorage directories[6]. The VS Code team's recommended workaround is to exclude folders from watching using the `files.watcherExclude` setting, which allows users to manually specify directories that should not be monitored[6]. This indicates that even a well-engineered tool like VS Code resorts to manual configuration and exclusion as a de facto workaround for watching reliability issues.

JetBrains IDEs (IntelliJ, WebStorm, PyCharm, etc.) employ a different strategy: they use file watchers as a triggering mechanism for external tools (compilers, formatters, linters), but the primary file watching for IDE responsiveness is not dependent on the OS-level `fs.watch` API[7]. Instead, IntelliJ relies on more controlled, custom-built polling mechanisms that can be tuned per scope and per file type[7]. This architectural choice trades simplicity for control and predictability.

Sublime Text and other editors typically rely on file watching backends that are more conservative and often default to polling or hybrid strategies. The Bun JavaScript runtime's approach, mentioned in performance discussions, was to implement its own file descriptor-based watching using OS-specific APIs rather than relying on abstraction layers like FSEvents or inotify, achieving better latency and predictability[17].

For source control tools like Sublime Merge and GitHub Desktop, watching is often not a critical path performance characteristic. These tools frequently rely on explicit refresh commands or background polling at longer intervals (5–30 seconds), which is far more practical than attempting to achieve immediate event-driven updates from filesystem events that are inherently unreliable.

## Technical Comparison: fs.watch vs. chokidar vs. @parcel/watcher vs. watchman

**fs.watch (raw Node.js)** provides the lowest-level abstraction, delegating directly to FSEvents on macOS[5][13][17]. It offers the lowest overhead (no additional processes, minimal wrapper code) but provides the least reliability and has no built-in workarounds for the known issues. It is suitable only for scenarios where watching is optional or where the cost of missing events is acceptable.

**chokidar** is a higher-level Node.js library that abstracts over `fs.watch`, `fs.watchFile`, and polling backends[5]. The library implements workarounds for known issues, including deduplication of duplicate events, handling of atomic file writes (save-and-rename patterns), and automatic fallback to polling when file descriptor limits are exceeded[5][15]. On macOS, chokidar can be configured with options like `usePolling`, `useFsEvents`, and `awaitWriteFinish` to tune behavior for specific scenarios[5]. The `awaitWriteFinish` option is particularly relevant for CloudStorage mounts, as it delays reporting a file change until the file has stopped being modified (typically detected via stat polling), which accommodates the high latency and unpredictable write patterns of file-provider-backed files.

However, chokidar's fallback-to-polling mechanism is reactive rather than proactive. It will attempt to use `fs.watch` initially and only fall back to polling after an explicit failure, which means the application may experience periods of unreliability before the fallback is triggered.

**@parcel/watcher** is a native C++ module that provides direct access to FSEvents, inotify, ReadDirectoryChangesW, and kqueue backends with explicit backend selection[8][13]. It includes built-in event throttling and coalescing to prevent the JavaScript thread from being overwhelmed during large filesystem changes (such as `git checkout`)[13]. Unlike chokidar, @parcel/watcher performs no implicit fallback; the application must explicitly specify which backend to use or accept the default priority order. On macOS, the default is FSEvents, but kqueue can be specified as an alternative[13]. For historical change queries (rather than real-time subscription), @parcel/watcher uses FSEvents or Watchman if available, and falls back to brute-force filesystem traversal on other platforms[13].

**watchman** is a daemon-based solution developed by Meta that maintains a background process monitoring the filesystem and caching change information[10][13]. Watchman can be selected as a backend by @parcel/watcher, or used directly via its own API. The advantage of Watchman is that multiple processes can share the same daemon, reducing resource usage and allowing centralized state management. The disadvantages are daemon management overhead, the resource exhaustion incidents previously mentioned, and the "bad state" failure mode where FSEvents gets corrupted and the daemon cannot recover[4][10].

A comparative analysis of these approaches on macOS CloudStorage paths is shown in the following table:

| **Solution** | **FSEvents Coverage** | **CloudStorage Handling** | **Resource Efficiency** | **Recovery from EMFILE** | **Overhead** | **Configuration Burden** |
|---|---|---|---|---|---|---|
| `fs.watch` (raw) | Poor (coalescing, drops) | Very Poor (delays, misses) | Low (native) | None (hard fail) | Minimal | None |
| chokidar + polling | Good (fallback exists) | Moderate (via awaitWriteFinish) | Moderate (polling overhead) | Yes (reactive fallback) | Wrapper library | Moderate (options tuning) |
| @parcel/watcher (FSEvents) | Poor (same as fs.watch) | Very Poor (same as fs.watch) | Low (native) | None (hard fail) | Native binary | Low (explicit backend) |
| @parcel/watcher (Watchman) | Good (daemon caching) | Moderate (daemon helps) | Moderate (daemon overhead) | Better (daemon recovery) | Native binary + daemon | Low-moderate (daemon setup) |
| polling (custom or library) | N/A (not event-based) | Good (works on all mounts) | Moderate-high (stat calls) | Yes (automatic) | Highest | Moderate (interval tuning) |

## CloudStorage Path Detection Heuristics

A practical implementation must distinguish CloudStorage and file-provider paths from standard local filesystem paths, because the watching strategy should differ significantly between the two categories. Several heuristics can be combined to create a robust detection system.

**Path prefix matching** is the simplest heuristic: paths matching `/Users/*/Library/CloudStorage/*` are almost certainly CloudStorage paths, as this is the standard macOS location for OneDrive, Dropbox Smart-Sync, and Google Drive File Stream[2][16]. This pattern is standardized across file-provider implementations and is reliably present.

**Mount analysis via `mount` command output** can reveal whether a path is mounted on a standard APFS/HFS+ volume or a file-provider virtual mount. File-provider extensions typically appear as mounts with specific filesystem types or mount options. Parsing `mount` output or analyzing `/etc/fstab` (though less relevant on modern macOS) provides explicit confirmation.

**`getattrlist` inspection** using the `/usr/bin/getattrlist` command or the corresponding C API can query file attributes including `kCFURLIsUbiquitousItemKey` (for iCloud Drive files) or `com.apple.fileprovider.fpfs` (indicating file-provider filesystem). This is more invasive than path matching but provides definitive proof.

**statfs analysis** via the `fs.statfs()` Node.js API (or the underlying `statfs()` C function) reveals the filesystem type. CloudStorage mounts may have distinct `f_type` values (on Linux-like systems) or other identifying characteristics. On macOS, however, this approach is less reliable because file-provider extensions may report generic filesystem types.

A practical hybrid detection heuristic in a Node.js application would proceed as follows: first, check if the path matches the known CloudStorage prefix pattern; if it does, assume it is a CloudStorage path unless user configuration explicitly overrides. Optionally, perform statfs or mount analysis as a secondary confirmation. This approach minimizes performance overhead (prefix matching is O(1)) while remaining accurate for typical use cases.

## Polling Strategies and Resource Budgeting

When polling is the selected strategy (either as a fallback or by design), the choice of polling interval is critical. A polling interval of 1–2 seconds is common in many tools but may be excessive for a dev tool attempting to achieve rapid feedback (for example, hot-module replacement). Conversely, a polling interval below 1 second risks consuming significant CPU, especially if multiple folders are being polled simultaneously and stat calls on file-provider-backed files incur network latency.

For CloudStorage paths managed by file-provider extensions, stat operations can incur latencies of 100–500 milliseconds per file if placeholders must be materialized. For a folder containing 100 files, polling every 1 second could result in 10,000 stat operations per second across the entire system, consuming hundreds of milliwatts and potentially impacting battery life on laptops. A more conservative polling interval of 5–10 seconds is appropriate for CloudStorage folders, accepting slightly higher latency in exchange for reduced overhead.

The memory footprint of a polling watcher is minimal—primarily the state data structures tracking which files have been seen and their modification times. For ten folders containing a total of, say, 1,000 files, maintaining per-file stat snapshots requires only a few megabytes of memory.

The CPU cost is dominated by the stat system calls. At a 5-second interval for 1,000 files, assuming each stat takes 10–100 milliseconds (worst-case with CloudStorage latency), the aggregate CPU time per 5-second period is roughly 10–100 seconds of CPU time (amortized across multiple cores, wall-clock time to stat all files may be 1–5 seconds if parallelized). This is still reasonable for a dev tool's background task.

A practical resource budget for ten CloudStorage folders with ~100 files each (1,000 total) at a 5-second polling interval is as follows: memory overhead ~5–10 MB, CPU usage ~5–10% sustained (one CPU core heavily, or fractions of multiple cores), disk I/O minimal (only stat operations, no actual data transfer unless files are materialized). This is comparable to the resource usage of a typical IDE language server or build watcher.

## Architectural Recommendations for Node 22 / macOS Sequoia

Given the reliability and resource constraints outlined above, a production dev tool should employ a **hybrid strategy** rather than relying solely on event-driven watching or polling.

### Recommended Architecture

**Tier 1: Path Classification.** Upon initialization and when the user adds a new root folder, perform path classification using the heuristics described above. For each root, determine whether it is a standard filesystem path or a CloudStorage/file-provider path.

**Tier 2: Backend Selection.** For standard filesystem paths, attempt to use `@parcel/watcher` with the FSEvents backend (default on macOS). Implement a resource limit check: track the cumulative number of watchers across all roots, and if the count exceeds 2,000 (a conservative threshold well below the 4,096 hard limit), switch to polling for new roots or emit a warning to the user. For CloudStorage paths, skip event-driven watching entirely and proceed to Tier 3.

**Tier 3: Polling for CloudStorage.** For paths classified as CloudStorage, establish a polling loop with a 5–10 second interval. The polling loop should perform incremental stat checks on files and directories, detecting additions, deletions, and modifications since the last poll. Implement debouncing so that rapid successive changes to a file are coalesced into a single change notification, avoiding thundering-herd effects in the application's file change handler.

**Tier 4: Manual Refresh Affordance.** Provide a UI affordance (keyboard shortcut, button, command-palette entry) to manually trigger a refresh of all watched folders, synchronizing with the filesystem. This allows users to recover from transient watcher failures or to explicitly update state after performing bulk operations outside the dev tool (such as a command-line `git checkout` that modifies many files rapidly).

**Tier 5: Graceful Degradation.** If the application detects an EMFILE error (file descriptor exhaustion), log a clear error message to the user, suggest increasing the file descriptor limit via `ulimit -n`, and gracefully fall back to polling for all roots. This prevents the catastrophic "hard fail" scenario.

### Pseudo-code Sketch

```javascript
class CentralWatcherService {
  constructor(options = {}) {
    this.roots = new Map(); // Map of path -> RootWatcher
    this.maxWatchersBeforePollFallback = options.maxWatchers || 2000;
    this.pollIntervalMs = options.pollInterval || 5000;
    this.cloudStoragePathPattern = /^\/Users\/[^/]+\/Library\/CloudStorage\//;
  }

  async addRoot(path) {
    const classification = await this.classifyPath(path);
    let watcher;

    if (classification === 'cloud-storage') {
      watcher = new PollingWatcher(path, this.pollIntervalMs);
    } else {
      // Attempt event-driven watching
      const currentWatcherCount = Array.from(this.roots.values())
        .filter(w => w instanceof EventWatcher).length;

      if (currentWatcherCount < this.maxWatchersBeforePollFallback) {
        try {
          watcher = new EventWatcher(path, 'fsevents');
        } catch (err) {
          if (err.code === 'EMFILE') {
            console.warn('File descriptor exhaustion; falling back to polling');
            watcher = new PollingWatcher(path, this.pollIntervalMs);
          } else {
            throw err;
          }
        }
      } else {
        console.warn('Watcher count approaching limit; using polling for new root');
        watcher = new PollingWatcher(path, this.pollIntervalMs);
      }
    }

    watcher.on('change', (change) => this.emitChange(change));
    watcher.on('error', (err) => this.emitError(err));
    await watcher.start();
    this.roots.set(path, watcher);
  }

  async classifyPath(path) {
    // Fast path: check prefix
    if (this.cloudStoragePathPattern.test(path)) {
      return 'cloud-storage';
    }
    // Optional: validate with statfs or mount info
    return 'standard';
  }

  async manualRefresh() {
    // Trigger all watchers to perform a fresh scan
    const promises = Array.from(this.roots.values())
      .map(w => w.refresh());
    await Promise.all(promises);
  }
}
```

### Rationale

This architecture balances reliability, performance, and user experience. By detecting CloudStorage paths upfront and routing them through polling, the application avoids the pathological scenarios where FSEvents fails to deliver events on file-provider mounts. By maintaining a resource budget and falling back to polling when approaching limits, the application prevents hard failures due to file descriptor exhaustion. The manual refresh affordance provides an escape hatch for edge cases and gives users a sense of control.

The 5–10 second polling interval for CloudStorage is a practical compromise: it is infrequent enough to avoid excessive resource consumption and stat call overhead, yet frequent enough for most development workflows where file changes are expected within seconds to minutes. For workflows requiring sub-second latency (such as aggressive HMR), the user should be advised to use standard project folders outside of CloudStorage.

## Conclusion and Implementation Guidance

The reliability of `fs.watch` on macOS CloudStorage paths is substantially compromised by FSEvents' design limitations, file-provider architecture mismatches, and resource constraints. No single approach is flawless; instead, production applications should employ pragmatic hybrid strategies.

**For a Node 22 / macOS Sequoia dev tool targeting up to ten user-chosen root folders, the following implementation steps are recommended:**

1. **Implement path classification** using the `/Users/*/Library/CloudStorage/*` prefix heuristic, with optional statfs confirmation.
2. **Use `@parcel/watcher` with FSEvents backend for standard paths**, with a resource budget check to prevent EMFILE exhaustion.
3. **Use 5–10 second interval polling for CloudStorage paths**, with debouncing to avoid change notification spam.
4. **Provide manual refresh** via UI and keyboard shortcut.
5. **Implement graceful degradation** to fall back to polling for all paths if EMFILE errors are encountered.
6. **Document limitations** to users, including the recommendation that time-sensitive development workflows should use standard directories rather than CloudStorage folders.
7. **Monitor and log** watcher state to enable debugging of future issues.

The recommended rank order of solutions by reliability and resource efficiency for CloudStorage paths is as follows: (1) polling with 5–10 second interval (most reliable, moderate overhead), (2) hybrid watch+poll (good reliability, complex), (3) @parcel/watcher with Watchman backend (moderate reliability, daemon overhead), (4) raw `fs.watch` (poor reliability, low overhead—suitable only for non-critical use cases).

Major editors and developer tools have largely accepted that watching CloudStorage paths with event-driven APIs is unreliable and have settled on exclusion, polling, or manual refresh as the practical solution. A Node 22 application adopting similar patterns will achieve superior reliability and maintainability compared to attempting to force event-driven watching on fundamentally unpredictable mounts.

## Citations

[1] https://github.com/nodejs/node/issues/52601
[2] https://discourse.devontechnologies.com/t/dropbox-and-onedrive-locations-being-automatically-changed-effect-on-indexed-dt-databases/69244
[3] https://vegardstikbakke.com/kqueue/
[4] https://github.com/nodejs/node/issues/43267
[5] https://dev.to/catdad/what-happens-when-you-can-no-longer-trust-your-file-watcher-15d8
[6] https://github.com/microsoft/vscode/issues/210422
[7] https://www.jetbrains.com/help/idea/using-file-watchers.html
[8] https://github.com/parcel-bundler/watcher/issues/172
[9] https://github.com/microsoft/vscode/issues/106879
[10] https://facebook.github.io/watchman/docs/troubleshooting
[11] https://prajwalpandey.hashnode.dev/mastering-polling-techniques-in-nodejs-short-polling-vs-long-polling
[12] https://github.com/electron-userland/electron-builder/issues/9155
[13] https://github.com/parcel-bundler/watcher
[14] https://github.com/microsoft/TypeScript/issues/57792
[15] https://github.com/fgnass/filewatcher
[16] https://eclecticlight.co/2024/03/05/icloud-drive-in-sonoma-mechanisms-throttling-and-system-limits/
[17] https://github.com/nodejs/node/issues/47058
[18] https://github.com/facebook/watchman/issues/1306
[19] https://github.com/nodejs/node/issues/36005
