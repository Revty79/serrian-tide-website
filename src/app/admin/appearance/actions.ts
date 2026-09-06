"use server";

import { updateTag } from "next/cache";

import {
  parseSiteAppearance,
  type SiteAppearance,
} from "@/features/appearance/appearance";
import {
  APPEARANCE_CACHE_TAG,
  saveSiteAppearance,
} from "@/features/appearance/appearance-service";
import { requireAdmin } from "@/lib/server-access";

export type SaveAppearanceResult =
  | { ok: true; appearance: SiteAppearance; message: string }
  | { ok: false; message: string };

export async function saveAppearanceAction(input: unknown): Promise<SaveAppearanceResult> {
  try {
    const session = await requireAdmin();
    const appearance = parseSiteAppearance(
      input && typeof input === "object"
        ? input as Record<string, unknown>
        : {},
    );
    const saved = await saveSiteAppearance(appearance, session.user.id);
    updateTag(APPEARANCE_CACHE_TAG);
    return {
      ok: true,
      appearance: saved,
      message: "Site appearance saved. Fresh page loads now use these colors.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The site appearance could not be saved.",
    };
  }
}
