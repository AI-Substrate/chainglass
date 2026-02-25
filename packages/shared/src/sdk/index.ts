/**
 * SDK subpath barrel export.
 *
 * Provides types and interfaces for SDK consumers/publishers.
 * Import as: import { type IUSDK, type SDKCommand } from '@chainglass/shared/sdk'
 *
 * Per finding 04: This is a subpath export to prevent barrel pollution.
 * SDK hooks stay in apps/web/src/lib/sdk/ — never exported from shared.
 */

// Interfaces
export type {
  IUSDK,
  ICommandRegistry,
  ISDKSettings,
  IContextKeyService,
  IKeybindingService,
} from '../interfaces/sdk.interface.js';

// Value types
export type {
  SDKCommand,
  SDKSetting,
  SDKKeybinding,
  SDKContribution,
} from './types.js';

// DI tokens
export { SDK_DI_TOKENS } from './tokens.js';
