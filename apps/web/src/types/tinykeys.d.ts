/**
 * Type declarations for packages with missing exports.types condition.
 * tinykeys v3 has types but its package.json exports field lacks a "types" entry,
 * which breaks moduleResolution: "bundler".
 */

declare module 'tinykeys' {
  export interface KeyBindingMap {
    [keybinding: string]: (event: KeyboardEvent) => void;
  }

  export interface KeyBindingHandlerOptions {
    timeout?: number;
  }

  export function tinykeys(
    target: Window | HTMLElement,
    keyBindingMap: KeyBindingMap,
    options?: KeyBindingHandlerOptions
  ): () => void;

  export function createKeybindingsHandler(
    keyBindingMap: KeyBindingMap,
    options?: KeyBindingHandlerOptions
  ): (event: KeyboardEvent) => void;
}
