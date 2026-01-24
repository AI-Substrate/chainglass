// test/setup.ts (minimal - NO @chainglass/* imports yet)
import 'reflect-metadata';
import * as React from 'react';
import '@testing-library/jest-dom/vitest';
import { container } from 'tsyringe';

// Make React available globally for JSX in tests (required for Vitest + jsdom)
globalThis.React = React;

// NOTE: Do NOT import from @chainglass/shared here - it doesn't exist until Phase 2
// Shared package imports will be added in Phase 2 after the package is created

beforeEach(() => {
  container.clearInstances();
});
