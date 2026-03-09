# Workshop: The Harness Feedback Loop — Agents Improving the Product

**Type**: Integration Pattern
**Plan**: 070-harness-agent-runner
**Created**: 2026-03-09
**Status**: Draft

**Related Documents**:
- [Harness README](../../../harness/README.md)
- [Project Rules: Harness](../../project-rules/harness.md)
- [Agent Runner Spec](../agent-runner-spec.md) — Goal #7: Retrospective Feedback Loop
- [Smoke-test Agent](../../../harness/agents/smoke-test/)
- [FX002 (sourced from retrospective)](../fixes/FX002-smoke-test-retrospective-cli-improvements.md)

**Domain Context**:
- **Primary Domain**: `_platform/harness` (agent infrastructure)
- **Related Domains**: All — the feedback loop touches every domain the harness tests

---

## Purpose

Codify and amplify the **harness feedback loop** — the principle that agents don't just test the product, they actively improve it. Every agent run produces structured, honest feedback. That feedback becomes real fixes. Those fixes make the next agent run better. This creates a virtuous cycle where the product gets better every time an agent touches it.

This workshop documents the philosophy, maps where it lives today, identifies gaps, and prescribes exactly what to add to make this a **defining characteristic** of the Chainglass repo.

## Key Questions Addressed

- What is the feedback loop philosophy and why does it matter?
- Where is it documented today and where are the gaps?
- What exact content needs to be added to each file?
- How do we ensure every new agent inherits this vibe?

---

## The Philosophy

### The Virtuous Cycle

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   Agent runs against the product                            │
│        │                                                    │
│        ▼                                                    │
│   Agent writes honest retrospective                         │
│   "The screenshot command timed out on SSE pages.           │
│    Magic wand: add --wait-until flag"                       │
│        │                                                    │
│        ▼                                                    │
│   Retrospective → Fix task (FX003)                          │
│        │                                                    │
│        ▼                                                    │
│   Fix implemented, tested, shipped                          │
│        │                                                    │
│        ▼                                                    │
│   Next agent run is better                                  │
│   "The screenshot command worked on the first try           │
│    with the new domcontentloaded default"                   │
│        │                                                    │
│        └──────────── loops back ────────────────────────┐   │
│                                                         │   │
└─────────────────────────────────────────────────────────┘   │
                                                              │
          The product improves every time an agent touches it  │
          ◄────────────────────────────────────────────────────┘
```

### Why This Matters

Traditional testing answers: **"Does it work?"**

The harness feedback loop answers: **"Does it work, AND what would make it better?"**

Every agent is a fresh pair of eyes. It discovers friction that humans stop noticing — CLI flags that should have better defaults, error messages that don't suggest fixes, documentation that assumes too much context. The structured retrospective captures this signal in a format that can become a fix task the same day.

**This is not aspirational.** It's already operational:

| Date | Agent Said | What Happened |
|------|-----------|---------------|
| 2026-03-08 | Smoke-test: "There's no `console-logs` command, so I had to write Playwright from scratch" | FX002 added `console-logs` + `screenshot-all` commands (committed `d144c6a`) |
| 2026-03-09 | FX001 harness verification: screenshot command timed out on SSE pages | FX003 proposed to add `--wait-until` flag with `domcontentloaded` default |

### The Three Principles

1. **Every agent writes a retrospective.** Not optional. Not "if you have time." It's a required field in the output schema. The retrospective is the most valuable part of the report.

2. **Retrospectives are specific and actionable.** Not "screenshots were easy." Instead: "The screenshot command's JSON response included the file path in `data.path`, which I could reference directly." Bad feedback is worse than no feedback — it creates false confidence.

3. **Feedback becomes fixes within the same sprint.** A retrospective that sits in a JSON file forever is useless. The workflow is: read retrospective → create FX task → implement → verify with the same agent. Close the loop.

---

## Current State: Where the Vibe Lives Today

### ✅ Already Strong

| File | What It Says | Line(s) |
|------|-------------|---------|
| `harness/agents/smoke-test/prompt.md` | "This is the most important part of the report" | 88 |
| `harness/agents/smoke-test/prompt.md` | magicWand: "If you could add or change one thing..." | 94 |
| `harness/agents/smoke-test/instructions.md` | "This is dogfooding — your experience improves the harness for everyone" | 55 |
| `harness/agents/smoke-test/output-schema.json` | `magicWand` is a **required** field | 98 |
| `docs/project-rules/harness.md` | "The retrospective is the most valuable output" | 258 |
| `docs/project-rules/harness.md` | "This feedback loop drives harness evolution" | 258 |
| `agent-runner-spec.md` | Goal #7: "Retrospective feedback loop" | 30 |
| Agent runner plan | FX002 sourced from smoke-test retrospective (proof it works) | 291 |

### ❌ Gaps

| File | What's Missing |
|------|---------------|
| **CLAUDE.md** | No mention of the feedback loop philosophy. Lists harness commands but not *why* retrospectives matter. An agent reading CLAUDE.md has no idea this vibe exists. |
| **harness/README.md** | Has agent definition structure but no "Philosophy" or "Why Retrospectives Matter" section. The word "dogfooding" doesn't appear. |
| **Agent creation docs** | No template or checklist that says "all new agents MUST include retrospective fields." It's a convention from smoke-test, not an enforced pattern. |
| **Root README.md** | No mention of the harness feedback loop as a repo-level differentiator. |
| **No "How Retrospectives Become Fixes" guide** | The process exists (FX002 proves it) but isn't documented anywhere. A new developer wouldn't know how to close the loop. |

---

## Prescribed Updates

### Update 1: CLAUDE.md — Add Feedback Loop Section

Add after the existing Harness Commands section:

```markdown
### Harness Feedback Loop

