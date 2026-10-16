import type { GeographicShape, GeographicViewport } from "./geographic";
import { shapeTheme } from "./geographic-themes";

export type GeographicLandMask = {
  status: "unavailable" | "loading" | "ready";
  context: string | null;
  /** Existing source paths are in the geographic renderer's 1000 x 600 frame. */
  transform: string;
  parts: { key: string; sourceId: string; versionId: string; part: number; path: string }[];
};

/** A thematic area, political boundary or water polygon is not evidence of land. */
function isLand(shape: GeographicShape) {
  if (shape.geometryType !== "Polygon" && shape.geometryType !== "MultiPolygon") return false;
  if (shape.semantic !== "physical-geography" && shape.semantic !== "authored-geography") return false;
  if (!["land", "authored"].includes(shapeTheme(shape))) return false;
  return shape.style === "land" || shape.style === undefined && shape.semantic === "physical-geography";
}

/**
 * Compose only this authorized viewport's land. Never fetch, cache, infer land
 * from scientific NoData, or change original geometry/stroke data here.
 *
 * Each component remains an independent even-odd fill in the shared SVG mask.
 * Opaque fills union without erasing an earlier source: overlapping sources stay
 * land, holes stay open, and another source may add an island inside a hole.
 * Concatenating every path into one even-odd path would erase overlaps.
 */
export function geographicLandMask(viewport: GeographicViewport | null, ready: boolean): GeographicLandMask {
  const transform = viewport?.layer.surface.reference.kind === "plane"
    ? "scale(2) translate(0 600) scale(1 -1)"
    : "scale(2)";
  if (!viewport) return { status: "unavailable", context: null, transform, parts: [] };
  if (!ready || viewport.nextCursor !== null || viewport.context === "loading") {
    return { status: "loading", context: viewport.context, transform, parts: [] };
  }
  const parts: GeographicLandMask["parts"] = [], seen = new Set<string>();
  for (const shape of viewport.shapes) {
    if (!shape.path || !isLand(shape)) continue;
    const key = `${shape.id}:${shape.versionId}:${shape.part}`;
    if (seen.has(key)) throw new Error("The geographic land view repeats a source component. Retry its authorized layers.");
    seen.add(key);
    parts.push({ key, sourceId: shape.id, versionId: shape.versionId, part: shape.part, path: shape.path });
  }
  return { status: "ready", context: viewport.context, transform, parts };
}
