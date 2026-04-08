/**
 * CLI commands for workflow template management.
 *
 * Commands: save-from, list, show, instantiate, refresh, instances
 * Per ADR-0012: Consumer domain — thin wrappers calling ITemplateService.
 * Per Plan 048 Phase 2, Workshop 002.
 */

import { POSITIONAL_GRAPH_DI_TOKENS } from '@chainglass/shared';
import type { ITemplateService } from '@chainglass/workflow';
import type { Command } from 'commander';

import { createCliProductionContainer } from '../lib/container.js';
import {
  createOutputAdapter,
  noContextError,
  resolveOrOverrideContext,
  wrapAction,
} from './command-helpers.js';

interface BaseOptions {
  json?: boolean;
  workspacePath?: string;
}

function getTemplateService(): ITemplateService {
  const container = createCliProductionContainer();
  return container.resolve<ITemplateService>(POSITIONAL_GRAPH_DI_TOKENS.TEMPLATE_SERVICE);
}

async function handleSaveFrom(
  graphSlug: string,
  options: BaseOptions & { as: string }
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    console.log(
      adapter.format('template.save-from', { errors: noContextError(options.workspacePath) })
    );
    process.exit(1);
  }

  const service = getTemplateService();
  const result = await service.saveFrom(ctx, graphSlug, options.as);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.data) {
    console.log(`Template saved: ${result.data.slug}`);
    console.log(`  Graph: ${result.data.lineCount} lines, ${result.data.nodes.length} nodes`);
    console.log(`  Units bundled: ${result.data.units.map((u) => u.slug).join(', ')}`);
  }

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(`Error: ${err.message}`);
    }
    process.exit(1);
  }
}

async function handleList(options: BaseOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    console.log(adapter.format('template.list', { errors: noContextError(options.workspacePath) }));
    process.exit(1);
  }

  const service = getTemplateService();
  const result = await service.listWorkflows(ctx);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.data.length === 0) {
    console.log('No workflow templates found.');
  } else {
    console.log('Workflow Templates:');
    for (const tpl of result.data) {
      console.log(`  ${tpl.slug}  (${tpl.nodes.length} nodes, ${tpl.units.length} units)`);
    }
  }

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(`Error: ${err.message}`);
    }
    process.exit(1);
  }
}

async function handleShow(slug: string, options: BaseOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    console.log(adapter.format('template.show', { errors: noContextError(options.workspacePath) }));
    process.exit(1);
  }

  const service = getTemplateService();
  const result = await service.showWorkflow(ctx, slug);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.data) {
    console.log(`Template: ${result.data.slug}`);
    console.log(`  Graph: ${result.data.graphSlug} v${result.data.graphVersion ?? 'unknown'}`);
    if (result.data.description) {
      console.log(`  Description: ${result.data.description}`);
    }
    console.log(`  Lines: ${result.data.lineCount}`);
    console.log('  Nodes:');
    for (const node of result.data.nodes) {
      console.log(`    ${node.nodeId} → ${node.unitSlug}`);
    }
    console.log('  Units:');
    for (const unit of result.data.units) {
      console.log(`    ${unit.slug} (${unit.type})`);
    }
  } else {
    console.log(`Template '${slug}' not found.`);
  }
}

async function handleInstantiate(
  slug: string,
  options: BaseOptions & { id: string }
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    console.log(
      adapter.format('template.instantiate', { errors: noContextError(options.workspacePath) })
    );
    process.exit(1);
  }

  const service = getTemplateService();
  const result = await service.instantiate(ctx, slug, options.id);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.data) {
    console.log(`Instance created: ${result.data.template_source}/${result.data.slug}`);
    console.log(`  Units copied: ${result.data.units.map((u) => u.slug).join(', ')}`);
    console.log('  Graph status: pending');
  }

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(`Error: ${err.message}`);
    }
    process.exit(1);
  }
}

