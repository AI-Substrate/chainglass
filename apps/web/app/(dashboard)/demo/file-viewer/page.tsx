/**
 * FileViewer Demo Page
 *
 * Demonstrates the FileViewer component with various code samples.
 * This is a Server Component that calls highlightCode() and passes
 * the pre-rendered HTML to the FileViewer client component.
 */

import { FileViewer, type ViewerFile } from '@/components/viewers';
import { highlightCodeAction } from '@/lib/server/highlight-action';

// Sample code files for the demo
const SAMPLE_FILES: ViewerFile[] = [
  {
    path: 'src/utils/math.ts',
    filename: 'math.ts',
    content: `/**
 * Math utilities for the application
 */

export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// Example usage
const result = add(5, 3);
console.log(\`5 + 3 = \${result}\`);`,
  },
  {
    path: 'scripts/hello.py',
    filename: 'hello.py',
    content: `#!/usr/bin/env python3
"""
A simple Python greeting module.
"""

from typing import Optional

class Greeter:
    """A class that generates greetings."""

    def __init__(self, name: str):
        self.name = name

    def greet(self, greeting: Optional[str] = None) -> str:
        """Return a personalized greeting."""
        greeting = greeting or "Hello"
        return f"{greeting}, {self.name}!"

if __name__ == "__main__":
    greeter = Greeter("World")
    print(greeter.greet())`,
  },
  {
    path: 'src/Calculator.cs',
    filename: 'Calculator.cs',
    content: `using System;

namespace MathTools
{
    /// <summary>
    /// A simple calculator class.
    /// </summary>
    public class Calculator
    {
        public int Add(int a, int b) => a + b;

        public int Subtract(int a, int b) => a - b;

        public double Divide(double a, double b)
        {
            if (b == 0)
                throw new DivideByZeroException();
            return a / b;
        }
    }
}`,
  },
];

export default async function FileViewerDemoPage() {
  // Highlight all sample files (server-side)
  const highlightedFiles = await Promise.all(
    SAMPLE_FILES.map(async (file) => {
      const lang = file.filename.split('.').pop() ?? 'text';
      const langMap: Record<string, string> = {
        ts: 'typescript',
        py: 'python',
        cs: 'csharp',
      };
      const html = await highlightCodeAction(file.content, langMap[lang] ?? lang);
      return { file, html };
    })
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">FileViewer Demo</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Syntax highlighting powered by Shiki with CSS counter line numbers. Toggle between light
          and dark mode to see instant theme switching.
        </p>

        <div className="space-y-8">
          {highlightedFiles.map(({ file, html }) => (
            <div key={file.path}>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
                {file.path}
              </h2>
              <div className="rounded-lg overflow-hidden shadow-lg">
                <FileViewer file={file} highlightedHtml={html} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Features</h3>
          <ul className="text-blue-800 dark:text-blue-200 space-y-1 text-sm">
            <li>• CSS counter-based line numbers (don&apos;t copy with code selection)</li>
            <li>• Dual-theme support (instant light/dark switching via CSS variables)</li>
            <li>• Keyboard navigation (Arrow keys, Home/End)</li>
            <li>• Toggle line numbers visibility</li>
            <li>• 20+ programming languages supported</li>
            <li>• Shiki runs server-side only (0KB client bundle impact)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
