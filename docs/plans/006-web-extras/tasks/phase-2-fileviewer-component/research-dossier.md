# Phase 2: FileViewer Component - Research Dossier

**Created**: 2026-01-24
**Purpose**: Document research findings from DYK session to inform implementation decisions
**Research Tool**: Perplexity Deep Research

---

## Table of Contents

1. [Research Session 1: Shiki + Next.js 15 Architecture](#research-session-1-shiki--nextjs-15-architecture)
2. [Research Session 2: Shiki Line Numbers Implementation](#research-session-2-shiki-line-numbers-implementation)
3. [Consolidated Implementation Patterns](#consolidated-implementation-patterns)
4. [References](#references)

---

## Research Session 1: Shiki + Next.js 15 Architecture

**Date**: 2026-01-24
**Query**: Best practices for Shiki syntax highlighting with Next.js 15 App Router and next-themes

### Key Findings

#### 1. Server Utility Pattern (NOT Server Actions)

**Finding**: Use `import 'server-only'` package, not `'use server'` directive.

```typescript
// ✅ CORRECT - Server utility with server-only package
import 'server-only'
import { createHighlighter } from 'shiki'

export async function highlightCode(code: string, lang: string) {
  // ...
}
```

```typescript
// ❌ INCORRECT - Server Action pattern
'use server'
export async function highlightCode(code: string, lang: string) {
  // ...
}
```

**Rationale**:
- `server-only` enforces at build time - fails if accidentally imported in client
- Server Actions add unnecessary network roundtrip
- Server utilities are called during RSC rendering, not as separate requests

#### 2. Dual-Theme CSS Variables for Instant Theme Switching

**Finding**: Shiki supports generating both light and dark theme colors in a single pass using CSS variables.

```typescript
const html = await codeToHtml(code, {
  lang,
  themes: {
    light: 'github-light',
    dark: 'github-dark',
  },
})
```

**Output HTML**:
```html
<span style="color:#22863A;--shiki-dark:#ECEFF4">const</span>
```

**Theme Switching CSS**:
```css
html.dark .shiki,
html.dark .shiki span {
  color: var(--shiki-dark) !important;
  background-color: var(--shiki-dark-bg) !important;
  font-style: var(--shiki-dark-font-style) !important;
  font-weight: var(--shiki-dark-font-weight) !important;
}
```

**Rationale**:
- Zero server roundtrip on theme change
- Pure CSS toggle via next-themes `html.dark` class
- No hydration mismatch - both themes in initial HTML

#### 3. Singleton Highlighter Caching

**Finding**: Creating a highlighter is expensive. Cache at module level.

```typescript
// Module-level singleton - created once per server process
const highlighterPromise = createHighlighter({
  themes: ['github-light', 'github-dark'],
  langs: ['typescript', 'javascript', 'python', ...],
})

export async function highlightCode(code: string, lang: string) {
  const highlighter = await highlighterPromise
  return highlighter.codeToHtml(code, { ... })
}
```

**Rationale**:
- Highlighter creation loads WebAssembly + grammar files
- First request may be slow, subsequent requests instant
- Node.js module caching ensures singleton per process

#### 4. Next.js Configuration Required

```javascript
// next.config.js
const nextConfig = {
  serverExternalPackages: ['shiki', 'vscode-oniguruma'],
}
```

**Rationale**:
- Shiki uses Node.js-specific APIs and `fs` module
- Must be excluded from standard bundling
- Without this, bundler errors occur in serverless environments

### Sources (Session 1)

- Shiki Official Docs: https://shiki.style/packages/next
- Shiki Dual Themes: https://shiki.matsu.io/guide/dual-themes
- Shiki Performance Guide: https://shiki.style/guide/best-performance
- Next.js Server Components: https://nextjs.org/docs/app/getting-started/server-and-client-components

---

## Research Session 2: Shiki Line Numbers Implementation

**Date**: 2026-01-24
**Query**: Best practices for implementing line numbers with Shiki syntax highlighting

### Key Findings

#### 1. Shiki Does NOT Have Built-in Line Numbers

**Finding**: The `@shikijs/transformers` package does not include a line number transformer. This is a deliberate design choice.

> "The absence of a built-in line number transformer in the official package should not be interpreted as an oversight, but rather as a deliberate architectural choice. Line numbers are typically not something that should be embedded in the code content itself through notation."

**Implication**: We must implement line numbers ourselves using CSS counters.

#### 2. Shiki's Transformer `line` Hook Adds Per-Line Attributes

**Finding**: Shiki's transformer API has a `line` hook that is called for each line element.

```typescript
const html = await highlighter.codeToHtml(code, {
  lang,
  themes: { light: 'github-light', dark: 'github-dark' },
  transformers: [{
    name: 'line-numbers',
    line(node, line) {
      // `node` is the HAST node for <span class="line">
      // `line` is the 1-indexed line number
      node.properties['data-line'] = line
    }
  }]
})
```

**Output HTML**:
```html
<pre class="shiki">
  <code>
    <span class="line" data-line="1">...</span>
    <span class="line" data-line="2">...</span>
    <span class="line" data-line="3">...</span>
  </code>
</pre>
```

**Key Insight**: Shiki DOES output `<span class="line">` wrappers by default when using `codeToHtml`. The transformer `line` hook can add attributes to these existing elements.

#### 3. CSS Counter Pattern for Line Numbers

**Finding**: CSS counters are the industry-standard approach for displaying line numbers.

```css
/* Reset counter on code element */
code {
  counter-reset: line;
}

/* Each line increments and displays counter */
code .line::before {
  counter-increment: line;
  content: counter(line);

  /* CRITICAL: Prevent line numbers from being copied */
  user-select: none;
  -webkit-user-select: none;

  /* Styling */
  display: inline-block;
  width: 2rem;
  text-align: right;
  margin-right: 1rem;
  padding-right: 0.5rem;
  color: var(--line-number-color, #6b7280);
  border-right: 1px solid var(--line-number-border, #e5e7eb);
}

/* Dark mode line numbers */
html.dark code .line::before {
  color: var(--line-number-color-dark, #9ca3af);
  border-right-color: var(--line-number-border-dark, #374151);
}
```

**Advantages**:
- Zero JavaScript on client
- Excellent browser support (CSS 2.1+)
- Works with any highlighting library
- `user-select: none` prevents copying line numbers

#### 4. Common Pitfall: Trailing Newlines

**Finding**: Shiki preserves trailing newlines, which can create an empty final line.

```typescript
// Trim trailing newlines before highlighting
const trimmedCode = code.replace(/\n+$/, '')
const html = await highlighter.codeToHtml(trimmedCode, { ... })
```

**Rationale**: Prevents extra empty line number at the end.

#### 5. Alternative: `react-shiki` Package

**Finding**: For React apps, `react-shiki` provides built-in line number support.

```tsx
import { CodeBlock } from 'react-shiki'
import 'react-shiki/styles/line-numbers.css'

<CodeBlock
  code={code}
  lang="typescript"
  showLineNumbers
/>
```

**Assessment**: Not recommended for our use case because:
- We're using Server Components (react-shiki is client-focused)
- We want dual-theme CSS variables (custom implementation)
- We have specific styling requirements

#### 6. Alternative: Expressive Code

**Finding**: Expressive Code is a full-featured code block solution built on Shiki.

```tsx
import { ExpressiveCode } from 'expressive-code'

<ExpressiveCode
  code={code}
  lang="typescript"
  showLineNumbers
  startLineNumber={42}  // Custom starting line
/>
```

**Assessment**: Overkill for our current needs. Consider for future if we need:
- Line highlighting
- Diff markers
- Copy button
- Frame/terminal styling

### Recommended Implementation Pattern

Based on research, here's the recommended pattern for Phase 2:

```typescript
// apps/web/src/lib/server/shiki-processor.ts
import 'server-only'
import { createHighlighter, type BundledLanguage } from 'shiki'

// Singleton highlighter cached at module level
const highlighterPromise = createHighlighter({
  themes: ['github-light', 'github-dark'],
  langs: [
    'typescript', 'javascript', 'tsx', 'jsx',
    'python', 'go', 'rust', 'java', 'csharp',
    'json', 'yaml', 'bash', 'sql', 'html', 'css',
    'markdown', 'dockerfile', 'kotlin', 'ruby', 'php'
  ],
})

export async function highlightCode(
  code: string,
  lang: string
): Promise<string> {
  const highlighter = await highlighterPromise

  // Trim trailing newlines to prevent empty final line
  const trimmedCode = code.replace(/\n+$/, '')

  return highlighter.codeToHtml(trimmedCode, {
    lang: lang as BundledLanguage,
    themes: {
      light: 'github-light',
      dark: 'github-dark',
    },
    transformers: [{
      name: 'line-numbers',
      line(node, line) {
        // Add data-line attribute for CSS counter reference
        node.properties['data-line'] = line
        // Ensure line class is present
        this.addClassToHast(node, 'line')
      }
    }]
  })
}
```

```css
/* apps/web/src/components/viewers/file-viewer.css */

/* Line number styling via CSS counters */
.file-viewer code {
  counter-reset: line;
}

.file-viewer code .line {
  display: block;
}

.file-viewer code .line::before {
  counter-increment: line;
  content: counter(line);

  /* Prevent copying */
  user-select: none;
  -webkit-user-select: none;

  /* Layout */
  display: inline-block;
  width: 3ch;
  text-align: right;
  margin-right: 1.5ch;
  padding-right: 1ch;

  /* Light mode styling */
  color: #6b7280;
  border-right: 1px solid #e5e7eb;
}

/* Dark mode line numbers */
html.dark .file-viewer code .line::before {
  color: #9ca3af;
  border-right-color: #374151;
}

/* Hide line numbers when toggled off */
.file-viewer.hide-line-numbers code .line::before {
  display: none;
}

/* Theme switching for Shiki dual-theme output */
html.dark .file-viewer .shiki,
html.dark .file-viewer .shiki span {
  color: var(--shiki-dark) !important;
  background-color: var(--shiki-dark-bg) !important;
  font-style: var(--shiki-dark-font-style) !important;
  font-weight: var(--shiki-dark-font-weight) !important;
}
```

### Sources (Session 2)

- Shiki Transformers Guide: https://shiki.style/guide/transformers
- Shiki Transformers Package: https://shiki.style/packages/transformers
- CSS Counters MDN: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_counter_styles/Using_CSS_counters
- Expressive Code Line Numbers: https://expressive-code.com/plugins/line-numbers/
- React-Shiki: https://www.npmjs.com/react-shiki

---

## Consolidated Implementation Patterns

### Pattern 1: Server-Only Shiki Utility

```typescript
// apps/web/src/lib/server/shiki-processor.ts
import 'server-only'
import { createHighlighter, type BundledLanguage } from 'shiki'

const highlighterPromise = createHighlighter({
  themes: ['github-light', 'github-dark'],
  langs: ['typescript', 'javascript', 'python', /* ... */],
})

export async function highlightCode(code: string, lang: string): Promise<string> {
  const highlighter = await highlighterPromise
  const trimmedCode = code.replace(/\n+$/, '')

  return highlighter.codeToHtml(trimmedCode, {
    lang: lang as BundledLanguage,
    themes: { light: 'github-light', dark: 'github-dark' },
    transformers: [{
      name: 'line-numbers',
      line(node, line) {
        node.properties['data-line'] = line
      }
    }]
  })
}
```

### Pattern 2: CSS Counters for Line Numbers

```css
code {
  counter-reset: line;
}

code .line::before {
  counter-increment: line;
  content: counter(line);
  user-select: none;
  -webkit-user-select: none;
}
```

### Pattern 3: Dual-Theme CSS Variable Switching

```css
html.dark .shiki,
html.dark .shiki span {
  color: var(--shiki-dark) !important;
  background-color: var(--shiki-dark-bg) !important;
}
```

### Pattern 4: Next.js Configuration

```javascript
// next.config.js
const nextConfig = {
  serverExternalPackages: ['shiki', 'vscode-oniguruma'],
}
```

---

## References

### Official Documentation

| Resource | URL | Used For |
|----------|-----|----------|
| Shiki Next.js Package | https://shiki.style/packages/next | Next.js integration |
| Shiki Transformers | https://shiki.style/guide/transformers | Line hook API |
| Shiki Dual Themes | https://shiki.matsu.io/guide/dual-themes | CSS variable approach |
| Shiki Performance | https://shiki.style/guide/best-performance | Singleton caching |
| CSS Counters (MDN) | https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_counter_styles | Line number implementation |

### Community Resources

| Resource | URL | Used For |
|----------|-----|----------|
| Expressive Code | https://expressive-code.com/plugins/line-numbers/ | Reference implementation |
| react-shiki | https://www.npmjs.com/react-shiki | Alternative approach |
| Shiki GitHub Issues | https://github.com/shikijs/shiki/issues/3 | Line number discussion |

### Research Sessions

| Date | Tool | Query Summary | Key Findings |
|------|------|---------------|--------------|
| 2026-01-24 | Perplexity | Shiki + Next.js 15 + next-themes architecture | Server-only package, dual-theme CSS vars, singleton cache |
| 2026-01-24 | Perplexity | Shiki line numbers best practices | Transformer line hook, CSS counters, user-select: none |

---

*Dossier Version 1.0.0 - Created 2026-01-24*
*Referenced by: [tasks.md](./tasks.md)*
