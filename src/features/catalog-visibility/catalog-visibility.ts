export const CATALOG_VISIBILITY_MODES = ["canon", "canon-and-mine", "mine"] as const;
export type CatalogVisibilityMode = (typeof CATALOG_VISIBILITY_MODES)[number];

export const CATALOG_KEYS = ["race", "creature", "skill", "derivedAbility", "equipment", "inventory"] as const;
export type CatalogKey = (typeof CATALOG_KEYS)[number];
export type CatalogPreferences = Record<CatalogKey, CatalogVisibilityMode>;

export function defaultCatalogPreferences(): CatalogPreferences {
  return {
    race: "canon-and-mine", creature: "canon-and-mine", skill: "canon-and-mine",
    derivedAbility: "canon-and-mine", equipment: "canon-and-mine", inventory: "canon-and-mine",
  };
}

export function parseCatalogPreferenceChange(input: unknown): { catalog: CatalogKey; mode: CatalogVisibilityMode } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("A catalog and visibility mode are required.");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => key !== "catalog" && key !== "mode")) throw new Error("Only a catalog and visibility mode may be supplied.");
  if (!CATALOG_KEYS.includes(value.catalog as CatalogKey)) throw new Error("Unknown catalog.");
  if (!CATALOG_VISIBILITY_MODES.includes(value.mode as CatalogVisibilityMode)) throw new Error("Unknown catalog visibility mode.");
  return { catalog: value.catalog as CatalogKey, mode: value.mode as CatalogVisibilityMode };
}

export type CatalogContentSource = { isSystemCanon: boolean; createdByUserId: string | null };

/** Classification is exclusive; promotion preserves creator membership in Mine Only. */
export function classifyCatalogContent(content: CatalogContentSource, currentUserId: string): "canon" | "mine" | "other" {
  if (content.isSystemCanon) return "canon";
  return content.createdByUserId === currentUserId ? "mine" : "other";
}

/** One predicate per record: the union never emits an extra copy of promoted content. */
export function isCatalogContentVisible(content: CatalogContentSource, currentUserId: string, mode: CatalogVisibilityMode): boolean {
  switch (mode) {
    case "canon": return content.isSystemCanon;
    case "mine": return content.createdByUserId === currentUserId;
    case "canon-and-mine": return content.isSystemCanon || content.createdByUserId === currentUserId;
    default: throw new Error("Unknown catalog visibility mode.");
  }
}
