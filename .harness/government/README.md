# Governance lives on `prime-governance`

This directory is a pointer, not a second government. The standing
`prime-governance` worktree owns chainglass's governance documents; the o-prime
is the sole writer. Rules: pij skill `references/prime/rituals/bootstrap.md`
§ Governance branch — the rules.

Resolve `<government-root>` from any chainglass checkout:

```sh
git worktree list --porcelain | awk '/^worktree /{p=$2} /^branch refs\/heads\/prime-governance$/{print p "/.harness/government"}'
```

On the canonical machine that is
`~/substrate/chainglass-governance/.harness/government`. If no worktree is
registered, restore the existing branch
(`git worktree add <path> prime-governance`); never recreate it, and never fall
back to this directory.

Project, prime designation, assignments and events are platform-store facts:
`pij project show chainglass`. Product code, numbered plan folders and
everything CI and gates read stay on main. The governance branch never merges
to main; it uses no PRs or CI.
