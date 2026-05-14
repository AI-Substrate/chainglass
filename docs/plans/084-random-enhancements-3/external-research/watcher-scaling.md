# External Research: fs.watch Recursive Watcher Scaling

**Source**: Perplexity Deep Research (Sonar Deep Research)
**Date**: 2026-05-10
**Prompt**: see `multi-folder-tree-research.md` § Research Opportunity 3
**Plan**: 084-random-enhancements-3 — multi-folder tree

---

# Scaling Node.js fs.watch with Recursive Directory Watching Across Multiple Roots on macOS and Linux

This report examines the technical constraints and practical patterns for deploying Node.js fs.watch with the `recursive: true` option across 5–15 user-chosen project directories on both macOS Sequoia and recent Linux distributions, specifically addressing the interaction between operating system file descriptor limits, kernel file system event notification mechanisms, libuv's platform abstraction layer, and contemporary JavaScript file watching libraries. The research reveals that while Node.js v22 ships with robust native file watching capabilities built on libuv, deploying this across dozens of directories containing hundreds of thousands of files presents distinct challenges on macOS and Linux that stem from fundamentally different kernel-level mechanisms—FSEvents and kqueue on macOS versus inotify on Linux—each with their own resource constraints and architectural limitations. The report synthesizes information about system-level limits from recent distributions, benchmarks and real-world issues from popular file watching projects, detailed API specifications for alternative libraries like @parcel/watcher and watchman, and practical recommendations for a production Node.js server serving a file browser interface on both platforms.

## Operating System-Level File Watching Constraints and Kernel Limits

The feasibility of watching multiple directory trees depends critically on understanding the underlying system-level constraints that govern how many file system events a single process can monitor simultaneously. These constraints differ dramatically between macOS and Linux, rooted in the fundamentally different architectural choices made by each operating system's kernel developers when implementing file system event notification systems.

### macOS File Descriptor and kqueue Architecture

macOS uses the kqueue mechanism for general file and directory event notification, which requires one file descriptor per watched entity.[2][20][25] The default per-process file descriptor limit on macOS is extremely low at 256, a conservative setting that was appropriate for single-user workstations in the 1980s but becomes problematic for modern server applications monitoring large directory trees.[2] This limitation has driven significant development effort in macOS-specific tool optimization, with watchman automatically adjusting these limits to accommodate large-scale file monitoring.[20] The `launchctl limit maxfiles` setting controls the hard limit that cannot be exceeded even with `ulimit -n` commands, and users must configure both settings to substantially increase file descriptor availability.[20]

The relationship between macOS limits and modern development tools reveals a critical insight: most large development tools anticipate that users will hit descriptor limits on macOS and include automation to raise them.[2][20] A developer working on a project with 16,000 directories attempting to use fs.watch would encounter failures after exhausting the per-process limit of file descriptors available, typically hitting a ceiling around 4,096 concurrent fs.watch operations even with manually increased ulimit settings.[20] FSEvents, the higher-level alternative to kqueue, watches directory-level changes without requiring a file descriptor per file, which scales significantly better for broad monitoring.[25] However, FSEvents provides less granular control than kqueue and sometimes lumps together attribute changes and renames rather than reporting them separately.[25]

The trade-off on macOS centers on choosing between kqueue's granularity and FSEvents' scalability. Node.js historically has made different choices across versions, and understanding which mechanism libuv uses in the current version (1.48+) becomes critical for capacity planning. The per-process file descriptor limit represents a hard ceiling that no application can exceed without system-level configuration changes, making it the most restrictive constraint in macOS-based file watching scenarios.

### Linux inotify Watch Limits and System Configuration

Linux presents a different constraint structure based on the inotify mechanism, which does not consume one file descriptor per watched directory but instead uses watch handles managed through the inotify kernel subsystem.[3][12][16][27] The fundamental difference from macOS means that on Linux, the bottleneck is not file descriptors but rather the `fs.inotify.max_user_watches` system parameter, which controls the total number of watch descriptors one user account can create across all inotify instances.[3][8][27] The default value on many Linux systems is conservatively set at 8,192 watch descriptors, though this varies by distribution and kernel version.[1][3][27]

