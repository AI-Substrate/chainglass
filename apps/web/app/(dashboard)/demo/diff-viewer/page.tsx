/**
 * DiffViewer Demo Page
 *
 * Demonstrates the DiffViewer component with various diff scenarios:
 * - Simple single-line change
 * - Multi-line additions and deletions
 * - Error states (not-git, no-changes, git-not-available)
 *
 * This page uses sample diff data for demonstration. In production,
 * use the getGitDiff server action to fetch real diffs.
 */

import { DiffViewer, type ViewerFile } from '@/components/viewers';

// Sample diff showing a simple change
const SAMPLE_DIFF_SIMPLE = `diff --git a/src/utils.ts b/src/utils.ts
index 1234567..abcdefg 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,3 +1,3 @@
-export const VERSION = '1.0.0';
+export const VERSION = '2.0.0';
 export const APP_NAME = 'Chainglass';`;

// Sample diff showing multiple changes
const SAMPLE_DIFF_COMPLEX = `diff --git a/src/components/Button.tsx b/src/components/Button.tsx
index 1234567..abcdefg 100644
--- a/src/components/Button.tsx
+++ b/src/components/Button.tsx
@@ -1,15 +1,20 @@
 import React from 'react';

 interface ButtonProps {
   label: string;
+  variant?: 'primary' | 'secondary';
+  disabled?: boolean;
+  onClick?: () => void;
 }

-export function Button({ label }: ButtonProps) {
+export function Button({ label, variant = 'primary', disabled, onClick }: ButtonProps) {
+  const baseClasses = 'px-4 py-2 rounded font-medium';
+  const variantClasses = variant === 'primary'
+    ? 'bg-blue-500 text-white hover:bg-blue-600'
+    : 'bg-gray-200 text-gray-800 hover:bg-gray-300';
+
   return (
-    <button className="bg-blue-500 text-white px-4 py-2 rounded">
+    <button className={\`\${baseClasses} \${variantClasses}\`} disabled={disabled} onClick={onClick}>
       {label}
     </button>
   );
 }`;

const sampleFileSimple: ViewerFile = {
  path: 'src/utils.ts',
  filename: 'utils.ts',
  content: "export const VERSION = '2.0.0';\nexport const APP_NAME = 'Chainglass';",
};

const sampleFileComplex: ViewerFile = {
  path: 'src/components/Button.tsx',
  filename: 'Button.tsx',
  content: '// Current file content...',
};

const sampleFileNoChanges: ViewerFile = {
  path: 'src/config.ts',
  filename: 'config.ts',
  content: 'export const CONFIG = {};',
};

export default function DiffViewerDemoPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">DiffViewer Demo</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Git diff visualization with split/unified views and Shiki syntax highlighting. Toggle
          between views to see the difference. The component uses @git-diff-view/react with
          @git-diff-view/shiki for accurate highlighting.
        </p>

        <div className="space-y-12">
          {/* Simple diff */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Simple Change
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              A single-line version bump. Toggle between split and unified views.
            </p>
            <div className="rounded-lg overflow-hidden shadow-lg border border-gray-200 dark:border-gray-700">
              <DiffViewer file={sampleFileSimple} diffData={SAMPLE_DIFF_SIMPLE} error={null} />
            </div>
          </section>

          {/* Complex diff */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Complex Changes
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Multiple additions and modifications to a React component.
            </p>
            <div className="rounded-lg overflow-hidden shadow-lg border border-gray-200 dark:border-gray-700">
              <DiffViewer file={sampleFileComplex} diffData={SAMPLE_DIFF_COMPLEX} error={null} />
            </div>
          </section>

          {/* Unified view example */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Unified View (Default)
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              The same diff in unified mode, showing +/- markers in a single column.
            </p>
            <div className="rounded-lg overflow-hidden shadow-lg border border-gray-200 dark:border-gray-700">
              <DiffViewer
                file={sampleFileSimple}
                diffData={SAMPLE_DIFF_SIMPLE}
                error={null}
                viewMode="unified"
              />
            </div>
          </section>

          {/* Error states */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Error States
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              How the component handles various error conditions.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  No Changes
                </h3>
                <div className="rounded-lg overflow-hidden shadow border border-gray-200 dark:border-gray-700">
                  <DiffViewer file={sampleFileNoChanges} diffData={null} error="no-changes" />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Not in Git
                </h3>
                <div className="rounded-lg overflow-hidden shadow border border-gray-200 dark:border-gray-700">
                  <DiffViewer file={sampleFileNoChanges} diffData={null} error="not-git" />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Git Not Available
                </h3>
                <div className="rounded-lg overflow-hidden shadow border border-gray-200 dark:border-gray-700">
                  <DiffViewer
                    file={sampleFileNoChanges}
                    diffData={null}
                    error="git-not-available"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Loading state */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Loading State
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Shown while fetching diff from the server.
            </p>
            <div className="rounded-lg overflow-hidden shadow-lg border border-gray-200 dark:border-gray-700 max-w-md">
              <DiffViewer file={sampleFileSimple} diffData={null} error={null} isLoading />
            </div>
          </section>
        </div>

        <div className="mt-12 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Features</h3>
          <ul className="text-blue-800 dark:text-blue-200 space-y-1 text-sm">
            <li>• Split (side-by-side) and Unified (+/-) view modes</li>
            <li>• Shiki syntax highlighting via @git-diff-view/shiki</li>
            <li>• Theme-aware (automatic light/dark mode switching)</li>
            <li>• Graceful error handling for git-related issues</li>
            <li>• Loading state for async diff fetching</li>
            <li>• Accessible toggle button with ARIA attributes</li>
          </ul>
        </div>

        <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
          <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2">Usage</h3>
          <pre className="text-yellow-800 dark:text-yellow-200 text-sm overflow-x-auto">
            {`// In a Server Component
import { getGitDiff } from '@/lib/server/git-diff-action';
import { DiffViewer } from '@/components/viewers';

const result = await getGitDiff('src/file.ts');
return <DiffViewer file={file} diffData={result.diff} error={result.error} />;`}
          </pre>
        </div>
      </div>
    </div>
  );
}
