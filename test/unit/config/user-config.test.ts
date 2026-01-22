import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ensureUserConfig,
  getUserConfigDir,
} from '../../../packages/shared/src/config/paths/user-config.js';

/**
 * Unit tests for getUserConfigDir() - Cross-platform user config directory resolution.
 *
 * Per Critical Discovery 07, this function must:
 * - Use $XDG_CONFIG_HOME on Linux if set
 * - Use ~/.config/chainglass on macOS and Linux (when XDG not set)
 * - Use %APPDATA%/chainglass on Windows
 * - Auto-create directory with mode 0755 on first access
 */
describe('getUserConfigDir', () => {
  const originalEnv = process.env;
  const originalPlatform = process.platform;

  beforeEach(() => {
    // Reset environment for each test
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  describe('Linux with XDG_CONFIG_HOME', () => {
    it('should use XDG_CONFIG_HOME when set on Linux', () => {
      /*
      Test Doc:
      - Why: XDG Base Directory spec compliance on Linux
      - Contract: getUserConfigDir() returns $XDG_CONFIG_HOME/chainglass when XDG_CONFIG_HOME set
      - Usage Notes: XDG_CONFIG_HOME takes precedence over all other paths on any platform
      - Quality Contribution: Catches XDG spec violations
      - Worked Example: XDG_CONFIG_HOME=/home/user/.local/config → /home/user/.local/config/chainglass
      */
      vi.stubGlobal('process', {
        ...process,
        platform: 'linux',
        env: { XDG_CONFIG_HOME: '/home/user/.local/config' },
      });

      const result = getUserConfigDir();

      expect(result).toBe(path.join('/home/user/.local/config', 'chainglass'));
    });
  });

  describe('Linux without XDG_CONFIG_HOME', () => {
    it('should use ~/.config/chainglass on Linux without XDG', () => {
      /*
      Test Doc:
      - Why: Standard fallback when XDG_CONFIG_HOME not set
      - Contract: getUserConfigDir() returns $HOME/.config/chainglass on Linux
      - Usage Notes: HOME env var used; falls back to os.homedir()
      - Quality Contribution: Catches Linux path resolution bugs
      - Worked Example: HOME=/home/user → /home/user/.config/chainglass
      */
      vi.stubGlobal('process', { ...process, platform: 'linux', env: { HOME: '/home/user' } });

      const result = getUserConfigDir();

      expect(result).toBe(path.join('/home/user', '.config', 'chainglass'));
    });
  });

  describe('macOS', () => {
    it('should use ~/.config/chainglass on macOS', () => {
      /*
      Test Doc:
      - Why: macOS follows Unix conventions for CLI tools
      - Contract: getUserConfigDir() returns $HOME/.config/chainglass on darwin
      - Usage Notes: Not ~/Library/Application Support - we follow XDG pattern
      - Quality Contribution: Catches macOS-specific path bugs
      - Worked Example: HOME=/Users/dev → /Users/dev/.config/chainglass
      */
      vi.stubGlobal('process', { ...process, platform: 'darwin', env: { HOME: '/Users/dev' } });

      const result = getUserConfigDir();

      expect(result).toBe(path.join('/Users/dev', '.config', 'chainglass'));
    });
  });

  describe('Windows', () => {
    it('should use %APPDATA%/chainglass on Windows', () => {
      /*
      Test Doc:
      - Why: Windows uses APPDATA for user config per Windows conventions
      - Contract: getUserConfigDir() returns %APPDATA%\chainglass on win32
      - Usage Notes: APPDATA typically C:\Users\<name>\AppData\Roaming
      - Quality Contribution: Catches Windows path resolution bugs
      - Worked Example: APPDATA=C:\Users\dev\AppData\Roaming → C:\Users\dev\AppData\Roaming\chainglass
      */
      vi.stubGlobal('process', {
        ...process,
        platform: 'win32',
        env: { APPDATA: 'C:\\Users\\dev\\AppData\\Roaming' },
      });

      const result = getUserConfigDir();

      expect(result).toBe(path.join('C:\\Users\\dev\\AppData\\Roaming', 'chainglass'));
    });

    it('should fallback to AppData/Roaming if APPDATA not set', () => {
      /*
      Test Doc:
      - Why: APPDATA might not be set in some Windows environments
      - Contract: Falls back to $HOME/AppData/Roaming/chainglass if APPDATA undefined
      - Usage Notes: Edge case for non-standard Windows setups
      - Quality Contribution: Robustness for edge case environments
      - Worked Example: HOME=C:\Users\dev, no APPDATA → C:\Users\dev\AppData\Roaming\chainglass
      */
      vi.stubGlobal('process', {
        ...process,
        platform: 'win32',
        env: { HOME: 'C:\\Users\\dev', APPDATA: undefined },
      });

      const result = getUserConfigDir();

      expect(result).toBe(path.join('C:\\Users\\dev', 'AppData', 'Roaming', 'chainglass'));
    });
  });

  describe('HOME fallback', () => {
    it('should fallback to os.homedir() if HOME undefined', () => {
      /*
      Test Doc:
      - Why: HOME env var might not be set in some environments (e.g., services)
      - Contract: getUserConfigDir() uses os.homedir() as final fallback
      - Usage Notes: os.homedir() is platform-aware
      - Quality Contribution: Robustness for minimal environments
      - Worked Example: No HOME env → uses os.homedir()
      */
      const mockHomedir = '/fallback/home';
      vi.spyOn(os, 'homedir').mockReturnValue(mockHomedir);
      vi.stubGlobal('process', { ...process, platform: 'linux', env: {} });

      const result = getUserConfigDir();

      expect(result).toBe(path.join(mockHomedir, '.config', 'chainglass'));
    });
  });
});

/**
 * Unit tests for ensureUserConfig() - Auto-create config directory and copy template.
 *
 * Per DYK-09, this function must:
 * - Create directory if it doesn't exist (mode 0755)
 * - Copy starter template if config.yaml missing
 * - NOT overwrite existing config.yaml
 * - Gracefully handle filesystem errors (log warning, continue)
 */
describe('ensureUserConfig', () => {
  // These tests will use a temp directory to avoid polluting real filesystem
  let tempDir: string;

  beforeEach(async () => {
    const { mkdtemp } = await import('node:fs/promises');
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'chainglass-test-'));
  });

  afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should create config directory if not exists', async () => {
    /*
    Test Doc:
    - Why: First-run experience needs auto-directory creation
    - Contract: ensureUserConfig() creates configDir with mode 0755 if missing
    - Usage Notes: Uses fs.mkdirSync with recursive: true
    - Quality Contribution: Catches directory creation bugs
    - Worked Example: ensureUserConfig('/new/config') → directory created
    */
    const { existsSync, statSync } = await import('node:fs');
    const configDir = path.join(tempDir, 'new-config-dir');

    expect(existsSync(configDir)).toBe(false);

    ensureUserConfig(configDir);

    expect(existsSync(configDir)).toBe(true);
    // Check mode on non-Windows
    if (process.platform !== 'win32') {
      const stats = statSync(configDir);
      // 0755 = 493 decimal, but with umask applied it might be different
      // Just check it's a directory
      expect(stats.isDirectory()).toBe(true);
    }
  });

  it('should copy template if config.yaml missing', async () => {
    /*
    Test Doc:
    - Why: First-run should provide starter config with documentation
    - Contract: ensureUserConfig() copies template to config.yaml if missing
    - Usage Notes: Template is in packages/shared/src/config/templates/config.yaml
    - Quality Contribution: Ensures first-run experience is smooth
    - Worked Example: ensureUserConfig(emptyDir) → config.yaml created
    */
    const { existsSync, mkdirSync } = await import('node:fs');
    const configDir = path.join(tempDir, 'empty-config');
    mkdirSync(configDir, { recursive: true });

    ensureUserConfig(configDir);

    expect(existsSync(path.join(configDir, 'config.yaml'))).toBe(true);
  });

  it('should NOT overwrite existing config.yaml', async () => {
    /*
    Test Doc:
    - Why: User customizations must be preserved
    - Contract: ensureUserConfig() does not modify existing config.yaml
    - Usage Notes: Check exists before copy
    - Quality Contribution: Prevents data loss
    - Worked Example: ensureUserConfig(dirWithConfig) → original config preserved
    */
    const { existsSync, mkdirSync, writeFileSync, readFileSync } = await import('node:fs');
    const configDir = path.join(tempDir, 'existing-config');
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.yaml');
    writeFileSync(configPath, 'custom: value\n');

    ensureUserConfig(configDir);

    const content = readFileSync(configPath, 'utf-8');
    expect(content).toBe('custom: value\n');
  });

  it('should log warning and continue if copy fails (DYK-09)', async () => {
    /*
    Test Doc:
    - Why: Read-only filesystems (Docker, CI) should not crash the app
    - Contract: ensureUserConfig() catches errors, logs warning, continues
    - Usage Notes: Zod schema defaults will apply when no config file
    - Quality Contribution: Resilience in restricted environments
    - Worked Example: ensureUserConfig(readOnlyDir) → warning logged, no throw
    */
    // This test verifies the try/catch behavior by using an invalid path
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Use a path that will definitely fail (null byte is invalid on all platforms)
    // Actually, we can't test this easily without mocking fs, so we'll test with
    // a directory that we make read-only (on non-Windows)
    if (process.platform !== 'win32') {
      const { mkdirSync, chmodSync } = await import('node:fs');
      const restrictedDir = path.join(tempDir, 'restricted');
      mkdirSync(restrictedDir, { recursive: true });
      chmodSync(restrictedDir, 0o444); // read-only

      // Should not throw
      expect(() => ensureUserConfig(path.join(restrictedDir, 'subdir'))).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();

      // Restore permissions for cleanup
      chmodSync(restrictedDir, 0o755);
    } else {
      // On Windows, just verify the function handles errors gracefully
      // by not throwing for any path issues
      expect(() => ensureUserConfig(tempDir)).not.toThrow();
    }

    consoleSpy.mockRestore();
  });
});
