import Foundation

/// Daemon-side session state machine (dossier T005, Workshop 002).
///
/// One session ↔ one target window ↔ **at most one viewer** (single-viewer v1).
/// Sessions are in-memory (a daemon restart invalidates them → R6 `E_SESSION_UNKNOWN`).
/// Pure + time-injected (`now`) so every transition is unit-testable with no socket;
/// the WS layer (T006) drives it and executes the returned effects.
///
/// States (Workshop 002 §state table):
///  - `idle`       created via POST /sessions; capture off; grace (300s) running
///  - `streaming`  viewer attached; capture on
///  - `unwatched`  viewer gone (clean close / heartbeat timeout); capture paused,
///                 config retained; grace (300s) running
///  - `closed`     terminal (detach / window-gone / shutdown / GC); never resurrects
///
/// Matches `fake-streamd.ts` for displacement (R2 → `displaced` + close 4002) and
/// terminal-closed (R6 → `E_SESSION_UNKNOWN` + close 4404). The 15s/2-miss heartbeat
/// (R5) is NOT in the fake — implemented here from Workshop 002 directly.
enum SessionState: String, Equatable, Codable {
    case idle, streaming, unwatched, closed
}

final class SessionTable {
    typealias ViewerID = String   // opaque per-connection identifier

    struct Session: Equatable {
        let id: String
        let windowId: Int
        var state: SessionState
        var viewer: ViewerID?
        /// Next sequence number to emit; **resets to 0 on each attach** (first frame = keyframe seq 0).
        var nextSequence: UInt32
        /// Last heartbeat/activity time; governs the R5 timeout while `streaming`.
        var lastHeartbeatAt: TimeInterval
        /// When the grace window started (`idle`/`unwatched`); nil while `streaming`/`closed`.
        var graceStartedAt: TimeInterval?
    }

    /// Result of a viewer attach (WS handshake).
    enum AttachResult: Equatable {
        /// New viewer is now the sole viewer; if `displaced` is non-nil, the WS layer
        /// must send that prior viewer `displaced` + close 4002 (R2, latest-attach-wins).
        case attached(displaced: ViewerID?)
        /// Session is closed or never existed → `E_SESSION_UNKNOWN` + close 4404 (R6).
        case unknownSession
    }

    /// Time-driven transitions surfaced by `sweep`.
    enum SweepEffect: Equatable {
        /// Streaming session missed `heartbeatMaxMisses` heartbeats → `unwatched` (R5).
        case heartbeatTimeout(sessionId: String, viewer: ViewerID)
        /// `idle`/`unwatched` session exceeded the grace window → `closed` (GC).
        case graceExpired(sessionId: String)
    }

    let graceSeconds: TimeInterval
    let heartbeatIntervalSeconds: TimeInterval
    let heartbeatMaxMisses: Int

    private var store: [String: Session] = [:]
    private var viewerIndex: [ViewerID: String] = [:]   // current viewer → sessionId

    init(graceSeconds: TimeInterval = 300,
         heartbeatIntervalSeconds: TimeInterval = 15,
         heartbeatMaxMisses: Int = 2) {
        self.graceSeconds = graceSeconds
        self.heartbeatIntervalSeconds = heartbeatIntervalSeconds
        self.heartbeatMaxMisses = heartbeatMaxMisses
    }

    /// Deadline (seconds) after the last heartbeat at which a streaming viewer is dead.
    var heartbeatDeadlineSeconds: TimeInterval {
        heartbeatIntervalSeconds * Double(heartbeatMaxMisses)
    }

    // MARK: Creation (R4 / POST /sessions)

    /// Create an `idle` session for `windowId` (grace running). Idempotent per id.
    @discardableResult
    func create(sessionId: String, windowId: Int, now: TimeInterval) -> Session {
        if let existing = store[sessionId] { return existing }
        let session = Session(id: sessionId, windowId: windowId, state: .idle, viewer: nil,
                              nextSequence: 0, lastHeartbeatAt: now, graceStartedAt: now)
        store[sessionId] = session
        return session
    }

    // MARK: Attach (viewer WS handshake)

