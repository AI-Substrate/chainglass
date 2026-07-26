/**
 * The fence proof — Plan 089 Phase 1, T010 · AC-11 · C-02.
 *
 * > **Sole-writer fences, one policy**: never write `~/.pij/**` or `the-flow.json` / `the-flow.md` /
 * > `.the-flow-state.json`.
 *
 * Two stores, two owners, one rule. `~/.pij` is written by the pij daemon and CLI; the flow documents
 * are written by the `harness flow` CLI *exclusively* — the driving skill does not write them, it
 * calls the CLI. Chainglass is a registered **read-only** consumer of both. A single write from here
 * is not a bug to be fixed later; it is a breach of the terms this feature exists under.
 *
 * This is a **static** proof over the feature's own source, which is what makes it durable: it holds
 * for code nobody has run, for a branch nobody has reviewed, and for a call path no test reaches. The
 * runtime half lives in `pij-records.ts` (`assertReadOnlyArgv`), covered in `pij-records.test.ts`.
 *
 * The check is deliberately blunt. A false positive costs a comment rewrite; a false negative costs
 * the fence.
 */
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '../../../..');

/** Every directory this feature owns. A new source dir must be added here or it is unguarded. */
const GUARDED_ROOTS = ['apps/web/src/features/089-first-class-pij', 'apps/web/app/api/pij'];

/**
 * Write-mode filesystem APIs. Matched as whole identifiers so `readFile` never trips `writeFile`,
 * and `rm` never matches inside `form`.
 */
const WRITE_FS_APIS = [
  'writeFile',
  'writeFileSync',
  'appendFile',
  'appendFileSync',
  'createWriteStream',
  'mkdir',
  'mkdirSync',
  'mkdtemp',
  'mkdtempSync',
  'rm',
  'rmSync',
  'rmdir',
  'rmdirSync',
  'unlink',
  'unlinkSync',
  'rename',
  'renameSync',
  'copyFile',
  'copyFileSync',
  'truncate',
  'truncateSync',
  'utimes',
  'utimesSync',
  'chmod',
  'chmodSync',
  'writev',
  'write',
];

/**
 * pij verbs that mutate. v1 runs ZERO of them (C-01: no close/`--force`/reap, no daemon restart, no
 * keystrokes, no auto-refresh; C-02: no writes at all).
 */
const MUTATING_PIJ_VERBS = [
  'close',
  'spawn',
  'send',
  'kill',
  'reap',
  'adopt',
  'link',
  'unlink',
  'task set',
  'state set',
  'project set',
  'daemon restart',
  'stream create',
  'baton',
  'verify',
];

/** `harness flow` verbs that mutate. The flow fence is the same policy as the pij fence. */
const MUTATING_FLOW_VERBS = [
  'flow create',
  'flow status',
  'flow nav set',
  'flow set-node',
  'flow add-node',
  'flow comment',
  'flow render',
  'flow apply',
];

/** Filenames no code in this feature may ever construct for writing. */
const FORBIDDEN_WRITE_TARGETS = ['the-flow.md', '.the-flow-state.json'];

/**
 * The ONE file allowed to name tmux — Phase 4's focus route (C-06). Carved out of the general
 * assertion and checked by a stricter companion instead.
 */
const FOCUS_ROUTE = 'apps/web/app/api/pij/focus/route.ts';

/** Files that must still be seen by the general tmux check, so the exclusion cannot swallow it. */
const TMUX_FREE_WITNESSES = [
  'apps/web/app/api/pij/fleet/route.ts',
  'apps/web/src/features/089-first-class-pij/server/pij-records.ts',
];

/**
 * tmux verbs that touch a pane rather than merely change which window is visible. R-01: an attached
 * client's size can clamp and reflow an agent's pane and corrupt the daemon's own liveness read, so
 * these stay forbidden even inside the file that is allowed to reach tmux at all.
 */
const FORBIDDEN_TMUX_VERBS = [
  'send-keys',
  'attach-session',
  'attach',
  'kill-session',
  'kill-window',
  'kill-pane',
  'resize-pane',
  'resize-window',
  'respawn-pane',
  'split-window',
  'new-window',
  'new-session',
  'set-option',
  'paste-buffer',
];

