import type {
  CharacterMagicSystem,
  CharacterManaProfile,
} from "@/features/characters/character-rules";

export const CHARACTER_MAGIC_SYSTEMS: readonly CharacterMagicSystem[] = [
  "Spellcraft",
  "Talismanism",
  "Faith",
  "Psyonics",
  "Bardic Resonance",
];

export type PersistedActiveManaState = {
  system: CharacterMagicSystem;
  manaSpent: number;
};

export type ActiveManaPool = {
  system: CharacterMagicSystem;
  maximumMana: number;
  manaSpent: number;
  currentMana: number;
  sourceSkillName: string;
  sourceSkillPoints: number;
  baseMagic: number;
  spellAccessLevel: CharacterManaProfile["spellAccessLevel"];
  nextLevel: CharacterManaProfile["nextLevel"];
  nextRequiredMana: number | null;
};

export type ActiveManaView = {
  characterId: number;
  pools: ActiveManaPool[];
};

export function isCharacterMagicSystem(value: unknown): value is CharacterMagicSystem {
  return typeof value === "string" && CHARACTER_MAGIC_SYSTEMS.includes(value as CharacterMagicSystem);
}

function nonNegativeFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or greater.`);
  return value;
}

export function validateManaMutationAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Mana amount must be a positive number.");
  }
  return amount;
}

function resolvePool(
  profile: CharacterManaProfile,
  manaSpentInput: number,
): ActiveManaPool {
  const maximumMana = nonNegativeFinite(profile.manaPool, `${profile.system} Maximum Mana`);
  const manaSpent = nonNegativeFinite(manaSpentInput, `${profile.system} Mana Spent`);
  return {
    system: profile.system,
    maximumMana,
    manaSpent,
    currentMana: Math.max(0, maximumMana - manaSpent),
    sourceSkillName: profile.sourceSkillName,
    sourceSkillPoints: profile.sourceSkillPoints,
    baseMagic: profile.baseMagic,
    spellAccessLevel: profile.spellAccessLevel,
    nextLevel: profile.nextLevel,
    nextRequiredMana: profile.nextRequiredMana,
  };
}

export function resolveActiveManaView(
  characterId: number,
  profiles: readonly CharacterManaProfile[],
  persisted: readonly PersistedActiveManaState[],
): ActiveManaView {
  if (!Number.isInteger(characterId) || characterId <= 0) {
    throw new Error("Active Mana requires a saved Character.");
  }
  const stored = new Map<CharacterMagicSystem, number>();
  for (const row of persisted) {
    if (!isCharacterMagicSystem(row.system)) throw new Error("Persisted Active Mana system is invalid.");
    if (stored.has(row.system)) throw new Error(`Persisted ${row.system} Active Mana state is duplicated.`);
    stored.set(row.system, nonNegativeFinite(row.manaSpent, `${row.system} Mana Spent`));
  }
  const systems = new Set<CharacterMagicSystem>();
  const pools = profiles.map((profile) => {
    if (systems.has(profile.system)) throw new Error(`Derived ${profile.system} Mana profile is duplicated.`);
    systems.add(profile.system);
    return resolvePool(profile, stored.get(profile.system) ?? 0);
  });
  return { characterId, pools };
}

export function requireActiveManaPool(
  view: ActiveManaView,
  system: CharacterMagicSystem,
): ActiveManaPool {
  const pool = view.pools.find((candidate) => candidate.system === system);
  if (!pool) throw new Error(`${system} does not currently resolve to a valid Mana pool for this Character.`);
  return pool;
}

export function spendActiveManaPool(
  pool: ActiveManaPool,
  amountInput: number,
): ActiveManaPool {
  const amount = validateManaMutationAmount(amountInput);
  if (amount > pool.currentMana) {
    throw new Error(
      `${pool.system} has ${pool.currentMana} Current Mana and cannot spend ${amount}.`,
    );
  }
  return {
    ...pool,
    manaSpent: pool.manaSpent + amount,
    currentMana: Math.max(0, pool.currentMana - amount),
  };
}

export function restoreActiveManaPool(
  pool: ActiveManaPool,
  amountInput: number,
): ActiveManaPool {
  const amount = validateManaMutationAmount(amountInput);
  const manaSpent = Math.max(0, pool.manaSpent - amount);
  return {
    ...pool,
    manaSpent,
    currentMana: Math.max(0, pool.maximumMana - manaSpent),
  };
}

export function restoreActiveManaPoolFull(pool: ActiveManaPool): ActiveManaPool {
  return { ...pool, manaSpent: 0, currentMana: pool.maximumMana };
}

export function restoreAllActiveMana(view: ActiveManaView): ActiveManaView {
  return { ...view, pools: view.pools.map(restoreActiveManaPoolFull) };
}
