/**
 * Responsive Demo Page
 *
 * Demonstrates the Phase 6 responsive infrastructure:
 * - useResponsive hook with three-tier device detection
 * - Container query CSS utilities
 * - Progressive enhancement fallbacks
 */

'use client';

import { useResponsive } from '@/hooks/useResponsive';
import {
  containerBreakpoints,
  hasContainerQuerySupport,
} from '@/lib/container-query-utils';

export default function ResponsiveDemoPage() {
  const { isPhone, isTablet, isDesktop, useMobilePatterns, deviceType } =
    useResponsive();

  const cqSupported =
    typeof window !== 'undefined' && hasContainerQuerySupport();

  return (
    <div className="p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-bold mb-2">Responsive Infrastructure Demo</h1>
        <p className="text-muted-foreground">
          Phase 6: Three-tier device detection and container queries
        </p>
      </header>

      {/* useResponsive Hook Demo */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">useResponsive Hook</h2>
        <p className="text-sm text-muted-foreground">
          Current viewport state from the useResponsive hook:
        </p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <DeviceCard
            label="Device Type"
            value={deviceType ?? 'undefined (SSR)'}
            highlight={true}
          />
          <DeviceCard
            label="isPhone"
            value={isPhone ? 'true' : 'false'}
            highlight={isPhone}
          />
          <DeviceCard
            label="isTablet"
            value={isTablet ? 'true' : 'false'}
            highlight={isTablet}
          />
          <DeviceCard
            label="isDesktop"
            value={isDesktop ? 'true' : 'false'}
            highlight={isDesktop}
          />
          <DeviceCard
            label="useMobilePatterns"
            value={useMobilePatterns ? 'true' : 'false'}
            highlight={useMobilePatterns}
          />
        </div>

        <div className="p-4 bg-muted rounded-lg">
          <h3 className="font-medium mb-2">Breakpoints</h3>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>
              <code className="text-xs bg-background px-1 rounded">phone</code>:{' '}
              {'< 768px'}
            </li>
            <li>
              <code className="text-xs bg-background px-1 rounded">tablet</code>:{' '}
              768px - 1023px
            </li>
            <li>
              <code className="text-xs bg-background px-1 rounded">desktop</code>:{' '}
              {'>= 1024px'}
            </li>
          </ul>
        </div>
      </section>

      {/* Container Query Demo */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Container Queries</h2>
        <p className="text-sm text-muted-foreground">
          Container Query support:{' '}
          <span
            className={cqSupported ? 'text-green-600' : 'text-yellow-600'}
          >
            {cqSupported ? 'Supported' : 'Not Supported (using fallbacks)'}
          </span>
        </p>

        <div className="p-4 bg-muted rounded-lg">
          <h3 className="font-medium mb-2">Container Breakpoints</h3>
          <ul className="text-sm space-y-1 text-muted-foreground">
            {Object.entries(containerBreakpoints).map(([key, value]) => (
              <li key={key}>
                <code className="text-xs bg-background px-1 rounded">{key}</code>:{' '}
                {value}px
              </li>
            ))}
          </ul>
        </div>

        {/* Resizable Container Demo */}
        <div className="space-y-2">
          <h3 className="font-medium">Resizable Container Demo</h3>
          <p className="text-sm text-muted-foreground">
            Drag the right edge to resize and see container queries in action:
          </p>

          <div
            className="cq-container border rounded-lg p-4 resize-x overflow-auto min-w-[200px] max-w-full"
            style={{ width: '100%' }}
          >
            <div className="space-y-4">
              {/* Grid that changes based on container size */}
              <div className="grid gap-2 cq-grid-cols-2 cq-grid-cols-3 cq-grid-cols-4">
                <div className="p-2 bg-primary/10 rounded text-center text-sm">1</div>
                <div className="p-2 bg-primary/10 rounded text-center text-sm">2</div>
                <div className="p-2 bg-primary/10 rounded text-center text-sm">3</div>
                <div className="p-2 bg-primary/10 rounded text-center text-sm">4</div>
              </div>

              {/* Text that shows/hides based on container size */}
              <div className="text-sm">
                <span className="cq-hide-lg text-muted-foreground">
                  [Visible on small containers]
                </span>
                <span className="hidden cq-show-lg font-medium">
                  [Visible on large containers]
                </span>
              </div>

              {/* Flex direction changes */}
              <div className="flex cq-flex-col cq-flex-row-md gap-2">
                <div className="p-2 bg-secondary rounded text-sm flex-1">A</div>
                <div className="p-2 bg-secondary rounded text-sm flex-1">B</div>
                <div className="p-2 bg-secondary rounded text-sm flex-1">C</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Usage Examples */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Usage Examples</h2>

        <div className="space-y-4">
          <CodeExample
            title="useResponsive Hook"
            code={`import { useResponsive } from '@/hooks/useResponsive';

function MyComponent() {
  const { deviceType, isPhone, useMobilePatterns } = useResponsive();

  if (useMobilePatterns) {
    return <BottomTabBar />;
  }
  return <Sidebar />;
}`}
          />

          <CodeExample
            title="Container Query Classes"
            code={`<!-- Make parent a container -->
<div className="cq-container">
  <!-- Grid columns based on container size -->
  <div className="grid cq-grid-cols-2 cq-grid-cols-3">...</div>

  <!-- Hide on small containers -->
  <div className="cq-hide-sm">Hidden below 300px</div>

  <!-- Show on large containers -->
  <div className="hidden cq-show-lg">Visible at 768px+</div>
</div>`}
          />

          <CodeExample
            title="Progressive Enhancement"
            code={`import { hasContainerQuerySupport, addCqFallbacks } from '@/lib/container-query-utils';

// Check support
if (!hasContainerQuerySupport()) {
  console.log('Using media query fallbacks');
}

// Auto-add fallbacks
const className = addCqFallbacks('cq-hide-md cq-grid-cols-2');
// Returns: 'cq-hide-md max-[499px]:hidden cq-grid-cols-2 min-[500px]:grid-cols-2'`}
          />
        </div>
      </section>
    </div>
  );
}

function DeviceCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight: boolean;
}) {
  return (
    <div
      className={`p-4 rounded-lg border ${
        highlight
          ? 'bg-primary/10 border-primary/30'
          : 'bg-card border-border'
      }`}
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="font-mono text-lg">{value}</div>
    </div>
  );
}

function CodeExample({ title, code }: { title: string; code: string }) {
  return (
    <div className="space-y-2">
      <h3 className="font-medium text-sm">{title}</h3>
      <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-xs">
        <code>{code}</code>
      </pre>
    </div>
  );
}
