# Workshop: Docker Container Setup

**Type**: Integration Pattern
**Plan**: 067-harness
**Spec**: [exploration.md](../exploration.md)
**Created**: 2026-03-06
**Status**: Draft

**Related Documents**:
- [exploration.md](../exploration.md)
- 002-harness-folder-and-agentic-prompts.md (companion workshop)

**Domain Context**:
- **Primary Domain**: External tooling (not a domain)
- **Related Domains**: All domains are test targets

---

## Purpose

Define the complete Docker containerization strategy for the agentic development harness, enabling agents to start/stop/rebuild a fully functional Chainglass instance with browser automation capabilities.

## Key Questions Addressed

- What goes in the Dockerfile (multi-stage design)?
- How does dev mode work with volume mounts and HMR?
- How do Playwright browsers coexist in the container?
- What ports/networking is needed?
- How does the agent start/stop/restart the container?
- What env vars are required?
- How does auth bypass work for testing?
- How does the terminal sidecar start inside Docker?

---

## 1. Container Architecture Diagram

```
┌─── Host Machine ──────────────────────────────────────────────────────────────┐
│                                                                               │
│  Agent (Copilot CLI / Claude Code)                                            │
│    ├── harness dev          → docker compose up                               │
│    ├── harness exec <cmd>   → docker compose exec chainglass-dev <cmd>        │
│    └── harness health       → curl :3000/api/health + playwright check        │
│                                                                               │
│  Volume Mounts:                                                               │
│    ./  ─────────────────────►  /app  (full monorepo, read/write)              │
│    chainglass_node_modules ─►  /app/node_modules  (named volume)              │
│    chainglass_dot_next ─────►  /app/apps/web/.next  (named volume)            │
│    .chainglass/ ────────────►  /app/.chainglass  (bind mount)                 │
│                                                                               │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─── Docker Container: chainglass-dev ────────────────────────────────────┐  │
│  │                                                                         │  │
│  │  ┌─────────────────────┐   ┌──────────────────────┐                     │  │
│  │  │  Next.js Dev Server │   │  Terminal Sidecar     │                     │  │
│  │  │  (Turbopack HMR)    │   │  (node-pty + tmux)    │                     │  │
│  │  │  :3000              │   │  :4500 (WebSocket)    │                     │  │
│  │  │                     │   │                        │                     │  │
│  │  │  /_next/mcp         │   │  PTY ↔ tmux sessions  │                     │  │
│  │  └─────────────────────┘   └──────────────────────┘                     │  │
│  │                                                                         │  │
│  │  ┌─────────────────────┐   ┌──────────────────────┐                     │  │
│  │  │  Playwright         │   │  System Tools         │                     │  │
│  │  │  Chromium (headless)│   │  git ≥2.13            │                     │  │
│  │  │  /dev/shm (shared)  │   │  tmux                 │                     │  │
│  │  │  CDP on :9222       │   │  Node 20.19.0         │                     │  │
│  │  └─────────────────────┘   │  pnpm 9.15.4          │                     │  │
│  │                             └──────────────────────┘                     │  │
│  │                                                                         │  │
│  │  Port Map:  host:3000 → container:3000  (Next.js)                       │  │
│  │             host:4500 → container:4500  (Terminal WS)                    │  │
│  │             host:9222 → container:9222  (CDP, optional)                  │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Dockerfile Design (Multi-Stage)

The Dockerfile lives at `harness/Dockerfile`. Three stages: dependency install, dev environment, and a minimal mention of prod for Plan 2.

### Why Debian, not Alpine

`node-pty` compiles native C++ bindings that link against glibc. Alpine uses musl libc, which causes runtime segfaults with node-pty's PTY handling. Debian-based images avoid this entirely.

### Full Dockerfile

```dockerfile
# =============================================================================
# Stage 1: deps — Install all monorepo dependencies with pnpm
# =============================================================================
FROM node:20.19.0-bookworm-slim AS deps

