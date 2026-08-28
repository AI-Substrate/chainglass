/**
 * draftFileService Tests (TDD — RED first)
 *
 * The autosave draft store: per-file JSON sidecars under `<worktree>/.chainglass/drafts/`,
 * written atomically, never touching the target file and never reaching a file watcher.
 *
 * Placement is load-bearing, not cosmetic (plan 087 Q1, resolved from code):
 * the central data watcher subscribes to exactly `.chainglass/data` and `.chainglass/units`
 * (central-watcher.service.ts:246), and the source watcher ignores any `.chainglass`
 * segment (source-watcher.constants.ts:30). `.chainglass/drafts/` is therefore watched by
 * nothing. `draftPathFor` is what keeps that true, so it is tested as a contract.
 *
 * Plan 087: Auto-save Editing — draft store
 * AC-1, AC-2, AC-3, AC-5, AC-8, AC-11
 */

import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  deleteDraftFile,
  draftPathFor,
  readDraftFile,
  saveDraftFile,
  sweepDrafts,
} from '@/features/041-file-browser/services/draft-file-actions';

const WORKTREE = '/work';
const REL = 'src/foo.md';
const DRAFT = '/work/.chainglass/drafts/src/foo.md.json';
const DRAFT_TMP = '/work/.chainglass/drafts/src/foo.md.json.tmp';
const MTIME = '2026-08-28T00:00:00.000Z';

let fs: FakeFileSystem;
let resolver: FakePathResolver;

beforeEach(() => {
  fs = new FakeFileSystem();
  resolver = new FakePathResolver();
  fs.setDir('/work/src');
});

describe('draftPathFor', () => {
  it('mirrors the relative path under .chainglass/drafts with a .json suffix', () => {
    /*
    Test Doc:
    - Why: The draft location IS the watcher-quietness guarantee (AC-2). A path that
      drifts back under `.chainglass/data/` silently re-arms the data watcher.
    - Contract: draftPathFor(root, rel) → `${root}/.chainglass/drafts/${rel}.json`
    - Usage Notes: reversible by stripping prefix + `.json`; human-debuggable
    - Quality Contribution: AC-1, AC-2
    - Worked Example: ('/work', 'src/foo.md') → '/work/.chainglass/drafts/src/foo.md.json'
    */
    expect(draftPathFor(WORKTREE, REL)).toBe(DRAFT);
    expect(draftPathFor(WORKTREE, 'a.md')).toBe('/work/.chainglass/drafts/a.md.json');
    expect(draftPathFor(WORKTREE, 'a/b/c/d.txt')).toBe('/work/.chainglass/drafts/a/b/c/d.txt.json');
  });

  it('never lands under .chainglass/data or .chainglass/units — the two watched roots', () => {
    /*
    Test Doc:
    - Why: Q1 resolved that those exact two subtrees are watched (central-watcher.service.ts:246).
      This asserts the property directly rather than trusting the literal above.
    - Contract: for any input, the derived path is not UNDER either watched root
    - Usage Notes: the predicate is a root prefix, not a substring — the watcher calls
      fs.watch on `<wt>/.chainglass/data`, so containment is what matters. A target that
      itself lives under `.chainglass/data/` yields a draft at
      `.../drafts/.chainglass/data/...`, which merely CONTAINS that text and is not
      watched. Asserting the substring instead would fail on correct behaviour.
    - Quality Contribution: AC-2
    - Worked Example: '.chainglass/data/y.md' → draft outside /work/.chainglass/data/
    */
    const watchedRoots = ['/work/.chainglass/data/', '/work/.chainglass/units/'];

    for (const rel of ['src/foo.md', 'data/x.md', '.chainglass/data/y.md', 'units/z/unit.yaml']) {
      const p = draftPathFor(WORKTREE, rel);
      expect(p.startsWith('/work/.chainglass/drafts/')).toBe(true);
      for (const root of watchedRoots) {
        expect(p.startsWith(root)).toBe(false);
      }
    }
  });
});

