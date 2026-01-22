# Configuration Usage Guide

Step-by-step guides for common configuration tasks.

## Adding a New Config Type

Follow these steps to add a new configuration section.

### Step 1: Create the Zod Schema

Create a new schema file in `packages/shared/src/config/schemas/`:

```typescript
// packages/shared/src/config/schemas/my-feature.schema.ts
import { z } from 'zod';
import type { ConfigType } from '../../interfaces/config.interface.js';

// Define the Zod schema with defaults
export const MyFeatureConfigSchema = z.object({
  // Boolean with default
  enabled: z.boolean().default(true),

  // Number with coercion, range validation, and default
  maxRetries: z.coerce.number().min(0).max(10).default(3),

  // String with default
  endpoint: z.string().default('https://api.example.com'),

  // Optional field (no default needed)
  apiKey: z.string().optional(),
});

// Derive TypeScript type from schema (never define separately!)
export type MyFeatureConfig = z.infer<typeof MyFeatureConfigSchema>;

// Create ConfigType descriptor
export const MyFeatureConfigType: ConfigType<MyFeatureConfig> = {
  configPath: 'myFeature',  // Matches YAML key
  parse: (raw) => MyFeatureConfigSchema.parse(raw),
};
```

### Step 2: Export from Config Index

Add exports to `packages/shared/src/config/index.ts`:

```typescript
export {
  MyFeatureConfigSchema,
  MyFeatureConfigType,
  type MyFeatureConfig,
} from './schemas/my-feature.schema.js';
```

### Step 3: Register in ChainglassConfigService

Add to the CONFIG_REGISTRY in `packages/shared/src/config/chainglass-config.service.ts`:

```typescript
import { MyFeatureConfigSchema, MyFeatureConfigType } from './schemas/my-feature.schema.js';

const CONFIG_REGISTRY = [
  { configPath: 'sample', schema: SampleConfigSchema, type: SampleConfigType },
  { configPath: 'myFeature', schema: MyFeatureConfigSchema, type: MyFeatureConfigType },
] as const;
```

### Step 4: Add YAML Configuration

Add section to your config files:

```yaml
# ~/.config/chainglass/config.yaml (user defaults)
myFeature:
  enabled: true
  maxRetries: 5
  endpoint: https://api.example.com

# .chainglass/config.yaml (project overrides)
myFeature:
  endpoint: https://staging.example.com
```

## Consuming Config in a Service

### Step 1: Add Config to Constructor

```typescript
// apps/web/src/services/my.service.ts
import type { ILogger, IConfigService } from '@chainglass/shared';
import { MyFeatureConfigType } from '@chainglass/shared';

export class MyService {
  private readonly config: MyFeatureConfig;

  constructor(
    private readonly logger: ILogger,
    private readonly configService: IConfigService,
  ) {
    // Get config at construction time
    this.config = configService.require(MyFeatureConfigType);
  }

  async doWork(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug('MyFeature disabled, skipping');
      return;
    }

    this.logger.info('Processing', {
      endpoint: this.config.endpoint,
      maxRetries: this.config.maxRetries,
    });
    // ... implementation
  }
}
```

### Step 2: Update DI Container

Register the service with config dependency:

```typescript
// apps/web/src/lib/di-container.ts
childContainer.register(DI_TOKENS.MY_SERVICE, {
  useFactory: (c) => {
    const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
    const config = c.resolve<IConfigService>(DI_TOKENS.CONFIG);
    return new MyService(logger, config);
  },
});
```

## Environment Variable Overrides

Override any config value with environment variables.

### Naming Convention

```
CG_<SECTION>__<FIELD>=value
```

- Prefix: `CG_`
- Section separator: `__` (double underscore)
- Keys are UPPERCASE
- Values are strings (Zod handles coercion)

### Examples

```bash
# Override myFeature.enabled
export CG_MYFEATURE__ENABLED=false

# Override myFeature.maxRetries
export CG_MYFEATURE__MAX_RETRIES=10

# Override myFeature.endpoint
export CG_MYFEATURE__ENDPOINT=https://prod.example.com
```

### Nested Values

For deeply nested config:

```yaml
# YAML structure
database:
  connection:
    timeout: 30
```

```bash
# Environment override
export CG_DATABASE__CONNECTION__TIMEOUT=60
```

**Limit**: Maximum nesting depth is 4 levels (security protection).

## Secret Management

### Using Placeholders

Reference secrets in YAML files with `${VAR}` syntax:

```yaml
# config.yaml
myFeature:
  apiKey: ${MY_API_KEY}
  secretToken: ${SECRET_TOKEN}
```

### Setting Up secrets.env

Create a secrets.env file (NOT committed to git):

```bash
# .chainglass/secrets.env
MY_API_KEY=sk-abc123def456
SECRET_TOKEN=super-secret-value

# Variable expansion supported
DATABASE_URL=postgres://user:${DB_PASSWORD}@host/db
DB_PASSWORD=my-password
```

### Precedence for Secrets

1. User secrets: `~/.config/chainglass/secrets.env`
2. Project secrets: `.chainglass/secrets.env` (overrides user)

### What Happens on Missing Secret

If a placeholder remains unexpanded after loading, `config.load()` throws:

```
ConfigurationError: Unexpanded placeholder in 'myFeature.apiKey': ${MY_API_KEY}
Set environment variable: MY_API_KEY=<value>
Or add to .env file: MY_API_KEY=your-value-here
```

### Literal Secret Detection

Hardcoded secrets are detected and rejected:

```yaml
# This will FAIL at load time!
myFeature:
  apiKey: sk-abc123def456ghi789jkl012
```

```
LiteralSecretError: Detected hardcoded OpenAI API key in 'myFeature.apiKey'.
Use a placeholder: apiKey: ${MY_API_KEY}
```

**Detected patterns**: OpenAI (`sk-`), GitHub PAT (`ghp_`), Slack (`xoxb-`), Stripe (`sk_live/test_`), AWS (`AKIA`)

## Config in Different Environments

### Development

```yaml
# .chainglass/config.yaml
myFeature:
  endpoint: http://localhost:3000
  maxRetries: 1  # Fast failure for dev
```

### Staging

```bash
# Environment variables in CI
export CG_MYFEATURE__ENDPOINT=https://staging.example.com
```

### Production

```bash
# Environment variables in deployment
export CG_MYFEATURE__ENDPOINT=https://api.example.com
export CG_MYFEATURE__MAX_RETRIES=5
```

## Debugging Configuration

### Check Loaded Values

```typescript
const config = new ChainglassConfigService({ ... });
config.load();

// Check if loaded
console.log('Config loaded:', config.isLoaded());

// Get specific config
const myConfig = config.get(MyFeatureConfigType);
console.log('MyFeature config:', myConfig);
```

### Validate Configuration

Configuration is validated at `load()` time. If validation fails:

```
ZodError: [
  {
    "code": "too_small",
    "path": ["myFeature", "maxRetries"],
    "message": "Number must be greater than or equal to 0"
  }
]
```

## Next Steps

- [Testing Guide](./3-testing.md) - Testing patterns with FakeConfigService
- [Overview](./1-overview.md) - Architecture and concepts
