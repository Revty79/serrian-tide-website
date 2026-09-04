import assert from "node:assert/strict";
import { after, test } from "node:test";

import { and, count, eq } from "drizzle-orm";

import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { campaignPlayer } from "@/db/campaign-schema";
import {
  item,
  weaponFiringMode,
  weaponProfile,
  weaponSkillPathMapping,
} from "@/db/item-schema";
import {
  campaignCharacter,
  campaignCharacterActiveHealth,
  campaignCharacterAttribute,
  campaignCharacterItem,
  campaignCharacterItemEquipmentState,
  campaignCharacterProfile,
  campaignCharacterSkillAllocation,
  campaignCharacterWeaponOverride,
} from "@/db/realm-schema";
import { skill, skillRelationship } from "@/db/skill-schema";
import {
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterReaction,
  campaignSessionRoll,
} from "@/db/tabletop-operations-schema";
import {
  previewGodCharacterWeaponOneActionInTransaction,
  readGodWeaponGovernanceWorkspaceInTransaction,
  readOverrideIdsForAllocationsInTransaction,
  readPlayerWeaponGovernanceInTransaction,
  recordGodWeaponGovernanceRollInTransaction,
  removeGodCharacterWeaponOverrideInTransaction,
  saveGodCharacterWeaponOverrideInTransaction,
} from "@/features/items/weapon-governance-management-service";
import { saveWeaponSkillGovernanceInTransaction } from "@/features/items/weapon-skill-governance-service";

import { insertBuildTenFixture } from "./tabletop-build-ten-db-fixture";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for weapon governance management validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing weapon governance management tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing weapon governance management tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const ROLLBACK = new Error("ROLLBACK_WEAPON_GOVERNANCE_MANAGEMENT_TEST");
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function addUser(tx: Tx, label: string, roles: Array<"admin" | "god" | "player">): Promise<string> {
  const id = `weapon-management-${label}-${crypto.randomUUID()}`;
  await tx.insert(user).values({
    id,
    name: `Weapon Management ${label}`,
    email: `${id}@example.invalid`,
    username: id,
  });
  if (roles.length) await tx.insert(userRole).values(roles.map((role) => ({ userId: id, role })));
  return id;
}

after(async () => {
  await pool.end();
});

