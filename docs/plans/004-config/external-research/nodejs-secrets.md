# Secret Management Best Practices for Node.js

**Research Date**: 2026-01-21
**Source**: Perplexity Deep Research
**Topic**: Secret handling, detection, and management for Node.js applications

## Executive Summary

Key recommendations for Chainglass:
1. **Use dotenv-expand** for `${VAR}` placeholder expansion
2. **Implement literal secret detection** for `sk-*`, `ghp_*`, etc.
3. **Consider 1Password CLI** integration for development
4. **Use cloud secret managers** (AWS/GCP/Azure) for production
5. **Mask secrets in logs** using regex patterns

## Dotenv Library Comparison

| Library | Variable Expansion | Multi-File | TypeScript |
|---------|-------------------|------------|------------|
| dotenv | No | No | Yes |
| dotenv-expand | Yes (`${VAR}`) | No | Yes |
| dotenv-flow | No | Yes (.env.local, .env.production) | Yes |
| dotenvx | Yes + encryption | Yes | Yes |

### Recommended: dotenv + dotenv-expand

```typescript
import { config } from 'dotenv';
import { expand } from 'dotenv-expand';

// Load and expand in one step
const env = expand(config());

// Example .env file:
// DATABASE_HOST=localhost
// DATABASE_PORT=5432
// DATABASE_URL=postgres://${DATABASE_HOST}:${DATABASE_PORT}/mydb
//
// Result: DATABASE_URL = "postgres://localhost:5432/mydb"
```

### Multi-Environment with dotenv-flow

```typescript
import dotenvFlow from 'dotenv-flow';

dotenvFlow.config();

// Loads files in order (later overrides earlier):
// 1. .env
// 2. .env.local
// 3. .env.${NODE_ENV}
// 4. .env.${NODE_ENV}.local
```

## Secret Detection Patterns

### Common Secret Prefixes

| Service | Pattern | Regex |
|---------|---------|-------|
| OpenAI | `sk-*` | `sk-[A-Za-z0-9]{48}` |
| GitHub PAT | `ghp_*` | `ghp_[A-Za-z0-9]{36}` |
| GitHub OAuth | `gho_*` | `gho_[A-Za-z0-9]{36}` |
| Slack Bot | `xoxb-*` | `xoxb-[0-9]{10,13}-[0-9]{10,13}-[A-Za-z0-9]{24}` |
| Stripe Live | `sk_live_*` | `sk_live_[A-Za-z0-9]{24}` |
| Stripe Test | `sk_test_*` | `sk_test_[A-Za-z0-9]{24}` |
| AWS Access Key | `AKIA*` | `AKIA[0-9A-Z]{16}` |
| Google API | `AIza*` | `AIza[0-9A-Za-z\-_]{35}` |

### Literal Secret Detection

```typescript
const SECRET_PATTERNS = [
  { name: 'OpenAI', pattern: /^sk-[A-Za-z0-9]{20,}$/ },
  { name: 'GitHub PAT', pattern: /^ghp_[A-Za-z0-9]{36}$/ },
  { name: 'GitHub OAuth', pattern: /^gho_[A-Za-z0-9]{36}$/ },
  { name: 'Slack Bot', pattern: /^xoxb-[0-9]+-[0-9]+-[A-Za-z0-9]+$/ },
  { name: 'Stripe', pattern: /^sk_(live|test)_[A-Za-z0-9]{24}$/ },
  { name: 'AWS', pattern: /^AKIA[0-9A-Z]{16}$/ },
];

export class LiteralSecretError extends Error {
  constructor(field: string, secretType: string) {
    const msg = `Literal ${secretType} secret detected in '${field}'.\n` +
      `Use placeholder: \${${field.toUpperCase()}}\n` +
      `Then set environment variable: ${field.toUpperCase()}=<your-secret>`;
    super(msg);
    this.name = 'LiteralSecretError';
  }
}

export function detectLiteralSecret(value: string): string | null {
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(value)) {
      return name;
    }
  }
  // Also check for high entropy strings > 40 chars
  if (value.length > 40 && hasHighEntropy(value)) {
    return 'High-entropy string';
  }
  return null;
}

function hasHighEntropy(str: string): boolean {
  const charCounts = new Map<string, number>();
  for (const char of str) {
    charCounts.set(char, (charCounts.get(char) || 0) + 1);
  }
  let entropy = 0;
  const len = str.length;
  for (const count of charCounts.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy > 4.5; // Threshold for random-looking strings
}

export function validateNoLiteralSecrets(config: Record<string, unknown>, path = ''): void {
  for (const [key, value] of Object.entries(config)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (typeof value === 'string') {
      const secretType = detectLiteralSecret(value);
      if (secretType) {
        throw new LiteralSecretError(currentPath, secretType);
      }
    } else if (typeof value === 'object' && value !== null) {
      validateNoLiteralSecrets(value as Record<string, unknown>, currentPath);
    }
  }
}
```

