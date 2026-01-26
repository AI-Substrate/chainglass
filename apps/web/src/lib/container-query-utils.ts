/**
 * Container Query Utilities
 *
 * Utilities for working with CSS Container Queries in React components.
 * Container queries allow styling based on a container's size rather than viewport.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries
 */

/**
 * CSS class to define a container for container queries.
 * Apply to parent elements that should be query targets.
 *
 * @example
 * <div className={containerClass}>
 *   <div className="@container/content:hidden">Hidden on small container</div>
 * </div>
 */
export const containerClass = '@container';

/**
 * Named container class with inline-size containment.
 * Use when you need to reference a specific container.
 *
 * @param name - The container name for @container queries
 * @example
 * <div className={containerNamedClass('sidebar')}>
 *   <div className="@container/sidebar:block">Shows based on sidebar size</div>
 * </div>
 */
export function containerNamedClass(name: string): string {
  return `@container/${name}`;
}

/**
 * Breakpoints for container queries (in pixels).
 * These match common component sizes, not viewport sizes.
 */
export const containerBreakpoints = {
  /** Extra small container: < 300px */
  xs: 300,
  /** Small container: 300px - 499px */
  sm: 300,
  /** Medium container: 500px - 767px */
  md: 500,
  /** Large container: 768px - 1023px */
  lg: 768,
  /** Extra large container: >= 1024px */
  xl: 1024,
} as const;

/**
 * Checks if the browser supports CSS Container Queries.
 * Use for progressive enhancement.
 *
 * @returns true if container queries are supported
 *
 * @example
 * if (hasContainerQuerySupport()) {
 *   // Use container query classes
 * } else {
 *   // Fall back to media queries
 * }
 */
export function hasContainerQuerySupport(): boolean {
  if (typeof window === 'undefined') {
    // SSR: assume support, will be checked on client
    return true;
  }

  if (!CSS || !CSS.supports) {
    return false;
  }

  return CSS.supports('container-type', 'inline-size');
}

/**
 * Type for container query support state.
 */
export type ContainerQuerySupport = {
  /** Whether container queries are supported */
  supported: boolean;
  /** Whether we're in SSR mode (unknown) */
  ssr: boolean;
};

/**
 * Get container query support status with SSR awareness.
 *
 * @returns Support status object
 */
export function getContainerQuerySupport(): ContainerQuerySupport {
  if (typeof window === 'undefined') {
    return { supported: true, ssr: true };
  }

  return {
    supported: hasContainerQuerySupport(),
    ssr: false,
  };
}

/**
 * CSS custom properties for container query breakpoints.
 * Can be used in CSS-in-JS or template literals.
 */
export const containerQueryVars = {
  /** Container query breakpoint for small */
  sm: 'var(--cq-breakpoint-sm, 300px)',
  /** Container query breakpoint for medium */
  md: 'var(--cq-breakpoint-md, 500px)',
  /** Container query breakpoint for large */
  lg: 'var(--cq-breakpoint-lg, 768px)',
  /** Container query breakpoint for extra large */
  xl: 'var(--cq-breakpoint-xl, 1024px)',
} as const;

// ============================================================
// Progressive Enhancement Fallbacks
// ============================================================

/**
 * Returns CSS classes with progressive enhancement.
 * Applies container query classes when supported, falls back to media query equivalents.
 *
 * @param containerClasses - Classes using container queries
 * @param fallbackClasses - Equivalent media query classes
 * @returns Combined class string with appropriate fallback
 *
 * @example
 * // Use container query with media query fallback
 * <div className={withFallback('cq-hide-md', 'md:hidden')}>
 *   Hidden on medium+ containers (or medium+ viewport if CQ unsupported)
 * </div>
 */
export function withFallback(containerClasses: string, fallbackClasses: string): string {
  if (typeof window === 'undefined') {
    // SSR: return both, CSS will handle which applies
    return `${fallbackClasses} ${containerClasses}`;
  }

  if (hasContainerQuerySupport()) {
    return containerClasses;
  }

  return fallbackClasses;
}

/**
 * Mapping of container query classes to their media query fallbacks.
 * Used for automatic fallback generation.
 */
export const cqFallbackMap: Record<string, string> = {
  // Hide classes
  'cq-hide-sm': 'max-[299px]:hidden',
  'cq-hide-md': 'max-[499px]:hidden',
  'cq-hide-lg': 'max-md:hidden',
  'cq-hide-xl': 'max-lg:hidden',

  // Show classes
  'cq-show-sm': 'min-[300px]:block',
  'cq-show-md': 'min-[500px]:block',
  'cq-show-lg': 'md:block',
  'cq-show-xl': 'lg:block',

  // Grid columns
  'cq-grid-cols-2': 'min-[500px]:grid-cols-2',
  'cq-grid-cols-3': 'md:grid-cols-3',
  'cq-grid-cols-4': 'lg:grid-cols-4',

  // Flex direction
  'cq-flex-row-md': 'min-[500px]:flex-row',
  'cq-flex-row-lg': 'md:flex-row',

  // Text size
  'cq-text-lg-md': 'min-[500px]:text-lg',
  'cq-text-xl-lg': 'md:text-xl',
} as const;

/**
 * Automatically adds fallback classes for container query classes.
 * Only adds fallbacks for known container query class names.
 *
 * @param className - Original class string (may contain CQ classes)
 * @returns Class string with fallbacks added
 *
 * @example
 * addCqFallbacks('cq-hide-md cq-grid-cols-2')
 * // Returns: 'cq-hide-md max-[499px]:hidden cq-grid-cols-2 min-[500px]:grid-cols-2'
 */
export function addCqFallbacks(className: string): string {
  if (typeof window !== 'undefined' && hasContainerQuerySupport()) {
    // Container queries supported, no fallback needed
    return className;
  }

  const classes = className.split(/\s+/);
  const withFallbacks: string[] = [];

  for (const cls of classes) {
    withFallbacks.push(cls);
    if (cls in cqFallbackMap) {
      withFallbacks.push(cqFallbackMap[cls]);
    }
  }

  return withFallbacks.join(' ');
}

/**
 * React hook-friendly version that handles SSR.
 * Use in components that need container query progressive enhancement.
 *
 * @param containerClasses - Container query classes
 * @returns Object with `className` and support status
 *
 * @example
 * function MyComponent() {
 *   const { className, supported } = useContainerQueryClasses('cq-hide-md');
 *   return <div className={className}>Content</div>;
 * }
 */
export function getResponsiveClasses(containerClasses: string): {
  className: string;
  supported: boolean;
  ssr: boolean;
} {
  const support = getContainerQuerySupport();

  return {
    className: support.supported ? containerClasses : addCqFallbacks(containerClasses),
    supported: support.supported,
    ssr: support.ssr,
  };
}
