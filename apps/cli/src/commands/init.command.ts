/**
 * init command - Initialize a Chainglass project
 *
 * Per Phase 4: Creates .chainglass directory structure and hydrates starter templates.
 * Per DYK-01: Uses __dirname for bundleDir resolution in CJS bundle
 * Per DYK-05: Dual-strategy path resolution for npx distribution
 * Per DYK-08: Supports --force flag for overwriting existing templates
 */

import { resolve } from 'node:path';
import {
  ConsoleOutputAdapter,
  type IOutputAdapter,
  JsonOutputAdapter,
  NodeFileSystemAdapter,
  PathResolverAdapter,
} from '@chainglass/shared';
import { type InitResult, InitService, YamlParserAdapter } from '@chainglass/workflow';
import chalk from 'chalk';
import type { Command } from 'commander';

interface InitCommandOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Force overwrite existing templates (default: false) */
  force?: boolean;
}

/**
 * Find the bundle directory containing assets.
 *
 * Per DYK-01: Uses __dirname (CJS) to locate assets relative to CLI bundle.
 * Per DYK-05: In esbuild CJS bundle, __dirname points to dist/ directory.
 *
 * @returns Path to the CLI bundle directory (dist/)
 */
export function findBundleDir(): string {
  // CJS: __dirname is defined (esbuild bundles as CJS)
  // Note: __dirname is available in Node.js CJS modules
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }

  // Fallback for ESM context (shouldn't happen in bundled CLI)
  throw new Error('Cannot determine bundle directory. __dirname not available.');
}

/**
 * Create an output adapter based on options.
 */
function createOutputAdapter(json: boolean): IOutputAdapter {
  return json ? new JsonOutputAdapter() : new ConsoleOutputAdapter();
}

/**
 * Format init result for console output.
 *
 * Per DYK-08: Shows overwritten templates separately from hydrated.
 */
function formatInitOutput(result: InitResult): string {
  const lines: string[] = [];

  if (result.errors.length > 0) {
    lines.push(chalk.red('Initialization failed:'));
    for (const error of result.errors) {
      lines.push(chalk.red(`  ${error.code}: ${error.message}`));
      if (error.action) {
        lines.push(chalk.gray(`    → ${error.action}`));
      }
    }
    return lines.join('\n');
  }

  lines.push(chalk.green('Chainglass initialized successfully!'));
  lines.push('');

  if (result.createdDirs.length > 0) {
    lines.push(chalk.cyan('Created directories:'));
    for (const dir of result.createdDirs) {
      lines.push(`  ${chalk.gray('+')} ${dir}`);
    }
    lines.push('');
  }

  if (result.hydratedTemplates.length > 0) {
    lines.push(chalk.cyan('Hydrated templates:'));
    for (const slug of result.hydratedTemplates) {
      lines.push(`  ${chalk.green('✓')} ${slug}`);
    }
    lines.push('');
  }

  if (result.overwrittenTemplates.length > 0) {
    lines.push(chalk.yellow('Overwritten templates (--force):'));
    for (const slug of result.overwrittenTemplates) {
      lines.push(`  ${chalk.yellow('↻')} ${slug}`);
    }
    lines.push('');
  }

  if (result.skippedTemplates.length > 0) {
    lines.push(chalk.gray('Skipped existing templates:'));
    for (const slug of result.skippedTemplates) {
      lines.push(`  ${chalk.gray('-')} ${slug}`);
    }
    lines.push('');
  }

  lines.push(chalk.cyan('Next steps:'));
  lines.push(
    `  ${chalk.gray('1.')} ${chalk.white('cg workflow checkpoint hello-workflow')} ${chalk.gray('- Create your first checkpoint')}`
  );
  lines.push(
    `  ${chalk.gray('2.')} ${chalk.white('cg workflow compose hello-workflow')} ${chalk.gray('- Start a new workflow run')}`
  );

  return lines.join('\n');
}

/**
 * Execute the init command.
 */
async function handleInit(options: InitCommandOptions): Promise<void> {
  const projectDir = process.cwd();
  const force = options.force ?? false;
  const json = options.json ?? false;

  // Create service dependencies
  const fs = new NodeFileSystemAdapter();
  const pathResolver = new PathResolverAdapter();
  const yamlParser = new YamlParserAdapter();

  // Get bundle directory for assets
  const bundleDir = findBundleDir();

  // Create init service
  const initService = new InitService(fs, pathResolver, yamlParser, bundleDir);

  // Run init
  const result = await initService.init(projectDir, { force });

  // Format output
  if (json) {
    const adapter = createOutputAdapter(true);
    console.log(adapter.format('init', result));
  } else {
    console.log(formatInitOutput(result));
  }

  // Exit with error code if init failed
  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Register the init command with the Commander program.
 */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize a Chainglass project in the current directory')
    .option('--json', 'Output as JSON', false)
    .option('-f, --force', 'Overwrite existing templates', false)
    .action(async (options: InitCommandOptions) => {
      await handleInit(options);
    });
}
