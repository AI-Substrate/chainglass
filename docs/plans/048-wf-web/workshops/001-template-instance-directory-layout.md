# Workshop: Template/Instance Directory Layout

**Type**: Storage Design
**Plan**: 048-wf-web
**Spec**: [wf-web-spec.md](../wf-web-spec.md)
**Created**: 2026-02-25
**Status**: Superseded — Workshop 002 revised the template creation model

> **Note**: This workshop's `workflow.yaml` declarative format and separate `cg wf activate` command were **superseded by [Workshop 002](002-template-creation-flow-and-node-identity.md)**. Templates are now saved FROM working graph instances using `cg template save-from`, reusing existing `graph.yaml` + `nodes/*/node.yaml` — no new declarative format or parser needed. The directory layout and instance structure from this workshop remain valid; only the template creation flow and `workflow.yaml` schema sections are superseded.

**Related Documents**:
- [Research Dossier](../research-dossier.md)
- [ADR-0012: Workflow Domain Boundaries](../../../adr/adr-0012-workflow-domain-boundaries.md)
- [Positional Graph Domain](../../../domains/_platform/positional-graph/domain.md)
- Static environment reference: `/tmp/048-wf-static-review/` (run script to recreate)

**Domain Context**:
- **Primary Domain**: `_platform/positional-graph` (owns graph execution, work unit loading)
- **Related Domains**: `_platform/file-ops` (IFileSystem, IPathResolver for all I/O)

---

## Purpose

Design the on-disk directory layout for workflow templates, work unit templates, workflow instances, and work unit instances within `.chainglass/` paths. This is the single highest-impact design decision in Plan 048.

## How the System Actually Works (Ground Truth)

A **workflow** in the positional graph system consists of two things:

### 1. Work Units (the building blocks)

Each work unit is a **self-contained directory** with everything needed to execute:

```
<slug>/
├── unit.yaml           ← definition: type, inputs, outputs, config
├── prompts/            ← agent units: prompt templates
│   └── main.md
└── scripts/            ← code units: executable scripts
    └── main.sh
```

Three types: `agent` (has prompts), `code` (has scripts), `user-input` (just YAML config).

### 2. Graph (the topology + wiring)

The graph defines **lines** (execution tiers), **nodes** (referencing work units by slug), and **input wiring** (connecting node outputs to node inputs):

```
<graph-slug>/
├── graph.yaml          ← lines → node IDs (the topology)
├── state.json          ← runtime execution state (node statuses, questions)
└── nodes/
    └── <node-id>/
        └── node.yaml   ← unit_slug, input wiring, orchestrator settings
```

Nodes reference work units by `unit_slug`. Each `node.yaml` wires inputs:
```yaml
id: "spec-writer-c3d"
unit_slug: "spec-writer"
inputs:
  requirements: { from_node: "human-input-a1b", from_output: "requirements" }
```

### Key Facts

- **No phases.** Lines are execution tiers. Nodes sit on lines.
- **No wf.yaml.** The old phases system is being removed entirely.
- **Work units are global singletons today** — stored at `.chainglass/units/<slug>/` and referenced by slug. Nodes don't contain their own copy of the unit.
- **Graph data is runtime state** — `state.json` tracks execution progress. `graph.yaml` + `nodes/*/node.yaml` define structure.

---

## Design Constraints (from Spec Clarifications)

| Constraint | Source | Impact |
|-----------|--------|--------|
| Old workgraph system is being fully removed | Clarification Q8 | No backward compat needed |
| Instances are self-contained — no fallback to global templates | Clarification Q7 | Every unit must be copied into the instance |
| Refresh is all-at-once | Clarification Q7b | Refresh replaces all units in an instance |
| All definition files Git-tracked | Spec AC-17 | Templates AND instances are in Git |
| Warn but allow refresh on active runs | Clarification Q7c | No structural lockout |

---

## Current Layout (Being Replaced)

```
.chainglass/
├── units/<slug>/                       ← Work unit definitions (Git-tracked, global)
│   ├── unit.yaml
│   ├── prompts/main.md
│   └── scripts/main.sh
├── data/workflows/<graph-slug>/        ← Graph runtime (.gitignored)
│   ├── graph.yaml
│   ├── state.json
│   └── nodes/<node-id>/node.yaml
└── graphs/                             ← Pod session data
```

