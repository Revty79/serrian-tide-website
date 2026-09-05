import assert from "node:assert/strict";
import test from "node:test";

import type {
  CharacterMagicSystem,
  CharacterManaProfile,
} from "@/features/characters/character-rules";
import {
  requireActiveManaPool,
  resolveActiveManaView,
  restoreActiveManaPool,
  restoreActiveManaPoolFull,
  restoreAllActiveMana,
  spendActiveManaPool,
  type PersistedActiveManaState,
} from "./active-mana";
import { canMutateActiveHealth, canReadActiveState } from "./authorization";

function profile(
  system: CharacterMagicSystem,
  maximumMana: number,
  sourceSkillName = "Channeling",
): CharacterManaProfile {
  return {
    system,
    sourceSkillName,
    sourceSkillPoints: 10,
    baseMagic: maximumMana / 10,
    manaPool: maximumMana,
    spellAccessLevel: maximumMana >= 32 ? "Master" : maximumMana >= 12 ? "Novice" : "Apprentice",
    nextLevel: maximumMana >= 32 ? "High Master" : "Master",
    nextRequiredMana: maximumMana >= 32 ? 72 : 32,
  };
}

test("missing persisted state means zero spent and Current equals derived Maximum", () => {
  const view = resolveActiveManaView(1, [profile("Spellcraft", 40)], []);
  assert.deepEqual(view.pools[0], {
    system: "Spellcraft",
    maximumMana: 40,
    manaSpent: 0,
    currentMana: 40,
    sourceSkillName: "Channeling",
    sourceSkillPoints: 10,
    baseMagic: 4,
    spellAccessLevel: "Master",
    nextLevel: "High Master",
    nextRequiredMana: 72,
  });
});

test("independent systems merge only their own spent state even with similar source Skills", () => {
  const view = resolveActiveManaView(
    1,
    [profile("Spellcraft", 32), profile("Talismanism", 20), profile("Faith", 12, "Devotion")],
    [
      { system: "Spellcraft", manaSpent: 10 },
      { system: "Talismanism", manaSpent: 3 },
      { system: "Faith", manaSpent: 5 },
    ],
  );
  assert.equal(requireActiveManaPool(view, "Spellcraft").currentMana, 22);
  assert.equal(requireActiveManaPool(view, "Talismanism").currentMana, 17);
  assert.equal(requireActiveManaPool(view, "Faith").currentMana, 7);

  const spentSpellcraft = spendActiveManaPool(requireActiveManaPool(view, "Spellcraft"), 2);
  assert.equal(spentSpellcraft.manaSpent, 12);
  assert.equal(requireActiveManaPool(view, "Talismanism").manaSpent, 3);
  assert.equal(requireActiveManaPool(view, "Faith").manaSpent, 5);
});

test("permanent advancement changes Maximum and Current without rewriting Mana Spent", () => {
  const persisted: PersistedActiveManaState[] = [{ system: "Spellcraft", manaSpent: 12 }];
  const before = requireActiveManaPool(
    resolveActiveManaView(1, [profile("Spellcraft", 40)], persisted),
    "Spellcraft",
  );
  const after = requireActiveManaPool(
    resolveActiveManaView(1, [profile("Spellcraft", 48)], persisted),
    "Spellcraft",
  );
  assert.deepEqual(
    { maximum: before.maximumMana, spent: before.manaSpent, current: before.currentMana },
    { maximum: 40, spent: 12, current: 28 },
  );
  assert.deepEqual(
    { maximum: after.maximumMana, spent: after.manaSpent, current: after.currentMana },
    { maximum: 48, spent: 12, current: 36 },
  );
  assert.deepEqual(persisted, [{ system: "Spellcraft", manaSpent: 12 }]);
});

test("spending increments Mana Spent and may consume exactly all remaining Mana", () => {
  const pool = requireActiveManaPool(
    resolveActiveManaView(1, [profile("Faith", 20)], [{ system: "Faith", manaSpent: 7 }]),
    "Faith",
  );
  const spent = spendActiveManaPool(pool, 5);
  assert.equal(spent.manaSpent, 12);
  assert.equal(spent.currentMana, 8);
  const empty = spendActiveManaPool(spent, 8);
  assert.equal(empty.manaSpent, 20);
  assert.equal(empty.currentMana, 0);
});

test("spending beyond available Mana rejects without mutating the input", () => {
  const pool = requireActiveManaPool(
    resolveActiveManaView(1, [profile("Faith", 20)], [{ system: "Faith", manaSpent: 7 }]),
    "Faith",
  );
  const snapshot = structuredClone(pool);
  assert.throws(() => spendActiveManaPool(pool, 14), /cannot spend/);
  assert.deepEqual(pool, snapshot);
});

test("restore reduces Mana Spent, floors at zero, and Restore Full resets one pool", () => {
  const pool = requireActiveManaPool(
    resolveActiveManaView(1, [profile("Psyonics", 20, "Psionic Channeling")], [{ system: "Psyonics", manaSpent: 7 }]),
    "Psyonics",
  );
  assert.deepEqual(
    { spent: restoreActiveManaPool(pool, 4).manaSpent, current: restoreActiveManaPool(pool, 4).currentMana },
    { spent: 3, current: 17 },
  );
  assert.equal(restoreActiveManaPool(pool, 99).manaSpent, 0);
  assert.deepEqual(
    { spent: restoreActiveManaPoolFull(pool).manaSpent, current: restoreActiveManaPoolFull(pool).currentMana },
    { spent: 0, current: 20 },
  );
});

