/**
 * File-backed spine cursor — Plan 089 Phase 1 (T003).
 *
 * READ ONLY. This module opens the spine log for reading and nothing else; C-02 forbids any write
 * under `$PIJ_HOME`, and `test/unit/web/pij/fence.test.ts` proves it statically.
 *
 * Design notes worth keeping:
 *
 * - **Cursor by seq, offset by bytes.** `seq` is the correctness guard (exclusive, survives
 *   restarts); the byte offset is only an optimisation so a 2s tick does not re-read a multi-MB log.
 *   When the two disagree — because the file was renamed, rotated or replaced — the offset is thrown
 *   away and `seq` still guarantees no duplicate is ever emitted.
 * - **The offset belongs to an inode, not to a path.** Atomic replace is temp+rename, so the path
 *   can point at a brand-new file whose size is equal to or larger than what we already consumed.
 *   Comparing sizes cannot see that; the replacement's whole prefix would be skipped permanently
 *   while the read still reported healthy. The offset is therefore keyed to `dev:ino` and discarded
 *   the instant that identity changes, whatever the sizes say (review finding 1).
 * - **A partial trailing line is a write in flight, not a tear.** It is buffered and completed on the
 *   next read. A line that ends in a newline but does not parse *is* a tear and is skipped.
 * - **Missing is not deleted.** The registry renames records between tiers; the documented window
 *   where a path does not exist must degrade to "nothing new", never to an error.
 */
import { open, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ISpineCursor, SpineEvent, SpineReadResult } from './spine-cursor.interface';

/** The one filename this reader binds to. Every other file in `spine/` is internal. */
export const SPINE_LOG_FILENAME = 'events.ndjson';

/**
 * Atomic replace is implemented as write-temp + rename, so `<name>.tmp-<pid>-<uuid>` files appear
 * transiently in every pij directory and can be left behind by a crash (there is one on the live
 * host today). Any consumer scanning a pij directory must filter them — C-07.
 */
const TRANSIENT_SUFFIX = /\.tmp-[^/]*$/;

/** True when a path is a transient atomic-replace artefact that no consumer may read. */
export function isTransientStorePath(path: string): boolean {
  return TRANSIENT_SUFFIX.test(path);
}

/** Read `length` bytes of `path` starting at `position`. The one fs call on the read path. */
export type ReadChunk = (path: string, position: number, length: number) => Promise<string>;

export interface FileSpineCursorOptions {
  /** The spine directory — `$PIJ_HOME/spine`. */
  spineDir: string;
  /** Resume point. Exclusive: the first event returned has `seq > since`. Defaults to 0. */
  since?: number;
  /** Overridable only so tests can prove the transient-path guard fires. */
  fileName?: string;
  /**
   * Overridable only so tests can prove the stat/open race is handled — the window in which the
   * registry renames the log away between the two syscalls cannot be hit deterministically.
   */
  readChunk?: ReadChunk;
}

class FileSpineCursor implements ISpineCursor {
  private cursorSeq: number;
  /** Byte offset already consumed. Reset to 0 whenever the file looks replaced. */
  private offset = 0;
  /** An incomplete trailing line held over to the next read. */
  private pending = '';
  /**
   * `dev:ino` of the file the offset was taken against, or null before the first successful stat.
   * This — not the size — is what says "same file as last tick".
   */
  private identity: string | null = null;

  constructor(
    private readonly logPath: string,
    since: number,
    private readonly readChunk: ReadChunk
  ) {
    this.cursorSeq = since;
  }

  get seq(): number {
    return this.cursorSeq;
  }

