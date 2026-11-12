# Nav wave — findings backlog (not yet assigned)

Prime: pij-outer-bobcat. Each row gets an owner when the full-run queue clears. Source in brackets.

| # | Finding | Evidence | Planned owner |
|---|---|---|---|
| B1 | `/api/terminal` returns 500 when no tmux server is running (should report `tmux: false`) | parakeet deliverable plan:nav-ssr-dashboard; likely the "no server running" match after a15cc3d01 moved to execFile | a coder after the queue |
| B2 | Workspace background "Agents" links prefetch and 404 | reviewer pij-unaware-quokka, smoke of e37b1ea0d | a coder (with PRD item 8) |
| B3 | Startup logs ENOENT from the pij flow watcher for workspaces without `docs/plans` | PRD item 8; reviewer smoke | a coder (PRD item 8) |
| B4 | Prod over plain http on the LAN can't sign in: bootstrap cookie `Secure` keyed on NODE_ENV (`bootstrap/verify/route.ts:98`) | crane, parakeet, reviewer | HTTPS work (crane), per Jordan "HTTP keeps working" |
| B5 | `SecurityError: User activation is required` on the browser page in phone view | reviewer; attributed to plan 067 desktop-notification permission request | coder/strip-067 confirms it is gone after the removal |
| B6 | 4 icon tests silently skip when the icon manifest was never generated: a turbo-cached web prebuild ("up-to-date") in a fresh worktree skips generation, so coverage drops (7299 passed / 64 skipped vs 7303 / 60) | reviewer on crane's 4fa6ed9da fft | a coder: generate the manifest in test setup or fail instead of skip |
| B7 | Full-gate logs aren't bound to what they tested: a green `just fft` log carries no sealed HEAD, tree hash, BUILD_ID, env mode or exit code, so reviewers rely on author provenance for 4k-line audits | reviewer pij-unaware-quokka on d65ea0930 | a coder: an fft wrapper that writes a sealed header/footer (HEAD, tree, BUILD_ID, env mode, rc, start/end load) into the log |
| B8 | `/api/bootstrap/verify` keys its 5/60 s rate limit on `X-Forwarded-For` (`route.ts:50`), which the client controls: rotating it dodges the limit on bootstrap-code guessing | parakeet, after 9c8406b3e | parakeet: key on the socket-peer stamp from 9c8406b3e; test that rotating XFF does not reset the limit |
