/**
 * markdown-has-tables — GFM table detection for the Rich-mode warn banner.
 *
 * Phase 4 / T004. Scans markdown line-by-line for a pipe-bordered header row
 * immediately followed by a separator row. Ignores tables inside fenced code
 * blocks (both ``` and ~~~), including nested-fence cases where one fence
 * type appears inside the other.
 *
 * Strict by design: AC-11's banner is dismissible — over-warning erodes
 * user trust, so false negatives are preferable to false positives.
 *
 * Pure function. No dependencies.
 */

// A header row: up to 3 leading spaces, then `|` ... `|`, with optional
// trailing whitespace. Content between outer pipes is unrestricted here;
// the separator-row regex below provides the real discriminator.
const HEADER_RX = /^ {0,3}\|.*\|\s*$/;

// A separator row: up to 3 leading spaces, `|`, then inner content made only
// of whitespace / colons / pipes / hyphens, then `|` and optional trailing
// whitespace. Plus, the line must contain at least one `-`.
const SEPARATOR_RX = /^ {0,3}\|[\s:|-]+\|\s*$/;

// A header must have content beyond separator characters — otherwise a run
// of `|---|---|` would self-trigger. Require at least one char outside the
// separator allow-list.
const HEADER_HAS_CONTENT_RX = /[^\s:|\-]/;

/** Returns true iff the markdown string contains at least one GFM-style table outside of fenced code. */
export function hasTables(md: string): boolean {
  if (md === '') return false;

  const lines = md.split('\n');
  // Fence-state tracker: the STRING that opens the fence (`` '```' `` or `'~~~'`)
  // is recorded; only a line starting with the SAME fence type can close it.
  // This handles the nested case (e.g. ``` inside an open ~~~ does NOT close).
  let openFence: '```' | '~~~' | null = null;

  for (let i = 0; i < lines.length - 1; i++) {
    const raw = lines[i] ?? '';
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const stripped = line.trimStart();

    // 1. Fence state management.
    if (openFence === null) {
      if (stripped.startsWith('```')) {
        openFence = '```';
        continue;
      }
      if (stripped.startsWith('~~~')) {
        openFence = '~~~';
        continue;
      }
    } else {
      if (openFence === '```' && stripped.startsWith('```')) {
        openFence = null;
        continue;
      }
      if (openFence === '~~~' && stripped.startsWith('~~~')) {
        openFence = null;
        continue;
      }
      // Inside an open fence — skip all table pattern checks.
      continue;
    }

    // 2. Table detection (only when not inside a fence).
    if (!HEADER_RX.test(line) || !HEADER_HAS_CONTENT_RX.test(line)) continue;

    const rawNext = lines[i + 1] ?? '';
    const nextLine = rawNext.endsWith('\r') ? rawNext.slice(0, -1) : rawNext;
    if (SEPARATOR_RX.test(nextLine) && nextLine.includes('-')) {
      return true;
    }
  }

  return false;
}
