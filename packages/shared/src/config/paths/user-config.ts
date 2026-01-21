import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the user-level configuration directory for Chainglass.
 *
 * Follows platform conventions:
 * - Linux: $XDG_CONFIG_HOME/chainglass or ~/.config/chainglass
 * - macOS: ~/.config/chainglass
 * - Windows: %APPDATA%/chainglass
 *
 * Per Critical Discovery 07, this function handles cross-platform paths correctly.
 *
 * @returns Absolute path to user config directory
 */
export function getUserConfigDir(): string {
  // XDG_CONFIG_HOME takes precedence on any platform
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome) {
    return path.join(xdgConfigHome, 'chainglass');
  }

  // Get home directory - prefer HOME env var, fallback to os.homedir()
  const home = process.env.HOME || os.homedir();

  switch (process.platform) {
    case 'win32': {
      // Windows: Use APPDATA or construct fallback
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      return path.join(appData, 'chainglass');
    }
    default:
      // Unix-like: Use ~/.config/chainglass
      return path.join(home, '.config', 'chainglass');
  }
}

/**
 * Ensure the user config directory exists and contains a starter config file.
 *
 * Per DYK-09, this function:
 * - Creates the directory with mode 0755 if it doesn't exist
 * - Copies the starter template to config.yaml if missing
 * - Does NOT overwrite existing config.yaml
 * - Gracefully handles errors (logs warning, continues with Zod defaults)
 *
 * @param configDir - Path to the user config directory
 */
export function ensureUserConfig(configDir: string): void {
  try {
    // Create directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o755 });
    }

    const configPath = path.join(configDir, 'config.yaml');

    // Never overwrite existing config
    if (fs.existsSync(configPath)) {
      return;
    }

    // Copy starter template
    // Template is in packages/shared/src/config/templates/config.yaml
    // At runtime (compiled), it's at ../templates/config.yaml relative to this file
    const templatePath = path.join(__dirname, '..', 'templates', 'config.yaml');

    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, configPath);
      // Set explicit permissions (readable/writable by owner, readable by group/others)
      fs.chmodSync(configPath, 0o644);
    }
  } catch (error) {
    // DYK-09: Log warning but don't fail — Zod defaults will apply
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Could not create starter config at ${configDir}: ${message}`);
    console.warn('Using default configuration values.');
  }
}