describe('saveDraftFile', () => {
  it('writes the draft atomically and leaves the target untouched', async () => {
    /*
    Test Doc:
    - Why: Autosave must never move the target's mtime — that is the whole point of AC-1
    - Contract: saveDraftFile(...) → {ok:true}; draft JSON on disk; target byte-identical
    - Usage Notes: atomic tmp→rename, with the tmp INSIDE the drafts tree
    - Quality Contribution: AC-1
    - Worked Example: target holds 'on disk', draft holds 'in progress'
    */
    fs.setFile('/work/src/foo.md', 'on disk');

    const result = await saveDraftFile({
      worktreePath: WORKTREE,
      filePath: REL,
      content: 'in progress',
      editorMtime: MTIME,
      fileSystem: fs,
      pathResolver: resolver,
    });

    expect(result).toEqual({ ok: true });
    expect(fs.getFile('/work/src/foo.md')).toBe('on disk');

    const draft = JSON.parse(String(fs.getFile(DRAFT)));
    expect(draft).toMatchObject({
      schemaVersion: 1,
      filePath: REL,
      content: 'in progress',
      editorMtime: MTIME,
    });
    expect(typeof draft.savedAt).toBe('string');
    expect(await fs.exists(DRAFT_TMP)).toBe(false);
  });

  it('overwrites an existing draft rather than accumulating files', async () => {
    /*
    Test Doc:
    - Why: The debounce fires repeatedly during one editing session (D2: per-file draft)
    - Contract: second saveDraftFile replaces the first draft's content
    - Usage Notes: one draft file per target, always
    - Quality Contribution: AC-1
    - Worked Example: 'first' then 'second' → draft holds 'second'
    */
    const opts = {
      worktreePath: WORKTREE,
      filePath: REL,
      editorMtime: MTIME,
      fileSystem: fs,
      pathResolver: resolver,
    };
    await saveDraftFile({ ...opts, content: 'first' });
    await saveDraftFile({ ...opts, content: 'second' });

    expect(JSON.parse(String(fs.getFile(DRAFT))).content).toBe('second');
  });

  it('rejects a traversing filePath with error:security and performs NO write', async () => {
    /*
    Test Doc:
    - Why: A crafted filePath must not escape the sandbox, and must not leave partial
      state behind either — AC-8 is fail-closed, not fail-tidy
    - Contract: {ok:false, error:'security'} and zero files created
    - Usage Notes: resolvePath runs before any I/O
    - Quality Contribution: AC-8
    - Worked Example: '../../etc/passwd' → security, filesystem unchanged
    */
    const before = fs.getAllFiles().length;

    const result = await saveDraftFile({
      worktreePath: WORKTREE,
      filePath: '../../etc/passwd',
      content: 'pwned',
      editorMtime: MTIME,
      fileSystem: fs,
      pathResolver: resolver,
    });

    expect(result).toEqual({ ok: false, error: 'security' });
    expect(fs.getAllFiles().length).toBe(before);
  });

  it('rejects an absolute filePath with error:security and performs NO write', async () => {
    /*
    Test Doc:
    - Why: An absolute path bypasses the "relative to worktree" assumption entirely
    - Contract: {ok:false, error:'security'}, zero writes
    - Usage Notes: mirrors PathResolverAdapter's isAbsolute guard
    - Quality Contribution: AC-8
    - Worked Example: '/etc/passwd' → security
    */
    const before = fs.getAllFiles().length;

    const result = await saveDraftFile({
      worktreePath: WORKTREE,
      filePath: '/etc/passwd',
      content: 'pwned',
      editorMtime: MTIME,
      fileSystem: fs,
      pathResolver: resolver,
    });

    expect(result).toEqual({ ok: false, error: 'security' });
    expect(fs.getAllFiles().length).toBe(before);
  });
});

