'use client';

/**
 * AgentCreationForm - Form for creating new agent sessions
 *
 * Simple form with:
 * - Name input (required)
 * - Agent type selector (claude-code, copilot)
 * - Create button (never disabled per MF-09)
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat)
 */

/** Supported agent types */
type AgentType = 'claude-code' | 'copilot';

import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useCallback, useState } from 'react';

export interface AgentCreationFormProps {
  /** Callback when form is submitted */
  onCreate: (name: string, agentType: AgentType) => void;
  /** Current number of sessions (for auto-generating ordinal names) */
  sessionCount?: number;
  /** Additional CSS classes */
  className?: string;
}

const AGENT_TYPE_OPTIONS: Array<{ value: AgentType; label: string }> = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'copilot', label: 'GitHub Copilot' },
];

/**
 * Form for creating new agent sessions.
 *
 * @example
 * <AgentCreationForm
 *   onCreate={(name, type) => {
 *     const id = crypto.randomUUID();
 *     createSession({ id, name, agentType: type });
 *   }}
 * />
 */
export function AgentCreationForm({
  onCreate,
  sessionCount = 0,
  className,
}: AgentCreationFormProps) {
  const [name, setName] = useState('');
  const [agentType, setAgentType] = useState<AgentType>('claude-code');

  const handleNameChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  }, []);

  const handleTypeChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    setAgentType(e.target.value as AgentType);
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();

      const trimmed = name.trim();
      // Auto-generate ordinal name if empty
      const finalName = trimmed || `Session ${sessionCount + 1}`;

      onCreate(finalName, agentType);
      setName('');
    },
    [name, agentType, onCreate, sessionCount]
  );

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-3', className)}>
      <div className="space-y-1">
        <label htmlFor="session-name" className="text-sm font-medium text-foreground">
          Session Name
        </label>
        <input
          id="session-name"
          type="text"
          value={name}
          onChange={handleNameChange}
          placeholder="Session name (optional)"
          className={cn(
            'w-full px-3 py-2 text-sm rounded-md border',
            'bg-background',
            'focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500'
          )}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="agent-type" className="text-sm font-medium text-foreground">
          Agent Type
        </label>
        <select
          id="agent-type"
          value={agentType}
          onChange={handleTypeChange}
          className={cn(
            'w-full px-3 py-2 text-sm rounded-md border',
            'bg-background',
            'focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500'
          )}
        >
          {AGENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className={cn(
          'w-full flex items-center justify-center gap-2',
          'px-4 py-2 text-sm font-medium rounded-md',
          'bg-violet-600 hover:bg-violet-700 text-white',
          'transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2'
        )}
      >
        <Plus className="h-4 w-4" />
        Create Session
      </button>
    </form>
  );
}

export default AgentCreationForm;
