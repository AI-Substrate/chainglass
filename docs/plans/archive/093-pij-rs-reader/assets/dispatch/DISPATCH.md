RE-SEND (my fault, not yours): I dispatched you 15 minutes ago and then destroyed the message by running `pij-rs inbox --seat pij-sweet-stork` to check whether you had received it. That verb PULLS AND ACKNOWLEDGES. I consumed your mail while checking your mail. Here it is again — this is the real dispatch, act on it.

You are the coder for chainglass plan 093 (pij-rs read path). I am pij-lonely-antelope, chainglass o-prime, your only interface. There is NO PM on this plan.

FIRST, BEFORE ANYTHING:  cd /Users/jordanknight/substrate/chainglass-093-pij-rs-reader

You were spawned in the MAIN checkout because pij refuses an omp spawn directly into a linked worktree. Main is NOT yours — I am live in it. Your worktree is the path above, branch 093-pij-rs-reader, already scaffolded by me. Work only there, and confirm your cwd before you touch a file.

YOUR PACKET, all four, read them:
  docs/plans/093-pij-rs-reader/packet-coder.dd.md         your dispatch, done bar, fences, refs
  docs/plans/093-pij-rs-reader/impl-guide.dd.md           three unit rows, HARD CONSTRAINTS, composition
  docs/plans/093-pij-rs-reader/plan.dd.md                 goals, non-goals, acceptance criteria
  docs/plans/093-pij-rs-reader/assets/backpressure.dd.md  YOUR DONE BAR — every proof is a command

WHY THIS EXISTS, so the packet reads as more than a spec: chainglass reads the pij fleet by SPAWNING A PROCESS every tick. That call now takes 7.744s against a 5s timeout, so every call is killed before it returns — ~95% of a core, continuously, receiving NOTHING. It is switched off. You are building the HTTP reader that replaces it against pij-rs on 127.0.0.1:7461, which answers the same question in ~113ms. Three units: rs-client (transport), rs-records (IPijRecords over it), rs-events (single subscriber). Settle rs-client's interface FIRST; the other two sit on it.

DO NOT START CODING. Reply with a NUMBERED PLAN, and treat that ack as a REVIEW OF MY DOCUMENTS, not a receipt. If the impl-guide is wrong — bad file pointer, an interface that cannot be implemented as written, a false premise about the daemon — say so with evidence and I will amend it. Every ack on this fleet today caught a real defect in its own plan.

NEW INPUT since I wrote the impl-guide, and it is better than what I guessed: `pij-rs state <id>` returns an `unsupported[]` array naming EVERY field rs cannot provide AND WHY. Verbatim examples: bindHealth ("the TS pre-bind health classifier has no rs counterpart"), degraded ("derived from bindHealth"), watchdog ("rs has no watchdog block on the seat row"), lastEventAt ("not on the rs descriptor — deriving it needs a full spine scan per read"), activity, failureReason, and a subtle one worth reading twice: rs `liveness: active` covers BOTH the TS `active` and TS `stale` cases, so it is a WEAKER claim, not the same one. Run `pij-rs state pij-sweet-stork` yourself and read the whole array. Use it as the source of truth for the unavailable markers in bp-0007 instead of my hand-written list, and tell me where the two disagree.

Three things I will not have you guess at:
1. The daemon is LIVE — use it while building:
     curl -s -H "Authorization: Bearer $(cat ~/.pij-rs/daemon.key)" http://127.0.0.1:7461/v1/seats
   Do NOT infer the wire from the vendored packet; it was already wrong once (documents /v1/state as GET; it is POST with a JSON body — 405 verified on GET).
2. PROVE, DO NOT ASSERT. Backpressure proofs are commands with exit statuses. Run them, paste real output. The row most likely to be skipped is bp-0004 (a CLOSED seat must leave the reader within 2s) and it is the one that matters most: a reader that only ever sees appearances has not been proven to track truth.
3. The gaps ARE the contract. Do not synthesise, default, or infer watchdog/bindHealth/degraded/role. A blank watchdog cell reads as "your watchdog is off", which is false in the dangerous direction; this repo has shipped exactly that bug before.

STOP AND ASK me rather than guessing on: any change to IPijRecords, any new dependency, anything needing a WRITE to pij-rs (chainglass is a reader), and any temptation to flip the default to rs.

WARNING FROM MY OWN MISTAKE, since it will bite you too: do NOT run `pij-rs inbox --seat <someone else>` to check on a peer. It acknowledges what it pulls and destroys their mail. If you want to know whether I got something, ask me.

flowspace3 is BACK (it was down for a disk incident). In this repo prefer `flowspace3 search --source code` — the default blend buries code under a very large docs/plans corpus. Latency varies a lot with daemon load; that is known and not a finding.

Reply with your numbered plan.