Modern Linux distributions ship with substantially higher defaults than these conservative kernels suggest: Ubuntu 24.04 and Fedora 40 both typically allow users to set `fs.inotify.max_user_watches` values up to 1,048,576 or higher.[3][8] However, reaching the watch limit forces IDEs and file monitoring tools to fall back to recursive directory scans, which are significantly slower and less efficient than maintaining active watch handles.[3][16] For a project with approximately 16,000 directories, the watch limit becomes the binding constraint: since inotify requires creating a watch on each directory in the recursive tree to detect changes within it, the total number of watches needed equals or exceeds the number of directories being monitored.[3][27]

Linux complicates the picture further with an additional parameter `fs.inotify.max_user_instances` that limits the number of inotify instances (typically defaulting to 128), meaning that even with abundant watch descriptors, a process creating multiple inotify instances will hit this ceiling.[27] For applications using multiple fs.watch calls on a single node process, this becomes relevant: each fs.watch instance may create a separate inotify instance depending on libuv's implementation choices. The system-wide open file limit (`fs.file-max`) and per-process limit (controlled by `/etc/security/limits.conf` and `ulimit -n`) also factor into the equation, though these are generally less restrictive on Linux than the inotify-specific parameters.[27] A typical modern Linux server might be configured with `fs.inotify.max_user_watches = 1,048,576` and `ulimit -n = 2,000,000`, making inotify watches the primary constraint rather than general file descriptors.[8]

The recommended configuration for Linux systems supporting many watch folders involves adjusting three parameters: increasing `fs.inotify.max_user_watches` to at least the number of directories to watch (e.g., 524,288), increasing `fs.inotify.max_user_instances` to permit multiple watch instances (e.g., 1,024), and raising the system-wide `fs.file-max` to a value greater than the number of watched items (e.g., 2,097,152).[27] These settings are configured in `/etc/sysctl.conf` or `/etc/sysctl.d/` configuration files and require a system reboot or explicit `sysctl -p` reload to activate.[3][27]

### Comparative Analysis of System Limits

The practical limits for watching directory trees emerge from synthesizing these platform-specific constraints. On macOS with default configuration, a single process can maintain approximately 256 file descriptors before hitting the per-process limit, though this can be manually increased to 8,000–10,000 on most systems.[2][20] Since kqueue-based watching requires file descriptors, and macOS tools like watchman automatically configure higher limits, typical modern macOS deployments operate with raised ulimit settings of 200,000–2,000,000.[20] However, research on watchpack (a webpack file watching library) revealed that even with `ulimit -n` set to 200,000, macOS systems fail to register more than approximately 4,096 fs.watch calls.[20] This suggests an additional limit beyond file descriptors, potentially related to kqueue internal data structures or kernel memory allocation for event queue management.

On Linux, the binding constraint is typically `fs.inotify.max_user_watches`, which defaults to 8,192 but can be raised to 1,048,576 or higher on modern systems.[3][27] Since each watched directory requires a watch handle and inotify does not natively support recursive watching, the number of watch descriptors must accommodate the full directory tree depth and breadth.[1][3] A project tree with 16,000 directories would require 16,000 watch descriptors, well within the capability of a configured Linux system but potentially problematic on unconfigured systems stuck at the 8,192 default.

## Node.js fs.watch Internals on Node 22 and libuv 1.48+

Understanding how Node.js v22's fs.watch method with `recursive: true` maps onto platform-specific mechanisms reveals the actual resource consumption patterns and explains why certain configurations succeed while others fail.

### macOS Implementation: FSEvents and kqueue Delegation

On macOS, libuv's file system event notification layer can use either FSEvents or kqueue depending on the scenario and which mechanism is more efficient.[2][15][25] FSEvents is a macOS-specific kernel mechanism that provides directory-tree-level event notifications without requiring file descriptors for each file or subdirectory, instead using a single connection to `/dev/fsevents` that the kernel's fseventsd daemon multiplexes across applications.[15] FSEvents automatically combines multiple changes within a short time window to a single directory tree, trading granularity for scalability, and this coalescing behavior is inherent to the kernel mechanism rather than an artifact of the libuv wrapper.[21][25]

The FSEvents API fundamentally works as a process-wide event stream rather than a per-inode mechanism: an application registers interest in a directory and receives a stream of events affecting that directory tree, but the kernel implementation pools these across all registered applications to minimize kernel overhead.[15] This architectural difference from inotify means that on macOS, adding additional fs.watch calls to different directory roots does not create proportional overhead in kernel data structures, since they all flow through a single event notification channel.[15][25]

