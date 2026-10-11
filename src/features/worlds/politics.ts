import { z } from "zod";
import { historicalTimeSchema } from "./history";

export const politicalFamilies = {
  polity: "Polities", government: "Governments", institution: "Governing institutions",
  office: "Political offices", appointment: "Office appointments", claim: "Territorial claims",
  agreement: "Diplomatic agreements", conflict: "Political conflicts",
} as const;
export const politicalFields = {
  polity: { aliases: "Alternate names", classification: "Creator classification", foundations: "Founding accounts", legitimacy: "Legitimacy and sovereignty", identity: "Political identity", development: "Continuity, replacement and dissolution" },
  government: { aliases: "Alternate names", classification: "Creator classification", foundations: "Founding accounts", legitimacy: "Legitimacy and contested authority", philosophy: "Governing philosophy", authority: "Claimed authority", laws: "Laws, legal traditions and charters", decisions: "Collective decision-making", selection: "Leadership selection and elections", succession: "Succession, removal and replacement", reform: "Reforms, disputes and corruption", influences: "Religious and ideological influences", revenue: "Revenue, taxation and public obligations", economy: "Economic policies and trade administration", infrastructure: "Infrastructure and public services", military: "Military organization", communities: "Relations with communities" },
  institution: { classification: "Creator classification", purpose: "Purpose and responsibilities", powers: "Powers and authority", structure: "Internal structure", administration: "Administration and divisions", development: "Historical development" },
  office: { classification: "Creator classification", responsibilities: "Responsibilities", authority: "Powers and authority", qualifications: "Qualifications", selection: "Selection and succession", vacancies: "Vacancies and shared authority", development: "Historical development" },
  appointment: { classification: "Creator classification", status: "Authored appointment status", selection: "Appointment or selection account", authority: "Claimed authority", succession: "Predecessors, removal and succession", evidence: "Evidence and provenance", interpretation: "Contested interpretation" },
  claim: { classification: "Creator classification", jurisdiction: "Claim, control or jurisdiction", status: "Authored claim status", authority: "Claimed authority", evidence: "Evidence and provenance", interpretation: "Competing interpretations", administration: "Actual administration and shared control" },
  agreement: { aliases: "Alternate names", classification: "Creator classification", terms: "Terms and clauses", obligations: "Authored obligations", status: "Ratification, activation and disputed status", amendments: "Amendments, violations, suspension and renewal", interpretations: "Different interpretations", provenance: "Evidence and provenance" },
  conflict: { classification: "Creator classification", causes: "Causes and claimed justifications", coalitions: "Coalitions and changing allegiances", theaters: "Narrative campaigns and theaters", leadership: "Leadership accounts", developments: "Major developments", territory: "Territorial consequences", consequences: "Humanitarian and cultural consequences", settlement: "Settlements and related agreements", outcome: "Outcomes and competing interpretations" },
} as const;
// These sources describe connections. Withhold the whole narrative if a saved
// connection would disclose a protected or unavailable participant/place.
export const politicalRelationshipFamilies = ["appointment", "claim", "agreement", "conflict"] as const;
export const politicalMilestoneTypes = ["founding", "appointment", "coronation", "election", "coup", "succession", "reform", "replacement", "partition", "unification", "ratification", "renewal", "conflict begins", "peace settlement", "collapse", "restoration"];
export const authoredPeriodSchema = z.object({
  id: z.string().uuid(), label: z.string().trim().min(1).max(160),
  status: z.string().trim().min(1).max(160), account: z.string().max(50_000).default(""),
  perspective: z.string().max(50_000).default(""), protected: z.boolean().default(false),
  beginning: historicalTimeSchema.nullable().default(null), ending: historicalTimeSchema.nullable().default(null),
}).strict();
export function isPoliticalFamily(family: string): family is keyof typeof politicalFamilies { return family in politicalFamilies; }
