# Workshop: Code/Prompt Editor Component Selection

**Type**: Integration Pattern
**Plan**: 058-workunit-editor
**Research Dossier**: [research-dossier.md](../research-dossier.md)
**Created**: 2026-02-28
**Status**: Draft

**Related Documents**:
- [File Browser Domain](../../../domains/file-browser/domain.md) — owns the existing CodeEditor component
- [Research Dossier — External Research Opportunity 1](../research-dossier.md#external-research-opportunities) — original deep research prompt

**Domain Context**:
- **Primary Domain**: workflow-ui (consumer of editor for work unit editing)
- **Related Domains**: file-browser (owns existing CodeEditor), _platform/viewer (Shiki server-side highlighting), _platform/positional-graph (owns IWorkUnitService)

---

## Purpose

Decide which code editor component to use for editing work unit content (agent prompts and code scripts). This workshop resolves the central UX question: do we reuse the existing CodeMirror 6 wrapper from the file-browser domain, or introduce something different?

## Key Questions Addressed

1. Which editor component — Monaco, CodeMirror 6, Shiki+textarea, or plain textarea?
2. Can we reuse the existing `CodeEditor` from file-browser, or must we build new?
3. How to handle the three editor modes (agent prompt, code script, user-input form)?
4. What's missing from the current CodeEditor for work unit editing needs?
5. How to respect domain boundaries — file-browser owns CodeEditor but work-unit-editor needs it?
6. What's the markdown preview story for agent prompt editing?

---

## TL;DR — Recommendation

**Reuse the existing CodeMirror 6 `CodeEditor` component from file-browser.** Don't introduce Monaco, don't build from scratch. The codebase already has a battle-tested, lazy-loaded, theme-synced CodeMirror 6 wrapper with 13 language modes. Extract it to a shared location (`_platform/viewer` or a new shared component) so both file-browser and work-unit-editor can consume it.

**Why this is the right call:**
- CodeMirror 6 is already installed, configured, and working (~200KB loaded)
- Zero new dependencies needed (except `@codemirror/lang-shell` for bash — ~15KB)
- Same lazy-loading and SSR patterns already proven in production
- Monaco would add ~2MB and a complex webpack/Turbopack configuration
- A textarea would be a UX downgrade for a tool that edits code

---

## Option Analysis

### Option A: Reuse Existing CodeMirror 6 ✅ RECOMMENDED

**What exists today:**

```
apps/web/src/features/041-file-browser/components/code-editor.tsx
```

```typescript
// Current CodeEditor wrapper — 179 lines
export interface CodeEditorProps {
  value: string;
  language: string;          // 'markdown' | 'python' | 'javascript' | ...
  onChange?: (value: string); // undefined = readOnly
  readOnly?: boolean;
  scrollToLine?: number | null;
  wordWrap?: boolean;        // default: true
}
```

**Currently supported languages:**

| Language ID | CodeMirror Extension | Work Unit Need |
|-------------|---------------------|----------------|
| `typescript` | `@codemirror/lang-javascript` (ts mode) | ✅ Code units |
| `javascript` | `@codemirror/lang-javascript` | ✅ Code units |
| `python` | `@codemirror/lang-python` | ✅ Code units |
| `markdown` | `@codemirror/lang-markdown` | ✅ Agent prompts |
| `json` | `@codemirror/lang-json` | Nice-to-have |
| `yaml` | `@codemirror/lang-yaml` | ✅ unit.yaml viewing |
| `css` | `@codemirror/lang-css` | — |
| `html` | `@codemirror/lang-html` | — |
| `rust` | `@codemirror/lang-rust` | — |
| `java` | `@codemirror/lang-java` | — |
| `cpp` | `@codemirror/lang-cpp` | — |
| `tsx` | `@codemirror/lang-javascript` (tsx mode) | — |
| `jsx` | `@codemirror/lang-javascript` (jsx mode) | — |
| **`bash`** | **❌ NOT INSTALLED** | **⚠️ Required — most common code unit type** |

**Gap: Bash/shell is the #1 code unit language but has no CodeMirror syntax support.**

The `detectLanguage()` utility correctly maps `.sh` / `.bash` / `.zsh` → `'bash'`, but the `LANGUAGE_EXTENSIONS` map in CodeEditor has no `bash` entry. Files fall through to no syntax highlighting.

**Fix:** Install `@codemirror/lang-shell` (or use `@codemirror/legacy-modes` stream parser for shell).

**Features already working:**
- ✅ Lazy-loaded via `next/dynamic` (SSR-safe)
- ✅ Dark/light theme sync via `next-themes`
- ✅ Line numbers, code folding, bracket matching
- ✅ Active line highlighting
- ✅ Word wrap toggle
- ✅ Scroll-to-line support
- ✅ Loading placeholder during lazy load

**Features NOT present (may want for work units):**
- ❌ Markdown preview (side-by-side or toggle)
- ❌ Read-only diff view (file-viewer-panel has DiffViewer separately)
- ❌ Bash/shell syntax highlighting
- ❌ Autocomplete
- ❌ Lint/error indicators

**Bundle impact:** Zero additional — already loaded.

| Metric | Value |
|--------|-------|
| `@uiw/react-codemirror` | ~880KB on disk (tree-shaken to ~200KB loaded) |
| Per-language extension | ~10-30KB each |
| New dependency needed | `@codemirror/lang-shell` only (~15KB) |

---

### Option B: Monaco Editor ❌ NOT RECOMMENDED

**What it is:** The VS Code editor engine, full-featured IDE-in-a-browser.

**Why NOT for this project:**
1. **Bundle size**: ~2-4MB — would double the app's JS payload
2. **Turbopack compatibility**: Monaco uses web workers heavily; Turbopack worker configuration is still maturing
3. **Already have CodeMirror**: Adding a second editor engine creates maintenance burden
4. **Overkill**: Work units are ~50-200 line files. Monaco's strength is 10,000+ line files with IntelliSense
5. **SSR complexity**: Monaco requires careful `next/dynamic` and has known issues with React 19 Strict Mode

**When Monaco WOULD make sense:**
- If we needed TypeScript IntelliSense for code units
- If we needed multi-file editing with cross-references
- If files were routinely 1000+ lines

---

### Option C: Shiki + Textarea ❌ NOT RECOMMENDED

**What it is:** Use Shiki for read-only syntax highlighting (already in codebase) and overlay it on a basic `<textarea>` for editing.

**Why NOT:**
1. **Shiki is server-side only** in this codebase — `serverExternalPackages` in next.config.mjs explicitly excludes it from client bundles
2. Building a synchronized textarea+highlighted-overlay is surprisingly complex (scroll sync, selection, cursor positioning)
3. No line numbers, no code folding, no bracket matching — all must be hand-built
4. We already have CodeMirror which does all this

**Shiki's role in this project:** Read-only preview rendering on the server. The file browser uses it for "Preview" mode (not "Edit" mode). This separation is correct and should be maintained.

---

### Option D: Plain Textarea ❌ NOT RECOMMENDED FOR MVP

**What it is:** `<textarea>` with no syntax highlighting.

**Why NOT:**
- Editing bash scripts and Python without syntax highlighting is painful
- No line numbers makes debugging impossible
- We already have CodeMirror — using textarea is a UX regression
- The delta to use CodeEditor is near-zero (it's already lazy-loaded)

**When textarea IS appropriate:** User-input units don't need a code editor — their "prompt" and "options" fields use regular form inputs (textarea for prompt text, structured inputs for options). This is the correct approach for user-input type.

---

## Component Architecture

### Three Editor Experiences

```
┌─────────────────────────────────────────────────────────────┐
│ Work Unit Editor                                             │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐       │
│  │  Agent   │  │   Code   │  │     User-Input       │       │
│  │  Units   │  │   Units  │  │       Units          │       │
│  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘       │
│       │              │                    │                   │
│       ▼              ▼                    ▼                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐       │
│  │CodeEditor│  │CodeEditor│  │   Form Controls      │       │
│  │lang: md  │  │lang: bash│  │   (textarea +        │       │
│  │+ Preview │  │          │  │    option builder)    │       │
│  └──────────┘  └──────────┘  └──────────────────────┘       │
│       │              │                                       │
│       └──────┬───────┘                                       │
│              ▼                                               │
│     ┌────────────────┐                                       │
│     │  Shared         │                                      │
│     │  CodeEditor     │  ← Extracted from file-browser       │
│     │  (CodeMirror 6) │                                      │
│     └────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

### Agent Unit: Prompt Editor

Agent units edit a markdown prompt template (`prompts/main.md`). The editing experience should feel like writing a document, not coding.

```
┌──────────────────────────────────────────────────────────┐
│ Agent: sample-coder                                       │
├──────────────────────────────────────────────────────────┤
│ [Metadata Tab] [Prompt Tab ●] [Inputs/Outputs Tab]       │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ Toolbar: [Edit ✓] [Preview]  [Word Wrap ⤶]  [Save 💾]   │
│                                                           │
│  1 │ # Code Review Prompt                                 │
│  2 │                                                      │
│  3 │ You are reviewing {{source_code}} for quality.       │
│  4 │                                                      │
│  5 │ ## Instructions                                      │
│  6 │                                                      │
│  7 │ - Check for bugs                                     │
│  8 │ - Suggest improvements                               │
│  9 │ - Rate overall quality                               │
│ 10 │                                                      │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ Status: Draft  │  Lines: 10  │  template: prompts/  │   │
│ └─────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**Preview Mode** (toggle):
```
┌──────────────────────────────────────────────────────────┐
│ Toolbar: [Edit] [Preview ✓]                               │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌────────────────────────────────────────────────────┐   │
│  │ # Code Review Prompt                               │   │
│  │                                                    │   │
│  │ You are reviewing {{source_code}} for quality.     │   │
│  │                                                    │   │
│  │ ## Instructions                                    │   │
│  │                                                    │   │
│  │ • Check for bugs                                   │   │
│  │ • Suggest improvements                             │   │
│  │ • Rate overall quality                             │   │
│  └────────────────────────────────────────────────────┘   │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

**Implementation:**
- CodeEditor with `language="markdown"` and `wordWrap={true}` (default)
- Toggle between Edit (CodeEditor) and Preview (MarkdownPreview) — same pattern as `FileViewerPanel`
- MarkdownPreview component already exists at `apps/web/src/features/041-file-browser/components/markdown-preview.tsx`
- Template variables (`{{source_code}}`) render as plain text in markdown — this is correct

### Code Unit: Script Editor

Code units edit a script file (`scripts/main.sh`, `scripts/main.py`, etc.). The editing experience should feel like a lightweight IDE.

```
┌──────────────────────────────────────────────────────────┐
│ Code: sample-coder-script                                 │
├──────────────────────────────────────────────────────────┤
│ [Metadata Tab] [Script Tab ●] [Inputs/Outputs Tab]       │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ Toolbar: [bash ▾]  [Word Wrap ⤶]  [Save 💾]             │
│                                                           │
│  1 │ #!/bin/bash                                          │
│  2 │ set -euo pipefail                                    │
│  3 │                                                      │
│  4 │ INPUT_FILE="${1:?Missing input file}"                 │
│  5 │                                                      │
│  6 │ echo "Processing ${INPUT_FILE}..."                   │
│  7 │ cat "$INPUT_FILE" | grep -v "^#" > output.txt        │
│  8 │                                                      │
│  9 │ echo "Done. Output written to output.txt"            │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ Status: Draft  │  Lines: 9  │  script: scripts/main │   │
│ └─────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**Implementation:**
- CodeEditor with language auto-detected from script filename extension
- Language detection uses existing `detectLanguage()` from `apps/web/src/lib/language-detection.ts`
- No preview mode needed (code doesn't have a "preview")
- Word wrap toggle (default OFF for code, unlike markdown)

**Language detection from unit.yaml:**

```typescript
// Derive language from the script path in unit.yaml
// code.script: "scripts/main.sh"  → detectLanguage("main.sh") → "bash"
// code.script: "scripts/main.py"  → detectLanguage("main.py") → "python"
// code.script: "scripts/main.js"  → detectLanguage("main.js") → "javascript"

const language = detectLanguage(unitConfig.code.script);
```

### User-Input Unit: Form Builder (No Code Editor)

User-input units configure questions — no code editing at all.

```
┌──────────────────────────────────────────────────────────┐
│ User-Input: deployment-target                             │
├──────────────────────────────────────────────────────────┤
│ [Metadata Tab] [Configuration Tab ●] [Inputs/Outputs]    │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Question Type: [● Single  ○ Multi  ○ Freeform]          │
│                                                           │
│  Prompt:                                                  │
│  ┌────────────────────────────────────────────────────┐   │
│  │ Choose a deployment target                         │   │
│  └────────────────────────────────────────────────────┘   │
│                                                           │
│  Options:                                                 │
│  ┌──────────────────────────────────────────────────┐     │
│  │ Key: staging    │ Label: Staging                  │     │
│  │ Description: Deploy to staging environment        │     │
│  ├──────────────────────────────────────────────────┤     │
│  │ Key: production │ Label: Production               │     │
│  │ Description: Deploy to production environment     │     │
│  ├──────────────────────────────────────────────────┤     │
│  │ [+ Add Option]                                    │     │
│  └──────────────────────────────────────────────────┘     │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

**Implementation:**
- Standard form controls: radio buttons, textareas, input fields
- `<textarea>` for the prompt text (no syntax highlighting needed)
- Structured option builder (add/remove/reorder)
- No CodeEditor at all — this is pure form UI

---

## Extraction Strategy: CodeEditor Across Domains

### The Problem

`CodeEditor` lives in `apps/web/src/features/041-file-browser/components/code-editor.tsx` — owned by file-browser domain. The work-unit-editor feature (058) needs it too. Direct cross-feature imports violate domain boundaries.

### Options

| Strategy | Pros | Cons |
|----------|------|------|
| **A. Extract to `_platform/viewer`** | Viewer domain already owns file display components; CodeEditor is a viewer | Viewer is currently server-side focused (Shiki) |
| **B. Extract to `@/components/editors/`** | Simple shared location | No domain governance |
| **C. Import directly from file-browser** | Zero refactoring | Violates domain boundaries |
| **D. New `_platform/editor` domain** | Clean separation | Over-engineering for one component |

### Recommended: Option A — Extract to `_platform/viewer`

The viewer domain already provides `FileViewer`, `MarkdownViewer`, `DiffViewer`, and `detectContentType`. Adding `CodeEditor` as an editable counterpart is natural.

**Migration steps:**

```
Before:
  apps/web/src/features/041-file-browser/components/code-editor.tsx

After:
  apps/web/src/components/viewers/code-editor.tsx    ← new home
  apps/web/src/features/041-file-browser/components/code-editor.tsx  ← re-export
```

```typescript
// apps/web/src/features/041-file-browser/components/code-editor.tsx
// After extraction — backward compatible re-export
export { CodeEditor, type CodeEditorProps } from '@/components/viewers/code-editor';
```

**Why viewer domain?** The viewer domain already has the pattern:
- `apps/web/src/components/viewers/file-viewer.tsx` — read-only file viewer
- `apps/web/src/components/viewers/diff-viewer.tsx` — diff viewer
- Adding `code-editor.tsx` follows the same pattern for the editable case

---

## Gap Analysis: What's Missing

### Must Fix Before Implementation

#### Gap 1: Bash/Shell Syntax Highlighting

**Current state:** `detectLanguage()` returns `'bash'` for `.sh` files, but `LANGUAGE_EXTENSIONS` in CodeEditor has no `'bash'` entry. Result: bash files open with zero syntax highlighting.

**Fix:**

```bash
pnpm add @codemirror/lang-shell --filter @chainglass/web
```

```typescript
// In code-editor.tsx, add to imports:
import { shell } from '@codemirror/lang-shell';

// Add to LANGUAGE_EXTENSIONS map:
const LANGUAGE_EXTENSIONS: Record<string, () => Extension> = {
  // ... existing entries ...
  bash: () => shell(),
  shell: () => shell(),
};
```

**Bundle cost:** ~15KB (negligible).

**Note:** `@codemirror/lang-shell` provides Bash, sh, and POSIX shell highlighting. It's a first-party CodeMirror package, well-maintained.

#### Gap 2: Language Detection → CodeMirror Mapping

The `detectLanguage()` function returns Shiki language IDs (e.g., `'bash'`, `'csharp'`, `'go'`). The CodeEditor's `LANGUAGE_EXTENSIONS` map uses CodeMirror-specific keys. Most overlap, but some don't:

| `detectLanguage()` returns | CodeEditor supports? | Fix |
|---------------------------|---------------------|-----|
| `bash` | ❌ No | Add `@codemirror/lang-shell` |
| `go` | ❌ No (package installed but not mapped) | Add `go: () => go()` — `@codemirror/lang-go` is already in package.json |
| `csharp` | ❌ No | Low priority — not a work unit language |
| `ruby` | ❌ No | Low priority |
| `php` | ❌ No | Low priority |
| `dockerfile` | ❌ No | Could use shell mode as fallback |

**Action:** Add `bash` and `go` mappings. Others are low priority.

### Nice-to-Have Enhancements

#### Enhancement 1: Markdown Preview Toggle

For agent prompt editing, toggling between edit and rendered markdown preview improves the authoring experience. The pattern already exists in `FileViewerPanel`:

```typescript
// Simplified approach — toggle between CodeEditor and MarkdownPreview
type EditorMode = 'edit' | 'preview';

function PromptEditor({ value, onChange }: PromptEditorProps) {
  const [mode, setMode] = useState<EditorMode>('edit');

  return (
    <div>
      <Toolbar mode={mode} onModeChange={setMode} />
      {mode === 'edit' ? (
        <CodeEditor value={value} language="markdown" onChange={onChange} />
      ) : (
        <MarkdownPreview html={renderedHtml} />
      )}
    </div>
  );
}
```

**Consideration:** MarkdownPreview needs pre-rendered HTML from the server (via `renderMarkdownToHtml()`). For live preview during editing, we'd need either:
- A server action call on each preview toggle (latency acceptable for toggle, not for live)
- A client-side markdown renderer (e.g., `react-markdown` — already in deps!)

Since `react-markdown` (`^10.1.0`) and `remark-gfm` (`^4.0.1`) are already installed, client-side preview is free:

```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function PromptPreview({ content }: { content: string }) {
  return (
    <div className="prose dark:prose-invert max-w-none p-4">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
```

This gives instant client-side markdown preview with no server round-trip.

#### Enhancement 2: Template Variable Highlighting

Agent prompts use `{{variable_name}}` for template variables. A custom CodeMirror decoration could highlight these:

```
# Review {{source_code}}
          ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
          highlighted as "template variable"
```

**Implementation:** CodeMirror 6 `ViewPlugin` with `Decoration.mark()` for `{{...}}` patterns. This is a future enhancement — not needed for MVP.

#### Enhancement 3: Word Wrap Default by Type

| Unit Type | Default Word Wrap | Rationale |
|-----------|-------------------|-----------|
| Agent (markdown) | ON | Prose wraps naturally |
| Code (scripts) | OFF | Code has intentional line structure |
| User-input | N/A | Form controls, not code editor |

The `CodeEditor` already supports `wordWrap` prop. The work unit editor component sets the default based on unit type.

---

## SSR & Client Component Strategy

### The Constraint

CodeMirror is inherently interactive — it requires DOM APIs. It **cannot** render on the server. The existing solution is proven:

```typescript
// Lazy-load CodeMirror itself — never imported at module level
const ReactCodeMirror = dynamic(() => import('@uiw/react-codemirror'), {
  ssr: false,
  loading: () => <div className="animate-pulse rounded bg-muted p-4 h-64" />,
});
```

### Work Unit Editor Component Hierarchy

```
Server Component (RSC)
└── work-unit-editor-page.tsx         ← Server: loads unit data, renders shell
    └── WorkUnitEditorClient          ← 'use client': editor state, tabs, forms
        ├── MetadataForm              ← Client: slug, version, description fields
        ├── PromptEditor (agent)      ← Client: CodeEditor + preview toggle
        │   └── CodeEditor            ← Client: lazy-loaded CodeMirror
        ├── ScriptEditor (code)       ← Client: CodeEditor + language selector
        │   └── CodeEditor            ← Client: lazy-loaded CodeMirror
        └── ConfigForm (user-input)   ← Client: question type, prompt, options
```

**Key pattern:** The page's Server Component loads unit data via server actions, then passes it as props to the client boundary. This matches the file-browser pattern exactly.

```typescript
// apps/web/app/(dashboard)/workspaces/[slug]/units/[unitSlug]/page.tsx
// Server Component — loads data, renders client shell

export default async function WorkUnitEditorPage({ params }: PageProps) {
  const { slug, unitSlug } = await params;
  const unit = await loadWorkUnit(slug, unitSlug);    // server action
  const content = await loadUnitContent(slug, unit);   // server action

  return (
    <WorkUnitEditorClient
      unit={unit}
      initialContent={content}
      workspaceSlug={slug}
    />
  );
}
```

---

## Comparison Summary

| Criteria | CodeMirror 6 (reuse) | Monaco | Shiki+textarea | Plain textarea |
|----------|---------------------|--------|----------------|----------------|
| **Already in codebase** | ✅ Yes | ❌ No | ⚠️ Shiki yes, but server-only | ✅ Yes |
| **New dependencies** | `@codemirror/lang-shell` only | `@monaco-editor/react` + worker config | None but complex overlay code | None |
| **Bundle impact** | ~15KB incremental | ~2-4MB | N/A (can't use Shiki client-side) | 0 |
| **Syntax highlighting** | ✅ 13+ languages | ✅ 100+ languages | ❌ Not feasible | ❌ No |
| **Line numbers** | ✅ Built-in | ✅ Built-in | ❌ Must build | ❌ No |
| **Dark mode** | ✅ Already wired | ✅ Built-in | N/A | ✅ Trivial |
| **SSR compatible** | ✅ Proven pattern | ⚠️ Complex | N/A | ✅ Trivial |
| **Turbopack compatible** | ✅ Working today | ⚠️ Worker issues | N/A | ✅ Yes |
| **React 19 compatible** | ✅ Working today | ⚠️ Unverified | N/A | ✅ Yes |
| **Max file size comfort** | ~5000 lines | ~100,000+ lines | N/A | ~500 lines |
| **Autocomplete** | ⚠️ Extension needed | ✅ Built-in | ❌ No | ❌ No |
| **Diff view** | ⚠️ Extension needed | ✅ Built-in | ❌ No | ❌ No |
| **Development effort** | 🟢 Low (reuse + gap fixes) | 🔴 High (new integration) | 🔴 High (build from scratch) | 🟢 Low (but bad UX) |

---

## Implementation Checklist

### Phase 1: Immediate (during work unit editor build)

- [ ] Install `@codemirror/lang-shell` for bash syntax highlighting
- [ ] Add `bash` and `go` entries to `LANGUAGE_EXTENSIONS` map
- [ ] Extract `CodeEditor` from file-browser to `@/components/viewers/code-editor.tsx`
- [ ] Add backward-compatible re-export in file-browser
- [ ] Create `PromptEditor` wrapper (CodeEditor + markdown preview toggle)
- [ ] Create `ScriptEditor` wrapper (CodeEditor + language display)
- [ ] Use `react-markdown` for client-side prompt preview (already installed)
- [ ] Set `wordWrap` defaults: ON for markdown, OFF for code

### Phase 2: Nice-to-have (post-MVP)

- [ ] Template variable `{{...}}` highlighting via CodeMirror decoration
- [ ] Custom autocomplete for template variables from unit inputs
- [ ] Side-by-side edit+preview layout for agent prompts
- [ ] Keyboard shortcuts (Cmd+S to save, Cmd+Shift+P for preview)

### Phase 3: Future (if needed)

- [ ] Diff view for comparing unit versions
- [ ] Collaborative editing hints (show external changes)
- [ ] Additional language modes as demanded by users

---

## Open Questions

### Q1: Should we extract CodeEditor to `_platform/viewer` or `@/components/editors/`?

**RECOMMENDED**: Extract to `_platform/viewer` (`@/components/viewers/code-editor.tsx`). The viewer domain already manages display components. CodeEditor is the editable counterpart to FileViewer. This is a natural fit that maintains domain coherence.

However, the architect phase should confirm this — the decision affects domain contracts.

### Q2: Do we need side-by-side edit+preview for agent prompts?

**DEFERRED**: Toggle between edit/preview (like `FileViewerPanel`) is sufficient for MVP. Side-by-side can be added later if users request it. The file browser proves the toggle pattern works well.

### Q3: Should the work unit editor reuse `FileViewerPanel` directly?

**NO**: `FileViewerPanel` is tightly coupled to the file browser's concerns (diff, conflict detection, external file changes, pop-out URLs, binary file detection). The work unit editor should build its own thin wrapper around `CodeEditor` that handles unit-specific concerns (unit type dispatch, template path resolution, save-to-service integration).

### Q4: How to handle the Shiki `serverExternalPackages` constraint?

**RESOLVED**: No action needed. The work unit editor uses CodeMirror (client-side) for editing and doesn't need Shiki. If preview mode is added for code units, it can call a server action that uses Shiki — same pattern as the file browser's preview mode. The constraint only means "don't import shiki in client components" — which we don't.

---

## Quick Reference

```typescript
// Import the shared CodeEditor (after extraction)
import { CodeEditor } from '@/components/viewers/code-editor';

// Agent prompt editing
<CodeEditor
  value={promptContent}
  language="markdown"
  onChange={setPromptContent}
  wordWrap={true}
/>

// Code script editing
<CodeEditor
  value={scriptContent}
  language={detectLanguage(scriptFilename)}
  onChange={setScriptContent}
  wordWrap={false}
/>

// Read-only viewing
<CodeEditor
  value={content}
  language="yaml"
  readOnly={true}
/>

// Client-side markdown preview (agent prompts)
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

<div className="prose dark:prose-invert max-w-none p-4">
  <ReactMarkdown remarkPlugins={[remarkGfm]}>{promptContent}</ReactMarkdown>
</div>
```

**Language detection for work units:**

```typescript
import { detectLanguage } from '@/lib/language-detection';

function getEditorLanguage(unit: WorkUnitConfig): string {
  switch (unit.type) {
    case 'agent':
      return 'markdown';  // prompts are always markdown
    case 'code':
      return detectLanguage(unit.code.script);  // "scripts/main.sh" → "bash"
    case 'user-input':
      return 'text';  // not used — form-based editing
  }
}
```