async function handleRefresh(
  path: string,
  options: BaseOptions & { force?: boolean }
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    console.log(
      adapter.format('template.refresh', { errors: noContextError(options.workspacePath) })
    );
    process.exit(1);
  }

  const parts = path.split('/').filter(Boolean);
  if (parts.length !== 2) {
    console.error('Usage: cg template refresh <template-slug>/<instance-id>');
    process.exit(1);
  }
  const [templateSlug, instanceId] = parts;

  const service = getTemplateService();
  const result = await service.refresh(ctx, templateSlug, instanceId);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.data) {
    // Show warnings (e.g., active run) — skip if --force
    for (const err of result.errors) {
      if (err.code === 'ACTIVE_RUN_WARNING' && !options.force) {
        console.log(`Warning: ${err.message}`);
      }
    }
    console.log(`Refreshed units: ${result.data.refreshedUnits.join(', ')}`);
  }

  // Only exit with error for non-warning errors
  const realErrors = result.errors.filter((e) => e.code !== 'ACTIVE_RUN_WARNING');
  if (realErrors.length > 0) {
    for (const err of realErrors) {
      console.error(`Error: ${err.message}`);
    }
    process.exit(1);
  }
}

async function handleInstances(slug: string, options: BaseOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    console.log(
      adapter.format('template.instances', { errors: noContextError(options.workspacePath) })
    );
    process.exit(1);
  }

  const service = getTemplateService();
  const result = await service.listInstances(ctx, slug);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.data.length === 0) {
    console.log(`No instances of template '${slug}'.`);
  } else {
    console.log(`Instances of ${slug}:`);
    for (const inst of result.data) {
      console.log(`  ${inst.slug}  (created: ${inst.created_at})`);
    }
  }

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(`Error: ${err.message}`);
    }
    process.exit(1);
  }
}

/**
 * Handle template delete <slug> (Plan 074 Phase 6 FT-002).
 */
async function handleDelete(slug: string, options: BaseOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    console.log(
      adapter.format('template.delete', {
        deleted: false,
        errors: [noContextError(options.workspacePath)],
      })
    );
    process.exit(1);
  }

  const service = getTemplateService();
  const result = await service.delete(ctx, slug);
  console.log(adapter.format('template.delete', result));

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

export function registerTemplateCommands(program: Command): void {
  const template = program
    .command('template')
    .description('Manage workflow templates and instances');

  template
    .command('save-from <graph-slug>')
    .description('Save a working graph as a reusable template')
    .requiredOption('--as <template-slug>', 'Template slug name')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace path')
    .action(
      wrapAction(async (graphSlug: string, options: BaseOptions & { as: string }) => {
        await handleSaveFrom(graphSlug, options);
      })
    );

  template
    .command('list')
    .description('List all workflow templates')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace path')
    .action(
      wrapAction(async (options: BaseOptions) => {
        await handleList(options);
      })
    );

  template
    .command('show <slug>')
    .description('Show details of a workflow template')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace path')
    .action(
      wrapAction(async (slug: string, options: BaseOptions) => {
        await handleShow(slug, options);
      })
    );

  template
    .command('instantiate <slug>')
    .description('Create an independent instance from a template')
    .requiredOption('--id <instance-id>', 'Instance identifier')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace path')
    .action(
      wrapAction(async (slug: string, options: BaseOptions & { id: string }) => {
        await handleInstantiate(slug, options);
      })
    );

  template
    .command('refresh <template/instance>')
    .description('Refresh work units in an instance from its template (graph topology unchanged)')
    .option('--force', 'Skip active run confirmation', false)
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace path')
    .action(
      wrapAction(async (path: string, options: BaseOptions & { force?: boolean }) => {
        await handleRefresh(path, options);
      })
    );

  template
    .command('instances <slug>')
    .description('List all instances of a workflow template')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace path')
    .action(
      wrapAction(async (slug: string, options: BaseOptions) => {
        await handleInstances(slug, options);
      })
    );

  // template delete <slug> (Plan 074 Phase 6 FT-002)
  template
    .command('delete <slug>')
    .description('Delete a workflow template (idempotent)')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace path')
    .action(
      wrapAction(async (slug: string, options: BaseOptions) => {
        await handleDelete(slug, options);
      })
    );
}
