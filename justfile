# Chainglass Development Commands
# Usage: just <command>
# Run `just --list` to see all available commands

# Default recipe - show available commands
default:
    @just --list

# Install dependencies, build, and link CLI globally
install:
    pnpm install --ignore-scripts
    pnpm build
    pnpm install
    chmod +x apps/web/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper 2>/dev/null || true
    @cd apps/cli && pnpm link --global 2>/dev/null || echo "Note: Run 'pnpm setup' and restart your shell to enable global 'cg' command"

# Start development server (Next.js + terminal WebSocket sidecar)
# PORT env var controls both: Next.js listens on PORT, sidecar on PORT+1500
# If PORT not set, Next.js auto-selects and sidecar defaults to 3000+1500
dev:
    @cd apps/web && node -e "require('node-pty').spawn('/bin/echo',['ok'],{name:'x',cols:1,rows:1,cwd:'/tmp',env:{}})" 2>/dev/null || (echo "Error: node-pty can't spawn. Run: chmod +x apps/web/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper" && exit 1)
    pnpm concurrently --names "next,terminal" --prefix-colors "blue,green" \
      "pnpm turbo dev -- --port ${PORT:-3000}" \
      "PORT=${PORT:-3000} TERMINAL_WS_HOST=${TERMINAL_WS_HOST:-0.0.0.0} pnpm tsx watch apps/web/src/features/064-terminal/server/terminal-ws.ts"

# Start terminal WebSocket server only
dev-terminal:
    PORT=${PORT:-3000} pnpm tsx watch apps/web/src/features/064-terminal/server/terminal-ws.ts

# Start development server with HTTPS (enables clipboard API on remote devices)
dev-https:
    @cd apps/web && node -e "require('node-pty').spawn('/bin/echo',['ok'],{name:'x',cols:1,rows:1,cwd:'/tmp',env:{}})" 2>/dev/null || (echo "Error: node-pty can't spawn. Run: chmod +x apps/web/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper" && exit 1)
    PORT=${PORT:-3000} TERMINAL_WS_HOST=${TERMINAL_WS_HOST:-0.0.0.0} TERMINAL_WS_CERT=apps/web/certificates/localhost.pem TERMINAL_WS_KEY=apps/web/certificates/localhost-key.pem \
      pnpm concurrently --names "next,terminal" --prefix-colors "blue,green" \
        "pnpm turbo dev -- --port ${PORT:-3000} --experimental-https" \
        "pnpm tsx watch apps/web/src/features/064-terminal/server/terminal-ws.ts"

# Build all packages
build:
    pnpm turbo build

# Run tests
test:
    pnpm vitest run

# Run E2E agent tests (requires real agent CLIs, manually unskip tests first)
test-e2e:
    pnpm vitest run test/e2e/agent-cli-e2e.test.ts --config vitest.e2e.config.ts

# Run linter
lint:
    pnpm biome check .

# Format code
format:
    pnpm biome format --write .

# Fix, format, and test (fft) - full quality check sequence
fft: lint format build typecheck test

# Run TypeScript type checking
typecheck:
    pnpm tsc --noEmit

# Run all quality checks
check: lint typecheck test

# Clean Next.js server cache (.next directory)
clean-next:
    rm -rf apps/web/.next

# Clean build artifacts
clean:
    rm -rf packages/*/dist apps/*/dist apps/*/.next node_modules/.cache

# Reset everything (clean + reinstall)
reset: clean
    rm -rf node_modules packages/*/node_modules apps/*/node_modules pnpm-lock.yaml
    pnpm install

# Show graph status view gallery (all visual scenarios)
graph-gallery:
    npx tsx scripts/graph-status-gallery.ts

# Run drive() demo — creates a graph, drives it to completion with real scripts
drive-demo:
    npx tsx scripts/drive-demo.ts

test-advanced-pipeline *args:
    npx tsx scripts/test-advanced-pipeline.ts {{args}}

# Run tests for a specific plan/feature by number (e.g., just test-feature 040)
test-feature plan:
    pnpm vitest run --reporter=verbose $(find test -path "*{{plan}}*" -name "*.test.ts" 2>/dev/null | tr '\n' ' ')

# Watch tests for a specific plan/feature (re-runs on file change)
test-watch plan:
    pnpm vitest --reporter=verbose $(find test -path "*{{plan}}*" -name "*.test.ts" 2>/dev/null | tr '\n' ' ')

# Generate demo workflows for UI development (Plan 050)
dope *args:
    npx tsx scripts/dope-workflows.ts {{args}}

# Clean and regenerate all demo workflows
redope:
    npx tsx scripts/dope-workflows.ts clean
    npx tsx scripts/dope-workflows.ts
