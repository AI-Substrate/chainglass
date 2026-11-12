Review request for role reviewer (prime pij-outer-bobcat, 2026-11-12).

Subject: plan:nav-dev-beside-prod · Head: f71668fa0 (commits 1f99d9982, f71668fa0 on origin/main) · Author: pij-professional-crane (coder/dev-beside-prod)

Read: /Users/jordanknight/substrate/chainglass-governance/.harness/government/briefs/nav-requests/dev-beside-prod.md (plus its scope adds: prod serves its own build output; dev must not run @chainglass/web:build), briefs/nav-wave-1.md, the author's deliverable (pij outputs --role coder, subject plan:nav-dev-beside-prod).

Look hard at:
- Server registry: `.chainglass/servers/<port>.json` replacing `server.json`. Every reader migrated (CLI, preflight, requireLocalAuth, bootstrap code, remote view, wf recipes, event-popper paths if still present)? Stale-entry handling and the 'only remove an entry you own' rule. Token isolation per port.
- `prod`/`prod-serve`: refuse to kill a live server unless KILL_EXISTING=1; the staging copy (`cp -c` APFS clone to `.next-prod-<port>`, CHAINGLASS_DIST_DIR) and the swap: what if the clone or start fails midway; is the old server left serving; disk growth from old copies.
- `turbo dev --filter=@chainglass/web`: does dev still rebuild the workspace packages it needs, and still pick up changes in packages/* during dev (HMR / watch)?
- Docs: justfile comments and docs/how updated; AGENTS.md mentions of server.json / preflight still true?

Full gate: the author's `just fft` (14:31-14:41, rc 0, 559 files, 7453 tests) ran on 7688c86cf + both commits, so it also contains e37b1ea0d. Note that in your e37b1ea0d record as the full-suite remediation evidence if you agree it qualifies.

Proof servers: reuse the author's build if you need one; spare ports free on the LAN IP; private tmux ONLY per nav-wave-1.md "Browser proofs never reach Jordan's tmux" (mkdir -p the TMUX_TMPDIR first, prove the socket path, never `tmux kill-server`). ~~TMUX_TMPDIR=/tmp/reviewer-tmux~~ (that dir never existed, so it hit the default server: 2026-11-12 incident). Stop after.

Publish: `pij output verdict --role reviewer --subject plan:nav-dev-beside-prod --head f71668fa0 --result pass|pass-with-notes|block --body-file <path> --answers <this request id>`.
