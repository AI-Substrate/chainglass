# Research Report: Professional Web Dashboard Design for Chainglass

**Generated**: 2026-01-22
**Research Query**: "Website design that pops - theming, ReactFlow, Kanban, SSE real-time updates, best practices for engineering tool dashboards"
**Mode**: Pre-Plan
**FlowSpace**: Not Available (graph not scanned)
**Findings**: Comprehensive external research

## Executive Summary

### What Chainglass Does
Chainglass is a **workflow orchestration system for AI agents** - similar to Argo Workflows but designed for agent orchestration. It provides:
- **CLI** (`cg`): Command-line interface for automation and scripting
- **MCP Server**: Model Context Protocol server for AI agent integration
- **Web Application**: GUI for human interaction with workflows (currently placeholder)

The project uses a clean architecture with `@chainglass/shared` as the core package containing interfaces, fakes, and adapters. It employs TSyringe for dependency injection with explicit `useFactory` patterns (no decorators for RSC compatibility).

### Business Purpose
The web application needs to be a professional engineering tool dashboard that:
1. Looks modern and visually appealing ("pops")
2. Supports light and dark themes with additional theme customization
3. Demonstrates ReactFlow for workflow visualization
4. Implements Kanban-style task management
5. Uses Server-Sent Events for real-time backend updates
6. Maintains clean architecture with services and adapters
7. Is testable via headless patterns for TDD and potential CLI reuse

### Key Insights
1. **Headless-first architecture** is essential for TDD and cross-platform reuse (CLI, MCP, Web)
2. **CSS Custom Properties** should be the primary theming mechanism, not JavaScript state
3. **dnd-kit** is preferred for drag-drop (Kanban) due to fine-grained control and performance
4. **SSE over WebSockets** for server-to-client real-time updates (simpler, HTTP-based)
5. Modern React patterns favor **compound components, Zustand state management, and React 19 features**

### Quick Stats
- **Current Web State**: Placeholder page, Next.js 15 with React 19
- **Styling**: No CSS framework currently installed
- **Architecture**: Clean architecture with DI via TSyringe, interface-first design
- **Testing**: Vitest with fakes over mocks, contract tests

---

## Current Codebase Structure

### Project Architecture
```
chainglass/
├── apps/
│   ├── web/              # Next.js web application (placeholder)
│   │   ├── app/          # App Router pages
│   │   │   ├── api/health/route.ts
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   └── src/
│   │       ├── lib/di-container.ts  # DI with production/test factories
│   │       ├── services/sample.service.ts  # Reference implementation
│   │       └── adapters/
│   └── cli/              # @chainglass/cli
├── packages/
│   ├── shared/           # @chainglass/shared - Interfaces, fakes, adapters
│   │   └── src/
│   │       ├── interfaces/   # ILogger, IConfigService
│   │       ├── fakes/        # FakeLogger, FakeConfigService
│   │       ├── adapters/     # PinoLoggerAdapter
│   │       └── config/       # Configuration system
│   └── mcp-server/       # @chainglass/mcp-server
├── test/                 # Centralized test suite
│   ├── contracts/        # Contract test factories
│   ├── unit/             # Unit tests by package
│   └── integration/      # Cross-package tests
└── docs/
    ├── project-rules/    # Constitution & architecture rules
    └── adr/              # Architecture Decision Records
```

### Key Design Patterns in Place
1. **Interface-first design**: Define interfaces before implementations
2. **Fakes over mocks**: Full fake implementations instead of mocking libraries
3. **Child container isolation**: Fresh DI container per test
4. **useFactory pattern**: No @injectable decorators (RSC compatibility)
5. **Config pre-loading**: Config loads before DI container creation

---

## How the Current Web App Works

### Entry Points
| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| `page.tsx` | Page | `apps/web/app/page.tsx` | Home page (placeholder) |
| `layout.tsx` | Layout | `apps/web/app/layout.tsx` | Root layout |
| `/api/health` | API Route | `apps/web/app/api/health/route.ts` | Health check |

