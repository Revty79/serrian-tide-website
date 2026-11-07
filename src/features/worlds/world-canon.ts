import { z } from "zod";
export const worldCanonCommandSchema = z.object({
  requestId: z.string().uuid(), revision: z.number().int().nonnegative().max(2147483646),
  isCanon: z.boolean(), confirm: z.literal(true), note: z.string().trim().min(1).max(2000),
}).strict();
export const personalCanonWorldSchema = z.object({
  requestId: z.string().uuid(), revision: z.number().int().positive(), name: z.string().trim().min(1).max(160),
}).strict();
export type CanonWorldCard = { id: string; name: string; description: string; ownerName: string; revision: number };
export type CanonSource = { worldId: string; name: string; canonRevision: number; worldRevision: number };
