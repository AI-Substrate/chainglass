# =============================================================================
# Chainglass Agentic Development Harness — Dockerfile
#
# Multi-stage build for running the full Chainglass dev environment in Docker.
# Designed for OrbStack on macOS (also works with Docker Desktop).
#
# Stage 1 (deps): Install pnpm + system deps for native modules (node-pty)
# Stage 2 (dev):  Full monorepo dev environment with HMR
#
# Usage:
#   docker compose up     (from harness/ directory)
#   just dev              (from harness/ directory)
#
# Key design decisions:
#   - Debian bookworm-slim (not Alpine) — node-pty needs glibc
#   - Source code bind-mounted from host (not COPY'd) — enables HMR
#   - Named volume for node_modules — avoids macOS↔Linux binary conflicts
#   - pnpm install runs in entrypoint on first boot (cold start ~3-5 min)
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: deps — system dependencies + pnpm
# ---------------------------------------------------------------------------
FROM node:20.19.0-bookworm-slim AS deps

# System deps for node-pty native compilation and git worktree support
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    git \
    tmux \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# ---------------------------------------------------------------------------
# Stage 2: dev — full monorepo dev environment
# ---------------------------------------------------------------------------
FROM deps AS dev

# Install Playwright Chromium + system deps for browser automation (Phase 2 ready)
RUN npx -y playwright@1.52.0 install --with-deps chromium

# Environment
ENV NODE_ENV=development
ENV DISABLE_AUTH=true
ENV TERMINAL_ALLOWED_BASE=/app
ENV TERMINAL_WS_HOST=0.0.0.0
ENV PORT=3000
# Auth secret for next-auth (dev-only, not sensitive)
ENV AUTH_SECRET=harness-dev-secret-not-for-production

WORKDIR /app

# Source code will be bind-mounted at /app
# node_modules will be a named Docker volume at /app/node_modules

# Copy entrypoint
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Expose ports: Next.js dev server, terminal WebSocket sidecar, CDP (future Phase 2)
EXPOSE 3000 4500 9222

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
