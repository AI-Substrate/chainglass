# Cross-Platform Configuration File Paths in Node.js

**Research Date**: 2026-01-21
**Source**: Perplexity Deep Research
**Topic**: Platform-aware configuration paths for macOS, Linux, and Windows

## Executive Summary

**Recommendation: Use `env-paths`** library for cross-platform path resolution. It provides:
- Automatic platform detection and convention compliance
- XDG Base Directory support on Linux
- macOS Library/Application Support paths
- Windows %APPDATA% handling
- Pure JavaScript (no native dependencies)

## Platform Conventions

### Linux (XDG Base Directory Specification)

| Variable | Default | Purpose |
|----------|---------|---------|
| `XDG_CONFIG_HOME` | `~/.config` | User configuration files |
| `XDG_DATA_HOME` | `~/.local/share` | User data files |
| `XDG_CACHE_HOME` | `~/.cache` | Non-essential cached data |
| `XDG_STATE_HOME` | `~/.local/state` | User state files |
| `XDG_RUNTIME_DIR` | Set by system | Runtime files (sockets, etc.) |

**Chainglass paths on Linux:**
- Config: `~/.config/chainglass/config.yaml`
- Secrets: `~/.config/chainglass/secrets.env`
- Data: `~/.local/share/chainglass/`
- Cache: `~/.cache/chainglass/`

### macOS

| Type | Path | Notes |
|------|------|-------|
| Application Support | `~/Library/Application Support/` | GUI apps |
| Preferences | `~/Library/Preferences/` | Plist files |
| CLI convention | `~/.config/` | XDG-style for CLI tools |

**Recommendation**: For CLI tools, prefer `~/.config/chainglass/` (Unix convention) but respect `XDG_CONFIG_HOME` if explicitly set.

### Windows

| Variable | Typical Path | Purpose |
|----------|-------------|---------|
| `%APPDATA%` | `C:\Users\<user>\AppData\Roaming` | Roaming app data |
| `%LOCALAPPDATA%` | `C:\Users\<user>\AppData\Local` | Local app data |

**Chainglass paths on Windows:**
- Config: `%APPDATA%\chainglass\config.yaml`
- Secrets: `%APPDATA%\chainglass\secrets.env`

## Library Comparison

| Library | Maintenance | Native Deps | XDG Support | Cross-Platform |
|---------|-------------|-------------|-------------|----------------|
| **env-paths** | Active (Sindre Sorhus) | No | Yes | Yes |
| platform-folders | Moderate | Yes (C++) | Yes | Yes |
| xdg-basedir | Active | No | Yes | Linux only |
| app-path | Low | No | No | Limited |

## Recommended: env-paths

### Installation
```bash
pnpm add env-paths
```

### Usage
```typescript
import envPaths from 'env-paths';

const paths = envPaths('chainglass', { suffix: '' });

// Returns platform-specific paths:
// Linux:
//   config: ~/.config/chainglass
//   data: ~/.local/share/chainglass
//   cache: ~/.cache/chainglass
//   log: ~/.local/state/chainglass
//   temp: /tmp/chainglass

// macOS:
//   config: ~/Library/Preferences/chainglass
//   data: ~/Library/Application Support/chainglass
//   cache: ~/Library/Caches/chainglass
//   log: ~/Library/Logs/chainglass
//   temp: /var/folders/.../chainglass

// Windows:
//   config: C:\Users\<user>\AppData\Roaming\chainglass\Config
//   data: C:\Users\<user>\AppData\Local\chainglass\Data
//   cache: C:\Users\<user>\AppData\Local\chainglass\Cache
//   log: C:\Users\<user>\AppData\Local\chainglass\Log
//   temp: C:\Users\<user>\AppData\Local\Temp\chainglass
```

### Custom Implementation (XDG-aware)

For Chainglass, we may want a custom implementation that:
1. Prefers `~/.config/` style on macOS (like fs2)
2. Respects XDG env vars when explicitly set
3. Falls back to platform conventions

