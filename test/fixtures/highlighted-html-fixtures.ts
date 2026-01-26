/**
 * Pre-highlighted HTML Fixtures for Component Testing
 *
 * These fixtures are generated from real Shiki output.
 * They allow component tests to verify rendering behavior without
 * running Shiki in every test (Tier 2 testing strategy).
 *
 * Generated using the shiki-processor.ts highlightCode() function.
 */

/**
 * TypeScript code example - demonstrates dual-theme CSS vars and line numbers.
 * Original code:
 * ```typescript
 * const x: number = 1;
 * const y = 'hello';
 * ```
 */
export const TYPESCRIPT_HIGHLIGHTED_HTML = `<pre class="shiki shiki-themes github-light github-dark" style="background-color:#fff;--shiki-dark-bg:#24292e;color:#24292e;--shiki-dark:#e1e4e8" tabindex="0"><code><span class="line" data-line="1"><span style="color:#D73A49;--shiki-dark:#F97583">const</span><span style="color:#005CC5;--shiki-dark:#79B8FF"> x</span><span style="color:#D73A49;--shiki-dark:#F97583">:</span><span style="color:#005CC5;--shiki-dark:#79B8FF"> number</span><span style="color:#D73A49;--shiki-dark:#F97583"> =</span><span style="color:#005CC5;--shiki-dark:#79B8FF"> 1</span><span style="color:#24292E;--shiki-dark:#E1E4E8">;</span></span>
<span class="line" data-line="2"><span style="color:#D73A49;--shiki-dark:#F97583">const</span><span style="color:#005CC5;--shiki-dark:#79B8FF"> y</span><span style="color:#D73A49;--shiki-dark:#F97583"> =</span><span style="color:#032F62;--shiki-dark:#9ECBFF"> 'hello'</span><span style="color:#24292E;--shiki-dark:#E1E4E8">;</span></span></code></pre>`;

/**
 * Simple single-line code for basic tests.
 * Original code: `const x = 1;`
 */
export const SIMPLE_CODE_HTML = `<pre class="shiki shiki-themes github-light github-dark" style="background-color:#fff;--shiki-dark-bg:#24292e;color:#24292e;--shiki-dark:#e1e4e8" tabindex="0"><code><span class="line" data-line="1"><span style="color:#D73A49;--shiki-dark:#F97583">const</span><span style="color:#005CC5;--shiki-dark:#79B8FF"> x</span><span style="color:#D73A49;--shiki-dark:#F97583"> =</span><span style="color:#005CC5;--shiki-dark:#79B8FF"> 1</span><span style="color:#24292E;--shiki-dark:#E1E4E8">;</span></span></code></pre>`;

/**
 * Multi-line code with 5 lines.
 * Original code:
 * ```typescript
 * function add(a: number, b: number): number {
 *   const result = a + b;
 *   return result;
 * }
 * export { add };
 * ```
 */
export const MULTILINE_CODE_HTML = `<pre class="shiki shiki-themes github-light github-dark" style="background-color:#fff;--shiki-dark-bg:#24292e;color:#24292e;--shiki-dark:#e1e4e8" tabindex="0"><code><span class="line" data-line="1"><span style="color:#D73A49;--shiki-dark:#F97583">function</span><span style="color:#6F42C1;--shiki-dark:#B392F0"> add</span><span style="color:#24292E;--shiki-dark:#E1E4E8">(</span><span style="color:#E36209;--shiki-dark:#FFAB70">a</span><span style="color:#D73A49;--shiki-dark:#F97583">:</span><span style="color:#005CC5;--shiki-dark:#79B8FF"> number</span><span style="color:#24292E;--shiki-dark:#E1E4E8">, </span><span style="color:#E36209;--shiki-dark:#FFAB70">b</span><span style="color:#D73A49;--shiki-dark:#F97583">:</span><span style="color:#005CC5;--shiki-dark:#79B8FF"> number</span><span style="color:#24292E;--shiki-dark:#E1E4E8">)</span><span style="color:#D73A49;--shiki-dark:#F97583">:</span><span style="color:#005CC5;--shiki-dark:#79B8FF"> number</span><span style="color:#24292E;--shiki-dark:#E1E4E8"> {</span></span>
<span class="line" data-line="2"><span style="color:#D73A49;--shiki-dark:#F97583">  const</span><span style="color:#005CC5;--shiki-dark:#79B8FF"> result</span><span style="color:#D73A49;--shiki-dark:#F97583"> =</span><span style="color:#24292E;--shiki-dark:#E1E4E8"> a </span><span style="color:#D73A49;--shiki-dark:#F97583">+</span><span style="color:#24292E;--shiki-dark:#E1E4E8"> b;</span></span>
<span class="line" data-line="3"><span style="color:#D73A49;--shiki-dark:#F97583">  return</span><span style="color:#24292E;--shiki-dark:#E1E4E8"> result;</span></span>
<span class="line" data-line="4"><span style="color:#24292E;--shiki-dark:#E1E4E8">}</span></span>
<span class="line" data-line="5"><span style="color:#D73A49;--shiki-dark:#F97583">export</span><span style="color:#24292E;--shiki-dark:#E1E4E8"> { add };</span></span></code></pre>`;

/**
 * Sample code fixtures (plain text content for ViewerFile objects)
 */
export const SAMPLE_TYPESCRIPT_CODE = `const x: number = 1;
const y = 'hello';`;

export const SAMPLE_MULTILINE_CODE = `function add(a: number, b: number): number {
  const result = a + b;
  return result;
}
export { add };`;

export const SAMPLE_PYTHON_CODE = `def hello():
    print("Hello, World!")

class Calculator:
    def add(self, a, b):
        return a + b`;

export const SAMPLE_CSHARP_CODE = `namespace Example
{
    public class Calculator
    {
        public int Add(int a, int b)
        {
            return a + b;
        }
    }
}`;

/**
 * Sample git diff fixtures for DiffViewer component testing.
 * These are raw git diff outputs, not pre-highlighted HTML.
 * DiffViewer uses @git-diff-view which handles highlighting internally.
 */
export const SAMPLE_DIFF_SIMPLE = `diff --git a/src/utils.ts b/src/utils.ts
index 1234567..abcdefg 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,3 +1,3 @@
-export const x = 1;
+export const x = 2;
 export const y = 'hello';`;

export const SAMPLE_DIFF_MULTILINE = `diff --git a/src/components/Button.tsx b/src/components/Button.tsx
index 1234567..abcdefg 100644
--- a/src/components/Button.tsx
+++ b/src/components/Button.tsx
@@ -1,10 +1,15 @@
 import React from 'react';

 interface ButtonProps {
   label: string;
+  disabled?: boolean;
+  onClick?: () => void;
 }

-export function Button({ label }: ButtonProps) {
+export function Button({ label, disabled, onClick }: ButtonProps) {
   return (
-    <button>{label}</button>
+    <button disabled={disabled} onClick={onClick}>
+      {label}
+    </button>
   );
 }`;

export const SAMPLE_DIFF_NO_CHANGES = '';
