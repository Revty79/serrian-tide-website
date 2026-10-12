import { z } from "zod";
import { historicalTimeSchema } from "./history";
import type { LoreFamily } from "./peoples";
// Two bounded connections between existing Worlds systems, not arbitrary targets.
export const societyFamilies = ["species", "people", "population", "culture", "civilization", "polity", "government", "institution", "organization", "belief", "tradition"] as const;
export function isSocietyFamily(family: string): family is typeof societyFamilies[number] { return (societyFamilies as readonly string[]).includes(family); }
const id = z.string().uuid(), revision = z.number().int().positive();
const account = { label: z.string().trim().min(1).max(160), interpretation: z.string().max(50_000).default(""), perspective: z.string().max(4000).default(""), visibility: z.enum(["ordinary", "protected"]).default("ordinary"), beginning: historicalTimeSchema.nullable().default(null), ending: historicalTimeSchema.nullable().default(null) };
export const linkDraftSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("realm-map"), loreId: id, mapId: id, ...account }).strict(),
  z.object({ kind: z.literal("society-time"), loreId: id, calendarId: id.nullable(), calendarVersionId: id.nullable(), datingSystemId: id.nullable(), adoptionId: id.nullable().default(null), ...account }).strict().superRefine((value, ctx) => {
    if (!!value.calendarId === !!value.datingSystemId) ctx.addIssue({ code: "custom", message: "Choose one calendar tradition or year-counting system." });
    if ((value.calendarVersionId || value.adoptionId) && !value.calendarId) ctx.addIssue({ code: "custom", message: "Rules and adoption sources need their calendar tradition." });
    if (value.adoptionId && (!value.calendarVersionId || value.beginning || value.ending)) ctx.addIssue({ code: "custom", message: "An existing adoption supplies its rules and historical period; keep separate relationship dates empty." });
  }),
]);
export type LinkDraft = z.infer<typeof linkDraftSchema>;
export const linkCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), timelineId: id, id, revision: revision.optional(), draft: linkDraftSchema }).strict(),
  z.object({ action: z.enum(["archive", "restore", "exclude"]), timelineId: id, id, revision }).strict(),
  z.object({ action: z.literal("include"), timelineId: id, id, sourceVersionId: id, sourceRevision: revision, revision: revision.optional() }).strict(),
]);
export type LinkSource = { lore: { id: string; versionId: string; revision: number; name: string; family: LoreFamily }; target: { id: string; name: string; revision: number; visibility?: "ordinary" | "protected"; calendarVersionId?: string; rulesRevision?: number; rulesTitle?: string; epochYear?: number; numbering?: string; beforeLabel?: string; afterLabel?: string } };
export type WorldLink = { id: string; versionId: string; timelineId: string; revision: number; mode: "authored" | "inherited" | "interpretation" | "excluded"; archived: boolean; draft: LinkDraft; source: LinkSource; currentLoreName: string; currentTargetName: string; unavailable: boolean; adoption?: { label: string; revision: number; archived: boolean; period: unknown } };
export type LinkChoice = { id: string; name: string; context: string; revision: number; archived: boolean; versionId?: string; family?: LoreFamily; calendarId?: string };
export type LinkBundle = { worldId: string; timelineId: string; canEdit: boolean; links: WorldLink[]; parentLinks: WorldLink[]; choices: { lore: LinkChoice[]; maps: LinkChoice[]; calendars: LinkChoice[]; versions: LinkChoice[]; dating: LinkChoice[]; adoptions: LinkChoice[] } };
