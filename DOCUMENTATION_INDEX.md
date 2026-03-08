# Question Popper Overlay UI — Documentation Index

## 📚 Complete Documentation Set

I've created comprehensive documentation for building the Question Popper overlay UI. Choose your reading path based on your role:

---

## 🎯 Quick Start Paths

### For Developers (Start Here)
1. **Read first:** `UI_PATTERNS_SUMMARY.md` (10 min read)
   - Architecture diagram
   - State flow visualization
   - Key decisions explained
   
2. **Copy-paste code:** `QUESTION_POPPER_QUICK_REFERENCE.md` (reference during implementation)
   - Ready-to-use hook templates
   - Component scaffolding
   - Testing patterns

3. **Step-by-step:** `IMPLEMENTATION_ROADMAP.md` (planning & execution)
   - 5 phases with daily estimates
   - File checklist
   - Testing scenarios

4. **Deep dive:** `QUESTION_POPPER_UI_RESEARCH.md` (detailed patterns & rationale)
   - Why each pattern exists
   - Alternative patterns
   - Architecture decisions

---

## 📖 Document Descriptions

### 1. **UI_PATTERNS_SUMMARY.md** (12 KB, 362 lines)
**Best for:** Quick understanding + visual learners

**Contains:**
- Architecture diagram (provider tree)
- State flow diagram (backend to frontend)
- Component structure breakdown
- Integration checklist
- Common mistakes to avoid
- Debug checklist
- Performance notes

**Read this if:** You want the big picture in 15 minutes

---

### 2. **QUESTION_POPPER_QUICK_REFERENCE.md** (15 KB, 514 lines)
**Best for:** Implementation + copy-paste

**Contains:**
- Overlay provider hook template
- SSE subscription hook template
- Toast notification hook template
- Overlay wrapper component
- Panel component skeleton
- Toast integration example
- Key constants & types
- Testing patterns
- Common gotchas
- File locations quick reference

**Read this if:** You're ready to start coding

---

### 3. **QUESTION_POPPER_UI_RESEARCH.md** (15 KB, 499 lines)
**Best for:** Deep understanding + design rationale

**Sections:**
1. Activity Log overlay pattern (implementation details)
2. Agent overlay pattern (comparison)
3. SSE subscription hooks (base + workspace-scoped)
4. useGlobalState pattern (reactive state)
5. Toast notifications (sonner integration)
6. Desktop notifications (not implemented, framework ready)
7. Dashboard shell & workspace layout (mount points)
8. Overlay mutual exclusion (event coordination)
9. Markdown rendering (existing component reuse)
10. DI container SSE/State access (service integration)

**Read this if:** You want to understand the WHY behind patterns

---

### 4. **IMPLEMENTATION_ROADMAP.md** (12 KB, 442 lines)
**Best for:** Project planning + milestone tracking

**Contains:**
- 5 implementation phases (5 days total)
- Step-by-step instructions for each phase
- Acceptance criteria for each step
- File checklist with phase numbers
- API endpoints needed
- Testing scenarios (5 detailed flows)
- Success criteria (14 checkpoints)
- Rollback plan
- Timeline table

**Read this if:** You're planning the implementation timeline

---

## 🔗 Cross-Reference Guide

### By Topic

#### Overlay Pattern
- Research: Section 1 (Activity Log), Section 2 (Agent)
- Reference: Section 1 (templates)
- Roadmap: Phase 1.1, Phase 2.3

#### SSE Subscription
- Research: Section 3 (base + workspace hooks)
- Reference: Section 2 (templates)
- Roadmap: Phase 1.3, Phase 3.3

#### Toast Notifications
- Research: Section 5
- Reference: Section 4
- Roadmap: Phase 2.1

#### Component Structure
- Research: Section 10 (DI container)
- Reference: Section 5 (panel skeleton)
- Roadmap: Phase 2.2

#### Markdown Rendering
- Research: Section 9 (existing component)
- Reference: (use existing MarkdownViewer)
- Roadmap: Phase 5.1 (optional)

