/**
 * Generate workflow templates from test fixtures.
 *
 * Builds graphs imperatively via PositionalGraphService, then saves
 * them as templates via TemplateService.saveFrom(). Outputs committed
 * template artifacts to .chainglass/templates/workflows/.
 *
 * Usage:
 *   npx tsx scripts/generate-templates.ts [--fixture smoke|simple-serial|all]
 *
 * Default: generates all fixtures.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { PositionalGraphAdapter, PositionalGraphService } from '@chainglass/positional-graph';
import type { IPositionalGraphService } from '@chainglass/positional-graph/interfaces';
import { NodeFileSystemAdapter, PathResolverAdapter, YamlParserAdapter } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { InstanceAdapter, TemplateAdapter, TemplateService } from '@chainglass/workflow';

import { buildDiskWorkUnitLoader, makeScriptsExecutable } from '../dev/test-graphs/shared/helpers.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIXTURES_DIR = path.join(ROOT, 'dev', 'test-graphs');
const TEMPLATES_DIR = path.join(ROOT, '.chainglass', 'templates', 'workflows');

function createCtx(worktreePath: string): WorkspaceContext {
  return {
    workspaceSlug: 'generate-templates',
    workspaceName: 'Template Generator',
    workspacePath: worktreePath,
    worktreePath,
    worktreeBranch: null,
    isMainWorktree: true,
    hasGit: true,
  };
}

interface FixtureConfig {
  slug: string;
  build: (service: IPositionalGraphService, ctx: WorkspaceContext) => Promise<void>;
}

async function buildSmoke(service: IPositionalGraphService, ctx: WorkspaceContext) {
  const { lineId } = await service.create(ctx, 'smoke');
  await service.addNode(ctx, 'smoke', lineId ?? '', 'ping');
}

async function buildSimpleSerial(service: IPositionalGraphService, ctx: WorkspaceContext) {
  const { lineId: line0 } = await service.create(ctx, 'simple-serial');
  const line1Result = await service.addLine(ctx, 'simple-serial');
  const line1 = line1Result.lineId ?? '';

  const setupResult = await service.addNode(ctx, 'simple-serial', line0 ?? '', 'setup');
  const setupId = setupResult.nodeId ?? '';

  const workerResult = await service.addNode(ctx, 'simple-serial', line1, 'worker');
  const workerId = workerResult.nodeId ?? '';

  await service.setInput(ctx, 'simple-serial', workerId, 'task', {
    from_node: setupId,
    from_output: 'instructions',
  });
}

const FIXTURES: FixtureConfig[] = [
  { slug: 'smoke', build: buildSmoke },
  { slug: 'simple-serial', build: buildSimpleSerial },
];

async function generateTemplate(config: FixtureConfig): Promise<void> {
  console.log(`\nGenerating template: ${config.slug}`);
  console.log('─'.repeat(50));

  // Create temp workspace
  const tmpDir = await fs.mkdtemp(path.join(path.resolve('/tmp'), `gen-tpl-${config.slug}-`));

  try {
    // Set up workspace structure
    const unitsDir = path.join(tmpDir, '.chainglass', 'units');
    await fs.mkdir(path.join(tmpDir, '.chainglass', 'data', 'workflows'), { recursive: true });
    await fs.mkdir(unitsDir, { recursive: true });
    await fs.mkdir(path.join(tmpDir, '.chainglass', 'templates', 'workflows'), { recursive: true });

    // Copy fixture units
    const fixtureUnits = path.join(FIXTURES_DIR, config.slug, 'units');
    await fs.cp(fixtureUnits, unitsDir, { recursive: true });

    // Make scripts executable
    await makeScriptsExecutable(unitsDir);

    // Wire real services
    const nodeFs = new NodeFileSystemAdapter();
    const pathResolver = new PathResolverAdapter();
    const yamlParser = new YamlParserAdapter();
    const graphAdapter = new PositionalGraphAdapter(nodeFs, pathResolver);
    const loader = buildDiskWorkUnitLoader(tmpDir);
    const graphService = new PositionalGraphService(nodeFs, pathResolver, yamlParser, graphAdapter, loader);
    const templateAdapter = new TemplateAdapter(nodeFs, pathResolver);
    const instanceAdapter = new InstanceAdapter(nodeFs, pathResolver);
    const templateService = new TemplateService(nodeFs, pathResolver, yamlParser, templateAdapter, instanceAdapter);

    const ctx = createCtx(tmpDir);

    // Build graph imperatively
    console.log(`  Building graph: ${config.slug}`);
    await config.build(graphService, ctx);

    // Save as template
    console.log(`  Saving as template...`);
    const result = await templateService.saveFrom(ctx, config.slug, config.slug);
    if (result.errors.length > 0) {
      console.error(`  FAILED:`, result.errors);
      process.exit(1);
    }

    console.log(`  Template saved: ${result.data?.slug}`);
    console.log(`    Lines: ${result.data?.lineCount}`);
    console.log(`    Nodes: ${result.data?.nodes.length} (${result.data?.nodes.map((n) => n.unitSlug).join(', ')})`);
    console.log(`    Units: ${result.data?.units.length} (${result.data?.units.map((u) => u.slug).join(', ')})`);

    // Copy template from temp to repo
    const srcTemplate = path.join(tmpDir, '.chainglass', 'templates', 'workflows', config.slug);
    const destTemplate = path.join(TEMPLATES_DIR, config.slug);

    // Remove existing template if present
    try {
      await fs.rm(destTemplate, { recursive: true, force: true });
    } catch {
      // OK if doesn't exist
    }
    await fs.cp(srcTemplate, destTemplate, { recursive: true });

    // Make scripts executable in final location
    await makeScriptsExecutable(path.join(destTemplate, 'units'));

    console.log(`  Copied to: .chainglass/templates/workflows/${config.slug}/`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}


// CLI
const args = process.argv.slice(2);
const fixtureArg = args.find((a) => a.startsWith('--fixture='))?.split('=')[1] ?? args[1] ?? 'all';

const toGenerate = fixtureArg === 'all' ? FIXTURES : FIXTURES.filter((f) => f.slug === fixtureArg);

if (toGenerate.length === 0) {
  console.error(`Unknown fixture: ${fixtureArg}. Available: ${FIXTURES.map((f) => f.slug).join(', ')}`);
  process.exit(1);
}

console.log(`Template Generator — generating ${toGenerate.length} template(s)`);

for (const config of toGenerate) {
  await generateTemplate(config);
}

console.log('\nDone. Templates at .chainglass/templates/workflows/');
