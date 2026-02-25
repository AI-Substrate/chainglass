# Flight Plan: Phase 6 — SDK Wraps, Go-to-Line & Polish

**Phase**: Phase 6: SDK Wraps, Go-to-Line & Polish
**Plan**: [usdk-plan.md](../../usdk-plan.md)
**Tasks**: [tasks.md](./tasks.md)
**Status**: Ready

---

## Departure → Destination

**Where we are**: The SDK infrastructure is complete — command registry, settings store, keybinding service, command palette, keyboard shortcuts, and settings page all work. But only demo settings and internal SDK commands are registered. No real domain has published its features to the SDK yet. File navigation doesn't support go-to-line. No developer documentation exists.

**Where we're going**: File-browser and events domains publish their features as SDK contributions (commands, settings, keybindings). Users can type `src/index.ts:42` in the explorer bar and jump directly to line 42. Developers have guides for publishing and consuming SDK features. An ADR explains the architecture decisions behind the USDK.

**Concrete outcomes**:
- `>Open File` in palette navigates to a file (with path param)
- `>Copy Path` copies current file path to clipboard
- `>Show Toast` triggers a toast via SDK command
- `src/index.ts:42` or `src/index.ts#L42` in explorer bar → opens file at line 42
- `?file=src/index.ts&line=42` deep links directly to a line
- Settings page shows file-browser settings (showHiddenFiles, previewOnClick)
- `docs/how/sdk/` has publishing + consuming guides
- ADR-0010 documents all USDK architecture decisions

---

## Domain Context

### Domains We Change

| Domain | Relationship | Changes | Key Files |
|--------|-------------|---------|-----------|
| `file-browser` | **modify** | SDK contribution (3 commands, 2 settings), go-to-line parsing, CodeMirror scroll, line URL param | `sdk/contribution.ts`, `sdk/register.ts`, `file-path-handler.ts`, `code-editor.tsx`, `file-browser.params.ts` |
| `_platform/events` | **modify** | SDK contribution (toast.show, toast.dismiss) | `sdk/contribution.ts`, `sdk/register.ts` |
| `_platform/sdk` | **extend** | Wire domain registrations in bootstrap, move demo settings | `sdk-bootstrap.ts` |
| docs | **create** | Publishing guide, consuming guide, ADR-0010 | `docs/how/sdk/`, `docs/adr/` |

### Domains We Depend On

| Domain | Contract | Usage |
|--------|----------|-------|
| `_platform/sdk` (Phases 1-5) | Full IUSDK surface | Register commands, settings, keybindings |
| `_platform/panel-layout` (Phase 3) | `ExplorerPanelHandle` | openFile/openFileAtLine handlers |
| sonner (npm) | `toast()` | Toast command handler |

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff

    state "1: file-browser contribution" as S1
    state "2: events/toast contribution" as S2
    state "3: Go-to-line parsing" as S3
    state "4: CodeMirror scroll" as S4
    state "5: Wire registrations" as S5
    state "6: SDK docs" as S6
    state "7: ADR" as S7

    [*] --> S1
    [*] --> S2
    S3 --> S1
    S4 --> S1
    S1 --> S5
    S2 --> S5
    S5 --> S6
    S5 --> S7
    S6 --> [*]
    S7 --> [*]

    class S1,S2,S3,S4,S5,S6,S7 pending
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [ ] Create file-browser SDK contribution (2 commands, 2 settings) (T001)
- [ ] Create events/toast SDK contribution (T002)
- [ ] Implement go-to-line URL param + path parsing (T003)
- [ ] Expose CodeMirror scroll-to-line via prop (T004)
- [ ] Wire domain registrations into bootstrap (T005)
- [x] Create USDK Architecture Decision Record (T007)
- [ ] Create SDK developer documentation (T006)

---

## Architecture: Before & After

```mermaid
flowchart TD
    classDef before fill:#FFCDD2,stroke:#C62828,color:#000
    classDef after fill:#C8E6C9,stroke:#2E7D32,color:#000

    subgraph Before["Before Phase 6"]
        B_FB["file-browser<br/>No SDK commands<br/>Direct toast/nav calls"]:::before
        B_EV["events<br/>toast() direct import<br/>No SDK wrapping"]:::before
        B_SDK["SDK<br/>Demo settings only<br/>No domain contributions"]:::before
    end

    subgraph After["After Phase 6"]
        A_FB["file-browser<br/>3 commands + 2 settings<br/>go-to-line support"]:::after
        A_EV["events<br/>toast.show + toast.dismiss<br/>SDK commands"]:::after
        A_SDK["SDK<br/>Domain contributions<br/>Real settings"]:::after
        A_DOCS["docs/how/sdk/<br/>Publishing + Consuming<br/>ADR-0010"]:::after

        A_FB --> A_SDK
        A_EV --> A_SDK
        A_SDK --> A_DOCS
    end
```

---

## Acceptance Criteria

- [ ] AC-25: file-browser publishes 3+ commands, 2+ settings
- [ ] AC-26: events publishes toast.show, toast.dismiss
- [ ] AC-27: Separate contribution manifest from handler binding
- [ ] AC-28: toast.show produces same toast as direct toast()
- [ ] AC-29: file-browser.openFile navigates to file
- [ ] AC-31: openFileAtLine scrolls to specified line
- [ ] AC-32: Explorer bar accepts `path:42` / `path#L42` syntax

---

## Goals & Non-Goals

**Goals**: Domain SDK contributions (file-browser + events), go-to-file+line, developer documentation, USDK ADR.

**Non-Goals**: No plugin system, no settings import/export, no symbol search implementation, no cross-device sync, no color/emoji setting controls.

---

## Checklist

| ID | Task | CS |
|----|------|----|
| T001 | file-browser SDK contribution | CS-3 |
| T002 | events/toast SDK contribution | CS-2 |
| T003 | Go-to-line URL param + parsing | CS-2 |
| T004 | CodeMirror scroll-to-line | CS-3 |
| T005 | Wire domain registrations | CS-2 |
| T006 | SDK developer documentation | CS-2 |
| T007 | USDK ADR | CS-2 |
