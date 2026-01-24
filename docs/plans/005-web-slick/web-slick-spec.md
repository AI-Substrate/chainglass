# Web Slick: Professional Dashboard Experience

**Specification Version**: 1.2.0
**Created**: 2026-01-22
**Status**: Clarified
**Branch**: 005-web-slick
**Mode**: Full

---

## 1. Summary

Transform the Chainglass web application from a placeholder into a professional engineering dashboard that demonstrates workflow visualization, task management, and real-time backend updates. The dashboard should look modern and polished ("pops") while maintaining the project's headless-first architecture for testability and future CLI reuse.

---

## 2. Goals

### Primary Goals

1. **Professional Visual Identity**: Create a dashboard that looks polished and modern, suitable for engineering teams. Support light and dark themes with the ability to add custom themes.

2. **Workflow Visualization Demo**: Demonstrate interactive workflow visualization where users can see workflow phases, agent connections, and execution state.

3. **Task Management Demo**: Provide a Kanban-style board for managing tasks with drag-and-drop functionality, demonstrating real-time state management patterns.

4. **Real-Time Updates**: Implement server-push capability for backend state changes without polling, enabling live dashboard updates when workflow status changes.

5. **Headless-First Architecture**: All business logic must be separable from UI rendering to enable:
   - Full unit testing without DOM rendering
   - Potential CLI command reuse of the same logic
   - MCP tool integration possibilities

### Secondary Goals

- Establish component patterns for future Chainglass development
- Create reusable theming infrastructure
- Document UX patterns appropriate for engineering tools

---

## 3. Non-Goals

The following are explicitly **not** in scope for this feature:

1. **Production workflow execution**: This is a UI demonstration, not production workflow orchestration
2. **Persistent data storage**: Demo pages use in-memory state, not database persistence
3. **User authentication/authorization**: No login or access control
4. **Mobile-first responsive design**: Desktop-focused (mobile is secondary)
5. **Storybook or component documentation site**: May be added later
6. **External API integrations**: No connections to external services

---

## 4. Complexity Assessment

Using the project's Complexity Scoring system (CS 1-5):

| Factor | Score | Rationale |
|--------|-------|-----------|
| **S** - Surface Area | 2 | Multiple new pages, components, hooks, styles |
| **I** - Integration Breadth | 2 | New dependencies (ReactFlow, dnd-kit, Zustand, next-themes) |
| **D** - Data & State | 1 | In-memory state only, no schema changes |
| **N** - Novelty & Ambiguity | 1 | Research completed, patterns well-defined |
| **F** - Non-Functional | 1 | Standard web performance, accessibility basics |
| **T** - Testing & Rollout | 2 | Headless hooks need comprehensive tests |

**Total**: 9 points → **CS-3 (Medium)**

**Label**: Medium complexity - Multiple modules, new dependencies, integration tests required.

---

## 5. User Value Proposition

### Who Benefits

1. **Chainglass Users**: Get a professional interface to visualize and manage AI agent workflows
2. **Chainglass Developers**: Have reference implementations for building additional dashboard features
3. **Potential Adopters**: See a polished product that inspires confidence

### What Problem This Solves

Currently, Chainglass provides CLI and MCP interfaces but no visual interface for humans. Humans need:
- Visual overview of workflow state (which phases completed, which are running)
- Drag-and-drop task management for planning work
- Real-time feedback without manual refresh
- Professional aesthetics that match modern engineering tools

### Why Now

The core infrastructure (DI, configuration, testing patterns) is complete. The web app is a placeholder waiting for implementation. This feature demonstrates the full stack working together.

---

## 6. Acceptance Criteria

### Theme System

- [ ] **AC-1**: Application supports light and dark themes toggled via UI control
- [ ] **AC-2**: Theme preference persists across sessions (localStorage)
- [ ] **AC-3**: No flash of unstyled content (FOUC) on page load
- [ ] **AC-4**: System preference (prefers-color-scheme) is respected as default
- [ ] **AC-5**: Color contrast meets WCAG 2.1 Level AA (4.5:1 for text)

### Dashboard Layout

- [ ] **AC-6**: Dashboard has sidebar navigation for switching between views
- [ ] **AC-7**: Layout uses consistent spacing and typography
- [ ] **AC-8**: Status colors follow engineering tool conventions (red=critical, green=success, etc.)

### ReactFlow Demo Page

- [ ] **AC-9**: Page displays an interactive workflow graph
- [ ] **AC-10**: Users can pan and zoom the graph
- [ ] **AC-11**: Clicking a node shows its details
- [ ] **AC-12**: Different node types (workflow, phase, agent) are visually distinct

### Kanban Demo Page

