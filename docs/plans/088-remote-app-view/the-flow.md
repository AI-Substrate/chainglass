<!-- 🔄 RENDERED from the-flow.json — regenerate, never hand-edit this file as the primary. -->
# the-flow · remote-app-view (flight view)

**Plan**: remote-app-view · **Mode**: Full · **Phases**: 6 (locked at architect)
**Rail**: `[the-flow] ◆─◆─◆─◆─◐─◇─◇  research · spec · plan · tasks · [build 2/6] · review · merge`   ·   **now**: Phase 2 ✅ implemented + reviewed — 56 tests green, AC-12 (web side daemon-absent); companion caught 2 HIGH bugs, all fixed · **next**: Phase 3 tasks (review pass optional)

```mermaid
flowchart TD
    classDef done    fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef wip     fill:#FF9800,stroke:#F57C00,color:#000
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff
    classDef known   fill:#90A4AE,stroke:#607D8B,color:#000
    classDef assumed fill:#ECEFF1,stroke:#B0BEC5,color:#90A4AE,stroke-dasharray:4 4
    classDef said    fill:#FFFDE7,stroke:#FBC02D,color:#000
    classDef harness fill:#EDE7F6,stroke:#673AB7,color:#000
    classDef companion fill:#E1F5FE,stroke:#0288D1,color:#000

    %% ── spine ──
    R[Research]:::done --> S[Spec]:::done --> BP["Backpressure Check · noop (no repo harness)"]:::harness --> PL["Plan · READY 7/7 + validated"]:::done
    PL --> P1["Phase 1: De-Risk Spike · ✅ COMPLETE — all GO"]:::done --> P2["Phase 2: Domain, Protocol & Session Core · ✅ COMPLETE — 51 tests, AC-12"]:::done --> P3["Phase 3: Viewport UI & Content-Area Mode"]:::known --> P4["Phase 4: Native Daemon (Swift)"]:::known --> P5["Phase 5: Lifecycle, Agent Surface & Events"]:::known --> P6["Phase 6: Integration Hardening, Permissions UX & Docs"]:::known --> M[Merge]:::assumed

    %% ── companions (each wrapped the phase it was meant to review) ──
    subgraph CW["⌖ code-review-companion · idle-timed-out before pings (0 review)"]
        P1
    end
    class CW companion
    subgraph CW2["⌖ code-review-companion · 9 commits pinged · 10 findings (2 HIGH) · all fixed"]
        P2
    end
    class CW2 companion

    %% ── excursions ──
    R -.->|pre-flow| DR[["deep research · Perplexity"]]:::done
    DR -.-> S
    S -.->|design excursion| WS[["Workshops 4/4 · mode · session FSM · WS protocol · daemon packaging"]]:::done
    WS -.-> PL
    PL -.->|auto| V[["validate-v2 · 4 agents · VALIDATED WITH FIXES (11)"]]:::done
    P1 -.->|stage 5 + validate| T1[["Phase 1 tasks dossier · T000–T007 · 7 fixes"]]:::done
    P1 -.->|evidence| EV[["GO: capture 45fps · real fixture 254f decode 254/254 · mouse+kbd inject · stable-cert TCC · CGWindowID stable"]]:::done
    P2 -.->|stage 5 + validate| T2[["Phase 2 tasks dossier · T000–T010 · VALIDATED · 15 fixes"]]:::done
    P2 -.->|evidence| EV2[["GREEN daemon-absent: protocol+codec round-trips · fake replays 254f · 10-state FSM + R1–R9 · token route + auth vectors · service+DI · 51 tests"]]:::done
    M -.->|reflection| HH[["plan-complete seam · /eng-harness-flow"]]:::harness

    %% ── verbatim user-said bubbles ──
    UR>"🗣 lets get a plan started for it please. set up flow and straight in to explore"]:::said
    UR -.- R
    US>"🗣 yes (specify; 8 clarifications)"]:::said
    US -.- S
    UW>"🗣 do the workshops please"]:::said
    UW -.- WS
    UP>"🗣 run it then validate"]:::said
    UP -.- PL
    UT>"🗣 prepaare phase 1 and validate"]:::said
    UT -.- T1
    UB>"🗣 build with companion mode"]:::said
    UB -.- P1
    UG>"🗣 generate phase 2 then validatie"]:::said
    UG -.- T2
    UB2>"🗣 build with companion mode"]:::said
    UB2 -.- P2
```

**Legend**: 🟩 done · 🟧 in progress · 🟥 blocked · 🟦 known future (designed) · ⬜╴assumed future (dashed) · 🟨 🗣 verbatim user input · 🟪 harness seams · 🟦 companion (cyan)

_Generated from `the-flow.json`. **Phase 2 is implemented, reviewed, and green** — 11 tasks (T001–T010) + a companion review-response, **56 tests across 8 files** (51 + 5 finding tests), run serially. **AC-12 met**: the entire web side runs and passes with **no daemon** — the `remote-view` domain + dep-direction guard, the Zod wire protocol + 16-byte binary codec (with `messages.json` **and** `frame-header.json` as the cross-language drift guards for the Swift daemon, Task 4.2), the first-class frame-replay fake (254 owned `sck-capture` frames), the 10-state session machine + reconnect hook (R1/R2/R3/R5/R6/R7/R8/R9 incl. the `daemonDown` health fork), the frozen-contract token route (`aud=remote-view-ws`, no `cwd`) + pinned auth vectors (Task 4.4), and `IRemoteViewService` + Fake + DI + reusable contract suite. Two logged deviations: T007 uses real timers + injected short durations (fake-timer/real-socket deadlock), and `zod` pinned `^4.3.5` in `apps/web`. The live `code-review-companion` was booted + briefed, every commit pinged, and it **actively reviewed** — surfacing **10 findings (2 HIGH: F004 displaced-state R3-trap escape, F007 learned-windowId clobber breaking R6 deep-link recreate; 8 MEDIUM)** on the inside lane. (An earlier flight-plan note wrongly recorded "0 replies / non-engagement" — an operator read-path error querying the outside lane; corrected, anecdote filed as minih issue [#47](https://github.com/AI-Substrate/minih/issues/47).) **All actionable findings landed in the review-response commit** → stage-7 review is **effectively satisfied** by the companion + response. **Next: generate Phase 3 tasks** — a separate `/the-flow 7 review` pass is optional. Phase 1 carry-forwards still hold for Phase 4 (CoreGraphics `NSApplication` init; reuse `chainglass-dev` cert + `com.chainglass.streamd`)._