# Install build tools for native modules (node-pty needs gcc, make, python3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm at the exact version the project uses
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy dependency manifests first (cache layer — only re-runs on lockfile change)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY patches/ ./patches/

# Copy all package.json files for workspace resolution
# Each workspace package needs its manifest for pnpm to resolve the graph
COPY apps/web/package.json ./apps/web/
COPY apps/cli/package.json ./apps/cli/
COPY packages/shared/package.json ./packages/shared/
COPY packages/workflow/package.json ./packages/workflow/
COPY packages/positional-graph/package.json ./packages/positional-graph/
COPY packages/workgraph/package.json ./packages/workgraph/
COPY packages/mcp-server/package.json ./packages/mcp-server/

# Install all dependencies including devDependencies (needed for dev mode)
# --frozen-lockfile ensures reproducible installs
RUN pnpm install --frozen-lockfile

# =============================================================================
# Stage 2: dev — Full development environment with Playwright + system tools
# =============================================================================
FROM node:20.19.0-bookworm-slim AS dev

# System dependencies:
# - git ≥2.13 for worktree support (Debian bookworm ships 2.39+)
# - tmux for terminal sidecar PTY sessions
# - python3/gcc for node-pty rebuild if node_modules mounted fresh
# - Playwright system deps (libx11, libnss, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    tmux \
    python3 \
    make \
    gcc \
    g++ \
    curl \
    # Playwright Chromium dependencies
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy installed node_modules from deps stage
# In dev mode with volume mounts, this provides the baseline
# A named volume overlays /app/node_modules to avoid host conflicts
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/apps/cli/node_modules ./apps/cli/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/workflow/node_modules ./packages/workflow/node_modules
COPY --from=deps /app/packages/positional-graph/node_modules ./packages/positional-graph/node_modules
COPY --from=deps /app/packages/workgraph/node_modules ./packages/workgraph/node_modules
COPY --from=deps /app/packages/mcp-server/node_modules ./packages/mcp-server/node_modules

# Install Playwright Chromium (headless only — ~300MB)
# PLAYWRIGHT_BROWSERS_PATH controls where browsers are cached
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers
RUN npx playwright install chromium

# Entrypoint script handles startup sequence
COPY harness/scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000 4500 9222

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["dev"]

# =============================================================================
# Stage 3: prod — Standalone build for CI/built mode (Plan 2 — future)
# =============================================================================
# FROM node:20.19.0-bookworm-slim AS prod
# WORKDIR /app
# COPY --from=builder /app/apps/web/.next/standalone ./
# COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
# COPY --from=builder /app/apps/web/public ./apps/web/public
# ENV NODE_ENV=production
# EXPOSE 3000
# CMD ["node", "apps/web/server.js"]
```

### Entrypoint Script (`harness/scripts/docker-entrypoint.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-dev}"

case "$MODE" in
  dev)
    echo "[harness] Starting in dev mode..."

    # If node_modules volume is empty (first run), install deps
    if [ ! -d "/app/node_modules/.pnpm" ]; then
      echo "[harness] node_modules empty — running pnpm install..."
      pnpm install --frozen-lockfile
    fi

    # Build workspace packages (shared, workflow, etc.) so imports resolve
    echo "[harness] Building workspace packages..."
    pnpm turbo build --filter='./packages/*'

    # Start Next.js dev server + terminal sidecar concurrently
    echo "[harness] Starting Next.js dev server (Turbopack) on :${PORT:-3000}..."
    echo "[harness] Starting terminal sidecar on :${TERMINAL_WS_PORT:-4500}..."

    exec pnpm concurrently --names "next,terminal" --prefix-colors "blue,green" \
      "pnpm turbo dev -- --port ${PORT:-3000} --hostname 0.0.0.0" \
      "pnpm tsx watch --env-file=apps/web/.env.local apps/web/src/features/064-terminal/server/terminal-ws.ts"
    ;;

  shell)
    echo "[harness] Starting interactive shell..."
    exec /bin/bash
    ;;

  build)
    echo "[harness] Running full build..."
    pnpm turbo build
    ;;

  test)
    echo "[harness] Running test suite..."
    pnpm vitest run
    ;;

  *)
    echo "[harness] Running custom command: $*"
    exec "$@"
    ;;
