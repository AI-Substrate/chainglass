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
  messages: Omit<AgentMessage, 'id' | 'timestamp'>[]
): AgentSession {
  const now = new Date();
  return {
    id: `session-${runId}`,
    runId,
    agentType: 'claude-code',
    status,
    messages: messages.map((msg, idx) => ({
      ...msg,
      id: `msg-${runId}-${idx}`,
      timestamp: new Date(now.getTime() - (messages.length - idx) * 30000).toISOString(),
    })),
    contextUsage: Math.floor(Math.random() * 60) + 20,
    createdAt: new Date(now.getTime() - messages.length * 60000).toISOString(),
    updatedAt: now.toISOString(),
  };
}

/**
 * Mock agent sessions for demo runs
 * Note: Run IDs match the manual-test-workflow runs (run-mt-XXX)
 */
export const DEMO_AGENT_SESSIONS: AgentSessionMap = {
  'run-mt-001': createAgentSession('run-mt-001', 'waiting_input', [
    {
      role: 'user',
      content: 'Start the deployment process for the staging environment.',
    },
    {
      role: 'assistant',
      content:
        "I'll start the deployment process for staging. Let me first check the current state of the infrastructure.",
    },
    {
      role: 'tool',
      content: 'Checking infrastructure state...',
      tool: {
        name: 'bash',
        status: 'complete',
        input: 'terraform plan -out=tfplan',
        output: 'Plan: 3 to add, 1 to change, 0 to destroy.',
      },
    },
    {
      role: 'assistant',
      content:
        "The infrastructure plan looks good. I see we need to:\n\n1. Add 3 new resources\n2. Update 1 existing resource\n\nI'm now applying the changes...",
      isStreaming: true,
    },
  ]),

  'run-mt-002': createAgentSession('run-mt-002', 'waiting_input', [
    {
      role: 'user',
      content: 'Deploy the latest version to production.',
    },
    {
      role: 'assistant',
      content:
        "I'll prepare the production deployment. First, let me verify the Docker images are ready.",
    },
    {
      role: 'tool',
      content: 'Verifying Docker images...',
      tool: {
        name: 'bash',
        status: 'complete',
        input: 'docker images | grep app-server',
        output: 'app-server:v2.4.1  abc123  2 hours ago  456MB',
      },
    },
    {
      role: 'assistant',
      content:
        'The Docker image `app-server:v2.4.1` is ready. Before I proceed with the production deployment, I need your confirmation.\n\n**Please review the deployment details:**\n- **Version**: v2.4.1\n- **Target**: Production cluster\n- **Rollout strategy**: Blue-green deployment\n- **Estimated downtime**: None (zero-downtime deployment)\n\nShould I proceed with the deployment?',
    },
  ]),

  'run-mt-003': createAgentSession('run-mt-003', 'running', [
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
  ]),

  'run-mt-004': createAgentSession('run-mt-004', 'idle', [
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
  ]),

  'run-mt-005': createAgentSession('run-mt-005', 'waiting_input', [
    {
      role: 'user',
      content: 'Set up the new database migration for the user preferences feature.',
    },
    {
      role: 'assistant',
      content:
        "I'll create the database migration for user preferences. Let me first check the current schema.",
    },
    {
      role: 'tool',
      content: 'Checking database schema...',
      tool: {
        name: 'bash',
        status: 'complete',
        input: 'prisma db pull',
        output: 'Schema downloaded successfully.',
      },
    },
    {
      role: 'assistant',
      content: `I've analyzed the current schema. I'm proposing the following migration:

\`\`\`sql
-- CreateTable
CREATE TABLE "user_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "theme" VARCHAR(20) DEFAULT 'system',
    "notifications_enabled" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
\`\`\`

This migration will:
1. Create a new \`user_preferences\` table
2. Add a unique constraint on \`user_id\`
3. Set up cascading deletes

Should I apply this migration to the development database?`,
    },
  ]),

  'run-mt-006': createAgentSession('run-mt-006', 'error', [
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
  ]),
};

/**
 * Get agent session by run ID
 */
export function getAgentSessionByRunId(runId: string): AgentSession | undefined {
  return DEMO_AGENT_SESSIONS[runId];
}
