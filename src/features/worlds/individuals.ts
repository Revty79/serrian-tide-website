import { z } from "zod";
import { historicalTimeSchema } from "./history";

export const individualFieldGroups = {
  "Identity and public perception": { aliases: "Alternate names and aliases", titles: "Titles and honorifics", identity: "Identity and self-description", classification: "Creator classification", reputation: "Reputation and public perception" },
  "Existence and physical nature": { form: "Physical form and appearance", existence: "Nature of existence", distinctions: "Distinguishing characteristics", transformations: "Transformations and variations", aging: "Aging or immortality" },
  "Personality and behavior": { personality: "Personality", values: "Values and ideals", beliefs: "Beliefs and philosophies", motivations: "Motivations and ambitions", goals: "Goals", fears: "Fears", habits: "Habits and quirks", strengths: "Strengths", weaknesses: "Weaknesses" },
  "Knowledge and development": { education: "Education and training", experience: "Experience", communication: "Languages and communication", discoveries: "Knowledge and discoveries", talents: "Talents and accomplishments", skills: "Narrative skills" },
  "Social identity": { affiliations: "Cultural affiliations", citizenship: "Citizenship and homeland", occupations: "Occupations and social roles", community: "Community relationships", privateReputation: "Private reputation and secrets" },
  "Personal history": { origins: "Origins", development: "Early development", experiences: "Significant experiences", achievements: "Achievements", failures: "Failures", returns: "Disappearances and returns", accounts: "Conflicting biographical accounts" },
} as const;
export const individualFields: Record<string, string> = Object.assign({}, ...Object.values(individualFieldGroups));
export const individualMilestoneTypes = ["birth", "creation", "manifestation", "transformation", "discovery", "meeting", "partnership", "appointment", "achievement", "defeat", "departure", "migration", "disappearance", "death", "return", "reincarnation"];
const id = z.string().uuid();
const account = z.string().max(50_000).default("");
export const nameAccountSchema = z.object({
  id, name: z.string().trim().min(1, "Name this historical name account.").max(160),
  kind: z.string().trim().min(1).max(80).default("name"), meaning: account, perspective: account,
  time: historicalTimeSchema, protected: z.boolean().default(false),
}).strict();
export const relationshipPeriodSchema = z.object({
  id, label: z.string().trim().min(1, "Describe this relationship period.").max(160),
  status: z.enum(["ongoing", "ended", "unknown", "disputed"]), account, perspective: account,
  beginning: historicalTimeSchema.nullable(), ending: historicalTimeSchema.nullable(), protected: z.boolean().default(false),
}).strict();
export const relationshipStatusLabels = { ongoing: "Ongoing in this account", ended: "Historically ended", unknown: "Unknown status", disputed: "Disputed" } as const;
