# Workshop: Daemon Packaging & Discovery

**Type**: Storage Design / Integration Pattern
**Plan**: 088-remote-app-view
**Spec**: [remote-app-view-spec.md](../remote-app-view-spec.md)
**Created**: 2026-06-13
**Status**: Approved

**Value Thesis**: The Swift daemon is the repo's **first non-Node artifact** (Critical 01) — build, signing, TCC persistence, spawn, and discovery have no in-repo precedent to copy, only the terminal sidecar's *lifecycle shape* to mirror. Deciding the packaging story now prevents the native phase from stalling on toolchain archaeology, and makes the TCC re-prompt trap (which would burn hours) a documented one-time setup step instead.
**Target Proof Level**: Preferred Direction (build/signing) + Contract Ready (registry & control API)
**Current Proof Level**: As targeted — signing/TCC behavior is asserted from platform knowledge and must be spike-verified

**Selected Value Axes**:
- **Operational Reliability**: lifecycle hygiene (AC-11) — spawn, discover, reap, no orphans — specified to the field level.
- **Onboarding / Accessibility**: the one-time dev setup (`just` recipes + TCC grants) is written down before anyone hits it cold (AC-14).
- **Migration Safety**: version/upgrade handshake defined before two versions ever coexist.

**Related Documents**:
- [003-stream-ws-protocol.md](./003-stream-ws-protocol.md) — what runs on the daemon's port
- [002-session-reattach-state-machine.md](./002-session-reattach-state-machine.md) — session lifetime bounded by daemon lifetime
- `external-research/streaming-stack.md` — why Swift, why a signed .app bundle

**Domain Context**:
- **Primary Domain**: remote-view — the daemon is in-domain composition (like the terminal sidecar is to `terminal`), not a platform service
- **Related Domains**: `_platform/auth` (bootstrap-code HKDF — frozen, consumed), terminal (lifecycle pattern source: `pty-registry.ts`)

---

## Purpose

Decide how the daemon is built, signed, installed, spawned, discovered, health-checked, reaped, and upgraded — and what its registry file and control API contain.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach the target proof level and:

- Run the one-time dev setup and end with a TCC-granted daemon that survives rebuilds.
- Implement the web-side daemon manager (spawn/discover/reap) from the registry contract.
- Know exactly why the bundle is signed with a stable certificate and what breaks if it isn't.

## Key Questions Addressed

- SwiftPM or Xcode project in the repo? Prebuilt binary or build-locally?
- Who spawns the daemon? How does the browser find its port?
- What's in its registry/server.json entries?

---

## Decision Space

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Build: SwiftPM in-repo (`native/streamd/`) | `Package.swift` executable target; `swift build` via `just`; no `.xcodeproj` | Diffable, CLI-only (Xcode CLT suffices), no IDE artifacts in git | Bundle assembly needs a script (SwiftPM emits bare binaries) | **Selected** |
| Build: Xcode project | Full `.xcodeproj` | Native bundle/signing UI | Opaque project files; IDE dependency; overkill for a headless daemon | Rejected |
| Distribution: build locally | `just streamd-install` builds + installs on the host | Self-hosted dev tool ethos; no release infra; host has Xcode CLT (it builds Godot/Simulator already) | First run needs CLT (~one-time) | **Selected (v1)** |
| Distribution: prebuilt notarized binary | CI builds, user downloads | No local toolchain | Signing/notarization infra for a v1 single-user tool; defer until there's a second user | Rejected (v1) — revisit if chainglass grows an install story |
| Repo location: `native/streamd/` | New top-level dir outside pnpm/turbo graph | Node build untouched (PL-02 lesson: keep native out of the Node toolchain) | New top-level convention | **Selected** (dossier's own suggestion) |

## Bundle & Signing (the TCC trap, addressed head-on)

macOS TCC grants (Screen Recording, Accessibility) key on the app's **code-signing identity, not its path**. The trap:

- **Ad-hoc signing** (`codesign -s -`) produces a *cdhash-based* designated requirement — it changes on **every rebuild**, so TCC treats each build as a new app and re-prompts. Hours of confusion if undocumented.
- **Stable self-signed certificate**: a one-time, locally created code-signing cert (e.g. named `chainglass-dev`) gives a stable designated requirement — rebuilds re-signed with it **keep their TCC grants**.

**Decision**: one-time `just streamd-setup` creates the `chainglass-dev` self-signed code-signing certificate in the login keychain (documented, scriptable via `security`/`certtool`; manual Keychain Access steps as fallback in `docs/how/remote-view.md`). Every `just streamd-install` signs with it. If an Apple Development cert exists, an env var can select it instead. *Spike must verify* grant persistence across rebuilds — this is asserted platform knowledge, not yet repo-proven.

```
Bundle layout (assembled by scripts/make-bundle.sh from the SwiftPM binary):
  ChainglassStreamd.app/
    Contents/
      Info.plist          # CFBundleIdentifier=com.chainglass.streamd
                          # CFBundleShortVersionString=<daemonVersion>, LSUIElement=true (no Dock icon)
      MacOS/streamd       # SwiftPM release binary

Install path (stable, outside the repo so worktrees share one grant):
  ~/Library/Application Support/chainglass/streamd/ChainglassStreamd.app
```

`just` recipes: `streamd-setup` (cert, once) · `streamd-build` (swift build + bundle) · `streamd-install` (build + sign + copy to install path) · `streamd-kill` (dev convenience).

## Spawn & Discovery

**Who spawns**: the web server's remote-view daemon manager (mirroring the terminal sidecar manager's shape: globalThis-pinned for HMR, startup reaper, idle awareness) — lazily, on the first `list`/`attach` API call, not at boot. Nobody pays for the daemon until remote view is used.

