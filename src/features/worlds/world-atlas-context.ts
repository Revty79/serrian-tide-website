import { z } from "zod";
import { yearSchema } from "./world-year";

/** The selected year is an explicit viewing context, never inferred from a
 * timeline viewport, a calendar label, or a record's uncertain date. */
export type WorldAtlasContext = {
  worldId: string;
  timelineId: string;
  year?: number;
  review: boolean;
  ordinary: boolean;
};
export function worldAtlasYear(query: URLSearchParams) {
  const raw = query.get("atlasYear");
  if (raw === null || !/^-?\d+$/.test(raw)) return undefined;
  const parsed = yearSchema.safeParse(Number(raw));
  return parsed.success ? parsed.data : undefined;
}
export const worldAtlasReturnSchema = z.string().max(12000).refine(value => {
  try {
    const url = new URL(value, "https://world.invalid");
    return url.origin === "https://world.invalid" && /^\/worlds\/[a-f0-9-]{36}$/.test(url.pathname) && !url.hash;
  } catch { return false; }
}, "Choose a saved World workspace destination.");
export function worldContextUrl(context: WorldAtlasContext, query: Record<string, string | undefined> = {}, returnTo?: string) {
  const q = new URLSearchParams({ timeline: context.timelineId, atlasTimeline: context.timelineId, ...Object.fromEntries(Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined)) });
  if (context.year !== undefined) q.set("atlasYear", String(context.year));
  if (context.review) q.set("review", "1");
  if (context.ordinary) q.set("knowledge", "ordinary");
  if (returnTo) {
    const parsed = worldAtlasReturnSchema.safeParse(returnTo);
    if (parsed.success && new URL(parsed.data, "https://world.invalid").pathname === `/worlds/${context.worldId}`) q.set("worldReturn", parsed.data);
  }
  return `/worlds/${context.worldId}?${q}`;
}
export function sameWorldReturn(worldId: string, input: string | null) {
  const parsed = worldAtlasReturnSchema.safeParse(input);
  return parsed.success && new URL(parsed.data, "https://world.invalid").pathname === `/worlds/${worldId}` ? parsed.data : undefined;
}