However, libuv abstracts these details away from JavaScript developers, and its exact implementation choices on macOS remain partially opaque to users. The empirical evidence from large-scale projects reveals practical limits: watchpack failed to handle more than 4,096 fs.watch registrations on macOS even with ulimit -n increased to 200,000, suggesting that libuv may fall back to kqueue (which does require file descriptors) under certain conditions or that the FSEvents wrapper in libuv has its own limitations.[20] Kqueue requires one file descriptor per entity being watched, and for recursive directory watching, this could mean file descriptors per directory if libuv implements recursion by instrumenting each subdirectory individually.

### Linux Implementation: inotify and Recursive Watch Instrumentation

On Linux, libuv uses inotify, which requires explicit watch descriptors for each monitored directory.[1][3][16] Since inotify does not natively support recursive watching, libuv must implement recursion in userland by traversing the directory tree and creating watch handles for each directory.[1] This architecture means that watching a recursive tree with 10,000 directories will consume 10,000 watch descriptors from the `fs.inotify.max_user_watches` pool.[3][16][27]

The recursive watching implementation in libuv works by initially traversing the target directory tree and placing watch handles on each subdirectory, then monitoring for creation and deletion events to dynamically add or remove watches as the tree changes.[1] This dynamic management means that the watch descriptor count will fluctuate as files and directories are created and deleted within the watched tree. Each watch descriptor on Linux consumes approximately one kilobyte of kernel memory on 64-bit systems, meaning a process watching 500,000 directories might consume roughly 500 MB of kernel memory just for watch descriptors.[1]

The practical implication is that on Linux, the watch descriptor limit is the primary constraint for recursive fs.watch usage, and this limit is configurable but requires system administration changes. A properly configured modern Linux system should support watching tens of thousands of directories with a single fs.watch call with `recursive: true`.

### libuv as Platform Abstraction: Constraints on Platform-Specific Optimization

An important architectural principle of libuv is that it functions as a platform abstraction layer, prioritizing functionality that works across all supported platforms over exposing platform-specific optimizations.[13] This means that even though macOS FSEvents provides superior scalability to kqueue, and even though libuv could theoretically use FSEvents to implement a more efficient recursive watching mechanism, the library does not expose platform-specific optimization options to users.[13] JavaScript code using fs.watch receives the same API across all platforms, with the understanding that the underlying implementation uses the most appropriate kernel mechanism available on each OS.

This constraint means that developers cannot choose to use FSEvents directly from Node.js even when running on macOS—they receive whatever implementation libuv has chosen. For most file watching use cases, this is the right trade-off because it keeps the API simple and ensures code portability. However, for scenarios involving very large directory trees on macOS, this constraint may force use of alternative libraries like @parcel/watcher or watchman that provide platform-specific optimizations.

## Per-Root File Descriptor and Watch Descriptor Costs

Establishing the actual per-root cost of watching one recursive directory tree requires distinguishing between multiple interpretation of what "one watch" means and how libuv's implementation differs from naive assumptions.

### Single fs.watch Call Cost on Linux

A single fs.watch call on Linux with `recursive: true` targeting a large directory tree will create one inotify instance and place watch descriptors on each directory within the tree.[1][3] Research from IBM and JetBrains indicates that for projects containing approximately 16,000 directories (typical for a medium-sized project with node_modules), this will consume roughly 16,000 watch descriptors.[16][27] The mapping is straightforward: one inotify watch per monitored directory to detect changes within that directory.

The important corollary is that multiple fs.watch calls create additional inotify instances. If a Node.js process makes five fs.watch calls on five different root directories, and each root tree contains 10,000 directories, the process will consume approximately 50,000 watch descriptors plus five separate inotify instances. The instances themselves are limited by `fs.inotify.max_user_instances` (typically 128–1,024), but watch descriptors are the more restrictive resource.[27]

### Single fs.watch Call Cost on macOS

On macOS, the cost structure is less clearly documented but empirical evidence suggests that a single fs.watch call might consume anywhere from one to dozens of file descriptors depending on the directory tree size and libuv's implementation details.[20] The 4,096 fs.watch call limit observed on macOS despite `ulimit -n` being set to 200,000 suggests either a per-process limit on kqueue structures rather than file descriptors, or an upper bound in libuv's recursive directory watching implementation.[20] If the limit is proportional to the number of watches rather than the number of files, then on a system with a 4,096 limit on concurrent fs.watch registrations, a developer is constrained to at most a few dozen watching tasks if each task needs multiple watches.

