# Flight Plan: Phase 5 — Theme Adaptation & Polish

**Plan**: [file-icons-plan.md](../../file-icons-plan.md)
**Phase**: Phase 5: Theme Adaptation & Polish
**Generated**: 2026-03-10
**Status**: Landed

---

## Departure → Destination

**Where we are**: Phases 1-4 built a complete icon pipeline: resolver (37 tests), 1,117 SVGs, React components, and all 5 file-presenting surfaces wired with themed icons. 5,327 tests pass. But we haven't verified contrast in light mode, icons have no cache headers, there's no documentation for adding future themes, and we have no screenshot evidence of the integration working.

**Where we're going**: A developer opens the file browser in both light and dark mode and sees distinct, contrast-tested icons. Icon requests are served with immutable cache headers (1-year). A how-to guide explains how to add a new icon theme. Harness screenshots provide visual evidence of the full integration.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| `_platform/themes` | Possible CSS filter for light-mode contrast; new documentation | `file-icon.tsx`, `folder-icon.tsx`, `extending-icon-themes.md` |
| cross-domain | Cache headers in next.config.mjs | `next.config.mjs` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| `_platform/themes` (Phase 3) | `FileIcon`, `FolderIcon`, `useTheme()` light/dark detection | `@/features/_platform/themes` barrel |
| `next-themes` | `resolvedTheme` for light/dark detection | `useTheme()` hook |

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Contrast test" as S1
    state "2: CSS filter fix" as S2
    state "3: Cache headers" as S3
    state "4: Theme docs" as S4
    state "5: just fft" as S5
    state "6: Harness visual" as S6

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> S5
    S5 --> S6
    S6 --> [*]

    class S1,S2,S3,S4,S5,S6 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [x] **Stage 1: Contrast test** — Inspect 20 common icons in light + dark mode via harness (`visual inspection`)
- [x] **Stage 2: CSS filter fix** — N/A: no contrast problems found
- [x] **Stage 3: Cache headers** — Add immutable cache headers for `/icons/*` (`next.config.mjs` — modify)
- [x] **Stage 4: Theme docs** — Write extending-icon-themes guide (`extending-icon-themes.md` — new file)
- [x] **Stage 5: just fft** — Final quality gate (`evidence`)
- [x] **Stage 6: Harness visual** — Screenshot verification in both themes (`evidence`)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 5"]
        B1["FileIcon/FolderIcon<br/>(no contrast fix)"]:::existing
        B2["next.config.mjs<br/>(no cache headers)"]:::existing
        B3["No theme docs"]:::existing
    end

    subgraph After["After Phase 5"]
        A1["FileIcon/FolderIcon<br/>(contrast-verified,<br/>optional CSS filter)"]:::changed
        A2["next.config.mjs<br/>(immutable cache<br/>for /icons/*)"]:::changed
        A3["extending-icon-<br/>themes.md"]:::new
        A4["Harness screenshots<br/>(light + dark)"]:::new
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Acceptance Criteria

- [ ] AC-1: File type icons render in tree view (`.ts`, `.py`, `.json`, `.md`, `.html`, `.css`, `.go`, `.rs`, `.java` all distinct)
- [ ] AC-2: Folder-specific icons render (`src`, `test`, `node_modules`, `.git`, `docs`, `public`)
- [ ] AC-3: Unknown extensions fall back gracefully (`.xyz` → generic file icon)
- [ ] AC-4: Special filenames recognized (`Dockerfile`, `package.json`, `.gitignore`)
- [ ] AC-5: Icons visible in light and dark mode with adequate contrast
- [ ] AC-6: `/icons/*` served with immutable cache headers
- [ ] AC-7: How-to guide for extending icon themes exists
- [ ] AC-8: Harness screenshots captured for both themes

## Goals & Non-Goals

**Goals**:
- ✅ Contrast-verified icons in both themes
- ✅ Production cache headers
- ✅ Theme extension documentation
- ✅ Visual evidence via harness

**Non-Goals**:
- ❌ Multi-theme UI switching
- ❌ CLI standalone build (packages/cli/ doesn't exist)
- ❌ New icon surfaces or components

---

## Checklist

- [x] T001: Contrast test 20 common icons in light + dark
- [x] T002: CSS filter fix (N/A — no issues found)
- [x] T003: Cache headers in next.config.mjs
- [x] T004: Write extending-icon-themes.md
- [x] T005: Run `just fft`
- [x] T006: Harness visual verification (light + dark screenshots)