### Dependencies
| Dependency | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.1.6 | Framework |
| React | 19.0.0 | UI library |
| TSyringe | 4.8.0 | Dependency injection |
| @chainglass/shared | workspace | Shared interfaces and fakes |

### Current DI Container Pattern
```typescript
// Production container: requires pre-loaded config
export function createProductionContainer(config: IConfigService): DependencyContainer

// Test container: uses fakes
export function createTestContainer(): DependencyContainer
```

---

## Research Findings: Theme System Architecture

### Recommendation: CSS Custom Properties + next-themes

**Core Approach**: Use CSS custom properties as the primary theming mechanism with `next-themes` for mode switching and FOUC prevention.

#### Why CSS Custom Properties Over JS Context
- Cascades naturally through DOM without React re-renders
- Minimal JavaScript overhead
- Separates design system (CSS) from component logic
- Browser handles cascading automatically

#### Three-Tier Token Structure
1. **Primitive tokens**: Raw design values (colors, spacing scales)
2. **Semantic tokens**: Context-specific mappings (`--surface-primary`, `--text-primary`)
3. **Component tokens**: Component-specific overrides

#### Implementation Pattern
```css
:root {
  /* Primitive tokens */
  --color-blue-500: 59, 130, 246;
  --color-gray-900: 23, 23, 23;

  /* Semantic tokens for light mode */
  --surface-primary: var(--color-neutral-0);
  --text-primary: var(--color-gray-900);
}

[data-theme='dark'] {
  --surface-primary: var(--color-gray-900);
  --text-primary: var(--color-neutral-0);
}
```

