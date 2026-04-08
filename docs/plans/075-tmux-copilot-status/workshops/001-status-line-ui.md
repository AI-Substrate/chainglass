# Workshop: tmux Copilot Status Line UI

**Type**: CLI Flow / UI Design
**Plan**: 075-tmux-copilot-status
**Spec**: [tmux-copilot-status-spec.md](../tmux-copilot-status-spec.md)
**Created**: 2026-03-13
**Status**: Draft

---

## Purpose

Define the exact visual layout, content, and behavior of the second tmux status line that shows Copilot CLI session metadata. This workshop specifies what the user sees, how it responds to window switching, and how it degrades when no Copilot session is present.

## Key Questions Addressed

- What exactly does the status line show and in what order?
- How does it look visually alongside the existing green tab bar?
- What happens when the active window has no Copilot session?
- How should context budget be color-coded as it fills up?
- What's the compact format that fits in a single status line?

---

## Current State — What's There Now

The screenshot shows the existing tmux header bar. Line 1 is the standard tmux status bar with green background:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [074-actaul-real-agents] 0:dev  1:node* 🤖 074 workshop…  2:node 🤖 Detect…  3:node 🤖 Research…      │ ← Line 1 (existing, green bg)
├──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                          │ ← Line 2 (NEW — copilot status)
├──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                          │
│  (terminal content below)                                                                                │
│                                                                                                          │
```

The red box in the screenshot sits directly below line 1. That's where our new line 2 goes.

---

## Proposed Layout — Line 2 Content

### All sessions, inline, wrapping

Show **all** Copilot sessions running across tmux windows/panes — not just the active one. Each session is a compact block separated by `║`. They flow left-to-right in window order, wrapping to additional status lines if needed.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [074-actaul-real-agents] 0:dev  1:node* 2:node  3:fs  4:zsh  5:fs                   08:52 13-Mar-26     │
│ 1:copilot: opus4.6 (high) │ 105k/1000k (10.5%) │ 18t │ 2m ago  ║  2:copilot: opus4.6 (high) │ 487k/1000k (48.7%) │ 142t │ 30s ago │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Each block is prefixed with the **window index** so you can see which window it belongs to.

**Layout anatomy per session**:
```
{win}:copilot: {model} ({effort}) │ {used}k/{total}k ({pct}%) │ {turns}t │ {time_ago}
```

**Real examples — multiple sessions**:
```
1:copilot: opus4.6 (high) │ 105k/1000k (10.5%) │ 18t │ 2m ago  ║  2:copilot: opus4.6 (xhigh) │ 487k/1000k (48.7%) │ 142t │ 30s ago
```

**With wrapping** (3+ sessions, narrow terminal):
```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [074] 0:dev  1:node*  2:node  3:fs  4:zsh                                                               │
│ 1:copilot: opus4.6 (high) │ 105k/1000k (10.5%) │ 18t │ 2m  ║  2:copilot: opus4.6 (high) │ 487k/1000k  │
│ (48.7%) │ 142t │ 30s  ║  3:copilot: sonnet4.6 (high) │ 156k/200k (78.0%) │ 64t │ 1h                    │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

tmux's `status-format` supports wrapping when `status` is set to a number > 1. We set `status 3` (or higher) and tmux will use the extra lines as needed.

**Single session** — still works cleanly:
```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [074] 0:dev  1:node*  2:node  3:fs  4:zsh                                                               │
│ 2:copilot: opus4.6 (high) │ 105k/1000k (10.5%) │ 18t │ 2m ago                                           │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**No sessions** — blank line:
```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [074] 0:dev  1:zsh*  2:zsh  3:zsh                                                                       │
│                                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Ordering**: Sessions appear in tmux window index order (0, 1, 2, …). The active window's session could optionally be **highlighted** (bold or different color) to make it easy to spot.

**Character width per session**: ~70 chars. Two sessions fit side-by-side on a 178-col terminal. Three sessions wrap.

---

## Color Coding — Context Budget Health

tmux status lines support `#[fg=colour]` inline. Use color to signal context budget pressure:

