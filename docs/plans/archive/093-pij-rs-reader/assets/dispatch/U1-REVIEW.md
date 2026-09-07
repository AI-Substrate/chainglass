U1 REVIEW — approved with ONE required change before you treat it as frozen, and it is the same class of error we have now corrected three times: a type inferred from the packet rather than read off the wire.

I captured real cursor-bearing frames by generating spine traffic while tailing /v1/events. Six frames are vendored for you at:

  docs/plans/093-pij-rs-reader/assets/inputs/live-event-frames.ndjson

The real frame:

  {"type":"event",
   "machine":"JordansacStudio.localdomain",
   "cursor":4440,
   "event":{"v":1,"at":1788318613497,"kind":"message.pushed","seat":"pij-still-weasel",
            "payload":"{\"msg_id\":\"...\",\"from\":\"...\",\"body\":\"...\"}"}}

Your RsCursorEvent = { machine: string; cursor: number } is COMPATIBLE but hollow — everything u3 actually needs falls into [additive]: unknown. Three specifics:

1. THE DISCRIMINATOR IS `type`, NOT the absence of `hello`. Real frames carry "type":"event". Discriminating on hello works today only because hello is the sole other member; the moment a third frame kind appears (and `unavailable` machines are already in the seats payload, so more kinds are plausible), an absence-based discriminant silently mis-types it as a cursor event. Switch to discriminating on `type`, and treat an unrecognised `type` as an explicit ignored-frame case, not as a cursor event.

2. THE USEFUL CONTENT IS IN `event`, WHICH YOU HAVE NOT MODELLED: { v, at, kind, seat, payload }. `kind` and `seat` are exactly what u3 needs to apply an event to a row — without them, ingest() has nothing to act on. Kinds observed live: message.pushed, delivery.outcome. NOT yet observed: seat.put and status.report, which the packet claims and which are the ones that actually matter for the fleet. Type what you have SEEN, leave the rest open, and do not invent shapes for the two you have not observed — I would rather u3 explicitly ignore an unknown kind than pattern-match a guess.

3. `payload` IS A JSON STRING, NOT AN OBJECT. It is double-encoded: JSON.parse the frame, then JSON.parse(event.payload) again. This is the trap in the set — `frame.event.payload.msg_id` returns undefined silently, and a consumer that reads it that way looks like it works while extracting nothing. Model it as `payload: string` and parse it deliberately at the point of use, so the second decode is visible in the code rather than assumed.

WHAT IS GOOD, and I am not asking you to change any of it: the 401 path is exactly one re-read and one retry with the second result returned unconditionally, so a second 401 throws through envelopeError rather than looping — that is the contract, correctly implemented. readKey() on every fetchOnce means the retry genuinely re-reads from disk rather than reusing a cached value, which is the whole point. The NDJSON reader handles partial lines, flushes a trailing line without a newline, and releases the lock in a finally. POST /v1/state with a JSON body matches the live wire. seats() defends against a missing seats array.

ONE THING TO STATE EXPLICITLY RATHER THAN CHANGE: fetchWithAuthRetry covers the CONNECT. A key rotation mid-stream is not recoverable inside events() — the stream just ends. That is fine and I am not asking you to fix it in u1, because u3's reconnect re-enters events() and therefore re-reads the key. But say so in u1's doc comment, so the next reader does not assume mid-stream auth recovery exists. bp-0006 must exercise the rotation across a reconnect, not within one.

Re-freeze u1 with the frame type corrected, then proceed to u2. u3 will be much cheaper for having the real shape now rather than discovering it at bp-0003.
