# Event Popper / Question Popper

> **Event Popper** is the generic external event system. **Question Popper** is the first concept built on it.

## Overview

Event Popper lets any process (CLI tools, AI agents, scripts) communicate with a human through the Chainglass web UI via localhost HTTP API. Question Popper provides a first-class question-and-answer experience on top of it, plus fire-and-forget alerts.

**Architecture**:
1. **CLI** calls `POST /api/event-popper/ask-question` on the local Chainglass server
2. **Server** stores the question on disk, emits SSE event to connected browsers
3. **Web UI** shows a glowing indicator, toast notification, and overlay panel
4. **Human** answers via the overlay; answer flows back through the API
5. **CLI** polls `GET /api/event-popper/question/{id}` and receives the answer

```
CLI Agent ──POST──▶ Server ──SSE──▶ Browser UI
                                      │
CLI Agent ◀──GET───  Server ◀──POST── Human answers
```

## Prerequisites

- Chainglass dev server running: `just dev`
- CLI built and linked: `just install` (or `pnpm build` in the CLI package)

## Quick Start

### Ask a question (blocks until answered)

```bash
cg question ask --type confirm --text "Deploy to production?"
# Blocks for up to 10 minutes. When human answers:
# {"questionId":"...","status":"answered","answer":{"answer":true,"text":null},...}
```

### Send a fire-and-forget alert

```bash
cg alert send --text "Deployment complete" --description "v2.1 deployed to prod at 14:32"
# Returns immediately: {"alertId":"..."}
```

### Non-blocking question (get answer later)

```bash
# Ask without blocking
QID=$(cg question ask --type text --text "What branch?" --timeout 0 | jq -r .questionId)

# ... do other work ...

# Check back later
cg question get "$QID"
```

### Full CLI reference

```bash
cg question --help   # Comprehensive usage, all options, examples
cg alert --help      # Alert-specific usage
```

## Question Types

| Type | Input | Answer Type | Example |
|------|-------|-------------|---------|
| `text` | Textarea | `string` | `--type text --text "What should we name it?"` |
| `single` | Radio buttons | `string` | `--type single --text "Pick DB" --options "Postgres,MySQL,SQLite"` |
| `multi` | Checkboxes | `string[]` | `--type multi --text "Which tests?" --options "unit,integration,e2e"` |
| `confirm` | Yes/No buttons | `boolean` | `--type confirm --text "Deploy?"` |

All types include an additional freeform text field for the human to add context.

## Question Chaining

Agents can create multi-turn conversations by linking follow-up questions:

```bash
# First question
QID=$(cg question ask --type text --text "What framework?" --timeout 0 | jq -r .questionId)

# Follow-up referencing the first
cg question ask --type confirm --text "You said React — use Next.js?" --previous "$QID"
```

The UI renders linked questions as a conversation timeline.

## Response Statuses

| Status | Meaning | Agent Action |
|--------|---------|-------------|
| `answered` | Human provided an answer | Parse `answer` field |
| `needs-clarification` | Human needs more info | Re-ask with more context via `--previous` |
| `dismissed` | Human skipped the question | Proceed without answer or ask differently |
| `pending` | Not yet answered | Keep polling or check back later |

## API Endpoints

All endpoints are on the local Chainglass server (discovered via `.chainglass/server.json`).

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/event-popper/ask-question` | POST | localhost | Submit a question |
| `/api/event-popper/send-alert` | POST | localhost | Submit an alert |
| `/api/event-popper/question/{id}` | GET | localhost or session | Get question status/answer |
| `/api/event-popper/answer-question/{id}` | POST | localhost or session | Submit an answer |
| `/api/event-popper/dismiss/{id}` | POST | localhost or session | Dismiss a question |
| `/api/event-popper/clarify/{id}` | POST | localhost or session | Request clarification |
| `/api/event-popper/acknowledge/{id}` | POST | localhost or session | Mark alert as read |
| `/api/event-popper/list` | GET | localhost or session | List all items |

## Two-Domain Architecture

| Domain | Type | Purpose |
|--------|------|---------|
| `_platform/external-events` | Infrastructure | Generic plumbing: envelope schemas, GUID generation, port discovery, localhost guard, SSE channel |
| `question-popper` | Business | First-class Q&A: payload schemas, service, CLI commands, API routes, overlay UI, chain resolution |

## Web UI

- **Indicator**: Green glowing question mark (top-right) when items are outstanding
- **Overlay panel**: Click indicator to open. Two tabs: Outstanding (actionable) and History (all past items)
- **Answer form**: Type-appropriate input matching the question type
- **Notifications**: Toast (in-app) + desktop (Notification API) on new items
- **Conversation chains**: Follow-up questions render as a threaded timeline

## Data Storage

Questions and alerts are stored in `.chainglass/data/event-popper/{id}/` with `in.json` (request) and `out.json` (response). Data persists across server restarts via rehydration on boot.
