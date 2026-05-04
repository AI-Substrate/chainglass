/**
 * File-browser SDK contribution manifest.
 *
 * Static declaration of commands, settings, and keybindings that the
 * file-browser domain publishes to the USDK surface.
 *
 * DYK-P6-02: No openFile command — goToFile already exists (Ctrl+P).
 * Only openFileAtLine (programmatic, takes path + line) and copyPath.
 *
 * Per Plan 047, Phase 6, Task T001.
 */

import { z } from 'zod';

import type { SDKContribution } from '@chainglass/shared/sdk';
import {
  RECENT_FEED_DEFAULTS,
  RECENT_FEED_SETTING_KEYS,
} from '../components/recent-feed/recent-feed-settings.defaults';

export const fileBrowserContribution: SDKContribution = {
  domain: 'file-browser',
  domainLabel: 'File Browser',
  commands: [
    {
      id: 'file-browser.goToFile',
      title: 'Go to File',
      domain: 'file-browser',
      category: 'Navigation',
      params: z.object({}),
      icon: 'file-search',
    },
    {
      id: 'file-browser.openFileAtLine',
      title: 'Open File at Line',
      domain: 'file-browser',
      category: 'Navigation',
      params: z.object({
        path: z.string(),
        line: z.number().int().positive().optional(),
      }),
      icon: 'file-text',
    },
    {
      // Plan recent-changes-feed T030 — LOCKED command name per Constitution Gate.
      // Handler is registered in browser-client.tsx (where setParams lives).
      id: 'file-browser.openRecentFeed',
      title: 'Open Recent Changes Feed',
      domain: 'file-browser',
      category: 'Navigation',
      params: z.object({}),
      icon: 'history',
    },
    {
      id: 'file-browser.copyPath',
      title: 'Copy Current File Path',
      domain: 'file-browser',
      category: 'Clipboard',
      params: z.object({}),
      icon: 'copy',
    },
    {
      id: 'file-browser.restartFlowspace',
      title: 'Restart FlowSpace',
      domain: 'file-browser',
      category: 'Search',
      params: z.object({}),
      icon: 'refresh',
    },
  ],
  settings: [
    {
      key: 'file-browser.showHiddenFiles',
      domain: 'file-browser',
      label: 'Show Hidden Files',
      description: 'Show files and directories starting with a dot',
      schema: z.boolean().default(false),
      ui: 'toggle',
      section: 'File Browser',
    },
    {
      key: 'file-browser.previewOnClick',
      domain: 'file-browser',
      label: 'Preview on Click',
      description: 'Automatically preview files when clicking in the tree',
      schema: z.boolean().default(true),
      ui: 'toggle',
      section: 'File Browser',
    },
    {
      key: 'editor.fontSize',
      domain: 'file-browser',
      label: 'Font Size',
      description: 'Editor font size in pixels',
      schema: z.number().min(8).max(32).default(14),
      ui: 'number',
      section: 'Editor',
    },
    {
      key: 'editor.wordWrap',
      domain: 'file-browser',
      label: 'Word Wrap',
      description: 'How lines should wrap in the editor',
      schema: z.string().default('off'),
      ui: 'select',
      options: [
        { value: 'off', label: 'Off' },
        { value: 'on', label: 'On' },
        { value: 'wordWrapColumn', label: 'At Column' },
        { value: 'bounded', label: 'Bounded' },
      ],
      section: 'Editor',
    },
    {
      key: 'editor.tabSize',
      domain: 'file-browser',
      label: 'Tab Size',
      description: 'Number of spaces per tab stop',
      schema: z.number().min(1).max(8).default(2),
      ui: 'number',
      section: 'Editor',
    },
    // ─── Recent Changes Feed (Plan recent-changes-feed T028) ─────────────────
    // LOCKED namespace per Constitution Gate: renaming any key breaks v1
    // user data silently. Defaults sourced from RECENT_FEED_DEFAULTS — single
    // source of truth (recent-feed-settings.defaults.ts).
    {
      key: RECENT_FEED_SETTING_KEYS.feedSize,
      domain: 'file-browser',
      label: 'Feed size',
      description: 'Number of recent files to seed the feed with on open.',
      schema: z.number().int().min(5).max(200).default(RECENT_FEED_DEFAULTS.feedSize),
      ui: 'number',
      section: 'Recent Changes Feed',
    },
    {
      key: RECENT_FEED_SETTING_KEYS.feedCeiling,
      domain: 'file-browser',
      label: 'Feed ceiling',
      description: 'Hard cap on items in the feed (oldest evicted past this).',
      schema: z.number().int().min(50).max(500).default(RECENT_FEED_DEFAULTS.feedCeiling),
      ui: 'number',
      section: 'Recent Changes Feed',
    },
    {
      key: RECENT_FEED_SETTING_KEYS.mdExcerptLines,
      domain: 'file-browser',
      label: 'Markdown excerpt — lines',
      description: 'Maximum non-empty lines included in markdown excerpts.',
      schema: z.number().int().min(2).max(40).default(RECENT_FEED_DEFAULTS.mdExcerptLines),
      ui: 'number',
      section: 'Recent Changes Feed',
    },
    {
      key: RECENT_FEED_SETTING_KEYS.mdExcerptChars,
      domain: 'file-browser',
      label: 'Markdown excerpt — characters',
      description: 'Approximate maximum characters included in markdown excerpts.',
      schema: z.number().int().min(100).max(5000).default(RECENT_FEED_DEFAULTS.mdExcerptChars),
      ui: 'number',
      section: 'Recent Changes Feed',
    },
    {
      key: RECENT_FEED_SETTING_KEYS.codeExcerptLines,
      domain: 'file-browser',
      label: 'Code excerpt — lines',
      description: 'Maximum lines included in code excerpts.',
      schema: z.number().int().min(2).max(60).default(RECENT_FEED_DEFAULTS.codeExcerptLines),
      ui: 'number',
      section: 'Recent Changes Feed',
    },
    {
      key: RECENT_FEED_SETTING_KEYS.autoplayPolicy,
      domain: 'file-browser',
      label: 'Video autoplay',
      description: 'When videos in the feed should auto-play. "Off" (default) shows native controls only.',
      schema: z
        .enum(['off', 'on-hover', 'on'])
        .default(RECENT_FEED_DEFAULTS.autoplayPolicy),
      ui: 'select',
      options: [
        { value: 'off', label: 'Off' },
        { value: 'on-hover', label: 'On hover' },
        { value: 'on', label: 'On (loop)' },
      ],
      section: 'Recent Changes Feed',
    },
    {
      key: RECENT_FEED_SETTING_KEYS.deletedWindow,
      domain: 'file-browser',
      label: 'Deleted-card visibility (ms)',
      description: 'How long a deleted-file card stays visible before auto-removal. Set to 0 to dismiss immediately, or a very large value to keep until manually dismissed.',
      schema: z.number().int().min(0).max(60_000).default(RECENT_FEED_DEFAULTS.deletedWindow),
      ui: 'number',
      section: 'Recent Changes Feed',
    },
    {
      key: RECENT_FEED_SETTING_KEYS.inFlightMediaBound,
      domain: 'file-browser',
      label: 'In-flight media bound',
      description: 'Maximum number of media elements (image/video/audio) the feed will keep decoded simultaneously.',
      schema: z.number().int().min(1).max(20).default(RECENT_FEED_DEFAULTS.inFlightMediaBound),
      ui: 'number',
      section: 'Recent Changes Feed',
    },
    {
      key: RECENT_FEED_SETTING_KEYS.openOnLaunch,
      domain: 'file-browser',
      label: 'Open feed on workspace launch',
      description: 'Show the Recent Changes Feed automatically when entering a workspace browser without a specific file or directory.',
      schema: z.boolean().default(RECENT_FEED_DEFAULTS.openOnLaunch),
      ui: 'toggle',
      section: 'Recent Changes Feed',
    },
    // defaultFilters is a complex shape (string array) — no UI yet; the
    // orchestrator reads the default. T028 documents this gap; v1.x can
    // surface multi-select if user demand emerges.
  ],
  keybindings: [
    // Plan recent-changes-feed T030 — Cmd/Ctrl+Shift+U ("Updates"). Verified
    // not in conflict with existing keybindings (only pr-view's KeyR and
    // notes's KeyL use $mod+Shift+...).
    { key: '$mod+Shift+KeyU', command: 'file-browser.openRecentFeed' },
  ],
};
