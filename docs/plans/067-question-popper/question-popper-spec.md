# Event Popper

> **Event Popper** is the generic external event in/out system. **Question Popper** is the first concept built on it.

📚 This specification incorporates findings from `research-dossier.md` (73 findings across 8 research subagents).

## Research Context

The codebase has a rich ecosystem of infrastructure to leverage: SSE broadcasting (`_platform/events`), global state (`_platform/state`), overlay panels (`activity-log`, `agents`), and CLI command helpers. The activity-log domain (Plan 065) is the closest structural template for the overlay UI pattern. The existing workflow-events Q&A system (Plan 061) is a **completely separate system** tied to graph nodes; Question Popper shares zero code and zero coupling with it. 16 prior learnings from Plans 054, 059, 060, 061, and 065 inform the design — particularly around notification-fetch patterns, HMR-safe singletons, and strict Zod validation.

---

## Summary

**What**: **Event Popper** — a general-purpose external event system that lets any CLI tool, AI agent, or script communicate with a human through the Chainglass web UI. **Question Popper** is the first concept built on it, providing a first-class question-and-answer experience.

**Why**: Today, agents can only ask questions within a running workflow graph (via `IWorkflowEvents`). But agents operating outside of workflows — running from the terminal, doing code reviews, performing ad-hoc tasks — have no way to pause and ask the user a question. Question Popper fills this gap: the CLI calls a localhost API on the Chainglass server, the server stores the question and pushes it to the web UI via SSE, the human answers through the overlay, and the CLI polls for the answer. The `cg question ask` command blocks until answered (or times out), so agents don't need to understand the underlying mechanics.

**The system is intentionally more general than just questions.** The Event Popper infrastructure (`_platform/external-events`) provides generic envelope schemas, port discovery, and a localhost-only API guard that future first-class concepts (approvals, notifications, progress reports) can build on without redesign. Questions are the first and exemplar concept, living in the `question-popper` business domain on top.

---

## Goals

- **Any process can ask a question**: CLI tools, AI agents (Claude Code, Copilot, any LLM), shell scripts, background processes — anything that can call the localhost API (via `cg question ask` or direct HTTP)
- **Non-intrusive notification**: When a question arrives, the user sees it without losing their current context (no page takeover, no modal steal)
- **Blocking CLI with configurable timeout**: The `cg question ask` command blocks by default (up to 10 minutes), returns the answer when available, or returns the question GUID on timeout so the caller can check back later
- **Question chaining**: Agents can have multi-turn conversations by creating follow-up questions linked to previous ones — the UI renders these as a conversation thread
- **Rich context**: Questions can include a detailed markdown description (potentially pages of information) that the user can scroll through
- **Multiple question types**: Text input, single choice, multiple choice, yes/no confirmation — plus a freeform text field always available
- **Real-time UI updates**: Questions appear instantly via SSE; answers flow back in real time
- **Historical record**: All questions and answers are preserved and browsable — the user can review past Q&A sessions
- **Agent-friendly**: CLI `--help` is self-documenting; a minimal `CLAUDE.md` entry directs agents to it

---

## Non-Goals

- **Not a replacement for workflow Q&A**: The existing `IWorkflowEvents` system for in-graph questions remains unchanged. Question Popper is a sibling, not a successor
- **Not a chat system**: While question chaining looks like chat, it's not bidirectional real-time messaging. Each "turn" is a discrete question with a discrete answer
- **Not a general notification bus**: Event Popper supports targeted attention requests (questions and alerts). For fire-and-forget system notifications (progress updates, build status), use the existing events/toast system
- **Not persistent across workspaces**: Questions live in a worktree's `.chainglass/data/` directory. They don't sync across machines or workspaces
- **No authentication/authorization on questions**: Any local process that can reach the server's localhost API can ask a question. There's no ACL on who can ask or answer. Remote requests are rejected by the localhost guard (requests with `X-Forwarded-For` header are denied to prevent proxy bypass)
- **No server-side question routing**: All questions for a worktree go to whoever has the web UI open for that worktree. There's no user-targeting or routing logic
- **No question priority or SLA**: Questions are shown in arrival order. There's no priority system, escalation, or timeout-based alerts on the UI side

