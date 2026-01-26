/**
 * AgentCreationForm Component Tests
 *
 * Tests for the form to create new agent sessions.
 * Implements Full TDD for Phase 2: Core Chat.
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat)
 */

import { AgentCreationForm } from '@/components/agents/agent-creation-form';
import type { AgentType } from '@/lib/schemas/agent-session.schema';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

// ============ Callback Tracker ============

class FakeCreateHandler {
  calls: Array<{ name: string; agentType: AgentType }> = [];

  onCreate = (name: string, agentType: AgentType) => {
    this.calls.push({ name, agentType });
  };

  assertCalledWith(name: string, agentType: AgentType) {
    expect(this.calls.some((c) => c.name === name && c.agentType === agentType)).toBe(true);
  }

  assertCalledOnce() {
    expect(this.calls).toHaveLength(1);
  }

  assertNotCalled() {
    expect(this.calls).toHaveLength(0);
  }
}

// ============ T013: AgentCreationForm Tests ============

describe('AgentCreationForm', () => {
  let handler: FakeCreateHandler;

  beforeEach(() => {
    handler = new FakeCreateHandler();
  });

  describe('form elements', () => {
    it('should render name input', () => {
      /*
      Test Doc:
      - Why: Users need to name their agent sessions
      - Contract: Name input field is present and accessible
      - Usage Notes: Required field
      - Quality Contribution: Basic form rendering
      - Worked Example: name input visible
      */
      render(<AgentCreationForm onCreate={handler.onCreate} />);

      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    });

    it('should render agent type selector', () => {
      /*
      Test Doc:
      - Why: Users choose their preferred agent
      - Contract: Agent type dropdown/selector present
      - Usage Notes: Options: claude-code, copilot
      - Quality Contribution: Basic form rendering
      - Worked Example: agent type selector visible
      */
      render(<AgentCreationForm onCreate={handler.onCreate} />);

      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    it('should render create button', () => {
      /*
      Test Doc:
      - Why: User needs to submit the form
      - Contract: Create/Submit button present
      - Usage Notes: Never disabled per MF-09
      - Quality Contribution: Basic form rendering
      - Worked Example: create button visible
      */
      render(<AgentCreationForm onCreate={handler.onCreate} />);

      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
    });
  });

  describe('form submission', () => {
    it('should call onCreate with name and agent type', async () => {
      /*
      Test Doc:
      - Why: Form must submit user input
      - Contract: onCreate called with entered name and selected type
      - Usage Notes: Default agent type is claude-code
      - Quality Contribution: Core form functionality
      - Worked Example: fill form + submit → onCreate(name, type)
      */
      const user = userEvent.setup();
      render(<AgentCreationForm onCreate={handler.onCreate} />);

      // Fill in name
      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'My Test Session');

      // Submit form
      const submitBtn = screen.getByRole('button', { name: /create/i });
      await user.click(submitBtn);

      handler.assertCalledOnce();
      handler.assertCalledWith('My Test Session', 'claude-code');
    });

    it('should allow selecting different agent type', async () => {
      /*
      Test Doc:
      - Why: Users may prefer different agents
      - Contract: Can select copilot instead of claude-code
      - Usage Notes: Uses select or radio group
      - Quality Contribution: Agent type selection
      - Worked Example: select copilot → form submits with copilot
      */
      const user = userEvent.setup();
      render(<AgentCreationForm onCreate={handler.onCreate} />);

      // Fill name and select copilot
      await user.type(screen.getByLabelText(/name/i), 'Copilot Session');
      await user.selectOptions(screen.getByLabelText(/type/i), 'copilot');

      // Submit
      await user.click(screen.getByRole('button', { name: /create/i }));

      handler.assertCalledWith('Copilot Session', 'copilot');
    });
  });

  describe('validation', () => {
    it('should show error for empty name', async () => {
      /*
      Test Doc:
      - Why: Session name is required
      - Contract: Empty name submission shows error
      - Usage Notes: Error clears when user starts typing
      - Quality Contribution: Input validation
      - Worked Example: submit empty → error visible
      */
      const user = userEvent.setup();
      render(<AgentCreationForm onCreate={handler.onCreate} />);

      // Submit without filling name
      await user.click(screen.getByRole('button', { name: /create/i }));

      expect(screen.getByRole('alert')).toBeInTheDocument();
      handler.assertNotCalled();
    });

    it('should clear error when user types', async () => {
      /*
      Test Doc:
      - Why: Error should dismiss when user corrects
      - Contract: Typing clears validation error
      - Usage Notes: UX feedback
      - Quality Contribution: Error handling UX
      - Worked Example: error shown → type → error hidden
      */
      const user = userEvent.setup();
      render(<AgentCreationForm onCreate={handler.onCreate} />);

      // Trigger error
      await user.click(screen.getByRole('button', { name: /create/i }));
      expect(screen.getByRole('alert')).toBeInTheDocument();

      // Start typing
      await user.type(screen.getByLabelText(/name/i), 'a');

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have accessible form labels', () => {
      /*
      Test Doc:
      - Why: Screen readers need form labels
      - Contract: All inputs have associated labels
      - Usage Notes: Using htmlFor/label connections
      - Quality Contribution: Form accessibility
      - Worked Example: getByLabelText finds inputs
      */
      render(<AgentCreationForm onCreate={handler.onCreate} />);

      // If we can find inputs by label, they're accessible
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    it('should submit on Enter in name input', async () => {
      /*
      Test Doc:
      - Why: Keyboard form submission
      - Contract: Enter in name input submits form
      - Usage Notes: Standard form behavior
      - Quality Contribution: Keyboard accessibility
      - Worked Example: type name + Enter → form submits
      */
      const user = userEvent.setup();
      render(<AgentCreationForm onCreate={handler.onCreate} />);

      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'Enter Test{Enter}');

      handler.assertCalledOnce();
    });
  });
});
