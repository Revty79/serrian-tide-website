import "server-only";

import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/db";
import { siteAppearanceSetting } from "@/db/appearance-schema";
import {
  DEFAULT_APPEARANCE,
  parseSiteAppearance,
  type SiteAppearance,
} from "@/features/appearance/appearance";

export const APPEARANCE_CACHE_TAG = "site-appearance";
const SITE_APPEARANCE_KEY = "site";

const loadPersistedAppearance = unstable_cache(
  async (): Promise<SiteAppearance> => {
    const [setting] = await db
      .select({
        presetId: siteAppearanceSetting.presetId,
        pageBackground: siteAppearanceSetting.pageBackground,
        surfaceBackground: siteAppearanceSetting.surfaceBackground,
        primaryAccent: siteAppearanceSetting.primaryAccent,
        secondaryAccent: siteAppearanceSetting.secondaryAccent,
        mainText: siteAppearanceSetting.mainText,
        mutedText: siteAppearanceSetting.mutedText,
      })
      .from(siteAppearanceSetting)
      .where(eq(siteAppearanceSetting.key, SITE_APPEARANCE_KEY))
      .limit(1);
    return setting ? parseSiteAppearance(setting) : DEFAULT_APPEARANCE;
  },
  [SITE_APPEARANCE_KEY],
  { tags: [APPEARANCE_CACHE_TAG] },
);

export async function getPublicSiteAppearance(): Promise<SiteAppearance> {
  try {
    return await loadPersistedAppearance();
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export async function saveSiteAppearance(
  appearance: SiteAppearance,
  administratorUserId: string,
): Promise<SiteAppearance> {
  const validated = parseSiteAppearance(appearance);
  const now = new Date();
  await db
    .insert(siteAppearanceSetting)
    .values({
      key: SITE_APPEARANCE_KEY,
      ...validated,
      updatedByUserId: administratorUserId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: siteAppearanceSetting.key,
      set: {
        ...validated,
        updatedByUserId: administratorUserId,
        updatedAt: now,
      },
    });
  return validated;
}
