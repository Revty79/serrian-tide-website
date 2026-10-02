import type { CampaignSystem } from "@/db/campaign-schema";
import type { RecursiveSkillLibrary, CanonicalSkillDefinition } from "@/features/skills/recursive-skill-library";

export type CampaignSkillExclusion = { skillId: number; pathKey: string };
export type CampaignSkillAccess = { allowed: boolean; reason: string | null; blockedPathKey: string | null; kind: "allowed" | "system" | "exclusion" | "invalid" };

/** Exact canonical names, shared with Character rules. Never infer systems from substrings. */
export function getNamedSupernaturalSkillSystems(name: string): CampaignSystem[] | null {
  switch (name.trim().toLowerCase()) {
    case "spellcraft": return ["Spellcraft"];
    case "talismanism": return ["Talismanism"];
    case "faith": case "prayer": case "devotion": return ["Faith"];
    case "psionic focus": case "psionic meditation": case "psionic channeling": return ["Psyonics"];
    case "resonant performance": case "resonance attunement": case "harmonic awareness": return ["Bardic Resonance"];
    case "channeling": case "meditation": return ["Spellcraft", "Talismanism"];
    default: return null;
  }
}

export function getSkillRootSystems(skill: Pick<CanonicalSkillDefinition, "name" | "classification">): CampaignSystem[] | null {
  const named = getNamedSupernaturalSkillSystems(skill.name);
  if (named) return named;
  const classification = skill.classification.trim().toLowerCase();
  if (classification === "standard") return [];
  if (classification === "special ability" || classification === "special abilities") return ["Special Abilities"];
  return null;
}

export function skillSystemsAllow(skill: Pick<CanonicalSkillDefinition, "name" | "classification" | "tier">, root: Pick<CanonicalSkillDefinition, "name" | "classification">, systems: readonly CampaignSystem[], enforceTiers = true): boolean {
  const rootSystems = getSkillRootSystems(root);
  if (rootSystems === null || (rootSystems.length && !rootSystems.some(system => systems.includes(system)))) return false;
  const ownSystems = getNamedSupernaturalSkillSystems(skill.name);
  if (ownSystems && !ownSystems.some(system => systems.includes(system))) return false;
  if (["special ability", "special abilities"].includes(skill.classification.trim().toLowerCase()) && !systems.includes("Special Abilities")) return false;
  const supernaturalDescendant = skill.tier !== null && skill.tier > 1 && rootSystems.some(system => system !== "Special Abilities");
  // The Campaign enum configures only authored Tiers 1-3. It is not a depth cap.
  if (enforceTiers && !supernaturalDescendant && skill.tier !== null && skill.tier >= 1 && skill.tier <= 3 && !systems.includes(`Tier ${skill.tier}` as CampaignSystem)) return false;
  return true;
}

export function createCampaignSkillAccess(library: RecursiveSkillLibrary, systems: readonly CampaignSystem[], exclusions: readonly CampaignSkillExclusion[] = []) {
  const paths = new Map(library.paths.map(path => [path.key, path]));
  const nodes = new Map(library.skills.map(node => [node.id, node]));
  const excluded = new Set(exclusions.map(row => row.pathKey));
  const resolve = (idsOrKey: readonly number[] | string): CampaignSkillAccess => {
    const key = typeof idsOrKey === "string" ? idsOrKey : idsOrKey.join(">");
    const path = paths.get(key);
    const invalid = (): CampaignSkillAccess => ({ allowed: false, reason: "The Skill path is missing, cyclic, or no longer matches the Skill library.", blockedPathKey: key, kind: "invalid" });
    if (!path || new Set(path.rootToEndpointIds).size !== path.rootToEndpointIds.length) return invalid();
    if (path.reviewReasons.some(reason => ["cycle", "broken-parent", "broken-child", "duplicate-skill-identity"].includes(reason.code))) return invalid();
    const root = nodes.get(path.rootSkillId);
    if (!root || root.parentIds.length || root.tier === 2 || root.tier === 3) return invalid();
    for (const id of path.rootToEndpointIds) {
      const node = nodes.get(id);
      if (!node) return invalid();
      // Tier permissions are starting-allocation limits, applied by Character creation
      // after path access. They must not disable exclusion editing or later advancement.
      if (!skillSystemsAllow(node, root, systems, false)) return { allowed: false, reason: `Campaign systems do not allow ${node.name} through ${root.name}.`, blockedPathKey: null, kind: "system" };
    }
    for (let length = 1; length <= path.rootToEndpointIds.length; length++) {
      const prefix = path.rootToEndpointIds.slice(0, length).join(">");
      if (excluded.has(prefix)) return { allowed: false, reason: `Excluded by ${nodes.get(path.rootToEndpointIds[length - 1]!)!.name} on this branch.`, blockedPathKey: prefix, kind: "exclusion" };
    }
    return { allowed: true, reason: null, blockedPathKey: null, kind: "allowed" };
  };
  return { resolve, pathsForSkill: (skillId: number) => library.paths.filter(path => path.endpointSkillId === skillId),
    canGrant: (skillId: number) => library.paths.some(path => path.endpointSkillId === skillId && resolve(path.key).allowed) };
}

