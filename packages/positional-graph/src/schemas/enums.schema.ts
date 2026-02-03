import { z } from 'zod';

export const ExecutionSchema = z.enum(['serial', 'parallel']);
export type Execution = z.infer<typeof ExecutionSchema>;

export const TransitionModeSchema = z.enum(['auto', 'manual']);
export type TransitionMode = z.infer<typeof TransitionModeSchema>;
