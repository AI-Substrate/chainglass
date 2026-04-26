# Phase 3 — Execution Log

**Phase**: Link Popover
**Plan**: [../../md-editor-plan.md](../../md-editor-plan.md)
**Dossier**: [tasks.md](tasks.md)
**Flight Plan**: [tasks.fltplan.md](tasks.fltplan.md)
**Started**: 2026-04-19

---

## Pre-Phase Harness Validation (2026-04-19)

| Check | Result | Duration | Evidence |
|-------|--------|----------|----------|
| Boot | ✅ Already running | <1s | `just harness health` → app=up, mcp=up, terminal=up, cdp=up (Chrome/136.0.7103.25) |
| Interact | ✅ (verified via health) | — | CDP browser responsive |
| Observe | ✅ Will confirm at T008 | — | `harness/results/phase-3/` to be populated |

**Ports**: app=3126, terminal=4626, cdp=9248 (slot 26, worktree `083-md-editor`)

**Verdict**: ✅ HEALTHY — proceed to T001.

---

## Task Log

### T001 — Types + onOpenLinkDialog prop (2026-04-19)

**What shipped**
- Extended `apps/web/src/features/_platform/viewer/lib/wysiwyg-extensions.ts`:
  - Added `SanitizedHref` discriminated union: `{ ok: true; href: string } | { ok: false; reason: 'javascript-scheme' | 'empty' }`.
  - Added `LinkPopoverProps` with `editor`, `open`, `onOpenChange`, `anchorRef?: RefObject<HTMLElement | null>`, `className?`.
  - Added optional `onOpenLinkDialog?: () => void` to `MarkdownWysiwygEditorProps` (T006 wires it to Tiptap Mod-k keymap).
  - Added optional `linkButtonRef?: React.Ref<HTMLButtonElement>` to `WysiwygToolbarProps` (T003 uses this as Radix `PopoverAnchor virtualRef`).
  - Added `import type React from 'react'` for the ref type.
- Extended `apps/web/src/features/_platform/viewer/components/wysiwyg-toolbar.tsx`:
  - Added `buttonRef?: Ref<HTMLButtonElement>` to the internal `ToolbarButton` component, forwarded as `<Button ref={...}>` (shadcn `Button` supports ref forwarding — verified).
  - Threaded `linkButtonRef` through `WysiwygToolbar` props and onto the Link button only (`action.id === 'link'`) so non-Link buttons keep their generic `undefined` ref.
  - Added `Ref` to the `import type { ComponentType, Ref } from 'react'` import.
- Updated `apps/web/src/features/_platform/viewer/index.ts` barrel to re-export `LinkPopoverProps` and `SanitizedHref`.

**Evidence**
- `pnpm exec tsc --noEmit` from `apps/web/` shows only the 4 pre-existing debt errors noted in Pre-Impl Check (019-agent-manager-refactor, 074-workflow-execution, _platform/panel-layout) — zero new errors from T001 changes.
- Radix `@radix-ui/react-popover@1.1.15` is installed; `PopoverAnchor` extends `PopperPrimitive.Anchor` which supports `virtualRef?: React.RefObject<Measurable>` — confirmed in `node_modules/.pnpm/@radix-ui+react-popper@1.2.8/.../index.d.ts`. So T003 can anchor without wrapping the toolbar button.

**Decisions**
- `SanitizedHref` reason is a narrow union of `'javascript-scheme' | 'empty'` (not a wider string) — keeps callers exhaustively switch-checking.
- `LinkPopoverProps.anchorRef` typed as `RefObject<HTMLElement | null>` (not `HTMLButtonElement`) so future callers (e.g., caret-anchored popover in Phase 6 polish) aren't locked to buttons.
- `linkButtonRef` is threaded on the toolbar's Link button only (`action.id === 'link'`) — avoids leaking a generic ref to every button and keeps Phase 2's contract tight.

