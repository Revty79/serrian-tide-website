import { enumerateCanonicalSkillPathAlternatives } from "@/features/skills/recursive-skill-library";
import { resolveCharacterSkillLineageOptions, type CharacterSkillLineageInput } from "@/features/items/character-weapon-governance";
import type { RaceNaturalAttack } from "@/features/races/race-natural-attacks";
import { createHumanoidRaceAnatomy, type RaceAnatomy } from "@/features/races/race-anatomy";

export function raceNaturalAttackRef(raceId: number, key: string): string {
  return `race:${raceId}:attack:${encodeURIComponent(key)}`;
}

export function resolveRaceAttackGovernance(input: CharacterSkillLineageInput, skillId: number | null) {
  const definition = input.skillCatalog.find(skill => skill.id === skillId);
  if (!definition) return { selected: null, alternatives: [], definition: null, explanation: "The intended Skill is missing or unspecified. A G.O.D. governing-source ruling is required." };
  // The graph walker uses exact endpoint/parent IDs; its row ID is only an input
  // adapter, never a Character allocation or an authored path identity.
  const paths = enumerateCanonicalSkillPathAlternatives(definition.id, input.skillCatalog, input.skillRelationships.map((edge, index) => ({ ...edge, id: index })));
  const alternatives = resolveCharacterSkillLineageOptions(input, paths.map((path, index) => ({ id: index + 1, endpointSkillId: definition.id, firingModeId: null, reviewState: "approved" as const, sortOrder: index, notes: "Natural Attack canonical Skill path", path })));
  const resolved = alternatives.filter(alternative => alternative.status === "resolved");
  const identities = new Set(resolved.map(alternative => JSON.stringify(alternative.rollGoverningSource)));
  const selected = resolved.length === alternatives.length && identities.size === 1 ? resolved[0] : null;
  return { selected, alternatives, definition, explanation: selected?.explanation ?? "The canonical Skill paths do not resolve to one exact Character governing source. The G.O.D. must select the exact allocation or Attribute." };
}

/** Checks stable anatomy identities only. Notes never establish a body or condition. */
export function raceAttackAnatomyIssue(attack: RaceNaturalAttack, anatomy: RaceAnatomy | null, disabledPoolKeys: readonly string[]): string | null {
  const body = anatomy ?? createHumanoidRaceAnatomy();
  const missingPools = attack.anatomy.hpPoolIds.filter(id => !body.hpPools.some(pool => pool.canonicalId === id));
  const missingLocations = attack.anatomy.hitLocationNumbers.filter(number => !body.hitLocations.some(location => location.hitLocationNumber === number));
  if (missingPools.length || missingLocations.length) return `Required Normal Race anatomy is missing: ${[...missingPools, ...missingLocations.map(number => `Hit Location ${number}`)].join(", ")}.`;
  const requiredPools = new Set([...attack.anatomy.hpPoolIds, ...body.hitLocations.filter(location => attack.anatomy.hitLocationNumbers.includes(location.hitLocationNumber)).flatMap(location => location.hpPoolCanonicalId ? [location.hpPoolCanonicalId] : [])]);
  const disabled = body.hpPools.filter(pool => requiredPools.has(pool.canonicalId) && disabledPoolKeys.includes(pool.canonicalId));
  return disabled.length ? `Required body part is unavailable under the current injury state: ${disabled.map(pool => pool.poolName).join(", ")}.` : null;
}