| Budget Used | Color | Visual Meaning |
|-------------|-------|----------------|
| 0–50%       | `colour2` (green) | Healthy — plenty of room |
| 50–75%      | `colour3` (yellow) | Watch it — past halfway |
| 75–90%      | `colour208` (orange) | Warning — consider compacting |
| 90%+        | `colour1` (red) | Critical — context nearly full |

### Color mockup (conceptual — can't show color in markdown):

```
copilot: opus4.6 │ 105k / 1000k (10.5%) │ 18 turns       ← GREEN percentage
copilot: opus4.6 │ 650k / 1000k (65.0%) │ 200 turns      ← YELLOW percentage
copilot: opus4.6 │ 820k / 1000k (82.0%) │ 310 turns      ← ORANGE percentage
copilot: opus4.6 │ 950k / 1000k (95.0%) │ 400 turns      ← RED percentage
```

Implementation: The Python script outputs tmux color codes inline:
```
#[fg=colour2]10.5%#[default]
```

---

## Behavior — All Sessions, Always Visible

The status line shows **every** Copilot session running in the current tmux server, ordered by window index. No window-switching logic needed — all sessions are always visible.

### Scenario: Multiple copilot windows

```
User has 3 copilot windows open (1, 2, 5) and is focused on window 2:
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ [074] 0:dev  1:node  2:node*  3:fs  4:zsh  5:node                                       │
│ 1:copilot: opus4.6 (high) │ 105k/1000k (10.5%) │ 18t │ 2m  ║  2:copilot: opus4.6 ...   │
└──────────────────────────────────────────────────────────────────────────────────────────┘

User switches to window 4 (plain zsh) — status line unchanged:
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ [074] 0:dev  1:node  2:node  3:fs  4:zsh*  5:node                                       │
│ 1:copilot: opus4.6 (high) │ 105k/1000k (10.5%) │ 18t │ 2m  ║  2:copilot: opus4.6 ...   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

The status line is stable regardless of which window is focused. All sessions always visible.

### How it works
- tmux calls `#(python3 script.py)` every `status-interval` (15s)
- The script scans **all** tmux panes, finds copilot processes via TTY matching
- Resolves each to a session ID and extracts metadata
- Outputs all sessions as a single line separated by `║`
- tmux handles wrapping across status lines automatically

---

## Edge Cases

### No Copilot in active window
**Output**: Empty string → tmux shows a blank line 2 with the background color.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ [074] 0:dev  1:node  2:node  3:fs  4:zsh*                                               │
│                                                                                          │ ← blank, same bg
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Alternative — collapse to 1 line**: We could dynamically `set -g status 1` when no copilot is active and `set -g status 2` when one is found. But this causes visual jitter on every window switch. **Better to keep a stable 2-line height.**

### Copilot process exists but no session lock file yet
New copilot instance that hasn't written a lock file yet. **Output**: blank (safe fallback).

### Multiple sessions sharing a PID
Copilot reuses the same process across `--resume` calls. The script picks the session with the most recently modified `events.jsonl`. Already implemented in the exploration script.

### No process log for PID (token data unavailable)
**Output**: Show model and turns but dash for tokens:
```
copilot: opus4.6 │ — / 1000k │ 18 turns
```

### Very wide terminal (200+ cols)
Layout is left-aligned. Extra space on the right is fine — no stretching needed.

### Very narrow terminal (<80 cols)
The status line is ~55 chars. At extreme narrow widths tmux truncates with `...`. Acceptable.

---

## Styling — Line 2 Background

### Option 1: Same green as line 1 (Consistent)
```
set -g status-format[1] "#[bg=green,fg=black] #(python3 script.py)"
```
Both lines look like one unit. Clean but the copilot data doesn't stand out.

### Option 2: Darker/different background (Recommended)
```
set -g status-format[1] "#[bg=colour235,fg=colour250] #(python3 script.py)"
```
Dark grey background (`colour235`) with light text (`colour250`). Visually distinct from the green tab bar — signals "this is metadata, not navigation."

### Option 3: Transparent / terminal default
```
set -g status-format[1] "#[default] #(python3 script.py)"
```
Uses the terminal's default background. Minimal but may not read well depending on terminal theme.