The harness isn't just a testing tool — it's a product improvement engine. Every harness agent writes a structured retrospective that captures what worked, what was confusing, and a "magic wand" suggestion. These retrospectives become real fix tasks (FX) that ship in the same sprint.

**The cycle**: Agent runs → honest retrospective → FX task → implementation → better next run.

This is operational, not aspirational. FX002 (`console-logs` + `screenshot-all` commands) was sourced directly from the smoke-test agent's first retrospective. FX003 (`--wait-until` flag) was sourced from FX001 harness verification.

**When creating harness agents**, always include:
- A retrospective section in `prompt.md` asking what worked, what was confusing, and a magic wand wish
- `magicWand` as a **required** field in `output-schema.json`
- Specific examples of good vs bad feedback in `instructions.md`

See `harness/README.md` for the full philosophy and agent creation guide.
```

### Update 2: harness/README.md — Add Philosophy Section

Add as the second section (after Quick Start, before CLI Commands):

```markdown
## Philosophy: Agents Improving the Product

The harness exists to create a **virtuous feedback loop** where agents don't just test the product — they actively improve it.

Every agent writes a structured retrospective answering:
- **What worked well?** — Which commands were intuitive? What was pleasant?
- **What was confusing?** — What required trial-and-error? What error messages were unhelpful?
- **Magic wand** — If you could change one thing, what would it be? Be concrete.
- **Improvement suggestions** — 1-3 specific, actionable changes

These retrospectives are the most valuable output of any agent run. They capture friction that humans stop noticing — and they become real fix tasks that ship in the same sprint.

### Proof It Works

| Retrospective Finding | Fix | Commit |
|-----------------------|-----|--------|
| "No `console-logs` command — had to write Playwright from scratch" | FX002: Added `console-logs` + `screenshot-all` commands | `d144c6a` |
| Screenshot command timed out on SSE pages | FX003: Added `--wait-until` flag, changed default to `domcontentloaded` | _(pending)_ |

### The Loop

```
Agent runs → Retrospective → Fix task → Implementation → Better next run
```

This is dogfooding at the infrastructure level. The harness tests the product, and the product improves the harness.
```

### Update 3: harness/README.md — Agent Creation Checklist

Update the existing "Creating a New Agent" section to enforce the pattern:

```markdown
### Creating a New Agent

1. Create `agents/<your-slug>/`
2. Add `prompt.md` — the system prompt that frames the agent's task
   - **MUST** include a Retrospective section (see smoke-test for the template)
   - Ask: what worked, what was confusing, magic wand, improvement suggestions
3. Add `instructions.md` — agent identity, guidelines, CLI quick reference
   - **MUST** include: "This is dogfooding — your experience improves the harness for everyone"
   - Include good vs bad retrospective examples
4. Add `output-schema.json` — JSON Schema (Draft 2020-12) for the expected output
   - **MUST** include `retrospective` object with `magicWand` as a **required** field
   - Copy the retrospective schema from `agents/smoke-test/output-schema.json` lines 95-125
5. Run: `just harness agent run <your-slug>`

The retrospective is not optional. It's the mechanism that makes the harness better over time.
```

### Update 4: harness/README.md — New Section: From Retrospective to Fix

```markdown
## From Retrospective to Fix

When an agent's retrospective surfaces an improvement, here's how to close the loop:

1. **Read the retrospective** in `agents/<slug>/runs/<timestamp>/output/report.json`
2. **Create a fix task** using `/plan-5-v2-phase-tasks-and-brief` — reference the agent's exact quote
3. **Implement the fix** — use the harness itself to verify (dogfooding)
4. **Run the same agent again** — confirm the retrospective no longer mentions the issue
5. **Update the plan** — record the FX with "Source: [agent] retrospective" in the Fixes table

The fix task should quote the agent's feedback directly:
```
**Source**: Smoke-test agent retrospective (2026-03-08):
> "There's no `console-logs` command, so I had to write Playwright from scratch"
```