Alternative interpretations exist: if libuv creates one file descriptor per directory being watched on macOS (similar to Linux), then 4,096 limit implies either that ulimit -n cannot actually be increased beyond this point despite the configuration, or that kqueue itself has an internal data structure limit unrelated to file descriptor count.[20] Either way, the practical macOS limit appears to be substantially lower than Linux when accounting for the number of concurrent watching operations possible.

### @parcel/watcher Cost Structure

The @parcel/watcher library, used by projects like Parcel 2, VSCode, Tailwind, and Nx, provides a native C++ addon that interfaces with FSEvents on macOS and inotify or other mechanisms on Linux.[5][9][19] On macOS, @parcel/watcher uses FSEvents directly, which theoretically avoids the file descriptor limitations of kqueue because FSEvents operates at the directory stream level rather than requiring per-inode file descriptors.[9][15] This architectural choice makes @parcel/watcher more efficient on macOS for large directory trees because each recursive watch uses FSEvents' efficient process-wide event channel rather than consuming multiple kqueue file descriptors.

On Linux, @parcel/watcher defaults to using fts (file tree scan), a brute-force scanning mechanism that periodically walks the directory tree to detect changes rather than relying on inotify.[9] This strategy trades inotify watch descriptor limits for CPU and I/O overhead: instead of running out of watch descriptors, a process using @parcel/watcher's fts backend might run into CPU limitations from continuous directory tree scanning. For development tools like Vite and VSCode, this trade-off is often acceptable because typical interaction patterns involve scanning every few seconds rather than continuous scanning.

## Practical Degradation Thresholds and Reliability Boundaries

Understanding when file watching begins to fail requires examining both hard resource exhaustion and soft degradation modes where file watching continues to function but loses reliability or performance.

### Hard Limits and Resource Exhaustion

The hard limits come from kernel-level constraints: on Linux, exhausting `fs.inotify.max_user_watches` forces processes to fall back to recursive directory scans instead of maintaining active watch descriptors.[3][16] This fallback is automatic in some tools and may be invisible to developers until they notice sudden performance degradation. IDEs like IntelliJ automatically detect when the watch limit is exceeded and switch to periodic directory scanning, resulting in a performance cliff where file change detection suddenly requires seconds instead of milliseconds.[3][16]

On macOS, exhausting file descriptors results in explicit errors when attempting to create additional fs.watch instances, though the exact error mode depends on whether the limit is kqueue's internal structure limit or the per-process ulimit.[2][20] Once the limit is hit, new fs.watch calls will fail synchronously or asynchronously with errors.

### Soft Degradation: Event Coalescing and Missed Updates

Beyond hard limits, file watching systems exhibit soft degradation where functionality continues but becomes unreliable. FSEvents on macOS automatically coalesces rapid changes to a directory into a single event, trading temporal granularity for scalability.[21][25] This coalescing is fundamental to FSEvents' design: if many files change rapidly within the same directory, the kernel might report this as a single "something changed" event rather than individual file-level events.[21]

Node.js developers expecting precise per-file change events when using fs.watch on macOS might find their expectations unmet, though this is documented behavior rather than a bug.[21] The FSEvents documentation explicitly states that applications receive the events that the operating system reports, no more and no less, and if reliability of per-file events is required, fs.watchFile() (which periodically stats files) is recommended instead.[21] This reliability guarantee caveat becomes important when scaling to many roots: a developer watching 15 directory trees on macOS might find that rapid file changes in one tree are partially masked by FSEvents coalescing.

### Real-World Degradation Patterns from Large Projects

Chokidar, one of the most widely-used file watching libraries in the Node.js ecosystem, exhibits exponential memory and CPU degradation when watching projects containing 100,000+ files, according to issue reports from its repository.[17] The exact mechanism varies: chokidar maintains in-memory state about watched files and their modification times, so memory grows with the number of files, and CPU usage increases due to the overhead of managing change events for thousands of files.[17] One user reported that chokidar with 20,000 files showed no issues, but 100,000 files resulted in highly deteriorated application performance.[17]

This pattern suggests that file watching library overhead is not purely linear with directory count but may exhibit superlinear characteristics for very large trees, potentially due to event processing overhead or data structure efficiency characteristics. For a developer considering watching 15 directories with perhaps 300,000–500,000 total files (including node_modules), empirical testing would be prudent to validate that chosen library doesn't exhibit these degradation characteristics.

## File Watching Library Alternatives and Trade-offs

Several libraries have emerged as practical alternatives to the native fs.watch mechanism, each offering different trade-offs between performance, resource consumption, and capability.

### Chokidar: Mature but Resource-Intensive

