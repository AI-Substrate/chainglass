Work request for role coder/dev-beside-prod (prime pij-outer-bobcat, nav speed wave 1, Jordan 2026-11-12).

Read first: your role packet's reading list, then /Users/jordanknight/substrate/chainglass-governance/.harness/government/briefs/nav-wave-1.md (worktree, landing, gates, who else is editing what), then the PRD section below in /Users/jordanknight/substrate/chainglass-governance/.harness/government/reports/nav-speed-review-2026-11-12.md.
Worktree slug: dev-beside-prod. Spare prod port: 3104. Output subject: plan:nav-dev-beside-prod.

PRD item 4: let dev run beside prod.
apps/web/instrumentation.ts:118-154 writes .chainglass/server.json at start and removes it at shutdown, so a second server takes over the file the CLI reads; justfile:117-126 prod-serve kills whatever listens on its port. Key server.json by port or mode (or refuse to overwrite a live server's entry) and update every reader (CLI, just preflight, wf-* recipes) to find the right server; make prod-serve refuse to kill a live server unless told to. Document the pairing (prod on 3000 for use, dev on another port for work) in the justfile and docs/how. Time one rebuild and write it into the justfile comment.
Done when: just dev on a second port and just prod on 3000 run together and both are discoverable by the CLI. Do NOT stop Jordan's :3000 server to test; use two spare ports.
