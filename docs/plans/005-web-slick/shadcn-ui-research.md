# Research Dossier: shadcn/ui Integration

**Generated**: 2026-01-22
**Research Method**: Perplexity Deep Research
**Status**: Complete
**Decision**: ADOPT

---

## Executive Summary

shadcn/ui is a component collection built on Radix UI primitives and Tailwind CSS. Unlike traditional npm packages, components are copied into your codebase, giving you full ownership and customization control. The framework officially supports React 19 and Next.js 15, provides an MCP server for AI-assisted development, and aligns perfectly with our headless-first architecture and CSS custom properties theming approach.

**Key Decision Factors**:
1. MCP server enables AI-assisted component installation
2. CSS custom properties theming matches our research recommendations
3. Radix UI primitives provide accessibility out of the box
4. Compatible with ReactFlow, dnd-kit, and our DI patterns
5. Native monorepo/Turborepo support

---

## React 19 & Next.js 15 Compatibility

### Official Support Status

As of the current release, shadcn/ui provides **full support for React 19 and Tailwind v4**. The team maintains a dependency compatibility tracking table showing green checkmarks for all core dependencies:

| Dependency | React 19 Status |
|------------|-----------------|
| Radix UI | Fully compatible |
| lucide-react | Fully compatible |
| class-variance-authority | Fully compatible |
| tailwindcss-animate | Fully compatible |
| react-hook-form | Fully compatible |
| react-resizable-panels | Fully compatible |
| sonner | Fully compatible |

### Known Issues & Workarounds

**cmdk Package**: The command palette library may need explicit update after React 19 migration:
```bash
npm install cmdk@latest
```

**pnpm Advantage**: Package managers like pnpm, bun, and yarn handle peer dependency resolution gracefully with silent warnings rather than blocking errors.

**Installation with npm**: Run `npx shadcn@latest init -d` which prompts for `--force` or `--legacy-peer-deps` flag selection. The CLI remembers this choice for subsequent component additions.

---

## MCP Server Integration

### Overview

shadcn/ui provides an official Model Context Protocol (MCP) server that enables AI assistants to interact with component registries. This is a significant differentiator for AI-assisted development workflows.

### Capabilities

The MCP server allows AI assistants to:
- Browse all available components in configured registries
- Search for specific components by name or functionality
- Install components directly into projects via natural language
- Access component metadata, demos, and documentation

### Configuration

**For Claude Code** (`.mcp.json` or project config):
```json
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["-y", "shadcn-mcp-server"]
    }
  }
}
```

**For Cursor** (`.cursor/mcp.json`):
```json
{
  "shadcn": {
    "command": "npx",
    "args": ["-y", "shadcn-mcp-server"]
  }
}
```

### Usage Examples

Once configured, AI assistants can respond to prompts like:
- "Show me all available components in the shadcn registry"
- "Add the button, dialog and card components to my project"
- "What shadcn components are available for forms?"

### Technical Architecture

- Supports **SSE transport** for multi-client scenarios
- Can run in stdio mode (CLI) or SSE mode (HTTP-based)
- Docker Compose configurations available for containerized deployments
- Implements smart caching with GitHub API rate limit handling
- Communicates with registries defined in `components.json`

---

## Theming Architecture

### CSS Custom Properties Approach

