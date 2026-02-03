import { z } from 'zod';

// --- Property bags (open, extensible) ---

export const GraphPropertiesSchema = z.object({}).catchall(z.unknown());
export type GraphProperties = z.infer<typeof GraphPropertiesSchema>;

export const LinePropertiesSchema = z.object({}).catchall(z.unknown());
export type LineProperties = z.infer<typeof LinePropertiesSchema>;

export const NodePropertiesSchema = z.object({}).catchall(z.unknown());
export type NodeProperties = z.infer<typeof NodePropertiesSchema>;
