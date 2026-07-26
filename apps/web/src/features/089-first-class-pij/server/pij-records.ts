/**
 * `execFile`-backed pij record reader — Plan 089 Phase 1 (T004).
 *
 * READ ONLY, twice over:
 *   - the only verbs this module can name are in `PIJ_READ_VERBS`, and
 *   - `assertReadOnlyArgv()` re-checks the argv at the call site, so even a value that arrives at
 *     runtime cannot reach a mutating verb.
 *
 * The static fence (`test/unit/web/pij/fence.test.ts`, T010) proves the source contains no mutating
 * verb; this is the runtime half of the same policy.
 */
import { execFile } from 'node:child_process';
import type {
  IPijRecords,
  PijExecutor,
  PijListRow,
  PijNodeDetail,
  PijReadOptions,
  PijStateReport,
  PijTree,
  PijTreeScope,
} from './pij-records.interface';

/** The binary. Resolved from PATH by execFile — never invoked through a shell. */
export const PIJ_COMMAND = 'pij';

/**
 * The complete set of leading tokens this feature may execute. v1 runs **zero mutating verbs**
 * (plan § Non-Goals, C-01, C-02), so the allowlist *is* the fence.
 */
export const PIJ_READ_VERBS = Object.freeze(['list', 'tree', 'node', 'state', 'spine', 'project']);

/**
 * Sub-verbs that turn an allowed head into a mutation (`node show` reads; `project set` writes).
 * Checked positionally against the whole argv rather than just the head.
 */
export const PIJ_FORBIDDEN_TOKENS = Object.freeze([
  'set',
  'close',
  'spawn',
  'send',
  'kill',
  'reap',
  'adopt',
  'link',
  'unlink',
  'task',
  'verify',
  'daemon',
  'restart',
  'stream',
  'render',
  'baton',
  '--force',
]);

/** Default per-call timeout. A CLI invocation costs ~0.42–0.48s wall clock on a contended host. */
export const PIJ_DEFAULT_TIMEOUT_MS = 5_000;

/** A typed pij failure. The poller's degraded mode (AC-09) and the status route (AC-08) read this. */
export class PijCliError extends Error {
  readonly code: string;
  readonly verb: string;
  readonly stderr: string;

  constructor(options: { code: string; verb: string; message: string; stderr?: string }) {
    super(options.message);
    this.name = 'PijCliError';
    this.code = options.code;
    this.verb = options.verb;
    this.stderr = options.stderr ?? '';
  }
}

/**
 * Throw unless every token in `args` is read-only.
 *
 * Deliberately paranoid about *any* position, not just the head: `project list` is a read and
 * `project set` is a write, and both start with an allowlisted token.
 */
export function assertReadOnlyArgv(args: readonly string[]): void {
  const [head] = args;
  if (!head || !PIJ_READ_VERBS.includes(head)) {
    throw new PijCliError({
      code: 'E-FENCE',
      verb: head ?? '(none)',
      message: `[pij] "${head ?? ''}" is not a read verb — this feature is read-only (C-02)`,
    });
  }
  for (const token of args) {
    if (PIJ_FORBIDDEN_TOKENS.includes(token)) {
      throw new PijCliError({
        code: 'E-FENCE',
        verb: head,
        message: `[pij] refusing argv containing "${token}" — read-only feature (C-01/C-02)`,
      });
    }
  }
}

export interface PijRecordsOptions {
  /** Injectable process seam. Defaults to a real `execFile`. */
  exec?: PijExecutor;
  /**
   * The cwd used when a call does not name one. Bare pij calls scope to the process cwd, so this is
   * always explicit — never left to `process.cwd()` by accident.
   */
  defaultCwd: string;
  timeoutMs?: number;
}

class CliPijRecords implements IPijRecords {
  private readonly exec: PijExecutor;
  private readonly defaultCwd: string;
  private readonly timeoutMs: number;

  constructor(options: PijRecordsOptions) {
    this.exec = options.exec ?? nodeExecFileExecutor;
    this.defaultCwd = options.defaultCwd;
    this.timeoutMs = options.timeoutMs ?? PIJ_DEFAULT_TIMEOUT_MS;
  }

  async list(options: PijReadOptions = {}): Promise<PijListRow[]> {
    // ONE global call (F-13). Workspace scoping is a server-side filter on `folder`, never `--here`:
    // 177 rows / ~135KB is cheap, and a second CLI call per workspace is not.
    //
    // `--badge` (Phase 4): the badge is a ruled worst-first derivation across two state vocabularies
    // and pij is the only thing entitled to compute it (AC-03). It is requested HERE rather than at
    // the call sites because the poller — the only production caller — calls `list()` bare, so the
    // argv is the only place the decision can be made. It costs ~0.2s of the 8s loop (measured:
    // 0.45–0.52s without, 0.66–0.71s with, over three runs at 181 rows), which the loop absorbs.
    const payload = await this.run(['list', '--json', '--badge'], options);
    if (!Array.isArray(payload)) {
      throw new PijCliError({
        code: 'E-SHAPE',
        verb: 'list',
        message: '[pij] list --json did not return an array',
      });
    }
    return payload as PijListRow[];
  }

