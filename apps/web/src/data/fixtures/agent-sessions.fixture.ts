/**
 * Mock agent session data for kanban card previews.
 *
 * Inspired by vibe-kanban's NormalizedConversation patterns.
 * In the real implementation, this will be backed by actual agent adapters.
 */

/**
 * Message role in the conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Status of a tool invocation
 */
export type ToolStatus = 'pending' | 'running' | 'complete' | 'failed';

/**
 * Question type for structured input
 */
export type QuestionType = 'free_text' | 'single_choice' | 'multi_choice' | 'confirm';

/**
 * A pending question from the agent
 */
export interface AgentQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  choices?: string[];
  /** Default value hint */
  defaultValue?: string | string[] | boolean;
}

/**
 * A single message in the agent conversation
 */
export interface AgentMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  /** Tool call metadata (when role is 'tool') */
  tool?: {
    name: string;
    status: ToolStatus;
    input?: string;
    output?: string;
  };
  /** Whether this message is currently streaming */
  isStreaming?: boolean;
}

/**
 * Agent session status
 */
export type AgentSessionStatus = 'idle' | 'running' | 'waiting_input' | 'error';

/**
 * Agent type
 */
export type AgentType = 'claude-code' | 'copilot' | 'generic';

/**
 * A complete agent session
 */
