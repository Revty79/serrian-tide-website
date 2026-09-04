import assert from "node:assert/strict";
import { after, test } from "node:test";

import { count, eq } from "drizzle-orm";

import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import {
  item,
  weaponFiringMode,
  weaponProfile,
  weaponSkillPathMapping,
} from "@/db/item-schema";
import { skill, skillRelationship } from "@/db/skill-schema";
import { campaignSessionRoll } from "@/db/tabletop-operations-schema";
import {
  readWeaponSkillGovernanceInTransaction,
  saveWeaponSkillGovernanceInTransaction,
} from "@/features/items/weapon-skill-governance-service";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for weapon Skill governance PostgreSQL validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing weapon Skill governance tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing weapon Skill governance tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const ROLLBACK = new Error("ROLLBACK_WEAPON_SKILL_GOVERNANCE_TEST");

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

async function insertFixture(tx: Tx, label: string) {
  const suffix = crypto.randomUUID();
  const userId = `weapon-governance-${label}-${suffix}`;
  await tx.insert(user).values({
    id: userId,
    name: "Weapon Governance G.O.D.",
    email: `${userId}@example.invalid`,
    username: userId,
  });
  const [createdItem, otherItem] = await tx.insert(item).values([
    {
      canonicalId: `TEST-WEAPON-${suffix}`.toUpperCase(),
      name: "Exact Identity Handgun",
      catalogScope: "equipment",
      equipmentGroup: "weapon",
      recordType: "Weapon",
      family: "Test",
      category: "Test",
      priceBasis: "per item",
      createdByUserId: userId,
    },
    {
      canonicalId: `TEST-WEAPON-OTHER-${suffix}`.toUpperCase(),
      name: "Other Weapon",
      catalogScope: "equipment",
      equipmentGroup: "weapon",
      recordType: "Weapon",
      family: "Test",
      category: "Test",
      priceBasis: "per item",
      createdByUserId: userId,
    },
  ]).returning({ id: item.id });
  assert.ok(createdItem && otherItem);
  const [profile, otherProfile] = await tx.insert(weaponProfile).values([
    { itemId: createdItem.id, profileRecordType: "Weapon", weaponType: "Authored" },
    { itemId: otherItem.id, profileRecordType: "Weapon", weaponType: "Authored" },
  ]).returning({ id: weaponProfile.id });
  assert.ok(profile && otherProfile);
  const [single, automatic, foreignMode] = await tx.insert(weaponFiringMode).values([
    { weaponProfileId: profile.id, name: "Single", normalizedName: "single", sortOrder: 0, baseCyclingInitiativeCost: 0, baseRecoilResetInitiativeCost: 0, deliveryCadence: "per-trigger", roundsPerCadence: 1 },
    { weaponProfileId: profile.id, name: "Automatic", normalizedName: "automatic", sortOrder: 1, baseCyclingInitiativeCost: 1, baseRecoilResetInitiativeCost: 1, deliveryCadence: "sustained-per-initiative", roundsPerCadence: 5 },
    { weaponProfileId: otherProfile.id, name: "Foreign", normalizedName: "foreign", sortOrder: 0, baseCyclingInitiativeCost: 0, baseRecoilResetInitiativeCost: 0, deliveryCadence: "per-trigger", roundsPerCadence: 1 },
  ]).returning({ id: weaponFiringMode.id });
  assert.ok(single && automatic && foreignMode);
  const createdSkills = await tx.insert(skill).values([
    { name: `Root ${suffix}`, classification: "standard", tier: 9, primaryAttribute: "WIS", createdByUserId: userId },
    { name: `Branch A ${suffix}`, classification: "standard", tier: 2, primaryAttribute: "WIS", createdByUserId: userId },
    { name: `Branch B ${suffix}`, classification: "standard", tier: 7, primaryAttribute: "WIS", createdByUserId: userId },
    { name: `Branch C ${suffix}`, classification: "standard", tier: 1, primaryAttribute: "WIS", createdByUserId: userId },
    { name: "Handgun Mastery Duplicate Name", classification: "standard", tier: 5, primaryAttribute: "WIS", createdByUserId: userId },
    { name: "Handgun Mastery Duplicate Name", classification: "standard", tier: 3, primaryAttribute: "WIS", createdByUserId: userId },
  ]).returning({ id: skill.id });
  assert.equal(createdSkills.length, 6);
  const [root, branchA, branchB, branchC, exactEndpoint, duplicateName] = createdSkills;
  assert.ok(root && branchA && branchB && branchC && exactEndpoint && duplicateName);
  await tx.insert(skillRelationship).values([
    { skillId: branchA.id, relatedSkillId: root.id, relationshipType: "parent", sortOrder: 0 },
    { skillId: branchB.id, relatedSkillId: branchA.id, relationshipType: "parent", sortOrder: 0 },
    { skillId: branchC.id, relatedSkillId: branchB.id, relationshipType: "parent", sortOrder: 0 },
    { skillId: exactEndpoint.id, relatedSkillId: branchC.id, relationshipType: "parent", sortOrder: 0 },
    { skillId: duplicateName.id, relatedSkillId: root.id, relationshipType: "parent", sortOrder: 0 },
  ]);
  return {
    userId,
    itemId: createdItem.id,
    profileId: profile.id,
    singleId: single.id,
    automaticId: automatic.id,
    foreignModeId: foreignMode.id,
    rootId: root.id,
    branchAId: branchA.id,
    branchBId: branchB.id,
    branchCId: branchC.id,
    exactEndpointId: exactEndpoint.id,
    duplicateNameId: duplicateName.id,
  };
}