  async read(): Promise<SpineReadResult> {
    const readAt = new Date().toISOString();

    let stats: Awaited<ReturnType<typeof stat>>;
    try {
      stats = await stat(this.logPath);
    } catch {
      // Missing file or missing directory. C-07: a vanished path is a rename window, not a deletion
      // and not an error. Hold position and report honestly.
      return { events: [], seq: this.cursorSeq, skipped: 0, missing: true, readAt };
    }

    const size = stats.size;
    const identity = `${stats.dev}:${stats.ino}`;
    if (this.identity !== null && this.identity !== identity) {
      // A different inode is behind the same path: atomic replace, rotation or tier migration. The
      // byte offset and the buffered partial line both belong to a file that no longer exists, so
      // both are discarded and the replacement is read from byte 0. The exclusive `seq` guard below
      // suppresses anything already delivered — including a replacement that repeats old lines.
      // Size is deliberately NOT consulted here: the dangerous replacement is the one that is the
      // same size or bigger, which the shrink check underneath cannot see.
      this.offset = 0;
      this.pending = '';
    }
    this.identity = identity;

    if (size < this.offset) {
      // The log shrank: rotated, truncated or replaced by a fresh file. The byte offset is
      // meaningless now; re-read from the start and let the exclusive seq guard suppress anything
      // already delivered.
      this.offset = 0;
      this.pending = '';
    }

    if (size === this.offset) {
      return { events: [], seq: this.cursorSeq, skipped: 0, missing: false, readAt };
    }

    let chunk: string;
    try {
      chunk = await this.readChunk(this.logPath, this.offset, size - this.offset);
    } catch (error) {
      if (isNotFound(error)) {
        // `stat` and `open` are two syscalls, and the registry renames records under live readers.
        // Losing the file inside that gap is the SAME documented window as it being absent at stat
        // time, so it degrades identically: nothing new, position held, no throw. `offset` and
        // `pending` are deliberately left untouched — the next read re-derives both from whatever
        // is at the path then.
        return { events: [], seq: this.cursorSeq, skipped: 0, missing: true, readAt };
      }
      throw error;
    }
    this.offset = size;

    const buffered = this.pending + chunk;
    const segments = buffered.split('\n');
    // The final segment is either '' (the chunk ended cleanly) or a write still in flight. Either
    // way it is not a complete line yet, so it is carried, not parsed.
    this.pending = segments.pop() ?? '';

    const events: SpineEvent[] = [];
    let skipped = 0;

    for (const line of segments) {
      if (line.trim() === '') continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        skipped += 1;
        continue;
      }
      if (!isSpineEvent(parsed)) {
        skipped += 1;
        continue;
      }
      if (parsed.seq > this.cursorSeq) events.push(parsed);
    }

    for (const event of events) {
      if (event.seq > this.cursorSeq) this.cursorSeq = event.seq;
    }

    return { events, seq: this.cursorSeq, skipped, missing: false, readAt };
  }
}

/**
 * Create a cursor over a spine directory.
 *
 * @throws if pointed at a transient atomic-replace artefact — the C-07 hazard, made loud at
 * construction rather than silently poisoning the cursor with a foreign seq range.
 */
export function createFileSpineCursor(options: FileSpineCursorOptions): ISpineCursor {
  const fileName = options.fileName ?? SPINE_LOG_FILENAME;
  if (isTransientStorePath(fileName)) {
    throw new Error(
      `[pij] refusing to read a transient store file: ${fileName} (C-07: *.tmp-<pid>-<uuid> artefacts are never logs)`
    );
  }
  // turbopackIgnore: the spine path is resolved at runtime from $PIJ_HOME and lives entirely OUTSIDE
  // this repo. Without the hint Turbopack's file tracer sees a dynamic fs path, assumes the whole
  // project is a data dependency, and traces all of it into the standalone output.
  return new FileSpineCursor(
    join(/* turbopackIgnore: true */ options.spineDir, fileName),
    options.since ?? 0,
    options.readChunk ?? readRange
  );
}

/** True for the errno that means "the path is gone" — the rename window, not a fault. */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT'
  );
}

/** Read `length` bytes from `position`. Kept separate so the read path is one obvious place. */
async function readRange(path: string, position: number, length: number): Promise<string> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

/**
 * The minimum a line must carry to be usable. Deliberately shallow: `kind` is an open vocabulary and
 * additive fields must survive, so anything beyond the required core is passed through unvalidated.
 */
function isSpineEvent(value: unknown): value is SpineEvent {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<SpineEvent>;
  return typeof candidate.seq === 'number' && typeof candidate.kind === 'string';
}
