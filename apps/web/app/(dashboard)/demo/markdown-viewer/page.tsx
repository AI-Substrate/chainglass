/**
 * MarkdownViewer Demo Page
 *
 * Demonstrates the MarkdownViewer component with various markdown samples.
 * Shows source/preview toggle with GFM features (tables, task lists, code blocks).
 *
 * This is a Server Component that renders MarkdownServer and passes
 * the preview to the MarkdownViewer client component.
 */

import type { ViewerFile } from '@chainglass/shared';

import { MarkdownServer, MarkdownViewer } from '@/components/viewers';
import { highlightCodeAction } from '@/lib/server/highlight-action';

// Sample markdown file demonstrating GFM features
const SAMPLE_MARKDOWN: ViewerFile = {
  path: 'docs/README.md',
  filename: 'README.md',
  content: `# Welcome to Chainglass

This is a **demo** of the MarkdownViewer component. It supports all GitHub Flavored Markdown features.

## Features

- Source/Preview toggle
- Syntax-highlighted code blocks
- GFM tables
- Task lists
- Strikethrough text

## Code Examples

Here's a TypeScript example:

\`\`\`typescript
interface User {
  name: string;
  email: string;
  roles: string[];
}

async function getUser(id: number): Promise<User> {
  const response = await fetch(\`/api/users/\${id}\`);
  return response.json();
}

const user = await getUser(1);
console.log(\`Hello, \${user.name}!\`);
\`\`\`

And a Python example:

\`\`\`python
from dataclasses import dataclass
from typing import List

@dataclass
class User:
    name: str
    email: str
    roles: List[str]

def greet(user: User) -> str:
    return f"Hello, {user.name}!"
\`\`\`

## GFM Table

| Feature | Status | Notes |
|---------|--------|-------|
| Syntax Highlighting | ✅ Complete | Shiki + CSS variables |
| Tables | ✅ Complete | GFM tables |
| Task Lists | ✅ Complete | Checkboxes |
| Strikethrough | ✅ Complete | ~deleted~ text |

## Task List

Here's what we've accomplished:

- [x] Install react-markdown
- [x] Configure @shikijs/rehype
- [x] Add prose styling
- [x] Create demo page
- [ ] Celebrate! 🎉

## Inline Code

Use \`console.log()\` for debugging. The \`MarkdownViewer\` component handles both modes.

## Strikethrough

This feature is ~~deprecated~~ replaced with a better approach.

## Links and Emphasis

Check out [Next.js](https://nextjs.org) for the *best* React framework. It's **really** good!

---

*Built with react-markdown, remark-gfm, and @shikijs/rehype*
`,
};

// Sample with a complex code example
const CODE_FOCUSED_SAMPLE: ViewerFile = {
  path: 'examples/api-handler.md',
  filename: 'api-handler.md',
  content: `# API Handler Example

This document shows syntax highlighting for various languages.

## TypeScript API Route

\`\`\`typescript
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'Missing id parameter' },
      { status: 400 }
    );
  }

  const data = await fetchData(id);
  return NextResponse.json(data);
}
\`\`\`

## Bash Script

\`\`\`bash
#!/bin/bash
set -euo pipefail

echo "Building project..."
pnpm build

echo "Running tests..."
pnpm test

echo "Done!"
\`\`\`

## JSON Configuration

\`\`\`json
{
  "name": "@chainglass/web",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "test": "vitest"
  }
}
\`\`\`
`,
};

export default async function MarkdownViewerDemoPage() {
  // Highlight markdown source for source mode
  const [mainHighlighted, codeHighlighted] = await Promise.all([
    highlightCodeAction(SAMPLE_MARKDOWN.content, 'markdown'),
    highlightCodeAction(CODE_FOCUSED_SAMPLE.content, 'markdown'),
  ]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          MarkdownViewer Demo
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Toggle between Source and Preview modes. Preview uses react-markdown with Shiki syntax
          highlighting.
        </p>

        <div className="space-y-12">
          {/* Main demo */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
              README.md - Full GFM Features
            </h2>
            <div className="rounded-lg overflow-hidden shadow-lg">
              <MarkdownViewer
                file={SAMPLE_MARKDOWN}
                highlightedHtml={mainHighlighted}
                preview={<MarkdownServer content={SAMPLE_MARKDOWN.content} />}
              />
            </div>
          </section>

          {/* Code-focused demo */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
              api-handler.md - Multi-Language Syntax Highlighting
            </h2>
            <div className="rounded-lg overflow-hidden shadow-lg">
              <MarkdownViewer
                file={CODE_FOCUSED_SAMPLE}
                highlightedHtml={codeHighlighted}
                preview={<MarkdownServer content={CODE_FOCUSED_SAMPLE.content} />}
              />
            </div>
          </section>
        </div>

        {/* Features box */}
        <div className="mt-12 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Features</h3>
          <ul className="text-blue-800 dark:text-blue-200 space-y-1 text-sm">
            <li>• Source/Preview toggle with state persistence</li>
            <li>• GitHub Flavored Markdown (tables, task lists, strikethrough)</li>
            <li>• Syntax highlighting via @shikijs/rehype (20+ languages)</li>
            <li>• Dual-theme support (instant light/dark switching)</li>
            <li>• Typography styling via @tailwindcss/typography</li>
            <li>• Server-side markdown processing (0KB client Shiki bundle)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
