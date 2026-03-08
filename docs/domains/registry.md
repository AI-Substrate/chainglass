# Domain Registry

| Domain | Slug | Type | Parent | Created By | Status |
|--------|------|------|--------|------------|--------|
| Workspace URL | _platform/workspace-url | infrastructure | _platform | extracted (Plan 041 Phase 2) | active |
| File Operations | _platform/file-ops | infrastructure | _platform | extracted (pre-Plan 041) | active |
| Viewer | _platform/viewer | infrastructure | _platform | extracted (Plan 006-web-extras) | active |
| Events | _platform/events | infrastructure | _platform | extracted (Plans 019, 023, 027); renamed Plan 045 | active |
| Panel Layout | _platform/panel-layout | infrastructure | _platform | extracted (Plan 041 workshops) | active |
| File Browser | file-browser | business | — | Plan 041 | active |
| Workspace | workspace | business | — | extracted (Plan 069) | active |
| SDK | _platform/sdk | infrastructure | _platform | Plan 047 — USDK | active |
| Settings | _platform/settings | infrastructure | _platform | Plan 047 — USDK Phase 5 | active |
| Positional Graph | _platform/positional-graph | infrastructure | _platform | extracted (Plan 048) | active |
| Workgraph (Legacy) | _platform/workgraph | infrastructure | _platform | extracted (Plan 048) | deprecated |
| Workflow UI | workflow-ui | business | — | Plan 050 | active |
| State | _platform/state | infrastructure | _platform | Plan 053 — GlobalStateSystem | active |
| Dev Tools | _platform/dev-tools | infrastructure | _platform | Plan 056 — State DevTools Panel | active |
| Work Unit Editor | 058-workunit-editor | business | — | Plan 058 | active |
| Agents | agents | business | — | Plan 059 — Fix Agents (extracted) | active |
| Work Unit State | work-unit-state | business | — | Plan 059 — Fix Agents (new) | active |
| Workflow Events | workflow-events | business | — | Plan 061 — WorkflowEvents (new) | active |
| Terminal | terminal | business | — | Plan 064 | active |
| Activity Log | activity-log | business | — | Plan 065 | active |
| Auth | _platform/auth | infrastructure | _platform | Plan 063-login | active |

## Domain Types

- **business**: User-facing business capability
- **infrastructure**: Cross-cutting technical capability serving other domains

## Domain Statuses

- **active**: In use and accepting changes
- **deprecated**: Being phased out (note successor domain)
- **archived**: Code remains but is no longer modified

## Notes

- **_platform/workgraph**: Removed from web app in Plan 050 Phase 7. Package remains for CLI consumers (`cg wg`, `cg unit`). Successor: `_platform/positional-graph`.