---

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `_platform/external-events` | **NEW** | **create** | Generic event envelope schemas, GUID generation, port discovery (`.chainglass/server.json`), localhost-only API guard, tmux detection utility |
| `question-popper` | **NEW** | **create** | First-class question concept: payload schemas, `IQuestionPopperService`, CLI commands, `/api/event-popper/*` API routes, overlay UI, conversation threading |
| `_platform/events` | existing | **consume** | `ICentralEventNotifier` to emit SSE events from service/API route handlers, `toast()` for notifications |
| `_platform/state` | existing | **consume** | `IStateService` to publish question state from service, `useGlobalState` in UI for reactive counts |
| `_platform/panel-layout` | existing | **consume** | Overlay panel positioning anchor |
| `_platform/sdk` | existing | **consume** | `ICommandRegistry` for toggle keyboard shortcut |

### New Domain Sketches

#### _platform/external-events [NEW — infrastructure]

- **Purpose**: Generic Event Popper infrastructure for external systems (CLI tools, agents, scripts) to communicate with the Chainglass web UI via localhost HTTP API. Provides shared plumbing: envelope schemas, GUID generation, server port discovery, localhost-only security guard. Does NOT own SSE, state, or any concept-specific logic.

- **Boundary Owns**:
  - Generic envelope schemas: `EventPopperRequest`, `EventPopperResponse` (Zod, `.strict()`)
  - GUID generation (timestamp + random suffix)
  - Port discovery: write `.chainglass/server.json` on server boot, read it from CLI
  - Localhost-only guard: middleware that rejects non-localhost requests to `/api/event-popper/*` and bypasses auth for those routes
  - SSE channel registration (`WorkspaceDomain.EventPopper`)
  - Tmux detection utility (`detectTmuxContext()`, `getTmuxMeta()` in `packages/shared`)

- **Boundary Excludes**:
  - SSE infrastructure (owned by `_platform/events` — we emit events through it, not build it)
  - Global state infrastructure (owned by `_platform/state`)
  - Concept-specific payload schemas (owned by consumer domains like `question-popper`)
  - UI, CLI commands, API route handlers (owned by consumer domains)

#### question-popper [NEW — business]

- **Purpose**: First-class question-and-answer experience built on top of Event Popper infrastructure. The exemplar concept domain. Callers interact with typed question/answer APIs (`cg question ask`, `/api/event-popper/ask-question`) and never need to understand the underlying event popper mechanics.

- **Boundary Owns**:
  - Question, answer, alert, clarification payload schemas (Zod, `.strict()`)
  - Composed types (`QuestionIn`, `QuestionOut`, `AlertIn`) — typed views for callers
  - `IQuestionPopperService` interface and `QuestionPopperService` implementation (stores questions in `.chainglass/data/questions/`, emits SSE via `ICentralEventNotifier`, publishes state via `IStateService`)
  - `FakeQuestionPopperService` with inspection helpers
  - Question lifecycle: pending → answered / needs-clarification / dismissed
  - Alert lifecycle: unread → acknowledged
  - CLI commands: `cg question ask/get/answer/list`, `cg alert send`
  - Server API routes: `POST /api/event-popper/ask-question`, `GET /api/event-popper/question/[id]`, `POST /api/event-popper/answer-question/[id]`, `POST /api/event-popper/send-alert`, `GET /api/event-popper/list`, `POST /api/event-popper/dismiss/[id]`, `POST /api/event-popper/acknowledge/[id]`
  - Overlay UI: question mark indicator, question overlay panel, question rendering, answer form, conversation threading
  - State domain registration and publisher for outstanding question/alert counts
  - CLAUDE.md prompt fragment (minimal — directs agents to `--help`)

- **Boundary Excludes**:
  - Generic envelope schemas and GUID generation (owned by `_platform/external-events`)
  - Port discovery and localhost guard (owned by `_platform/external-events`)
  - SSE infrastructure (owned by `_platform/events`)
  - Global state infrastructure (owned by `_platform/state`)
  - Toast rendering (owned by `_platform/events` via sonner)
  - Workflow Q&A (owned by `workflow-events` — completely independent, zero coupling)
  - Agent lifecycle management (owned by `agents` domain)

---

## Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=1, D=1, N=1, F=1, T=2 (total P=8)
- **Confidence**: 0.80
- **Assumptions**:
  - Existing SSE infrastructure (`ICentralEventNotifier`) can emit from API route handlers without architectural changes
  - The overlay mutual exclusion pattern (`overlay:close-all`) works for a new overlay type
  - CLI polling the localhost API every 2s is reliable and low-overhead
  - The server can write `.chainglass/server.json` on boot for CLI port discovery
