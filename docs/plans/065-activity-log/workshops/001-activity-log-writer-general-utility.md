# Workshop: ActivityLogWriter as General Utility

**Type**: Storage Design
**Plan**: 065-activity-log
**Spec**: [activity-log-spec.md](../activity-log-spec.md)
**Created**: 2026-03-05T22:08:00Z
**Status**: Draft

**Related Documents**:
- [research-dossier.md](../research-dossier.md) — 71 findings from 8 subagents
- `packages/shared/src/adapters/events-jsonl-parser.ts` — existing JSONL parser pattern
- `apps/web/src/lib/work-unit-state/work-unit-state.service.ts` — existing persist/hydrate pattern

**Domain Context**:
- **Primary Domain**: activity-log (NEW)
- **Related Domains**: terminal (first source), agents (future source), _platform/events (SSE channel)

---

## Purpose

Design the ActivityLogWriter and ActivityLogReader as **general-purpose utilities** — not narrowly scoped to tmux pane titles. Future sources (agent intents, workflow events, build results, deploy status) must be able to write entries with zero changes to the writer itself. This workshop defines the entry schema, the writer/reader contracts, filtering/dedup logic, and the extension pattern for new sources.

## Key Questions Addressed

- What metadata fields are required vs optional for an activity log entry?
- How do future sources register their own ignore patterns?
- Should entries carry structured metadata beyond `label`?
- What is the JSONL file format and how does it handle corruption?
- How does the writer work in a sidecar process without DI or Next.js?

---

## Design Principles

1. **Pure functions** — writer and reader are stateless functions, not class instances. No DI required. Callable from any context (sidecar, Next.js server, CLI, tests).
2. **Source-agnostic** — the writer accepts any valid `ActivityLogEntry`. It does not know or care what produced it.
3. **Dedup at the writer** — the writer reads the last N entries for the same `id` to skip duplicates. This is the writer's responsibility, not the source's.
4. **Ignore at the source** — each source owns its own ignore list. The writer does not filter content — it trusts the caller to have already filtered.
5. **JSONL append-only** — one JSON object per line, `fs.appendFileSync`. No full-file rewrites except during rotation (future).

---

## Entry Schema

### Required Fields

```typescript
/** A single activity log entry — source-agnostic, append-only */
interface ActivityLogEntry {
  /** 
   * Dedup key: identifies the "slot" this entry occupies.
   * Same id + same label = duplicate (skip).
   * Examples: "tmux:0.0", "tmux:1.0", "agent:agent-1", "build:web"
   */
  id: string;

  /**
   * Source type — identifies what system produced this entry.
   * Convention: lowercase, no spaces. Future sources add new values.
   * Examples: "tmux", "agent", "workflow", "build", "deploy"
   */
  source: string;

  /**
   * Human-readable label — what's happening right now.
   * This is the primary display text in the overlay panel.
   * Examples: "Implementing Phase 1", "Running tests", "Building web app"
   */
  label: string;

  /**
   * ISO-8601 timestamp — when this activity was observed.
   * Set by the source, not the writer (the source knows when it observed the change).
   */
  timestamp: string;
}
```

### Optional Fields (via `meta`)

```typescript
/** Extended entry with optional structured metadata */
interface ActivityLogEntryWithMeta extends ActivityLogEntry {
  /**
   * Source-specific metadata — unstructured bag of key-value pairs.
   * The writer persists it as-is. The reader returns it as-is.
   * The overlay panel MAY display specific keys if it recognizes the source.
   *
   * Examples:
   *   tmux:  { pane: "0.0", session: "059-fix-agents" }
   *   agent: { agentId: "agent-1", model: "claude-opus-4.6" }
   *   build: { target: "apps/web", exitCode: 0 }
   */
  meta?: Record<string, unknown>;
}
```

**Why `meta` instead of named optional fields?**

Named fields (like `pane?: string`) create coupling — the writer needs to know about every source's fields. A `meta` bag keeps the writer generic. The overlay panel can check `entry.source === 'tmux'` and then read `entry.meta?.pane` for display purposes. New sources add their own keys without touching the writer.

### JSON Schema (for validation)