This creates traceability: you can trace every harness improvement back to the agent run that suggested it.
```

### Update 5: docs/project-rules/harness.md — Strengthen Feedback Section

The current content at line 258 says "The retrospective is the most valuable output" but doesn't explain the full loop. Add after line 258:

```markdown
#### The Feedback Loop in Practice

Every agent retrospective is a potential fix task. The workflow:

1. Agent runs and writes retrospective with `magicWand` suggestion
2. Developer reads retrospective, creates FX task quoting the agent's exact words
3. FX is implemented and verified using the harness (dogfooding the dogfood)
4. Same agent runs again — confirms the issue is resolved
5. FX recorded in plan with "Source: [agent] retrospective"

This is not aspirational. FX002 (`console-logs` + `screenshot-all`) shipped within hours of the smoke-test agent's first retrospective. Every harness agent MUST include a retrospective section with `magicWand` as a required field.

#### Creating New Agents — Mandatory Retrospective

All harness agents MUST include:
- `prompt.md`: Retrospective section asking what worked, what was confusing, magic wand
- `output-schema.json`: `retrospective.magicWand` as a required field
- `instructions.md`: "This is dogfooding" framing with good/bad feedback examples

See `harness/agents/smoke-test/` as the reference implementation.
```

### Update 6: Root README.md — Mention as Repo Differentiator

If the root README has a features or architecture section, add:

```markdown
### Harness Feedback Loop

Autonomous agents test the product and write structured retrospectives with "magic wand" suggestions. Those suggestions become fix tasks that ship in the same sprint. The product gets better every time an agent touches it. See [`harness/README.md`](harness/README.md) for the full philosophy.
```

---

## Retrospective Schema Template

For new agents, copy this into `output-schema.json`:

```json
{
  "retrospective": {
    "type": "object",
    "description": "Honest feedback on the harness experience. This is the most valuable part of the report — it drives real product improvements.",
    "required": ["workedWell", "confusing", "magicWand"],
    "additionalProperties": true,
    "properties": {
      "workedWell": {
        "type": "string",
        "description": "What CLI commands were intuitive and worked well? What was pleasant about the harness experience? Be specific — name commands, flags, output formats."
      },
      "confusing": {
        "type": "string",
        "description": "What was confusing, unclear, or required trial-and-error? What information was hard to discover? Were any error messages unhelpful?"
      },
      "magicWand": {
        "type": "string",
        "description": "If you could add or change one thing about the harness, what would it be? Be concrete — name a specific command, flag, output format, or workflow improvement."
      },
      "cliDiscoverability": {
        "type": "string",
        "description": "How discoverable were the CLI commands? Which did you find via --help? Which did you wish existed?"
      },
      "improvementSuggestions": {
        "type": "array",
        "description": "1-3 specific, actionable improvements for the harness CLI or documentation.",
        "items": { "type": "string" }
      }
    }
  }
}
```

---

## Verification Checklist

After implementing the updates:

- [ ] CLAUDE.md has "Harness Feedback Loop" section explaining the philosophy
- [ ] harness/README.md has "Philosophy: Agents Improving the Product" section with proof table
- [ ] harness/README.md agent creation checklist says retrospective is mandatory
- [ ] harness/README.md has "From Retrospective to Fix" workflow section
- [ ] docs/project-rules/harness.md has expanded feedback loop section
- [ ] Root README.md mentions the feedback loop
- [ ] A new developer reading these docs would understand the vibe within 2 minutes
- [ ] An agent creating a new harness agent would know to include retrospective fields
- [ ] `just fft` passes

---

## Files Changed Summary

| File | Change Type | What |
|------|------------|------|
| `CLAUDE.md` | Add section | "Harness Feedback Loop" — philosophy + agent creation guidance |
| `harness/README.md` | Add sections | Philosophy, From Retrospective to Fix, strengthened agent creation checklist |
| `docs/project-rules/harness.md` | Expand section | Feedback loop in practice, mandatory retrospective for new agents |
| `README.md` (root) | Add paragraph | Repo-level differentiator mention |

**Estimated scope**: ~120 lines of documentation across 4 files. No code changes.

---

## Open Questions

### Q1: Should we add a `harness/agents/TEMPLATE/` directory?

**RESOLVED**: Yes — include it in FX003 or as a quick follow-up. A template with pre-filled `prompt.md`, `instructions.md`, and `output-schema.json` (with the retrospective fields already present) makes the pattern impossible to forget. Even better: `just harness agent create <slug>` could scaffold from the template.

### Q2: Should retrospectives be aggregated somewhere?

**DEFERRED**: A `harness/retrospectives/` index that collects all agent magic-wand suggestions across runs would be powerful for prioritization. But that's a feature, not a doc update. Track for a future plan.

### Q3: Should CLAUDE.md link to specific retrospective examples?

**RESOLVED**: Yes — link to the FX002 commit as proof the loop works. Seeing a concrete example is more convincing than any amount of philosophy text.