**Constitution / Forward-Compat notes**
- Interface-First (§2): types landed before any component code.
- Additive only: Phase 1/2's 45 unit tests remain untouched; no existing consumer signature changed.
- Forward-Compat: the new props are all optional → Phase 3's Phase 4/5 consumers opt in without breaking.

### T002 — TDD sanitizeLinkHref (2026-04-19)

**What shipped**
- RED-first: wrote `test/unit/web/features/_platform/viewer/sanitize-link-href.test.ts` covering 26 cases (dossier minimum was 22):
  - 12 happy-path accepts (http, https, scheme-less, www, mailto, /, ./, ../, #, trim-whitespace, trim-newline, parenthesized Wikipedia-style URL)
  - 2 empty rejections ('', whitespace-only)
  - 5 dangerous scheme rejections (javascript, JavaScript mixed-case, vbscript, data:text/html, file:///etc/passwd)
  - 6 evasion rejections (\\t-embedded, \\n-embedded, \\r-embedded, null-byte-prefixed, %XX-prefixed, fullwidth ｊ)
  - 1 dotless-i spoof (documented-as-accept trade-off: prepended https:// produces non-executable href)
- Confirmed RED: `pnpm exec vitest run sanitize-link-href.test.ts` failed with "module not found" (import target missing).
- Implemented `apps/web/src/features/_platform/viewer/lib/sanitize-link-href.ts` — pure function, 8-step pipeline: trim → strip-control-chars → empty-check → paranoid %XX-prefix guard → ASCII scheme regex + allow-list check → non-ASCII-first-char + colon-before-boundary guard → relative/anchor preservation → https:// prepend.

**Evidence**
- `pnpm exec vitest run test/unit/web/features/_platform/viewer/sanitize-link-href.test.ts` → 26/26 pass.
- `pnpm exec vitest run test/unit/web/features/_platform/viewer/` → 71/71 pass (45 pre-existing + 26 new).
- Zero regressions in Phase 1 (editor, image-url) or Phase 2 (toolbar, toolbar-markdown) tests.

**Decisions / discoveries**
- **Scheme regex excludes `.`** (despite RFC 3986 permitting it): `/^([a-zA-Z][a-zA-Z0-9+\-]*):/` — this ensures `example.com:8080/path` falls through to the prepend-https branch rather than being parsed as scheme `example.com` and rejected. None of the allow-listed schemes use dots, so no false negatives.
- **Dotless-i spoof `javascrıpt:alert(1)` is intentionally ACCEPTED** with `https://` prepended. Rationale: browsers only execute `javascript:` URLs when the scheme matches ASCII exactly; prepending `https://` makes the final href `https://javascrıpt:alert(1)` which is a harmless non-executable string. Documented in the test case and in the implementation comment on step 6.
- **Fullwidth `ｊavascript:` IS rejected** because the first character is non-ASCII AND a colon appears before any `/?#` boundary — the combination is treated as a Unicode-spoofed scheme.
- **Paranoid `%XX` guard in step 4** (not just step 5) — catches `%6Aavascript:alert(1)` before it can be "normalized" by decoding. Any input beginning with `%[hex][hex]` is rejected outright.
- **Constitution §4/§7**: plain `describe` / `it` / `expect`, no `vi.mock`, no `vi.fn`, no `vi.spyOn`. Pure in/out assertions.

### T003 / T004 / T005 — LinkPopover (desktop + mobile + edit flow) (2026-04-19)

Co-located in one new file; shipped together since the three tasks build up the same component.

**What shipped**
- New `apps/web/src/features/_platform/viewer/components/link-popover.tsx`:
  - `useIsMobile()` — `useSyncExternalStore` over `matchMedia('(max-width: 768px)')` with SSR-safe `getServerSnapshot` returning false.
  - `readLinkTextAndHref(editor)` — uses Tiptap's `extendMarkRange('link')` command + `state.doc.textBetween` to read the link's full visible text and href. (Initial implementation used a manual `rangeHasMark` walk; refactored during T008 harness debugging when the walk produced empty strings for certain selection positions.)
  - `LinkPopoverBody` — shared inner form used by both Popover + Sheet branches. Text + URL inputs with explicit `htmlFor`/`id` wiring. Auto-focus URL on mount via `requestAnimationFrame` (yields to Radix FocusScope). Mod-k swallow at root via `onKeyDown`.
  - Desktop branch: `<Popover modal>` + `<PopoverAnchor virtualRef={anchorRef}>` + `<PopoverContent onCloseAutoFocus={restoreOpenerFocus}>`. `modal={true}` is required for focus trap — Radix Popover's default `modal={false}` does NOT trap.
  - Mobile branch: `<Sheet>` + `<SheetContent side="bottom">` with sr-only `SheetTitle` + `SheetDescription` (Radix Dialog a11y gate). Inner body still provides the visible `<h3>`.
  - Opener-capture: `openerRef.current = document.activeElement` on open transition; `onCloseAutoFocus` preventDefault + focus the captured node via `requestAnimationFrame`.
  - Prefill effect: separate from opener capture; runs once per open cycle when `open === true` AND `editor !== null`, guarded by `hasPrefilledRef` (reset on close). Handles the race where the popover mounts with `editor === null` (immediatelyRender gap) and the editor arrives asynchronously — initial race caused one popover unit test to fail during T007.
  - Insert vs Edit mode derived from `useEditorState({ editor, selector: ctx => ctx.editor?.isActive('link') ?? false })`.
  - Submit handler: sanitizes via `sanitizeLinkHref`, applies via `editor.chain().focus().extendMarkRange('link').setLink({ href }).run()` for Edit or `editor.chain().focus().setLink({ href }).run()` / `insertContent(text).setLink(...)` for Insert. Check chain return value — on false, render inline `data-testid="link-popover-error"` alert.
  - Unlink: `editor.chain().focus().extendMarkRange('link').unsetLink().run()`.
  - Barrel `index.ts` re-exports `LinkPopover` + `sanitizeLinkHref`.

**Decisions / discoveries**
- **Radix `Popover.modal={true}` is required** for focus trap. Default false means Tab escapes the popover immediately. Dossier-documented but worth flagging again — it's the #1 reason a popover "doesn't feel like a dialog."
- **Radix `PopoverAnchor` `virtualRef` prop** (via PopperAnchor) exists in `@radix-ui/react-popover@1.1.15` and allows anchoring to an external DOM node without wrapping it. Used to anchor the popover to the toolbar Link button.
- **shadcn `Label` does NOT auto-bind** — requires explicit `htmlFor`/`id` pair per input. Verified in unit test "labels inputs correctly so getByLabelText resolves them".
- **`readLinkTextAndHref` via `extendMarkRange`** is cleaner than a manual `rangeHasMark` walk. The manual walk I wrote first produced empty strings in harness environments — possibly because Playwright `.click()` on an `<a>` places the caret at a mark boundary where the walk's edge conditions don't capture the full range. Switching to Tiptap's own `extendMarkRange` (which has battle-tested boundary semantics) fixed it.
- **Sheet sr-only Title + Description** suppresses a Radix Dialog a11y warning ("DialogContent requires a DialogTitle"). Our visible title is the inner `<h3>`; the sr-only SheetTitle satisfies Radix's gate for screen readers without visible duplication.
- **Prefill effect SEPARATE from opener capture**: the open-transition `!prevOpenRef.current && open` pattern fires exactly once on open, but if the editor is still null at that moment (lazy-loaded Tiptap chunk hasn't resolved), prefill silently skips and never re-fires. The `hasPrefilledRef` pattern keyed off `[open, editor, isInLink]` correctly waits for the editor to arrive. Caught in unit test "Edit mode pre-fill" — test initially failed because harness wrapper opens with `initialOpen=true` before `onEditorReady` fires.

### T006 — ⌘K keybinding + editor prop threading (2026-04-19)

**What shipped**
- `apps/web/src/features/_platform/viewer/components/markdown-wysiwyg-editor.tsx`:
  - Added `onOpenLinkDialogRef` (mirror of `onChangeRef` / `onEditorReadyRef`) — ref-stable so `.extend({ addKeyboardShortcuts })` captures the latest callback without re-registering extensions.
  - Imported `sanitizeLinkHref` from `../lib/sanitize-link-href`.
  - Replaced `TiptapLink.configure({ openOnClick: false, autolink: false })` with `TiptapLink.configure({ ..., protocols: ['http','https','mailto'], isAllowedUri: (url) => sanitizeLinkHref(url).ok }).extend({ addKeyboardShortcuts() { return { 'Mod-k': () => { if (!this.editor.isEditable) return false; onOpenLinkDialogRef.current?.(); return true; } }; } })`.
- 3 new editor unit tests in `test/unit/web/features/_platform/viewer/markdown-wysiwyg-editor.test.tsx`:
  - Mod-k via `editor.commands.keyboardShortcut('Mod-k')` fires `onOpenLinkDialog` exactly once.
  - `readOnly={true}` editor + Mod-k → callback NOT called (isEditable gate returns false).
  - Programmatic `setLink({ href: 'javascript:alert(1)' })` via chain → returns false, editor DOM contains no `<a>` (isAllowedUri gate works).

**Evidence**
- 13/13 editor tests pass (10 pre-existing + 3 new).
- Defense-in-depth gate confirmed: Tiptap's `isAllowedUri` is called inside `setLink`; pairing it with `sanitizeLinkHref` means even bypass attempts (e.g., paste-to-link or programmatic calls) are refused.

### T007 — Unit tests (popover coverage) (2026-04-19)

**What shipped**
- New `test/unit/web/features/_platform/viewer/link-popover.test.tsx` with 13 cases:
  - 3 render mode cases (desktop, mobile via matchMedia assignment, null editor = disabled skeleton).
  - 9 Insert-mode cases (title + 2 buttons, label binding, Enter submits, scheme prepend, javascript reject + error alert, Cancel, parenthesized URL, nested assertions).
  - 2 Edit-mode cases (caret-in-link pre-fills Text + URL + shows Unlink, Unlink removes anchor).
  - 1 reactive-flip case (Insert → Edit title flips when caret moves into a newly-created link).
- `window.matchMedia` property assignment via `Object.defineProperty` in `beforeEach`/`afterEach` — per dossier Note, this is test-time environment shaping, NOT mocking; Constitution §4/§7 compliant.

**Evidence**
- 87/87 viewer tests green — 45 Phase 1/2 preserved + 26 sanitize + 3 editor Mod-k + 13 popover = 42 new Phase 3 (exceeds dossier's ≥ 25 minimum).

### T008 — Harness smoke extension (2026-04-19)

**What shipped**
- Extended dev route `apps/web/app/dev/markdown-wysiwyg-smoke/page.tsx`:
  - Added `useState<boolean>` for popover open, `useRef<HTMLButtonElement>` for Link toolbar button anchor.
  - `onOpenLinkDialog` handler wired to BOTH the editor's `onOpenLinkDialog` prop AND the toolbar's `onOpenLinkDialog` prop, set to the same `() => setLinkOpen(true)`.
  - `linkButtonRef` threaded to `<WysiwygToolbar>`; same ref as `anchorRef` on `<LinkPopover>`.
  - Exposed `window.__smokeGetMarkdown()` for the harness to read the serialized markdown without inducing a React re-render on every edit.
- Rewrote `harness/tests/smoke/markdown-wysiwyg-smoke.spec.ts`:
  - Preserved Phase 1 (h1 / img src / zero hydration warnings) and Phase 2 (role=toolbar, 16 buttons, Bold click, H2 click, Mod-Alt-C code block) assertions verbatim.
  - Inserted `cdpPage.goto(...)` reload BETWEEN Phase 2 and Phase 3 assertions so Phase 3 starts from a fresh editor. (Reason: Phase 2's select-all + Bold + H2 + code-block mutations left the doc in a state that, combined with the new `editor.on('update')` update hook on the dev route, made Mod-Alt-C's keybinding timing flaky.)
  - Phase 3 assertions — 8 steps covering every didyouknow-v2 insight:
    1. Click toolbar Link → `data-testid="link-popover"` visible with `role="dialog"`.
    2. Type `https://example.com` + Enter → popover closes, `a[href="https://example.com"]` in DOM.
    3. Click anchor + Mod-k → popover reopens in Edit mode with URL + Text pre-filled.
    4. Click Update → popover closes, link retained.
    5. Click anchor + Mod-k → click Unlink → anchor removed.
    6a. Esc after toolbar-click open → `document.activeElement[data-testid]="toolbar-link"` (focus returns to Link button).
    6b. Esc after Mod-k open → `document.activeElement[contenteditable]="true"` (focus returns to editor).
    7. Type `javascript:alert(1)` + Enter → `data-testid="link-popover-error"` visible, popover stays open, no `<a>` inserted.
    8a. Open popover + Mod-k → popover stays open, URL input still focused, value preserved (Mod-k swallow works).
    8b. Parenthesized URL `https://en.wikipedia.org/wiki/Foo_(bar)` → inserted with href byte-identical after backslash-escape normalization (`\\(` → `(`, `\\)` → `)`).
  - Screenshot saved to `harness/results/phase-3/link-popover-{desktop,tablet}.png`.
  - Mobile project skipped with reason "Mobile toolbar + link popover bottom-sheet verification is Phase 6.4 scope".

**Evidence**
- Desktop: 1 passed (5.9s).
- Tablet: 1 passed (7.4s).
- Mobile: 1 skipped.
- Screenshots exist: `harness/results/phase-3/link-popover-desktop.png`, `link-popover-tablet.png`.

**Discoveries**
- `editor.on('update', updateMarkdownState)` + `setMarkdownOutput(state)` on every tx was disrupting Tiptap keyboard timing in Phase 2 assertions. Fixed by replacing with `window.__smokeGetMarkdown()` setter — no React re-render cycle, pull-based.
- `tiptap-markdown@0.8.10` emits parenthesized URLs as `\(` / `\)` backslash-escape. Semantic round-trip is preserved (re-parsing `\(` yields `(`) but byte-identical strings are not. Harness assertion normalizes escapes before comparing.
- Playwright `.click()` on an `<a>` inside a contenteditable places the caret at a mark boundary. A manual `rangeHasMark` walk from that position sometimes produces an empty text extraction. Switching `readLinkTextAndHref` to use Tiptap's `extendMarkRange` (which has battle-tested boundary semantics) fixed this across both jsdom tests and the harness.
- Turbopack cached compilation errors from mid-edit states — `touch <file>` forces re-read (carried-over gotcha from Phase 2).

---

## Phase 3 Summary

**Status**: ✅ Landed (2026-04-19)

- 8/8 tasks complete (T001 → T008).
- 87/87 unit tests green (45 Phase 1/2 preserved + 42 Phase 3 new: 26 sanitize + 3 editor + 13 popover — exceeds dossier's ≥ 25 minimum).
- Typecheck clean (only 4 pre-existing debt errors from other features, unchanged).
- Harness smoke: desktop + tablet green (~6-8s each), mobile deferred to Phase 6.4.
- All 12 phase-level acceptance criteria satisfied (Mod-k open, toolbar open, URL+Enter insert, scheme prepend, javascript reject, Edit pre-fill + Unlink, mobile Sheet, a11y keyboard + role=dialog + Esc, additive editor prop preserves Phase 1/2, harness green, sanitize tests green, popover tests green, no new vi.mock/fn/spyOn).
- Every didyouknow-v2 insight (popover anchor, selection pre-fill, parenthesized URL round-trip, Mod-k swallow, focus-return path) has at least one explicit Playwright assertion in T008 per user directive.
- Constitution §4/§7 preserved — no `vi.mock` / `vi.fn` / `vi.spyOn` introduced.

**Next**: `/plan-7-v2-code-review --phase "Phase 3: Link Popover" --plan "docs/plans/083-md-editor/md-editor-plan.md"`