describe('readDraftFile', () => {
  it('returns null when no draft exists — the common case, not an error', async () => {
    /*
    Test Doc:
    - Why: Every file load calls this; "no draft" must be cheap and non-throwing
    - Contract: {ok:true, draft:null}
    - Usage Notes: distinguishes "nothing to restore" from "read failed"
    - Quality Contribution: AC-4
    - Worked Example: fresh worktree → draft:null
    */
    const result = await readDraftFile({
      worktreePath: WORKTREE,
      filePath: REL,
      fileSystem: fs,
      pathResolver: resolver,
    });

    expect(result).toEqual({ ok: true, draft: null });
  });

  it('round-trips a saved draft', async () => {
    /*
    Test Doc:
    - Why: The crash-recovery path depends on reading back exactly what was written
    - Contract: saveDraftFile then readDraftFile → the same content + editorMtime
    - Usage Notes: content is the ASSEMBLED editor value (frontmatter + body in rich mode)
    - Quality Contribution: AC-7
    - Worked Example: write 'work in progress' → read it back
    */
    await saveDraftFile({
      worktreePath: WORKTREE,
      filePath: REL,
      content: 'work in progress',
      editorMtime: MTIME,
      fileSystem: fs,
      pathResolver: resolver,
    });

    const result = await readDraftFile({
      worktreePath: WORKTREE,
      filePath: REL,
      fileSystem: fs,
      pathResolver: resolver,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft?.content).toBe('work in progress');
    expect(result.draft?.editorMtime).toBe(MTIME);
    expect(result.draft?.filePath).toBe(REL);
  });

  it('treats a corrupt draft as no draft and removes it', async () => {
    /*
    Test Doc:
    - Why: A draft half-written by a crashed process must not wedge every future load
      of that file behind a JSON parse error
    - Contract: malformed JSON → {ok:true, draft:null}, and the corpse is unlinked
    - Usage Notes: atomic rename makes this rare, not impossible (disk full mid-write)
    - Quality Contribution: AC-7
    - Worked Example: '{not json' → draft:null and the file is gone
    */
    fs.setFile(DRAFT, '{not json');

    const result = await readDraftFile({
      worktreePath: WORKTREE,
      filePath: REL,
      fileSystem: fs,
      pathResolver: resolver,
    });

    expect(result).toEqual({ ok: true, draft: null });
    expect(await fs.exists(DRAFT)).toBe(false);
  });

  it('rejects a traversing filePath with error:security and performs NO read', async () => {
    /*
    Test Doc:
    - Why: readDraft is an arbitrary-read primitive if its path is not validated
    - Contract: {ok:false, error:'security'}
    - Usage Notes: same guard as save, applied before any filesystem call
    - Quality Contribution: AC-8
    - Worked Example: '../../etc/passwd' → security
    */
    const result = await readDraftFile({
      worktreePath: WORKTREE,
      filePath: '../../etc/passwd',
      fileSystem: fs,
      pathResolver: resolver,
    });

    expect(result).toEqual({ ok: false, error: 'security' });
  });
});

describe('deleteDraftFile', () => {
  it('deletes the draft', async () => {
    /*
    Test Doc:
    - Why: An explicit save must leave no draft behind, or the next load prompts to
      restore content the user already saved — AC-3
    - Contract: {ok:true} and the draft file is gone
    - Usage Notes: called on explicit-save success and on Discard
    - Quality Contribution: AC-3
    - Worked Example: save draft → delete → draft absent
    */
    await saveDraftFile({
      worktreePath: WORKTREE,
      filePath: REL,
      content: 'x',
      editorMtime: MTIME,
      fileSystem: fs,
      pathResolver: resolver,
    });
    expect(await fs.exists(DRAFT)).toBe(true);

    const result = await deleteDraftFile({
      worktreePath: WORKTREE,
      filePath: REL,
      fileSystem: fs,
      pathResolver: resolver,
    });

    expect(result).toEqual({ ok: true });
    expect(await fs.exists(DRAFT)).toBe(false);
  });

  it('treats a missing draft as success', async () => {
    /*
    Test Doc:
    - Why: Every explicit save calls deleteDraft, and most saves have no draft. ENOENT
      is the normal case and must not surface as a failure toast.
    - Contract: {ok:true} when nothing is there
    - Usage Notes: idempotent by design
    - Quality Contribution: AC-3
    - Worked Example: delete with no draft present → ok
    */
    const result = await deleteDraftFile({
      worktreePath: WORKTREE,
      filePath: REL,
      fileSystem: fs,
      pathResolver: resolver,
    });

    expect(result).toEqual({ ok: true });
  });

  it('rejects a traversing filePath with error:security and deletes NOTHING', async () => {
    /*
    Test Doc:
    - Why: Unvalidated, this is an arbitrary-unlink primitive — the most destructive of
      the three actions
    - Contract: {ok:false, error:'security'}, victim file still present
    - Usage Notes: guard precedes the unlink
    - Quality Contribution: AC-8
    - Worked Example: '../../etc/passwd' → security, /etc/passwd untouched
    */
    fs.setFile('/etc/passwd', 'root:x:0:0');

    const result = await deleteDraftFile({
      worktreePath: WORKTREE,
      filePath: '../../etc/passwd',
      fileSystem: fs,
      pathResolver: resolver,
    });

    expect(result).toEqual({ ok: false, error: 'security' });
    expect(await fs.exists('/etc/passwd')).toBe(true);
  });
});

describe('sweepDrafts', () => {
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

  it('deletes drafts older than the retention window and keeps the rest', async () => {
    /*
    Test Doc:
    - Why: Orphaned drafts accumulate after crashes; without a sweep they are forever
      — AC-11 fixes the window at 30 days
    - Contract: savedAt older than the window → deleted; newer → kept
    - Usage Notes: boundary is tested on both sides, since an off-by-one here silently
      deletes a user's recoverable work
    - Quality Contribution: AC-11
    - Worked Example: 31 days old → gone; 29 days old → kept
    */
    const now = Date.now();
    const stale = new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString();
    const fresh = new Date(now - 29 * 24 * 60 * 60 * 1000).toISOString();

    fs.setFile(
      '/work/.chainglass/drafts/old.md.json',
      JSON.stringify({
        schemaVersion: 1,
        filePath: 'old.md',
        content: 'x',
        editorMtime: MTIME,
        savedAt: stale,
      })
    );
    fs.setFile(
      '/work/.chainglass/drafts/nested/new.md.json',
      JSON.stringify({
        schemaVersion: 1,
        filePath: 'nested/new.md',
        content: 'y',
        editorMtime: MTIME,
        savedAt: fresh,
      })
    );

    const result = await sweepDrafts({
      worktreePath: WORKTREE,
      olderThanMs: THIRTY_DAYS,
      fileSystem: fs,
      pathResolver: resolver,
    });

    expect(result).toEqual({ ok: true, deleted: 1 });
    expect(await fs.exists('/work/.chainglass/drafts/old.md.json')).toBe(false);
    expect(await fs.exists('/work/.chainglass/drafts/nested/new.md.json')).toBe(true);
  });

  it('deletes an unparseable draft rather than leaving it forever', async () => {
    /*
    Test Doc:
    - Why: A draft with no readable savedAt can never age out, so it would survive every
      future sweep — an immortal orphan
    - Contract: unparseable draft → deleted, counted
    - Usage Notes: the sweep is the only thing that ever looks at these files again
    - Quality Contribution: AC-11
    - Worked Example: '{corrupt' → deleted
    */
    fs.setFile('/work/.chainglass/drafts/broken.md.json', '{corrupt');

    const result = await sweepDrafts({
      worktreePath: WORKTREE,
      olderThanMs: THIRTY_DAYS,
      fileSystem: fs,
      pathResolver: resolver,
    });

    expect(result).toEqual({ ok: true, deleted: 1 });
    expect(await fs.exists('/work/.chainglass/drafts/broken.md.json')).toBe(false);
  });

  it('is a no-op when the drafts directory does not exist', async () => {
    /*
    Test Doc:
    - Why: This runs on every session start, including the first one in a fresh worktree
    - Contract: {ok:true, deleted:0}, no throw
    - Usage Notes: must not create the directory as a side effect of sweeping it
    - Quality Contribution: AC-11
    - Worked Example: fresh worktree → deleted:0
    */
    const result = await sweepDrafts({
      worktreePath: WORKTREE,
      olderThanMs: THIRTY_DAYS,
      fileSystem: fs,
      pathResolver: resolver,
    });

    expect(result).toEqual({ ok: true, deleted: 0 });
    expect(await fs.exists('/work/.chainglass/drafts')).toBe(false);
  });
});
