// Explicit user-authorized local correction of the two inspected historical plans.
// Default is read-only inspection. --apply uses the same owning-G.O.D. recovery
// service as the backend; it never resets data or directly edits Health values.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "@/db";
import { campaign } from "@/db/campaign-schema";
import { campaignSessionEncounter as encounter, campaignSessionEncounterParticipant as participant,
  campaignSessionEncounterEffectPlan as plan, campaignSessionEncounterEffect as effect,
  campaignSessionEncounterActionDeclaration as declaration, campaignSessionEncounterInitiative as initiative,
  campaignSessionEncounterReward as reward } from "@/db/tabletop-operations-schema";
import { completeRetainedCombatEffectPlanInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";

const url = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) || url.pathname !== "/serrian_tide_dev") throw new Error("This exact historical correction is limited to the inspected ordinary loopback serrian_tide_dev database.");
const apply = process.argv.includes("--apply");
async function main() {
try {
  const result = await db.transaction(async (tx) => {
    if (!apply) await tx.execute("set transaction read only");
    const [context] = await tx.select({ encounterId: encounter.id, campaignId: encounter.campaignId,
      sessionId: encounter.sessionId, sceneId: encounter.sceneId, status: encounter.status, ownerUserId: campaign.createdByUserId })
      .from(encounter).innerJoin(campaign, eq(campaign.id, encounter.campaignId)).where(eq(encounter.id, 2));
    assert.ok(context); assert.equal(context.status, "completed");
    const plans = await tx.select().from(plan).where(and(eq(plan.encounterId, 2), inArray(plan.id, [13, 14]))).orderBy(plan.id);
    const effects = await tx.select().from(effect).where(inArray(effect.planId, [13, 14])).orderBy(effect.id);
    assert.equal(plans.length, 2); assert.equal(effects.length, 2);
    assert.equal(plans[0].declarationId, 13); assert.equal(plans[0].sourceIdentity, "weapon-profile:78;item:ITEM-0001");
    assert.equal(plans[1].declarationId, 15); assert.equal(plans[1].sourceIdentity, "creature-attack:ATK-DOG-BITE");
    assert.equal(effects[0].id, 12); assert.equal(effects[0].targetParticipantId, -4);
    assert.deepEqual(effects[0].finalValueJson, { effect: { kind: "health.damage", amount: 8, application: "localized" }, application: { poolKey: "HP-DOG-HEAD", hitLocationNumber: 0 } });
    assert.equal(effects[1].id, 13); assert.equal(effects[1].status, "declined"); assert.equal(effects[1].appliedAt, null);
    const snapshot = async () => {
      const [dog] = await tx.select().from(participant).where(and(eq(participant.encounterId, 2), eq(participant.characterId, -4)));
      const health = (dog.localStateJson as { health: { totalDamage: number; poolDamage: Record<string, number> } }).health;
      const rows = await tx.select({ id: plan.id, status: plan.status }).from(plan).where(inArray(plan.id, [13, 14])).orderBy(plan.id);
      const declarations = await tx.select({ id: declaration.id, status: declaration.status }).from(declaration).where(inArray(declaration.id, [13, 15])).orderBy(declaration.id);
      const effects = await tx.select({ id: effect.id, status: effect.status, appliedAt: effect.appliedAt, receipt: effect.appliedResultJson }).from(effect).where(inArray(effect.planId, [13, 14])).orderBy(effect.id);
      const runtime = (await tx.select().from(initiative).where(eq(initiative.encounterId, 2)))[0];
      const awards = await tx.select().from(reward).where(eq(reward.encounterId, 2));
      return { dog: { participantId: -4, name: dog.displayLabel, health }, plans: rows, declarations, effects, runtime, awards };
    };
    const before = await snapshot();
    if (!apply) return { mode: "inspection", before };
    if (effects[0].appliedAt === null) assert.deepEqual(before.dog.health, { poolDamage: {}, totalDamage: 0 }, "The inspected target state changed; review before applying the historical correction.");
    const actor = { authority: "god-owner" as const, userId: context.ownerUserId };
    const commands = [
      { planId: 13, reason: "User-authorized local recovery, 8 September 2026: complete the approved 8 damage to Dog 1's head. The later force-end must not erase this completed hit." },
      { planId: 14, reason: "User-authorized local recovery, 8 September 2026: preserve the correctly declined Bite damage and close its stale calculated plan. No damage is to be applied." },
    ];
    const receipts = [];
    for (const command of commands) {
      receipts.push(await completeRetainedCombatEffectPlanInTransaction(tx, 2, actor, command));
      assert.equal((await completeRetainedCombatEffectPlanInTransaction(tx, 2, actor, command)).reused, true);
    }
    const after = await snapshot();
    assert.deepEqual(after.dog.health, { poolDamage: { "HP-DOG-HEAD": 8 }, totalDamage: 8 });
    assert.deepEqual(after.plans, [{ id: 13, status: "applied" }, { id: 14, status: "declined" }]);
    assert.ok(after.declarations.every(({ status }) => status === "resolved"));
    assert.equal(after.effects[1].status, "declined"); assert.equal(after.effects[1].appliedAt, null);
    assert.deepEqual(after.runtime, before.runtime); assert.deepEqual(after.awards, before.awards);
    await publishTabletopInvalidationInTransaction(tx, { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId,
      encounterId: 2, characterIds: [], category: "character-state" });
    return { mode: "applied", database: "serrian_tide_dev", authorization: "Explicit user instruction in this assignment", correctedAt: new Date().toISOString(), before, after, receipts };
  });
  if (result.mode === "applied" && result.receipts?.some(({ reused }) => !reused)) {
    await writeFile("docs/reports/combat-retained-plan-recovery-2026-09-08.json", `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify(result.mode === "inspection" ? result : { mode: result.mode, receipts: result.receipts, health: result.after?.dog.health,
    initiativeUnchanged: true, xpUnchanged: true, report: "docs/reports/combat-retained-plan-recovery-2026-09-08.json" }, null, 2));
} finally { await pool.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
