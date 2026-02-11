import { z } from 'zod';

/**
 * Who raised the event.
 *
 * - agent: An LLM agent interacting via CLI during execution
 * - executor: A code unit executor or non-agent automation
 * - orchestrator: The orchestration system (ODS, ONBAS)
 * - human: A human interacting via CLI or UI
 */
export const EventSourceSchema = z.enum(['agent', 'executor', 'orchestrator', 'human']);
export type EventSource = z.infer<typeof EventSourceSchema>;
