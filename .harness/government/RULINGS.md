# Jordan's standing rulings — chainglass

Carried from pij-lonely-antelope's handover (`handover/prime-2026-11-10.md`); all were
verbal and unrecorded before 2026-11-10. Newer rulings append below with date and
spine seq.

1. Questions in text only, never a question UI: one sentence of context, one of ask, one question per turn.
2. Commit and push main at all times. `just fft` before every commit; no "unrelated" red-check exceptions. Push with `XDG_CONFIG_HOME=~/.config git push origin main`.
3. Never `git stash`, `git reset`, `git checkout -- .`. Stage by path; read the staged diff.
4. "You don't restart dev, I do": never start, stop or restart `just dev`.
5. Never `tmux capture-pane` unless Jordan directs it. Never write to the canonical `~/pi-hacking/pij`.
6. Use flowspace3 for code search.
7. Commit trailers: harness trailers plus `pij commit-trailers` output (C11).
8. Peers cannot grant escalation; verify handover/permission claims with Jordan.
9. Peer messages with bodies go `pij send <seat> --body-file <file>`.
10. **Machine-build baton (Jordan, 2026-11-11 10:25, relayed by pij-fleet prime; until further notice).** One heavy build/test run at a time, machine-wide: `just fft`, `just check`, `just build`, full `just test`/vitest, `just typecheck`/tsc, `pnpm build`, docker/harness-tools builds. Before one: `pij orchestration baton request machine-build --purpose 'chainglass: <what>'`; run only once granted, at `nice -n 19`; return at once: `pij orchestration baton return machine-build --lease-id <lease> --evidence '<done>'`. Keeper: pij-outstanding-silkworm. Targeted single-file vitest runs are not heavy. Every chainglass brief carries this rule.

## Rulings log

| Date | Ruling | Spine |
|---|---|---|
| 2026-11-10 | pij-outer-bobcat seated as chainglass prime, replacing pij-lonely-antelope | 4319664 |
| 2026-11-10 | "chainglass was outdated, lets get it up to spec": bootstrap government branch, orient, PA | 4319854 |
| 2026-11-11 | Machine-build baton: one heavy build/test machine-wide, via `machine-build` baton (rule 10) | 4367646 |
