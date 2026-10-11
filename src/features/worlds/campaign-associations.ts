import { z } from "zod";
import { worldDraftSchema, type WorldDraft } from "./history";
import { yearSchema } from "./world-year";

export const CONTEXT_LIMIT = 2000;
const id = z.string().uuid();
const campaignId = z.number().int().positive().max(2147483647);
const revision = z.number().int().positive();
export const campaignChoiceSchema = z.object({ id: campaignId, updatedAt: z.string().datetime() }).strict();
export const worldCreationSchema = worldDraftSchema.extend({ associatedCampaigns: z.array(campaignChoiceSchema).max(100).default([]) }).refine(value => new Set(value.associatedCampaigns.map(item => item.id)).size === value.associatedCampaigns.length, "Choose each Campaign once.");
export type WorldCreationDraft = WorldDraft & { associatedCampaigns: z.infer<typeof campaignChoiceSchema>[] };
export const associationCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("link"), campaignId, campaignUpdatedAt: z.string().datetime(), timelineId: id, startingYear: yearSchema.nullable().default(null) }).strict(),
  z.object({ action: z.literal("edit"), campaignId, id, revision, startingYear: yearSchema.nullable() }).strict(),
  z.object({ action: z.literal("remove"), campaignId, id, revision, homeRevision: revision, homeOutcome: z.enum(["clear", "replace"]).optional(), replacementId: id.optional() }).strict(),
  z.object({ action: z.literal("restore"), campaignId, id, revision }).strict(),
  z.object({ action: z.literal("home"), campaignId, revision, contextId: id.nullable() }).strict(),
  z.object({ action: z.literal("select"), campaignId, revision: z.number().int().nonnegative(), contextId: id.nullable(), viewingYear: yearSchema.nullable() }).strict(),
]);
export type CampaignChoice = { id: number; name: string; updatedAt: string };
export type CampaignContext = {
  id: string; campaignId: number; campaignName: string; worldId: string; worldName: string;
  timelineId: string; timelineName: string; startingYear: number | null; revision: number;
  removed: boolean; worldArchived: boolean; campaignArchived: boolean; timelineArchived: boolean;
  available: boolean; ownershipAvailable: boolean; home: boolean;
};
export type CampaignHome = { campaignId: number; contextId: string | null; revision: number };
export type AuthoringSelection = { contextId: string | null; viewingYear: number | null; revision: number };
export type AssociationBundle = { contexts: CampaignContext[]; homes: CampaignHome[]; selection: AuthoringSelection; choices: CampaignChoice[]; canManage: boolean };
export function contextUnavailableReason(context: CampaignContext) {
  if (!context.ownershipAvailable) return "Creator ownership is no longer available";
  if (context.removed) return "Association removed; retained for restoration";
  return [context.worldArchived && "World archived", context.campaignArchived && "Campaign archived", context.timelineArchived && "Timeline archived"].filter(Boolean).join(" · ");
}
