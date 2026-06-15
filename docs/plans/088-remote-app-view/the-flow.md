<!-- 🔄 RENDERED from the-flow.json — regenerate, never hand-edit this file as the primary. -->
# the-flow · remote-app-view (flight view)

**Plan**: remote-app-view · **Mode**: Full · **Phases**: 6 (locked at architect)
**Rail**: `[the-flow] ◆─◆─◆─◆─◐─◇─◇  research · spec · plan · tasks · [build 1/6] · review · merge`   ·   **now**: Phase 1 de-risk spike ✅ COMPLETE — all 7 verdicts GO · **next**: Phase 2 tasks (Domain, Protocol & Session Core)

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
    PL --> P1["Phase 1: De-Risk Spike · ✅ COMPLETE — all GO"]:::done --> P2["Phase 2: Domain, Protocol & Session Core (TDD)"]:::known --> P3["Phase 3: Viewport UI & Content-Area Mode"]:::known --> P4["Phase 4: Native Daemon (Swift)"]:::known --> P5["Phase 5: Lifecycle, Agent Surface & Events"]:::known --> P6["Phase 6: Integration Hardening, Permissions UX & Docs"]:::known --> M[Merge]:::assumed

    %% ── companion (wrapped the phase it was meant to review) ──
    subgraph CW["⌖ code-review-companion · idle-timed-out before pings (0 review)"]
        P1
    end
    class CW companion

    %% ── excursions ──
    R -.->|pre-flow| DR[["deep research · Perplexity"]]:::done
    DR -.-> S
    S -.->|design excursion| WS[["Workshops 4/4 · mode · session FSM · WS protocol · daemon packaging"]]:::done
    WS -.-> PL
    PL -.->|auto| V[["validate-v2 · 4 agents · VALIDATED WITH FIXES (11)"]]:::done
    P1 -.->|stage 5 + validate| T1[["Phase 1 tasks dossier · T000–T007 · 7 fixes"]]:::done
    P1 -.->|evidence| EV[["GO: capture 45fps · real fixture 254f decode 254/254 · mouse+kbd inject · stable-cert TCC · CGWindowID stable"]]:::done
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
```

**Legend**: 🟩 done · 🟧 in progress · 🟥 blocked · 🟦 known future (designed) · ⬜╴assumed future (dashed) · 🟨 🗣 verbatim user input · 🟪 harness seams · 🟦 companion (cyan)

_Generated from `the-flow.json`. **Phase 1 de-risk spike is COMPLETE — every verdict GO**, so the riskiest native unknowns (SCK capture, VideoToolbox encode, WebCodecs decode, CGEvent input, stable-cert TCC persistence, CGWindowID stability) are retired before web code commits. Key carry-forwards to Phase 4: the daemon must init CoreGraphics (`NSApplication`) and reuse the `chainglass-dev` cert + `com.chainglass.streamd` identity (the grant given during the spike carries over). The companion idle-timed-out during the multi-day human-blocked grant wait before its review pings landed (recorded honestly; throwaway spike code, post-hoc review optional)._
