import { z } from "zod";

export const worldScopes = ["overview", "history", "timekeeping", "peoples", "individuals", "politics", "organizations", "cosmology", "stories", "settlements", "atlas", "interiors", "underground", "craft", "appearances", "assets", "campaigns"] as const;
export type WorldScope = typeof worldScopes[number];
export type WorldOperationScope = WorldScope | "shell" | "owner";
export const worldScopeLabels: Record<WorldScope, string> = {
  overview: "Overview and basic information", history: "History, eras and timelines", timekeeping: "Calendars and Chronology",
  peoples: "Peoples and societies", individuals: "Individuals", politics: "Politics", organizations: "Organizations", cosmology: "Cosmology and Realms", stories: "Lore, Stories and Legends",
  settlements: "Towns, Shops and Places", atlas: "World and Regional Atlas", interiors: "Building interiors", underground: "Underground maps", craft: "Craft and decks", appearances: "Historical map appearances", assets: "Shared private artwork", campaigns: "Campaign associations (owner-managed links)",
};
export const worldScopesSchema = z.array(z.enum(worldScopes)).min(1).max(worldScopes.length).transform(values => worldScopes.filter(scope => values.includes(scope))).refine(values => !values.includes("appearances") || values.includes("history"), "Historical map appearances also require History, eras and timelines.");
export type WorldPermission = {
  canon?: boolean;
  canonRevision?: number;
  actorId: string;
  role: "owner" | "editor" | "viewer" | "administrator-review";
  scopes: WorldScope[];
  protectedContent: boolean;
  canEdit: boolean;
  canCreateWorld: boolean;
  grantRevision: number | null;
};
export function hasWorldScope(permission: WorldPermission, scope: WorldOperationScope): boolean {
  if (scope === "shell") return true;
  if (scope === "owner") return permission.role === "owner";
  return permission.scopes.includes(scope);
}
export function loreWorldScope(family: string): WorldScope {
  if (family === "individual") return "individuals";
  if (family === "story") return "stories";
  if (["polity", "government", "institution", "office", "appointment", "claim", "agreement", "conflict"].includes(family)) return "politics";
  if (["organization", "organizationRole", "membership", "assignment", "network"].includes(family)) return "organizations";
  if (["cosmicFramework", "realm", "celestial", "cosmicPrinciple", "cosmicConnection", "skyCycle", "skyObservation", "skyCalendarLink"].includes(family)) return "cosmology";
  if (["species", "people", "origin", "relationship", "culture", "civilization", "language", "population", "belief", "tradition"].includes(family)) return "peoples";
  throw new Error("This World record family has no reviewed permission scope.");
}
export function nativeWorldScope(kind: string): WorldScope {
  if (kind === "town") return "settlements";
  if (kind === "floor") return "interiors";
  if (kind === "underground") return "underground";
  if (kind === "craft" || kind === "deck" || kind === "craft-deck") return "craft";
  if (kind === "terrain") return "atlas";
  throw new Error("This native map family has no reviewed permission scope.");
}
export type WorldEditorProof = { clientId: string; token: string; fence?: number };
export const worldEditorProofSchema = z.object({ clientId: z.string().uuid(), token: z.string().regex(/^[a-f0-9]{64}$/), fence: z.number().int().nonnegative().safe().optional() }).strict();
export const WORLD_LEASE_SECONDS = 120;
export const WORLD_PARTICIPANT_LIMIT = 200;
export const WORLD_PENDING_INVITATION_LIMIT = 100;