- [ ] **AC-13**: Page displays a multi-column Kanban board
- [ ] **AC-14**: Cards can be dragged between columns
- [ ] **AC-15**: Card order within columns can be rearranged via drag
- [ ] **AC-16**: Keyboard navigation is supported for accessibility
- [ ] **AC-17**: Board state changes trigger real-time UI updates

### Server-Sent Events

- [ ] **AC-18**: SSE endpoint exists for real-time updates
- [ ] **AC-19**: Client automatically reconnects on connection drop
- [ ] **AC-20**: Multiple clients can receive broadcasts
- [ ] **AC-21**: Events are typed with Zod schemas

### Headless Architecture

- [ ] **AC-22**: Kanban board logic is testable without DOM rendering
- [ ] **AC-23**: ReactFlow state logic is testable without DOM rendering
- [ ] **AC-24**: All headless hooks have corresponding unit tests
- [ ] **AC-25**: UI components consume headless hooks (separation of concerns)

### Quality Gates

- [ ] **AC-26**: All tests pass (`just test`)
- [ ] **AC-27**: Type check passes (`just typecheck`)
- [ ] **AC-28**: Lint passes (`just lint`)
- [ ] **AC-29**: Build succeeds (`just build`)

---

## 7. Risks & Assumptions

### Assumptions

1. **Next.js 15 SSE support**: Assumes App Router route handlers support streaming responses (confirmed in research)
2. **ReactFlow React 19 compatibility**: Assumes ReactFlow v12+ works with React 19 (needs verification at implementation time)
3. **dnd-kit React 19 compatibility**: Assumes dnd-kit v6+ works with React 19 (needs verification at implementation time)
4. **CSS Custom Properties performance**: Assumes CSS variable changes don't cause excessive repaints

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| React 19 compatibility issues with dependencies | Medium | High | Test early in Phase 1; have fallback versions identified |
| SSE connection limits in development | Low | Medium | Document expected behavior; use heartbeats |
| Theme FOUC despite prevention | Low | Low | Test on slow connections; add visible loading state if needed |

---

## 8. Open Questions

### Resolved Questions

1. **Q: Which drag-drop library?** → A: dnd-kit (fine-grained control, performance, smaller bundle)
2. **Q: SSE vs WebSockets?** → A: SSE (simpler, HTTP-based, fits server-to-client model)
3. **Q: State management?** → A: Zustand (minimal boilerplate, hooks-based, ~1KB)
4. **Q: Theming approach?** → A: CSS Custom Properties + next-themes
5. **Q: Should we adopt shadcn/ui for base components?** → A: **YES**
   - MCP server enables AI-assisted component installation
   - CSS custom properties theming matches our architecture
   - Radix UI primitives provide accessibility out of the box
   - Compatible with ReactFlow, dnd-kit, and TSyringe DI patterns
   - Native monorepo/Turborepo support
   - **Research**: See `shadcn-ui-research.md` for full dossier

### Out of Scope Questions (future consideration)

1. **Q: How will SSE scale in production?**
   - Current scope is demo/development
   - Production may need Redis Pub/Sub for multi-instance
   - **Research available**: See research-dossier.md Research Opportunity 2

---

## 9. ADR Seeds

The following Architectural Decision Records should be created during planning:

### ADR-002: Theme System Architecture
- **Decision**: CSS Custom Properties with next-themes
- **Context**: Need theme switching without FOUC, multiple themes, accessibility
- **Alternatives**: Styled-components theming, Tailwind dark class, CSS-in-JS

### ADR-003: Headless Component Pattern
- **Decision**: Separate hooks for logic, components for rendering
- **Context**: TDD requirements, potential CLI reuse, clean architecture alignment
- **Alternatives**: All-in-one components, render props, HOCs

### ADR-004: Real-Time Update Architecture
- **Decision**: Server-Sent Events over WebSockets
- **Context**: Server-to-client updates for dashboard, simplicity, HTTP compatibility
- **Alternatives**: WebSockets, polling, GraphQL subscriptions

---

## 10. Research Context

This specification is informed by comprehensive research documented in:

**Primary Research**: `docs/plans/005-web-slick/research-dossier.md`

### Key Findings Applied

1. **Headless-first architecture** aligns with existing clean architecture patterns
2. **CSS Custom Properties** provide performant theming without React re-renders
3. **dnd-kit** offers fine-grained control needed for Kanban implementation
4. **SSE** fits the server-to-client update pattern better than WebSockets for dashboards

### Unresolved External Research

Two research opportunities were identified but not completed:

1. **Shadcn/ui Integration** - Could accelerate UI development
2. **Production SSE Scaling** - Critical for future production deployment

These are documented in the research dossier with ready-to-use `/deepresearch` prompts.

---

## 11. Testing Strategy