## Pre-Commit Hook Setup

### Using TruffleHog with Husky

```bash
# Install dependencies
pnpm add -D husky

# Initialize Husky
pnpm exec husky init

# Create pre-commit hook
cat > .husky/pre-commit << 'EOF'
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run TruffleHog on staged files
docker run --rm -v "$(pwd):/repo" trufflesecurity/trufflehog:latest \
  git file:///repo --only-verified --fail
EOF

chmod +x .husky/pre-commit
```

### Native TruffleHog (without Docker)

```bash
# Install TruffleHog
brew install trufflehog

# .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

trufflehog git file://. --since-commit HEAD --only-verified --fail
```

## 1Password CLI Integration

### Setup for Development

```bash
# Install 1Password CLI
brew install 1password-cli

# Authenticate
op signin

# Create .env with references
cat > .env << 'EOF'
DATABASE_URL=op://Development/database/connection-string
OPENAI_API_KEY=op://Development/openai/api-key
STRIPE_SECRET_KEY=op://Development/stripe/secret-key
EOF
```

### Running with 1Password

```bash
# Run any command with secrets injected
op run -- pnpm dev

# Or for npm scripts
# package.json
{
  "scripts": {
    "dev": "op run -- next dev",
    "start": "op run -- node dist/index.js"
  }
}
```

### Programmatic Integration

```typescript
import { execSync } from 'child_process';

function getSecretFrom1Password(reference: string): string {
  try {
    return execSync(`op read "${reference}"`, { encoding: 'utf-8' }).trim();
  } catch (error) {
    throw new Error(`Failed to read 1Password secret: ${reference}`);
  }
}

// Usage
const apiKey = getSecretFrom1Password('op://Development/openai/api-key');
```

## Cloud Secret Manager Integration

### AWS Secrets Manager

```typescript
import {
  SecretsManagerClient,
  GetSecretValueCommand
} from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'us-east-1' });

async function getSecret(secretName: string): Promise<string> {
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);

  if (response.SecretString) {
    return response.SecretString;
  }
  throw new Error(`Secret ${secretName} not found`);
}

// Usage
const dbCredentials = JSON.parse(await getSecret('prod/database/credentials'));
```

### Google Cloud Secret Manager

```typescript
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();

async function getSecret(secretName: string, version = 'latest'): Promise<string> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const name = `projects/${projectId}/secrets/${secretName}/versions/${version}`;

  const [response] = await client.accessSecretVersion({ name });
  return response.payload?.data?.toString() || '';
}
```

## CI/CD Secret Handling

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy
on: push

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1

      - name: Deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          API_KEY: ${{ secrets.API_KEY }}
        run: pnpm deploy
```

### OIDC Authentication (Preferred)

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      # Use OIDC instead of long-lived credentials
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/github-actions
          aws-region: us-east-1
```

## Runtime Secret Masking

### Log Masking Patterns