**What's wrong**: Work units are global singletons — every graph references the same unit directory. No template/instance separation. No way to bundle a graph definition with its units as a reusable template. No way to have independent copies.

---

## Proposed Layout

```
.chainglass/
├── templates/                                      ← TEMPLATES (Git-tracked)
│   ├── workflows/<slug>/                           ← Workflow template
│   │   ├── workflow.yaml                           ← Graph topology + node wiring (see schema below)
│   │   └── units/                                  ← Work unit templates bundled with this workflow
│   │       ├── <slug>/
│   │       │   ├── unit.yaml
│   │       │   └── prompts/main.md
│   │       └── <slug>/
│   │           ├── unit.yaml
│   │           └── scripts/main.sh
│   │
│   └── units/<slug>/                               ← Standalone work unit templates (shared library)
│       ├── unit.yaml
│       ├── prompts/main.md
│       └── scripts/main.sh
│
├── instances/<workflow-slug>/<instance-id>/         ← INSTANCES (Git-tracked definitions)
│   ├── instance.yaml                               ← Metadata: template source, unit manifest
│   ├── workflow.yaml                               ← Copied from template (may diverge)
│   └── units/                                      ← Work units copied from templates
│       ├── <slug>-<hash>/                           ← Self-contained unit instance
│       │   ├── unit.yaml
│       │   └── prompts/main.md
│       └── <slug>-<hash>/
│           ├── unit.yaml
│           └── scripts/main.sh
│
└── data/                                           ← RUNTIME STATE (.gitignored)
    └── instances/<workflow-slug>/<instance-id>/
        ├── graph.yaml                              ← Created when graph is instantiated from workflow.yaml
        ├── state.json                              ← Node execution state
        └── nodes/<node-id>/
            └── node.yaml                           ← Node config with unit_slug resolved to local unit
```

### Why This Layout

**Templates bundle workflow + units**: A workflow template directory contains `workflow.yaml` (the graph topology and wiring) plus a `units/` subdirectory with all the work units it needs. This is the reusable bundle.

**Standalone unit templates exist too**: `templates/units/` holds work unit templates that can be shared across multiple workflows. Workflow templates reference them or bundle their own copies.

**Instances are self-contained**: `instances/<wf-slug>/<id>/` has its own `workflow.yaml` + `units/` — everything needed to run without the template. Unit directories use `<slug>-<hash>` naming per the node ID convention.

**Runtime data separated**: `data/instances/` holds `graph.yaml`, `state.json`, and `nodes/` — the actual positional graph created from the workflow.yaml when the instance is activated. This is `.gitignored`.

---

## Template Schema: `workflow.yaml`

This replaces the old `wf.yaml`. It's a **declarative graph definition** — lines, nodes, wiring — that can be instantiated into a real positional graph:

```yaml
# .chainglass/templates/workflows/advanced-pipeline/workflow.yaml
name: advanced-pipeline
version: "1.0.0"
description: "6-node, 4-line pipeline: Q&A, parallel fan-out, context chain"

lines:
  - id: line-0
    label: "User Input"
    nodes:
      - id: human-input
        unit: human-input

  - id: line-1
    label: "Spec Writer"
    nodes:
      - id: spec-writer
        unit: spec-writer
        inputs:
          requirements: { from_node: human-input, from_output: requirements }

  - id: line-2
    label: "Parallel Programmers"
    nodes:
      - id: programmer-a
        unit: programmer-a
        orchestrator: { execution: parallel, noContext: true }
        inputs:
          spec: { from_node: spec-writer, from_output: spec }
          language: { from_node: spec-writer, from_output: language_1 }
      - id: programmer-b
        unit: programmer-b
        orchestrator: { execution: parallel, noContext: true }
        inputs:
          spec: { from_node: spec-writer, from_output: spec }
          language: { from_node: spec-writer, from_output: language_2 }

  - id: line-3
    label: "Review & Summary"
    nodes:
      - id: reviewer
        unit: reviewer
        inputs:
          spec: { from_node: spec-writer, from_output: spec }
          code_a: { from_node: programmer-a, from_output: code }
          code_b: { from_node: programmer-b, from_output: code }
          results_a: { from_node: programmer-a, from_output: test_results }
          results_b: { from_node: programmer-b, from_output: test_results }
      - id: summariser
        unit: summariser
        inputs:
          review_a: { from_node: reviewer, from_output: review_a }
          review_b: { from_node: reviewer, from_output: review_b }
          metrics_a: { from_node: reviewer, from_output: metrics_a }
          metrics_b: { from_node: reviewer, from_output: metrics_b }
```