**How**: `open -g -a "<install path>" --args --port <P> --registry <abs .chainglass path> --bootstrap <abs bootstrap-code.json path>`. Launching via LaunchServices (`open`) — not direct binary exec — so the process is attributed to the *bundle* for TCC purposes and detaches from the Node parent. Spawn readiness = polling the registry file + `GET /health` (≤5s timeout → surface `E_PERMISSION`-style guidance or spawn failure to the UI).

**Port**: default `webPort + 1501` (terminal sidecar owns `+1500` — `use-terminal-socket.ts:96`), overridable via config `CG_REMOTE_VIEW__DAEMON_PORT` (ADR-0003 `CG_*` conventions, corrected at plan validation — was `CHAINGLASS_STREAMD_PORT`). The browser **never computes the offset**: the attach/list API responses include `daemonPort` read from the registry — single source of truth, but the default stays predictable for tunnel/firewall configuration (tailnet users don't care; strict-tunnel users punch one known port, same as they already did for the terminal).

**Registry file**: `.chainglass/streamd-<webPort>.json` — port-keyed like `terminal-sidecar-<port>.pids.json`, written **by the daemon itself** once listening, atomic temp+rename (the established idiom):

```json
{
  "pid": 84210,
  "port": 4608,
  "protocolVersion": 1,
  "daemonVersion": "0.1.0",
  "bundleId": "com.chainglass.streamd",
  "bundlePath": "/Users/x/Library/Application Support/chainglass/streamd/ChainglassStreamd.app",
  "startedAt": "2026-06-13T01:00:00.000Z"
}
```

**Reaper** (web-server boot, fail-closed — copied from `pty-registry.ts` semantics): for each `streamd-*.json`, the pid must be alive **and** its executable path must match `bundlePath`'s inner binary before being trusted; alive-and-verifiably-ours → kill + delete entry; dead → delete entry. **[SUPERSEDED by T002 fail-closed decision]** the original "alive-but-mismatched → kill" was corrected: a pid that is alive but whose executable path does **not** match (a recycled pid) or is unprobeable is **left alone, never killed** — killing it could murder an unrelated process. Daemon self-defense: it exits if its registry file disappears (poll 30s) and on `SIGTERM` sends `bye {reason:'shutdown'}` to a connected viewer first. AC-11's "no orphans after `just` dev cycles" is the acceptance hook.

## Control API (localhost HTTP, same port as the stream WS)

The daemon binds **localhost only**; one listener serves HTTP + WS upgrade. Auth: the same HKDF-derived JWT (frozen bootstrap-code contract) on everything except `/health`. The browser reaches the daemon *directly* only for the WS (terminal parity); everything else goes through NextAuth-gated Next.js routes that mint JWTs server-side and proxy:

| Daemon endpoint | Auth | Proxied as | Purpose |
|---|---|---|---|
| `GET /health` | none | `/api/remote-view/health` | `{ok, daemonVersion, protocolVersion, permissions:{screenRecording, accessibility}}` — preflight via `CGPreflightScreenCaptureAccess()` / `AXIsProcessTrusted()`; feeds AC-14 UX |
| `GET /windows` | JWT | `/api/remote-view/windows` | capturable windows: `{id, app, title, pixelWidth, pixelHeight, thumbnail}` (one-shot JPEG, base64) — AC-1 picker |
| `POST /sessions` | JWT | `/api/remote-view/sessions` | create session for `{windowId}` → `{sessionId, window}` (Workshop 002 `idle`) |
| `DELETE /sessions/:id` | JWT | same | explicit detach → `closed` |
| `GET /sessions` | JWT | same | session list + states — backs `remote-view list` |
| `POST /shutdown` | JWT | — (manager only) | graceful exit for upgrades |
| `GET /stream` (WS) | JWT (query) + Origin allowlist | **direct from browser** | Workshop 003 |

CLI/MCP verbs (`remote-view list|attach|detach`) call the Next.js routes — agents never talk to the daemon directly, so daemon auth stays single-audience.

## Version & Upgrade Handshake

- Web side pins `EXPECTED_PROTOCOL_VERSION` (and min `daemonVersion`). On first use it compares against `/health`; mismatch → `POST /shutdown`, reap, respawn from the install path; still mismatched (stale install) → actionable error: "run `just streamd-install`". Dev loop: rebuilding the daemon = `just streamd-install && just streamd-kill`; next attach spawns the new version.
- `protocolVersion` lives in both the registry file and `/health` so the manager can decide *before* spawning a WS.

## One-Time Host Setup (→ `docs/how/remote-view.md`)

1. `just streamd-setup` — create the signing cert (once per machine).
2. `just streamd-install` — build, sign, install the bundle.
3. First attach → macOS prompts **Screen Recording**; first input → **Accessibility** (System Settings → Privacy & Security; daemon can deep-link via `x-apple.systempreferences:`). Grants stick to the bundle thereafter.
4. Verify: `chainglass remote-view list` (or `/api/remote-view/health`) shows both permissions `granted`.

The AC-14 contract: every missing prerequisite (CLT absent, cert missing, grant denied) maps to a distinct, named error with its fix command — surfaced in both the picker UI and CLI.

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Implementation | "Figure out Swift builds + signing" (open-ended) | Recipes named; bundle layout + registry schema copy-pasteable |
| Onboarding | TCC re-prompt mystery burns a session | Trap documented with its mitigation as step 1 of setup |
| Review | Lifecycle hygiene judged by vibes | Reaper rules + registry fields checkable against `pty-registry.ts` parity |
| Operations | Orphan daemons after dev cycles | Self-exit + fail-closed reaper + AC-11 acceptance hook |

## Validation / Acceptance

This workshop reaches Validated when:

- Spike confirms: TCC grants persist across `just streamd-install` rebuilds with the stable cert (the load-bearing assertion).
- A full dev cycle (boot web → attach → kill web → reboot) leaves zero orphaned `streamd` processes and a clean registry (AC-11).
- Version-mismatch path proven: old daemon running, new web build → auto shutdown/respawn.

## Open Questions

### Q1: Does `open -g` reliably attribute TCC to the bundle when args are passed via `--args`?
**RESOLVED — YES** (Phase 1 spike 1.5b, [spike-findings.md](../external-research/spike-findings.md)): the grant attaches to the bundle identity (`com.chainglass.streamd`), distinct from the controlling terminal; TCC keys on (bundle id + cert leaf), so it's path- and binary-independent within that identity. No fallback needed. **Phase 4 (Task 4.1) MUST reuse the same `chainglass-dev` cert + bundle id** or the grant breaks (ad-hoc signing re-prompts every rebuild — confirmed live). Also confirmed: the capture process must init CoreGraphics (`NSApplication`) and run in a GUI/Aqua session — see spike-findings § Cross-cutting finding.

### Q2: Multiple worktrees / web ports concurrently?
**RESOLVED**: registry is port-keyed (`streamd-<webPort>.json`) exactly like the terminal sidecar, so concurrent web servers get independent daemons on `webPort+1501` — collisions impossible by construction. The install path is shared (one bundle, one TCC grant).

### Q3: Audio later?
**RESOLVED (non-goal v1)**: SCK can capture app audio; protocol evolution (new binary frame type `0x02`) accommodates it without breaking changes. Noted for v2.
