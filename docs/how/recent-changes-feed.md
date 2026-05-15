# Recent Changes Feed

A repo-wide, media-rich, live-updating view in the file browser's main panel. The newest change is always at the top; live updates promote files into place via the existing `_platform/events` `file-changes` SSE channel.

> **Why use it?** When an external tool generates a batch of images / videos / screenshots in your workspace and you want to scan the outputs without click-back-click-back through the file tree. Also doubles as a high-bandwidth "what's been happening" view for returning to a project after time away.

---

## How to open

Three concurrent entrypoints (any of them works):

| Method | How |
|---|---|
| **Top-bar button** | Click the History icon in the file browser's explorer bar (next to the search dropdown). |
| **Keyboard** | `Cmd+Shift+U` (macOS) / `Ctrl+Shift+U` (Linux/Windows). |
| **Command palette** | Open the palette (`Cmd+P` then `>`), type "Recent" → "Open Recent Changes Feed". |
| **Open on launch** | Toggle the `Open feed on workspace launch` setting (off by default). When enabled, navigating into a workspace browser without a specific file or directory selected will land you on the feed. |

To **close** the feed, click the small "Close" button at the top-right of the feed panel — your previous file/dir selection is preserved.

---

## Card anatomy

```
┌──────────────────────────────────────────────────────┐
│ [icon] filename.png                  [Open ··· Copy] │  ← header strip
│        path/to/dir/                                  │  ← path (left-truncated)
│        2m ago · 142 KB · added                       │  ← meta line
├──────────────────────────────────────────────────────┤
│                                                      │
│             <type-specific preview>                  │  ← preview slot
│                                                      │
└──────────────────────────────────────────────────────┘
```

Each card surfaces:
- **Filename** (semibold; click to open in `FileViewerPanel`).
- **Path** truncated from the **left** (so trailing segments stay visible). Hover for the absolute-path tooltip.
- **Relative time** · **size** · **event-type badge** (`added` green / `changed` blue / `deleted` red).
- **Actions** (top-right; revealed on hover or always visible on touch).

---

## Per-type previews

| Kind | Preview |
|---|---|
| **Image** | Inline render bounded to ≤ 60vh. Lazy-loaded via IntersectionObserver. |
| **Video** | Native `<video controls>` with `preload="metadata"`. **No autoplay-loop** (workshop §6 — too noisy in a stacked feed). |
| **Audio** | Native `<audio controls>` with `preload="metadata"`. |
| **Markdown** | Server-truncated excerpt (default 8 non-empty lines OR 600 chars, whichever fits). Fade-out gradient hints more content. Click to open for full Mermaid + Shiki rendering. |
| **Code** | Server-truncated first-N-lines (default 12). Detected language. Click to open for full syntax-highlighted view. |
| **Generic / binary** | File icon + size + "Binary file — preview not available." |
| **Deleted** | Strikethrough mini-card. Auto-removes after 5s (configurable; `Infinity` keeps until manually dismissed). |

---

## Action shortcuts

When a card has focus (Arrow keys move between cards):

| Shortcut | Action |
|---|---|
| `Enter` | Open in FileViewerPanel |
| `c` | Copy relative path |
| `Shift+C` | Copy absolute path |
| `d` | Download (raw-file API with `?download=true`) |
| `r` | Reveal in tree (sets `?dir={parent}&file={path}`) |
| `m` | Copy as Markdown link (`![name](url)` for media; `[name](url)` for others) |

The full action catalog also includes (via the overflow menu / programmatic API):

- `copyFilename` — basename only
- `copyFileContents` — fetches the full file via `getFileExcerpt` (256KB hard cap; secrets-pattern + content-type gated)
- `dismiss` — hides the card for the rest of the session (no persistence)

---

## Filters

Multi-select chip row at the top:

`All · Images · Videos · Audio · Markdown · Code · Other`

- Clicking **All** snaps back to showing every category.
- Clicking any other chip from the all-state selects **only** that category.
- Subsequent chip clicks add/remove from the subset.
- Removing the last chip auto-snaps back to all (so the feed always shows content).

---