test("guarded management read models, overrides, Player access, and Roll snapshots stay exact and non-automating", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const base = await insertBuildTenFixture(tx, "weapon-management");
    await tx.insert(userRole).values({ userId: base.godId, role: "god" });
    await tx.insert(campaignCharacterAttribute).values([
      { characterId: base.heroId, attributeKey: "DEX", value: 42 },
      { characterId: base.heroId, attributeKey: "STR", value: 35 },
    ]);

    const playerId = await addUser(tx, "player", ["player"]);
    const otherGodId = await addUser(tx, "other-god", ["god"]);
    const adminId = await addUser(tx, "admin", ["admin"]);
    await tx.insert(campaignPlayer).values({ campaignId: base.campaignId, userId: playerId });
    const [playerCharacter] = await tx.insert(campaignCharacter).values({
      campaignId: base.campaignId,
      playerUserId: playerId,
      name: "Exact Assigned Player",
    }).returning({ id: campaignCharacter.id });
    assert.ok(playerCharacter);
    await tx.insert(campaignCharacterProfile).values({ characterId: playerCharacter.id });
    await tx.insert(campaignCharacterAttribute).values({
      characterId: playerCharacter.id,
      attributeKey: "DEX",
      value: 30,
    });

    const [weaponItem, missingItem, foreignWeaponItem] = await tx.insert(item).values([
      {
        canonicalId: `TEST-MANAGED-WEAPON-${crypto.randomUUID()}`.toUpperCase(),
        name: "Managed Service Pistol",
        catalogScope: "equipment",
        equipmentGroup: "weapon",
        recordType: "Weapon",
        family: "Test",
        category: "Test",
        priceBasis: "per item",
        createdByUserId: base.godId,
      },
      {
        canonicalId: `TEST-UNMAPPED-WEAPON-${crypto.randomUUID()}`.toUpperCase(),
        name: "Unmapped Test Weapon",
        catalogScope: "equipment",
        equipmentGroup: "weapon",
        recordType: "Weapon",
        family: "Test",
        category: "Test",
        priceBasis: "per item",
        createdByUserId: base.godId,
      },
      {
        canonicalId: `TEST-FOREIGN-WEAPON-${crypto.randomUUID()}`.toUpperCase(),
        name: "Foreign Test Weapon",
        catalogScope: "equipment",
        equipmentGroup: "weapon",
        recordType: "Weapon",
        family: "Test",
        category: "Test",
        priceBasis: "per item",
        createdByUserId: base.godId,
      },
    ]).returning({ id: item.id });
    assert.ok(weaponItem && missingItem && foreignWeaponItem);
    const [profile, missingProfile, foreignProfile] = await tx.insert(weaponProfile).values([
      { itemId: weaponItem.id, profileRecordType: "Weapon", weaponType: "Handgun" },
      { itemId: missingItem.id, profileRecordType: "Weapon", weaponType: "Unknown" },
      { itemId: foreignWeaponItem.id, profileRecordType: "Weapon", weaponType: "Foreign" },
    ]).returning({ id: weaponProfile.id });
    assert.ok(profile && missingProfile && foreignProfile);
    const [ownMode, inheritedMode, foreignMode] = await tx.insert(weaponFiringMode).values([
      {
        weaponProfileId: profile.id,
        name: "Precision Single",
        normalizedName: "precision single",
        sortOrder: 0,
        baseCyclingInitiativeCost: 0,
        baseRecoilResetInitiativeCost: 0,
        deliveryCadence: "per-trigger",
        roundsPerCadence: 1,
      },
      {
        weaponProfileId: profile.id,
        name: "Inherited Single",
        normalizedName: "inherited single",
        sortOrder: 1,
        baseCyclingInitiativeCost: 0,
        baseRecoilResetInitiativeCost: 0,
        deliveryCadence: "per-trigger",
        roundsPerCadence: 1,
      },
      {
        weaponProfileId: foreignProfile.id,
        name: "Foreign Mode",
        normalizedName: "foreign mode",
        sortOrder: 0,
        baseCyclingInitiativeCost: 0,
        baseRecoilResetInitiativeCost: 0,
        deliveryCadence: "per-trigger",
        roundsPerCadence: 1,
      },
    ]).returning({ id: weaponFiringMode.id });
    assert.ok(ownMode && inheritedMode && foreignMode);

    const [root, endpoint] = await tx.insert(skill).values([
      {
        name: `Precision Ranged ${crypto.randomUUID()}`,
        classification: "standard",
        tier: 1,
        primaryAttribute: "DEX",
        createdByUserId: base.godId,
      },
      {
        name: `Handgun Mastery ${crypto.randomUUID()}`,
        classification: "standard",
        tier: 2,
        primaryAttribute: "DEX",
        createdByUserId: base.godId,
      },
    ]).returning({ id: skill.id });
    assert.ok(root && endpoint);
    await tx.insert(skillRelationship).values({
      skillId: endpoint.id,
      relatedSkillId: root.id,
      relationshipType: "parent",
      sortOrder: 0,
    });
    await saveWeaponSkillGovernanceInTransaction(tx, {
      userId: base.godId,
      canAuthorMasterContent: true,
    }, weaponItem.id, [
      {
        id: null,
        firingModeId: null,
        endpointSkillId: endpoint.id,
        reviewState: "approved",
        notes: "Default exact handgun branch.",
      },
      {
        id: null,
        firingModeId: ownMode.id,
        endpointSkillId: root.id,
        reviewState: "approved",
        notes: "Mode-specific exact root.",
      },
    ]);
    const [rootAllocation] = await tx.insert(campaignCharacterSkillAllocation).values({
      characterId: base.heroId,
      skillId: root.id,
      points: 18,
    }).returning({ id: campaignCharacterSkillAllocation.id });
    assert.ok(rootAllocation);
    const [endpointAllocation] = await tx.insert(campaignCharacterSkillAllocation).values({
      characterId: base.heroId,
      skillId: endpoint.id,
      parentAllocationId: rootAllocation.id,
      points: 7,
    }).returning({ id: campaignCharacterSkillAllocation.id });
    assert.ok(endpointAllocation);
    await tx.insert(campaignCharacterItem).values([
      { characterId: base.heroId, itemId: weaponItem.id, quantity: 3, unitCostCredits: 0 },
      { characterId: base.heroId, itemId: missingItem.id, quantity: 1, unitCostCredits: 0 },
      { characterId: playerCharacter.id, itemId: weaponItem.id, quantity: 1, unitCostCredits: 0 },
    ]);
    await tx.insert(campaignCharacterItemEquipmentState).values({
      characterId: base.heroId,
      itemId: weaponItem.id,
      state: "wielded",
      quantity: 1,
    });

    const ownerActor = { userId: base.godId };
    const scope = {
      campaignId: base.campaignId,
      characterId: base.heroId,
      itemId: weaponItem.id,
      firingModeId: null,
    };
    const normalView = await readGodWeaponGovernanceWorkspaceInTransaction(tx, ownerActor, scope);
    assert.equal(normalView.selectedWeapon?.quantity, 3);
    assert.deepEqual(normalView.selectedWeapon?.equipmentStates, ["wielded 1"]);
    assert.equal(normalView.weapons.filter(({ itemId }) => itemId === weaponItem.id).length, 1);
    assert.deepEqual(
      normalView.detail?.governance.weaponDefault.approvedOptions[0]?.path.rootToEndpoint.map(({ id }) => id),
      [root.id, endpoint.id],
    );
    assert.equal(normalView.detail?.resolution.status, "resolved-normal");
    if (normalView.detail?.resolution.status === "resolved-normal") {
      assert.equal(normalView.detail.resolution.source.kind, "skill");
      if (normalView.detail.resolution.source.kind === "skill") {
        assert.equal(normalView.detail.resolution.source.allocationId, endpointAllocation.id);
      }
    }
    assert.ok(normalView.detail?.governingChoices.some(({ key }) => key === `skill:${rootAllocation.id}`));
    assert.ok(normalView.detail?.governingChoices.some(({ key }) => key === "attribute:DEX"));

    const modeView = await readGodWeaponGovernanceWorkspaceInTransaction(tx, ownerActor, {
      ...scope,
      firingModeId: ownMode.id,
    });
    assert.equal(modeView.detail?.governance.modes.find(({ id }) => id === ownMode.id)?.canonicalBehavior, "mode-override");
    const inheritedView = await readGodWeaponGovernanceWorkspaceInTransaction(tx, ownerActor, {
      ...scope,
      firingModeId: inheritedMode.id,
    });
    assert.equal(inheritedView.detail?.governance.modes.find(({ id }) => id === inheritedMode.id)?.canonicalBehavior, "inherits-weapon-default");
    await assert.rejects(readGodWeaponGovernanceWorkspaceInTransaction(tx, ownerActor, {
      ...scope,
      firingModeId: foreignMode.id,
    }), /does not belong to the selected Weapon Profile/);

    const missingView = await readGodWeaponGovernanceWorkspaceInTransaction(tx, ownerActor, {
      ...scope,
      itemId: missingItem.id,
    });
    assert.equal(missingView.detail?.resolution.status, "needs-god-ruling");
    assert.equal(missingView.detail?.governance.weaponDefault.status, "missing");
    assert.ok(missingView.detail?.governingChoices.some(({ key }) => key === "attribute:DEX"));

    const canonicalCountBefore = (await tx.select({ value: count() }).from(weaponSkillPathMapping))[0]!.value;
    await assert.rejects(saveGodCharacterWeaponOverrideInTransaction(tx, ownerActor, {
      ...scope,
      selection: { kind: "attribute", attributeKey: "DEX" },
      reason: "   ",
    }), /reason must be nonblank/);
    await saveGodCharacterWeaponOverrideInTransaction(tx, ownerActor, {
      ...scope,
      selection: { kind: "skill", allocationId: rootAllocation.id },
      reason: "This Character trains from the parent allocation.",
    });
    let overriddenView = await readGodWeaponGovernanceWorkspaceInTransaction(tx, ownerActor, scope);
    assert.equal(overriddenView.detail?.resolution.status, "resolved-persistent-override");
    assert.equal(overriddenView.persistentOverride?.scopeLabel, "All uses of this weapon");
    assert.match(overriddenView.persistentOverride?.sourceLabel ?? "", new RegExp(`allocation #${rootAllocation.id}`));
    assert.equal((await readOverrideIdsForAllocationsInTransaction(tx, base.heroId, [rootAllocation.id]))[0]?.itemId, weaponItem.id);

    await saveGodCharacterWeaponOverrideInTransaction(tx, ownerActor, {
      ...scope,
      selection: { kind: "attribute", attributeKey: "STR" },
      reason: "Replace the explicit Character source.",
    });
    assert.equal((await tx.select({ value: count() }).from(campaignCharacterWeaponOverride).where(and(
      eq(campaignCharacterWeaponOverride.characterId, base.heroId),
      eq(campaignCharacterWeaponOverride.weaponProfileId, profile.id),
    )))[0]!.value, 1);
    overriddenView = await readGodWeaponGovernanceWorkspaceInTransaction(tx, ownerActor, scope);
    assert.match(overriddenView.persistentOverride?.sourceLabel ?? "", /STR straight Attribute/);
    assert.equal((await tx.select({ value: count() }).from(weaponSkillPathMapping))[0]!.value, canonicalCountBefore);

    await saveGodCharacterWeaponOverrideInTransaction(tx, ownerActor, {
      ...scope,
      firingModeId: ownMode.id,
      selection: { kind: "skill", allocationId: rootAllocation.id },
      reason: "Mode-only exact Skill source.",
    });
    const scopedView = await readGodWeaponGovernanceWorkspaceInTransaction(tx, ownerActor, {
      ...scope,
      firingModeId: ownMode.id,
    });
    assert.equal(scopedView.persistentOverride?.scopeLabel, "Precision Single only");
    await removeGodCharacterWeaponOverrideInTransaction(tx, ownerActor, {
      ...scope,
      firingModeId: ownMode.id,
    });
    await removeGodCharacterWeaponOverrideInTransaction(tx, ownerActor, scope);
    assert.equal((await readGodWeaponGovernanceWorkspaceInTransaction(tx, ownerActor, scope)).detail?.resolution.status, "resolved-normal");

    await saveGodCharacterWeaponOverrideInTransaction(tx, ownerActor, {
      ...scope,
      selection: { kind: "skill", allocationId: rootAllocation.id },
      reason: "Preserve the invalid source for review.",
    });
    await tx.update(campaignCharacterSkillAllocation).set({ points: 0 }).where(eq(
      campaignCharacterSkillAllocation.id,
      rootAllocation.id,
    ));
    const invalidView = await readGodWeaponGovernanceWorkspaceInTransaction(tx, ownerActor, scope);
    assert.equal(invalidView.detail?.resolution.status, "override-invalid");
    assert.equal(invalidView.detail?.resolution.normalResolution.status, "resolved");
    assert.equal(invalidView.persistentOverride?.reason, "Preserve the invalid source for review.");
    await tx.update(campaignCharacterSkillAllocation).set({ points: 18 }).where(eq(
      campaignCharacterSkillAllocation.id,
      rootAllocation.id,
    ));

    const overrideCountBeforeOneAction = (await tx.select({ value: count() }).from(campaignCharacterWeaponOverride))[0]!.value;
    const oneAction = await previewGodCharacterWeaponOneActionInTransaction(tx, ownerActor, {
      ...scope,
      oneActionOverride: {
        kind: "manual",
        label: "Close-range table ruling",
        originalTarget: 37,
        reason: "One unusual action only.",
      },
    });
    assert.equal(oneAction.status, "resolved-one-action-override");
    assert.equal((await tx.select({ value: count() }).from(campaignCharacterWeaponOverride))[0]!.value, overrideCountBeforeOneAction);

    const before = {
      health: await tx.select().from(campaignCharacterActiveHealth).where(eq(campaignCharacterActiveHealth.characterId, base.heroId)),
      initiative: await tx.select().from(campaignSessionEncounterInitiativeParticipant).where(eq(campaignSessionEncounterInitiativeParticipant.encounterId, base.encounterId)),
      action: await tx.select().from(campaignSessionEncounterPendingAction).where(eq(campaignSessionEncounterPendingAction.id, base.pendingActionId)),
      reactions: await tx.select().from(campaignSessionEncounterReaction).where(eq(campaignSessionEncounterReaction.encounterId, base.encounterId)),
      items: await tx.select().from(campaignCharacterItem).where(eq(campaignCharacterItem.characterId, base.heroId)),
    };
    const rollsBefore = (await tx.select({ value: count() }).from(campaignSessionRoll))[0]!.value;
    const governance = {
      ...scope,
      oneActionOverride: {
        kind: "manual" as const,
        label: "Close-range table ruling",
        originalTarget: 37,
        reason: "One unusual action only.",
      },
    };
    const commonRoll = {
      sessionId: base.sessionId,
      sceneId: base.sceneId,
      encounterId: base.encounterId,
      visibility: "god-only" as const,
      purposeKind: "attack" as const,
      label: "Managed Service Pistol - Precision Single",
      governance,
      modifiers: [
        { kind: "bonus" as const, label: "Explicit table bonus", magnitude: 5 },
        { kind: "penalty" as const, label: "Explicit table penalty", magnitude: 2 },
      ],
    };
    const websiteRoll = await recordGodWeaponGovernanceRollInTransaction(tx, base.actor, {
      ...commonRoll,
      method: "random",
      enteredTotal: null,
    });
    const physicalRoll = await recordGodWeaponGovernanceRollInTransaction(tx, base.actor, {
      ...commonRoll,
      method: "entered",
      enteredTotal: 61,
    });
    assert.equal(websiteRoll.mechanicalSnapshot?.governingSource.kind, "manual");
    assert.equal(physicalRoll.mechanicalSnapshot?.governingSource.kind, "manual");
    assert.equal(websiteRoll.mechanicalSnapshot?.resolution.originalTarget, 37);
    assert.equal(websiteRoll.mechanicalSnapshot?.resolution.finalTarget, 34);
    assert.equal(physicalRoll.mechanicalSnapshot?.resolution.finalTarget, 34);
    assert.equal((await tx.select({ value: count() }).from(campaignSessionRoll))[0]!.value, rollsBefore + 2);
    assert.equal((await tx.select({ value: count() }).from(campaignCharacterWeaponOverride))[0]!.value, overrideCountBeforeOneAction);
    assert.deepEqual(await tx.select().from(campaignCharacterActiveHealth).where(eq(campaignCharacterActiveHealth.characterId, base.heroId)), before.health);
    assert.deepEqual(await tx.select().from(campaignSessionEncounterInitiativeParticipant).where(eq(campaignSessionEncounterInitiativeParticipant.encounterId, base.encounterId)), before.initiative);
    assert.deepEqual(await tx.select().from(campaignSessionEncounterPendingAction).where(eq(campaignSessionEncounterPendingAction.id, base.pendingActionId)), before.action);
    assert.deepEqual(await tx.select().from(campaignSessionEncounterReaction).where(eq(campaignSessionEncounterReaction.encounterId, base.encounterId)), before.reactions);
    assert.deepEqual(await tx.select().from(campaignCharacterItem).where(eq(campaignCharacterItem.characterId, base.heroId)), before.items);

    const playerView = await readPlayerWeaponGovernanceInTransaction(tx, { userId: playerId }, playerCharacter.id);
    assert.equal(playerView.weapons.length, 1);
    assert.equal(playerView.weapons[0]?.modes[0]?.resolution.status, "resolved-normal");
    if (playerView.weapons[0]?.modes[0]?.resolution.status === "resolved-normal") {
      assert.equal(playerView.weapons[0].modes[0].resolution.source.kind, "attribute");
      assert.equal(playerView.weapons[0].modes[0].resolution.originalTarget, 70);
    }
    await assert.rejects(readPlayerWeaponGovernanceInTransaction(tx, { userId: playerId }, base.heroId), /own assigned Character/);
    await assert.rejects(readPlayerWeaponGovernanceInTransaction(tx, { userId: playerId }, base.defenderId), /own assigned Character/);
    await assert.rejects(saveGodCharacterWeaponOverrideInTransaction(tx, { userId: playerId }, {
      ...scope,
      selection: { kind: "attribute", attributeKey: "DEX" },
      reason: "Player may not mutate.",
    }), /Campaign-owning G\.O\.D/);
    await assert.rejects(saveGodCharacterWeaponOverrideInTransaction(tx, { userId: otherGodId }, {
      ...scope,
      selection: { kind: "attribute", attributeKey: "DEX" },
      reason: "Unrelated G.O.D. may not mutate.",
    }), /Campaign-owning G\.O\.D/);
    await assert.rejects(saveGodCharacterWeaponOverrideInTransaction(tx, { userId: adminId }, {
      ...scope,
      selection: { kind: "attribute", attributeKey: "DEX" },
      reason: "Administrator role alone may not mutate.",
    }), /Campaign-owning G\.O\.D/);
    await assert.rejects(saveGodCharacterWeaponOverrideInTransaction(tx, ownerActor, {
      ...scope,
      itemId: foreignWeaponItem.id,
      selection: { kind: "attribute", attributeKey: "DEX" },
      reason: "Unowned weapon must fail.",
    }), /does not own/);
    await assert.rejects(saveGodCharacterWeaponOverrideInTransaction(tx, ownerActor, {
      ...scope,
      selection: { kind: "skill", allocationId: endpointAllocation.id + 999_999 },
      reason: "Forged allocation must fail.",
    }), /not a valid exact owned Character source/);

    await tx.delete(campaignCharacterItem).where(and(
      eq(campaignCharacterItem.characterId, base.heroId),
      eq(campaignCharacterItem.itemId, weaponItem.id),
    ));
    const retained = await readGodWeaponGovernanceWorkspaceInTransaction(tx, ownerActor, scope);
    assert.equal(retained.selectedWeapon?.owned, false);
    assert.equal(retained.selectedWeapon?.retainedOverrideOnly, true);
    await assert.rejects(recordGodWeaponGovernanceRollInTransaction(tx, base.actor, {
      ...commonRoll,
      method: "entered",
      enteredTotal: 50,
    }), /does not own/);
    await removeGodCharacterWeaponOverrideInTransaction(tx, ownerActor, scope);

    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});
