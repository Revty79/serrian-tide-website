import type { CatalogVisibilityMode } from "./catalog-visibility";

export type CatalogBrowseMode = CatalogVisibilityMode | "all";
export type AdminCatalogBrowse = { all?: boolean; creatorId?: string; sortBy?: "name" | "user" };
export type CatalogCreator = { id: string; label: string };
export const UNATTRIBUTED_CREATOR = "__unattributed__";

export function parseAdminCatalogBrowse(input: unknown): AdminCatalogBrowse {
  if (input === undefined) return {};
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid administrator catalog view.");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !["all", "creatorId", "sortBy"].includes(key))) throw new Error("Unknown administrator catalog option.");
  if (value.all !== undefined && typeof value.all !== "boolean") throw new Error("Invalid All view.");
  if (value.creatorId !== undefined && (typeof value.creatorId !== "string" || value.creatorId.length > 256)) throw new Error("Invalid creator.");
  if (value.sortBy !== undefined && value.sortBy !== "name" && value.sortBy !== "user") throw new Error("Unknown catalog sort order.");
  return { all: value.all as boolean | undefined, creatorId: value.creatorId as string | undefined, sortBy: value.sortBy as AdminCatalogBrowse["sortBy"] };
}