```typescript
const ACTIVITY_LOG_ENTRY_SCHEMA = {
  type: 'object',
  required: ['id', 'source', 'label', 'timestamp'],
  properties: {
    id:        { type: 'string', minLength: 1 },
    source:    { type: 'string', pattern: '^[a-z][a-z0-9-]*$' },
    label:     { type: 'string', minLength: 1 },
    timestamp: { type: 'string', format: 'date-time' },
    meta:      { type: 'object' },
  },
  additionalProperties: false,
} as const;
```

---

## File Format

### Location

```
<worktree>/.chainglass/data/activity-log.jsonl
```

Per ADR-0008 Layer 2: git-committed, per-worktree, shared with team.

### Format: JSONL (newline-delimited JSON)

```jsonl
{"id":"tmux:0.0","source":"tmux","label":"Implementing Phase 1","timestamp":"2026-03-05T21:22:33Z","meta":{"pane":"0.0","session":"059-fix-agents"}}
{"id":"tmux:1.0","source":"tmux","label":"Running tests","timestamp":"2026-03-05T21:25:01Z","meta":{"pane":"1.0","session":"059-fix-agents"}}
{"id":"tmux:0.0","source":"tmux","label":"Code review","timestamp":"2026-03-05T21:30:00Z","meta":{"pane":"0.0","session":"059-fix-agents"}}
{"id":"agent:agent-1","source":"agent","label":"Exploring codebase","timestamp":"2026-03-05T21:31:15Z","meta":{"agentId":"agent-1","model":"claude-opus-4.6"}}
```

**Why JSONL?**
- Append-only: `fs.appendFileSync(path, JSON.stringify(entry) + '\n')` — no full-file rewrite
- Crash-safe: partial last line is discarded on read (malformed line skip)
- Human-readable: `cat` / `tail -f` for debugging
- Sortable: entries are naturally chronological (appended in order)

**Why not single JSON array?**
- Requires reading the entire file, parsing, pushing, and rewriting on every append
- Single corrupt byte can break the entire file

---

## Writer Contract

### Function Signature

```typescript
/**
 * Append an activity log entry to the per-worktree JSONL file.
 * 
 * Dedup: skips write if the last entry for the same `id` has the same `label`.
 * Creates .chainglass/data/ directory if it doesn't exist.
 * 
 * Pure function — no class, no DI, no state. Callable from any Node.js context.
 */
function appendActivityLogEntry(
  worktreePath: string,
  entry: ActivityLogEntry
): void
```

### Dedup Algorithm

```
READ last 50 lines of file (or entire file if < 50 lines)
PARSE each line as JSON (skip malformed)
FIND last entry where entry.id === new_entry.id
IF found AND found.label === new_entry.label:
  SKIP (duplicate)
ELSE:
  APPEND entry as JSONL line
```

**Why last 50 lines?** Balances dedup effectiveness vs read cost. 50 lines covers ~5 minutes of 10s polling across 10 panes. If an entry for `tmux:0.0` had a different label 51 lines ago, that's old enough to be a real change.

### Implementation Sketch

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

const DEDUP_LOOKBACK = 50;

export function appendActivityLogEntry(
  worktreePath: string,
  entry: ActivityLogEntry
): void {
  const filePath = path.join(worktreePath, '.chainglass', 'data', 'activity-log.jsonl');
  const dir = path.dirname(filePath);

  // Ensure directory exists
  fs.mkdirSync(dir, { recursive: true });

  // Dedup check: read tail of file
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n').slice(-DEDUP_LOOKBACK);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const existing = JSON.parse(lines[i]);
          if (existing.id === entry.id) {
            if (existing.label === entry.label) return; // duplicate — skip
            break; // different label — proceed to write
          }
        } catch { /* skip malformed */ }
      }
    } catch { /* file read error — proceed to write */ }
  }

  // Append
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
}
```

### Performance Note

Reading the entire file for dedup on every poll (10s × N panes) is wasteful for large files. Optimization for later: keep an in-memory cache of `Map<id, lastLabel>` in the sidecar process, only read from disk on startup.

---

## Reader Contract

### Function Signature

```typescript
/**
 * Read all activity log entries for a worktree.
 * Returns entries in chronological order (oldest first).
 * Skips malformed lines gracefully.
 *
 * Options:
 *   limit: maximum entries to return (from the end, most recent)
 *   since: ISO timestamp — only entries after this time
 *   source: filter by source type
 */