## Pause + buffer

- The header **Pause** button stops promoting new entries. While paused, incoming changes accumulate in a buffer.
- A sticky pill at the top of the scroll area shows `N new changes — click to show`. Clicking unpauses, drains the buffer (newest first), and scrolls to top.
- Multiple buffered events for the same file collapse to a single entry — the latest event wins.

---

## Settings

All under the `Recent Changes Feed` section in the main settings page. Namespace: `fileBrowser.recentFeed.*` (locked — renaming any key breaks v1 user data silently).

| Key | Default | Purpose |
|---|---|---|
| `feedSize` | 50 | Initial seed size (newest N files from `git log`). |
| `feedCeiling` | 200 | Hard cap on items in the feed (oldest evicted past this). |
| `mdExcerptLines` | 8 | Markdown excerpt: maximum non-empty lines included. |
| `mdExcerptChars` | 600 | Markdown excerpt: approximate maximum characters. |
| `codeExcerptLines` | 12 | Code excerpt: maximum lines included. |
| `autoplayPolicy` | `off` | Video autoplay: `off` / `on-hover` / `on (loop)`. Default off (workshop §6). |
| `deletedWindow` | 5000 | Deleted-card visibility window in ms before auto-removal. Set 0 for instant; large value for "Until dismissed". |
| `inFlightMediaBound` | 5 | Hard cap on simultaneously decoded media elements (memory ceiling). |
| `openOnLaunch` | `false` | When true, `?view=recent-feed` is set automatically on workspace browser landing if no file/dir is already specified. |

---

## USDK command reference

| Command ID | Title | Default keybinding |
|---|---|---|
| `file-browser.openRecentFeed` | Open Recent Changes Feed | `Cmd/Ctrl+Shift+U` |

---

## Troubleshooting

### "Cannot seed from git history"

The feed shows this when the workspace is not a git repository — the seed source (`git log --name-only`) doesn't have anything to read. **Live updates still work** for any file changes that happen after the feed loads; you just won't see historical entries.

### "Live updates disconnected"

The amber banner appears when the SSE connection drops. The feed preserves all existing items; only new events arriving after reconnection are merged. Reconnection is automatic — the banner clears when the connection comes back.

### Mass rename / `git checkout` flood

Burst coalescing collapses up to 50 events in < 1s into a single React render. The pause button is also useful here — the buffer pill shows the count, and you can drain when ready.

### A `node_modules/foo.js` slipped into the feed

The feed filters common build-artifact paths at intake (`node_modules/`, `.next/`, `.turbo/`, `.cache/`, `dist/`, `build/`, `coverage/`). If a path you don't care about still appears, you can dismiss it for the session. Path-pattern customisation is a v1.x candidate.

### "Excerpt unavailable (forbidden)"

The file-excerpt action rejects:
- Paths matching secrets patterns (`.env*`, `credentials`, `*.secret*`, `*.key`, `*.pem`, `id_rsa*`, anything under `.git/`).
- Binary content types (image / video / audio / pdf).
- Files with null bytes in their first 8KB (mislabelled binaries).

This is intentional — the excerpt action is the same surface the orchestrator uses for `copyFileContents`, so the same security gating applies.

### Shiki cold-start latency

The first code-excerpt card to render after a fresh page load may take 200-500ms while Shiki initialises 38 preloaded languages. Subsequent cards are < 50ms. Skeleton placeholders absorb the first delay; later cards stream in immediately.

---

## Out of scope (v2 candidates)

- Multi-select + bulk actions (delete, copy paths, zip-download)
- "Last seen" marker (Slack-style unread line)
- Pinning (keep card visible regardless of feed rotation)
- Cross-tab synchronization of feed state
- "Smart feed" filtering (e.g., "only files I created in this session")
- AI summary cards (e.g., "you generated 12 images in the last 5 minutes")
- Shiki HTML rendering directly in code excerpt cards (currently raw text + click-to-open for full)
- Mermaid diagram rendering in markdown excerpts
- Rename-pair coalescence (a `unlink` + `add` for the same basename within 200ms is currently shown as two cards)
