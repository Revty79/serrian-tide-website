import type {
  CanonicalSkillPathValidation,
} from "@/features/skills/recursive-skill-library";

export {
  CANONICAL_SKILL_PATH_PROBLEM_CODES,
  enumerateCanonicalSkillPathAlternatives,
  validateCanonicalSkillPath,
  validateSelectedCanonicalSkillPath,
  type CanonicalSkillDefinition,
  type CanonicalSkillParentRelationship,
  type CanonicalSkillPathNode,
  type CanonicalSkillPathProblem,
  type CanonicalSkillPathProblemCode,
  type CanonicalSkillPathValidation,
} from "@/features/skills/recursive-skill-library";

export const WEAPON_SKILL_GOVERNANCE_REVIEW_STATES = ["review-required", "approved"] as const;

export type WeaponSkillGovernanceReviewState =
  (typeof WEAPON_SKILL_GOVERNANCE_REVIEW_STATES)[number];

export type CanonicalWeaponSkillOption = Readonly<{
  id: number;
  firingModeId: number | null;
  endpointSkillId: number;
  reviewState: WeaponSkillGovernanceReviewState;
  sortOrder: number;
  notes: string;
  path: CanonicalSkillPathValidation;
}>;

export type CanonicalWeaponSkillScope = Readonly<{
  firingModeId: number | null;
  options: readonly CanonicalWeaponSkillOption[];
}>;

export type ApplicableCanonicalWeaponSkillPaths = Readonly<{
  source: "weapon-default" | "firing-mode";
  firingModeId: number | null;
  options: readonly CanonicalWeaponSkillOption[];
}>;

function approvedOptions(scope: CanonicalWeaponSkillScope): CanonicalWeaponSkillOption[] {
  return scope.options
    .filter(({ reviewState, path }) => reviewState === "approved" && path.valid)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
}

export function selectApplicableCanonicalWeaponSkillPaths(
  weaponDefault: CanonicalWeaponSkillScope,
  modes: readonly CanonicalWeaponSkillScope[],
  firingModeId: number | null,
): ApplicableCanonicalWeaponSkillPaths {
  if (firingModeId !== null) {
    const mode = modes.find((candidate) => candidate.firingModeId === firingModeId);
    if (!mode) throw new Error(`Firing Mode #${firingModeId} does not belong to this Weapon Profile.`);
    const modeOptions = approvedOptions(mode);
    if (modeOptions.length) {
      return { source: "firing-mode", firingModeId, options: modeOptions };
    }
  }
  return {
    source: "weapon-default",
    firingModeId: null,
    options: approvedOptions(weaponDefault),
  };
}