Chokidar is the de facto standard file watching library for Node.js development, used by tools like webpack, Rollup, and many development servers.[1][17][19] It provides a consistent API across platforms and handles edge cases in the underlying file system event mechanisms. However, as projects grow larger, chokidar's memory and CPU usage scales superlinearly with the number of files being watched, making it problematic for projects with 100,000+ files.[17] The library maintains detailed in-memory state about watched files and their change times, and this state can consume significant memory on very large projects.

Despite these limitations, chokidar remains the default choice for many projects because it works reliably across all platforms without requiring additional configuration, and for typical project sizes (10,000–100,000 files), the resource overhead is acceptable. For the specific use case of watching 5–15 roots each potentially containing 10,000–500,000 files including node_modules, chokidar would likely work but requires empirical validation that memory usage stays within acceptable bounds.

### @parcel/watcher: Native and Platform-Optimized

@parcel/watcher is a native C++ Node.js addon that provides direct bindings to FSEvents on macOS and offers multiple backend options on Linux, with FSEvents on macOS providing significantly better performance than brute-force backends.[9][10][19] The library is used by Parcel 2, Tailwind, Nx, Nuxt, and VSCode, indicating strong adoption by performance-conscious projects.[5][9][10] On macOS, @parcel/watcher avoids the file descriptor limits of kqueue by using FSEvents directly, enabling watching of very large directory trees efficiently.

On Linux, @parcel/watcher defaults to fts (brute force) scanning, which trades inotify watch descriptor limits for CPU and I/O overhead. The library supports Watchman as an optional backend on systems where Watchman is available, enabling projects to use Watchman's superior performance on systems where it's configured.[9][10] The primary trade-off with @parcel/watcher compared to chokidar is that it requires native compilation during npm installation (due to the C++ addon), which can occasionally fail on systems without proper build tools.

Research on Vite and discussions in the Vite issue tracker indicate strong interest in switching from chokidar to @parcel/watcher specifically because chokidar is slow on large projects and known to have issues with file descriptor limits.[10] For projects watching many large directories on both macOS and Linux, @parcel/watcher appears to offer a more efficient alternative to chokidar.

### Watchman: Facebook's Daemon-Based Approach

Watchman is Meta's (formerly Facebook's) file monitoring daemon, used widely in large-scale development environments, particularly at organizations like Meta, Google, and other large tech companies.[14][28] Watchman implements efficient file system event watches on macOS and Windows and uses an IPC/daemon system architecture that reduces resource use by centralizing the file watching logic in a separate process rather than embedding it in each application.[14][28]

The primary advantage of Watchman is its efficiency: the daemon process can deduplicate watches across multiple client applications watching the same directories, and the daemon's use of FSEvents on macOS provides excellent scalability.[14][28] However, Watchman requires running and maintaining a separate daemon process, adding operational complexity. For development teams already standardized on Watchman (common at large companies), using Watchman through @parcel/watcher's Watchman backend provides the best of both worlds: clean JavaScript API with Watchman's efficient underlying implementation.

### Turbowatch: Extreme Performance Focus

Turbowatch is a newer file change detector and task orchestrator built specifically for Node.js environments with extreme performance as the primary design goal.[29] It emphasizes speed and efficiency compared to alternatives like Nodemon, incorporating lessons learned from other file watching libraries about performance pitfalls. Information about turbowatch's specific implementation and scalability characteristics is limited in the available search results, but its positioning as a Nodemon alternative suggests it targets the development workflow automation use case rather than being a general-purpose file watching library.

### Comparative Analysis: Library Trade-offs

The library comparison matrix reveals a clear trade-off between ease of use, maturity, and performance at scale. Chokidar prioritizes ease of use and reliability at the cost of resource efficiency on large projects. @parcel/watcher optimizes for performance through native implementations and platform-specific optimizations, trading ease of installation and compilation for efficiency. Watchman provides ultimate efficiency but requires daemon infrastructure. For the specific use case of watching 5–15 roots on macOS and Linux, @parcel/watcher appears to offer the best balance of performance, reliability, and platform coverage.

## Architectural Patterns: Centralized versus Distributed Watching

The design question of whether to watch from a single high-level root or maintain separate watchers for each user-specified root has architectural implications that affect both resource usage and event reliability.

### Single Global Recursive Watcher Pattern