**Recommendation**: **Option 2** — dark grey background clearly separates the copilot status from the window tabs while keeping it visually connected as "part of the header area."

### Mockup with styling:

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ [074-actaul-real-agents] 0:dev  1:node*  2:node  3:fs  4:zsh        08:52 13-Mar-26     │ ← GREEN bg (existing)
│ copilot: opus4.6 │ 105k / 1000k (10.5%) │ 18 turns                                            │ ← DARK GREY bg (new)
├──────────────────────────────────────────────────────────────────────────────────────────┤
│  $ bash scripts/explore/copilot-tmux-sessions.sh --current                               │
│  ═══════════════════════════════════════════════════════════════                          │
│    Copilot CLI Sessions in tmux  (found: 1)                                              │
│  ...                                                                                     │
```

---

## tmux Configuration

### Required changes to `~/.tmux.conf`:

```bash
# --- Copilot Status Line (Plan 075) ---
set -g status 2
set -g status-format[1] "#[align=left bg=colour235 fg=colour250] #(python3 ~/.copilot/scripts/copilot-tmux-status.py)"
```

That's it. Two lines.

### Script location decision

| Option | Path | Pros | Cons |
|--------|------|------|------|
| A | `scripts/explore/copilot-tmux-status.py` | In repo, versioned | Repo-specific path in global tmux.conf |
| B | `~/.copilot/scripts/copilot-tmux-status.py` | Next to copilot data, portable | Not version-controlled |
| C | Both — repo is source of truth, install copies to ~/.copilot | Best of both | Extra install step |

**Recommendation**: **Option C** — develop in `scripts/explore/copilot-tmux-status.py`, then the tmux.conf references `~/.copilot/scripts/copilot-tmux-status.py` with a symlink or copy. For now during development, just point directly at the repo path.

---

## Script Output Format (Exact)

The Python script's stdout is what tmux renders. The output must include tmux style codes:

```
# Normal (green) — under 50%
#[fg=colour2]copilot: opus4.6#[fg=default] │ 105k / 1000k #[fg=colour2](10.5%)#[fg=default] │ 18 turns

# Warning (yellow) — 50-75%
#[fg=colour3]copilot: opus4.6#[fg=default] │ 650k / 1000k #[fg=colour3](65.0%)#[fg=default] │ 200 turns

# Danger (orange) — 75-90%
#[fg=colour208]copilot: opus4.6#[fg=default] │ 820k / 1000k #[fg=colour208](82.0%)#[fg=default] │ 310 turns

# Critical (red) — 90%+
#[fg=colour1]copilot: opus4.6#[fg=default] │ 950k / 1000k #[fg=colour1](95.0%)#[fg=default] │ 400 turns

# No copilot in active window
(empty string — no output)
```

---

## Open Questions

### Q1: Should we hide the second line entirely when no copilot is running?

**RESOLVED**: No — keep `status 2` always. Toggling between 1 and 2 lines causes visual jitter. A blank dark grey line is acceptable and visually stable.

### Q2: Include reasoning effort in the display?

**OPEN**: Could add `(high)` or `(xhigh)` after the model name. Low cost but adds width.
```
copilot: opus4.6 (high) │ 105k / 1000k (10.5%) │ 18 turns
```
Defer to user preference during implementation.

### Q3: Right-align anything?

**RESOLVED**: No — keep everything left-aligned. The right side stays empty. Simple, clean, no formatting gymnastics.

---

## Quick Reference — Implementation Checklist

```
1. [ ] Create scripts/explore/copilot-tmux-status.py
       - Input:  none (reads active pane from tmux)
       - Output: single line with tmux color codes to stdout
       - Deps:   python3, tmux, reads ~/.copilot/ files

2. [ ] Add to ~/.tmux.conf:
       set -g status 2
       set -g status-format[1] "#[align=left bg=colour235 fg=colour250] #(python3 /path/to/copilot-tmux-status.py)"

3. [ ] Reload: tmux source-file ~/.tmux.conf

4. [ ] Test: switch between copilot and non-copilot windows, verify updates
```
