# TypeScript Configuration Validation Libraries Comparison

**Research Date**: 2026-01-21
**Source**: Perplexity Deep Research
**Topic**: Comparing Zod, io-ts, Yup, AJV, and class-validator for configuration systems

## Executive Summary

**Recommendation: Use Zod** for the Chainglass configuration system. Zod provides:
- Exceptional TypeScript type inference via `z.infer<>`
- Built-in coercion for environment variables (`z.coerce.number()`, `z.coerce.boolean()`)
- Excellent error messages with customization and internationalization
- Chainable, readable API
- Sufficient performance for configuration validation on startup

## Library Comparison Matrix

| Feature | Zod | io-ts | Yup | AJV | class-validator |
|---------|-----|-------|-----|-----|-----------------|
| Type Inference | Excellent | Excellent | Good | Good | Manual |
| Env Var Coercion | Built-in `.coerce` | Manual transform | `.transform()` | JSON Schema | Manual |
| Error Messages | Excellent + i18n | Requires fp-ts | Good | Requires extra libs | Good |
| Learning Curve | Low | High (FP) | Low | Medium | Low |
| Bundle Size (gzip) | ~35KB ESM | Depends on fp-ts | ~30-50KB | Smaller (AOT) | Medium |
| Decorators | No | No | No | No | Yes (required) |

## Zod: Recommended Choice

### Schema Definition Pattern
```typescript
import * as z from 'zod';

const ConfigSchema = z.object({
  sample: z.object({
    enabled: z.boolean().default(true),
    timeout: z.coerce.number().min(1).max(300).default(30),
    name: z.string().default('default'),
    apiKey: z.string().min(1).optional(),
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    format: z.enum(['json', 'text']).default('json'),
  }).optional(),
});

type Config = z.infer<typeof ConfigSchema>;
// TypeScript automatically infers the complete type!
```

### Environment Variable Coercion
```typescript
// All env vars arrive as strings - Zod handles coercion
const EnvSchema = z.object({
  PORT: z.coerce.number().min(1000).max(65535),
  DEBUG: z.coerce.boolean().default(false),
  NODE_ENV: z.enum(['development', 'staging', 'production']),
});

// Parsing handles string → number/boolean automatically
const env = EnvSchema.parse(process.env);
// env.PORT is number, env.DEBUG is boolean
```

### Custom Validators (Timeout Range)
```typescript
const TimeoutSchema = z.coerce.number()
  .min(1, 'Timeout must be at least 1 second')
  .max(300, 'Timeout must not exceed 5 minutes')
  .refine(v => Number.isInteger(v), 'Timeout must be a whole number');

// Or with superRefine for multiple issues
const ConfigWithValidation = z.object({
  timeout: z.coerce.number().superRefine((value, ctx) => {
    if (value < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 1,
        type: 'number',
        inclusive: true,
        message: 'Timeout must be at least 1 second',
      });
    }
    if (value > 300) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: 300,
        type: 'number',
        inclusive: true,
        message: 'Timeout must not exceed 5 minutes',
      });
    }
  }),
});
```

### Merging Partial Configs
```typescript
import * as z from 'zod';

function deepMerge(target: any, source: any): any {
  if (!isObject(source)) return target;
  if (!isObject(target)) return source;

  const result = { ...target };
  for (const key in source) {
    if (source[key] === undefined) continue;

    if (isObject(source[key]) && isObject(target[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function isObject(value: any): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Load from multiple sources, merge, then validate
async function loadConfiguration(): Promise<Config> {
  const userConfig = await loadYamlConfig(getUserConfigPath());
  const projectConfig = await loadYamlConfig(getProjectConfigPath());
  const envConfig = parseEnvVars('CG_');

  const merged = deepMerge(deepMerge({}, userConfig), projectConfig);
  const final = deepMerge(merged, envConfig);

  return ConfigSchema.parse(final);
}
```

### Error Handling
```typescript
try {
  const config = ConfigSchema.parse(rawConfig);
} catch (error) {
  if (error instanceof z.ZodError) {
    for (const issue of error.issues) {
      console.error(`Config error at ${issue.path.join('.')}: ${issue.message}`);
    }
  }
  throw error;
}
```

## Alternative Libraries

### io-ts (For FP Teams)
- Best for teams already using fp-ts ecosystem
- Provides branded types for nominal typing
- Requires understanding of Either types and monadic composition
- Higher learning curve but powerful type system integration

### Yup (For Form-Heavy Apps)
- Strong integration with Formik for form validation
- Similar chainable API to Zod
- Good but slightly less ergonomic type inference

### AJV (For Polyglot Orgs)
- Uses JSON Schema - shareable across languages
- AOT compilation for best performance
- Requires additional libraries for good error messages

### class-validator (For NestJS)
- Decorator-based validation
- Tight NestJS integration
- Requires explicit type annotations (no inference)

## Common Pitfalls to Avoid

1. **Separate type definitions**: Never maintain types separately from schemas
   ```typescript
   // BAD: Types can drift from validation
   type Config = { port: number; host: string };
   const schema = z.object({ port: z.number().optional() }); // Mismatch!

   // GOOD: Derive types from schema
   const schema = z.object({ port: z.number(), host: z.string() });
   type Config = z.infer<typeof schema>;
   ```

2. **Forgetting coercion**: Environment variables are always strings
   ```typescript
   // BAD: Expects number but gets string
   const schema = z.object({ PORT: z.number() });

   // GOOD: Coerce string to number
   const schema = z.object({ PORT: z.coerce.number() });
   ```

3. **Shallow merging nested configs**: Use deep merge for proper override
4. **Not validating at startup**: Catch config errors before business logic runs

## Integration with Chainglass

For the Chainglass configuration system:

1. **Create `@chainglass/config` package** with Zod schemas
2. **Define typed config objects** with `__configPath` for YAML location mapping
3. **Export inferred types** for use across CLI, web, and MCP server
4. **Implement ConfigService** with `get<T>()` and `require<T>()` methods
5. **Create FakeConfigService** for testing

## Citations

Key sources from Perplexity research:
- Zod documentation: https://zod.dev
- Zod GitHub: https://github.com/colinhacks/zod
- Yup documentation: https://github.com/jquense/yup
- io-ts documentation: https://github.com/gcanti/io-ts
- AJV documentation: https://ajv.js.org
