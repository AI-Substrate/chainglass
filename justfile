# Chainglass Development Commands
# Usage: just <command>
# Run `just --list` to see all available commands

# Default recipe - show available commands
default:
    @just --list

# Install dependencies and link CLI globally
install:
    pnpm install
    @cd packages/cli && pnpm link --global 2>/dev/null || echo "Note: Run 'pnpm setup' and restart your shell to enable global 'cg' command"

# Start development server
dev:
    pnpm turbo dev

# Build all packages
build:
    pnpm turbo build

# Run tests
test:
    pnpm vitest run --config test/vitest.config.ts

# Run linter
lint:
    pnpm biome check .

# Format code
format:
    pnpm biome format --write .

# Fix, format, and test (fft) - full quality check sequence
fft: lint format test

# Run TypeScript type checking
typecheck:
    pnpm tsc --noEmit

# Run all quality checks
check: lint typecheck test

# Clean build artifacts
clean:
    rm -rf packages/*/dist apps/*/dist apps/*/.next node_modules/.cache

# Reset everything (clean + reinstall)
reset: clean
    rm -rf node_modules packages/*/node_modules apps/*/node_modules pnpm-lock.yaml
    pnpm install