**Approach**: Full TDD
**Rationale**: Aligns with project constitution (Principle 3: TDD). Headless-first architecture demands comprehensive test coverage to ensure logic portability.

### Focus Areas
- **High Priority**: Headless hooks (useBoardState, useFlowState, useSSE) - core business logic
- **High Priority**: SSE connection manager - real-time infrastructure
- **Medium Priority**: Theme switching logic - user preference handling
- **Standard**: UI components consuming headless hooks

### Excluded from Extensive Testing
- Third-party library internals (ReactFlow, dnd-kit behavior)
- CSS styling (visual regression testing not in scope)

### Mock Usage Policy
**Policy**: Targeted mocks (fakes preferred)
**Rationale**: Follow constitution's fakes-over-mocks principle. Mocks permitted sparingly for web/browser APIs (e.g., EventSource, localStorage) where full fakes are impractical.

**Allowed**:
- Browser API mocks (EventSource, localStorage, matchMedia)
- Timer mocks for SSE heartbeat testing

**Prohibited**:
- vi.mock() for application modules
- Mocking internal services/adapters (use fakes)

### Test Documentation
All tests must include Test Doc comment block per constitution Section 3.2.

---

## 12. Documentation Strategy

**Location**: Hybrid (README.md + docs/how/)
**Rationale**: Feature serves as reference implementation; needs both quick-start and detailed pattern documentation.

### Content Split

| Location | Content |
|----------|---------|
| README.md | Quick-start: dev setup, theme toggle usage, running demos |
| docs/how/theming.md | Theme system architecture, adding custom themes |
| docs/how/headless-components.md | Headless hook pattern, creating new components |
| docs/how/sse-integration.md | SSE endpoint creation, client hook usage |

### Target Audience
- **README**: New developers wanting to run the app
- **docs/how/**: Developers extending the dashboard

### Maintenance
Update docs when adding new patterns or changing architecture. Review during PR for affected guides.

---

## 13. Demo Data Approach

**Strategy**: Hardcoded fixtures
**Rationale**: Simplest approach for demo pages. Predictable data aids testing and demonstrations.

### Implementation
- Static TypeScript files with sample workflows and tasks
- Located in `apps/web/src/data/fixtures/`
- Typed with Zod schemas for validation
- Easily swappable for future data sources

---

## 14. Dependencies

### On Other Chainglass Components

- `@chainglass/shared`: Interfaces, fakes for testing
- DI container patterns from `apps/web/src/lib/di-container.ts`
- Configuration system from Phase 4

### New External Dependencies

- `shadcn/ui` - Component foundation (copy-paste model, not npm package)
  - Radix UI primitives (accessibility)
  - Tailwind CSS integration
  - MCP server for AI-assisted development
- `reactflow` - Workflow visualization
- `@dnd-kit/core` + `@dnd-kit/sortable` - Drag and drop
- `next-themes` - Theme switching with SSR support (included with shadcn)
- `zustand` - State management
- `tailwindcss` - Utility-first CSS

---

## 15. Success Metrics

### Qualitative

- Dashboard "looks professional" - subjective review by stakeholders
- Components are "easy to understand and extend" - developer feedback
- Tests "provide confidence in headless logic" - code review

### Quantitative

- Test coverage for headless hooks: >80%
- Lighthouse accessibility score: >90
- No FOUC observed on page load (manual verification)
- Build size increase: <200KB gzipped for new features

---

## Clarifications

### Session 2026-01-22

| # | Question | Answer | Sections Updated |
|---|----------|--------|------------------|
| Q1 | Workflow Mode | **Full** - CS-3 complexity warrants multi-phase plan with all gates | Header |
| Q2 | Testing Strategy | **Full TDD** - Aligns with constitution, headless-first needs comprehensive coverage | §11 Testing Strategy |
| Q3 | Mock Usage | **Targeted** - Fakes preferred, mocks OK for browser APIs when clearly better | §11 Testing Strategy |
| Q4 | Documentation | **Hybrid** - README for quick-start, docs/how/ for detailed patterns | §12 Documentation Strategy |
| Q5 | Shadcn/ui | **YES, ADOPT** - MCP server, CSS variables, Radix accessibility, full ecosystem | §8 Open Questions, §14 Dependencies |
| Q6 | Demo Data | **Hardcoded fixtures** - Static TS files, predictable for demos | §13 Demo Data Approach |

### External Research Completed

| Research | File | Key Findings |
|----------|------|--------------|
| shadcn/ui Integration | `shadcn-ui-research.md` | MCP server, React 19 compatible, CSS variables theming, Radix primitives |

---

*Specification Version 1.2.0 - Updated 2026-01-22 (shadcn/ui decision resolved)*
