/**
 * AgentChatInput Component Tests
 *
 * Tests for the chat input component with Cmd/Ctrl+Enter submission.
 * Implements Full TDD for Phase 2: Core Chat.
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat)
 */

import { AgentChatInput } from '@/components/agents/agent-chat-input';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

// ============ Fake Callback Tracker (no vi.fn() per constitution) ============

/**
 * Tracks calls to onMessage callback.
 * Used instead of vi.fn() per fakes-over-mocks policy.
 */
class FakeMessageHandler {
  calls: string[] = [];

  onMessage = (message: string) => {
    this.calls.push(message);
  };

  assertCalledWith(expected: string) {
    expect(this.calls).toContain(expected);
  }

  assertCalledTimes(count: number) {
    expect(this.calls).toHaveLength(count);
  }

  assertNotCalled() {
    expect(this.calls).toHaveLength(0);
  }

  getLastCall(): string | undefined {
    return this.calls[this.calls.length - 1];
  }
}

// AgentChatInput is imported from implementation above

// ============ T005: AgentChatInput Tests ============

describe('AgentChatInput', () => {
  let handler: FakeMessageHandler;

  beforeEach(() => {
    handler = new FakeMessageHandler();
  });

  describe('message submission', () => {
    it('should submit message on Cmd/Ctrl+Enter', async () => {
      /*
      Test Doc:
      - Why: Standard shortcut for multi-line inputs (Shift+Enter = newline)
      - Contract: Cmd+Enter (Mac) or Ctrl+Enter triggers onMessage callback
      - Usage Notes: Enter alone inserts newline for multi-line messages
      - Quality Contribution: Catches keyboard shortcut regressions
      - Worked Example: Type "hello" + Cmd+Enter → onMessage("hello")
      */
      const user = userEvent.setup();
      render(<AgentChatInput onMessage={handler.onMessage} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Hello agent');

      // Simulate Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
      await user.keyboard('{Meta>}{Enter}{/Meta}');

      handler.assertCalledWith('Hello agent');
    });

    it('should submit message on button click', async () => {
      /*
      Test Doc:
      - Why: Alternative submission for mouse users
      - Contract: Clicking send button triggers onMessage callback
      - Usage Notes: Button is always enabled per MF-09
      - Quality Contribution: Ensures mouse workflow works
      - Worked Example: Type "test" + click Send → onMessage("test")
      */
      const user = userEvent.setup();
      render(<AgentChatInput onMessage={handler.onMessage} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test message');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      handler.assertCalledWith('Test message');
    });

    it('should clear input after successful submission', async () => {
      /*
      Test Doc:
      - Why: Input should reset for next message
      - Contract: After submission, textarea is empty
      - Usage Notes: User can immediately start typing next message
      - Quality Contribution: UX expectation
      - Worked Example: Submit message → textarea value = ""
      */
      const user = userEvent.setup();
      render(<AgentChatInput onMessage={handler.onMessage} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Message');
      await user.keyboard('{Meta>}{Enter}{/Meta}');

      expect(textarea).toHaveValue('');
    });

    it('should insert newline on plain Enter', async () => {
      /*
      Test Doc:
      - Why: Multi-line messages need newlines
      - Contract: Enter key without modifier inserts newline
      - Usage Notes: Cmd/Ctrl+Enter submits, plain Enter = newline
      - Quality Contribution: Multi-line message support
      - Worked Example: "line1" + Enter + "line2" → "line1\nline2" in textarea
      */
      const user = userEvent.setup();
      render(<AgentChatInput onMessage={handler.onMessage} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Line 1{Enter}Line 2');

      expect(textarea).toHaveValue('Line 1\nLine 2');
      handler.assertNotCalled(); // Should NOT submit
    });
  });

  describe('validation', () => {
    it('should show error for empty submission', async () => {
      /*
      Test Doc:
      - Why: Empty messages should not be sent to agent
      - Contract: Submitting empty input shows error message
      - Usage Notes: Error clears when user starts typing
      - Quality Contribution: Prevents empty messages
      - Worked Example: Click Send with empty input → error visible
      */
      const user = userEvent.setup();
      render(<AgentChatInput onMessage={handler.onMessage} />);

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      // Error message should be visible
      expect(screen.getByRole('alert')).toBeInTheDocument();
      handler.assertNotCalled();
    });

    it('should show error for whitespace-only submission', async () => {
      /*
      Test Doc:
      - Why: Whitespace-only messages are effectively empty
      - Contract: Submitting only spaces shows error
      - Usage Notes: Trims whitespace before validation
      - Quality Contribution: Prevents accidental whitespace messages
      - Worked Example: Type "   " + Submit → error visible
      */
      const user = userEvent.setup();
      render(<AgentChatInput onMessage={handler.onMessage} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, '   ');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      handler.assertNotCalled();
    });

    it('should clear error when user starts typing', async () => {
      /*
      Test Doc:
      - Why: Error should dismiss when user corrects issue
      - Contract: Typing after error clears the error message
      - Usage Notes: Provides immediate feedback that issue is resolved
      - Quality Contribution: Good UX error handling
      - Worked Example: Show error → type 'a' → error hidden
      */
      const user = userEvent.setup();
      render(<AgentChatInput onMessage={handler.onMessage} />);

      // Trigger error
      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);
      expect(screen.getByRole('alert')).toBeInTheDocument();

      // Start typing
      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'a');

      // Error should be cleared
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('accessibility (MF-09)', () => {
    it('should never disable submit button', () => {
      /*
      Test Doc:
      - Why: Per MF-09: Disabled buttons break accessibility
      - Contract: Submit button is never disabled, even when input is empty
      - Usage Notes: Validation happens on submit, error shown instead
      - Quality Contribution: Ensures keyboard navigation works for all users
      - Worked Example: Empty input → button still enabled
      */
      render(<AgentChatInput onMessage={handler.onMessage} />);

      const sendButton = screen.getByRole('button', { name: /send/i });

      expect(sendButton).not.toBeDisabled();
      expect(sendButton).not.toHaveAttribute('disabled');
    });

    it('should have ARIA label on textarea', () => {
      /*
      Test Doc:
      - Why: Screen readers need descriptive labels
      - Contract: Textarea has aria-label or associated label
      - Usage Notes: Label should describe the input purpose
      - Quality Contribution: Screen reader accessibility
      - Worked Example: textarea has aria-label="Message input"
      */
      render(<AgentChatInput onMessage={handler.onMessage} />);

      const textarea = screen.getByRole('textbox');
      expect(
        textarea.getAttribute('aria-label') || textarea.getAttribute('aria-labelledby')
      ).toBeTruthy();
    });

    it('should have ARIA label on send button', () => {
      /*
      Test Doc:
      - Why: Screen readers need button purpose
      - Contract: Send button has accessible name
      - Usage Notes: Can be text content or aria-label
      - Quality Contribution: Button accessibility
      - Worked Example: button accessible as "Send" or "Send message"
      */
      render(<AgentChatInput onMessage={handler.onMessage} />);

      // getByRole with name verifies accessibility
      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton).toBeInTheDocument();
    });

    it('should support Tab navigation', async () => {
      /*
      Test Doc:
      - Why: Keyboard-only users need Tab navigation
      - Contract: Tab moves focus between textarea and button
      - Usage Notes: Focus order: textarea → send button
      - Quality Contribution: Full keyboard accessibility
      - Worked Example: Tab from textarea → focus on button
      */
      const user = userEvent.setup();
      render(<AgentChatInput onMessage={handler.onMessage} />);

      // Focus textarea first
      const textarea = screen.getByRole('textbox');
      await user.click(textarea);
      expect(textarea).toHaveFocus();

      // Tab to button
      await user.tab();
      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton).toHaveFocus();
    });
  });

  describe('disabled state', () => {
    it('should disable input when disabled prop is true', () => {
      /*
      Test Doc:
      - Why: Prevent input during agent processing
      - Contract: disabled prop disables textarea (not button per MF-09)
      - Usage Notes: Used when agent is running
      - Quality Contribution: Prevents double-submission
      - Worked Example: disabled=true → textarea disabled
      */
      render(<AgentChatInput onMessage={handler.onMessage} disabled />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeDisabled();
    });

    it('should still allow button click when disabled', () => {
      /*
      Test Doc:
      - Why: Per MF-09, button never disabled
      - Contract: Button still enabled even when disabled prop is true
      - Usage Notes: Clicking shows validation error
      - Quality Contribution: Consistent accessibility
      - Worked Example: disabled=true → button still clickable
      */
      render(<AgentChatInput onMessage={handler.onMessage} disabled />);

      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton).not.toBeDisabled();
    });
  });

  describe('keyboard hint', () => {
    it('should display keyboard shortcut hint', () => {
      /*
      Test Doc:
      - Why: Users need to know the submit shortcut
      - Contract: Keyboard hint visible in footer
      - Usage Notes: Shows Cmd+Enter (Mac) or Ctrl+Enter indicator
      - Quality Contribution: Discoverability
      - Worked Example: "⌘ + Enter to send" visible
      */
      render(<AgentChatInput onMessage={handler.onMessage} />);

      // Should show keyboard hint
      expect(screen.getByText(/enter/i)).toBeInTheDocument();
    });
  });
});
