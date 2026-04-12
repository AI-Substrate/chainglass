---
description: Visual QA for folder content preview gallery — seeds sample folder, explores gallery at multiple viewports, validates cards, themes, and interactions
tags: [qa, folder-preview, visual, plan-077]
model: claude-sonnet-4
timeout: 1200
---

# Folder Preview QA Agent

## Objective

Validate the folder content preview gallery (Plan 077) by seeding a sample directory with mixed media, navigating to it in the file browser, and visually verifying the gallery renders correctly at desktop, tablet, and mobile viewports. Provide honest feedback on visual quality, interactions, and polish.

## Pre-flight

1. First: `cd $MINIH_PROJECT_ROOT` — your CWD starts in the run folder, NOT the repo.
2. Run `just preflight` to ensure the CLI is fresh and dev server is running.
3. If the dev server is not running, start it with `just dev` and wait for it to be ready.

## Tasks

### 1. Seed Sample Folder

Create a test directory with mixed content types inside the workspace's worktree. The workspace and worktree path can be discovered from the dev server.

First, discover the app port and workspace:
```bash
# Get the app port from dev server info
APP_PORT=$(cat .chainglass/server.json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('port',3000))" 2>/dev/null || echo 3000)
echo "App running on port: $APP_PORT"

# Get workspace slug from the dev server
curl -s "http://localhost:$APP_PORT/api/workspaces" | python3 -c "import json,sys; ws=json.load(sys.stdin); print(ws[0]['slug'] if ws else 'NONE')"
```

Then create a sample directory structure inside the worktree with these file types:

```bash
WORKTREE_PATH="<discovered worktree path>"
SAMPLE_DIR="$WORKTREE_PATH/scratch/gallery-test"
mkdir -p "$SAMPLE_DIR/screenshots" "$SAMPLE_DIR/icons"

# Images — create small test PNGs using ImageMagick (convert) or Python
python3 -c "
import struct, zlib
def png(w,h,r,g,b,path):
    raw = b''
    for y in range(h):
        raw += b'\x00' + bytes([r,g,b]*w)
    data = b'\x89PNG\r\n\x1a\n'
    def chunk(t,d):
        c = t+d; return struct.pack('>I',len(d))+c+struct.pack('>I',zlib.crc32(c)&0xffffffff)
    data += chunk(b'IHDR', struct.pack('>IIBBBBB',w,h,8,2,0,0,0))
    data += chunk(b'IDAT', zlib.compress(raw))
    data += chunk(b'IEND', b'')
    open(path,'wb').write(data)
png(200,150,66,133,244,'$SAMPLE_DIR/hero-banner.png')
png(100,100,34,197,94,'$SAMPLE_DIR/logo.png')
png(300,200,239,68,68,'$SAMPLE_DIR/screenshots/error-state.png')
png(300,200,251,146,60,'$SAMPLE_DIR/screenshots/success-state.png')
png(64,64,99,102,241,'$SAMPLE_DIR/icons/app-icon.png')
png(64,64,168,85,247,'$SAMPLE_DIR/icons/favicon.png')
"

# SVG
echo '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="#3b82f6"/></svg>' > "$SAMPLE_DIR/circle.svg"

# Video — create a minimal MP4 test file (just needs to be recognized as video)
python3 -c "
# Create a tiny valid MP4 (ftyp box only — enough for content type detection)
import struct
ftyp = b'ftypisom' + b'\x00\x00\x02\x00' + b'isomiso2mp41'
box = struct.pack('>I', len(ftyp)+8) + ftyp
open('$SAMPLE_DIR/demo-clip.mp4','wb').write(box)
"

# Audio — create a minimal file with .mp3 extension
echo "fake audio" > "$SAMPLE_DIR/notification.mp3"

# Text/code files
cat > "$SAMPLE_DIR/config.ts" << 'EOF'
export const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
  retries: 3,
};
EOF

# Markdown
cat > "$SAMPLE_DIR/README.md" << 'EOF'
# Gallery Test Assets

Sample directory for testing the folder content preview feature.

- Images in multiple formats
- Video and audio files
- Code and markdown files
EOF

# PDF placeholder
echo "%PDF-1.4 test" > "$SAMPLE_DIR/guide.pdf"

# Generic binary
echo "PK fake zip" > "$SAMPLE_DIR/archive.zip"

echo "Sample folder created at: $SAMPLE_DIR"
ls -la "$SAMPLE_DIR"
```

### 2. Navigate to Gallery — Desktop

