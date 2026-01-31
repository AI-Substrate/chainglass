/**
 * AgentChatView Component Tests
 *
 * Tests for the main chat view component that:
 * - Renders events from Plan 019 agent system
 * - Shows streaming content
 * - Handles message sending
 * - Displays error states
 *
 * Part of Plan 019: Agent Manager Refactor (Phase 5: Consolidation & Cleanup)
 * Per DYK-01: Props changed from sessionId/workspaceSlug/agentType to just agentId.
 * Per DYK-02: Uses useAgentInstance hook from 019 feature folder.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the useAgentInstance hook
const mockUseAgentInstance = vi.fn();
const mockRun = vi.fn();
const mockRefetch = vi.fn();

vi.mock('@/features/019-agent-manager-refactor', () => ({
  useAgentInstance: (...args: unknown[]) => mockUseAgentInstance(...args),
  transformAgentEventsToLogEntries: (events: unknown[]) => {
    // Simple transform for testing
    return (events as Array<{ eventId: string; type: string; data?: { content?: string } }>).map(
      (e) => ({
        key: e.eventId,
        messageRole: 'assistant' as const,
        content: e.data?.content ?? '',
        contentType: 'text' as const,
      })
    );
  },
}));

// Mock fetch for message sending
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Import after mocks
import { AgentChatView } from '@/components/agents/agent-chat-view';

// ============ Test Helpers ============

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(component: React.ReactElement) {
  const queryClient = createQueryClient();
  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
}

function createMockAgent(overrides: Partial<ReturnType<typeof mockUseAgentInstance>> = {}) {
  return {
    agent: {
      id: 'agent-123',
      name: 'Test Agent',
      type: 'claude-code' as const,
      workspace: '/test/workspace',
      status: 'stopped' as const,
      intent: '',
      sessionId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [],
    },
    events: [],
    isWorking: false,
    isLoading: false,
    error: null,
    isConnected: true,
    run: mockRun,
    refetch: mockRefetch,
    ...overrides,
  };
}

// ============ Tests ============

describe('AgentChatView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAgentInstance.mockReturnValue(createMockAgent());
  });

  describe('event rendering', () => {
    it('should render events from agent', async () => {
      const events = [
        {
          eventId: 'evt-1',
          type: 'message',
          timestamp: new Date().toISOString(),
          data: { content: 'Hello world' },
        },
      ];

      mockUseAgentInstance.mockReturnValue(
        createMockAgent({
          events,
          agent: {
            id: 'agent-123',
            name: 'Test Agent',
            type: 'claude-code',
            workspace: '/test/workspace',
            status: 'stopped',
            intent: '',
            sessionId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            events,
          },
        })
      );

      renderWithProviders(<AgentChatView agentId="agent-123" />);

      // Should render the message from events
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    it('should call useAgentInstance with agentId', () => {
      renderWithProviders(<AgentChatView agentId="agent-456" />);

      expect(mockUseAgentInstance).toHaveBeenCalledWith('agent-456', expect.any(Object));
    });
  });

  describe('loading states', () => {
    it('should show loading state while fetching agent', () => {
      mockUseAgentInstance.mockReturnValue(
        createMockAgent({
          isLoading: true,
          agent: undefined,
        })
      );

      renderWithProviders(<AgentChatView agentId="agent-123" />);

      expect(screen.getByText('Loading agent...')).toBeInTheDocument();
    });

    it('should show not found state when agent is null', () => {
      mockUseAgentInstance.mockReturnValue(
        createMockAgent({
          agent: null,
        })
      );

      renderWithProviders(<AgentChatView agentId="agent-notfound" />);

      expect(screen.getByText(/Agent not found/)).toBeInTheDocument();
    });
  });

  describe('message sending', () => {
    it('should call run when message is sent via button', async () => {
      const user = userEvent.setup();
      mockRun.mockResolvedValue(undefined);

      renderWithProviders(<AgentChatView agentId="agent-123" />);

      const input = screen.getByPlaceholderText('Send a message...');
      await user.type(input, 'Hello');

      const sendButton = screen.getByLabelText('Send message');
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockRun).toHaveBeenCalledWith(
          expect.objectContaining({
            prompt: 'Hello',
          })
        );
      });
    });

    it('should disable input while agent is working', () => {
      mockUseAgentInstance.mockReturnValue(
        createMockAgent({
          isWorking: true,
          agent: {
            id: 'agent-123',
            name: 'Test Agent',
            type: 'claude-code',
            workspace: '/test/workspace',
            status: 'working',
            intent: 'Processing...',
            sessionId: 'sess-1',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            events: [],
          },
        })
      );

      renderWithProviders(<AgentChatView agentId="agent-123" />);

      const input = screen.getByPlaceholderText('Agent is working...');
      expect(input).toBeDisabled();
    });
  });

  describe('SSE connection', () => {
    it('should show connected indicator when SSE is connected', () => {
      mockUseAgentInstance.mockReturnValue(
        createMockAgent({
          isConnected: true,
        })
      );

      renderWithProviders(<AgentChatView agentId="agent-123" />);

      expect(screen.getByTitle('Connected')).toBeInTheDocument();
    });

    it('should show disconnected indicator when SSE is not connected', () => {
      mockUseAgentInstance.mockReturnValue(
        createMockAgent({
          isConnected: false,
        })
      );

      renderWithProviders(<AgentChatView agentId="agent-123" />);

      expect(screen.getByTitle('Disconnected')).toBeInTheDocument();
    });
  });

  describe('error states', () => {
    it('should display error message', () => {
      mockUseAgentInstance.mockReturnValue(
        createMockAgent({
          error: new Error('Something went wrong'),
        })
      );

      renderWithProviders(<AgentChatView agentId="agent-123" />);

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });
});
