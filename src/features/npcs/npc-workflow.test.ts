import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCanManageNpc,
  assertNpcCanBeChanged,
  canManageNpc,
  getDetailedNpcHref,
  getSimpleNpcHref,
  matchesNpcSearch,
  needsNpcUpgrade,
  normalizeCreateNpcValues,
  normalizeSimpleNpcValues,
} from "./npc-workflow";

test("NPC creation validates identity, source, build mode, name, and a separate role label", () => {
  assert.deepEqual(normalizeCreateNpcValues({
    campaignId: 4,
    origin: "race",
    buildMode: "simple",
    sourceId: 12,
    name: "  Mira  ",
    roleLabel: "  Harbor Guide  ",
    personalityDescription: "  Patient and observant.  ",
    notes: "  Knows the tide tunnels.  ",
  }), {
    campaignId: 4,
    origin: "race",
    buildMode: "simple",
    sourceId: 12,
    name: "Mira",
    roleLabel: "Harbor Guide",
    personalityDescription: "Patient and observant.",
    notes: "Knows the tide tunnels.",
  });
  assert.throws(() => normalizeCreateNpcValues({
    campaignId: 4,
    origin: "creature",
    buildMode: "detailed",
    sourceId: 0,
    name: "Mira",
    roleLabel: "Guide",
  }), /NPC Source must identify a saved record/);
  assert.throws(() => normalizeCreateNpcValues({
    campaignId: 4,
    origin: "race",
    buildMode: "simple",
    sourceId: 12,
    name: "Mira",
    roleLabel: "   ",
  }), /NPC Role \/ Label is required/);
});

test("simple NPC saves preserve the explicit campaign and compact editable fields", () => {
  assert.deepEqual(normalizeSimpleNpcValues({
    characterId: 9,
    campaignId: 4,
    name: "  Mira  ",
    roleLabel: "  Harbor Guide  ",
    personalityDescription: "  Calm.  ",
    notes: "  Friendly.  ",
  }), {
    characterId: 9,
    campaignId: 4,
    name: "Mira",
    roleLabel: "Harbor Guide",
    personalityDescription: "Calm.",
    notes: "Friendly.",
  });
});

test("Campaign owner G.O.D. and Admin can manage NPCs while all other roles are rejected", () => {
  assert.equal(canManageNpc({ actorUserId: "owner", campaignOwnerUserId: "owner", roles: ["god"] }), true);
  assert.equal(canManageNpc({ actorUserId: "admin", campaignOwnerUserId: "owner", roles: ["admin"] }), true);
  assert.equal(canManageNpc({ actorUserId: "other", campaignOwnerUserId: "owner", roles: ["god"] }), false);
  assert.equal(canManageNpc({ actorUserId: "owner", campaignOwnerUserId: "owner", roles: ["player"] }), false);
  assert.throws(() => assertCanManageNpc({ actorUserId: "other", campaignOwnerUserId: "owner", roles: ["god"] }), /Campaign creator or an administrator/);
});

test("NPC archive search matches name, role label, or source master", () => {
  const record = { name: "Mira", roleLabel: "Harbor Guide", sourceName: "Coastal Human" };
  assert.equal(matchesNpcSearch(record, "mira"), true);
  assert.equal(matchesNpcSearch(record, "guide"), true);
  assert.equal(matchesNpcSearch(record, "coastal"), true);
  assert.equal(matchesNpcSearch(record, "blacksmith"), false);
});

test("detailed editors retain their established Race and Creature routes", () => {
  assert.equal(getDetailedNpcHref({ campaignId: 4, characterId: 9, origin: "race" }), "/heavens/characters/9?source=npcs&campaign=4");
  assert.equal(getDetailedNpcHref({ campaignId: 4, characterId: 9, origin: "creature" }), "/heavens/npcs/9");
});

test("simple NPC links retain the exact record and active or archived archive", () => {
  assert.equal(
    getSimpleNpcHref({ campaignId: 4, characterId: 9, status: "active" }),
    "/heavens/npcs?campaign=4&status=active&npc=9",
  );
  assert.equal(
    getSimpleNpcHref({ campaignId: 4, characterId: 10, status: "archived" }),
    "/heavens/npcs?campaign=4&status=archived&npc=10",
  );
});

test("upgrade is one-way and archived records remain read-only until restored", () => {
  assert.equal(needsNpcUpgrade("simple"), true);
  assert.equal(needsNpcUpgrade("detailed"), false);
  assert.doesNotThrow(() => assertNpcCanBeChanged({ archivedAt: null, operation: "save" }));
  assert.throws(() => assertNpcCanBeChanged({ archivedAt: new Date(), operation: "upgrade" }), /Restore this NPC/);
});