function readActivityLog(
  worktreePath: string,
  options?: {
    limit?: number;
    since?: string;
    source?: string;
  }
): ActivityLogEntry[]
```

### Implementation Sketch

```typescript
export function readActivityLog(
  worktreePath: string,
  options?: { limit?: number; since?: string; source?: string }
): ActivityLogEntry[] {
  const filePath = path.join(worktreePath, '.chainglass', 'data', 'activity-log.jsonl');

  if (!fs.existsSync(filePath)) return [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    let entries: ActivityLogEntry[] = [];

    for (const line of content.trim().split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (!entry.id || !entry.source || !entry.label || !entry.timestamp) continue;
        if (options?.since && entry.timestamp <= options.since) continue;
        if (options?.source && entry.source !== options.source) continue;
        entries.push(entry);
      } catch { /* skip malformed line */ }
    }

    if (options?.limit) {
      entries = entries.slice(-options.limit);
    }

    return entries;
  } catch {
    return [];
  }
}
```

---

## Ignore Lists — Source Responsibility

Each source owns its own ignore logic. The writer does NOT filter.

### tmux Source Ignore List

```typescript
/** Patterns to ignore when capturing tmux pane titles */
const TMUX_PANE_TITLE_IGNORE: RegExp[] = [
  /\.localdomain$/,           // e.g. "Mac.localdomain"
  /\.local$/,                 // e.g. "Jordans-MacBook-Pro.local"
  /^$/,                       // empty string
  /^(ba|z|fi)?sh$/,           // bare shell names
  /^~?\//,                    // bare paths (not meaningful as activity)
];

function shouldIgnorePaneTitle(title: string): boolean {
  return TMUX_PANE_TITLE_IGNORE.some(pattern => pattern.test(title));
}
```

### Future Source Ignore Lists

Each source defines its own:
```typescript
// Agent source might ignore:
const AGENT_INTENT_IGNORE = [/^$/, /^idle$/i];

// Build source might ignore:
const BUILD_EVENT_IGNORE = [/^watching$/i, /^waiting for changes$/i];
```

**Why source-level filtering?** The writer is a dumb pipe — it appends whatever it's given. Sources understand their own noise patterns. This avoids a growing centralized ignore list that couples all sources together.

---

## Source Registration Pattern

Sources don't "register" with the writer — they just call `appendActivityLogEntry()`. The pattern is:

```
Source polls/observes → filters noise → calls appendActivityLogEntry() → done
```

### Example: tmux Source (in terminal sidecar)

```typescript
// In terminal-ws.ts handleConnection()
const titleInterval = setInterval(() => {
  const paneTitles = manager.getPaneTitles(sessionName);
  for (const { pane, title } of paneTitles) {
    if (shouldIgnorePaneTitle(title)) continue;
    appendActivityLogEntry(worktreePath, {
      id: `tmux:${pane}`,
      source: 'tmux',
      label: title,
      timestamp: new Date().toISOString(),
      meta: { pane, session: sessionName },
    });
  }
}, PANE_TITLE_POLL_MS);
```

### Example: Agent Source (future)

```typescript
// In AgentInstance._captureEvent()
if (event.type === 'tool_call' && toolName === 'report_intent') {
  appendActivityLogEntry(this.workspace, {
    id: `agent:${this.id}`,
    source: 'agent',
    label: intentText,
    timestamp: new Date().toISOString(),
    meta: { agentId: this.id, model: this.type },
  });
}
```

### Example: Build Source (future)

```typescript
// In build watcher
appendActivityLogEntry(worktreePath, {
  id: `build:${target}`,
  source: 'build',
  label: exitCode === 0 ? `Build succeeded (${duration}s)` : `Build failed`,
  timestamp: new Date().toISOString(),
  meta: { target, exitCode, duration },
});
```

---

## Multi-Pane Polling

### Current: Single Pane

```typescript
// getPaneTitle(sessionName) → string | null
```

### Proposed: All Panes

```typescript
// getPaneTitles(sessionName) → Array<{ pane: string; title: string }>