#### Mutual Exclusion
- Research: Section 8 (event pattern)
- Reference: Section 1 (code pattern)
- Roadmap: Phase 1.1 (guard ref)

#### State Management
- Research: Section 4 (useGlobalState)
- Reference: Section 1 (context pattern)
- Roadmap: Phase 1.1 (provider state)

---

## 🗂️ File Structure Reference

### Existing Files to Review

```
Core Patterns:
├── Activity Log Overlay
│   └── src/features/065-activity-log/hooks/use-activity-log-overlay.tsx ⭐
├── Agent Overlay
│   └── src/hooks/use-agent-overlay.tsx ⭐
├── Terminal Overlay
│   └── src/features/064-terminal/hooks/use-terminal-overlay.tsx ⭐

SSE Integration:
├── useWorkspaceSSE
│   └── src/hooks/useWorkspaceSSE.ts ⭐
├── useSSE
│   └── src/hooks/useSSE.ts
├── Workflow SSE Example
│   └── src/features/050-workflow-page/hooks/use-workflow-sse.ts

UI Components:
├── Markdown Viewer
│   └── src/components/viewers/markdown-viewer.tsx ⭐
├── Agent Overlay Panel
│   └── src/components/agents/agent-overlay-panel.tsx ⭐
├── Toast Provider
│   └── src/components/ui/toaster.tsx ⭐

Service & Infrastructure:
├── Question Popper Service
│   └── src/features/067-question-popper/lib/question-popper.service.ts ⭐
├── DI Container
│   └── src/lib/di-container.ts (lines 596-625) ⭐
├── Central Event Notifier
│   └── src/features/027-central-notify-events/central-event-notifier.service.ts

Layout & Shell:
├── Workspace Layout
│   └── app/(dashboard)/workspaces/[slug]/layout.tsx ⭐
├── Dashboard Shell
│   └── src/components/dashboard-shell.tsx
├── Activity Log Wrapper
│   └── app/(dashboard)/workspaces/[slug]/activity-log-overlay-wrapper.tsx ⭐
├── Terminal Wrapper
│   └── app/(dashboard)/workspaces/[slug]/terminal-overlay-wrapper.tsx ⭐

⭐ = Most important for understanding the pattern
```

### New Files to Create

```
Question Popper Feature:
src/features/067-question-popper/
├── hooks/
│   ├── use-question-popper-overlay.tsx      (Phase 1.1)
│   ├── use-question-popper-sse.ts           (Phase 1.3)
│   ├── use-question-popper-toasts.tsx       (Phase 2.1)
│   └── use-question-popper-submit.ts        (Phase 3.1)
├── components/
│   ├── question-popper-overlay-panel.tsx    (Phase 2.2)
│   └── question-option-buttons.tsx          (Phase 2.2)
├── types.ts                                 (Phase 1.2)
└── index.ts                                 (exports)

Layout Integration:
app/(dashboard)/workspaces/[slug]/
└── question-popper-overlay-wrapper.tsx      (Phase 2.3)

Modified Files:
├── app/(dashboard)/workspaces/[slug]/layout.tsx (add wrapper)
└── src/lib/di-container.ts (already done - service registered)
```

---

## ✅ Pre-Implementation Checklist

Before you start coding, verify:

- [ ] Read `UI_PATTERNS_SUMMARY.md` (understand architecture)
- [ ] Review Activity Log overlay code (`src/features/065-activity-log/...`)
- [ ] Review Agent overlay code (`src/hooks/use-agent-overlay.tsx`)
- [ ] Review useWorkspaceSSE hook (`src/hooks/useWorkspaceSSE.ts`)
- [ ] Verify Question Popper service registered (check DI container)
- [ ] Understand overlay:close-all event pattern
- [ ] Know the 5 phases in `IMPLEMENTATION_ROADMAP.md`
- [ ] Have API endpoints designed (3 endpoints needed)
- [ ] Have design mockups for panel UI

---

## 🎓 Learning Paths by Role

### Product Manager / Designer
1. Read: `UI_PATTERNS_SUMMARY.md` (architecture overview)
2. Review: Existing overlays (Terminal, Activity Log, Agent)
3. Review: Phase 2.2 (panel UI design)
4. Provide feedback on: mockups, interaction patterns, timeout behavior

