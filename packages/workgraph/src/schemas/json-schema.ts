/**
 * Named draft-07 JSON Schema export, in the `{ $ref, definitions }` shape zod-to-json-schema
 * produced (`name` + `$refStrategy: 'none'`), built with zod 4's native converter.
 */

import { z } from 'zod';

export function namedJsonSchema(schema: z.ZodType, name: string) {
  // Input shape: a field with a default stays optional, as zod-to-json-schema emitted it.
  const { $schema, ...definition } = z.toJSONSchema(schema, {
    target: 'draft-7',
    io: 'input',
    // `z.undefined()` marks a field that must be absent (workunit's other-type configs);
    // zod-to-json-schema wrote that as `{ not: {} }`, which zod 4 refuses by default.
    unrepresentable: 'any',
    override: (ctx) => {
      const type = ctx.zodSchema._zod.def.type;
      if (type === 'undefined') ctx.jsonSchema.not = {};
      // Input mode leaves plain (stripping) objects open; zod-to-json-schema closed them.
      if (type === 'object' && ctx.jsonSchema.additionalProperties === undefined) {
        ctx.jsonSchema.additionalProperties = false;
      }
    },
  });
  return { $ref: `#/definitions/${name}`, definitions: { [name]: definition }, $schema };
}