shadcn/ui implements theming via CSS custom properties, exactly matching our research recommendations. The system uses a background/foreground convention:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  /* ... */
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  /* ... dark mode overrides */
}
```

### Tailwind v4 Migration

Tailwind v4 introduces the `@theme` directive with OKLCH color model:

```css
@theme inline {
  --color-background: oklch(100% 0 0);
  --color-foreground: oklch(14.9% 0.026 264.4);
  /* ... */
}
```

**Migration Steps**:
1. Follow official Tailwind v4 Upgrade Guide
2. Move `:root` and `.dark` selectors out of `@layer base`
3. Wrap color values in `hsl()` or `oklch()` functions
4. Add `inline` option to `@theme` directive

### Custom Theme Support

Beyond light/dark, custom themes are added as CSS variable blocks:

```css
[data-theme='ocean'] {
  --primary: 200 80% 50%;
  --primary-foreground: 200 10% 98%;
  /* ... */
}
```

Community tools like TweakCN and StyleGlide provide visual theme editors that generate importable CSS.

---

## Headless Pattern Compatibility

### Radix UI Foundation

shadcn/ui is built on Radix UI primitives, which are:
- **Unstyled**: Focus on behavior and accessibility, not visuals
- **Composable**: Granular access to each component part
- **Accessible**: WAI-ARIA compliant, full keyboard support, tested with assistive technologies

This separation of concerns aligns perfectly with our headless-first architecture.

### External State Management

Components accept external state through props, enabling integration with:
- Custom hooks (useBoardState, useFlowState)
- Zustand stores
- React Hook Form
- DI-injected services

### useControllableState Hook

Radix provides `@radix-ui/react-use-controllable-state` for components supporting both controlled and uncontrolled modes:

```typescript
import { useControllableState } from '@radix-ui/react-use-controllable-state';

function MyComponent({ value, defaultValue, onChange }) {
  const [state, setState] = useControllableState({
    prop: value,
    defaultProp: defaultValue,
    onChange,
  });

  return <div>{state}</div>;
}
```

### Integration Pattern for Headless Hooks

```typescript
// Headless hook - pure logic
function useBoardState(initialBoard: Board) {
  const [board, setBoard] = useState(initialBoard);
  const moveCard = useCallback((cardId, targetColumn, position) => {
    // Pure state transformation
  }, []);
  return { board, moveCard };
}

