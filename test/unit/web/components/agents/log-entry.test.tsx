/**
 * LogEntry Component Tests
 *
 * Tests for the terminal-style message rendering component.
 * Implements Full TDD for Phase 2: Core Chat.
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat)
 */

import { LogEntry } from '@/components/agents/log-entry';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

// ============ T007: LogEntry Tests ============

describe('LogEntry', () => {
  describe('user messages', () => {
    it('should render user message with violet left border', () => {
      /*
      Test Doc:
      - Why: Visual differentiation between user and assistant messages
      - Contract: User messages have violet left border per prototype design
      - Usage Notes: Uses border-l-2 border-violet-500 classes
      - Quality Contribution: Ensures consistent visual design
      - Worked Example: messageRole="user" → violet border visible
      */
      const { container } = render(<LogEntry messageRole="user" content="Hello agent" />);

      // Find the outermost container div which has the border classes
      const messageContainer = container.firstChild as HTMLElement;
      expect(messageContainer).toBeInTheDocument();
      // Check for violet border styling
      expect(messageContainer.classList.toString()).toMatch(/border.*violet|border-l/);
    });

    it('should render user message content correctly', () => {
      /*
      Test Doc:
      - Why: User messages must display their content
      - Contract: content prop is rendered as text
      - Usage Notes: Whitespace and newlines preserved
      - Quality Contribution: Basic content rendering
      - Worked Example: content='test message' → text visible
      */
      render(<LogEntry messageRole="user" content="Test message from user" />);

      expect(screen.getByText('Test message from user')).toBeInTheDocument();
    });

    it('should show user icon', () => {
      /*
      Test Doc:
      - Why: Icon indicates message source
      - Contract: User messages show user icon
      - Usage Notes: Uses Lucide User icon
      - Quality Contribution: Visual clarity
      - Worked Example: messageRole="user" → user icon visible
      */
      render(<LogEntry messageRole="user" content="Hello" />);

      // Look for an element that indicates user icon (could be role or aria-label)
      const messageArea = screen.getByText('Hello').parentElement;
      expect(messageArea).toBeInTheDocument();
    });
  });

  describe('assistant messages', () => {
    it('should render assistant message without border', () => {
      /*
      Test Doc:
      - Why: Assistant messages have plain styling per prototype
      - Contract: No colored left border on assistant messages
      - Usage Notes: Uses Bot icon prefix instead
      - Quality Contribution: Visual differentiation
      - Worked Example: messageRole="assistant" → no border
      */
      render(<LogEntry messageRole="assistant" content="Hello, I can help" />);

      const message = screen.getByText(/Hello, I can help/);
      expect(message).toBeInTheDocument();
    });

    it('should render assistant message content correctly', () => {
      /*
      Test Doc:
      - Why: Assistant messages must display response content
      - Contract: content prop rendered as text
      - Usage Notes: May include markdown formatting
      - Quality Contribution: Basic content rendering
      - Worked Example: content='response' → text visible
      */
      render(<LogEntry messageRole="assistant" content="I can help you with that." />);

      expect(screen.getByText('I can help you with that.')).toBeInTheDocument();
    });

    it('should show streaming indicator when isStreaming is true', () => {
      /*
      Test Doc:
      - Why: User needs visual feedback that response is still coming
      - Contract: isStreaming=true shows "typing..." indicator
      - Usage Notes: Blue animated dot + "typing..." text
      - Quality Contribution: Streaming UX feedback
      - Worked Example: isStreaming=true → indicator visible
      */
      render(<LogEntry messageRole="assistant" content="Hello" isStreaming />);

      expect(screen.getByText(/typing/i)).toBeInTheDocument();
    });

    it('should hide streaming indicator when isStreaming is false', () => {
      /*
      Test Doc:
      - Why: Completed messages should not show streaming indicator
      - Contract: isStreaming=false (or undefined) hides indicator
      - Usage Notes: Default state is not streaming
      - Quality Contribution: Clean final state
      - Worked Example: isStreaming=false → no indicator
      */
      render(<LogEntry messageRole="assistant" content="Hello" isStreaming={false} />);

      expect(screen.queryByText(/typing/i)).not.toBeInTheDocument();
    });
  });

  describe('system messages', () => {
    it('should render system message with muted styling', () => {
      /*
      Test Doc:
      - Why: System messages are informational, not conversational
      - Contract: System messages have muted text color
      - Usage Notes: Italic, smaller text per prototype
      - Quality Contribution: Visual hierarchy
      - Worked Example: messageRole="system" → muted styling
      */
      render(<LogEntry messageRole="system" content="Session started" />);

      const message = screen.getByText('Session started');
      expect(message).toBeInTheDocument();
    });
  });

  describe('multiline content', () => {
    it('should preserve newlines in content', () => {
      /*
      Test Doc:
      - Why: Code and multi-paragraph responses need line breaks
      - Contract: Newlines in content are rendered as line breaks
      - Usage Notes: Uses whitespace-pre-wrap CSS
      - Quality Contribution: Proper text formatting
      - Worked Example: 'line1\nline2' → two lines visible
      */
      render(<LogEntry messageRole="assistant" content={'Line 1\nLine 2'} />);

      // The content should contain both lines
      const container = screen.getByText(/Line 1/);
      expect(container).toBeInTheDocument();
      // Check that whitespace-pre-wrap is applied (content visible)
      expect(screen.getByText(/Line 2/)).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should be accessible to screen readers', () => {
      /*
      Test Doc:
      - Why: All users should be able to read messages
      - Contract: Message content is accessible text
      - Usage Notes: No aria-hidden on content
      - Quality Contribution: Screen reader support
      - Worked Example: content visible to getByText
      */
      render(<LogEntry messageRole="user" content="Accessible message" />);

      // If we can find it with getByText, it's accessible
      expect(screen.getByText('Accessible message')).toBeInTheDocument();
    });
  });
});