- **Dependencies**:
  - `_platform/events` SSE broadcasting from API route handlers
  - `_platform/state` domain registration
  - `_platform/panel-layout` overlay slot availability
  - WorkspaceDomain constants must be extensible (additive change)
- **Risks**:
  - Server crash (SIGKILL/OOM) leaves stale `server.json` on disk (mitigated by stale PID detection in CLI port discovery)
  - HMR during development may cause double-initialization (mitigated by globalThis guard)
  - Multiple browser tabs answer same question simultaneously (mitigated by server-side "already answered" guard)
  - Server not running when CLI tries to ask (mitigated by clear error message with instructions)
- **Phases** (suggested):
  1. Event Popper infrastructure (schemas, GUID, port discovery, localhost guard, tmux)
  2. Question concept types, schemas, service implementation
  3. Server API routes (`/api/event-popper/*`)
  4. CLI commands (`cg question`, `cg alert`)
  5. Overlay UI (indicator, panel, answer form)
  6. Question chaining + conversation threading + history
  7. Agent integration + domain documentation

---

## Acceptance Criteria

### Core File Protocol

1. **AC-01**: When a CLI tool calls `POST /api/event-popper/ask-question` with a valid question payload, the server stores the question, returns a `{ questionId }`, emits an SSE event, and publishes to global state. The question is retrievable via `GET /api/event-popper/question/{id}`.

2. **AC-02**: When the web UI calls `POST /api/event-popper/answer-question/{id}` with a valid answer, the answer is associated with the question. The CLI can retrieve the answer by polling `GET /api/event-popper/question/{id}`. The server emits an SSE event and updates global state.

3. **AC-03**: The API supports two event types via the generic `type` field:
   - **`question`**: Supports four question variants: `text` (freeform), `single` (single choice from options), `multi` (multiple choices from options), and `confirm` (yes/no). All include a `text` field and optional `description` (detailed markdown context). Requires an answer response.
   - **`alert`**: A one-way notification that requests the user's attention but does NOT require an answer. Includes `text` (the headline) and optional `description` (detailed markdown context). No answer expected.

4. **AC-04**: For questions, the API request payload includes: `source` (who asked), `timeout` (how long CLI will block, in seconds), and optional `previousQuestionId` (soft link for chaining). The answer response includes the answer value plus a `status` field: `answered`, `needs-clarification`, or `dismissed`. For alerts, the request payload includes: `source` and `text`; no response answer is expected.

### CLI Experience — Questions

5. **AC-05**: Running `cg question ask --type confirm --text "Deploy to production?"` calls `POST /api/event-popper/ask-question` on the local server (discovered via `.chainglass/server.json`), then polls `GET /api/event-popper/question/{id}` until answered. When answered, it prints the answer JSON to stdout and exits 0.

6. **AC-06**: If `--timeout` is set (default: 600 seconds / 10 minutes), and the timeout elapses before an answer appears, the CLI prints `{ "questionId": "{guid}", "status": "pending" }` to stdout and exits 0. The question remains outstanding in the UI.

7. **AC-07**: If `--timeout 0` is passed, the CLI posts the question and returns immediately with the GUID (no blocking).

8. **AC-08**: Running `cg question get {guid}` calls `GET /api/event-popper/question/{id}`. If answered, prints the answer JSON. If unanswered, prints `{ "questionId": "{guid}", "status": "pending" }`.

9. **AC-09**: Running `cg question list` calls `GET /api/event-popper/list`, showing each item's type, status (pending/answered), source, text, and age.

10. **AC-10**: Running `cg question answer {guid} --answer "yes"` calls `POST /api/event-popper/answer-question/{id}` (useful for testing and scripting).

### CLI Experience — Alerts

11. **AC-11**: Running `cg alert send --text "Finished deployment" --description "Deployed v2.1 to production."` calls `POST /api/event-popper/send-alert`, then returns immediately (fire-and-forget). Prints `{ "alertId": "{guid}" }` to stdout.

12. **AC-12**: Alerts show in `cg question list` alongside questions, distinguished by type.

### CLI Experience — Tmux Context

13. **AC-13**: When the CLI detects it is running inside a tmux session (via `$TMUX` environment variable), it automatically includes the tmux session name, window index, and pane ID in the event's `meta.tmux` field. No flags needed — auto-detected. The detection logic lives as a reusable shared utility (`detectTmuxContext()` in `packages/shared`) so any future CLI feature can use it with a single function call.

