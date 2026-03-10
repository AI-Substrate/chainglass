/**
 * Server-only exports for the themes domain.
 * Import from '@/features/_platform/themes/server' for server-side code.
 * Do NOT import this from client components — it uses node:fs.
 */
export { loadManifest, clearManifestCache } from './lib/manifest-loader';
