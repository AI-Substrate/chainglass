/**
 * Curated palettes for workspace visual identity.
 *
 * Per Plan 041: File Browser & Workspace-Centric UI
 * Per Workshop: workspace-preferences-data-model.md § 7
 *
 * Emoji palette (~30): Distinct, visually clear at small sizes.
 * Color palette (~10): Each with light/dark mode variants for accent borders/badges.
 */

export const WORKSPACE_EMOJI_PALETTE = [
  '🔮',
  '💎',
  '🔥',
  '⚡',
  '🌊',
  '🌿',
  '🎯',
  '🚀',
  '⭐',
  '🌸',
  '🦊',
  '🐙',
  '🦋',
  '🐝',
  '🦅',
  '🐺',
  '🔷',
  '🔶',
  '🟣',
  '🟢',
  '🔴',
  '🟡',
  '🎲',
  '🎪',
  '🧊',
  '🌈',
  '🍊',
  '🌺',
  '🎸',
  '🏔️',
] as const;

export type WorkspaceEmoji = (typeof WORKSPACE_EMOJI_PALETTE)[number];

export const WORKSPACE_COLOR_PALETTE = [
  { name: 'purple', light: '#8B5CF6', dark: '#A78BFA' },
  { name: 'blue', light: '#3B82F6', dark: '#60A5FA' },
  { name: 'cyan', light: '#06B6D4', dark: '#22D3EE' },
  { name: 'green', light: '#10B981', dark: '#34D399' },
  { name: 'yellow', light: '#F59E0B', dark: '#FBBF24' },
  { name: 'orange', light: '#F97316', dark: '#FB923C' },
  { name: 'red', light: '#EF4444', dark: '#F87171' },
  { name: 'pink', light: '#EC4899', dark: '#F472B6' },
  { name: 'indigo', light: '#6366F1', dark: '#818CF8' },
  { name: 'teal', light: '#14B8A6', dark: '#2DD4BF' },
] as const;

export type WorkspaceColorName = (typeof WORKSPACE_COLOR_PALETTE)[number]['name'];

/** Set of valid color names for quick validation */
export const WORKSPACE_COLOR_NAMES = new Set<string>(WORKSPACE_COLOR_PALETTE.map((c) => c.name));

/** Set of valid emojis for quick validation */
export const WORKSPACE_EMOJI_SET = new Set<string>(WORKSPACE_EMOJI_PALETTE);