14. **AC-14**: When not running in tmux, the `meta.tmux` field is simply absent. `detectTmuxContext()` returns `undefined` when `$TMUX` is not set. The fields are optional and the system works identically without them.

### Web UI — Notification

15. **AC-15**: When a new question or alert is submitted via the API, the server emits an SSE event on the `EventPopper` channel and a toast notification shows briefly. For questions: "Question from {source}: {truncated text}". For alerts: "Alert from {source}: {truncated text}". Both trigger desktop notifications via the Notifications API.

16. **AC-16**: A question mark icon is visible in the top-right area of the screen at all times. When there are outstanding questions OR unread alerts, the icon is large and glows green. When there are no outstanding items, the icon is small and grayed out.

17. **AC-17**: The outstanding count badge includes both unanswered questions and unread alerts.

### Web UI — Overlay Panel

18. **AC-18**: Clicking the question mark icon opens the Question Popper overlay panel. If questions or unread alerts are outstanding, the newest item is shown immediately. If nothing is outstanding, a list of historical items is shown.

19. **AC-19**: The overlay panel does not take over the entire page — the user can dismiss it without answering and return to what they were doing. The panel participates in overlay mutual exclusion (opening it closes any other overlay like agents or activity log).

20. **AC-20**: Questions render their `text` prominently, with a scrollable `description` area below (markdown rendered) if description is provided. Alerts render similarly but with no answer form — just the text, description, and a "Mark Read" button. When `meta.tmux` is present, the overlay shows the tmux session/window context (display-only for now).

21. **AC-21**: For questions, the answer form matches the question type: text input for `text`, radio buttons for `single`, checkboxes for `multi`, yes/no buttons for `confirm`. An additional freeform text field is always available regardless of question type.

22. **AC-22**: A "Needs More Information" option is available on every question. Selecting it calls `POST /api/event-popper/answer-question/{id}` with `status: "needs-clarification"` and the clarification message.

23. **AC-23**: Alerts can be marked as read. Marking an alert calls `POST /api/event-popper/acknowledge/{id}`. The alert no longer counts as outstanding.

### Web UI — Question Chaining

24. **AC-24**: When a question has `previousQuestionId`, the overlay shows the previous question and its answer above the current question — rendering as a conversation thread. Multiple levels of chaining display as sequential turns.

25. **AC-25**: Follow-up questions (those with `previousQuestionId`) trigger their own toast notification and question mark indicator update, just like first-time questions. They are independent questions with independent lifecycle.

### Web UI — History

26. **AC-26**: The overlay panel includes a way to view all past items (questions and alerts, both resolved and pending), sorted newest-first, showing source, text, type, status, and age (e.g., "3 minutes ago", "2 hours ago").

27. **AC-27**: Clicking a historical item expands it to show the full text, description, and answer/status (if resolved), including any conversation chain for questions.

### Real-Time Updates

28. **AC-28**: When a question is answered or an alert is acknowledged (via API), the server emits SSE and updates global state in real time — the indicator updates, the overlay shows the item as resolved, and the badge count decrements. No page refresh required.

29. **AC-29**: When a new item arrives while the overlay is closed, the indicator updates and a toast appears. When the overlay is open, the new item appears in the list in real time.

30. **AC-30**: When a new question or alert arrives, the browser triggers a desktop notification via the Notifications API (if permission granted). This ensures the user is alerted even when focused in another application (e.g., the terminal).

### Dismiss / Skip

31. **AC-31**: The user can dismiss/skip a question without answering it. Dismissing calls `POST /api/event-popper/dismiss/{id}`. The question no longer counts as outstanding (badge decrements, indicator updates), but remains visible in history.

32. **AC-32**: A dismissed question is still visible in the history list, marked with a "dismissed" status. The CLI sees `status: "dismissed"` when checking with `cg question get`.

### Agent Integration

33. **AC-33**: The `CLAUDE.md` prompt fragment for agents is minimal — it tells agents that `cg question` and `cg alert` exist, and directs them to run `cg question --help` for full usage details. The CLI itself carries the heavy documentation, not the agent prompt.

34. **AC-34**: Running `cg question --help` outputs a comprehensive agent-oriented help text that explains: the purpose of the system (why it exists, when to use it), the semantics of each subcommand, all available options with examples, how blocking/timeout works, how to do follow-up questions via chaining, how to handle each response status (`answered`, `needs-clarification`, `dismissed`, `pending`), and when to use `cg question ask` vs `cg alert send`. This help text is detailed enough that an agent reading it can fully understand the system without any other documentation.

