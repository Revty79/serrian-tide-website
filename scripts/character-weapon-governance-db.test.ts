import assert from "node:assert/strict";
import { after, test } from "node:test";

import { count, eq } from "drizzle-orm";

import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import {
  item,
  weaponFiringMode,
  weaponProfile,
} from "@/db/item-schema";
import {
  campaignCharacter,
  campaignCharacterAttribute,
  campaignCharacterProfile,
  campaignCharacterSkillAllocation,
  campaignCharacterWeaponOverride,
} from "@/db/realm-schema";
import { skill, skillRelationship } from "@/db/skill-schema";
import { campaignSessionRoll } from "@/db/tabletop-operations-schema";
import {
  readApplicableCharacterWeaponOverrideInTransaction,
  removeCharacterWeaponOverrideInTransaction,
  resolveCharacterWeaponGovernanceInTransaction,
  createOrReplaceCharacterWeaponOverrideInTransaction,
} from "@/features/items/character-weapon-governance-service";
import { saveWeaponSkillGovernanceInTransaction } from "@/features/items/weapon-skill-governance-service";
import { recordRollInTransaction } from "@/features/tabletop-operations/roll-runtime-service";

import { insertBuildTenFixture } from "./tabletop-build-ten-db-fixture";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for Character weapon governance validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing Character weapon governance tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing Character weapon governance tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const ROLLBACK = new Error("ROLLBACK_CHARACTER_WEAPON_GOVERNANCE_TEST");

