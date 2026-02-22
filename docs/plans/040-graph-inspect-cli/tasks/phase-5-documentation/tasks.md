# Phase 5: Documentation — Tasks & Alignment Brief

**Spec**: [graph-inspect-cli-spec.md](../../graph-inspect-cli-spec.md)
**Plan**: [graph-inspect-cli-plan.md](../../graph-inspect-cli-plan.md)
**Date**: 2026-02-22

---

## Executive Briefing

### Purpose
The `cg wf inspect` command works but has no documentation. This phase creates a usage guide so developers can discover and use all 5 output modes without reading source code.

### What We're Building
A `docs/how/graph-inspect.md` guide covering:
- All 5 modes: default, `--node`, `--outputs`, `--compact`, `--json`
- Real examples from the advanced-pipeline E2E run
- `jq` recipes for common queries (find failed nodes, extract outputs, etc.)
- Live-watching pattern with `watch`

### User Value
A developer new to the project can read one doc and know exactly how to debug any workflow state.

---

## Objectives & Scope

### Goals
- ✅ Create `docs/how/graph-inspect.md` with all 5 modes documented
- ✅ Include real output examples
- ✅ `jq` recipes for scripting
- ✅ Tips: live-watching, filtering log noise

### Non-Goals
- ❌ API reference docs (types are self-documenting)
- ❌ Architecture docs (covered by plan/workshops)
- ❌ Updating README.md

---

## Pre-Implementation Audit

### Summary
| File | Action | Origin | Modified By | Recommendation |
|------|--------|--------|-------------|----------------|
| `docs/how/graph-inspect.md` | Create | New | — | keep-as-is |

### Compliance Check
No violations. Follows existing `docs/how/` flat file pattern.

---

## Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Subtasks | Notes |
|--------|------|------|----|------|-------------|-------------------|------------|----------|-------|
| [ ] | T001 | Create `docs/how/graph-inspect.md` with all 5 modes, real examples, jq recipes, and watch tip | 2 | Doc | – | `/home/jak/substrate/033-real-agent-pods/docs/how/graph-inspect.md` | File exists, covers default/node/outputs/compact/json modes, has jq recipes | – | plan-scoped |
| [ ] | T002 | `just fft` passes | 1 | Gate | T001 | — | 0 regressions | – | Safety gate |

---

## Alignment Brief

### Implementation Outline

1. **T001**: Write the guide with sections:
   - Overview (what inspect does vs status)
   - Quick Start (`cg wf inspect <slug>`)
   - Output Modes (one section per mode with real example)
   - Live Watching (`watch -n 2 'cg wf inspect ... 2>&1 | grep -v "^{\"level"'`)
   - jq Recipes (failed nodes, output values, node count, etc.)
2. **T002**: `just fft`

### Ready Check
- [ ] **Human GO/NO-GO**

---

## Discoveries & Learnings

_Populated during implementation by plan-6._

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| | | | | | |
