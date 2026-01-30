/**
 * Bootstrap Prompt Generator.
 *
 * Per DYK#8: Minimal bootstrap prompt, expand based on real needs.
 * This generates the prompt that tells agents how to operate within
 * the WorkGraph system.
 *
 * Per Plan 021: All methods accept WorkspaceContext as first parameter.
 */

import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import type { IWorkGraphService, IWorkUnitService } from '../interfaces/index.js';

// ============================================
// Types
// ============================================

/**
 * Options for generating a bootstrap prompt.
 */
export interface BootstrapPromptOptions {
  /** Graph slug */
  graphSlug: string;
  /** Node ID */
  nodeId: string;
  /** Whether this is a resume (vs initial execution) */
  resume?: boolean;
}

/**
 * Result of generating a bootstrap prompt.
 */
export interface BootstrapPromptResult {
  /** Generated prompt */
  prompt: string;
  /** Unit slug for the node */
  unitSlug: string;
  /** Path to the unit's commands */
  commandsPath: string;
  /** Errors if generation failed */
  errors: Array<{ code: string; message: string; action?: string }>;
}

// ============================================
// Service
// ============================================

/**
 * Service for generating bootstrap prompts for agent execution.
 */
export class BootstrapPromptService {
  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly workGraphService: IWorkGraphService,
    private readonly workUnitService?: IWorkUnitService
  ) {}

  /**
   * Generate a bootstrap prompt for a node.
   *
   * Per DYK#8: Minimal prompt - just the essentials for agent operation.
   *
   * @param ctx - Workspace context for path resolution
   * @param options - Prompt generation options
   */
  async generate(
    ctx: WorkspaceContext,
    options: BootstrapPromptOptions
  ): Promise<BootstrapPromptResult> {
    const { graphSlug, nodeId, resume = false } = options;

    // Derive paths from workspace context
    const graphsDir = this.pathResolver.join(ctx.worktreePath, '.chainglass/data/work-graphs');
    const unitsDir = this.pathResolver.join(ctx.worktreePath, '.chainglass/data/units');

    // 1. Load node config to get unit slug
    const nodePath = this.pathResolver.join(graphsDir, graphSlug, 'nodes', nodeId);
    const nodeYamlPath = this.pathResolver.join(nodePath, 'node.yaml');

    if (!(await this.fs.exists(nodeYamlPath))) {
      return {
        prompt: '',
        unitSlug: '',
        commandsPath: '',
        errors: [
          {
            code: 'E107',
            message: `Node '${nodeId}' not found in graph '${graphSlug}'`,
            action: 'Check the node ID and try again',
          },
        ],
      };
    }

    let unitSlug = '';
    try {
      const nodeYamlContent = await this.fs.readFile(nodeYamlPath);
      const match = nodeYamlContent.match(/unit_slug:\s*([^\s\n]+)/);
      if (match) {
        unitSlug = match[1];
      }
    } catch {
      return {
        prompt: '',
        unitSlug: '',
        commandsPath: '',
        errors: [
          {
            code: 'E140',
            message: `Failed to read node config for '${nodeId}'`,
            action: 'Check node.yaml exists and is readable',
          },
        ],
      };
    }

    if (!unitSlug) {
      return {
        prompt: '',
        unitSlug: '',
        commandsPath: '',
        errors: [
          {
            code: 'E120',
            message: `No unit_slug found in node config for '${nodeId}'`,
            action: 'Ensure node.yaml has a unit_slug field',
          },
        ],
      };
    }

    // 2. Determine commands path
    const commandsPath = this.pathResolver.join(unitsDir, unitSlug, 'commands', 'main.md');

    // 3. Generate prompt based on resume flag
    const prompt = resume
      ? this.generateResumePrompt(graphSlug, nodeId, unitSlug, commandsPath)
      : this.generateInitialPrompt(graphSlug, nodeId, unitSlug, commandsPath);

    return {
      prompt,
      unitSlug,
      commandsPath,
      errors: [],
    };
  }

  /**
   * Generate initial execution prompt.
   */
  private generateInitialPrompt(
    graphSlug: string,
    nodeId: string,
    unitSlug: string,
    commandsPath: string
  ): string {
    return `# Work-Node Execution

You are executing a **work-node** in a WorkGraph system.

## Your Assignment

- **Work-Node**: ${nodeId}
- **Work-Unit**: ${unitSlug}

## FAIL FAST POLICY

If you encounter missing files, CLI errors, or unclear instructions:
1. Log the error with details
2. Do NOT attempt workarounds
3. Report back to orchestrator

## Step 1: Signal Start

First, tell the system you've taken over:
\`\`\`
cg wg node ${nodeId} start
\`\`\`

## Step 2: Get Your Inputs

\`\`\`
# List available inputs
cg wg node ${nodeId} list-inputs

# Get data values
cg wg node ${nodeId} get-input-data <name>

# Get file paths (then read them)
cg wg node ${nodeId} get-input-file <name>
\`\`\`

## Step 3: Read Your Task Instructions

Your task is defined in the work-unit:
\`\`\`
cat ${commandsPath}
\`\`\`

Follow those instructions to complete your task.

## Step 4: Save Your Outputs

\`\`\`
# Save file outputs
cg wg node ${nodeId} save-output-file <name> <path>

# Save data outputs
cg wg node ${nodeId} save-output-data <name> <value>
\`\`\`

## Step 5: Complete

\`\`\`
# Verify all required outputs are present
cg wg node ${nodeId} can-end

# Finalize (fails if outputs missing)
cg wg node ${nodeId} end
\`\`\`

## CRITICAL

Execute THIS work-node only. When complete, STOP and report back.

---

**Now**: Call \`start\`, get inputs, read your instructions, do the work.`;
  }

  /**
   * Generate resume prompt (after answering a question).
   */
  private generateResumePrompt(
    graphSlug: string,
    nodeId: string,
    unitSlug: string,
    commandsPath: string
  ): string {
    return `# Work-Node Execution (RESUMING)

You are RESUMING a **work-node** in a WorkGraph system.

## Your Assignment

- **Work-Node**: ${nodeId}
- **Work-Unit**: ${unitSlug}

## FIRST: Check Why You Were Paused

\`\`\`
cg wg node ${nodeId} handover-reason
\`\`\`

## If 'question': Get Your Answer

\`\`\`
cg wg node ${nodeId} get-answer
\`\`\`

## Then Continue Your Work

Use the answer to continue from where you left off.

When complete:
\`\`\`
cg wg node ${nodeId} save-output-file <name> <path>
cg wg node ${nodeId} save-output-data <name> <value>
cg wg node ${nodeId} end
\`\`\`

## CRITICAL

Execute THIS work-node only. When complete, STOP and report back.`;
  }
}