  async tree(options: PijTreeScope): Promise<PijTree> {
    // `--global` ignores cwd, so the global read runs on `defaultCwd` — a child process still has to
    // start somewhere. The flag, not the directory, is what makes the answer global; that is why it
    // is a distinct argv rather than "cwd omitted".
    const global = 'global' in options;
    const args = global ? ['tree', '--global', '--json'] : ['tree', '--json'];
    const payload = await this.run(args, global ? {} : { cwd: options.cwd });
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !Array.isArray((payload as PijTree).roots)
    ) {
      throw new PijCliError({
        code: 'E-SHAPE',
        verb: 'tree',
        message: '[pij] tree --json did not return { roots: [...] }',
      });
    }
    return payload as PijTree;
  }

  async nodeShow(id: string, options: PijReadOptions = {}): Promise<PijNodeDetail> {
    // `id` is its own argv token: pij ids are arbitrary strings and may be single-segment (C-03).
    const payload = await this.run(['node', 'show', id, '--json'], options);
    return payload as PijNodeDetail;
  }

  async state(id: string, options: PijReadOptions = {}): Promise<PijStateReport> {
    const payload = await this.run(['state', id, '--json'], options);
    return payload as PijStateReport;
  }

  async raw(args: readonly string[], options: PijReadOptions = {}): Promise<unknown> {
    return this.run(args, options);
  }

  private async run(args: readonly string[], options: PijReadOptions): Promise<unknown> {
    assertReadOnlyArgv(args);
    const verb = args[0];
    const cwd = options.cwd ?? this.defaultCwd;

    let stdout: string;
    try {
      stdout = await this.exec(PIJ_COMMAND, args, { cwd, timeoutMs: this.timeoutMs });
    } catch (error) {
      throw toPijCliError(error, verb);
    }

    try {
      return JSON.parse(stdout);
    } catch {
      throw new PijCliError({
        code: 'E-PARSE',
        verb,
        message: `[pij] ${verb} --json returned unparseable output`,
        stderr: stdout.slice(0, 500),
      });
    }
  }
}

export function createPijRecords(options: PijRecordsOptions): IPijRecords {
  return new CliPijRecords(options);
}

/**
 * Translate an executor rejection into a typed error.
 *
 * The three cases are genuinely different to a human reading the status panel: pij said no
 * (`E-…`), pij died (`E-EXIT`), or pij never answered (`E-TIMEOUT`). Collapsing them would make
 * AC-08's trichotomy unrenderable.
 */
function toPijCliError(error: unknown, verb: string): PijCliError {
  if (error instanceof PijCliError) return error;

  const detail = error as { killed?: boolean; stderr?: string; stdout?: string; message?: string };
  const stderr = (detail.stderr ?? '').trim();

  if (detail.killed) {
    return new PijCliError({
      code: 'E-TIMEOUT',
      verb,
      message: `[pij] ${verb} timed out`,
      stderr,
    });
  }

  const stream = stderr || (detail.stdout ?? '').trim();

  // pij writes its own error codes at the head of the stream: `E-ARG: usage: pij state <id>`.
  const coded = /^(E-[A-Z0-9]+):\s*(.*)$/m.exec(stream);
  if (coded) {
    return new PijCliError({ code: coded[1], verb, message: coded[2], stderr });
  }

  // …except under `--json`, where the SAME failure arrives as a JSON envelope on stderr:
  // `{"error":"E-NOID","message":"no session 'pij-x' in registry"}` (verified live 2026-07-26).
  // Without this leg every such failure collapses to E-EXIT, and "that seat does not exist" becomes
  // indistinguishable from "the store is broken" — a distinction the focus route's 404-vs-503 ladder
  // is built on.
  const envelope = parseJsonErrorEnvelope(stream);
  if (envelope) {
    return new PijCliError({ code: envelope.code, verb, message: envelope.message, stderr });
  }

  return new PijCliError({
    code: 'E-EXIT',
    verb,
    message: detail.message ?? `[pij] ${verb} failed`,
    stderr,
  });
}

/**
 * Decode pij's `--json` error envelope, or return null if the stream is not one.
 *
 * Strict on purpose: only an object whose `error` is E-code-shaped counts. Anything looser would
 * start inventing codes out of unrelated JSON that happens to have an `error` key.
 */
function parseJsonErrorEnvelope(stream: string): { code: string; message: string } | null {
  const trimmed = stream.trim();
  if (!trimmed.startsWith('{')) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const body = parsed as { error?: unknown; message?: unknown };
  if (typeof body.error !== 'string' || !/^E-[A-Z0-9]+$/.test(body.error)) return null;

  return {
    code: body.error,
    message: typeof body.message === 'string' ? body.message : body.error,
  };
}

/** The real seam. `execFile` — a fixed argv array, no shell, bounded by a timeout. */
const nodeExecFileExecutor: PijExecutor = (command, args, options) =>
  new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      { cwd: options.cwd, timeout: options.timeoutMs, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stdout, stderr }));
          return;
        }
        resolve(stdout);
      }
    );
  });