Use Playwright browser automation to:

1. Navigate to the file browser: `http://localhost:$APP_PORT/workspaces/<slug>/browser?worktree=<path>`
2. Set viewport to desktop (1280×800)
3. In the file tree, expand `scratch` → `gallery-test`
4. Wait for the gallery to appear in the right panel
5. Take a screenshot: `desktop-gallery.png`
6. Verify:
   - Breadcrumb shows `root / scratch / gallery-test`
   - Section labels visible: "Folders", "Media", "Documents" or "Other"
   - Image cards show actual thumbnails (colored rectangles)
   - Video card shows play badge
   - Audio card shows waveform bars
   - Folder cards show folder icons
   - Cards have hover-revealed action buttons (hover over one to check)

### 3. Navigate into Subfolder

1. Click the `screenshots` folder card in the gallery
2. Verify the gallery updates to show the screenshots folder contents
3. Verify the breadcrumb updates to `root / scratch / gallery-test / screenshots`
4. Take a screenshot: `desktop-subfolder.png`
5. Click the breadcrumb `gallery-test` segment to navigate back
6. Verify the gallery returns to the parent folder
7. Take a screenshot: `desktop-back-navigation.png`

### 4. Theme Toggle

1. Toggle to dark theme (find the theme toggle in the UI, usually in the sidebar or settings)
2. Take a screenshot: `desktop-dark-theme.png`
3. Verify cards adapt to dark theme (dark backgrounds, light text, no white flash)
4. Toggle back to light theme

### 5. Mobile Viewport

1. Set viewport to mobile (375×812)
2. Navigate to the gallery-test folder (may need to use URL params directly)
3. Take a screenshot: `mobile-gallery.png`
4. Verify:
   - Grid shows 1-2 columns
   - Action buttons (copy/download) are always visible (not hover-dependent)
   - Cards are not cut off or overlapping
   - Text is readable at mobile size
5. Take a screenshot of the gallery scrolled down: `mobile-gallery-scrolled.png`

### 6. Tablet Viewport

1. Set viewport to tablet (768×1024)
2. Navigate to the gallery-test folder
3. Take a screenshot: `tablet-gallery.png`
4. Verify grid shows 2-3 columns

### 7. Empty Folder Test

1. Create an empty subfolder: `mkdir -p $SAMPLE_DIR/empty-folder`
2. Navigate to the empty folder in the gallery
3. Verify the empty state appears with icon, message, and upload button
4. Take a screenshot: `desktop-empty-state.png`

### 8. Large Folder Warning Test

1. Create a folder with >50 files:
```bash
mkdir -p "$SAMPLE_DIR/many-files"
for i in $(seq 1 55); do echo "file $i" > "$SAMPLE_DIR/many-files/file-$i.txt"; done
```
2. Navigate to `many-files` in the gallery
3. Verify the large folder warning appears with item count and "Show contents" button
4. Click "Show contents" and verify the gallery loads
5. Take a screenshot: `desktop-large-folder-warning.png` (capture before clicking)
6. Take a screenshot: `desktop-large-folder-loaded.png` (capture after clicking)

### 9. File Click Navigation

1. Click an image card in the gallery
2. Verify the viewer panel switches to show the full-size image (ImageViewer)
3. Press browser back button
4. Verify the gallery reappears
5. Take a screenshot: `desktop-file-click.png` (showing the image viewer)

### 10. Report

Write your JSON report to `$MINIH_OUTPUT_PATH`. Include:

- Summary of all visual checks (pass/fail per viewport)
- Screenshot paths (all captured)
- Issues found (any visual bugs, layout problems, theme issues)
- Verdict: `"pass"` if all checks pass, `"fail"` if blocking issues, `"partial"` if minor issues
- Retrospective (see below)

### 11. Retrospective

Answer honestly:

- **workedWell**: What looked great? Which card types rendered well? How was the overall visual quality?
- **confusing**: Any cards that looked broken or off? Any layout issues? Missing states?
- **magicWand**: One concrete improvement to the gallery UX.
- **visualQuality**: Rate the overall polish from 1-10 and explain.
- **improvementSuggestions**: 1-3 specific visual or interaction improvements.

### 12. Cleanup

Remove the test directory:
```bash
rm -rf "$SAMPLE_DIR"
```

## Output

Write your structured JSON report to `$MINIH_OUTPUT_PATH`. The report must conform to the output-schema.json in this agent's folder. After writing the report, run `minih check` to validate it against the schema.