interface SourceFile {
  path: string;
  /** Source with comments and import lines removed — the only thing the fence assertions look at. */
  code: string;
}

/**
 * Strip comments and imports.
 *
 * Comments must go because this feature's whole point is documenting the fence, and the prose
 * necessarily names the very verbs the fence forbids. Imports must go because `import { readFile,
 * readdir }` is a legitimate line that happens to sit next to write APIs in the same module's
 * namespace. What remains is executable code, which is what the fence is actually about.
 */
function toCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .split('\n')
    .filter((line) => !/^\s*import\s/.test(line) && !/^\s*}\s*from\s/.test(line))
    .join('\n');
}

async function collectSources(): Promise<SourceFile[]> {
  const files: SourceFile[] = [];

  // Structurally typed rather than `Dirent<…>`: the generic differs across @types/node versions and
  // the walk only needs a name and a directory flag.
  async function walk(dir: string): Promise<void> {
    let entries: Array<{ name: string; isDirectory(): boolean }>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!['.ts', '.tsx'].includes(extname(entry.name))) continue;
      const raw = await readFile(full, 'utf8');
      files.push({ path: relative(REPO_ROOT, full), code: toCode(raw) });
    }
  }

  for (const root of GUARDED_ROOTS) await walk(join(REPO_ROOT, root));
  return files;
}

function findAll(files: SourceFile[], pattern: RegExp): string[] {
  return files
    .filter((file) => pattern.test(file.code))
    .map((file) => `${file.path}: ${pattern.exec(file.code)?.[0]}`);
}

