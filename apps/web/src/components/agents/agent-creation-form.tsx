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

import type { AgentType } from '@/lib/schemas/agent-session.schema';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useCallback, useState } from 'react';

export interface AgentCreationFormProps {
  /** Callback when form is submitted */
  onCreate: (name: string, agentType: AgentType) => void;
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
export function AgentCreationForm({ onCreate, className }: AgentCreationFormProps) {
  const [name, setName] = useState('');
  const [agentType, setAgentType] = useState<AgentType>('claude-code');
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setName(e.target.value);
      if (error) {
        setError(null);
      }
    },
    [error]
  );

  const handleTypeChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    setAgentType(e.target.value as AgentType);
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();

      const trimmed = name.trim();
      if (!trimmed) {
        setError('Please enter a session name');
        return;
      }

      onCreate(trimmed, agentType);
      setName('');
      setError(null);
    },
    [name, agentType, onCreate]
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
          placeholder="My Agent Session"
          className={cn(
            'w-full px-3 py-2 text-sm rounded-md border',
            'bg-background',
            'focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500',
            error && 'border-red-500'
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

      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}

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
