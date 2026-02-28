/**
 * InstanceWorkUnitAdapter — IWorkUnitLoader that resolves units from
 * an instance-local path instead of the global .chainglass/units/.
 *
 * Constructor takes a base units directory path (e.g.,
 * /workspace/.chainglass/instances/my-template/sprint-42/units/).
 * Decoupled from instance naming scheme — accepts any root.
 *
 * Per Finding 05: WorkUnitAdapter hardcodes .chainglass/units/.
 * Per DYK #2: Constructor takes basePath for elegant DI factory wiring.
 * Per ADR-0004: Registered via useFactory.
 */

import type { IFileSystem, IPathResolver, IYamlParser, ResultError } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

import type {
  IWorkUnitLoader,
  NarrowWorkUnit,
} from '../interfaces/positional-graph-service.interface.js';

export class InstanceWorkUnitAdapter implements IWorkUnitLoader {
  constructor(
    private readonly basePath: string,
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly yamlParser: IYamlParser
  ) {}

  /**
   * Load a work unit from the instance-local units directory.
   * ctx is accepted for interface compatibility but basePath takes precedence.
   */
  async load(
    _ctx: WorkspaceContext,
    slug: string
  ): Promise<{ unit?: NarrowWorkUnit; errors: ResultError[] }> {
    try {
      const unitDir = this.pathResolver.join(this.basePath, slug);
      const unitYamlPath = this.pathResolver.join(unitDir, 'unit.yaml');

      if (!(await this.fs.exists(unitYamlPath))) {
        return {
          errors: [
            { message: `Unit '${slug}' not found at ${unitYamlPath}`, code: 'UNIT_NOT_FOUND' },
          ],
        };
      }

      const content = await this.fs.readFile(unitYamlPath);
      const unitDef = this.yamlParser.parse<{
        slug: string;
        type: 'agent' | 'code' | 'user-input';
        inputs?: Array<{
          name: string;
          type: 'data' | 'file';
          required: boolean;
          description?: string;
        }>;
        outputs: Array<{
          name: string;
          type: 'data' | 'file';
          required: boolean;
          description?: string;
        }>;
        user_input?: {
          question_type: 'text' | 'single' | 'multi' | 'confirm';
          prompt: string;
          options?: Array<{ key: string; label: string; description?: string }>;
          default?: string | boolean;
        };
      }>(content, unitYamlPath);

      const base = {
        slug: unitDef.slug,
        inputs: unitDef.inputs ?? [],
        outputs: unitDef.outputs,
      };

      if (unitDef.type === 'user-input') {
        if (!unitDef.user_input) {
          return {
            errors: [
              {
                message: `Unit '${slug}' has type 'user-input' but is missing user_input config`,
                code: 'UNIT_LOAD_ERROR',
              },
            ],
          };
        }
        const unit: NarrowWorkUnit = {
          ...base,
          type: 'user-input' as const,
          userInput: {
            prompt: unitDef.user_input.prompt,
            inputType: unitDef.user_input.question_type,
            outputName: base.outputs[0]?.name ?? 'output',
            options: unitDef.user_input.options,
            default: unitDef.user_input.default,
          },
        };
        return { unit, errors: [] };
      }

      const unit: NarrowWorkUnit = {
        ...base,
        type: unitDef.type === 'code' ? ('code' as const) : ('agent' as const),
      };

      return { unit, errors: [] };
    } catch (err) {
      return {
        errors: [
          { message: err instanceof Error ? err.message : String(err), code: 'UNIT_LOAD_ERROR' },
        ],
      };
    }
  }
}