test("Restore All resets every valid pool and nothing outside the view", () => {
  const view = resolveActiveManaView(
    1,
    [profile("Spellcraft", 20), profile("Faith", 12, "Devotion")],
    [{ system: "Spellcraft", manaSpent: 7 }, { system: "Faith", manaSpent: 4 }],
  );
  const healthSentinel = { totalDamage: 11 };
  const restored = restoreAllActiveMana(view);
  assert.deepEqual(restored.pools.map(({ system, manaSpent, currentMana }) => ({ system, manaSpent, currentMana })), [
    { system: "Spellcraft", manaSpent: 0, currentMana: 20 },
    { system: "Faith", manaSpent: 0, currentMana: 12 },
  ]);
  assert.deepEqual(healthSentinel, { totalDamage: 11 });
});

test("stored spent Mana is preserved when derived Maximum falls and Current never becomes negative", () => {
  const pool = requireActiveManaPool(
    resolveActiveManaView(1, [profile("Spellcraft", 8)], [{ system: "Spellcraft", manaSpent: 12 }]),
    "Spellcraft",
  );
  assert.equal(pool.manaSpent, 12);
  assert.equal(pool.currentMana, 0);
  assert.throws(() => spendActiveManaPool(pool, 1), /cannot spend/);
});

test("Mana mutations require positive finite amounts", () => {
  const pool = requireActiveManaPool(resolveActiveManaView(1, [profile("Faith", 10)], []), "Faith");
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => spendActiveManaPool(pool, invalid), /positive number/);
    assert.throws(() => restoreActiveManaPool(pool, invalid), /positive number/);
  }
  assert.equal(spendActiveManaPool(pool, 0.5).currentMana, 9.5);
});

test("Active Mana mutation stays with Players and the owning G.O.D. while administrators retain read access", () => {
  const pc = {
    playerUserId: "player-one",
    campaignOwnerUserId: "god-one",
    isNpc: false,
    isCampaignMember: true,
  };
  assert.equal(canMutateActiveHealth({ userId: "player-one", roles: ["player"] }, pc), true);
  assert.equal(canMutateActiveHealth({ userId: "player-two", roles: ["player"] }, pc), false);
  assert.equal(canMutateActiveHealth({ userId: "player-one", roles: ["player"] }, { ...pc, isNpc: true }), false);
  assert.equal(canMutateActiveHealth({ userId: "god-one", roles: ["god"] }, pc), true);
  assert.equal(canMutateActiveHealth({ userId: "god-one", roles: ["god"] }, { ...pc, isNpc: true }), true);
  assert.equal(canMutateActiveHealth({ userId: "god-two", roles: ["god"] }, pc), false);
  assert.equal(canMutateActiveHealth({ userId: "admin-one", roles: ["admin"] }, pc), false);
  assert.equal(canMutateActiveHealth({ userId: "admin-one", roles: ["admin"] }, { ...pc, isNpc: true }), false);
  assert.equal(canReadActiveState({ userId: "admin-one", roles: ["admin"] }, pc), true);
  assert.equal(canReadActiveState({ userId: "admin-one", roles: ["admin"] }, { ...pc, isNpc: true }), true);
});

class FakeManaStore {
  private states = new Map<CharacterMagicSystem, number>();
  private queue: Promise<void> = Promise.resolve();

  get(system: CharacterMagicSystem): number | undefined {
    return this.states.get(system);
  }

  async transaction<T>(operation: (working: Map<CharacterMagicSystem, number>) => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.queue;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const working = new Map(this.states);
    try {
      const result = await operation(working);
      this.states = working;
      return result;
    } finally {
      release();
    }
  }
}

async function fakeSpend(
  store: FakeManaStore,
  system: CharacterMagicSystem,
  maximumMana: number,
  amount: number,
  failAfterMutation = false,
) {
  return store.transaction(async (working) => {
    const pool = requireActiveManaPool(
      resolveActiveManaView(1, [profile(system, maximumMana)], working.has(system) ? [{ system, manaSpent: working.get(system)! }] : []),
      system,
    );
    const next = spendActiveManaPool(pool, amount);
    working.set(system, next.manaSpent);
    if (failAfterMutation) throw new Error("later transaction step failed");
    return next;
  });
}

test("serialized first-use concurrency allows only one spend when no row exists", async () => {
  const store = new FakeManaStore();
  const results = await Promise.allSettled([
    fakeSpend(store, "Spellcraft", 10, 6),
    fakeSpend(store, "Spellcraft", 10, 6),
  ]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
  assert.equal(store.get("Spellcraft"), 6);
});

test("a thrown later transaction step rolls back the Mana mutation", async () => {
  const store = new FakeManaStore();
  await assert.rejects(fakeSpend(store, "Faith", 20, 5, true), /later transaction step failed/);
  assert.equal(store.get("Faith"), undefined);
});