### Backend Developer
1. Read: Section 3 (SSE subscription hooks)
2. Review: QuestionPopperService implementation
3. Implement: 3 API endpoints (GET question, POST answer, GET events/sse)
4. Test: SSE broadcasts correct event types to EventPopper channel

### Frontend Developer (You!)
1. Read: All 4 documents in this order
2. Start: `IMPLEMENTATION_ROADMAP.md` Phase 1.1
3. Reference: `QUESTION_POPPER_QUICK_REFERENCE.md` for copy-paste code
4. Check: Success criteria before marking phase complete

### QA / Tester
1. Read: `UI_PATTERNS_SUMMARY.md` (test scenarios)
2. Review: `IMPLEMENTATION_ROADMAP.md` Phase 4 (testing section)
3. Test: 5 scenarios + edge cases
4. Verify: Success criteria checklist

---

## 🐛 Troubleshooting Guide

### Documentation Questions
- **"Where should I put X?"** → Check `IMPLEMENTATION_ROADMAP.md` file checklist
- **"How do I implement X?"** → Check `QUESTION_POPPER_QUICK_REFERENCE.md` section
- **"Why do we use X pattern?"** → Check `QUESTION_POPPER_UI_RESEARCH.md` section
- **"What's the overall structure?"** → Check `UI_PATTERNS_SUMMARY.md` diagrams

### Code Questions
- **"How does overlay closing work?"** → Research Section 8, Quick Reference Section 1
- **"How do I subscribe to SSE?"** → Research Section 3, Quick Reference Section 2
- **"Where do I show toasts?"** → Research Section 5, Quick Reference Section 4
- **"How do I render content?"** → Research Section 9, Quick Reference Section 5

### Implementation Questions
- **"What's the timeline?"** → Roadmap page 2 (timeline table)
- **"What are success criteria?"** → Roadmap page 6 (Success Criteria section)
- **"What API endpoints are needed?"** → Roadmap page 5 (API Endpoints section)
- **"How do I test this?"** → Roadmap page 5 (Testing Scenarios section)

---

## 📞 Getting Help

### When Stuck
1. Check this index for relevant document sections
2. Grep codebase for similar pattern in Activity Log overlay
3. Review commented code examples in Quick Reference
4. Check "Common Mistakes to Avoid" in Summary
5. Check "Debug Checklist" in Summary

### Before Opening Issue
- [ ] Searched all 4 documentation files
- [ ] Reviewed existing overlay implementations
- [ ] Checked DI container registration
- [ ] Verified API endpoints exist
- [ ] Ran through debug checklist

---

## 📊 Documentation Statistics

| Document | Length | Focus | Read Time |
|----------|--------|-------|-----------|
| UI Patterns Summary | 362 lines | Visual + Quick | 15 min |
| Quick Reference | 514 lines | Code + Copy-Paste | Reference |
| UI Research | 499 lines | Deep Dive + Why | 30 min |
| Roadmap | 442 lines | Planning + Steps | 20 min |
| **Total** | **1,817 lines** | **Complete** | **1-2 hours** |

---

## 🚀 Ready to Start?

**For first-time readers:** Start with `UI_PATTERNS_SUMMARY.md` (15 min)

**For implementation:** Go to `IMPLEMENTATION_ROADMAP.md` Phase 1.1 and follow step-by-step

**For reference while coding:** Keep `QUESTION_POPPER_QUICK_REFERENCE.md` open

**For deep understanding:** Read `QUESTION_POPPER_UI_RESEARCH.md` in sections as needed

---

## 📝 Feedback Loop

After implementation, consider updating docs:
- [ ] Add actual screenshots to UI_PATTERNS_SUMMARY.md
- [ ] Update timeline if phases took different time
- [ ] Add lessons learned section
- [ ] Document any deviations from patterns
- [ ] Add performance metrics after launch

---

**Last Updated:** March 7, 2025
**Status:** Complete & Ready for Implementation 🎉

Good luck! If you have questions, check the cross-reference guide above.