```typescript
const MASK_PATTERNS = [
  // Credit cards
  { pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, mask: 'XXXX-XXXX-XXXX-XXXX' },
  // API keys
  { pattern: /sk-[A-Za-z0-9]{20,}/g, mask: '[OPENAI_KEY]' },
  { pattern: /ghp_[A-Za-z0-9]{36}/g, mask: '[GITHUB_TOKEN]' },
  { pattern: /xoxb-[0-9]+-[0-9]+-[A-Za-z0-9]+/g, mask: '[SLACK_TOKEN]' },
  // URLs with credentials
  { pattern: /\/\/[^:]+:[^@]+@/g, mask: '//[REDACTED]@' },
];

export function maskSecrets(text: string): string {
  let masked = text;
  for (const { pattern, mask } of MASK_PATTERNS) {
    masked = masked.replace(pattern, mask);
  }
  return masked;
}

// Winston transport with masking
import winston from 'winston';

const maskingFormat = winston.format((info) => {
  info.message = maskSecrets(String(info.message));
  return info;
});

const logger = winston.createLogger({
  format: winston.format.combine(
    maskingFormat(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});
```

### Child Process Isolation

```typescript
import { spawn } from 'child_process';

// BAD: Inherits all env vars including secrets
spawn('node', ['child.js']);

// GOOD: Only pass required env vars
spawn('node', ['child.js'], {
  env: {
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH,
    // Only include what child needs
  },
});
```

## Chainglass Implementation Plan

### Secret Loading Pipeline

```typescript
export async function loadSecrets(): Promise<void> {
  const paths = getConfigPaths();

  // Load in order (later overrides earlier)
  // 1. User secrets (~/.config/chainglass/secrets.env)
  await loadDotenvIfExists(paths.userSecrets);

  // 2. Project secrets (.chainglass/secrets.env)
  await loadDotenvIfExists(paths.projectSecrets);

  // 3. Working directory (.env) - highest priority
  await loadDotenvIfExists(paths.dotenv);
}

async function loadDotenvIfExists(filepath: string): Promise<void> {
  try {
    await fs.access(filepath);
    const result = config({ path: filepath, override: true });
    expand(result);
  } catch {
    // File doesn't exist, skip
  }
}
```

### Validation Before Merge

```typescript
export function validateConfigSecrets(config: Record<string, unknown>): void {
  // Check for literal secrets before merging
  validateNoLiteralSecrets(config);

  // Check for unexpanded placeholders
  validateNoUnexpandedPlaceholders(config);
}

function validateNoUnexpandedPlaceholders(obj: Record<string, unknown>, path = ''): void {
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (typeof value === 'string' && value.includes('${')) {
      // Check if placeholder is still unexpanded
      const match = value.match(/\$\{([^}]+)\}/);
      if (match) {
        throw new Error(
          `Unexpanded placeholder in '${currentPath}': ${match[0]}\n` +
          `Set environment variable: ${match[1]}=<value>`
        );
      }
    } else if (typeof value === 'object' && value !== null) {
      validateNoUnexpandedPlaceholders(value as Record<string, unknown>, currentPath);
    }
  }
}
```

## Common Pitfalls

1. **Committing .env files**: Add to `.gitignore`
2. **Logging config objects**: Mask before logging
3. **Stack traces with secrets**: Use custom error handlers
4. **Child process inheritance**: Explicitly pass minimal env
5. **Secrets in error messages**: Sanitize before throwing

## Citations

Key sources from Perplexity research:
- dotenv: https://www.npmjs.com/package/dotenv
- dotenv-expand: https://github.com/motdotla/dotenv-expand
- TruffleHog: https://github.com/trufflesecurity/trufflehog
- 1Password CLI: https://developer.1password.com/docs/cli/
- AWS Secrets Manager: https://aws.amazon.com/secrets-manager/
- GitHub Actions Secrets: https://docs.github.com/actions/security-guides/using-secrets-in-github-actions
