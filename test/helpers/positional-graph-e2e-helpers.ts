/**
 * Shared E2E Helpers for Positional Graph Scripts
 *
 * Reusable utilities extracted from positional-graph-e2e.ts (Plan 026) for
 * use by multiple standalone E2E scripts. Provides:
 * - createTestServiceStack: wires real adapters + PositionalGraphService
 * - createTestWorkspaceContext: builds WorkspaceContext for a temp dir
 * - runCli: spawns CLI subprocess with --json, parses JSON envelope
 * - step/assert/unwrap/banner: assertion + output helpers
 *
 * Phase 8, Plan 032 — DYK #1 + DYK #3 decisions.
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { PositionalGraphService } from '@chainglass/positional-graph';
import { PositionalGraphAdapter } from '@chainglass/positional-graph/adapter';
import type {
  IPositionalGraphService,
  IWorkUnitLoader,
} from '@chainglass/positional-graph/interfaces';
import { NodeFileSystemAdapter, PathResolverAdapter, YamlParserAdapter } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

// ============================================
// CLI Subprocess Helper
// ============================================

const CLI_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../apps/cli/dist/cli.cjs'
);

export interface CliResult<T = Record<string, unknown>> {
  success: boolean;
  command: string;
  data: T;
  errors: Array<{ code: string; message: string }>;
  rawOutput: string;
}

/**
 * Run a CLI command as a subprocess with --json flag.
 * Parses the JSON envelope and returns structured result.
 */
export async function runCli<T = Record<string, unknown>>(
  args: string[],
  workspacePath: string
): Promise<CliResult<T>> {
  const fullArgs = [...args, '--json'];

  return new Promise((resolvePromise, reject) => {
    const proc = spawn('node', [CLI_PATH, ...fullArgs], {
      timeout: 30000,
      cwd: workspacePath,
      env: { ...process.env, CHAINGLASS_WORKSPACE: workspacePath },
    });
    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      // Find the JSON line in output (last line containing "success" or "error")
      const lines = stdout.trim().split('\n');
      let resultLine = '';
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('{') && (line.includes('"success"') || line.includes('"error"'))) {
          resultLine = line;
          break;
        }
      }
      if (!resultLine) resultLine = lines[lines.length - 1] ?? '{}';

      let data: T;
      let errors: Array<{ code: string; message: string }> = [];
      let command = '';

      try {
        const parsed = JSON.parse(resultLine);
        command = parsed.command ?? '';
        data = parsed.data ?? ({} as T);
        if (parsed.errors) {
          errors = parsed.errors;
        }
      } catch {
        data = {} as T;
        errors = [{ code: 'CLI_PARSE_ERROR', message: stderr || stdout || 'No output' }];
      }

      resolvePromise({
        success: code === 0 && errors.length === 0,
        command,
        data,
        errors,
        rawOutput: stdout,
      });
    });

    proc.on('error', (err) => reject(new Error(`CLI spawn failed: ${err.message}`)));
  });
}

// ============================================
// Service Stack Helper
// ============================================

export interface TestServiceStack {
  service: IPositionalGraphService;
  ctx: WorkspaceContext;
  workspacePath: string;
}

/**
 * Create a real service stack with real filesystem adapters in a temp directory.
 * Returns the service, workspace context, and temp path for cleanup.
 */
export async function createTestServiceStack(
  prefix: string,
  workUnitLoader?: IWorkUnitLoader
): Promise<TestServiceStack> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  const chaingleassDir = path.join(tmpDir, '.chainglass', 'data', 'workflows');
  await fs.mkdir(chaingleassDir, { recursive: true });

  const ctx = createTestWorkspaceContext(tmpDir);

  const nodeFs = new NodeFileSystemAdapter();
  const pathResolver = new PathResolverAdapter();
  const yamlParser = new YamlParserAdapter();
  const adapter = new PositionalGraphAdapter(nodeFs, pathResolver);

  const loader: IWorkUnitLoader = workUnitLoader ?? {
    async load(_ctx: WorkspaceContext, slug: string) {
      return {
        unit: { slug, type: 'agent' as const, inputs: [], outputs: [] },
        errors: [],
      };
    },
  };

  const service = new PositionalGraphService(nodeFs, pathResolver, yamlParser, adapter, loader);

  return { service, ctx, workspacePath: tmpDir };
}

/**
 * Build a WorkspaceContext for a given temp directory.
 */
export function createTestWorkspaceContext(workspacePath: string): WorkspaceContext {
  return {
    workspaceSlug: 'e2e-workspace',
    workspaceName: 'E2E Workspace',
    workspacePath,
    worktreePath: workspacePath,
    worktreeBranch: null,
    isMainWorktree: true,
    hasGit: false,
  };
}

// ============================================
// Assertion + Output Helpers
// ============================================

/**
 * Creates a step counter that prints numbered steps to console.
 */
export function createStepCounter(): { step: (description: string) => void; count: () => number } {
  let stepNum = 0;
  return {
    step(description: string): void {
      stepNum++;
      console.log(`  [${stepNum}] ${description}`);
    },
    count(): number {
      return stepNum;
    },
  };
}

/**
 * Assert a condition, throwing a descriptive error on failure.
 */
export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

/**
 * Unwrap an optional value, throwing if undefined/null.
 */
export function unwrap<T>(value: T | undefined | null, label: string): T {
  if (value === undefined || value === null) {
    throw new Error(`ASSERTION FAILED: ${label} is ${String(value)}`);
  }
  return value;
}

/**
 * Print a banner line.
 */
export function banner(title: string): void {
  console.log('');
  console.log('='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

/**
 * Clean up a temp directory.
 */
export async function cleanup(tmpDir: string): Promise<void> {
  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log(`Cleaned up temp dir: ${tmpDir}`);
}