export function validateCampaignSkillExclusions(library: RecursiveSkillLibrary, input: readonly CampaignSkillExclusion[]): CampaignSkillExclusion[] {
  if (!Array.isArray(input)) throw new Error("Campaign Skill exclusions must be a list of exact paths.");
  const paths = new Map(library.paths.map(path => [path.key, path]));
  const seen = new Set<string>();
  return input.map(row => {
    const path = row ? paths.get(row.pathKey) : undefined;
    if (!path || path.reviewReasons.some(reason => ["cycle", "broken-parent", "broken-child", "duplicate-skill-identity"].includes(reason.code)) || path.endpointSkillId !== row.skillId || seen.has(row.pathKey)) throw new Error("A Campaign Skill exclusion is invalid, duplicated, or no longer matches the Skill library. Reload Campaign settings.");
    seen.add(row.pathKey);
    return { skillId: row.skillId, pathKey: row.pathKey };
  });
}

export type SkillPathAllocation = { id: number; skillId: number; parentAllocationId: number | null; points: number };
/** Follow stored/planned allocation identities, never choose another path for a shared Skill. */
export function allocationSkillPath(allocationId: number, allocations: readonly SkillPathAllocation[]): number[] | null {
  const byId = new Map(allocations.map(row => [row.id, row]));
  if (byId.size !== allocations.length) return null;
  const seen = new Set<number>();
  const reverse: number[] = [];
  let id: number | null = allocationId;
  while (id !== null) {
    if (seen.has(id)) return null;
    seen.add(id);
    const row = byId.get(id);
    if (!row) return null;
    reverse.push(row.skillId);
    id = row.parentAllocationId;
  }
  return reverse.reverse();
}

export function assertCampaignSkillAllocationChanges(access: ReturnType<typeof createCampaignSkillAccess>, before: readonly SkillPathAllocation[], after: readonly SkillPathAllocation[]) {
  if (new Set(after.map(row => row.id)).size !== after.length) throw new Error("Duplicate Skill allocation identities are not allowed.");
  const stored = new Map(before.map(row => [row.id, row]));
  const proposed = new Map(after.map(row => [row.id, row]));
  for (const row of before) {
    const path = allocationSkillPath(row.id, before);
    if (path && access.resolve(path).allowed) continue;
    const next = proposed.get(row.id);
    if (!next || next.skillId !== row.skillId || next.parentAllocationId !== row.parentAllocationId || next.points !== row.points) throw new Error("A restricted historical Skill allocation must be preserved without changes or refunds.");
  }
  for (const row of after) {
    const path = allocationSkillPath(row.id, after);
    const result = access.resolve(path ?? []);
    const previous = stored.get(row.id);
    if (!result.allowed && (!previous || previous.skillId !== row.skillId || previous.parentAllocationId !== row.parentAllocationId || previous.points !== row.points)) throw new Error(result.reason ?? "That Skill path is restricted by this Campaign.");
  }
}
