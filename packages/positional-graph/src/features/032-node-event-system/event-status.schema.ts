import { z } from 'zod';

/**
 * Event lifecycle state.
 *
 * - new: Just raised, nobody has seen it yet
 * - acknowledged: System has read it and is aware of it
 * - handled: Action has been taken
 */
export const EventStatusSchema = z.enum(['new', 'acknowledged', 'handled']);
export type EventStatus = z.infer<typeof EventStatusSchema>;