#### FOUC Prevention
Inject minimal inline script in `<head>` that runs before first paint:
```typescript
const themeScript = `
  (function() {
    const theme = localStorage.getItem('theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  })();
`;
```

#### Accessibility Requirements
- WCAG 2.1 Level AA: 4.5:1 contrast ratio for normal text
- Each theme variant must independently meet contrast requirements
- Never rely on color alone to convey information

---

## Research Findings: Component Architecture

### Recommended Patterns

#### 1. Atomic Design + Compound Components
- **Atoms**: Buttons, inputs, badges
- **Molecules**: Form fields, card headers
- **Organisms**: Sidebar, dashboard panels
- **Compound Components**: Tabs, Dropdowns with shared context

#### 2. Headless Component Pattern (Critical for TDD/CLI)
Separate logic from presentation completely:
```typescript
// Headless hook - pure logic, no UI
function useKanbanBoard(initialTasks: Task[]) {
  const [tasks, setTasks] = useState(initialTasks);
  const moveTask = (taskId: string, column: string) => { /* logic */ };
  return { tasks, moveTask, /* other actions */ };
}

// UI layer - consumes headless hook
function KanbanBoard({ initialTasks }: KanbanBoardProps) {
  const { tasks, moveTask } = useKanbanBoard(initialTasks);
  return <KanbanBoardUI tasks={tasks} onMoveTask={moveTask} />;
}
```

Benefits:
- Logic can be tested without rendering
- Same logic can power CLI commands
- Clean separation of concerns
- Full TDD support

#### 3. State Management: Zustand
Preferred over Redux for:
- Minimal boilerplate
- Hooks-based API
- Built-in memoization
- ~1KB gzipped

```typescript
const useDashboardStore = create<DashboardStore>((set) => ({
  filters: { timeRange: 'month' },
  setFilters: (updates) => set(state => ({
    filters: { ...state.filters, ...updates }
  })),
}));
```

#### 4. TypeScript Patterns
- **Discriminated unions** for type-safe props
- **Generic components** for reusable data displays
- **Polymorphic "as" pattern** for flexible element rendering

---

## Research Findings: ReactFlow Implementation

### Architecture Overview
- **Nodes**: React components representing workflow entities
- **Edges**: Connections between nodes
- **Handles**: Connection points on nodes (source/target)

### Recommended Approach for Chainglass

#### 1. Custom Node Types
```typescript
const nodeTypes = {
  workflow: WorkflowNode,
  phase: PhaseNode,
  agent: AgentNode,
};
```

#### 2. State Management with Zustand
```typescript
interface FlowState {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
}

const useFlowStore = create<FlowState>((set) => ({
  nodes: [],
  edges: [],
  onNodesChange: (changes) => set(state => ({
    nodes: applyNodeChanges(changes, state.nodes)
  })),
}));
```

#### 3. Performance Optimization (Critical)
- **Memoize custom nodes** with `React.memo`
- **useCallback for handlers** to prevent re-renders
- **Store derived data separately** (e.g., selectedNodeIds)
- **Viewport virtualization** for large graphs

#### 4. TypeScript Typing
```typescript
type AppNode = WorkflowNode | PhaseNode | AgentNode;
type AppEdge = Edge<{ value: number }>;
```

#### 5. Layout Algorithms
- **Dagre**: Simple hierarchical layouts (good for workflows)
- **ELK**: Advanced layouts for complex graphs

---

## Research Findings: Kanban Board Implementation

### Library Selection: dnd-kit

**Why dnd-kit over @hello-pangea/dnd**:
- Fine-grained control over collision detection
- Better performance with memoization
- ~10KB core, zero external dependencies
- Supports virtualized lists
- Better TypeScript support

### Architecture Pattern

#### 1. Normalized Data Structure
```typescript
interface Board {
  columns: Record<string, Column>;
  cards: Record<string, Card>;
  columnOrder: string[];
}

interface Card {
  id: string;
  title: string;
  columnId: string;
  order: number;
}
```

#### 2. Headless Board Logic (Critical for TDD)
```typescript
// Pure logic hook - testable without rendering
function useBoardState(initialBoard: Board) {
  const [board, setBoard] = useState(initialBoard);

  const moveCard = useCallback((cardId: string, targetColumnId: string, position: number) => {
    setBoard(prev => {
      // Pure state transformation logic
      return transformBoard(prev, cardId, targetColumnId, position);
    });
  }, []);

  return { board, moveCard, addCard, deleteCard };
}
```

#### 3. Keyboard Accessibility
```typescript
const sensors = useSensors(
  useSensor(PointerSensor),
  useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  })
);
```

#### 4. Virtual Scrolling for Large Boards
Use `react-window` with `FixedSizeList` for columns with many cards.

---

## Research Findings: Server-Sent Events (SSE)

### Why SSE Over WebSockets
- Simpler HTTP-based approach
- Works through firewalls and proxies
- Automatic reconnection built into EventSource API
- One-way server→client fits dashboard use case
- Better HTTP/2 support

### Next.js App Router Implementation

#### 1. Route Handler Pattern
```typescript
// app/api/events/[channelId]/route.ts
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, 30000);

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        controller.close();
      });
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    }
  });
}
```

#### 2. Connection Manager for Broadcasting
```typescript
class SSEManager {
  private connections = new Map<string, Set<SSEConnection>>();

  broadcast(channelId: string, eventType: string, data: any) {
    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    this.connections.get(channelId)?.forEach(conn => conn.write(message));
  }
}
```

#### 3. Client-Side Hook
```typescript
function useSSE(url: string, handlers: EventHandlers) {
  useEffect(() => {
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      handlers.onMessage?.(JSON.parse(event.data));
    };

    return () => eventSource.close();
  }, [url]);
}
```

#### 4. TypeScript Type Safety with Zod
```typescript
const sseEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status_update'), data: statusDataSchema }),
  z.object({ type: z.literal('error'), data: errorDataSchema }),
]);
```

---

## Research Findings: UX Design for Engineering Tools

### Key Principles

#### 1. Information Hierarchy
- Design FROM the data, not FOR the data
- Use progressive disclosure to manage complexity
- Surface actionable insights first

#### 2. Navigation Patterns
- **Sidebar navigation**: Primary for complex apps
- **Breadcrumbs**: Show position in hierarchy
- **Tabs**: Switch views without page transitions
- **Progressive disclosure**: Hide advanced options by default

#### 3. Dashboard Layout
- **Grid systems**: 12-column with gutters for alignment
- **Modular grids**: Equally-sized modules for data comparison
- **Stratified layouts**: High-level info at top, details below
- **Mobile**: 4-6 KPIs per view, touch-friendly targets

#### 4. Color System for Status
| Status | Color | Usage |
|--------|-------|-------|
| Critical | Red | Blocking issues, immediate action |
| Warning | Orange | Serious but non-blocking |
| Caution | Yellow | Watch/instability |
| Success | Green | Normal operations |
| Standby | Blue | Available/ready |
| Off/Disabled | Gray | Inactive |

**Rule**: Reserve intense colors exclusively for urgent states.

#### 5. Interaction Patterns
- **Button states**: Enabled, disabled, hover, focus, pressed, loading
- **Hover delay**: ~150-200ms to prevent accidental triggers
- **Empty states**: Include message, visual, and call-to-action
- **Loading feedback**: Immediate visual acknowledgment (<100ms)

#### 6. Professional Aesthetics
- **Whitespace**: Enhances readability, creates focus, elevates polish
- **Bold minimalism**: Few elements with heavy emphasis
- **Dark mode**: Default for technical users, reduces eye strain
- **Typography**: Sans-serif, proper hierarchy, baseline grids

---

## Architecture Recommendations for Implementation

### 1. Headless-First Pattern (Aligned with Chainglass Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                    HEADLESS LAYER                            │
│  Pure TypeScript logic - testable, portable                 │
│  (useBoardState, useFlowState, useSSEConnection)            │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   INTERFACES                           │  │
│  │  IThemeService, IBoardState, IFlowState               │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Web (React)   │  │   CLI (stdout)  │  │   MCP (JSON)    │
│   UI Layer      │  │   Output Layer  │  │   Tool Layer    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### 2. Recommended File Structure
```
apps/web/
├── app/
│   ├── layout.tsx           # Root layout with ThemeProvider
│   ├── page.tsx             # Home/dashboard page
│   ├── workflow/
│   │   └── page.tsx         # ReactFlow demo page
│   ├── kanban/
│   │   └── page.tsx         # Kanban demo page
│   └── api/
│       ├── health/route.ts
│       └── events/[channel]/route.ts  # SSE endpoint
├── src/
│   ├── components/
│   │   ├── ui/              # Atomic components (Button, Card, etc.)
│   │   ├── layout/          # Layout components (Sidebar, Header)
│   │   ├── workflow/        # ReactFlow components
│   │   └── kanban/          # Kanban components
│   ├── hooks/
│   │   ├── useTheme.ts
│   │   ├── useBoardState.ts     # Headless Kanban logic
│   │   ├── useFlowState.ts      # Headless ReactFlow logic
│   │   └── useSSE.ts
│   ├── lib/
│   │   ├── di-container.ts
│   │   ├── theme/           # Theme configuration
│   │   └── sse-manager.ts   # SSE connection management
│   ├── services/
│   │   └── sample.service.ts
│   └── styles/
│       ├── globals.css
│       └── themes.css       # CSS custom properties
└── tailwind.config.ts
```

### 3. Recommended Dependencies
```json
{
  "dependencies": {
    "@dnd-kit/core": "^6.0.0",
    "@dnd-kit/sortable": "^8.0.0",
    "next-themes": "^0.4.0",
    "reactflow": "^12.0.0",
    "zustand": "^5.0.0",
    "zod": "^3.0.0"
  },
  "devDependencies": {
    "tailwindcss": "^3.4.0",
    "@tailwindcss/typography": "^0.5.0"
  }
}
```

---

## Modification Considerations

### Safe to Modify
1. `apps/web/app/page.tsx` - Replace placeholder
2. `apps/web/app/layout.tsx` - Add theme provider
3. Add new pages under `apps/web/app/`
4. Add components under `apps/web/src/components/`
5. Add hooks under `apps/web/src/hooks/`
6. Add SSE endpoints under `apps/web/app/api/`

### Modify with Caution
1. `apps/web/src/lib/di-container.ts` - May need new service registrations
2. `packages/shared/` - Only for shared interfaces/adapters

### Danger Zones
1. Core architecture patterns (useFactory, child containers)
2. Test infrastructure in `test/`
3. Build configuration (turbo.json, tsconfig.json)

### Extension Points
1. **New interfaces**: Add to `packages/shared/src/interfaces/`
2. **New services**: Add to `apps/web/src/services/` with interface dependency
3. **New API routes**: Add under `apps/web/app/api/`

---

## External Research Opportunities

### Research Opportunity 1: Shadcn/ui Component Library Integration

**Why Needed**: Shadcn/ui provides professionally-designed, accessible React components that work with Tailwind CSS and support theming.

**Impact on Plan**: Could accelerate UI development while maintaining quality.

**Ready-to-use prompt:**
```
/deepresearch "Research shadcn/ui integration patterns with Next.js 15 and React 19. Focus on:
1. Installation and configuration with existing Tailwind setup
2. Dark mode integration with next-themes
3. Component customization patterns
4. Form handling with React 19 features
5. Accessibility features built-in
6. Integration with dnd-kit for Kanban
7. TypeScript support"
```

### Research Opportunity 2: Production SSE Scaling

**Why Needed**: Understanding production SSE patterns with Redis for multi-instance deployments.

**Impact on Plan**: Critical for production readiness when Chainglass scales.

**Ready-to-use prompt:**
```
/deepresearch "Research production Server-Sent Events scaling patterns. Focus on:
1. Redis Pub/Sub for multi-instance SSE broadcasting
2. Connection limits and resource management
3. Nginx/Caddy reverse proxy configuration for SSE
4. Monitoring and observability for SSE connections
5. Graceful shutdown and connection draining"
```

---

## Prior Learnings (From Previous Implementations)

### PL-01: RSC Decorator Incompatibility
**Source**: docs/plans/001-project-setup/
**Type**: gotcha
**Relevance**: High - affects all new service registrations

**What They Found**:
> TSyringe's `@injectable()` decorators may not survive React Server Component compilation.

**Action for Current Work**:
Always use `useFactory` pattern in DI container registrations. Never add `@injectable()` decorators.

### PL-02: Config Pre-Loading Pattern
**Source**: docs/plans/004-config/
**Type**: decision
**Relevance**: Medium - new services need config

**What They Found**:
> Config must be loaded BEFORE DI container creation. Services receive pre-loaded config via constructor injection.

**Action for Current Work**:
Any new theme or dashboard services should receive `IConfigService` via constructor, not load config themselves.

### PL-03: Test Isolation with Child Containers
**Source**: docs/plans/001-project-setup/
**Type**: decision
**Relevance**: High - all new tests must follow

**What They Found**:
> TSyringe singletons cause state leakage between tests. Solution: Create fresh child container per test via `createTestContainer()`.

**Action for Current Work**:
All new component/service tests must create fresh containers. Use `beforeEach(() => { container = createTestContainer(); })` pattern.

---

## Recommendations Summary

### If Implementing This System

1. **Start with theme system** - CSS custom properties foundation affects everything
2. **Add Tailwind CSS** - Utility-first styling with design tokens
3. **Implement headless hooks first** - Logic layer before UI for testability
4. **Build UI components on top** - Consume headless hooks
5. **Add SSE infrastructure** - Connection manager, React hooks
6. **Build demo pages** - ReactFlow workflow viewer, Kanban board

### If Extending This System

1. **New themes**: Add new `[data-theme='custom']` blocks in CSS
2. **New widgets**: Create headless hook + UI component pair
3. **New real-time features**: Add new SSE event types with Zod schemas

### If Refactoring This System

1. **Consider UI component library** (shadcn/ui) for consistency
2. **Extract more logic to @chainglass/shared** for CLI reuse
3. **Add Storybook** for component documentation

---

## Next Steps

**After External Research (if running /deepresearch prompts):**
1. Save results to `external-research/` folder
2. Run `/plan-1b-specify` to create specification

**If skipping external research:**
- Run `/plan-1b-specify "Professional web dashboard with theming, ReactFlow demo, Kanban demo, and SSE real-time updates"` to create specification

Note: Unresolved research opportunities will be flagged in `/plan-1b-specify` output.

---

**Research Complete**: 2026-01-22
**Report Location**: docs/plans/005-web-slick/research-dossier.md