This is a **declarative representation** of what `buildAdvancedPipeline()` does imperatively today via `service.create()` / `addLine()` / `addNode()` / `setInput()`. The template system reads this YAML and replays those service calls to create a real graph.

---

## Instance Schema: `instance.yaml`

```yaml
# .chainglass/instances/advanced-pipeline/sprint-42/instance.yaml
slug: sprint-42
workflow_template: advanced-pipeline
created_at: "2026-02-25T10:00:00Z"
units:
  - slug: human-input
    source: template                    # copied from workflow template's bundled units
    refreshed_at: "2026-02-25T10:00:00Z"
  - slug: spec-writer
    source: template
    refreshed_at: "2026-02-25T10:00:00Z"
  - slug: programmer-a
    source: template
    refreshed_at: "2026-02-25T10:00:00Z"
  - slug: programmer-b
    source: template
    refreshed_at: "2026-02-25T10:00:00Z"
  - slug: reviewer
    source: template
    refreshed_at: "2026-02-25T10:00:00Z"
  - slug: summariser
    source: template
    refreshed_at: "2026-02-25T10:00:00Z"
```

---

## Concrete Example: advanced-pipeline

### Template on disk

```
.chainglass/templates/workflows/advanced-pipeline/
├── workflow.yaml                       ← graph topology (lines, nodes, wiring)
└── units/
    ├── human-input/
    │   └── unit.yaml
    ├── spec-writer/
    │   ├── unit.yaml
    │   └── prompts/main.md
    ├── programmer-a/
    │   ├── unit.yaml
    │   └── prompts/main.md
    ├── programmer-b/
    │   ├── unit.yaml
    │   └── prompts/main.md
    ├── reviewer/
    │   ├── unit.yaml
    │   └── prompts/main.md
    └── summariser/
        ├── unit.yaml
        └── prompts/main.md
```

### Instance after `cg template instantiate advanced-pipeline --id sprint-42`

```
.chainglass/instances/advanced-pipeline/sprint-42/
├── instance.yaml                       ← metadata (template ref, unit manifest)
├── workflow.yaml                       ← copied from template
└── units/
    ├── human-input/                    ← copied from template
    │   └── unit.yaml
    ├── spec-writer/                    ← copied from template
    │   ├── unit.yaml
    │   └── prompts/main.md
    ├── programmer-a/
    │   ├── unit.yaml
    │   └── prompts/main.md
    ├── programmer-b/
    │   ├── unit.yaml
    │   └── prompts/main.md
    ├── reviewer/
    │   ├── unit.yaml
    │   └── prompts/main.md
    └── summariser/
        ├── unit.yaml
        └── prompts/main.md
```

### Runtime data after graph activation (`.gitignored`)

```
.chainglass/data/instances/advanced-pipeline/sprint-42/
├── graph.yaml                          ← positional graph created from workflow.yaml
├── state.json                          ← execution state
└── nodes/
    ├── human-input-a1b/node.yaml       ← unit_slug points to instance-local unit
    ├── spec-writer-c3d/node.yaml
    ├── programmer-a-e5f/node.yaml
    ├── programmer-b-17a/node.yaml
    ├── reviewer-29b/node.yaml
    └── summariser-3dc/node.yaml
```

---

## Operations

### Instantiate Workflow

1. Read `templates/workflows/<slug>/workflow.yaml`
2. Copy `workflow.yaml` → `instances/<slug>/<id>/workflow.yaml`
3. Copy each unit from `templates/workflows/<slug>/units/<unit>/` → `instances/<slug>/<id>/units/<unit>/`
4. Write `instances/<slug>/<id>/instance.yaml` with manifest

### Activate Instance (Create Graph)