The pattern of watching from a single global root (e.g., `$HOME` or a project root) and filtering changes in userland through JavaScript predicates has significant appeal: it reduces the number of file descriptor allocations and inotify watch instances, potentially allowing projects to stay within system limits more easily. On macOS specifically, where FSEvents provides an efficient process-wide event stream, watching a single high-level directory and filtering events in userland could theoretically provide better scalability than maintaining separate watchers for each root.

However, this pattern has significant downsides. First, it requires the application to scan the directory tree from a high-level point that encompasses all roots, potentially including very large paths (like system directories) that the application has no interest in monitoring. Second, the event stream from such a broad watcher might include events for files outside the user-specified roots, requiring the application to filter out irrelevant events, adding CPU overhead. Third, if the high-level root is a parent directory of the specified roots, changes to other directories at the same level would trigger event processing even if the application filters them out at the userland level.

For a multi-root file browser application, the single global watcher pattern is generally inappropriate because it would watch paths the user didn't explicitly select, violating principle of least privilege and potentially causing performance issues.

### Multiple Per-Root Watchers Pattern

The standard pattern is to maintain a separate fs.watch instance (or library watcher) for each user-specified root, accepting N file descriptors or N inotify instances as the cost of precise root-level boundaries. This pattern simplifies reasoning about what is being watched and ensures that the application only processes events for paths that the user explicitly selected.

On Linux, the constraint is `fs.inotify.max_user_watches`, which must accommodate all watches across all roots. For 15 roots averaging 10,000 directories each (150,000 total directories), a properly configured Linux system with `fs.inotify.max_user_watches = 1,048,576` has room to spare. The bottleneck is more likely the watch instance count: if libuv creates one inotify instance per fs.watch call, then 15 calls will create 15 instances, well within the typical `fs.inotify.max_user_instances = 1024` limit.

On macOS, if libuv uses FSEvents, then each fs.watch call should work efficiently without consuming file descriptors at a per-directory scale. If libuv falls back to kqueue for some reason, then 15 fs.watch calls could potentially consume hundreds of file descriptors, but the total would likely remain below typical limits. The 4,096 fs.watch operations limit observed on macOS in the watchpack study is high enough that 15 roots should work comfortably.

### Hybrid Pattern: Coalescing Roots for Efficiency

A middle-ground pattern for projects with many roots is to coalesce them into a smaller number of watching tasks when their directory trees are nearby. For example, if a user selects `/home/user/projects/app1` and `/home/user/projects/app2`, the application could watch `/home/user/projects` and filter events for only those two subdirectories in userland. This reduces the number of fs.watch instances while maintaining precise boundaries, trading some CPU overhead in userland filtering for reduced kernel resource usage.

This pattern is most valuable on macOS where the 4,096 fs.watch limit creates a hard ceiling, and less valuable on Linux where the constraints are looser. For typical development workflows with 5–15 roots, the multiple per-root watcher pattern is simpler and sufficiently efficient; the hybrid pattern adds complexity without clear benefit unless the system runs into hard resource limits.

## Real-World Configuration Scenarios and System Setup

Implementing file watching at scale requires careful system configuration to ensure that the kernel-level resource limits do not become binding constraints.

### macOS System Configuration for Multi-Root Watching

To prepare a macOS system for watching 5–15 directory trees on Node 22, the system administrator or developer should configure the per-process file descriptor limits to a high value. The default ulimit -n of 256 is insufficient, and raising it to 10,000–100,000 is necessary.[2][20] This is accomplished through launchctl limit maxfiles command-line configuration or by editing shell profile configuration files (e.g., `~/.bash_profile` or `~/.zsh_profile`).

A typical sequence would be:

1. Check current limits: `launchctl limit maxfiles` and `ulimit -n`
2. Raise the hard limit with: `sudo launchctl limit maxfiles 200000 200000` (requires root access)
3. Raise the soft limit in the shell with: `ulimit -n 100000`
4. Verify changes: `ulimit -n` and `launchctl limit maxfiles`

For developers frequently working with large projects, adding the ulimit configuration to shell profile files ensures it persists across sessions. Tools like watchman automatically apply these adjustments, so developers using watchman or @parcel/watcher with Watchman backend get appropriate limits automatically.

### Linux System Configuration for Multi-Root Watching

Linux configuration is more straightforward because the binding constraints are inotify-specific rather than general file descriptors. The system administrator should configure three parameters in `/etc/sysctl.conf` or `/etc/sysctl.d/` drop-in files:

