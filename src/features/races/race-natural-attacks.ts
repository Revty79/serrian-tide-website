import { emptyAttackAuthoring, normalizeAttackAuthoring, normalizeAttackDescription, type AttackAuthoring, type AttackDescription } from "@/features/attacks/attack-authoring";
import { createHumanoidRaceAnatomy, type RaceAnatomy } from "./race-anatomy";

/** References anatomy identities, never display names or a future active Form. */
export type AttackAnatomyRequirement = {
  hpPoolIds: string[];
  hitLocationNumbers: number[];
  notes: string;
};
export type RaceNaturalAttack = AttackDescription & {
  key: string;
  authoring: AttackAuthoring;
  skillId: number | null;
  skillName: string;
  basisNotes: string;
  anatomy: AttackAnatomyRequirement;
  sortOrder: number;
};

export function emptyRaceNaturalAttack(key: string): RaceNaturalAttack {
  return { key, attackName: "", damage: null, damageType: "", notes: "", authoring: emptyAttackAuthoring(),
    skillId: null, skillName: "", basisNotes: "", anatomy: { hpPoolIds: [], hitLocationNumbers: [], notes: "" }, sortOrder: 0 };
}

export function normalizeRaceNaturalAttacks(input: readonly RaceNaturalAttack[], anatomy: RaceAnatomy | null): RaceNaturalAttack[] {
  if (!Array.isArray(input)) throw new Error("Natural Attacks must be an ordered list.");
  const available = anatomy ?? createHumanoidRaceAnatomy();
  const keys = new Set<string>();
  const text = (value: unknown, label: string) => {
    if (typeof value !== "string") throw new Error(`${label} must be text.`);
    return value.trim();
  };
  return input.map((row: RaceNaturalAttack, sortOrder: number) => {
    if (!row || typeof row !== "object") throw new Error("Each Natural Attack needs an authored definition.");
    const key = text(row.key, "Natural Attack identity");
    if (!key || keys.has(key)) throw new Error("Natural Attack identities must be nonblank and unique within the Race.");
    keys.add(key);
    if (row.skillId !== null && (!Number.isSafeInteger(row.skillId) || row.skillId <= 0)) throw new Error("Attack Skill must reference a saved Skill or be Unspecified.");
    const authoring = normalizeAttackAuthoring(row.authoring);
    if (!authoring) throw new Error("Natural Attack mechanics are required.");
    const required = row.anatomy;
    if (!required || !Array.isArray(required.hpPoolIds) || !Array.isArray(required.hitLocationNumbers)) throw new Error("Natural Attack Anatomy requires HP Pool and Hit Location lists.");
    const hpPoolIds = required.hpPoolIds.map(id => text(id, "Required HP Pool identity"));
    if (new Set(hpPoolIds).size !== hpPoolIds.length || hpPoolIds.some(id => !available.hpPools.some(pool => pool.canonicalId === id))) {
      throw new Error(`${row.attackName || "Natural Attack"}: required HP Pools must exist in this Race's Anatomy and cannot repeat.`);
    }
    const hitLocationNumbers = [...required.hitLocationNumbers];
    if (new Set(hitLocationNumbers).size !== hitLocationNumbers.length || hitLocationNumbers.some(number => !Number.isInteger(number) || !available.hitLocations.some(location => location.hitLocationNumber === number))) {
      throw new Error(`${row.attackName || "Natural Attack"}: required Hit Locations must exist in this Race's Anatomy and cannot repeat.`);
    }
    return { ...normalizeAttackDescription(row), key, authoring, skillId: row.skillId, skillName: row.skillName ?? "",
      basisNotes: text(row.basisNotes, "Attack basis notes"), anatomy: { hpPoolIds, hitLocationNumbers, notes: text(required.notes, "Anatomy requirement notes") }, sortOrder };
  });
}