35. **AC-35**: Running `cg alert --help` outputs a similar comprehensive help text for the alert concept — when to use alerts vs questions, examples, and the fire-and-forget semantics.

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Server crash leaves stale `server.json` + PID recycling | Medium | Medium | CLI reads PID from server.json, checks if process is alive AND cross-checks `startedAt` timestamp against process start time. If PID alive but started after the recorded time → different process → treat as stale |
| Reverse proxy exposes event-popper routes remotely | Low | High | Localhost guard rejects any request with `X-Forwarded-For` header (presence means proxy is involved). Combined with `request.ip` check for `127.0.0.1`/`::1`. Legitimate CLI calls are direct — no proxy, no header |
| Multiple browser tabs answer same question | Low | Low | Server-side guard: `answerQuestion()` checks question isn't already answered, returns 409 Conflict |
| HMR double-initialization of server.json write | Medium | Low | globalThis initialization guard (proven pattern from Plans 059, 061) |
| Server not running when CLI calls API | Medium | Medium | CLI detects missing/stale server.json or HTTP connection refused → clear error: "Chainglass server not running. Start with: just dev" |
| Large description fields in API payloads | Low | Low | Description is optional; SSE sends only IDs (notification-fetch pattern, full data via GET) |
| Question data accumulates in `.chainglass/data/questions/` | Medium | Low | Future cleanup: purge resolved questions older than N days (not in scope) |
| Phantom-zero outstanding count after server restart | Medium | Medium | `QuestionPopperService` rehydrates from disk on construction — scans for unanswered questions/unread alerts and publishes initial count to `IStateService` |

### Assumptions

- The user has the Chainglass web UI open for the relevant worktree (otherwise questions go unnoticed until they open it)
- The CLI and web server run on the same machine (localhost API calls)
- The server writes `.chainglass/server.json` with its port on boot; CLI reads this for discovery
- A 2-second poll interval is acceptable latency for CLI answer detection
- API request/response payloads are small (< 1MB even with large markdown descriptions)

---

## Resolved Questions

1. **[RESOLVED: Directory cleanup]** Keep indefinitely. Question directories are small (~2 JSON files, a few KB each). Cleanup can be a future feature if accumulation becomes a concern.

2. **[RESOLVED: Multiple worktrees]** Current worktree only. Matches how agents, terminal, and activity-log work. Each browser tab sees questions from its own worktree.

3. **[RESOLVED: CLI output format]** Always JSON. The primary consumers of `cg question ask` are agents and scripts that parse output. No `--json` flag needed — JSON is the default and only output format.

4. **[RESOLVED: Sound/desktop notification]** Use the browser Notifications API to trigger a desktop notification when a question arrives. This ensures the user is alerted even when they're in another application (e.g., the terminal). Toast + green indicator + desktop notification.

5. **[RESOLVED: Question expiry]** Questions remain visible indefinitely after CLI timeout. The CLI timing out just means the CLI process stopped waiting — the question is still valid and answerable. The user can dismiss/skip a question via the UI, which calls `POST /api/event-popper/dismiss/{id}`. This suppresses the question indicator (no longer counts as unanswered) but preserves the record in history. The agent sees `status: "dismissed"` when checking back with `cg question get`.

---

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions | Status |
|-------|------|--------------|---------------|--------|
| Event Popper Request/Response Schema | Data Model | The exact field shapes determine CLI UX, UI rendering, and answer handling | What does the answer response look like for each question type? How is "needs clarification" encoded? Do we version the schema? | **COMPLETED** → [Workshop 001](workshops/001-external-event-schema.md) |
| Question Chaining UX | Integration Pattern | The soft-link chaining via `previousQuestionId` is simple in data but complex in UI. Threading display, notification behavior for follow-ups, chain depth limits, and chain navigation need design | How many turns deep can a chain go? How does the UI paginate long chains? Does the agent see the full chain or just the last response? | Open |
| CLI Blocking Mechanics | CLI Flow | The blocking behavior (poll interval, timeout, partial writes, signal handling, SIGINT behavior) has subtle edge cases that affect reliability | What happens on Ctrl+C during blocking? Should the question be cleaned up? What poll interval balances responsiveness vs CPU? | Open |
