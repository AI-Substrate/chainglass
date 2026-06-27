# Component: Remote View (`remote-view`)

> **Domain Definition**: [remote-view/domain.md](../../domains/remote-view/domain.md)
> **Source**: `apps/web/src/features/088-remote-view/` (web) · `native/streamd/` (native Swift daemon, outside the pnpm graph)
> **Registry**: [registry.md](../../domains/registry.md) — Row: Remote View

Streams ONE host desktop-app window (a Godot game, the iOS Simulator) into the browser content area with live mouse/keyboard input. A signed native Swift daemon (`streamd`) captures + H.264-encodes the window and speaks the wire protocol over a **loopback-only, JWT-gated** HTTP+WS control API; the web side mirrors that protocol (Zod), runs the viewport state machine, decodes via WebCodecs, and mints the stream token. One session ↔ one window ↔ at most one viewer (latest-attach-wins).

```mermaid
C4Component
    title Component diagram — Remote View (remote-view)

    Container_Boundary(streamd, "Native Daemon (streamd, Swift)") {
        Component(wsServer, "WS + Control API", "HTTP/WS Server", "loopback-only listener;<br/>/health /windows /sessions /shutdown;<br/>/stream upgrade; JWT + Origin gate")
        Component(frameSource, "FrameSource seam", "Protocol", "FixtureFrameSource (replay)<br/>vs CaptureFrameSource (live)")
        Component(capture, "Capture + Encoder", "SCK → VideoToolbox", "per-window SCStream →<br/>low-latency H.264 AVCC;<br/>truthful avc1.PPCCLL")
        Component(session, "Session Table", "FSM", "latest-attach-wins, 300s grace,<br/>15s heartbeat, R1–R9")
        Component(auth, "Auth (HKDF+HS256)", "Verifier", "raw-key JWT verify +<br/>Origin allowlist (mirrors web)")
        Component(input, "Input Injector", "CGEvent", "DOM code → keycode,<br/>de-normalized mouse,<br/>focus-follows + clamped wheel")
        Component(registry, "Discovery Registry", "File Writer", ".chainglass/streamd-<webPort>.json;<br/>SIGTERM / vanish lifecycle")

        wsServer --> frameSource
        wsServer --> session
        wsServer --> auth
        wsServer --> input
        frameSource --> capture
        registry --> wsServer
    }

    Container_Boundary(web, "Web side (apps/web)") {
        Component(protocol, "Wire Protocol", "Zod + binary codec", "t-discriminated control +<br/>16-byte binary video header;<br/>cross-language fixtures")
        Component(machine, "Viewport Machine", "State machine", "picker → attaching → live →<br/>degraded / displaced / … / error;<br/>reconnect hook")
        Component(viewport, "Viewport + HUD", "WebCodecs", "canvas decode, stats HUD,<br/>normalized rAF-batched input")
        Component(token, "Token Route", "NextAuth route", "short-lived JWT mint,<br/>aud=remote-view-ws")
        Component(service, "RemoteViewService", "Service interface", "list / attach / detach;<br/>fake (Phase 2) + real (Phase 5)")

        viewport --> machine
        machine --> protocol
        viewport --> protocol
        service --> protocol
    }

    Rel(viewport, wsServer, "authenticated WS stream + control", "ws://127.0.0.1 /stream")
    Rel(token, auth, "mints the token the daemon verifies", "HKDF raw key")

    %% Cross-domain deps (_platform/auth HKDF mint, _platform/events SSE, _platform/state,
    %% panel-layout mode switch — Phase 5) documented in prose + at L2 per C4 principle 4.
```

> Internal components + the single defining web↔daemon stream relationship are shown.
> Cross-domain dependencies (`_platform/auth`, `_platform/events`, `_platform/state`,
> `panel-layout` content-area mode switch — Phase 5) belong at L2 in `web-app.md` per C4
> authoring principle 4.

---

## Navigation

- **Zoom Out**: [Web App Container](../containers/web-app.md)
- **Domain**: [remote-view/domain.md](../../domains/remote-view/domain.md)
- **Hub**: [C4 Overview](../README.md)