describe('C-02 fence — the feature writes to nothing (AC-11)', () => {
  it('guards a non-empty set of source files (the check itself must not silently cover zero)', async () => {
    /*
    Test Doc:
    - Why: A static check whose glob has drifted passes perfectly while proving nothing — the "green
      that lies". This asserts the fence has something to look at before any conclusion is drawn from
      its silence.
    - Contract: Both guarded roots contribute files, and the feature's server modules are among them.
    - Usage Notes: Renaming the feature directory makes THIS fail first, which is the point.
    - Quality Contribution: Turns the fence from a claim into a measurement.
    - Worked Example: ≥ 8 files, including spine-cursor.ts and a route.
    */
    const files = await collectSources();

    expect(files.length).toBeGreaterThanOrEqual(8);
    expect(files.map((f) => f.path)).toEqual(
      expect.arrayContaining([
        'apps/web/src/features/089-first-class-pij/server/spine-cursor.ts',
        'apps/web/src/features/089-first-class-pij/server/pij-records.ts',
        'apps/web/src/features/089-first-class-pij/server/flow-reader.ts',
        'apps/web/app/api/pij/fleet/route.ts',
      ])
    );
  });

  it('opens no write-mode filesystem handle anywhere in the feature', async () => {
    /*
    Test Doc:
    - Why: AC-11 verbatim: "static analysis/tests prove the feature's server code opens no write
      handle under ~/.pij and no flow file path". Checking the whole feature rather than only the
      pij-shaped paths is deliberate — a helper that writes "somewhere else" today is one refactor
      away from writing there tomorrow, and the feature has no legitimate reason to write anything.
    - Contract: No write-mode fs API appears in executable code.
    - Usage Notes: Comments and imports are stripped first; this feature documents the very APIs it
      forbids.
    - Quality Contribution: The load-bearing half of the sole-writer fence.
    - Worked Example: zero matches across all guarded files.
    */
    const files = await collectSources();
    const offenders = findAll(files, new RegExp(`\\b(${WRITE_FS_APIS.join('|')})\\s*\\(`, 'm'));

    expect(offenders).toEqual([]);
  });

  it('opens files only in read mode', async () => {
    /*
    Test Doc:
    - Why: `fs.open(path, 'w')` writes without ever naming `writeFile`. The spine cursor legitimately
      calls `open()`, so the API cannot simply be banned — the FLAG is what matters.
    - Contract: Every `open(...)` call in the feature uses 'r'.
    - Usage Notes: The cursor's `open(this.logPath, 'r')` is the only call site today.
    - Quality Contribution: Closes the one write path the API-name check cannot see.
    - Worked Example: the single open() call is mode 'r'.
    */
    const files = await collectSources();
    const openCalls = files.flatMap((file) =>
      [...file.code.matchAll(/\bopen\s*\(([^)]*)\)/g)].map((m) => `${file.path}: open(${m[1]})`)
    );

    expect(openCalls.length).toBeGreaterThan(0);
    for (const call of openCalls) {
      expect(call, 'every open() must be read-mode').toMatch(/'r'|"r"/);
    }
  });

  it('names no mutating pij verb', async () => {
    /*
    Test Doc:
    - Why: C-01's four forbidden affordances and C-02's no-writes rule are one policy at the CLI
      boundary: v1 runs zero mutating verbs. A mutating verb present in the source is a mutating verb
      one code path away from running.
    - Contract: None of the mutating verbs appears in executable code.
    - Usage Notes: `pij-records.ts` lists forbidden tokens in a DENYLIST — a data structure whose
      purpose is to reject them. It is excluded from this assertion and asserted separately below.
    - Quality Contribution: The static half of the read-only guarantee.
    - Worked Example: zero matches outside the denylist.
    */
    const files = (await collectSources()).filter(
      (file) => !file.path.endsWith('server/pij-records.ts')
    );
    const offenders = findAll(
      files,
      new RegExp(`['"\`](${MUTATING_PIJ_VERBS.join('|')})['"\`\\s]`, 'm')
    );

    expect(offenders).toEqual([]);
  });

  it('the record adapter names mutating verbs ONLY inside its denylist', async () => {
    /*
    Test Doc:
    - Why: The one file excluded above must be checked, not waved through. Its mutating-verb strings
      are legitimate exactly once: as members of `PIJ_FORBIDDEN_TOKENS`, the array that rejects them.
    - Contract: Every mutating verb in that file sits inside the denylist declaration.
    - Usage Notes: Splits the source at the end of the denylist.
    - Quality Contribution: Removes the exclusion's blind spot.
    - Worked Example: 'close' appears in the denylist and nowhere after it.
    */
    const source = await readFile(
      join(REPO_ROOT, 'apps/web/src/features/089-first-class-pij/server/pij-records.ts'),
      'utf8'
    );
    const code = toCode(source);
    const denylistEnd = code.indexOf(']', code.indexOf('PIJ_FORBIDDEN_TOKENS'));
    expect(denylistEnd).toBeGreaterThan(0);

    const afterDenylist = code.slice(denylistEnd);
    for (const verb of ['close', 'spawn', 'reap', 'kill']) {
      expect(afterDenylist, `"${verb}" must appear only in the denylist`).not.toMatch(
        new RegExp(`['"\`]${verb}['"\`]`)
      );
    }
  });

  it('names no mutating harness flow verb', async () => {
    /*
    Test Doc:
    - Why: The flow fence is the same policy. The `harness flow` CLI is the sole writer of the flow
      documents, and the doctrine is stronger than "sole writer": even the driving skill does not
      write them, it calls the CLI. We do neither.
    - Contract: No `flow <mutating-verb>` string in executable code.
    - Usage Notes: The reader parses `the-flow.json` directly, which is explicitly sanctioned for a
      watching view — reading is fine, writing never is.
    - Quality Contribution: The flow half of the one policy.
    - Worked Example: zero matches.
    */
    const files = await collectSources();
    const offenders = findAll(files, new RegExp(`['"\`](${MUTATING_FLOW_VERBS.join('|')})`, 'm'));

    expect(offenders).toEqual([]);
  });

  it('never constructs the derived render or the legacy state file as a target', async () => {
    /*
    Test Doc:
    - Why: `the-flow.md` is a render with a CI drift guard (`render --check` → E310) that will catch a
      write. `.the-flow-state.json` is a documented **resurrection hazard**: the current skill deletes
      it on sight, and re-creating one would poison any reader not yet repointed to `nav`.
    - Contract: Neither filename appears in executable code at all.
    - Usage Notes: `the-flow.json` IS named — as the read target — and is therefore not in this list.
    - Quality Contribution: Prevents the two worst individual writes this feature could make.
    - Worked Example: zero matches.
    */
    const files = await collectSources();
    const offenders = findAll(
      files,
      new RegExp(FORBIDDEN_WRITE_TARGETS.map((t) => t.replace(/\./g, '\\.')).join('|'), 'm')
    );

    expect(offenders).toEqual([]);
  });

  it('never watches ~/.pij with a file watcher (C-04)', async () => {
    /*
    Test Doc:
    - Why: T4 — descriptors are rewritten every daemon tick × ~180 seats, so chokidar over that
      directory is the naive client-side design relocated server-side. We poll on OUR clock. (Flow
      files are the opposite and Phase 3 watches them — hence this checks the pij side by naming
      the watcher APIs, which the flow watcher would have needed to be allowed past explicitly.)
    - Contract: No chokidar import, no fs.watch, no watchFile.
    - Usage Notes: Phase 3 shipped `server/flow-watcher.ts` and this assertion still covers it with
      NO exclusion — it reaches the filesystem through `IFileWatcherFactory` from
      `@chainglass/workflow`, so it names no watcher API at all. The exclusion this Test Doc
      anticipated turned out to be unnecessary, and an unnecessary exclusion is a hole. The companion
      assertion below covers what the general check cannot see: WHAT that file watches.
    - Quality Contribution: Keeps the ruled-out design ruled out.
    - Worked Example: zero matches, flow-watcher.ts included.
    */
    const files = await collectSources();
    const offenders = findAll(files, /\b(chokidar|fs\.watch|watchFile|watch\s*\()/m);

    expect(offenders).toEqual([]);
    // The check must be looking AT the watcher, or its silence proves nothing about it.
    expect(files.map((file) => file.path)).toEqual(
      expect.arrayContaining(['apps/web/src/features/089-first-class-pij/server/flow-watcher.ts'])
    );
  });

  it('the flow watcher watches plan folders and nothing else (C-04, companion)', async () => {
    /*
    Test Doc:
    - Why: the general assertion above bans the watcher APIs, and the one file that legitimately
      watches never names them — it goes through an injected factory. So the general check passes over
      it while saying nothing about its TARGETS, which is the half of C-04 that actually matters:
      "never watch ~/.pij" is a statement about paths, not about API names.
    - Contract: C-04 (narrowed for the flow side only, never deleted); T006.
    - Usage Notes: mirrors the `pij-records.ts` denylist precedent — the file's only `.pij` mention is
      inside the function whose job is to REFUSE such a path, and this splits the source at the end of
      that function to prove nothing after it names one.
    - Quality Contribution: turns "we watch the right thing" from a code-review opinion into a check.
    - Worked Example: every `.add(...)` argument is `plansRoot`; the sole `.pij` literal sits inside
      `assertNotPijShaped`.
    */
    const path = 'apps/web/src/features/089-first-class-pij/server/flow-watcher.ts';
    const code = toCode(await readFile(join(REPO_ROOT, path), 'utf8'));

    // 1. The watch root is always the derived plans root — never a path from anywhere else.
    const addArgs = [...code.matchAll(/\.add\s*\(([^)]*)\)/g)].map((match) => match[1].trim());
    expect(addArgs.length).toBeGreaterThan(0);
    for (const arg of addArgs) {
      expect(arg, 'the watcher may only ever be handed a derived plans root').toBe('plansRoot');
    }

    // 2. That root is built from the plans subdir, and the document it reacts to is the flow file.
    expect(code).toMatch(/PLANS_SUBDIR\s*=\s*join\('docs',\s*'plans'\)/);
    expect(code).toMatch(/FLOW_DOCUMENT\s*=\s*'the-flow\.json'/);
    expect(code).toMatch(/join\(workspacePath,\s*PLANS_SUBDIR\)/);

    // 3. `.pij` appears only inside the refusal, exactly as mutating verbs appear only inside the
    //    record adapter's denylist. Anything after that function naming it would be a watch target.
    const refusalEnd = code.indexOf('function assertNotPijShaped');
    expect(refusalEnd).toBeGreaterThan(0);
    const beforeRefusal = code.slice(0, refusalEnd);
    const afterRefusal = code.slice(code.indexOf('}', code.indexOf('throw new Error', refusalEnd)));
    expect(beforeRefusal).not.toMatch(/['"`]\.pij['"`]/);
    expect(afterRefusal, '`.pij` must appear only inside the refusal').not.toMatch(
      /['"`]\.pij['"`]/
    );

    // 4. And the refusal is reached before any registration, on every path into it.
    expect(code).toMatch(/watchWorkspace\(workspacePath: string\): void \{\s*assertNotPijShaped\(/);
  });

  it('never shells out through a shell (fixed argv only)', async () => {
    /*
    Test Doc:
    - Why: pij ids are arbitrary strings. `exec`/`execSync` interpolate through a shell, which turns
      an id into an injection vector and makes the read-verb allowlist bypassable by a semicolon.
    - Contract: Only `execFile` appears; never `exec(`, `execSync(`, `spawn(` or `shell: true`.
    - Usage Notes: `execFile` is matched as a whole word so it does not trip the `exec(` check.
    - Quality Contribution: Keeps the single process-spawning seam safe by construction.
    - Worked Example: zero matches.
    */
    const files = await collectSources();
    const offenders = findAll(
      files,
      /(?<!execFile)(?<![A-Za-z])(execSync|spawnSync)\s*\(|shell:\s*true/m
    );

    expect(offenders).toEqual([]);
  });

  it('never sends keystrokes to a pane or drives tmux (C-01, C-06)', async () => {
    /*
    Test Doc:
    - Why: 064-terminal's attach is a live keyboard, and even a silent attached client's size can
      clamp/reflow an agent's pane and corrupt the daemon's own BUSY_RE liveness read. The observatory
      never links a pij seat to that path.
    - Contract: No tmux invocation, no send-keys, no attach anywhere in the feature — with exactly one
      carved-out file, the focus route, which Phase 4 ships as the ONE sanctioned mutation (C-06).
    - Usage Notes: The carve-out is a NARROWING, not a weakening: the excluded path is asserted to
      exist and to be in the collected set (an exclusion naming a file that has moved is a silent
      hole), and the companion assertion below checks what this one can no longer see — WHICH tmux
      verb that file names, and how it is reached.
    - Quality Contribution: Proves AC-10's "forbidden affordances" everywhere except the single place
      one affordance is sanctioned, and proves that place separately rather than trusting it.
    - Worked Example: zero matches across every file but the focus route.
    */
    const files = await collectSources();
    const paths = files.map((file) => file.path);

    // The exclusion must name a file that is actually there, or it is hiding nothing and proving
    // nothing. Both halves are asserted before the exclusion is applied.
    expect(paths).toEqual(expect.arrayContaining([FOCUS_ROUTE, ...TMUX_FREE_WITNESSES]));

    const offenders = findAll(
      files.filter((file) => file.path !== FOCUS_ROUTE),
      /\b(send-keys|select-window|tmux\b|attach-session)/m
    );

    expect(offenders).toEqual([]);
  });

  it('the focus route drives tmux with `select-window` and nothing else (C-06, companion)', async () => {
    /*
    Test Doc:
    - Why: the assertion above stops looking at this file, so on its own it would let `send-keys`
      into the one place tmux is reachable. This covers exactly what the exclusion blinds: which verb,
      what argv, and how the call is reached. R-01 is the point — changing which window is VISIBLE
      perturbs nothing, while attaching, resizing or typing into a pane corrupts the daemon's own
      liveness read of the agent running there.
    - Contract: C-06, R-01, AC-10; dossier T004 ("the only `select-window` call site in app code is
      this route handler").
    - Usage Notes: mirrors the `pij-records.ts` denylist and `flow-watcher.ts` target precedents — the
      narrowed check is strictly more specific than the general one it replaces.
    - Quality Contribution: turns "we only focus" from a code-review opinion into a check that fails
      the moment a second tmux verb appears.
    - Worked Example: one `select-window`, argv ['select-window','-t',windowId], via execFile, from
      the exported handler only.
    */
    const code = toCode(await readFile(join(REPO_ROOT, FOCUS_ROUTE), 'utf8'));

    // 1. Every tmux verb this feature may never run, still never run — here least of all.
    for (const verb of FORBIDDEN_TMUX_VERBS) {
      expect(code, `"${verb}" must never appear in the one file allowed to reach tmux`).not.toMatch(
        new RegExp(verb)
      );
    }

    // 2. The sanctioned verb appears exactly once, as a named constant, and the argv is fixed.
    const selectWindows = [...code.matchAll(/select-window/g)];
    expect(selectWindows).toHaveLength(1);
    expect(code).toMatch(/SELECT_WINDOW\s*=\s*'select-window'/);
    expect(code).toMatch(/\[SELECT_WINDOW,\s*'-t',\s*detail\.windowId\]/);

    // 3. Through execFile with a fixed argv array — never a shell, never a command string.
    expect(code).toMatch(/execFile\(command,\s*\[\.\.\.args\]/);
    expect(code).not.toMatch(/execSync|shell:\s*true/);

    // 4. And nothing in this file can fire on its own: no timer, no listener, no module-level call.
    //    The only way in is the exported handler, which only a request reaches (C-06's server half).
    for (const trigger of ['setTimeout', 'setInterval', 'addEventListener', 'useEffect']) {
      expect(code, `${trigger} would make focus reachable without a human`).not.toContain(trigger);
    }
    expect(code).toMatch(/export async function handlePijFocusRequest/);
  });
});

describe('C-02 fence — the browser half (Phase 2, additive)', () => {
  /** Everything Phase 2 ships into the browser bundle. */
  const CLIENT_DIRS = [
    'apps/web/src/features/089-first-class-pij/components/',
    'apps/web/src/features/089-first-class-pij/hooks/',
    'apps/web/src/features/089-first-class-pij/lib/',
  ];

  async function collectClientSources(): Promise<SourceFile[]> {
    const files: SourceFile[] = [];
    for (const dir of CLIENT_DIRS) {
      const root = join(REPO_ROOT, dir);
      let entries: string[];
      try {
        entries = await readdir(root);
      } catch {
        continue;
      }
      for (const name of entries) {
        if (!['.ts', '.tsx'].includes(extname(name))) continue;
        const raw = await readFile(join(root, name), 'utf8');
        files.push({ path: `${dir}${name}`, code: raw });
      }
    }
    return files;
  }

  it('ships a non-empty client surface (the check must not silently cover zero)', async () => {
    /*
    Test Doc:
    - Why: same anti-"green that lies" guard as the server half — a directory rename would make the
      assertions below vacuously true.
    - Contract: components/, hooks/ and lib/ all contribute files.
    - Usage Notes: renaming a client directory fails HERE first.
    - Quality Contribution: measurement before conclusion.
    - Worked Example: >= 6 client files, including the page shell and the hook.
    */
    const files = await collectClientSources();

    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(files.map((f) => f.path)).toEqual(
      expect.arrayContaining([
        'apps/web/src/features/089-first-class-pij/components/pij-page-client.tsx',
        'apps/web/src/features/089-first-class-pij/hooks/use-pij-fleet.ts',
      ])
    );
  });

  it('never reaches the pij CLI or the store from the browser', async () => {
    /*
    Test Doc:
    - Why: the browser has no business spawning a process or reading `~/.pij`, and the ONE way it
      could try is by importing a server module. Data reaches the client through the Phase 1 routes
      and the `pij` channel, or it does not reach it at all.
    - Contract: C-02; dossier § Domain constraints ("client components never call the pij CLI or read
      the store").
    - Usage Notes: `import type` is exempt — types erase at build time and carry no runtime reach.
    - Quality Contribution: closes the one import away from a server-only module ending up in the
      browser bundle, which webpack would resolve happily until it did not.
    - Worked Example: zero value-imports of pij-records / node:child_process / node:fs.
    */
    const files = await collectClientSources();
    const offenders = files.filter((file) =>
      /^\s*import\s+(?!type\b)[^;]*from\s+'[^']*(pij-records|child_process|node:fs|node:path)'/m.test(
        file.code
      )
    );

    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('names no pij verb at all in client code', async () => {
    /*
    Test Doc:
    - Why: read verbs are safe on the server and meaningless in the browser; a `pij ` string in client
      code is either dead prose or an attempt to shell out, and both are worth failing on.
    - Contract: C-02, C-06.
    - Usage Notes: matches a command-shaped string literal, not the word in prose.
    - Quality Contribution: keeps the one-reader property (AC-02) from being undone by a client fetch.
    - Worked Example: no `'pij list'`, `'pij spawn'`, `execFile('pij'` anywhere.
    */
    const files = await collectClientSources();
    const offenders = findAll(
      files.map((f) => ({ path: f.path, code: toCode(f.code) })),
      /['"`]pij\s+[a-z-]+/m
    );

    expect(offenders).toEqual([]);
  });
});
