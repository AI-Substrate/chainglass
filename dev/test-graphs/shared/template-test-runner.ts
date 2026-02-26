/**
 * Template-based test runner — withTemplateWorkflow().
 *
 * Creates a temp workspace, copies a committed template from the repo's
 * .chainglass/templates/workflows/ into it, instantiates via TemplateService,
 * and returns a TestGraphContext for assertions.
 *
 * Coexists with withTestGraph() — use this for template-based tests,
 * use withTestGraph() for imperative graph building tests.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { PositionalGraphAdapter, PositionalGraphService } from '@chainglass/positional-graph';
import type { IWorkUnitLoader } from '@chainglass/positional-graph/interfaces';
import { NodeFileSystemAdapter, PathResolverAdapter, YamlParserAdapter } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { InstanceAdapter, TemplateAdapter, TemplateService } from '@chainglass/workflow';

import type { TestGraphContext } from './graph-test-runner.js';

/** Root of the repo (three levels up from this file) */
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const REPO_TEMPLATES = path.join(REPO_ROOT, '.chainglass', 'templates', 'workflows');

export interface TemplateTestContext extends TestGraphContext {
  /** The TemplateService wired to the temp workspace */
  templateService: TemplateService;
  /** The template slug used */
  templateSlug: string;
  /** The instance ID created */
  instanceId: string;
}

export interface WithTemplateWorkflowOptions {
  preserveOnSuccess?: boolean;
}

/**
 * Test helper that instantiates a committed template into a temp workspace.
 *
 * 1. Creates temp dir
 * 2. Copies template from repo .chainglass/templates/workflows/<slug>/
 * 3. Copies units from template to .chainglass/units/ (for IWorkUnitLoader)
 * 4. Wires TemplateService + PositionalGraphService with real FS
 * 5. Calls instantiate()
 * 6. Returns TemplateTestContext
 * 7. Cleans up temp dir on completion
 */
export async function withTemplateWorkflow(
  templateSlug: string,
  testFnOrOptions: ((ctx: TemplateTestContext) => Promise<void>) | WithTemplateWorkflowOptions,
  maybeTestFn?: (ctx: TemplateTestContext) => Promise<void>
): Promise<void> {
  const testFn =
    typeof testFnOrOptions === 'function'
      ? testFnOrOptions
      : (maybeTestFn as (ctx: TemplateTestContext) => Promise<void>);
  const options = typeof testFnOrOptions === 'object' ? testFnOrOptions : {};

  if (!/^[a-z0-9_-]+$/.test(templateSlug)) {
    throw new Error(`Invalid templateSlug: "${templateSlug}"`);
  }

  const srcTemplate = path.join(REPO_TEMPLATES, templateSlug);
  try {
    await fs.stat(srcTemplate);
  } catch {
    throw new Error(`Template '${templateSlug}' not found at ${srcTemplate}`);
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `tpl-${templateSlug}-`));
  const instanceId = `test-${Date.now()}`;

  try {
    // Copy template into temp workspace
    const destTemplates = path.join(tmpDir, '.chainglass', 'templates', 'workflows', templateSlug);
    await fs.mkdir(path.dirname(destTemplates), { recursive: true });
    await fs.cp(srcTemplate, destTemplates, { recursive: true });

    // Copy units from template to global units path (for IWorkUnitLoader validation)
    const templateUnits = path.join(destTemplates, 'units');
    const globalUnits = path.join(tmpDir, '.chainglass', 'units');
    await fs.mkdir(globalUnits, { recursive: true });
    try {
      await fs.cp(templateUnits, globalUnits, { recursive: true });
    } catch {
      // Template may not have units
    }

    // Make scripts executable
    await makeExecutable(globalUnits);

    // Create data dir for graph engine
    await fs.mkdir(path.join(tmpDir, '.chainglass', 'data', 'workflows'), { recursive: true });

    // Wire real services
    const nodeFs = new NodeFileSystemAdapter();
    const pathResolver = new PathResolverAdapter();
    const yamlParser = new YamlParserAdapter();

    const graphAdapter = new PositionalGraphAdapter(nodeFs, pathResolver);
    const loader = buildLoader(tmpDir, yamlParser);
    const graphService = new PositionalGraphService(
      nodeFs,
      pathResolver,
      yamlParser,
      graphAdapter,
      loader
    );

    const templateAdapter = new TemplateAdapter(nodeFs, pathResolver);
    const instanceAdapter = new InstanceAdapter(nodeFs, pathResolver);
    const templateService = new TemplateService(
      nodeFs,
      pathResolver,
      yamlParser,
      templateAdapter,
      instanceAdapter
    );

    const ctx: WorkspaceContext = {
      workspaceSlug: `tpl-${templateSlug}`,
      workspaceName: `Template Test: ${templateSlug}`,
      workspacePath: tmpDir,
      worktreePath: tmpDir,
      worktreeBranch: null,
      isMainWorktree: true,
      hasGit: false,
    };

    // Instantiate template
    const result = await templateService.instantiate(ctx, templateSlug, instanceId);
    if (result.errors.length > 0) {
      throw new Error(
        `Failed to instantiate template: ${result.errors.map((e) => e.message).join(', ')}`
      );
    }

    const ttc: TemplateTestContext = {
      ctx,
      service: graphService,
      workspacePath: tmpDir,
      templateService,
      templateSlug,
      instanceId,
    };

    await testFn(ttc);
  } finally {
    if (!options.preserveOnSuccess) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
}

function buildLoader(workspacePath: string, yamlParser: YamlParserAdapter): IWorkUnitLoader {
  return {
    async load(_ctx: WorkspaceContext, slug: string) {
      const unitYamlPath = path.join(workspacePath, '.chainglass', 'units', slug, 'unit.yaml');
      try {
        const content = await fs.readFile(unitYamlPath, 'utf-8');
        const parsed = yamlParser.parse<{
          slug: string;
          type: 'agent' | 'code' | 'user-input';
          inputs?: Array<{ name: string; type: 'data' | 'file'; required: boolean }>;
          outputs: Array<{ name: string; type: 'data' | 'file'; required: boolean }>;
        }>(content, unitYamlPath);
        return {
          unit: {
            slug: parsed.slug,
            type: parsed.type,
            inputs: parsed.inputs ?? [],
            outputs: parsed.outputs,
          },
          errors: [],
        };
      } catch {
        return { errors: [{ message: `Unit '${slug}' not found`, code: 'NOT_FOUND' }] };
      }
    },
  };
}

async function makeExecutable(dir: string): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await makeExecutable(full);
      } else if (entry.name.endsWith('.sh')) {
        await fs.chmod(full, 0o755);
      }
    }
  } catch {
    // Dir may not exist
  }
}