The `fs.inotify.max_user_watches` parameter should be set to accommodate the anticipated number of watched directories across all fs.watch instances. For 15 roots averaging 10,000 directories, a setting of 500,000–1,048,576 provides safety margin. The `fs.inotify.max_user_instances` parameter should be set to 1,024 or higher to permit multiple fs.watch calls. The system-wide `fs.file-max` should be raised if applications will open many files in parallel, though this is less critical for file watching specifically.

Configuration entry in `/etc/sysctl.d/30-large-watches.conf`:

```
fs.inotify.max_user_watches = 1048576
fs.inotify.max_user_instances = 1024
fs.file-max = 2097152
```

After adding this configuration file, running `sudo sysctl -p` (or `sudo sysctl -p --system`) applies the changes system-wide.

For per-process file descriptor limits on Linux, the settings in `/etc/security/limits.conf` or `/etc/security/limits.d/` files apply. A typical entry might be:

```
* soft nofile 65536
* hard nofile 2000000
```

This setting applies to all users and should be sufficient for most development scenarios, though projects with extremely large numbers of concurrently open files might require adjustment.

## Recommended Architecture for the Target Use Case

Given the specific constraints of the use case—Node 22 server, macOS primary with Linux secondary, up to 15 user-selected roots of varying sizes from 10,000 to 500,000 files including node_modules—a concrete recommendation emerges from synthesizing the technical constraints, library capabilities, and real-world operational experience.

### Library Selection: @parcel/watcher with Platform-Specific Backends

@parcel/watcher is recommended as the primary file watching library for this use case because it balances performance, reliability, and platform coverage. On macOS, it uses FSEvents directly through native C++ bindings, avoiding file descriptor exhaustion that would result from watching tens of thousands of directories with kqueue. On Linux, @parcel/watcher's fts backend provides a pragmatic trade-off: rather than consuming inotify watch descriptors for every directory in large trees like node_modules, it periodically scans the directory tree to detect changes. This trade-off is appropriate for development workflows where file change detection latency of 100–500 milliseconds is acceptable.

Optional optimization for Linux systems: if the deployment environment has Watchman configured (common in organizations standardized on Meta or Google development practices), @parcel/watcher can be configured to use Watchman as its backend, providing performance equivalent to macOS at the cost of running an additional daemon process. This configuration is most valuable if the same Node server will watch directories that other tools on the system also monitor, because Watchman automatically deduplicates watches.

### Architecture: Per-Root Watcher Instances

Instantiate one @parcel/watcher instance for each user-selected root directory rather than attempting to consolidate into fewer watchers. This architecture ensures clean boundary semantics: events are only received for the directories the user explicitly selected, and adding or removing a root is a simple add/remove operation on the watchers map. For 15 roots, this means 15 @parcel/watcher instances and 15 event subscriptions.

Each watcher should be configured with the root directory as the watch path and `recursive: true` to monitor the full tree. The application should set up callbacks to handle file change events and translate them into appropriate updates in the file browser UI. Memory overhead for 15 watchers is negligible (each watcher consumes kilobytes to low megabytes regardless of tree size when using FSEvents on macOS), and event processing overhead should remain manageable even for 500,000 files as long as the event handler performs minimal work before returning (e.g., updating a dirty flag rather than synchronously rebuilding UI).

### Pseudo-code Architecture

```javascript
const watcher = require('@parcel/watcher');

class FileWatcherManager {
  constructor() {
    this.watchers = new Map(); // path -> watcher instance
    this.callbacks = new Map(); // path -> handler function
  }

  async addRoot(rootPath, onChangeCallback) {
    if (this.watchers.has(rootPath)) return;
    const subscription = await watcher.subscribe(
      rootPath,
      (err, changedFiles) => {
        if (err) console.error(`File watch error for ${rootPath}:`, err);
        else onChangeCallback(changedFiles);
      },
      { recursive: true }
    );
    this.watchers.set(rootPath, subscription);
    this.callbacks.set(rootPath, onChangeCallback);
  }

  async removeRoot(rootPath) {
    const subscription = this.watchers.get(rootPath);
    if (subscription) {
      await subscription.unsubscribe();
      this.watchers.delete(rootPath);
      this.callbacks.delete(rootPath);
    }
  }

  async shutdown() {
    for (const subscription of this.watchers.values()) {
      await subscription.unsubscribe();
    }
    this.watchers.clear();
    this.callbacks.clear();
  }
}
```

### Monitoring and Observability

The server should export metrics about file watching performance and resource usage for monitoring and troubleshooting:

