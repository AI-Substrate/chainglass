# Workshop: Web UI TDD & Headless Development Approach

**Type**: Integration Pattern
**Plan**: 014-workspaces
**Spec**: [../workspaces-spec.md](../workspaces-spec.md)
**Created**: 2026-01-27
**Status**: Approved

**Related Documents**:
- [manual-testing-cli-workspaces.md](./manual-testing-cli-workspaces.md) - CLI manual testing (Phase 5)
- [CLAUDE.md](../../../../CLAUDE.md) - Next.js MCP documentation

---

## Purpose

Establish the TDD and headless development approach for Phase 6 (Web UI). This workshop clarifies how we verify web components work without manual browser testing, leveraging the Next.js MCP server for rich iteration and debugging.

## Key Questions Addressed

- How do we verify web pages work without clicking around in a browser?
- What tools does the Next.js MCP server provide for headless verification?
- What's the TDD cycle for API routes and React components?
- How do we capture visual output for review without manual inspection?

---

## Overview

Phase 6 builds 15 tasks: 4 API routes, 3 navigation components, 4 pages, and 4 form components. **We do NOT manually test in a browser during development.** Instead:

1. **TDD with Vitest** - Write tests first, implement to pass
2. **Next.js MCP Server** - Rich runtime feedback during dev
3. **Browser Automation (Playwright)** - Headless screenshots for visual verification
4. **Type checking** - TypeScript catches structural issues

---

## Next.js MCP Server Capabilities

The Next.js dev server exposes an MCP endpoint at `/_next/mcp` that provides powerful introspection:

### Available MCP Tools

| Tool | Purpose | Use Case |
|------|---------|----------|
| `get_routes` | List all application routes | Verify new pages are registered |
| `get_errors` | Get compilation/runtime errors | Catch build issues immediately |
| `get_page_metadata` | Page component info | Verify server vs client components |
| `get_project_metadata` | Project configuration | Check Next.js settings |

### Iteration Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Start dev server: pnpm dev                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Use MCP tools to check status                                │
│                                                                 │
│   nextjs_index                 → List available tools           │
│   nextjs_call get_errors       → Check for build errors         │
│   nextjs_call get_routes       → Verify routes exist            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Make code changes (Fast Refresh applies)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Re-check errors via MCP                                      │
│                                                                 │
│   nextjs_call get_errors       → Zero errors = success          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. (Optional) Screenshot for visual review                      │
│                                                                 │
│   browser_eval action="navigate" url="/workspaces"              │
│   browser_eval action="screenshot"                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Error Detection Without Browser

```bash
# Check if routes exist
nextjs_call port=3000 toolName="get_routes"

# Check compilation errors
nextjs_call port=3000 toolName="get_errors"

# Check console messages (browser automation)
browser_eval action="navigate" url="http://localhost:3000/workspaces"
browser_eval action="console_messages"
```

---

## TDD Approach by Component Type

### API Routes (T001-T004)

**Test First Pattern:**

```typescript
// test/integration/web/api/workspaces.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/workspaces/route';
import { FakeWorkspaceRegistryAdapter } from '@chainglass/workflow/fakes';

describe('GET /api/workspaces', () => {
  let fakeAdapter: FakeWorkspaceRegistryAdapter;
  
  beforeEach(() => {
    fakeAdapter = new FakeWorkspaceRegistryAdapter();
  });
  
  it('returns empty list when no workspaces', async () => {
    // Setup: configure test container to use fakeAdapter
    const response = await GET();
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.workspaces).toEqual([]);
  });
  
  it('returns workspace list', async () => {
    // Setup: seed adapter
    await fakeAdapter.save({ slug: 'test', name: 'Test', path: '/test', createdAt: new Date() });
    
    const response = await GET();
    const data = await response.json();
    
    expect(data.workspaces).toHaveLength(1);
    expect(data.workspaces[0].slug).toBe('test');
  });
});

describe('POST /api/workspaces', () => {
  it('creates workspace and returns 201', async () => {
    const request = new Request('http://localhost/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'My Project', path: '/home/user/my-project' }),
      headers: { 'Content-Type': 'application/json' }
    });
    
    const response = await POST(request);
    
    expect(response.status).toBe(201);
  });
  
  it('validates request body with Zod', async () => {
    const request = new Request('http://localhost/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: '', path: '' }),  // Invalid
      headers: { 'Content-Type': 'application/json' }
    });
    
    const response = await POST(request);
    
    expect(response.status).toBe(400);
  });
});
```

**Verification via MCP:**

```bash
# After implementing, verify route works
nextjs_call port=3000 toolName="get_routes"
# Should show /api/workspaces in list

# Test via curl
curl http://localhost:3000/api/workspaces
curl -X POST http://localhost:3000/api/workspaces \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "path": "/tmp/test"}'
```

---

### Server Components (Pages, Navigation)

**Test First Pattern:**

