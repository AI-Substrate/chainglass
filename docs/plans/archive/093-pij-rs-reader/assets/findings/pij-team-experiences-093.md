# pij-team experiences — plan 093 second run (2026-09-05 → 09-07)

For the skill owner (flowspace3 o-prime) and the harness prime. Each item: what bit, what
we did, what the skill or platform should absorb. All measured in this plan's dispatch folder.

1. **Seats the human spawns directly have no parent.** `pij-rs spawn --parent` sets it; a
   seat Jordan launches himself gets `parent:null` and renders as a root beside the prime.
   Fix that worked: the seat runs `pij-rs register --parent <prime>` on arrival — accepted in
   place, no re-mint. **Absorb**: the ready/adopt route should tell a seat to declare its
   parent, and the prime's ack-ruling should check `pij-rs state <seat>` shows it.

2. **C3 "compact the peer at completion" cannot be executed against rs.** The harness
   advertises compact/new/reload control verbs; the rs daemon answers "does not expose
   remote-control commands in the v1 send request". Ledgered with pij (sibling of plan 138).
   **Absorb**: C3 needs an rs branch — hold uncompacted with state on disk, or instruct the
   seat's own harness compact if it has one.

3. **A fixture whose two fake sources share ids cannot fail to join.** The reviewer's
   generalisation of delivery-vs-content, applied to a join. Two HIGH findings (F1 focus 404,
   F2 flat rail) were invisible to every existing rail/tree/focus test because the fake
   tree's ids were the fake roster's ids. **Absorb into the impl-guide template**: any unit
   that joins two sources must have a fixture with DISJOINT ids and a test that the join
   degrades honestly.

4. **The loaded page is a sensor no fixture replaces, and it was blocked twice.** F1 and F2
   were both found by Jordan on the running product before the reviewer, because bp-0001
   (dev restart) was operator-only. **Absorb**: a backpressure row that needs the operator
   should be scheduled EARLY in the run, not left as the last unrun row — the blockers sit
   in the gap the blocked rows leave.

5. **"Commit now, verify live after" beat "hold the tree for the operator".** 36 files held
   uncommitted on a shared tree is the failure the prime paid for on 09-05. Ruling that
   worked: commit with an honest body line ("live acceptance pending restart; not claimed")
   and add the live check as its own receipt row later. **Absorb**: say this in the coder
   packet template.

6. **The mandatory gate carried a wall-clock test against a retired external binary.**
   `flowspace-mcp.integration.test.ts` asserts <5s against `fs2`, retired 09-03; it red-
   flagged two seats. Root cause was ours (grep mapped to fs2 auto → semantic), fixed in
   `3650a9619`, but the gate still exercises a dead product. **Absorb**: chainglass needs a
   plan to move search to flowspace3 (which has no MCP mode — not a swap). Harness-side:
   a timing assertion on an external process should name the process and its owner.

7. **The native `just code-review-agent` runner fails E200 (shell/write denied by its
   preset) and cannot persist its report**, three runs this plan. Its text findings were
   real and were fixed; its exit code read as "review failed". Harness item DL-006.

8. **Prime's own errors this run, on record**: cited a requirement (req-0040) that does not
   exist in pij; ruled a persistence idiom that does not persist and a checkpoint location
   the reader's own fence forbids; attributed fs2 latency to the binary without asking what
   mode we requested. Each was caught by the coder reading source or measuring. The pattern
   the coder used every time — measure before ruling, name RAN vs READ — is the skill's
   core tenet working as designed, in the direction the tenet did not anticipate: upward.