1. Read `instances/<slug>/<id>/workflow.yaml`
2. Call `service.create()`, `addLine()`, `addNode()`, `setInput()` to build the positional graph
3. Node `unit_slug` resolves to `instances/<slug>/<id>/units/<unit>/` (self-contained)
4. Graph runtime data written to `data/instances/<slug>/<id>/`

### Refresh Work Units

1. Read `instances/<slug>/<id>/instance.yaml` to get unit list
2. For each unit: `rm -rf instances/.../units/<slug>/` → `cp -r templates/workflows/<wf>/units/<slug>/`
3. Update `refreshed_at` timestamps in `instance.yaml`
4. Warn if active run detected

---

## Git Behavior

### What Gets Tracked

| Path | Git Status | Contents |
|------|-----------|----------|
| `.chainglass/templates/` | Tracked | Workflow definitions + bundled unit templates |
| `.chainglass/instances/` | Tracked | Instance definitions + copied units + instance.yaml |
| `.chainglass/data/` | **Ignored** | Graph runtime (state.json, node execution, outputs) |

### Example `git diff` After Template Prompt Change

```diff
diff --git a/.chainglass/templates/workflows/advanced-pipeline/units/spec-writer/prompts/main.md
   Always ask about testing strategy too.
```

Instances are **not affected** until explicitly refreshed.

### Merge Conflict Risk

| Scenario | Risk | Reason |
|----------|------|--------|
| Two branches modify same template | Normal | Same file, standard Git |
| Two branches create different instances | None | Different directories |
| Two branches refresh same instance | Low | Only timestamps might conflict |

---

## Migration from Current Layout

| Current Path | New Path | Action |
|-------------|----------|--------|
| `.chainglass/units/<slug>/` | `.chainglass/templates/units/<slug>/` (standalone) or bundled into workflow template | Move |
| `.chainglass/data/workflows/<slug>/` | `.chainglass/data/instances/<wf>/<id>/` | Restructure |
| `dev/test-graphs/<fixture>/units/` | `.chainglass/templates/workflows/<fixture>/units/` | Convert fixtures to templates |
| Graph setup code (imperative `addNode`/`setInput`) | `workflow.yaml` (declarative) | New capability |

### withTestGraph Migration

```typescript
// OLD: copies fixtures to .chainglass/units/, graph built imperatively
await withTestGraph('advanced-pipeline', async (tgc) => {
  await buildAdvancedPipeline(tgc.service, tgc.ctx, slug);
  // ...
});

// NEW: reads workflow.yaml, instantiates template, creates graph from definition
await withTemplateWorkflow('advanced-pipeline', 'test-run', async (ctx) => {
  // Template instantiation handles copy + graph creation
  // ...
});
```

---

## Open Questions

### Q1: `<slug>-<hash>` naming for unit instances?

The user mentioned `wf/workunits/<slug>-<hash>`. The current node ID system uses `<unitSlug>-<hex3>`. Should unit instance directories also use hash suffixes?
- **Option A**: Unit instances use plain slug names (same as template). Simpler, matches source.
- **Option B**: Unit instances use `<slug>-<hash>` for uniqueness. Required if multiple instances of the same unit exist in one workflow.

**Recommendation**: Option A for now — one unit per slug per workflow. If a workflow needs two instances of the same unit template, that's a future extension.

### Q2: Standalone unit templates vs bundled only?

Should `templates/units/` exist as a shared library, or should units ONLY live bundled inside workflow templates?
- **Option A**: Both — `templates/units/` for shared library, workflow templates can bundle or reference
- **Option B**: Bundled only — every workflow template contains all its units

**Recommendation**: Option A — standalone templates enable reuse across workflows. Workflow templates can either bundle units locally or reference standalone templates during instantiation.

---

## CLI Commands (Proposed)

```bash
# Templates
cg template list                                    # List all workflow templates
cg template show <wf-slug>                          # Show template structure
cg template create <wf-slug>                        # Scaffold a new workflow template

# Instances
cg template instantiate <wf-slug> --id <inst-id>    # Create instance from template
cg template instances <wf-slug>                     # List instances of a workflow
cg template refresh <wf-slug>/<inst-id>             # Refresh all units from template

# Activation
cg wf activate <wf-slug>/<inst-id>                  # Create positional graph from instance
```