```typescript
// test/integration/web/pages/workspaces.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WorkspacesPage from '@/app/(dashboard)/workspaces/page';

describe('WorkspacesPage', () => {
  it('renders workspace list heading', async () => {
    // Server components need async rendering
    const page = await WorkspacesPage({});
    render(page);
    
    expect(screen.getByRole('heading', { name: /workspaces/i })).toBeDefined();
  });
  
  it('shows empty state when no workspaces', async () => {
    const page = await WorkspacesPage({});
    render(page);
    
    expect(screen.getByText(/no workspaces/i)).toBeDefined();
  });
});
```

**Verification via Browser Automation:**

```bash
# Navigate and screenshot
browser_eval action="start"
browser_eval action="navigate" url="http://localhost:3000/workspaces"
browser_eval action="screenshot" fullPage=true

# Save screenshot to file for review
# Screenshot is returned as base64 - can be saved to session files
```

---

### Client Components (Forms)

**Test First Pattern:**

```typescript
// test/integration/web/components/workspace-add-form.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceAddForm } from '@/components/workspaces/workspace-add-form';

describe('WorkspaceAddForm', () => {
  it('renders name and path fields', () => {
    render(<WorkspaceAddForm />);
    
    expect(screen.getByLabelText(/name/i)).toBeDefined();
    expect(screen.getByLabelText(/path/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /add/i })).toBeDefined();
  });
  
  it('submits form data', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => ({}) });
    global.fetch = mockFetch;
    
    render(<WorkspaceAddForm />);
    
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText(/path/i), { target: { value: '/test' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    
    expect(mockFetch).toHaveBeenCalledWith('/api/workspaces', expect.any(Object));
  });
});
```

---

## Visual Verification via Screenshots

When visual review is needed, use browser automation to capture screenshots:

```typescript
// Capture screenshot and save to session files
browser_eval action="start"
browser_eval action="navigate" url="http://localhost:3000/workspaces"
browser_eval action="screenshot" fullPage=true
// Returns base64 image data

// View screenshot directly with view tool
// Save to session files for persistence
```

**Screenshot Checkpoints:**

| Checkpoint | URL | What to Verify |
|------------|-----|----------------|
| Workspace List | /workspaces | Table renders, add form visible |
| Workspace Detail | /workspaces/[slug] | Info displays, worktree list shows |
| Sample List | /workspaces/[slug]/samples | Samples for worktree shown |
| Sidebar Nav | Any dashboard page | Workspaces section expandable |

---

## Test Infrastructure Setup

### Required Test Utilities

```typescript
// test/fixtures/web-test-container.ts
import { Container } from 'inversify';
import { FakeWorkspaceRegistryAdapter } from '@chainglass/workflow/fakes';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';

export function createWebTestContainer(): Container {
  const container = new Container();
  
  // Register fakes
  container.bind(WORKSPACE_DI_TOKENS.WorkspaceRegistryAdapter)
    .to(FakeWorkspaceRegistryAdapter);
  
  // ... register services
  
  return container;
}
```

### Mocking Fetch for Client Components

```typescript
// test/setup.ts
import { vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  // Reset fetch mock
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

---

## When to Use Each Verification Method

| Verification Need | Method | Tool |
|------------------|--------|------|
| Route exists | MCP | `get_routes` |
| No compilation errors | MCP | `get_errors` |
| API returns correct data | Vitest | Integration test |
| Component renders | Vitest | @testing-library/react |
| Visual appearance | Browser | `browser_eval screenshot` |
| Console errors | Browser | `browser_eval console_messages` |
| Full user flow | Browser | Navigate + interact + verify |

---

## Phase 6 TDD Workflow

For each task:

1. **Write failing test(s)** - Cover happy path and error cases
2. **Implement minimum code** - Make tests pass
3. **Check MCP for errors** - `nextjs_call get_errors`
4. **Run test suite** - `just test`
5. **(Optional) Screenshot** - If visual verification needed
6. **Mark task complete** - Update tasks.md

---

## Quick Reference

```bash
# Start dev server
pnpm dev

# MCP commands (from Claude)
nextjs_index                           # List MCP tools
nextjs_call port=3000 toolName="get_errors"    # Check errors
nextjs_call port=3000 toolName="get_routes"    # List routes

# Browser automation (from Claude)
browser_eval action="start"
browser_eval action="navigate" url="http://localhost:3000/workspaces"
browser_eval action="screenshot"
browser_eval action="console_messages"
browser_eval action="close"

# Test commands
just test                              # Run all tests
pnpm test --filter @chainglass/web     # Web tests only
just typecheck                         # Type check
just check                             # Full quality check
```

---

## Open Questions

### Q1: Should we mock fetch or use MSW (Mock Service Worker)?

**OPEN**: Options being considered:
- Option A: Direct vi.fn() mock of fetch (simpler, current approach)
- Option B: MSW for network-level mocking (more realistic, more setup)

**Recommendation**: Start with vi.fn() for simplicity; MSW if needed for complex flows.

### Q2: How much visual verification is needed?

**RESOLVED**: Screenshots are **optional** verification. Primary verification is through:
1. Tests pass
2. MCP shows no errors
3. Type check passes

Screenshots used only when visual review is specifically needed or requested.

---

## Status

- [x] Workshop document created
- [ ] Review with user
- [ ] Mark as Approved
