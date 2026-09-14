import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { campaignCharacterProfile } from "@/db/realm-schema";
import { campaignSessionEncounter, campaignSessionEncounterInitiative, campaignSessionEncounterPendingAction } from "@/db/tabletop-operations-schema";
import { screenFixture } from "./combat-screens-browser-fixture";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function closeoutAwardsFixture(tx: Tx, label: string) {
  const f = await screenFixture(tx, label);
  await tx.update(campaignSessionEncounter).set({ status: "completed", completedAt: new Date() }).where(eq(campaignSessionEncounter.id, f.encounterId));
  await tx.update(campaignSessionEncounterInitiative).set({ status: "closed", closedAt: new Date() }).where(eq(campaignSessionEncounterInitiative.encounterId, f.encounterId));
  await tx.update(campaignSessionEncounterPendingAction).set({ status: "completed" }).where(eq(campaignSessionEncounterPendingAction.encounterId, f.encounterId));
  await tx.update(campaignCharacterProfile).set({ experience: 10, fame: 2, quintessence: 4, totalExperience: 40, totalQuintessence: 12 }).where(eq(campaignCharacterProfile.characterId, f.heroId));
  return f;
}
