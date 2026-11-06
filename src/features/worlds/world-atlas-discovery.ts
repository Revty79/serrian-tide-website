import { z } from "zod";
import type { HistoricalTime } from "./history";
import { nativeHistoryScopeSchema, nativeMapTargetSchema, type NativeMapTarget } from "./native-map-history";
import { yearSchema } from "./world-year";

export const worldAtlasSourceSchema=z.object({kind:z.enum(["lore","history"]),id:z.uuid(),versionId:z.uuid(),territory:z.object({id:z.uuid(),relationshipId:z.uuid(),mapVersionId:z.uuid()}).strict().optional()}).strict().refine(value=>!value.territory||value.kind==="lore","Political relationships retain a real World lore identity.");
export type WorldAtlasSource=z.infer<typeof worldAtlasSourceSchema>;
export const worldAtlasSubjectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["lore", "history", "town", "place", "calendar", "chronology", "campaign"]), id: z.uuid(), versionId: z.uuid().optional() }).strict(),
  z.object({ kind: z.literal("shop"), id: z.uuid(), branchId: z.uuid().optional() }).strict(),
  z.object({ kind: z.literal("map"), target: nativeMapTargetSchema, scope: nativeHistoryScopeSchema.optional(), objectId: z.uuid().optional(), source:worldAtlasSourceSchema.optional() }).strict(),
  z.object({ kind: z.literal("world") }).strict(),
]);
export const worldAtlasDiscoverySchema = z.object({ timelineId: z.uuid(), year: yearSchema.optional(), subject: worldAtlasSubjectSchema }).strict();
export type WorldAtlasSubject = z.infer<typeof worldAtlasSubjectSchema>;
export type AssociationCoverage = "established" | "outside" | "unknown" | "current-reference";
export function associationAtYear(time: HistoricalTime | null | undefined, year?: number): AssociationCoverage {
  if (year === undefined) return "current-reference";
  if (!time || time.kind === "undated" || time.kind === "approximate" || time.kind === "window") return "unknown";
  if (time.kind === "known") return time.year === year ? "established" : "outside";
  return time.startYear <= year && time.endYear >= year ? "established" : "outside";
}
/** Missing or uncertain endpoints do not mean that a relationship lasts forever. */
export function associationPeriodAtYear(beginning: HistoricalTime | null, ending: HistoricalTime | null, year?: number): AssociationCoverage {
  if (year === undefined) return "current-reference";
  const start = beginning?.kind === "known" ? beginning.year : undefined;
  const end = ending?.kind === "known" ? ending.year : undefined;
  if (start !== undefined && year < start || end !== undefined && year > end) return "outside";
  return start !== undefined && end !== undefined && start <= end ? "established" : "unknown";
}
export type WorldsRecordLink = {
  id: string; kind: "lore" | "history" | "town" | "place" | "shop" | "calendar" | "chronology" | "campaign";
  name: string; relationship: string; coverage: AssociationCoverage; href: string;
  versionId?: string; associationId?: string; associationVersionId?: string;territoryId?:string;
};
export type AtlasRepresentation = {
  id: string; target: NativeMapTarget; name: string; relationship: string;
  coverage: AssociationCoverage; href: string; objectId?: string;locationName?:string;
  stateId?: string; versionId?: string; point?: { x: number; y: number };
};
export type WorldAtlasDiscovery = {
  worldId: string; timelineId: string; year?: number; sourceName: string;
  records: WorldsRecordLink[]; maps: AtlasRepresentation[]; explanation: string;
};
