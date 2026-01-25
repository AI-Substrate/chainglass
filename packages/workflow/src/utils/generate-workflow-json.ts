/**
 * Generate workflow.json metadata utility.
 *
 * Per Phase 4 DYK-02: Extracted from WorkflowRegistryService for reuse
 * by both checkpoint creation and init command template hydration.
 */

import type {
  IFileSystem,
  IPathResolver,
  WorkflowMetadata,
} from '@chainglass/shared';
import type { IYamlParser } from '../interfaces/yaml-parser.interface.js';

/**
 * Options for generating workflow.json.
 */
export interface GenerateWorkflowJsonOptions {
  /** Filesystem adapter for reading/writing files */
  fs: IFileSystem;
  /** Path resolver for joining paths */
  pathResolver: IPathResolver;
  /** YAML parser for reading wf.yaml */
  yamlParser: IYamlParser;
}

/**
 * Generate workflow.json metadata file for a workflow.
 *
 * Reads the workflow name from wf.yaml if available, otherwise uses the slug.
 * Creates workflow.json in the workflowDir with required metadata fields.
 *
 * @param workflowDir - Path to the workflow directory (contains workflow.json)
 * @param slug - Workflow slug identifier
 * @param wfYamlPath - Path to wf.yaml template file (for extracting name)
 * @param createdAt - ISO-8601 creation timestamp
 * @param options - Service dependencies
 *
 * @example
 * ```typescript
 * await generateWorkflowJson(
 *   '/project/.chainglass/workflows/hello-workflow',
 *   'hello-workflow',
 *   '/project/.chainglass/workflows/hello-workflow/current/wf.yaml',
 *   new Date().toISOString(),
 *   { fs, pathResolver, yamlParser }
 * );
 * ```
 */
export async function generateWorkflowJson(
  workflowDir: string,
  slug: string,
  wfYamlPath: string,
  createdAt: string,
  options: GenerateWorkflowJsonOptions
): Promise<void> {
  const { fs, pathResolver, yamlParser } = options;

  let name = slug; // Default to slug if can't parse wf.yaml

  try {
    const wfYamlContent = await fs.readFile(wfYamlPath);
    const parsed = yamlParser.parse<{ name?: string }>(wfYamlContent, wfYamlPath);
    if (parsed && typeof parsed.name === 'string') {
      name = parsed.name;
    }
  } catch {
    // Use slug as name if wf.yaml can't be parsed
  }

  const workflowJson: WorkflowMetadata = {
    slug,
    name,
    created_at: createdAt,
    tags: [],
  };

  await fs.writeFile(
    pathResolver.join(workflowDir, 'workflow.json'),
    JSON.stringify(workflowJson, null, 2)
  );
}
