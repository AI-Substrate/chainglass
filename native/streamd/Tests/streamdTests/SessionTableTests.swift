import XCTest
@testable import streamd

/// Test: streamd daemon session table — Workshop-002 FSM (dossier T005).
/// Behaviour: create→idle; attach idle/unwatched→streaming; 2nd attach displaces (R2);
///   clean close→unwatched (R1/R9); detach/close→closed terminal (R6/R9); sequence resets
///   on attach; heartbeat timeout→unwatched (R5); grace GC→closed.
/// Boundary: attach to unknown/closed → unknownSession; displaced old viewer's close is a no-op.
/// Determinism: time injected via `now` — no wall clock, no sockets.
/// Oracle: workshops/002-session-reattach-state-machine.md + fake-streamd.ts (displace/terminal).
final class SessionTableTests: XCTestCase {

    private func table() -> SessionTable {
        SessionTable(graceSeconds: 300, heartbeatIntervalSeconds: 15, heartbeatMaxMisses: 2)
    }

    func testCreateStartsIdleWithGrace() {
        let t = table()
        let s = t.create(sessionId: "s1", windowId: 34202, now: 0)
        XCTAssertEqual(s.state, .idle)
        XCTAssertEqual(s.windowId, 34202)
        XCTAssertEqual(s.graceStartedAt, 0)
    }

    func testIdleToStreamingOnAttach() {
        let t = table()
        t.create(sessionId: "s1", windowId: 1, now: 0)
        XCTAssertEqual(t.attach(sessionId: "s1", viewer: "A", now: 1), .attached(displaced: nil))
        XCTAssertEqual(t.state("s1"), .streaming)
        XCTAssertEqual(t.session("s1")?.viewer, "A")
    }

    func testSecondAttachDisplacesPriorViewer_R2() {
        let t = table()
        t.create(sessionId: "s1", windowId: 1, now: 0)
        _ = t.attach(sessionId: "s1", viewer: "A", now: 1)
        XCTAssertEqual(t.attach(sessionId: "s1", viewer: "B", now: 2), .attached(displaced: "A"))
        XCTAssertEqual(t.state("s1"), .streaming)
        XCTAssertEqual(t.session("s1")?.viewer, "B")
    }

    func testDisplacedViewerCloseIsNoOp() {
        let t = table()
        t.create(sessionId: "s1", windowId: 1, now: 0)
        _ = t.attach(sessionId: "s1", viewer: "A", now: 1)
        _ = t.attach(sessionId: "s1", viewer: "B", now: 2)   // A displaced
        t.viewerClosed("A", now: 3)                          // stale socket close — must not change session
        XCTAssertEqual(t.state("s1"), .streaming)
        XCTAssertEqual(t.session("s1")?.viewer, "B")
    }

    func testCleanCloseToUnwatchedThenReattach_R1() {
        let t = table()
        t.create(sessionId: "s1", windowId: 1, now: 0)
        _ = t.attach(sessionId: "s1", viewer: "A", now: 1)
        t.viewerClosed("A", now: 5)
        XCTAssertEqual(t.state("s1"), .unwatched)
        XCTAssertEqual(t.session("s1")?.graceStartedAt, 5)
        // reattach within grace resumes
        XCTAssertEqual(t.attach(sessionId: "s1", viewer: "A2", now: 10), .attached(displaced: nil))
        XCTAssertEqual(t.state("s1"), .streaming)
        XCTAssertNil(t.session("s1")?.graceStartedAt)
    }

    func testSequenceResetsOnEachAttach() {
        let t = table()
        t.create(sessionId: "s1", windowId: 1, now: 0)
        _ = t.attach(sessionId: "s1", viewer: "A", now: 1)
        XCTAssertEqual(t.takeSequence(sessionId: "s1"), 0)
        XCTAssertEqual(t.takeSequence(sessionId: "s1"), 1)
        XCTAssertEqual(t.takeSequence(sessionId: "s1"), 2)
        t.viewerClosed("A", now: 2)
        _ = t.attach(sessionId: "s1", viewer: "A2", now: 3)   // reattach
        XCTAssertEqual(t.takeSequence(sessionId: "s1"), 0)     // first frame is keyframe seq 0
    }

    func testCloseIsTerminal_R9_R6() {
        let t = table()
        t.create(sessionId: "s1", windowId: 1, now: 0)
        _ = t.attach(sessionId: "s1", viewer: "A", now: 1)
        t.close(sessionId: "s1", now: 2)                      // detach / window-gone / shutdown
        XCTAssertEqual(t.state("s1"), .closed)
        // a hello on a closed session never resurrects it
        XCTAssertEqual(t.attach(sessionId: "s1", viewer: "B", now: 3), .unknownSession)
        XCTAssertNil(t.takeSequence(sessionId: "s1"))
    }

    func testAttachUnknownSession_R6() {
        let t = table()
        XCTAssertEqual(t.attach(sessionId: "ghost", viewer: "A", now: 0), .unknownSession)
    }

    func testHeartbeatTimeoutToUnwatched_R5() {
        let t = table()
        t.create(sessionId: "s1", windowId: 1, now: 0)
        _ = t.attach(sessionId: "s1", viewer: "A", now: 0)
        // within the 30s deadline → no effect
        XCTAssertTrue(t.sweep(now: 29).isEmpty)
        XCTAssertEqual(t.state("s1"), .streaming)
        // past 2 missed heartbeats (15 * 2 = 30s) → unwatched
        XCTAssertEqual(t.sweep(now: 31), [.heartbeatTimeout(sessionId: "s1", viewer: "A")])
        XCTAssertEqual(t.state("s1"), .unwatched)
    }

    func testHeartbeatRefreshKeepsStreaming() {
        let t = table()
        t.create(sessionId: "s1", windowId: 1, now: 0)
        _ = t.attach(sessionId: "s1", viewer: "A", now: 0)
        t.recordHeartbeat("A", now: 20)
        XCTAssertTrue(t.sweep(now: 45).isEmpty)        // 45 - 20 = 25 < 30
        XCTAssertEqual(t.state("s1"), .streaming)
    }

    func testGraceGcToClosed() {
        let t = table()
        t.create(sessionId: "s1", windowId: 1, now: 0)
        _ = t.attach(sessionId: "s1", viewer: "A", now: 0)
        t.viewerClosed("A", now: 10)                   // unwatched, grace from 10
        XCTAssertTrue(t.sweep(now: 300).isEmpty)       // 300 - 10 = 290 < 300
        XCTAssertEqual(t.sweep(now: 311), [.graceExpired(sessionId: "s1")])  // 301 > 300
        XCTAssertEqual(t.state("s1"), .closed)
    }

    func testIdleGraceGcToClosed() {
        let t = table()
        t.create(sessionId: "s1", windowId: 1, now: 0)   // idle, never attached
        XCTAssertEqual(t.sweep(now: 301), [.graceExpired(sessionId: "s1")])
        XCTAssertEqual(t.state("s1"), .closed)
    }
}
