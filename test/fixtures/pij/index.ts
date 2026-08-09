/**
 * Synthetic pij store fixtures — Plan 089 Phase 1 (T002).
 *
 * Every fixture here exists to encode exactly ONE ruled hazard from the pij on-disk contract
 * (`pij-platform.md`) or from plan 089's constraints. The hazard ledger is `README.md` in this
 * directory; keep the two in sync.
 *
 * Nothing in this tree is ever written to `~/.pij` — these are read-only inputs, and the tests that
 * need to mutate a store (append a spine line, rename the file under a live reader) copy the fixture
 * into an OS temp directory first via `copyStoreToTemp()`.
 */
import { cpSync } from 'node:fs';

import { join } from 'node:path';
import { makeTmpDir, removeTmpDir } from '../../helpers/tmpdir';

/** This directory. */
export const PIJ_FIXTURES_DIR = import.meta.dirname;

/**
 * The synthetic store root — stands in for `$PIJ_HOME` (`~/.pij`).
 * Contains: two descriptors (one single-segment id), a leftover atomic-replace temp file,
 * an `archive/` tier, and a `spine/` directory.
 */
export const FIXTURE_STORE_DIR = join(PIJ_FIXTURES_DIR, 'store');

/** `<store>/spine` — the one path family the platform rules as stable and bindable by file. */
export const FIXTURE_SPINE_DIR = join(FIXTURE_STORE_DIR, 'spine');

/** The spine log itself. Carries a torn line at seq 103 (crash mid-append). */
export const FIXTURE_SPINE_FILE = join(FIXTURE_SPINE_DIR, 'events.ndjson');

/**
 * A second spine whose only job is the open-vocabulary hazard: an externally-minted `kind` and a
 * daemon kind that is not in the platform doc's table (`delivered-unacked-stale`, observed live).
 */
export const FIXTURE_OPEN_VOCAB_SPINE_DIR = join(PIJ_FIXTURES_DIR, 'open-vocab-spine');

/** Descriptor with a SINGLE-SEGMENT pij id — the C-03 hazard. */
export const FIXTURE_SINGLE_SEGMENT_ID = 'shipname';

/** Descriptor id used as the no-hazard control. */
export const FIXTURE_CONTROL_ID = 'pij-normal-seat';

/** Descriptor that has migrated to the archive tier — its hot-tier path is GONE, not deleted. */
export const FIXTURE_ARCHIVED_ID = 'pij-archived-seat';

/** The `folder` every fixture descriptor claims — the workspace-join key. */
export const FIXTURE_WORKSPACE_PATH = '/Users/fixture/substrate/chainglass';

/** Seq numbers present in `FIXTURE_SPINE_FILE`, in file order. The torn line (103) is absent. */
export const FIXTURE_SPINE_SEQS = [101, 102, 104, 105, 106] as const;

/** The seq of the line that is deliberately truncated. */
export const FIXTURE_TORN_SEQ = 103;

/**
 * Copy the synthetic store into a fresh OS temp directory so a test may mutate it (append spine
 * lines, rename the log, drop a temp file) without touching the committed fixture — and, far more
 * importantly, without ever going near a real `~/.pij`.
 *
 * @returns the temp store root and a `cleanup()` that removes it.
 */
export function copyStoreToTemp(): { dir: string; spineDir: string; cleanup: () => void } {
  const dir = makeTmpDir('pij-fixture-store');
  cpSync(FIXTURE_STORE_DIR, dir, { recursive: true });
  return {
    dir,
    spineDir: join(dir, 'spine'),
    cleanup: () => removeTmpDir(dir),
  };
}