getPaneTitles(sessionName: string): Array<{ pane: string; title: string }> {
  try {
    const output = this.exec('tmux', [
      'list-panes', '-t', sessionName,
      '-F', '#{window_index}.#{pane_index}\t#{pane_title}',
    ]);
    return output.trim().split('\n')
      .filter(line => line.includes('\t'))
      .map(line => {
        const [pane, ...titleParts] = line.split('\t');
        return { pane, title: titleParts.join('\t') };
      });
  } catch {
    return [];
  }
}
```

### ID Format

| Source | ID Format | Example |
|--------|-----------|---------|
| tmux | `tmux:{window}.{pane}` | `tmux:0.0`, `tmux:1.0` |
| agent | `agent:{agentId}` | `agent:agent-1` |
| build | `build:{target}` | `build:apps/web` |
| deploy | `deploy:{env}` | `deploy:staging` |

---

## Overlay Display Grouping

The overlay panel renders entries grouped by source, with interleaved timeline:

```
┌─────────────────────────────────────────────────────────────┐
│  Activity Log                                          ✕    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  21:31  🤖 agent:agent-1    Exploring codebase              │
│  21:30  🖥  tmux:0.0         Code review                    │
│  21:25  🖥  tmux:1.0         Running tests                  │
│  21:22  🖥  tmux:0.0         Implementing Phase 1           │
│                                                             │
│  ─── 2h gap ───                                             │
│                                                             │
│  19:15  🖥  tmux:0.0         Writing tests                  │
│  19:10  🤖 agent:agent-1    Fixing auth bug                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Source icons:
- 🖥 tmux
- 🤖 agent
- 🔨 build
- 🚀 deploy

Gap detection: if >30min between entries, render a gap separator with duration.

---

## File Lifecycle

| Phase | Description |
|-------|-------------|
| **Create** | First `appendActivityLogEntry()` call creates directory + file |
| **Grow** | Entries append indefinitely |
| **Read** | Reader loads file, parses line-by-line, filters/limits |
| **Rotation** (future) | When file exceeds size threshold, archive and start fresh |
| **Cleanup** (future) | Delete archived files older than N days |

Rotation and cleanup are **out of scope for v1**. The file will grow unbounded until we implement rotation. For a 10s poll with 3 panes, that's ~26,000 entries/day (~2.5MB/day in JSONL). Acceptable for weeks of use.

---

## Open Questions

### Q1: Should the writer validate the entry schema?

**RESOLVED**: No. The writer is a hot path (called every 10s per pane). Schema validation adds overhead. Trust the caller to provide valid entries. The reader skips malformed lines anyway.

### Q2: Should the file be `.gitignore`d?

**OPEN**: Two perspectives:
- **Commit**: Team members see what was worked on (ADR-0008 says Layer 2 is "git-committed, shared with team")
- **Ignore**: Activity logs are noisy, personal, and create merge conflicts

Leaning toward **.gitignore** — this is a personal activity diary, not shared project state.

### Q3: File locking for concurrent writers?

**RESOLVED**: Not needed for v1. Terminal sidecar is the only writer initially. If multiple writers emerge (sidecar + Next.js server + CLI), we'll add advisory file locking or switch to a SQLite DB.

### Q4: Should we use the existing JSONL parser from events-jsonl-parser.ts?

**RESOLVED**: No — that parser is tightly coupled to `AgentEvent` types. The activity log reader is simpler (just `JSON.parse` per line with schema check). But follow the same pattern: skip malformed lines, no throw on parse error.

---

## Comparison: This Design vs Alternatives

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| **Pure functions + JSONL** | No DI, works in sidecar, simple | No in-memory cache, reads file for dedup | ✅ **Chosen** |
| **Service class + JSON** | Familiar pattern, in-memory cache | Needs DI, can't use in sidecar, full-file rewrite | ❌ Too coupled |
| **SQLite** | Structured queries, atomic writes | External dependency, overkill for append-only | ❌ Overengineered |
| **Extend WorkUnitStateService** | Reuse existing code | Muddies live-state vs history, different lifecycle | ❌ Wrong abstraction |

---

## Summary: What Makes This General-Purpose

1. **Entry schema** — `{ id, source, label, timestamp, meta? }` covers any activity type
2. **Source-agnostic writer** — pure function, no knowledge of what sources exist
3. **Source-owned filtering** — each source brings its own ignore patterns
4. **Unstructured meta** — sources attach whatever metadata they need without schema changes
5. **Loose coupling** — sources call the writer function directly, no registration, no DI
6. **Convention-based IDs** — `{source}:{identifier}` enables dedup and display grouping