export interface AgentSession {
  id: string;
  runId: string;
  agentType: AgentType;
  status: AgentSessionStatus;
  messages: AgentMessage[];
  /** Pending question when status is waiting_input */
  pendingQuestion?: AgentQuestion;
  /** Context window usage percentage */
  contextUsage?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Map of runId to AgentSession
 */
export type AgentSessionMap = Record<string, AgentSession>;

/**
 * Create a mock agent session for a run
 */
function createAgentSession(
  runId: string,
  status: AgentSessionStatus,
  messages: Omit<AgentMessage, 'id' | 'timestamp'>[],
  options?: {
    agentType?: AgentType;
    pendingQuestion?: AgentQuestion;
    contextUsage?: number;
  }
): AgentSession {
  const now = new Date();
  return {
    id: `session-${runId}`,
    runId,
    agentType: options?.agentType ?? 'claude-code',
    status,
    messages: messages.map((msg, idx) => ({
      ...msg,
      id: `msg-${runId}-${idx}`,
      timestamp: new Date(now.getTime() - (messages.length - idx) * 30000).toISOString(),
    })),
    pendingQuestion: options?.pendingQuestion,
    contextUsage: options?.contextUsage ?? Math.floor(Math.random() * 60) + 20,
    createdAt: new Date(now.getTime() - messages.length * 60000).toISOString(),
    updatedAt: now.toISOString(),
  };
}

/**
 * Mock agent sessions for demo runs
 * Note: Run IDs match the manual-test-workflow runs (run-mt-XXX)
 * Each waiting_input session has a different question type to demonstrate the UI
 */
export const DEMO_AGENT_SESSIONS: AgentSessionMap = {
  // Single choice question - deployment target selection
  'run-mt-001': createAgentSession(
    'run-mt-001',
    'waiting_input',
    [
      {
        role: 'user',
        content: 'Start the deployment process for the staging environment.',
      },
      {
        role: 'assistant',
        content:
          "I'll start the deployment process. Let me first check available deployment targets.",
      },
      {
        role: 'tool',
        content: 'Checking deployment targets...',
        tool: {
          name: 'bash',
          status: 'complete',
          input: 'kubectl get namespaces | grep -E "(staging|prod|dev)"',
          output: 'dev          Active   45d\nstaging      Active   45d\nproduction   Active   45d',
        },
      },
      {
        role: 'assistant',
        content:
          "I found multiple deployment environments available. Which environment would you like me to deploy to?\n\nPlease select the target environment for this deployment.",
      },
    ],
    {
      pendingQuestion: {
        id: 'q-deploy-target',
        type: 'single_choice',
        prompt: 'Which environment should I deploy to?',
        choices: ['Development (dev)', 'Staging (staging)', 'Production (production)'],
        defaultValue: 'Staging (staging)',
      },
    }
  ),

  // Multi-choice question - feature flags
  'run-mt-002': createAgentSession(
    'run-mt-002',
    'waiting_input',
    [
      {
        role: 'user',
        content: 'Deploy the latest version to production.',
      },
      {
        role: 'assistant',
        content:
          "I'll prepare the production deployment. Let me check the feature flags configuration.",
      },
      {
        role: 'tool',
        content: 'Checking feature flags...',
        tool: {
          name: 'bash',
          status: 'complete',
          input: 'cat config/feature-flags.json',
          output: '{"new_checkout": false, "dark_mode": true, "ai_recommendations": false, "beta_api": false}',
        },
      },
      {
        role: 'assistant',
        content:
          "The production deployment is ready. I can enable any of these feature flags during deployment. Select which features you want to enable:",
      },
    ],
    {
      agentType: 'copilot',
      pendingQuestion: {
        id: 'q-feature-flags',
        type: 'multi_choice',
        prompt: 'Select feature flags to enable in production:',
        choices: [
          'New Checkout Flow (new_checkout)',
          'Dark Mode (dark_mode) - Currently enabled',
          'AI Recommendations (ai_recommendations)',
          'Beta API (beta_api)',
        ],
        defaultValue: ['Dark Mode (dark_mode) - Currently enabled'],
      },
    }
  ),

  // Confirm question - proceed with migration
  'run-mt-003': createAgentSession(
    'run-mt-003',
    'waiting_input',
    [
      {
        role: 'user',
        content: 'Run the database migration for user preferences.',
      },
      {
        role: 'assistant',
        content:
          "I'll prepare the database migration. Let me analyze the migration script first.",
      },
      {
        role: 'tool',
        content: 'Analyzing migration...',
        tool: {
          name: 'bash',
          status: 'complete',
          input: 'prisma migrate diff --preview-feature',
          output:
            '+ CREATE TABLE user_preferences\n+ ADD COLUMN theme VARCHAR(20)\n+ ADD COLUMN notifications_enabled BOOLEAN\n~ ALTER TABLE users ADD CONSTRAINT fk_preferences',
        },
      },
      {
        role: 'assistant',
        content:
          "I've analyzed the migration. This will:\n\n• Create a new `user_preferences` table\n• Add `theme` and `notifications_enabled` columns\n• Create a foreign key constraint to the `users` table\n\n⚠️ **Warning**: This migration cannot be easily reversed. The changes will affect 12,847 user records.",
      },
    ],
    {
      pendingQuestion: {
        id: 'q-confirm-migration',
        type: 'confirm',
        prompt: 'Do you want to proceed with this database migration?',
      },
      contextUsage: 78,
    }
  ),

  // Running session (no question) - test suite
  'run-mt-004': createAgentSession(
    'run-mt-004',
    'running',
    [
      {
        role: 'user',
        content: 'Run the full test suite and generate coverage report.',
      },
      {
        role: 'assistant',
        content:
          'Starting the test suite. This will run unit tests, integration tests, and generate a coverage report.',
      },
      {
        role: 'tool',
        content: 'Running tests...',
        tool: {
          name: 'bash',
          status: 'running',
          input: 'pnpm test --coverage',
        },
      },
    ],
    { contextUsage: 45 }
  ),

  // Idle session - completed health check
  'run-mt-005': createAgentSession(
    'run-mt-005',
    'idle',
    [
      {
        role: 'user',
        content: 'Check the status of all microservices.',
      },
      {
        role: 'assistant',
        content: "I'll check the health of all microservices in the cluster.",
      },
      {
        role: 'tool',
        content: 'Checking service health...',
        tool: {
          name: 'bash',
          status: 'complete',
          input: 'kubectl get pods -n production',
          output: `NAME                        READY   STATUS    RESTARTS   AGE
api-server-7d8f9c6b4-x2k9l  1/1     Running   0          2d
auth-service-5c4d3b2a1-m8n7  1/1     Running   0          2d
worker-6e5f4d3c2-p9q8       1/1     Running   0          2d
redis-master-0              1/1     Running   0          5d`,
        },
      },
      {
        role: 'assistant',
        content:
          '✅ All services are healthy!\n\n| Service | Status | Uptime |\n|---------|--------|--------|\n| api-server | Running | 2 days |\n| auth-service | Running | 2 days |\n| worker | Running | 2 days |\n| redis-master | Running | 5 days |\n\nNo issues detected. All pods are running with 1/1 containers ready.',
      },
    ],
    { contextUsage: 35 }
  ),

  // Error session - failed deployment
  'run-mt-006': createAgentSession(
    'run-mt-006',
    'error',
    [
      {
        role: 'user',
        content: 'Deploy hotfix to production immediately.',
      },
      {
        role: 'assistant',
        content: 'Initiating emergency hotfix deployment. Let me verify the hotfix branch.',
      },
      {
        role: 'tool',
        content: 'Checking hotfix branch...',
        tool: {
          name: 'bash',
          status: 'failed',
          input: 'git checkout hotfix/critical-auth-fix',
          output: "error: pathspec 'hotfix/critical-auth-fix' did not match any file(s) known to git",
        },
      },
      {
        role: 'assistant',
        content:
          "❌ **Error**: The hotfix branch `hotfix/critical-auth-fix` doesn't exist.\n\nPlease verify:\n1. The branch name is correct\n2. The branch has been pushed to the remote\n3. You have the latest refs: `git fetch --all`\n\nOnce the branch is available, I can retry the deployment.",
      },
    ],
    { contextUsage: 22 }
  ),
};

/**
 * Get agent session by run ID
 */
export function getAgentSessionByRunId(runId: string): AgentSession | undefined {
  return DEMO_AGENT_SESSIONS[runId];
}