esac
```

---

## 3. docker-compose.yml

Lives at `harness/docker-compose.yml`. This is the primary interface agents use.

```yaml
# harness/docker-compose.yml
# Dev mode: volume-mounted source code with HMR
#
# Usage:
#   docker compose up -d          # Start dev container
#   docker compose logs -f        # Stream all logs
#   docker compose exec chainglass-dev bash  # Shell into container
#   docker compose down           # Stop and remove

services:
  chainglass-dev:
    build:
      context: ..
      dockerfile: harness/Dockerfile
      target: dev
    container_name: chainglass-dev
    ports:
      - "${PORT:-3000}:${PORT:-3000}"           # Next.js dev server
      - "${TERMINAL_WS_PORT:-4500}:${TERMINAL_WS_PORT:-4500}"  # Terminal sidecar
      - "9222:9222"                               # CDP (Playwright debug)
    volumes:
      # Mount entire monorepo for HMR — file changes on host propagate instantly
      - ..:/app

      # Named volumes overlay host node_modules to avoid platform conflicts
      # (host may be macOS arm64, container is linux amd64)
      - chainglass_node_modules:/app/node_modules
      - chainglass_web_node_modules:/app/apps/web/node_modules
      - chainglass_cli_node_modules:/app/apps/cli/node_modules
      - chainglass_shared_node_modules:/app/packages/shared/node_modules
      - chainglass_workflow_node_modules:/app/packages/workflow/node_modules
      - chainglass_pg_node_modules:/app/packages/positional-graph/node_modules
      - chainglass_wg_node_modules:/app/packages/workgraph/node_modules
      - chainglass_mcp_node_modules:/app/packages/mcp-server/node_modules

      # Preserve .next build cache across restarts
      - chainglass_dot_next:/app/apps/web/.next
    environment:
      - NODE_ENV=development
      - PORT=${PORT:-3000}
      - TERMINAL_WS_PORT=${TERMINAL_WS_PORT:-4500}
      - TERMINAL_WS_HOST=0.0.0.0
      - TERMINAL_ALLOWED_BASE=/app
      - DISABLE_AUTH=true
      - AUTH_SECRET=${AUTH_SECRET:-harness-dev-secret-not-for-production}
      # Turbopack polling for Docker volume mounts (see Section 9)
      - WATCHPACK_POLLING=true
      - CHOKIDAR_USEPOLLING=true
      # Playwright browser location
      - PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers
    # Shared memory for Chromium (default 64MB is too small)
    shm_size: '2gb'
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${PORT:-3000}/api/health"]
      interval: 10s
      timeout: 5s
      retries: 30          # Dev server can take 30-60s to compile
      start_period: 60s    # Don't count failures during initial build
    restart: unless-stopped
    # init ensures proper signal handling for child processes
    init: true

volumes:
  chainglass_node_modules:
  chainglass_web_node_modules:
  chainglass_cli_node_modules:
  chainglass_shared_node_modules:
  chainglass_workflow_node_modules:
  chainglass_pg_node_modules:
  chainglass_wg_node_modules:
  chainglass_mcp_node_modules:
  chainglass_dot_next:
```

### Compose `.env` file (`harness/.env`)

```bash
# Default port configuration — override to run multiple instances
PORT=3000
TERMINAL_WS_PORT=4500
AUTH_SECRET=harness-dev-secret-not-for-production
```

---

## 4. Volume Mount Strategy

### Problem

The monorepo has native modules (`node-pty`) compiled for the host platform (macOS arm64). Docker runs Linux amd64/arm64. If host `node_modules` are mounted directly into the container, native binaries crash.

### Solution: Named Volume Overlay Pattern

```
Host filesystem                    Container filesystem
─────────────────                  ────────────────────
./                 ──bind mount──► /app/
  ├── apps/web/src/  (HMR ✓)        ├── apps/web/src/  (same files)
  ├── packages/      (HMR ✓)        ├── packages/      (same files)
  ├── node_modules/  (macOS)         ├── node_modules/  ◄── named volume (Linux)
  └── apps/web/                      └── apps/web/
      └── node_modules/ (macOS)          └── node_modules/ ◄── named volume (Linux)