after(async () => {
  await pool.end();
});

test("existing weapons are missing until exact ordered endpoint mappings are explicitly authored", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertFixture(tx, "exact");
    const initial = await readWeaponSkillGovernanceInTransaction(tx, data.itemId);
    assert.equal(initial?.weaponDefault.status, "missing");
    assert.equal(initial?.modes.every(({ canonicalBehavior }) => canonicalBehavior === "inherits-weapon-default"), true);

    const actor = { userId: data.userId, canAuthorMasterContent: true };
    const saved = await saveWeaponSkillGovernanceInTransaction(tx, actor, data.itemId, [
      { id: null, firingModeId: null, endpointSkillId: data.exactEndpointId, reviewState: "approved", notes: "Most specific normal route." },
      { id: null, firingModeId: null, endpointSkillId: data.duplicateNameId, reviewState: "approved", notes: "A second exact option." },
    ]);
    assert.equal(saved.weaponDefault.status, "approved");
    assert.deepEqual(saved.weaponDefault.options.map(({ endpointSkillId }) => endpointSkillId), [data.exactEndpointId, data.duplicateNameId]);
    assert.deepEqual(saved.weaponDefault.options[0]?.path.rootToEndpoint.map(({ id }) => id), [
      data.rootId,
      data.branchAId,
      data.branchBId,
      data.branchCId,
      data.exactEndpointId,
    ]);
    assert.equal(saved.weaponDefault.options[0]?.path.fallbackAttribute, "WIS");
    assert.equal(saved.weaponDefault.options[0]?.updatedByUserId, data.userId);

    const reversed = await saveWeaponSkillGovernanceInTransaction(tx, actor, data.itemId, [...saved.weaponDefault.options].reverse().map((mapping, index) => ({
      id: mapping.id,
      firingModeId: null,
      endpointSkillId: mapping.endpointSkillId,
      reviewState: index === 0 ? "review-required" as const : "approved" as const,
      notes: index === 0 ? "Returned for another review." : mapping.notes,
    })));
    assert.deepEqual(reversed.weaponDefault.options.map(({ endpointSkillId }) => endpointSkillId), [data.duplicateNameId, data.exactEndpointId]);
    assert.equal(reversed.weaponDefault.status, "review-required");
    assert.equal(reversed.weaponDefault.options[0]?.notes, "Returned for another review.");
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("invalid or ambiguous paths remain review-required and cannot be approved", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertFixture(tx, "ambiguous");
    await tx.insert(skillRelationship).values({
      skillId: data.exactEndpointId,
      relatedSkillId: data.rootId,
      relationshipType: "parent",
      sortOrder: 1,
    });
    const actor = { userId: data.userId, canAuthorMasterContent: true };
    const reviewed = await saveWeaponSkillGovernanceInTransaction(tx, actor, data.itemId, [{
      id: null,
      firingModeId: null,
      endpointSkillId: data.exactEndpointId,
      reviewState: "review-required",
      notes: "Resolve the competing parent relationships.",
    }]);
    assert.equal(reviewed.weaponDefault.status, "invalid");
    assert.equal(reviewed.weaponDefault.problems.some((message) => message.includes("multiple authored parents")), true);
    await assert.rejects(saveWeaponSkillGovernanceInTransaction(tx, actor, data.itemId, reviewed.weaponDefault.options.map((mapping) => ({
      id: mapping.id,
      firingModeId: mapping.firingModeId,
      endpointSkillId: mapping.endpointSkillId,
      reviewState: "approved",
      notes: mapping.notes,
    }))), /cannot be approved.*multiple authored parents/);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("mode-approved paths override while unreviewed modes inherit the weapon default", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertFixture(tx, "modes");
    const actor = { userId: data.userId, canAuthorMasterContent: true };
    const saved = await saveWeaponSkillGovernanceInTransaction(tx, actor, data.itemId, [
      { id: null, firingModeId: null, endpointSkillId: data.exactEndpointId, reviewState: "approved", notes: "Default" },
      { id: null, firingModeId: data.singleId, endpointSkillId: data.duplicateNameId, reviewState: "review-required", notes: "Not yet applicable" },
      { id: null, firingModeId: data.automaticId, endpointSkillId: data.duplicateNameId, reviewState: "approved", notes: "Mode override" },
    ]);
    assert.equal(saved.modes.find(({ id }) => id === data.singleId)?.canonicalBehavior, "inherits-weapon-default");
    assert.deepEqual(saved.modes.find(({ id }) => id === data.singleId)?.applicableApprovedOptions.map(({ endpointSkillId }) => endpointSkillId), [data.exactEndpointId]);
    assert.equal(saved.modes.find(({ id }) => id === data.automaticId)?.canonicalBehavior, "mode-override");
    assert.deepEqual(saved.modes.find(({ id }) => id === data.automaticId)?.applicableApprovedOptions.map(({ endpointSkillId }) => endpointSkillId), [data.duplicateNameId]);
    await assert.rejects(saveWeaponSkillGovernanceInTransaction(tx, actor, data.itemId, [{
      id: null,
      firingModeId: data.foreignModeId,
      endpointSkillId: data.exactEndpointId,
      reviewState: "approved",
      notes: "Wrong profile",
    }]), /does not belong/);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("authorization and governance writes cannot mutate weapon data or create Rolls", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertFixture(tx, "nonautomation");
    const beforeProfile = await tx.select().from(weaponProfile).where(eq(weaponProfile.id, data.profileId));
    const beforeModes = await tx.select().from(weaponFiringMode).where(eq(weaponFiringMode.weaponProfileId, data.profileId));
    const [beforeRollCount] = await tx.select({ value: count() }).from(campaignSessionRoll);
    await assert.rejects(saveWeaponSkillGovernanceInTransaction(tx, {
      userId: data.userId,
      canAuthorMasterContent: false,
    }, data.itemId, []), /G\.O\.D\. master-content/);
    await saveWeaponSkillGovernanceInTransaction(tx, {
      userId: data.userId,
      canAuthorMasterContent: true,
    }, data.itemId, [{
      id: null,
      firingModeId: null,
      endpointSkillId: data.exactEndpointId,
      reviewState: "approved",
      notes: "Canonical eligibility only.",
    }]);
    const afterProfile = await tx.select().from(weaponProfile).where(eq(weaponProfile.id, data.profileId));
    const afterModes = await tx.select().from(weaponFiringMode).where(eq(weaponFiringMode.weaponProfileId, data.profileId));
    const [afterRollCount] = await tx.select({ value: count() }).from(campaignSessionRoll);
    assert.deepEqual(afterProfile, beforeProfile);
    assert.deepEqual(afterModes, beforeModes);
    assert.equal(afterRollCount?.value, beforeRollCount?.value);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("shared Ammunition profiles cannot be authored as weapon governance", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertFixture(tx, "ammunition-scope");
    const [ammunitionItem] = await tx.insert(item).values({
      canonicalId: `TEST-AMMUNITION-${crypto.randomUUID()}`.toUpperCase(),
      name: "Governance-excluded Ammunition",
      catalogScope: "inventory",
      recordType: "Ammunition",
      family: "Test",
      category: "Test",
      priceBasis: "per item",
      createdByUserId: data.userId,
    }).returning({ id: item.id });
    assert.ok(ammunitionItem);
    await tx.insert(weaponProfile).values({
      itemId: ammunitionItem.id,
      profileRecordType: "Ammunition",
      weaponType: "Ammunition",
    });

    assert.equal(await readWeaponSkillGovernanceInTransaction(tx, ammunitionItem.id), null);
    await assert.rejects(saveWeaponSkillGovernanceInTransaction(tx, {
      userId: data.userId,
      canAuthorMasterContent: true,
    }, ammunitionItem.id, [{
      id: null,
      firingModeId: null,
      endpointSkillId: data.exactEndpointId,
      reviewState: "approved",
      notes: "Not a weapon.",
    }]), /Ammunition Profiles do not author/);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("database constraints reject duplicate endpoints, invalid review/order, and cross-weapon modes", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertFixture(tx, "duplicate-db");
    const row = { weaponProfileId: data.profileId, endpointSkillId: data.exactEndpointId, reviewState: "approved", sortOrder: 0, updatedByUserId: data.userId };
    await tx.insert(weaponSkillPathMapping).values(row);
    await tx.insert(weaponSkillPathMapping).values({ ...row, sortOrder: 1 });
  }), databaseErrorMatches(/weapon_skill_path_mappings_default_endpoint_uq/));

  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertFixture(tx, "cross-mode-db");
    await tx.insert(weaponSkillPathMapping).values({ weaponProfileId: data.profileId, firingModeId: data.foreignModeId, endpointSkillId: data.exactEndpointId, reviewState: "approved", sortOrder: 0, updatedByUserId: data.userId });
  }), databaseErrorMatches(/weapon_skill_path_mappings_mode_profile_fk/));

  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertFixture(tx, "review-db");
    await tx.insert(weaponSkillPathMapping).values({ weaponProfileId: data.profileId, endpointSkillId: data.exactEndpointId, reviewState: "guessed", sortOrder: -1, updatedByUserId: data.userId });
  }), databaseErrorMatches(/weapon_skill_path_mappings_(?:review_state|sort_order)_valid/));
});

test("referenced Skill and Firing Mode deletion is restrictive", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertFixture(tx, "skill-delete");
    await tx.insert(weaponSkillPathMapping).values({ weaponProfileId: data.profileId, endpointSkillId: data.exactEndpointId, reviewState: "approved", sortOrder: 0, updatedByUserId: data.userId });
    await tx.delete(skill).where(eq(skill.id, data.exactEndpointId));
  }), databaseErrorMatches(/weapon_skill_path_mappings_endpoint_skill_id_skill_id_fk/));

  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertFixture(tx, "mode-delete");
    await tx.insert(weaponSkillPathMapping).values({ weaponProfileId: data.profileId, firingModeId: data.singleId, endpointSkillId: data.exactEndpointId, reviewState: "approved", sortOrder: 0, updatedByUserId: data.userId });
    await tx.delete(weaponFiringMode).where(eq(weaponFiringMode.id, data.singleId));
  }), databaseErrorMatches(/weapon_skill_path_mappings_mode_profile_fk/));
});
