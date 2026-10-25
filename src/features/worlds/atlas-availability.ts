/** Legacy Atlas stays disabled. The additive /terrain API has its own guards. */
export const atlasUnavailableMessage = "Map making is unavailable in Worlds.";

const atlasQueryKeys = [
  "atlas", "place", "map", "mapId", "mapYear", "editMap", "editSource",
  "geography", "geographicMap", "mapState",
] as const;

export function isMapOnlyWorldsApi(pathname: string): boolean {
  // Next resolves encoded static route segments; use the same decoded path.
  try { pathname=decodeURIComponent(pathname); } catch { return false; }
  return /^\/api\/worlds\/[^/]+\/(?:atlas(?:\/.*)?|geography(?:\/.*)?|elevation\/?|land-cover\/?)$/.test(pathname);
}

/** Preserve timeline, privacy/review context and unrelated information-workspace choices. */
export function normalizeWorldsQuery(params: URLSearchParams): URLSearchParams {
  const normalized = new URLSearchParams(params);
  for (const key of atlasQueryKeys) normalized.delete(key);
  if (["geography", "maps", "map"].includes(normalized.get("tab") ?? "") || (normalized.get("tab") === "atlas" && params.has("atlas"))) normalized.set("tab", "overview");
  return normalized;
}
