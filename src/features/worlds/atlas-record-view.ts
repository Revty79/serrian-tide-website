import { z } from "zod";
const value = z.number().finite().min(-1e12).max(1e12);
export const atlasRecordViewSchema = z.object({
  binding: z.string().min(1).max(1000),
  kind: z.enum(["terrain", "local"]), x: value, y: value,
  scale: z.number().finite().min(1e-12).max(1e9),
}).strict();
export type AtlasRecordView = z.infer<typeof atlasRecordViewSchema>;
export function atlasRecordViewBinding(url: URL) {
  const q = url.searchParams;
  const target = ["interiorFloor", "undergroundLevel", "craftDeck", "craft", "townMap", "terrainMap"].find(key => q.has(key));
  return target ? [url.pathname, target, q.get(target), q.get("timeline") ?? q.get("atlasTimeline"), q.get("atlasYear") ?? "current", q.get("atlasState") ?? "", q.get("atlasVersion") ?? "", q.get("atlasGeographyVersion") ?? ""].join(":") : "";
}
export function readAtlasRecordView(url: URL, kind: AtlasRecordView["kind"]) {
  try {
    const parsed = atlasRecordViewSchema.safeParse(JSON.parse(url.searchParams.get("atlasView") ?? "null"));
    return parsed.success && parsed.data.kind === kind && parsed.data.binding === atlasRecordViewBinding(url) ? parsed.data : undefined;
  } catch { return undefined; }
}
