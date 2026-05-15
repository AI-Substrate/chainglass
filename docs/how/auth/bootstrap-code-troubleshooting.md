# Bootstrap-Code Popup — Troubleshooting

**Plan**: 084-random-enhancements-3 (auth-bootstrap-code) Phase 6
**Status**: Living doc — append symptoms + fixes as they're discovered

---

## ✅ Resolved by FX003 (2026-05-03) — symptom: typing the code shown in `.chainglass/bootstrap-code.json` still says "Wrong code — try again"

> **This symptom should no longer reproduce after pulling FX003.** The fix
> (`docs/plans/084-random-enhancements-3/fixes/FX003-bootstrap-code-workspace-root-walkup.md`)
> adds a `findWorkspaceRoot()` helper to `@chainglass/shared/auth-bootstrap-code`
> that walks up from `process.cwd()` to the workspace root (looking for
> `pnpm-workspace.yaml`, a `package.json` with non-empty `workspaces`, or
> `.git/`). Both the boot-time write (`apps/web/instrumentation.ts`) and the
> request-time accessor (`apps/web/src/lib/bootstrap-code.ts`) now resolve
> the workspace root via that helper, so the active `.chainglass/` location
> is always the workspace root regardless of `pnpm dev` cwd.
>
> **Operator migration**: if you have BOTH `<workspace-root>/.chainglass/bootstrap-code.json`
> AND `<workspace-root>/apps/web/.chainglass/bootstrap-code.json`, restart the
> dev server (`pkill -f next-server && pnpm dev`); the workspace-root file is
> now authoritative. The stale `apps/web/.chainglass/` file is gitignored and
> ignored at runtime — delete it for tidiness or leave it alone.
>
> The historical context below is retained as a record of the bug and its
> diagnosis, since several other plans/operators may reference it.

### Root cause: multiple `bootstrap-code.json` files at different `cwd`

`pnpm dev` (and `pnpm turbo dev`) starts the Next.js process with `process.cwd()` set to `apps/web/`, NOT the workspace root. `getBootstrapCodeAndKey()` calls `ensureBootstrapCode(process.cwd())`, which then reads and writes:

- **What the dev server uses**: `apps/web/.chainglass/bootstrap-code.json`
- **What the popup tells the operator to read**: `.chainglass/bootstrap-code.json` (workspace root)

If both files exist with different codes (which happens any time someone manually writes the workspace-root file, e.g. via a Node one-liner or a copy from another worktree), the popup rejects the workspace-root code because the dev server's signing key + active code come from `apps/web/.chainglass/`.

### Diagnosis (one command)

```bash
find . -name "bootstrap-code.json" 2>/dev/null | xargs -I {} sh -c 'echo "=== {} ==="; cat "{}"; echo'
```

If the output shows two files with different `code` fields, you've hit this. The dev server uses whichever one is at its `process.cwd()`.

### Identify the dev server's cwd

```bash
# Find next-server process
ps -ef | grep next-server | grep -v grep
# Its cwd:
lsof -p <PID> | grep cwd
```

### Workarounds (until the proper fix lands)

1. **Easiest**: read the code from `apps/web/.chainglass/bootstrap-code.json` (the file the dev server actually uses), not the workspace-root file. Type that into the popup.
2. **Sync the files**: copy `apps/web/.chainglass/bootstrap-code.json` over `.chainglass/bootstrap-code.json` (or vice versa) so both contain the same code, then restart the dev server so its `getBootstrapCodeAndKey()` cache picks up whichever file is at its `cwd`.
3. **Set `AUTH_SECRET`**: the signing key then comes from the env var instead of the per-cwd HKDF derivation. (The active *code* still comes from whichever file `process.cwd()` resolves to, so this only stabilises the HMAC key, not the code itself.)

### Proper fix — landed by FX003 (2026-05-03)

`getBootstrapCodeAndKey()` and `instrumentation.ts` boot block now walk up from `process.cwd()` via `findWorkspaceRoot()` from `@chainglass/shared/auth-bootstrap-code` (looking for `pnpm-workspace.yaml` → `package.json` with non-empty `workspaces` → `.git/`, falling back to the normalized `cwd` if no marker is found). Both write-side and read-side land at the same workspace-root `.chainglass/bootstrap-code.json`.

A second nice-to-have remains deferred: the popup's text shows `.chainglass/bootstrap-code.json` (a plan-time relative path). Threading the actual resolved absolute path through to the popup so the operator always sees the file the server is using is fast-follow work — the helper is server-only (imports `node:fs`), so the absolute path must be passed as a prop from a server component, not by importing `findWorkspaceRoot` into the `'use client'` popup. Tracked in Phase 6 Discoveries `debt` row; not in scope for FX003.

---

## ⚠️ Symptom: popup still shows after typing the correct code, even after restart

### Root cause: stale module-level cache

`getBootstrapCodeAndKey()` caches the active `{ code, key }` for the lifetime of the Node process. If you regenerate or rotate the bootstrap code while the dev server is running, the in-memory cache still holds the OLD code. The popup will reject the new code (and accept the now-deleted old one).

### Fix

Restart the dev server. The cache is process-scoped — restart re-reads the file.

```bash
pkill -f next-server   # or kill the specific PID
pnpm dev               # restart
```

### Why we don't auto-rotate in-process

ESM HMR module reload re-evaluates the module and resets the cache automatically — but only on file changes that trigger HMR (the `bootstrap-code.json` write doesn't, by design). Watching the file would add complexity and a foot-gun for testing scenarios.

---

## ⚠️ Symptom: 503 "Server unavailable" in the popup

### Root cause

`ensureBootstrapCode(process.cwd())` failed — typically:
- The `.chainglass/` directory is not writable (e.g., chmod 0o555 by accident)
- The disk is full
- A broken symlink at `.chainglass/bootstrap-code.json`

### Diagnosis

Check the dev server stderr for `[bootstrap-code] failed to read or generate ...` followed by the underlying error.

### Fix

Restore write permissions, free disk, or remove the broken symlink:

```bash
chmod 0o755 ./.chainglass    # or apps/web/.chainglass per the cwd gotcha above
rm -f ./.chainglass/bootstrap-code.json   # let it regenerate at next boot
```

---

## Where this is documented

- This file (operator-facing)
- `apps/web/src/lib/bootstrap-code.ts` JSDoc on `getBootstrapCodeAndKey()` (developer-facing, the bug's home)
- `docs/domains/_platform/auth/domain.md` § Concepts — "Read the active code + key" (architectural-facing)
- `docs/plans/084-random-enhancements-3/tasks/phase-6-popup-component/` Discoveries log (historical-facing)