    func attach(sessionId: String, viewer: ViewerID, now: TimeInterval) -> AttachResult {
        guard var session = store[sessionId], session.state != .closed else {
            return .unknownSession   // unknown or terminal (R6 / closed-terminal)
        }
        // R2: latest-attach-wins — displace the prior live viewer (different connection).
        var displaced: ViewerID?
        if let prior = session.viewer, prior != viewer {
            displaced = prior
            viewerIndex[prior] = nil
        }
        session.viewer = viewer
        session.state = .streaming
        session.nextSequence = 0           // sequence resets on every attach
        session.lastHeartbeatAt = now
        session.graceStartedAt = nil       // streaming → no grace; heartbeat governs
        store[sessionId] = session
        viewerIndex[viewer] = sessionId
        return .attached(displaced: displaced)
    }

    // MARK: Viewer close paths

    /// Clean WS close (refresh / switch-away, R1/R9) → `unwatched`, grace starts. Only the
    /// *current* viewer's close transitions the session; a displaced old socket's close is
    /// a no-op (its slot was already replaced).
    func viewerClosed(_ viewer: ViewerID, now: TimeInterval) {
        guard let sessionId = viewerIndex[viewer], var session = store[sessionId] else { return }
        viewerIndex[viewer] = nil
        guard session.viewer == viewer, session.state == .streaming else { return }
        session.viewer = nil
        session.state = .unwatched
        session.graceStartedAt = now
        store[sessionId] = session
    }

    /// Explicit detach / DELETE / window-gone / shutdown → `closed` (terminal, R9).
    func close(sessionId: String, now: TimeInterval) {
        guard var session = store[sessionId] else { return }
        if let v = session.viewer { viewerIndex[v] = nil }
        session.viewer = nil
        session.state = .closed
        session.graceStartedAt = nil
        store[sessionId] = session
    }

    // MARK: Heartbeat + sequence

    /// Refresh the heartbeat clock for the session this viewer owns (while streaming).
    func recordHeartbeat(_ viewer: ViewerID, now: TimeInterval) {
        guard let sessionId = viewerIndex[viewer], var session = store[sessionId],
              session.viewer == viewer else { return }
        session.lastHeartbeatAt = now
        store[sessionId] = session
    }

    /// Return the current sequence number for the next frame, then increment.
    /// `nil` if the session is gone/closed.
    func takeSequence(sessionId: String) -> UInt32? {
        guard var session = store[sessionId], session.state != .closed else { return nil }
        let seq = session.nextSequence
        session.nextSequence = seq &+ 1
        store[sessionId] = session
        return seq
    }

    // MARK: Time-driven sweep (heartbeat timeout + grace GC)

    /// Apply heartbeat timeouts (streaming → unwatched, R5) and grace GC
    /// (idle/unwatched → closed). Returns the effects the WS layer should act on.
    func sweep(now: TimeInterval) -> [SweepEffect] {
        var effects: [SweepEffect] = []
        for (id, var session) in store {
            switch session.state {
            case .streaming:
                // R5: dead after 2 missed heartbeats (15s × 2 = 30s). Use `>=` so a sweep at the
                // exact 30s deadline reaps the zombie viewer rather than deferring a cycle (F007).
                if now - session.lastHeartbeatAt >= heartbeatDeadlineSeconds, let viewer = session.viewer {
                    viewerIndex[viewer] = nil
                    session.viewer = nil
                    session.state = .unwatched
                    session.graceStartedAt = now
                    store[id] = session
                    effects.append(.heartbeatTimeout(sessionId: id, viewer: viewer))
                }
            case .idle, .unwatched:
                if let started = session.graceStartedAt, now - started > graceSeconds {
                    session.state = .closed
                    session.graceStartedAt = nil
                    store[id] = session
                    effects.append(.graceExpired(sessionId: id))
                }
            case .closed:
                break
            }
        }
        return effects
    }

    // MARK: Projection

    func session(_ id: String) -> Session? { store[id] }
    var all: [Session] { Array(store.values) }
    func state(_ id: String) -> SessionState? { store[id]?.state }
}