```typescript
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

export function getUserConfigDir(): string {
  // Check for explicit XDG override (all platforms)
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome && xdgConfigHome.length > 0) {
    return path.join(xdgConfigHome, 'chainglass');
  }

  const home = process.env.HOME || os.homedir();

  switch (process.platform) {
    case 'win32':
      // Windows: use %APPDATA%
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      return path.join(appData, 'chainglass');

    case 'darwin':
    case 'linux':
    default:
      // Unix-like: use ~/.config (XDG default)
      return path.join(home, '.config', 'chainglass');
  }
}

export function getProjectConfigDir(): string | null {
  // Walk up from CWD until we find .chainglass or reach root (git-style discovery)
  let current = process.cwd();
  const root = path.parse(current).root;

  while (current !== root) {
    const candidate = path.join(current, '.chainglass');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    current = path.dirname(current);
  }

  // Check root directory as well
  const rootCandidate = path.join(root, '.chainglass');
  if (fs.existsSync(rootCandidate) && fs.statSync(rootCandidate).isDirectory()) {
    return rootCandidate;
  }

  return null; // No project config found
}

export async function ensureConfigDir(dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true, mode: 0o755 });
  return dir;
}

// File locations
export function getConfigPaths() {
  const userDir = getUserConfigDir();
  const projectDir = getProjectConfigDir(); // May be null if not in a project

  return {
    // User-level (global defaults)
    userConfig: path.join(userDir, 'config.yaml'),
    userSecrets: path.join(userDir, 'secrets.env'),

    // Project-level (workspace overrides) - null if no .chainglass found
    projectConfig: projectDir ? path.join(projectDir, 'config.yaml') : null,
    projectSecrets: projectDir ? path.join(projectDir, 'secrets.env') : null,

    // Project root directory (for reference)
    projectRoot: projectDir ? path.dirname(projectDir) : null,

    // Working directory (highest priority for secrets)
    dotenv: path.join(process.cwd(), '.env'),
  };
}
```

## Configuration Manager Class

```typescript
import envPaths from 'env-paths';
import fs from 'fs/promises';
import path from 'path';

export class ConfigurationPaths {
  private paths: ReturnType<typeof envPaths>;
  private appName: string;

  constructor(appName: string = 'chainglass') {
    this.appName = appName;
    this.paths = envPaths(appName, { suffix: '' });
  }

  async getConfigDir(): Promise<string> {
    const configDir = this.paths.config;
    await fs.mkdir(configDir, { recursive: true, mode: 0o755 });
    return configDir;
  }

  async getDataDir(): Promise<string> {
    const dataDir = this.paths.data;
    await fs.mkdir(dataDir, { recursive: true, mode: 0o755 });
    return dataDir;
  }

  async getCacheDir(): Promise<string> {
    const cacheDir = this.paths.cache;
    await fs.mkdir(cacheDir, { recursive: true, mode: 0o755 });
    return cacheDir;
  }

  async getConfigPath(filename: string): Promise<string> {
    const configDir = await this.getConfigDir();
    return path.join(configDir, filename);
  }
}
```

## Common Pitfalls

### 1. Path Separator Issues
```typescript
// BAD: Hardcoded separators
const configPath = `/home/user/.config/myapp/config.json`;

// GOOD: Use path.join()
import path from 'path';
const configPath = path.join(process.env.HOME!, '.config', 'myapp', 'config.json');
```

### 2. Environment Variable Resolution
```typescript
// BAD: Unresolved variable
const configPath = `$HOME/.config/myapp`;

// GOOD: Explicitly resolve
import os from 'os';
const home = process.env.HOME || os.homedir();
const configPath = path.join(home, '.config', 'myapp');
```

### 3. Case Sensitivity
- Linux: Case-sensitive (`File.txt` !== `file.txt`)
- Windows: Case-insensitive by default
- macOS: Case-insensitive by default (HFS+)

**Solution**: Use consistent lowercase for all config file names.

### 4. Directory Creation
```typescript
// Always use recursive: true and handle existing directories
await fs.mkdir(configDir, { recursive: true, mode: 0o755 });
```

## Migration Pattern

For migrating from legacy config locations:

```typescript
async function migrateConfig(appName: string): Promise<void> {
  const home = os.homedir();
  const legacyPath = path.join(home, `.${appName}`);
  const newPath = path.join(home, '.config', appName);

  try {
    // Check if legacy exists
    await fs.stat(legacyPath);

    // Check if new already exists
    try {
      await fs.stat(newPath);
      console.log(`Config already exists at ${newPath}, skipping migration`);
      return;
    } catch {
      // New path doesn't exist, proceed with migration
    }

    // Create parent directory
    await fs.mkdir(path.dirname(newPath), { recursive: true });

    // Copy directory
    await fs.cp(legacyPath, newPath, { recursive: true });
    console.log(`Migrated config from ${legacyPath} to ${newPath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Legacy config doesn't exist, nothing to migrate
      return;
    }
    throw error;
  }
}
```

## Chainglass Implementation Plan

1. **Create `@chainglass/config` package** with path resolution
2. **Use `~/.config/chainglass/` pattern** (fs2-compatible)
3. **Respect XDG_CONFIG_HOME** when explicitly set
4. **Project config in `.chainglass/`** directory
5. **Handle Windows via %APPDATA%**

## Citations

Key sources from Perplexity research:
- XDG Base Directory Spec: https://specifications.freedesktop.org/basedir/
- env-paths: https://www.npmjs.com/package/env-paths
- Node.js path module: https://nodejs.org/en/learn/manipulating-files/nodejs-file-paths
- Arch Linux XDG guide: https://wiki.archlinux.org/title/XDG_Base_Directory
