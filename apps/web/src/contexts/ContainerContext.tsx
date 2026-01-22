/**
 * ContainerContext - DI Container Bridge for React
 *
 * Provides React context for accessing the DI container in components.
 * Per DYK-01: This is a bridge only - components use useContainer() to resolve
 * dependencies, then pass them to hooks as parameters.
 *
 * Pattern:
 * ```tsx
 * function MyComponent() {
 *   const container = useContainer();
 *   const logger = container.resolve<ILogger>(DI_TOKENS.LOGGER);
 *   const { board, moveCard } = useBoardState(initialBoard, logger);
 * }
 * ```
 *
 * @example
 * // In app root:
 * <ContainerProvider container={productionContainer}>
 *   <App />
 * </ContainerProvider>
 *
 * // In tests:
 * <ContainerProvider container={testContainer}>
 *   <ComponentUnderTest />
 * </ContainerProvider>
 */

'use client';

import { type ReactNode, createContext, useContext } from 'react';
import type { DependencyContainer } from 'tsyringe';

/** Context for the DI container */
const ContainerContext = createContext<DependencyContainer | null>(null);

export interface ContainerProviderProps {
  /** The DI container instance to provide */
  container: DependencyContainer;
  /** Child components that can access the container */
  children: ReactNode;
}

/**
 * Provider component that makes the DI container available to child components.
 *
 * @example
 * import { createProductionContainer } from '@/lib/di-container';
 *
 * function App() {
 *   const container = createProductionContainer(config);
 *   return (
 *     <ContainerProvider container={container}>
 *       <Dashboard />
 *     </ContainerProvider>
 *   );
 * }
 */
export function ContainerProvider({ container, children }: ContainerProviderProps) {
  return <ContainerContext.Provider value={container}>{children}</ContainerContext.Provider>;
}

/**
 * Hook to access the DI container from within a component.
 *
 * Per DYK-01 (Parameter Injection Pattern):
 * - Use this hook in components to resolve dependencies
 * - Pass resolved dependencies to hooks as parameters
 * - Do NOT use this hook inside other hooks
 *
 * @throws Error if used outside ContainerProvider
 * @returns The DI container instance
 *
 * @example
 * function KanbanBoard({ initialBoard }: Props) {
 *   const container = useContainer();
 *   const logger = container.resolve<ILogger>(DI_TOKENS.LOGGER);
 *   const { board, moveCard } = useBoardState(initialBoard, logger);
 *   // ...
 * }
 */
export function useContainer(): DependencyContainer {
  const container = useContext(ContainerContext);

  if (!container) {
    throw new Error(
      'useContainer must be used within a ContainerProvider. ' +
        'Wrap your component tree with <ContainerProvider container={...}>.'
    );
  }

  return container;
}

/**
 * Hook to check if running inside a ContainerProvider.
 * Useful for components that may optionally use DI.
 *
 * @returns true if inside ContainerProvider, false otherwise
 */
export function useHasContainer(): boolean {
  const container = useContext(ContainerContext);
  return container !== null;
}

// Re-export context for advanced use cases (testing, custom providers)
export { ContainerContext };