function databaseErrorMatches(pattern: RegExp): (error: unknown) => boolean {
  return (error: unknown) => {
    const messages: string[] = [];
    let current = error;
    while (current instanceof Error) {
      messages.push(current.message);
      current = (current as Error & { cause?: unknown }).cause;
    }
    return pattern.test(messages.join("\n"));
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function addUser(tx: Tx, label: string, roles: Array<"admin" | "god" | "player">) {
  const id = `character-weapon-${label}-${crypto.randomUUID()}`;
  await tx.insert(user).values({
    id,
    name: `Character Weapon ${label}`,
    email: `${id}@example.invalid`,
    username: id,
  });
  if (roles.length) await tx.insert(userRole).values(roles.map((role) => ({ userId: id, role })));
  return id;
}

async function addAssignedCharacter(tx: Tx, campaignId: number, userId: string, name: string) {
  await tx.insert(campaignPlayer).values({ campaignId, userId });
  const [created] = await tx.insert(campaignCharacter).values({
    campaignId,
    playerUserId: userId,
    name,
  }).returning({ id: campaignCharacter.id });
  assert.ok(created);
  await tx.insert(campaignCharacterProfile).values({ characterId: created.id });
  await tx.insert(campaignCharacterAttribute).values({
    characterId: created.id,
    attributeKey: "DEX",
    value: 40,
  });
  return created.id;
}

async function addOverrideConstraintFixture(tx: Tx, label: string) {
  const base = await insertBuildTenFixture(tx, label);
  await tx.insert(campaignCharacterAttribute).values({
    characterId: base.heroId,
    attributeKey: "DEX",
    value: 40,
  });
  const [weaponItem] = await tx.insert(item).values({
    canonicalId: `TEST-OVERRIDE-CONSTRAINT-${crypto.randomUUID()}`.toUpperCase(),
    name: "Override Constraint Weapon",
    catalogScope: "equipment",
    equipmentGroup: "weapon",
    recordType: "Weapon",
    family: "Test",
    category: "Test",
    priceBasis: "per item",
    createdByUserId: base.godId,
  }).returning({ id: item.id });
  assert.ok(weaponItem);
  const [profile] = await tx.insert(weaponProfile).values({
    itemId: weaponItem.id,
    profileRecordType: "Weapon",
    weaponType: "Test",
  }).returning({ id: weaponProfile.id });
  assert.ok(profile);
  return { ...base, itemId: weaponItem.id, profileId: profile.id };
}

after(async () => {
  await pool.end();
});

test("guarded Character weapon overrides enforce scope, precedence, authorization, and Roll compatibility", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const base = await insertBuildTenFixture(tx, "character-weapon-governance");
    await tx.insert(userRole).values({ userId: base.godId, role: "god" });
    await tx.insert(campaignCharacterAttribute).values([
      { characterId: base.heroId, attributeKey: "DEX", value: 50 },
      { characterId: base.heroId, attributeKey: "STR", value: 30 },
      { characterId: base.defenderId, attributeKey: "DEX", value: 45 },
    ]);

    const otherGodId = await addUser(tx, "other-god", ["god"]);
    const playerId = await addUser(tx, "player", ["player"]);
    const adminId = await addUser(tx, "admin", ["admin"]);
    const otherGodCharacterId = await addAssignedCharacter(
      tx,
      base.campaignId,
      otherGodId,
      "Unrelated G.O.D. Character",
    );
    const playerCharacterId = await addAssignedCharacter(
      tx,
      base.campaignId,
      playerId,
      "Player Character",
    );

    const [adminCampaign] = await tx.insert(campaign).values({
      name: "Admin-only Campaign",
      overview: "Authorization fixture",
      attributePoints: 0,
      skillPoints: 0,
      maxStartingSkill: 0,
      pointsToUnlockNextTier: 0,
      maxPointsInSkill: 100,
      startingCreditAmount: 0,
      currencySystem: "Credits",
      fatePointMethod: "Assigned",
      assignedFatePoints: 0,
      createdByUserId: adminId,
    }).returning({ id: campaign.id });
    assert.ok(adminCampaign);
    const adminCharacterId = await addAssignedCharacter(
      tx,
      adminCampaign.id,
      adminId,
      "Administrator Character",
    );

    const [weaponItem] = await tx.insert(item).values({
      canonicalId: `TEST-CHARACTER-WEAPON-${crypto.randomUUID()}`.toUpperCase(),
      name: "Character Governance Handgun",
      catalogScope: "equipment",
      equipmentGroup: "weapon",
      recordType: "Weapon",
      family: "Test",
      category: "Test",
      priceBasis: "per item",
      createdByUserId: base.godId,
    }).returning({ id: item.id });
    assert.ok(weaponItem);
    const [profile] = await tx.insert(weaponProfile).values({
      itemId: weaponItem.id,
      profileRecordType: "Weapon",
      weaponType: "Handgun",
    }).returning({ id: weaponProfile.id });
    assert.ok(profile);
    const [mode] = await tx.insert(weaponFiringMode).values({
      weaponProfileId: profile.id,
      name: "Single",
      normalizedName: "single",
      sortOrder: 0,
      baseCyclingInitiativeCost: 0,
      baseRecoilResetInitiativeCost: 0,
      deliveryCadence: "per-trigger",
      roundsPerCadence: 1,
    }).returning({ id: weaponFiringMode.id });
    assert.ok(mode);
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
    }, weaponItem.id, [{
      id: null,
      firingModeId: null,
      endpointSkillId: endpoint.id,
      reviewState: "approved",
      notes: "Exact handgun branch.",
    }]);
    const [rootAllocation] = await tx.insert(campaignCharacterSkillAllocation).values({
      characterId: base.heroId,
      skillId: root.id,
      points: 20,
    }).returning({ id: campaignCharacterSkillAllocation.id });
    assert.ok(rootAllocation);
    const [endpointAllocation] = await tx.insert(campaignCharacterSkillAllocation).values({
      characterId: base.heroId,
      skillId: endpoint.id,
      parentAllocationId: rootAllocation.id,
      points: 5,
    }).returning({ id: campaignCharacterSkillAllocation.id });
    assert.ok(endpointAllocation);
    const [otherCharacterAllocation] = await tx.insert(campaignCharacterSkillAllocation).values({
      characterId: otherGodCharacterId,
      skillId: root.id,
      points: 10,
    }).returning({ id: campaignCharacterSkillAllocation.id });
    assert.ok(otherCharacterAllocation);

    const actor = { userId: base.godId };
    const scope = {
      campaignId: base.campaignId,
      characterId: base.heroId,
      itemId: weaponItem.id,
      firingModeId: null,
    };
    const [rollsBefore] = await tx.select({ value: count() }).from(campaignSessionRoll);
    const normal = await resolveCharacterWeaponGovernanceInTransaction(tx, actor, scope);
    assert.equal(normal.status, "resolved-normal");
    if (normal.status !== "resolved-normal") throw new Error("Expected normal governance.");
    assert.equal(normal.source.kind, "skill");
    if (normal.source.kind === "skill") assert.equal(normal.source.allocationId, endpointAllocation.id);
    assert.equal(normal.originalTarget, 20);
    const [rollsAfterResolution] = await tx.select({ value: count() }).from(campaignSessionRoll);
    assert.equal(rollsAfterResolution?.value, rollsBefore?.value);

    const wide = await createOrReplaceCharacterWeaponOverrideInTransaction(tx, actor, {
      ...scope,
      selection: { kind: "skill", allocationId: rootAllocation.id },
      reason: "Campaign-specific training ruling.",
    });
    assert.equal(wide.selection.kind, "skill");
    const wideResolved = await resolveCharacterWeaponGovernanceInTransaction(tx, actor, scope);
    assert.equal(wideResolved.status, "resolved-persistent-override");
    if (wideResolved.status !== "resolved-persistent-override") throw new Error("Expected persistent override.");
    assert.equal(wideResolved.source.kind, "skill");
    if (wideResolved.source.kind === "skill") assert.equal(wideResolved.source.allocationId, rootAllocation.id);
    assert.equal(wideResolved.normalResolution.status, "resolved");

    const modeOverride = await createOrReplaceCharacterWeaponOverrideInTransaction(tx, actor, {
      ...scope,
      firingModeId: mode.id,
      selection: { kind: "attribute", attributeKey: "STR" },
      reason: "This firing mode uses straight Strength.",
    });
    const applicableMode = await readApplicableCharacterWeaponOverrideInTransaction(tx, actor, {
      ...scope,
      firingModeId: mode.id,
    });
    assert.equal(applicableMode?.id, modeOverride.id);
    const modeResolved = await resolveCharacterWeaponGovernanceInTransaction(tx, actor, {
      ...scope,
      firingModeId: mode.id,
    });
    assert.equal(modeResolved.status, "resolved-persistent-override");
    if (modeResolved.status === "resolved-persistent-override") {
      assert.equal(modeResolved.source.kind, "attribute");
      assert.equal(modeResolved.originalTarget, 70);
    }

    const oneAction = await resolveCharacterWeaponGovernanceInTransaction(tx, actor, {
      ...scope,
      firingModeId: mode.id,
      oneActionOverride: {
        kind: "manual",
        label: "One action table ruling",
        originalTarget: 37,
        reason: "Unusual circumstances for this declaration.",
      },
    });
    assert.equal(oneAction.status, "resolved-one-action-override");
    assert.equal(oneAction.persistentOverrideId, modeOverride.id);
    const [overrideCount] = await tx.select({ value: count() })
      .from(campaignCharacterWeaponOverride)
      .where(eq(campaignCharacterWeaponOverride.characterId, base.heroId));
    assert.equal(overrideCount?.value, 2);

    assert.equal(await removeCharacterWeaponOverrideInTransaction(tx, actor, {
      ...scope,
      firingModeId: mode.id,
    }), true);
    const inheritedWide = await readApplicableCharacterWeaponOverrideInTransaction(tx, actor, {
      ...scope,
      firingModeId: mode.id,
    });
    assert.equal(inheritedWide?.id, wide.id);
    assert.equal(await removeCharacterWeaponOverrideInTransaction(tx, actor, scope), true);
    assert.equal((await resolveCharacterWeaponGovernanceInTransaction(tx, actor, scope)).status, "resolved-normal");

    const recorded = await recordRollInTransaction(tx, base.actor, {
      sessionId: base.sessionId,
      sceneId: base.sceneId,
      encounterId: base.encounterId,
      rollerCharacterId: base.heroId,
      method: "entered",
      visibility: "private",
      purposeKind: "attack",
      enteredTotal: 61,
      mechanical: { governingSource: normal.rollGoverningSource },
    });
    assert.equal(recorded.mechanicalSnapshot?.governingSource.kind, "skill");
    if (recorded.mechanicalSnapshot?.governingSource.kind === "skill") {
      assert.equal(recorded.mechanicalSnapshot.governingSource.allocationId, endpointAllocation.id);
      assert.deepEqual(
        recorded.mechanicalSnapshot.governingSource.skillPath.map(({ allocationId }) => allocationId),
        [rootAllocation.id, endpointAllocation.id],
      );
      assert.equal(recorded.mechanicalSnapshot.governingSource.calculatedPercentage, normal.originalTarget);
    }

    await createOrReplaceCharacterWeaponOverrideInTransaction(tx, actor, {
      ...scope,
      selection: { kind: "skill", allocationId: rootAllocation.id },
      reason: "Keep the exact root allocation fixed.",
    });
    await tx.update(campaignCharacterSkillAllocation)
      .set({ points: 0 })
      .where(eq(campaignCharacterSkillAllocation.id, rootAllocation.id));
    const invalid = await resolveCharacterWeaponGovernanceInTransaction(tx, actor, scope);
    assert.equal(invalid.status, "override-invalid");
    assert.equal(invalid.normalResolution.status, "resolved");
    await tx.update(campaignCharacterSkillAllocation)
      .set({ points: 20 })
      .where(eq(campaignCharacterSkillAllocation.id, rootAllocation.id));

    await assert.rejects(createOrReplaceCharacterWeaponOverrideInTransaction(tx, actor, {
      ...scope,
      selection: { kind: "skill", allocationId: otherCharacterAllocation.id },
      reason: "Cross-Character allocation.",
    }), /not a valid exact owned Character source/);
    await assert.rejects(createOrReplaceCharacterWeaponOverrideInTransaction(tx, { userId: otherGodId }, {
      ...scope,
      characterId: otherGodCharacterId,
      selection: { kind: "attribute", attributeKey: "DEX" },
      reason: "Unrelated G.O.D. attempt.",
    }), /Campaign-owning G\.O\.D/);
    await assert.rejects(createOrReplaceCharacterWeaponOverrideInTransaction(tx, { userId: playerId }, {
      ...scope,
      characterId: playerCharacterId,
      selection: { kind: "attribute", attributeKey: "DEX" },
      reason: "Player attempt.",
    }), /Campaign-owning G\.O\.D/);
    await assert.rejects(createOrReplaceCharacterWeaponOverrideInTransaction(tx, { userId: adminId }, {
      campaignId: adminCampaign.id,
      characterId: adminCharacterId,
      itemId: weaponItem.id,
      firingModeId: null,
      selection: { kind: "attribute", attributeKey: "DEX" },
      reason: "Administrator-only attempt.",
    }), /Campaign-owning G\.O\.D/);
    await assert.rejects(resolveCharacterWeaponGovernanceInTransaction(tx, actor, {
      ...scope,
      campaignId: adminCampaign.id,
    }), /does not belong/);

    const [creature] = await tx.insert(campaignCharacter).values({
      campaignId: base.campaignId,
      playerUserId: base.godId,
      name: "Manufactured Weapon Creature",
      isNpc: true,
      npcKind: "creature",
      npcBuildMode: "detailed",
    }).returning({ id: campaignCharacter.id });
    assert.ok(creature);
    await tx.insert(campaignCharacterProfile).values({ characterId: creature.id });
    await tx.insert(campaignCharacterAttribute).values({
      characterId: creature.id,
      attributeKey: "STR",
      value: 55,
    });
    const creatureNormal = await resolveCharacterWeaponGovernanceInTransaction(tx, actor, {
      ...scope,
      characterId: creature.id,
    });
    assert.equal(creatureNormal.status, "needs-god-ruling");
    const creatureExplicit = await resolveCharacterWeaponGovernanceInTransaction(tx, actor, {
      ...scope,
      characterId: creature.id,
      oneActionOverride: {
        kind: "attribute",
        attributeKey: "STR",
        reason: "Explicit manufactured-weapon Attribute assignment.",
      },
    });
    assert.equal(creatureExplicit.status, "resolved-one-action-override");

    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("an override blocks deletion from silently redirecting its exact Skill allocation", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const base = await insertBuildTenFixture(tx, "character-weapon-deletion");
    const [weaponItem] = await tx.insert(item).values({
      canonicalId: `TEST-OVERRIDE-DELETE-${crypto.randomUUID()}`.toUpperCase(),
      name: "Deletion-protected Weapon",
      catalogScope: "equipment",
      equipmentGroup: "weapon",
      recordType: "Weapon",
      family: "Test",
      category: "Test",
      priceBasis: "per item",
      createdByUserId: base.godId,
    }).returning({ id: item.id });
    assert.ok(weaponItem);
    const [profile] = await tx.insert(weaponProfile).values({
      itemId: weaponItem.id,
      profileRecordType: "Weapon",
      weaponType: "Test",
    }).returning({ id: weaponProfile.id });
    const [selectedSkill] = await tx.insert(skill).values({
      name: `Deletion Skill ${crypto.randomUUID()}`,
      classification: "standard",
      tier: 1,
      primaryAttribute: "DEX",
      createdByUserId: base.godId,
    }).returning({ id: skill.id });
    assert.ok(profile && selectedSkill);
    const [allocation] = await tx.insert(campaignCharacterSkillAllocation).values({
      characterId: base.heroId,
      skillId: selectedSkill.id,
      points: 10,
    }).returning({ id: campaignCharacterSkillAllocation.id });
    assert.ok(allocation);
    await tx.insert(campaignCharacterWeaponOverride).values({
      campaignId: base.campaignId,
      characterId: base.heroId,
      itemId: weaponItem.id,
      weaponProfileId: profile.id,
      skillAllocationId: allocation.id,
      reason: "Preserve exact identity.",
      updatedByUserId: base.godId,
    });
    await tx.delete(campaignCharacterSkillAllocation)
      .where(eq(campaignCharacterSkillAllocation.id, allocation.id));
  }), databaseErrorMatches(/foreign key|violates/i));
});

test("database constraints reject empty governing sources and duplicate active scopes", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await addOverrideConstraintFixture(tx, "override-empty-source");
    await tx.insert(campaignCharacterWeaponOverride).values({
      campaignId: data.campaignId,
      characterId: data.heroId,
      itemId: data.itemId,
      weaponProfileId: data.profileId,
      reason: "No source must fail.",
      updatedByUserId: data.godId,
    });
  }), databaseErrorMatches(/one_source|check constraint|violates/i));

  await assert.rejects(db.transaction(async (tx) => {
    const data = await addOverrideConstraintFixture(tx, "override-duplicate-scope");
    const values = {
      campaignId: data.campaignId,
      characterId: data.heroId,
      itemId: data.itemId,
      weaponProfileId: data.profileId,
      attributeKey: "DEX" as const,
      reason: "Only one active weapon-wide scope.",
      updatedByUserId: data.godId,
    };
    await tx.insert(campaignCharacterWeaponOverride).values(values);
    await tx.insert(campaignCharacterWeaponOverride).values(values);
  }), databaseErrorMatches(/weapon_scope_uq|unique constraint|duplicate key/i));
});
