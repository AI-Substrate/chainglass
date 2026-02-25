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
      id: 'file-browser.copyPath',
      title: 'Copy Current File Path',
      domain: 'file-browser',
      category: 'Clipboard',
      params: z.object({}),
      icon: 'copy',
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
  ],
  keybindings: [],
};