// UI component - consumes hook + shadcn components
function KanbanBoard({ initialBoard }) {
  const { board, moveCard } = useBoardState(initialBoard);

  return (
    <div className="flex gap-4">
      {board.columns.map(column => (
        <Card key={column.id}>
          <CardHeader>{column.title}</CardHeader>
          <CardContent>
            {/* Cards rendered with shadcn components */}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

---

## Ecosystem & Tooling

### CLI Commands

| Command | Purpose |
|---------|---------|
| `npx shadcn@latest init` | Initialize project with config and dependencies |
| `npx shadcn@latest add [component]` | Install component(s) to project |
| `npx shadcn@latest diff` | Compare local components with registry versions |
| `npx shadcn@latest view [component]` | Preview component before installing |
| `npx shadcn@latest search [query]` | Search available components |
| `npx shadcn@latest list` | List all available components |

### VS Code Extension

The official VS Code extension (`SuhelMakkad.shadcn-ui`) provides:
- Direct component installation from editor
- Component search and preview
- Workspace scanning for missing components

### Storybook Integration

Setup process:
1. Install Storybook: `npx storybook@latest init`
2. Import Tailwind styles in `.storybook/preview.ts`
3. Create story files for components

Best practices:
- Document all component states and props
- Use Controls and Actions addons for interactivity
- Integrate visual regression testing

### Monorepo Support

Native Turborepo integration with automatic workspace detection:

```
monorepo/
├── apps/
│   └── web/              # Application workspace
│       └── components.json
├── packages/
│   └── ui/               # Shared component workspace
│       └── components.json
└── turbo.json
```

The CLI handles:
- Automatic path resolution across workspaces
- Import alias management
- Shared component installation to `@workspace/ui`

---

## Integration with Project Libraries

### ReactFlow

The **ReactFlow UI** project provides shadcn-styled components:

```bash
# Add ReactFlow components via shadcn CLI
npx shadcn@latest add "https://reactflow.dev/registry/workflow-node"
```

**CSS Import Order** (critical):
```typescript
// app/layout.tsx
import '@xyflow/react/dist/style.css';  // ReactFlow first
import './globals.css';                   // shadcn/Tailwind second
```

### dnd-kit

Community implementations exist for accessible Kanban boards:
- `react-dnd-kit-tailwind-shadcn-ui` - Complete example
- `shadcn-drag-table` - Table with row reordering

Pattern:
- TanStack Table for data structure
- @dnd-kit for drag detection/animation
- shadcn/ui for visual presentation
- Custom hooks for business logic

### TSyringe DI

Compatible pattern:
```typescript
// Service layer (injectable)
@injectable()
class BoardService {
  constructor(private logger: ILogger) {}

  moveCard(cardId: string, targetColumn: string) {
    this.logger.info('Moving card', { cardId, targetColumn });
    // Business logic
  }
}

// Hook layer (resolves from container)
function useBoardState(container: DependencyContainer) {
  const boardService = container.resolve(BoardService);
  // Use service in hook logic
}

// Component layer (uses hook + shadcn)
function KanbanBoard() {
  const { board, moveCard } = useBoardState(container);
  return <Card>...</Card>;
}
```

---

## Known Pitfalls & Mitigations

### 1. cmdk Version After React 19

**Issue**: Combobox/command palette may show greyed-out, non-selectable options.

**Fix**:
```bash
npm install cmdk@latest
```

### 2. Controlled Select in Forms

**Issue**: `form.setValue()` or `form.reset()` triggers `onValueChange` with empty string.

**Fixes**:
- Filter empty strings in onChange handler
- Use key-based remounting strategy
- Wrap SelectItem inside SelectList

### 3. Component Update Management

**Issue**: Components are copied, not npm packages - no automatic updates.

**Mitigation**:
- Use `npx shadcn@latest diff` to see upstream changes
- Establish periodic review schedule (monthly/quarterly)
- Document local customizations to avoid losing them

### 4. Bundle Size

**Non-issue**: Actually an advantage. Only installed components are bundled. Tailwind tree-shaking removes unused styles.

---

## Installation Guide

### For New Next.js 15 Project

```bash
# Create project with shadcn
npx shadcn@latest create my-app

# Or add to existing project
npx shadcn@latest init
```

### For Existing Project (Our Case)

```bash
# 1. Initialize shadcn (will detect Next.js 15)
npx shadcn@latest init

# 2. Select options:
#    - Style: Default (or New York)
#    - Base color: Slate (or preference)
#    - CSS variables: Yes
#    - Tailwind config location: tailwind.config.ts
#    - Components location: @/components
#    - Utils location: @/lib/utils

# 3. Add components as needed
npx shadcn@latest add button card sidebar dialog

# 4. Install next-themes for dark mode
npm install next-themes
```

### Configuration File

`components.json` created by init:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

---

## Recommended Components for Dashboard

### Phase 1: Foundation
- `button` - Actions
- `card` - Content containers
- `input` - Form inputs
- `label` - Form labels
- `separator` - Visual dividers

### Phase 2: Layout
- `sidebar` - Navigation
- `sheet` - Mobile menu / panels
- `tabs` - View switching
- `scroll-area` - Custom scrollbars

### Phase 3: Data Display
- `table` - Data tables
- `badge` - Status indicators
- `avatar` - User representation
- `tooltip` - Contextual help

### Phase 4: Feedback
- `dialog` - Modals
- `alert` - Inline alerts
- `toast` (sonner) - Notifications
- `skeleton` - Loading states

### Phase 5: Forms (if needed)
- `select` - Dropdowns
- `checkbox` - Boolean inputs
- `switch` - Toggles
- `form` - React Hook Form wrapper

---

## References

- [shadcn/ui Documentation](https://ui.shadcn.com/docs)
- [shadcn/ui React 19 Guide](https://ui.shadcn.com/docs/react-19)
- [shadcn/ui MCP Documentation](https://ui.shadcn.com/docs/mcp)
- [shadcn/ui Theming](https://ui.shadcn.com/docs/theming)
- [shadcn/ui Monorepo Guide](https://ui.shadcn.com/docs/monorepo)
- [Radix UI Primitives](https://www.radix-ui.com/primitives)
- [ReactFlow UI Components](https://reactflow.dev/ui)
- [shadcn-admin Reference Implementation](https://github.com/satnaing/shadcn-admin)
- [dnd-kit + shadcn Kanban Example](https://github.com/Georgegriff/react-dnd-kit-tailwind-shadcn-ui)

---

*Research Complete: 2026-01-22*
