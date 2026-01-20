// test/setup.ts (minimal - NO @chainglass/* imports yet)
import 'reflect-metadata';
import { container } from 'tsyringe';

// NOTE: Do NOT import from @chainglass/shared here - it doesn't exist until Phase 2
// Shared package imports will be added in Phase 2 after the package is created

beforeEach(() => {
  container.clearInstances();
});