```

Named volumes **shadow** the host's `node_modules` directories. The container gets its own Linux-native copies while source files pass through for HMR.

### Directory Breakdown

| Mount | Type | Purpose |
|-------|------|---------|
| `..:/app` | Bind | Entire monorepo — source code, configs, scripts |
| `chainglass_node_modules:/app/node_modules` | Named | Root node_modules with Linux-native binaries |
| `chainglass_web_node_modules:/app/apps/web/node_modules` | Named | Web app deps (node-pty prebuild for Linux) |
| `chainglass_cli_node_modules:/app/apps/cli/node_modules` | Named | CLI deps |
| `chainglass_*_node_modules:/app/packages/*/node_modules` | Named | Per-package deps |
| `chainglass_dot_next:/app/apps/web/.next` | Named | Build cache — survives `docker compose down` |

### When to Rebuild node_modules

The entrypoint checks for `/app/node_modules/.pnpm` — if missing (first run or after `docker volume rm`), it runs `pnpm install`. To force a full reinstall:

```bash
# Nuke all named volumes and rebuild from scratch
docker compose down -v
docker compose up -d
```

### .chainglass Data Directory

The `.chainglass/` directory at monorepo root stores workspace instances, workflow data, and test results. It is part of the bind mount (`..:/app`) so data persists on the host and is visible to both the agent and the container.

---

## 5. Playwright in Docker

### Chromium Installation

Playwright's Chromium is installed during image build (Stage 2) at `/opt/playwright-browsers`. The `PLAYWRIGHT_BROWSERS_PATH` env var tells Playwright where to find it at runtime.

```dockerfile
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers
RUN npx playwright install chromium
```

Only Chromium is installed (not Firefox/WebKit) to keep image size manageable. Cross-browser testing is a Plan 2 concern.

### Shared Memory Configuration

Chromium renders pages using shared memory (`/dev/shm`). Docker's default 64MB allocation causes tab crashes on non-trivial pages. The compose file sets `shm_size: '2gb'`.

Alternative approach (mount host's `/dev/shm`):
```yaml
volumes:
  - /dev/shm:/dev/shm
```

The `shm_size` approach is preferred because it's explicit and portable.

### Browser Contexts for Parallel Testing

Playwright creates isolated browser contexts (separate cookies, storage, sessions) within a single Chromium instance. Each test or agent gets its own context:

```typescript
// Each context is fully isolated — no shared state
const browser = await chromium.launch({ headless: true });

const desktopCtx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});

const tabletCtx = await browser.newContext({
  ...devices['iPad Pro'],
});

const mobileCtx = await browser.newContext({
  ...devices['iPhone 14'],
});

// 8-16 concurrent contexts per browser instance
```

### Screenshot and Video Capture

Playwright outputs go to a mounted directory visible to both host and container:

```typescript
// Screenshots
await page.screenshot({
  path: '/app/harness/results/screenshots/homepage-desktop.png',
  fullPage: true,
});

// Video capture (enabled per-context)
const context = await browser.newContext({
  recordVideo: { dir: '/app/harness/results/videos/' },
});
```

These paths are under the bind mount, so results appear on the host filesystem immediately.

### CDP Exposure for External Connections

Port 9222 is mapped for Chrome DevTools Protocol access. This allows an agent on the host to connect to the container's Chromium for debugging:

```typescript
// Launch with CDP server
const browser = await chromium.launch({
  headless: true,
  args: ['--remote-debugging-port=9222', '--remote-debugging-address=0.0.0.0'],
});

// External agent connects via CDP
const browser = await chromium.connectOverCDP('http://localhost:9222');
```

---

## 6. Startup Sequence

What happens when the agent runs `harness dev` (which wraps `docker compose up -d`):

```
Step 1: Docker Compose Up
  └─► Pulls/builds image if needed (~2-5 min first time, cached after)
  └─► Creates named volumes (if first run)
  └─► Starts container with bind mount + volume overlays

Step 2: Entrypoint — Dependency Check
  └─► Checks /app/node_modules/.pnpm exists
  └─► If missing: runs `pnpm install --frozen-lockfile` (~60-90s)
  └─► If exists: skips (instant)

Step 3: Workspace Package Build
  └─► `pnpm turbo build --filter='./packages/*'`
  └─► Builds: shared → workflow → positional-graph → workgraph → mcp-server
  └─► 4-level dependency chain, turbo caches results (~5s cached, ~30s cold)

Step 4: Concurrent Server Startup
  ├─► Next.js dev server (Turbopack)
  │     └─► Listens on 0.0.0.0:3000
  │     └─► Initial compilation: ~10-20s
  │     └─► MCP endpoint auto-exposed at /_next/mcp
  │
  └─► Terminal WebSocket sidecar
        └─► Listens on 0.0.0.0:4500
        └─► Spawns tmux sessions on connection
        └─► PORT=3000 → sidecar derives 3000+1500=4500

Step 5: Health Check Loop
  └─► Docker health check: curl http://localhost:3000/api/health
  └─► start_period=60s (no failures counted during initial compile)
  └─► interval=10s, retries=30
  └─► Container marked "healthy" when /api/health returns 200

Step 6: MCP Endpoint Available
  └─► Agent can query: GET http://localhost:3000/_next/mcp
  └─► Available tools: get_routes, get_errors, get_page_metadata, get_project_metadata

Step 7: Playwright Ready
  └─► Chromium binary at /opt/playwright-browsers
  └─► Agent launches browser on demand (not pre-started)
  └─► First browser launch: ~2s cold start
```

### Timing Summary

| Phase | Cold Start | Warm Start |
|-------|-----------|------------|
| Image build | 3-5 min | 0s (cached) |
| pnpm install | 60-90s | 0s (volume exists) |
| Package build | 30s | 5s (turbo cached) |
| Next.js compile | 10-20s | 3-5s (HMR reconnect) |
| Total to healthy | ~2-3 min | ~10-15s |

---

## 7. Agent Interaction Commands

These commands live in `harness/justfile` and wrap Docker Compose operations. Agents call them via shell execution.

```bash
# Build or rebuild the Docker image (no cache on rebuild)
harness build
# → docker compose -f harness/docker-compose.yml build

harness build --no-cache
# → docker compose -f harness/docker-compose.yml build --no-cache

# Start the dev container (detached)
harness dev
# → docker compose -f harness/docker-compose.yml up -d
# → Waits for health check to pass
# → Prints: "Chainglass dev ready at http://localhost:3000"

# Restart the dev server inside the container (without rebuilding container)
harness dev --restart
# → docker compose -f harness/docker-compose.yml exec chainglass-dev \
#     sh -c "kill -TERM $(pgrep -f 'next dev') $(pgrep -f 'terminal-ws')"
# → Entrypoint's `exec` respawns the processes via init

# Stop the container
harness stop
# → docker compose -f harness/docker-compose.yml down

# Stop and remove volumes (full reset)
harness stop --clean
# → docker compose -f harness/docker-compose.yml down -v

# Stream server logs (both Next.js and terminal sidecar)
harness logs
# → docker compose -f harness/docker-compose.yml logs -f

# Stream only Next.js logs
harness logs --next
# → docker compose -f harness/docker-compose.yml logs -f | grep '\[next\]'

# Run arbitrary command inside the container
harness exec <cmd>
# → docker compose -f harness/docker-compose.yml exec chainglass-dev <cmd>

# Examples:
harness exec pnpm test
harness exec pnpm turbo build
harness exec bash                    # Interactive shell

# Health check (returns JSON)
harness health
# → curl -s http://localhost:3000/api/health | jq .
# → Checks: Next.js responding, MCP endpoint available, terminal sidecar alive

# Check container status
harness status
# → docker compose -f harness/docker-compose.yml ps
```

### Justfile Implementation (`harness/justfile`)

```just
# Harness commands for agentic development
# Usage: just -f harness/justfile <command>

compose := "docker compose -f harness/docker-compose.yml"

# Build the Docker image
build *args:
    {{compose}} build {{args}}

# Start dev container, wait for healthy
dev *args:
    {{compose}} up -d {{args}}
    @echo "Waiting for health check..."
    @timeout 180 sh -c 'until docker inspect --format="{{{{.State.Health.Status}}}}" chainglass-dev 2>/dev/null | grep -q healthy; do sleep 2; done'
    @echo "Chainglass dev ready at http://localhost:${PORT:-3000}"

# Stop container
stop *args:
    {{compose}} down {{args}}

# Stream logs
logs *args:
    {{compose}} logs -f {{args}}

# Execute command in container
exec *args:
    {{compose}} exec chainglass-dev {{args}}

# Health check
health:
    @curl -sf http://localhost:${PORT:-3000}/api/health | python3 -m json.tool 2>/dev/null || echo '{"status":"unreachable"}'

# Container status
status:
    {{compose}} ps
```

---

## 8. Environment Variables Reference

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | `3000` | No | Next.js dev server port |
| `TERMINAL_WS_PORT` | `4500` | No | Terminal WebSocket sidecar port. Auto-derived as PORT+1500 if not set. |
| `TERMINAL_WS_HOST` | `0.0.0.0` | No | Sidecar bind address. Must be `0.0.0.0` in Docker for port mapping to work. |
| `TERMINAL_ALLOWED_BASE` | `/app` | Yes | Base directory for allowed terminal CWD paths. Set to `/app` (monorepo root in container). |
| `DISABLE_AUTH` | `true` | Yes (harness) | Bypasses GitHub OAuth in middleware (`proxy.ts`) and API route session checks (`auth.ts`). Must be `true` for agent testing. |
| `AUTH_SECRET` | (generated) | Yes | Session encryption key for next-auth. Any non-empty string works when `DISABLE_AUTH=true`. |
| `AUTH_GITHUB_ID` | — | No | GitHub OAuth App client ID. Not needed when auth is disabled. |
| `AUTH_GITHUB_SECRET` | — | No | GitHub OAuth App client secret. Not needed when auth is disabled. |
| `NODE_ENV` | `development` | No | Must be `development` for dev mode (HMR, error overlays). |
| `WATCHPACK_POLLING` | `true` | Yes (Docker) | Enables filesystem polling for Turbopack file watching. Required when source is volume-mounted. |
| `CHOKIDAR_USEPOLLING` | `true` | Yes (Docker) | Enables polling for chokidar-based watchers (tsx watch for sidecar). |
| `PLAYWRIGHT_BROWSERS_PATH` | `/opt/playwright-browsers` | Yes | Location of Playwright browser binaries in container. |
| `ACTIVITY_LOG_POLL_MS` | `10000` | No | Terminal activity log polling interval (ms). |

### Auth Bypass Mechanics

When `DISABLE_AUTH=true`:
1. **Middleware** (`proxy.ts`): Skips the auth redirect — all routes are accessible without login.
2. **API routes** (`auth.ts`): Session checks return a synthetic session object instead of rejecting unauthenticated requests.
3. **Terminal sidecar**: JWT verification is bypassed — WebSocket connections are accepted without tokens.

This is already implemented in the codebase. The harness simply sets the env var.

---

## 9. Known Gotchas & Mitigations

### 9.1 node-pty Native Compilation

**Problem**: `node-pty` includes C++ bindings that compile at install time. Alpine Linux uses musl libc which causes segfaults with PTY operations. Even on Debian, the host's macOS-compiled binaries won't work in Linux containers.

**Mitigation**:
- Use `node:20.19.0-bookworm-slim` (Debian, glibc).
- Install `python3 make gcc g++` in the image for native compilation.
- Named volume shadows host `node_modules` so Linux-compiled `node-pty` is used inside the container.
- `node-pty` has prebuilds for `linux-x64` and `linux-arm64` — pnpm downloads the correct one at install time.

### 9.2 pnpm Symlink Behavior in Containers

**Problem**: pnpm uses symlinks extensively for its `node_modules/.pnpm` store. Docker volumes and bind mounts handle symlinks correctly, but some edge cases exist with cross-device symlink resolution.

**Mitigation**:
- Named volumes for `node_modules` keep the pnpm store on the same filesystem.
- `--frozen-lockfile` ensures reproducible installs.
- If symlinks break, `docker compose down -v && docker compose up -d` forces a clean install.

### 9.3 Turbopack File Watching with Volume Mounts

**Problem**: Docker bind mounts on macOS use gRPC-FUSE or VirtioFS for filesystem events. Neither reliably forwards inotify events. Turbopack may not detect file changes for HMR.

**Mitigation**:
- Set `WATCHPACK_POLLING=true` — Turbopack's underlying watcher falls back to polling.
- Set `CHOKIDAR_USEPOLLING=true` — the tsx watcher (terminal sidecar) also uses polling.
- Polling interval is typically 1000ms — introduces ~1s delay to HMR. Acceptable for agent workflows where the agent waits for compilation anyway.

**Performance note**: Docker Desktop's VirtioFS backend (default on macOS) is significantly faster than gRPC-FUSE. Ensure Docker Desktop settings use VirtioFS. On Linux hosts, bind mounts use native inotify and polling is not needed — but leaving the env vars set is harmless.

### 9.4 Shared Memory for Chromium

**Problem**: Chromium uses `/dev/shm` for inter-process communication. Docker's default 64MB allocation causes crashes on pages with complex rendering (Mermaid diagrams, CodeMirror editors, large workflow graphs).

**Mitigation**: `shm_size: '2gb'` in compose file. This is generous but prevents intermittent Chromium OOM crashes that are extremely difficult to debug.

### 9.5 Git Worktree Operations Inside Docker

**Problem**: Git worktrees reference the parent `.git` directory via absolute paths. If the host monorepo is at `/Users/jordanknight/substrate/066-wf-real-agents` but the container mounts it at `/app`, worktree paths break.

**Mitigation**:
- Worktrees created inside the container use `/app/...` paths and work correctly within the container.
- Worktrees created on the host use host paths and break inside the container.
- **Rule**: The harness seed script creates worktrees inside the container, never on the host. `TERMINAL_ALLOWED_BASE=/app` enforces this.

### 9.6 Port Conflicts

**Problem**: If the host already has a Next.js dev server on port 3000 (from `just dev`), Docker port mapping fails.

**Mitigation**:
- Stop host dev server before starting container: `just dev` and `harness dev` are mutually exclusive.
- Alternatively, override ports: `PORT=3001 TERMINAL_WS_PORT=4501 docker compose up -d`.
- The harness `dev` command should check for port conflicts and emit a clear error.

### 9.7 Build Context Size

**Problem**: The Docker build context is the monorepo root (`..` from `harness/`). This includes `node_modules/` (~1GB), `.next/`, `.git/`, etc. Sending this to the Docker daemon is slow.

**Mitigation**: Add a `.dockerignore` at monorepo root:

```dockerignore
# harness/.dockerignore (or monorepo root .dockerignore)
node_modules
.next
.git
*.log
harness/results
.chainglass/instances
```

The Dockerfile only COPYs specific manifests in Stage 1 (not the whole tree), so the ignore file mainly speeds up context transfer. Stage 2 (dev) doesn't COPY source at all — it relies on the bind mount.

### 9.8 Container Time Drift

**Problem**: On macOS, Docker Desktop VMs can experience clock drift, causing JWT validation failures and incorrect timestamps.

**Mitigation**: Docker Desktop auto-syncs time. If drift is observed, restart Docker Desktop. Since `DISABLE_AUTH=true` skips JWT validation, this is a non-issue for the harness.

---

## 10. Open Questions

| # | Question | Status | Notes |
|---|----------|--------|-------|
| Q1 | Should Playwright be pre-installed in the image or installed at startup? | **RESOLVED** | Pre-installed in image (Stage 2). Installing at startup adds ~60s and requires internet access. |
| Q2 | Named volume per workspace package, or single root volume? | **RESOLVED** | Per-package named volumes. pnpm hoists some deps to root, others to workspace packages. A single volume would shadow all workspace `node_modules` which breaks pnpm's linking. |
| Q3 | Should the harness support arm64 Docker images natively? | **OPEN** | macOS developers on Apple Silicon run arm64 Docker. node-pty prebuilds exist for linux-arm64. Chromium supports arm64. No blockers, but needs testing. Default to platform-native builds (`--platform linux/arm64` on Apple Silicon). |
| Q4 | How to handle `pnpm-lock.yaml` changes while container is running? | **OPEN** | If a developer (or agent) adds a dependency, `pnpm-lock.yaml` changes on the host. The container sees the change via bind mount but `node_modules` is a named volume. Options: (a) agent runs `harness exec pnpm install`, (b) entrypoint watches lockfile, (c) require `harness stop --clean && harness dev`. Leaning toward (a) — explicit is better. |
| Q5 | Should we support `docker compose watch` (Compose Watch)? | **OPEN** | Docker Compose Watch can sync files and trigger rebuilds. But we already have Turbopack HMR via bind mounts. Compose Watch would add complexity for no clear benefit in dev mode. Revisit for prod/CI mode. |
| Q6 | CDP port (9222) — expose by default or only on demand? | **OPEN** | Exposing CDP allows external debugging but is a security surface. For dev harness this is fine. For CI mode, should be opt-in. Current design: exposed by default in dev compose, omitted in prod. |
| Q7 | How to handle `.env.local` secrets in the container? | **RESOLVED** | The bind mount exposes `apps/web/.env.local` from the host. The entrypoint script for the terminal sidecar already reads it via `--env-file`. For Next.js, env vars from compose override `.env.local`. Auth secrets are irrelevant since `DISABLE_AUTH=true`. |

---

## Appendix A: Image Size Estimates

| Component | Size |
|-----------|------|
| node:20.19.0-bookworm-slim (base) | ~200MB |
| System packages (git, tmux, build tools, Chromium deps) | ~150MB |
| pnpm + node_modules (all workspaces) | ~600MB |
| Playwright Chromium | ~300MB |
| **Total dev image** | **~1.25GB** |

For comparison, the prod image (Stage 3, future) would be ~150MB using standalone output.

## Appendix B: File Tree

```
harness/
├── Dockerfile
├── docker-compose.yml
├── .env                        # Default env vars
├── justfile                    # Agent-facing commands
├── scripts/
│   └── docker-entrypoint.sh    # Container startup logic
├── playwright.config.ts        # Browser test configuration (Phase 2)
├── test/                       # Browser tests (Phase 2)
└── results/                    # Test output (gitignored)
```

## Appendix C: Quick Start for Agents

```bash
# First time setup (build image + start container)
cd harness
just build
just dev
# → Wait for "Chainglass dev ready at http://localhost:3000"

# Verify everything works
just health
# → {"status":"ok","timestamp":"..."}

curl -s http://localhost:3000/_next/mcp
# → MCP endpoint responds

just exec npx playwright install --dry-run
# → Chromium already installed

# Make code changes on host — HMR applies in ~1-2s
# Run tests inside container
just exec pnpm vitest run

# Done for the day
just stop
```