1. Number of active watchers
2. Number of events received per root (cumulative counter)
3. Time since last event for each root (indicator of watcher health)
4. Memory usage of the file watching subsystem (if measurable)
5. File descriptor count (on platforms where relevant) via `process.getFileDescriptorCount()` (available in Node 22)

These metrics should be exposed via a metrics endpoint (Prometheus, OpenTelemetry, or similar) to enable operators to detect issues and correlate file watching subsystem health with application performance.

### Platform-Specific Tuning

**macOS tuning:** For development machines where users frequently work with large projects, developers should be advised to configure higher ulimit values at shell startup time. This can be automated in team development environment setup scripts that run `ulimit -n 100000` before starting the server.

**Linux tuning:** System administrators should ensure that `fs.inotify.max_user_watches` is configured to at least 500,000 if the server might watch large project trees. This is a one-time system configuration change that applies to all applications on the system, not Node-specific.

**Cloud deployment consideration:** If deploying this server to containerized environments (Docker, Kubernetes), the container image and deployment configuration must ensure that inotify limits are raised before the application starts. By default, containers inherit low inotify limits from the host kernel defaults, leading to watch limit exhaustion.

## Conclusion

Scaling Node.js fs.watch with recursive directory watching to 5–15 user-selected roots requires careful attention to operating system-level constraints, platform-specific kernel mechanisms, and library choice. The fundamental architectural differences between macOS (FSEvents and kqueue) and Linux (inotify) create distinct constraint profiles: macOS constrained by file descriptor limits and kqueue's apparent per-process limit of roughly 4,096 concurrent watches, Linux constrained by configurable but often-insufficient default inotify watch limits.

For the specific use case of a Node 22 server on macOS Sequoia and Linux distributions (Ubuntu 24.04, Fedora 40, Debian 12) watching up to 15 roots containing up to 500,000 files each, @parcel/watcher provides an effective solution that leverages platform-native mechanisms for efficiency. On macOS, @parcel/watcher's FSEvents backend avoids file descriptor exhaustion; on Linux, the fts brute-force backend trades inotify watch descriptor consumption for CPU overhead in exchange for simplicity and robustness. The per-root watcher architecture maintains clean semantics and enables dynamic addition and removal of watch roots as user preferences change.

System configuration is critical: macOS deployments require raising ulimit -n to 10,000–100,000, while Linux deployments require raising `fs.inotify.max_user_watches` to 500,000–1,048,576. These are one-time system administration tasks that enable the application to scale without degradation.

## Citations

[1] https://github.com/libuv/libuv/issues/1778
[2] https://github.com/fsnotify/fsnotify/issues/8
[3] https://intellij-support.jetbrains.com/hc/en-us/articles/15268113529362-Inotify-Watches-Limit-Linux
[4] https://blog.logrocket.com/exploring-native-file-watching-node-js-v22/
[5] https://github.com/11ty/eleventy/issues/3149
[6] https://github.com/fsnotify/fsevents/issues/36
[7] https://discourse.ubuntu.com/t/okay-how-the-heck-do-i-increase-the-number-of-files-on-my-system/72973
[8] https://discussion.fedoraproject.org/t/setting-default-ulimit-n-for-user-in-fedora-40/118073
[9] https://github.com/parcel-bundler/watcher
[10] https://github.com/vitejs/vite/issues/13593
[11] https://dev.to/mohammad1105/understanding-nodejs-threads-libuv-and-server-scalability-a-deep-dive-1555
[12] https://man7.org/linux/man-pages/man7/inotify.7.html
[13] https://github.com/libuv/libuv/discussions/4237
[14] https://news.ycombinator.com/item?id=33094829
[15] https://hackmd.io/@M4shl3/FSEvents
[16] https://youtrack.jetbrains.com/articles/SUPPORT-A-1715/Inotify-Watches-Limit-Linux
[17] https://github.com/paulmillr/chokidar/issues/1162
[18] https://github.com/denoland/deno/issues/32935
[19] https://www.npmjs.com/package/@parcel/watcher
[20] https://github.com/webpack/watchpack/issues/169
[21] https://github.com/nodejs/node/issues/47058
[22] https://www.daily.co/blog/introduction-to-memory-management-in-node-js-applications/
[25] https://news.ycombinator.com/item?id=47508710
[27] https://www.ibm.com/docs/en/ahts/4.4.x?topic=folders-configuring-linux-many-watch
[28] https://facebook.github.io/watchman/
[29] https://github.com/gajus/turbowatch
[30] https://watchexec.github.io/docs/macos-fsevents.html
