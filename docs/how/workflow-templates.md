# Workflow Templates

Workflow templates let you save a working graph as a reusable blueprint, create independent instances from it, and refresh instance work units when the template is updated.

## Concepts

| Term | What it is |
|------|-----------|
| **Template** | A saved graph topology + bundled work units. Stored at `.chainglass/templates/workflows/<slug>/`. Git-tracked. |
| **Instance** | An independent copy of a template with its own runtime state. Stored at `.chainglass/instances/<template>/<id>/`. Git-tracked. |
| **Refresh** | Overwrite an instance's work units from its source template. Graph topology is unchanged — only unit content (prompts, scripts) is updated. |

## How It Works

```
Working Graph                    Template                         Instance
(build + iterate)                (save as reusable)               (independent copy)

.chainglass/data/workflows/      .chainglass/templates/workflows/ .chainglass/instances/
  my-graph/                        my-template/                     my-template/sprint-42/
    graph.yaml            ──save──▶  graph.yaml            ──inst──▶  graph.yaml
    nodes/*/node.yaml     from       nodes/*/node.yaml     anti      nodes/*/node.yaml
    state.json (runtime)             units/ (bundled)       ate       units/ (copied)
                                                                      state.json (fresh)
                                                                      instance.yaml (metadata)
```

1. **Build a graph** using `cg wf create`, `cg wf node add`, `cg wf node set-input`
2. **Save as template** — captures graph topology + bundles all referenced work units
3. **Instantiate** — creates an independent copy with fresh runtime state
4. **Refresh** (optional) — updates instance units when the template changes

## Directory Layout

```
.chainglass/
├── templates/workflows/<slug>/       ← Git-tracked templates
│   ├── graph.yaml                    ← Graph topology (lines, nodes)
│   ├── nodes/<id>/node.yaml          ← Node config (unit ref, input wiring)
│   └── units/<slug>/                 ← Bundled work units
│       ├── unit.yaml
│       ├── prompts/main.md
│       └── scripts/main.sh
│
├── instances/<template>/<id>/        ← Git-tracked instances (all data)
│   ├── instance.yaml                 ← Metadata (template source, units)
│   ├── graph.yaml                    ← Copied from template
│   ├── state.json                    ← Runtime state (pending → complete)
│   ├── nodes/<id>/                   ← Node config + outputs
│   │   ├── node.yaml
│   │   ├── outputs/                  ← Agent-produced deliverables
│   │   └── events.json               ← Node event log
│   └── units/<slug>/                 ← Copied work units
│
└── data/workflows/<slug>/            ← Gitignored scratch graphs
    ├── graph.yaml
    ├── state.json
    └── nodes/
```

**Key distinction**: Templates and instances are Git-tracked. Working graphs under `data/` are gitignored scratch work.

## CLI Commands

### Save a working graph as a template

```bash
cg template save-from <graph-slug> --as <template-slug>
```

Copies graph.yaml + nodes/*/node.yaml, strips runtime state (state.json, outputs, events), bundles all referenced work units.

### List templates

```bash
cg template list
```

### Show template details

```bash
cg template show <template-slug>
```

Shows graph structure, node-to-unit mapping, and bundled units.

### Create an instance

```bash
cg template instantiate <template-slug> --id <instance-id>
```

Creates an independent copy with fresh `state.json` (pending status). The instance is immediately ready for orchestration.

### List instances

```bash
cg template instances <template-slug>
```

### Refresh instance units

```bash
cg template refresh <template-slug>/<instance-id>
```

Overwrites all work units in the instance from the template. Graph topology is not changed — only unit content (prompts, scripts) is updated.

If the instance has an active run (`in_progress` state), a warning is shown. Use `--force` to suppress the warning.

## Refresh Workflow

Refresh is useful when you update a template's prompts or scripts and want existing instances to pick up the change:

1. Edit the template's unit files (e.g., update a prompt in `templates/workflows/my-tpl/units/spec-writer/prompts/main.md`)
2. Run `cg template refresh my-tpl/sprint-42`
3. The instance's `units/spec-writer/` is replaced with the template's version
4. `instance.yaml` timestamps are updated

**What refresh does NOT do**: It does not change graph topology (lines, nodes, wiring). If you add a new node to the template after instantiation, existing instances won't get it via refresh. Create a new instance instead.

## Git Integration

Everything is Git-tracked by default:

- **Templates** at `.chainglass/templates/workflows/` — share across branches via normal merge
- **Instances** at `.chainglass/instances/` — including runtime state and outputs
- **No special tooling** — standard `git add`, `git commit`, `git merge`

Templates created on one branch are available on other branches after merge. Instance outputs (specs, code, reviews) are work product that belongs in the repo alongside the code.

## Generating Templates from Fixtures

For repeatable template generation from test fixtures:

```bash
npx tsx scripts/generate-templates.ts                    # Generate all
npx tsx scripts/generate-templates.ts --fixture=smoke    # Generate one
```

This builds graphs imperatively, saves them as templates, and copies the result to `.chainglass/templates/workflows/`.
