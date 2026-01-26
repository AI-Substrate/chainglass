/**
 * Agents Page Tests
 *
 * Integration tests for the standalone /agents page.
 * Implements Full TDD for Phase 2: Core Chat.
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat)
 */

import { AgentSessionStore } from '@/lib/stores/agent-session.store';
import { FakeLocalStorage } from '@test/fakes/fake-local-storage';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
// Use relative import since @/ maps to src/, not app/
import AgentsPage from '../../../../../apps/web/app/(dashboard)/agents/page';

// ============ T017: /agents Page Tests ============

describe('AgentsPage', () => {
  let fakeStorage: FakeLocalStorage;
  let store: AgentSessionStore;

  beforeEach(() => {
    fakeStorage = new FakeLocalStorage();
    store = new AgentSessionStore(fakeStorage);
  });

  describe('page rendering', () => {
    it('should render the page title', () => {
      /*
      Test Doc:
      - Why: Users need to know they're on the agents page
      - Contract: Page has "Agents" title/heading
      - Usage Notes: Main page heading
      - Quality Contribution: Basic page structure
      - Worked Example: page renders → "Agents" heading visible
      */
      render(<AgentsPage />);

      expect(screen.getByRole('heading', { name: /agents/i })).toBeInTheDocument();
    });

    it('should render agent creation form', () => {
      /*
      Test Doc:
      - Why: Users need to create new sessions
      - Contract: AgentCreationForm is present
      - Usage Notes: In sidebar or prominent location
      - Quality Contribution: Creation workflow
      - Worked Example: page renders → form visible
      */
      render(<AgentsPage />);

      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
    });

    it('should show empty state when no sessions', () => {
      /*
      Test Doc:
      - Why: New users see helpful empty state
      - Contract: Shows "no sessions" message when store is empty
      - Usage Notes: Encourages first session creation
      - Quality Contribution: New user experience
      - Worked Example: no sessions → empty state visible
      */
      render(<AgentsPage />);

      expect(screen.getByText(/no sessions/i)).toBeInTheDocument();
    });
  });

  describe('session creation', () => {
    it('should create new session when form is submitted', async () => {
      /*
      Test Doc:
      - Why: Core feature - create new agent sessions
      - Contract: Form submit creates session and adds to list
      - Usage Notes: Session appears in list after creation
      - Quality Contribution: Creation flow works
      - Worked Example: fill form + submit → session in list
      */
      const user = userEvent.setup();
      render(<AgentsPage />);

      // Fill form
      await user.type(screen.getByLabelText(/name/i), 'My New Session');

      // Submit
      await user.click(screen.getByRole('button', { name: /create/i }));

      // Session should appear (in list and header) - use getAllByText since it appears twice
      expect(screen.getAllByText('My New Session').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('layout', () => {
    it('should have accessible page structure', () => {
      /*
      Test Doc:
      - Why: Screen readers need proper page structure
      - Contract: Main landmark region present
      - Usage Notes: Uses main element
      - Quality Contribution: Page accessibility
      - Worked Example: main landmark present
      */
      render(<AgentsPage />);

      expect(screen.getByRole('main')).toBeInTheDocument();
    });
  });
});
