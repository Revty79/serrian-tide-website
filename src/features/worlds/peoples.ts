import { z } from "zod";
import { historicalTimeSchema, entryDraftSchema, type HistoricalTime, type EntryRecord } from "./history";
import { calendarEntryDraftSchema, type CalendarSource } from "./calendar-dates";
import type { SourceDating } from "./chronology";
import { inheritanceMode } from "./branching-history";

export const loreFamilies = { species: "Races and species", people: "Peoples", origin: "Origin accounts", relationship: "Relationships", culture: "Cultures", civilization: "Civilizations", language: "Languages", population: "Populations and communities", belief: "Beliefs", tradition: "Traditions and practices" } as const;
export type LoreFamily = keyof typeof loreFamilies;
export const LORE_LIMIT = 2000;
const text = z.string().max(50_000).default("");
const id = z.string().uuid();
export const speciesFields = { classification: "Creator classification", form: "Physical form and appearance", biology: "Physiology and biology", propagation: "Reproduction or propagation", development: "Life cycle and development", aging: "Lifespan and aging", adaptations: "Environmental adaptations", habitats: "Habitats and ecology", supernatural: "Supernatural characteristics", traits: "Inherited and acquired traits", variations: "Populations and variations", transformations: "Historical transformations" } as const;
export const peopleFields = { classification: "Creator classification", identity: "Shared identity", heritage: "Heritage and ancestry", distinctions: "Distinct populations and variations", practices: "Ways of life", development: "Historical development" } as const;
export const originFields = { provenance: "Authors and attributed sources", perspective: "Narrative perspective", explanation: "Origin explanation" } as const;
export const relationshipFields = { relationshipType: "Relationship type", interpretation: "Relationship interpretation" } as const;
export const cultureFields = {"identity": "Identity and development", "values": "Values and ideals", "customs": "Customs and ceremonies", "social": "Community and family organization", "arts": "Arts and performance", "knowledge": "Knowledge and education", "extraordinary": "Magic, technology and extraordinary phenomena", "perspectives": "Spiritual and philosophical perspectives", "exchange": "Exchange and influence", "transformations": "Divisions and transformations", "classification": "Creator classification"} as const;
export const civilizationFields = {"foundations": "Foundation accounts and interpretations", "institutions": "Social and cultural institutions", "knowledge": "Knowledge, technology and magic", "achievements": "Arts and achievements", "economy": "Trade and economic practices", "interactions": "Interactions with other civilizations", "transformations": "Divisions, mergers and renewal", "decline": "Decline and disappearance", "classification": "Creator classification"} as const;
export const languageFields = {"method": "Communication method", "representation": "Written or other representation", "origins": "Origins and interpretations", "dialects": "Dialects and variations", "influences": "Influences and adoption", "development": "Historical changes", "revival": "Extinction and revival", "classification": "Creator classification"} as const;
export const populationFields = {"identity": "Community identity", "habitat": "Habitats and adaptations", "estimates": "Population estimates and uncertainty", "demographics": "Demographic descriptions", "development": "Expansion and contraction", "movement": "Movement and migration accounts", "classification": "Creator classification"} as const;
export const beliefFields = {"claims": "Beliefs and claims", "interpretations": "Competing interpretations", "perspective": "Religious or philosophical perspective", "origins": "Origins and development", "expression": "Expression and observance", "classification": "Creator classification"} as const;
export const traditionFields = {"practice": "Practice and observance", "meaning": "Meaning and purposes", "transmission": "Transmission and teaching", "origins": "Origins and development", "variations": "Variations and interpretations", "classification": "Creator classification"} as const;
export const fieldLabels = { species: speciesFields, people: peopleFields, origin: originFields, relationship: relationshipFields, culture: cultureFields, civilization: civilizationFields, language: languageFields, population: populationFields, belief: beliefFields, tradition: traditionFields };
const fieldsSchema = (fields: Record<string, string>) => z.object(Object.fromEntries(Object.keys(fields).map(key => [key, text]))).strict();
export const participantSchema = z.object({ targetId: id.nullable(), authoredReference: z.string().trim().max(1000).default(""), role: z.string().trim().min(1).max(80), account: text }).strict().refine(p => p.targetId ? !p.authoredReference : !!p.authoredReference, "Choose one World record or write one unresolved reference.");
export const geographyAssociationSchema = z.object({ id, geographyId:id, destinationId:id.nullable().default(null), relationshipType:z.string().trim().min(1,"Describe this place relationship.").max(160), account:text, time:historicalTimeSchema.default({version:1,scale:"world-year",kind:"undated"}), protected:z.boolean().default(false) }).strict();
export const loreDraftSchema = z.object({
  family: z.enum(["species", "people", "origin", "relationship", "culture", "civilization", "language", "population", "belief", "tradition"]), name: z.string().trim().min(1, "Name this record.").max(160), description: text,
  fields: z.record(z.string(), z.string().max(50_000)).default({}), time: historicalTimeSchema.default({ version: 1, scale: "world-year", kind: "undated" }),
  accuracy: z.enum(["established", "disputed", "unverified", "disproven"]).default("unverified"), narrative: z.enum(["recorded", "planned"]).default("recorded"),
  visibility: z.enum(["ordinary", "protected"]).default("ordinary"), privateNotes: text,
  datingSystemId: id.nullable().optional(), datingSystemRevision: z.number().int().positive().optional(), calendarDate: calendarEntryDraftSchema.nullable().optional(),
  geographies:z.array(geographyAssociationSchema).max(100).default([]),
  participants: z.array(participantSchema).max(100).default([]), historyRefs: z.array(z.object({ entityId: id, versionId: id }).strict()).max(100).default([]),
  sections: z.array(z.object({ id, title: z.string().trim().min(1).max(160), body: text, protected: z.boolean() }).strict()).max(40).default([]),
  milestones: z.array(z.object({ entryId: id.optional(), revision: z.number().int().positive().optional(), eventType: z.string().trim().min(1).max(160), draft: entryDraftSchema }).strict()).max(40).default([]),
}).strict().superRefine((draft, context) => {
  const result = fieldsSchema(fieldLabels[draft.family]).safeParse(draft.fields);
  if (!result.success) context.addIssue({ code: "custom", path: ["fields"], message: "Use this record's fields or add a custom section." });
  if (draft.family === "origin" && (!draft.description.trim() || !draft.participants.some(p => p.role === "subject" && p.targetId))) context.addIssue({ code: "custom", message: "Write an origin account and choose at least one subject." });
  if (draft.family === "relationship" && (!draft.fields.relationshipType?.trim() || draft.participants.length < 2)) context.addIssue({ code: "custom", message: "Describe the relationship type and at least two participants." });
  if(new Set(draft.geographies.map(g=>g.id)).size!==draft.geographies.length)context.addIssue({code:"custom",path:["geographies"],message:"Keep each geographic association identity once."});
  const entries=draft.milestones.flatMap(m=>m.entryId?[m.entryId]:[]);
  if (new Set(entries).size!==entries.length||draft.milestones.some(m=>!!m.entryId!==!!m.revision)) context.addIssue({code:"custom",path:["milestones"],message:"Keep each saved milestone once, with its current revision."});
  if (new Set(draft.sections.map(s => s.id)).size !== draft.sections.length || new Set(draft.historyRefs.map(s => s.entityId)).size !== draft.historyRefs.length) context.addIssue({ code: "custom", message: "Keep one section key and historical source per identity." });
});
export type LoreDraft = z.infer<typeof loreDraftSchema>;
export type LoreMode = "authored" | "inherited" | "pending" | "excluded" | "interpretation";
export type LoreSummary = { id: string; family: LoreFamily; name: string; revision: number; versionId: string; mode: LoreMode; archived: boolean; time: HistoricalTime; sourceRevision: number | null; parentVersionId: string | null; parentRevision: number | null };
export type LoreRecord = LoreSummary & { draft: LoreDraft; sourceDating: SourceDating | null; calendarSource: CalendarSource | null; authorId: string; createdAt: string; geographies:(LoreDraft["geographies"][number]&{name:string;destinationName:string|null;unavailable:boolean})[]; participants: (LoreDraft["participants"][number] & { name: string; unavailable: boolean })[]; historyNames: { entityId: string; name: string; versionId: string }[]; related: LoreSummary[]; milestoneRecords: (EntryRecord & { eventType: string })[] };
export type LoreList = { records: LoreSummary[]; hasMore: boolean; canEdit: boolean; timelineName: string };
export type LoreReferences = { places:{id:string;name:string;archived:boolean}[]; entities: { id: string; name: string; family: LoreFamily; archived: boolean }[]; history: { entityId: string; versionId: string; name: string; archived: boolean;kind:"entry"|"era" }[]; parent: LoreSummary[] };
export const loreCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), timelineId: id, requestId: id, draft: loreDraftSchema }).strict(),
  z.object({ action: z.literal("save"), timelineId: id, id, revision: z.number().int().positive(), draft: loreDraftSchema }).strict(),
  z.object({ action: z.enum(["archive", "restore"]), timelineId: id, id, revision: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("resolve"), timelineId: id, id, revision: z.number().int().positive(), decision: z.enum(["include", "exclude"]) }).strict(),
  z.object({ action: z.enum(["accept-parent", "adopt-source"]), timelineId: id, id, revision: z.number().int().nonnegative(), parentVersionId: id, parentRevision: z.number().int().positive() }).strict(),
]);
export function loreInheritance(time: HistoricalTime, archived: boolean, narrative: "recorded" | "planned", divergence: number): LoreMode {
  const mode=inheritanceMode("entry", { time, archived, narrative } as Parameters<typeof inheritanceMode>[1], divergence);
  return mode==="partial"?"pending":mode;
}
export function emptyLore(family: LoreFamily): LoreDraft { return { family, name: "", description: "", fields: {}, time: {version:1,scale:"world-year",kind:"undated"}, accuracy:"unverified", narrative:"recorded", visibility:"ordinary", privateNotes:"", geographies:[], participants:[], historyRefs:[], sections:[], milestones:[] }; }
