/**
 * esbuild Configuration for CLI Package
 *
 * Bundles the CLI for portable distribution via npx.
 *
 * Per Critical Discovery 06: CLI bundle must include workspace dependencies
 * (@chainglass/shared, chalk) but externalize runtime-loaded deps (pino).
 */
import * as esbuild from 'esbuild';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Build mode: 'development' or 'production'
const mode = process.argv[2] || 'production';

async function build() {
  console.log(`Building CLI in ${mode} mode...`);

  const outdir = resolve(__dirname, 'dist');

  // Clean dist directory
  if (existsSync(outdir)) {
    rmSync(outdir, { recursive: true });
  }
  mkdirSync(outdir, { recursive: true });

  // Bundle CLI with esbuild
  await esbuild.build({
    entryPoints: [resolve(__dirname, 'src/bin/cg.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: resolve(outdir, 'cli.cjs'),

    // Per Critical Discovery 06: Bundle workspace packages
    packages: 'bundle',

    // External: Node.js builtins and runtime-loaded dependencies
    external: [
      // Node.js builtins - must be external for ESM
      'node:*',
      'fs',
      'path',
      'url',
      'child_process',
      'events',
      'stream',
      'util',
      'os',
      'tty',
      'assert',
      'process',
      // Runtime-loaded dependencies
      'pino', // Loaded at runtime by PinoLoggerAdapter
      'pino-pretty', // Optional pino transport
    ],

    // Note: Shebang is added to the package.json bin configuration,
    // not to the bundled file itself. Node.js ESM modules should not
    // have shebangs when run via `node file.js`.

    // Source maps for debugging
    sourcemap: mode === 'development',

    // Minify in production
    minify: mode === 'production',

    // Log level
    logLevel: 'info',
  });

  console.log('CLI bundled successfully to dist/cli.cjs');

  // Copy standalone web assets if available
  await copyStandaloneAssets(outdir);
}

/**
 * Copy Next.js standalone assets to CLI dist directory.
 *
 * Per Critical Insight #5: Next.js standalone doesn't include public/ or .next/static/
 * These must be copied separately.
 */
async function copyStandaloneAssets(outdir: string) {
  const webRoot = resolve(__dirname, '..', '..', 'apps', 'web');
  const standaloneRoot = resolve(webRoot, '.next', 'standalone');

  if (!existsSync(standaloneRoot)) {
    console.log('Standalone assets not found. Run `pnpm -F @chainglass/web build` first.');
    console.log(`Looking for: ${standaloneRoot}`);
    return;
  }

  console.log('Copying standalone assets...');

  const destWebDir = resolve(outdir, 'web');
  mkdirSync(destWebDir, { recursive: true });

  // 1. Copy the entire standalone directory structure
  const standaloneAppsWeb = resolve(standaloneRoot, 'apps', 'web');
  if (existsSync(standaloneAppsWeb)) {
    const destStandalone = resolve(destWebDir, 'standalone', 'apps', 'web');
    mkdirSync(dirname(destStandalone), { recursive: true });
    cpSync(standaloneAppsWeb, destStandalone, { recursive: true });
    console.log('  - Copied standalone server');
  }

  // 2. Copy standalone node_modules (dependencies, including .pnpm)
  // Use dereference: true to follow symlinks (pnpm uses symlinks)
  const standaloneNodeModules = resolve(standaloneRoot, 'node_modules');
  if (existsSync(standaloneNodeModules)) {
    const destNodeModules = resolve(destWebDir, 'standalone', 'node_modules');
    cpSync(standaloneNodeModules, destNodeModules, { recursive: true, dereference: true });
    console.log('  - Copied standalone node_modules (dereferenced symlinks)');
  }

  // 3. Copy .next/static (CSS, JS chunks)
  // Per Critical Insight #5: This must be inside the standalone apps/web/.next/ directory
  const staticDir = resolve(webRoot, '.next', 'static');
  if (existsSync(staticDir)) {
    const destStatic = resolve(destWebDir, 'standalone', 'apps', 'web', '.next', 'static');
    mkdirSync(destStatic, { recursive: true });
    cpSync(staticDir, destStatic, { recursive: true });
    console.log('  - Copied .next/static');
  }

  // 4. Copy public/ folder if it exists
  const publicDir = resolve(webRoot, 'public');
  if (existsSync(publicDir)) {
    const destPublic = resolve(destWebDir, 'standalone', 'apps', 'web', 'public');
    cpSync(publicDir, destPublic, { recursive: true });
    console.log('  - Copied public/');
  } else {
    console.log('  - No public/ folder to copy');
  }

  // 5. FIX-005: Dynamically find styled-jsx to avoid hardcoded version paths
  // Next.js require-hook.js expects styled-jsx to be resolvable from the standalone node_modules
  const pnpmDir = resolve(standaloneRoot, 'node_modules', '.pnpm');
  let styledJsxSource: string | null = null;

  if (existsSync(pnpmDir)) {
    const pnpmEntries = readdirSync(pnpmDir);
    const styledJsxEntry = pnpmEntries.find((entry) => entry.startsWith('styled-jsx@'));
    if (styledJsxEntry) {
      styledJsxSource = resolve(pnpmDir, styledJsxEntry, 'node_modules', 'styled-jsx');
    }
  }

  const destStyledJsx = resolve(destWebDir, 'standalone', 'node_modules', 'styled-jsx');
  if (styledJsxSource && existsSync(styledJsxSource) && !existsSync(destStyledJsx)) {
    cpSync(styledJsxSource, destStyledJsx, { recursive: true, dereference: true });
    console.log('  - Fixed styled-jsx for pnpm compatibility');
  } else if (!styledJsxSource) {
    console.log('  - Warning: styled-jsx not found (may not be needed)');
  }

  console.log('Standalone assets copied successfully');
}

build().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
