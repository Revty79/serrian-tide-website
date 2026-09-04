import {
  PERCENTILE_NUMERIC_BOUND,
  resolvePercentileCheck,
  type PercentileResolution,
  type PercentileRulingReason,
  type PercentileTargetModifier,
} from "./percentile-resolution";

export const ROLL_MECHANICAL_SNAPSHOT_VERSION = 1 as const;
export const ROLL_GOVERNING_SOURCE_KINDS = ["attribute", "skill", "manual"] as const;
export const ROLL_RAW_RESULT_SOURCES = ["original-roll", "corrected-result"] as const;
export const ROLL_AMENDMENT_KINDS = ["correction", "void", "ruling"] as const;

export type RollAmendmentKind = (typeof ROLL_AMENDMENT_KINDS)[number];
export type RollRawResultSource = (typeof ROLL_RAW_RESULT_SOURCES)[number];

export type AttributeGoverningSourceRequest = Readonly<{
  kind: "attribute";
  characterId: number;
  attributeKey: string;
}>;

export type SkillGoverningSourceRequest = Readonly<{
  kind: "skill";
  characterId: number;
  allocationId: number;
  calculatedPercentage: number;
}>;

export type ManualGoverningSourceRequest = Readonly<{
  kind: "manual";
  label: string;
  originalTarget: number;
}>;

export type RollGoverningSourceRequest =
  | AttributeGoverningSourceRequest
  | SkillGoverningSourceRequest
  | ManualGoverningSourceRequest;

export type RollMechanicalRequest = Readonly<{
  governingSource: RollGoverningSourceRequest;
  modifiers?: readonly PercentileTargetModifier[];
}>;

export type AttributeGoverningSourceSnapshot = Readonly<{
  kind: "attribute";
  characterId: number;
  attributeKey: string;
  attributeDisplayName: string;
  attributeValue: number;
  originalTarget: number;
}>;

export type SkillPathSnapshotEntry = Readonly<{
  allocationId: number;
  skillId: number;
  skillName: string;
  skillTier: number | null;
}>;

export type SkillGoverningSourceSnapshot = Readonly<{
  kind: "skill";
  characterId: number;
  allocationId: number;
  skillId: number;
  skillName: string;
  skillClassification: string;
  skillTier: number | null;
  skillPath: readonly SkillPathSnapshotEntry[];
  calculatedPercentage: number;
  originalTarget: number;
}>;

export type ManualGoverningSourceSnapshot = Readonly<{
  kind: "manual";
  label: string;
  originalTarget: number;
}>;

export type RollGoverningSourceSnapshot =
  | AttributeGoverningSourceSnapshot
  | SkillGoverningSourceSnapshot
  | ManualGoverningSourceSnapshot;

export type RollMechanicalSnapshot = Readonly<{
  schemaVersion: typeof ROLL_MECHANICAL_SNAPSHOT_VERSION;
  rawResultSource: RollRawResultSource;
  governingSource: RollGoverningSourceSnapshot;
  resolution: PercentileResolution;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > PERCENTILE_NUMERIC_BOUND) {
    throw new Error(`${label} is not a valid stored finite number.`);
  }
  return value;
}

function integer(value: unknown, label: string): number {
  const number = finiteNumber(value, label);
  if (!Number.isInteger(number)) throw new Error(`${label} is not a stored whole number.`);
  return number;
}

function positiveInteger(value: unknown, label: string): number {
  const number = integer(value, label);
  if (number <= 0) throw new Error(`${label} is not a stored positive identifier.`);
  return number;
}

function nonnegativeInteger(value: unknown, label: string): number {
  const number = integer(value, label);
  if (number < 0) throw new Error(`${label} is not a stored nonnegative whole number.`);
  return number;
}

function storedRollResult(value: unknown): number {
  const number = integer(value, "Stored raw percentile result");
  if (number < 1 || number > 100) throw new Error("Stored raw percentile result is outside 1 through 100.");
  return number;
}

function storedText(value: unknown, label: string, maximum: number, allowBlank = false): string {
  if (typeof value !== "string" || value.length > maximum || (!allowBlank && !value.trim())) {
    throw new Error(`${label} is not valid stored text.`);
  }
  return value;
}

function storedBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} is not a stored boolean.`);
  return value;
}

function inputText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`${label} must be nonblank and ${maximum} characters or fewer.`);
  }
  return normalized;
}

export function normalizeRollMechanicalRequest(value: unknown): RollMechanicalRequest | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || !isRecord(value.governingSource)) {
    throw new Error("A targeted Roll requires a valid governing source.");
  }
  const suppliedModifiers = value.modifiers ?? [];
  if (!Array.isArray(suppliedModifiers)) throw new Error("Roll modifiers must be an array.");
  const modifiers = suppliedModifiers.map((modifier, index): PercentileTargetModifier => {
    if (!isRecord(modifier) || (modifier.kind !== "bonus" && modifier.kind !== "penalty")) {
      throw new Error(`Roll modifier ${index + 1} must be a bonus or penalty.`);
    }
    const magnitude = finiteNumber(modifier.magnitude, `Roll modifier ${index + 1} magnitude`);
    if (magnitude < 0) throw new Error(`Roll modifier ${index + 1} magnitude must not be negative.`);
    return {
      kind: modifier.kind,
      label: inputText(modifier.label, `Roll modifier ${index + 1} label`, 200),
      magnitude,
    };
  });
  const source = value.governingSource;
  if (source.kind === "manual") {
    return {
      governingSource: {
        kind: "manual",
        label: inputText(source.label, "Manual target label", 200),
        originalTarget: finiteNumber(source.originalTarget, "Manual original target"),
      },
      modifiers,
    };
  }
  if (source.kind === "attribute") {
    return {
      governingSource: {
        kind: "attribute",
        characterId: positiveInteger(source.characterId, "Attribute governing Character"),
        attributeKey: inputText(source.attributeKey, "Attribute key", 20),
      },
      modifiers,
    };
  }
  if (source.kind === "skill") {
    return {
      governingSource: {
        kind: "skill",
        characterId: positiveInteger(source.characterId, "Skill governing Character"),
        allocationId: positiveInteger(source.allocationId, "Skill allocation"),
        calculatedPercentage: finiteNumber(source.calculatedPercentage, "Calculated Skill percentage"),
      },
      modifiers,
    };
  }
  throw new Error("Roll governing-source kind is invalid.");
}

function parseStoredModifier(value: unknown, index: number): PercentileTargetModifier {
  if (!isRecord(value) || (value.kind !== "bonus" && value.kind !== "penalty")) {
    throw new Error(`Stored modifier ${index + 1} is invalid.`);
  }
  return {
    kind: value.kind,
    label: storedText(value.label, `Stored modifier ${index + 1} label`, 200),
    magnitude: (() => {
      const magnitude = finiteNumber(value.magnitude, `Stored modifier ${index + 1} magnitude`);
      if (magnitude < 0) throw new Error(`Stored modifier ${index + 1} magnitude is negative.`);
      return magnitude;
    })(),
  };
}

function parseStoredRulingReasons(value: unknown): PercentileRulingReason[] {
  if (!Array.isArray(value)) throw new Error("Stored ruling reasons are invalid.");
  const allowed: readonly PercentileRulingReason[] = [
    "critical-failure",
    "double-ott-critical-success",
    "double-ott-impossible-target-collision",
  ];
  return value.map((reason) => {
    if (typeof reason !== "string" || !allowed.includes(reason as PercentileRulingReason)) {
      throw new Error("A stored ruling reason is invalid.");
    }
    return reason as PercentileRulingReason;
  });
}

function parseStoredResolution(value: unknown): PercentileResolution {
  if (!isRecord(value) || !Array.isArray(value.modifiers)) {
    throw new Error("Stored percentile resolution is invalid.");
  }
  if (value.outcome !== "success" && value.outcome !== "failure") {
    throw new Error("Stored percentile outcome is invalid.");
  }
  return {
    resultTotal: storedRollResult(value.resultTotal),
    originalTarget: finiteNumber(value.originalTarget, "Stored original target"),
    modifiers: value.modifiers.map(parseStoredModifier),
    totalBonuses: finiteNumber(value.totalBonuses, "Stored total bonuses"),
    totalPenalties: finiteNumber(value.totalPenalties, "Stored total penalties"),
    finalTarget: finiteNumber(value.finalTarget, "Stored final target"),
    outcome: value.outcome,
    succeeded: storedBoolean(value.succeeded, "Stored succeeded flag"),
    mathematicalSuccess: storedBoolean(value.mathematicalSuccess, "Stored mathematical-success flag"),
    basicSuccess: storedBoolean(value.basicSuccess, "Stored basic-success flag"),
    additionalSuccesses: nonnegativeInteger(value.additionalSuccesses, "Stored additional successes"),
    totalSuccesses: nonnegativeInteger(value.totalSuccesses, "Stored total successes"),
    automaticSuccess: storedBoolean(value.automaticSuccess, "Stored automatic-success flag"),
    impossibleTarget: storedBoolean(value.impossibleTarget, "Stored impossible-target flag"),
    criticalFailure: storedBoolean(value.criticalFailure, "Stored critical-failure flag"),
    criticalSuccess: storedBoolean(value.criticalSuccess, "Stored critical-success flag"),
    doubleOtt: storedBoolean(value.doubleOtt, "Stored double-ott flag"),
    requiresGodRuling: storedBoolean(value.requiresGodRuling, "Stored G.O.D.-ruling flag"),
    rulingReasons: parseStoredRulingReasons(value.rulingReasons),
  };
}

function parseStoredGoverningSource(value: unknown): RollGoverningSourceSnapshot {
  if (!isRecord(value)) throw new Error("Stored Roll governing source is invalid.");
  if (value.kind === "manual") {
    return {
      kind: "manual",
      label: storedText(value.label, "Stored manual target label", 200),
      originalTarget: finiteNumber(value.originalTarget, "Stored manual original target"),
    };
  }
  if (value.kind === "attribute") {
    return {
      kind: "attribute",
      characterId: positiveInteger(value.characterId, "Stored Attribute Character"),
      attributeKey: storedText(value.attributeKey, "Stored Attribute key", 20),
      attributeDisplayName: storedText(value.attributeDisplayName, "Stored Attribute display name", 100),
      attributeValue: finiteNumber(value.attributeValue, "Stored Attribute value"),
      originalTarget: finiteNumber(value.originalTarget, "Stored Attribute original target"),
    };
  }
  if (value.kind === "skill") {
    if (!Array.isArray(value.skillPath) || !value.skillPath.length) {
      throw new Error("Stored Skill path is invalid.");
    }
    return {
      kind: "skill",
      characterId: positiveInteger(value.characterId, "Stored Skill Character"),
      allocationId: positiveInteger(value.allocationId, "Stored Skill allocation"),
      skillId: positiveInteger(value.skillId, "Stored Skill"),
      skillName: storedText(value.skillName, "Stored Skill name", 200),
      skillClassification: storedText(value.skillClassification, "Stored Skill classification", 100),
      skillTier: value.skillTier === null ? null : positiveInteger(value.skillTier, "Stored Skill tier"),
      skillPath: value.skillPath.map((entry, index): SkillPathSnapshotEntry => {
        if (!isRecord(entry)) throw new Error(`Stored Skill path entry ${index + 1} is invalid.`);
        return {
          allocationId: positiveInteger(entry.allocationId, `Stored Skill path allocation ${index + 1}`),
          skillId: positiveInteger(entry.skillId, `Stored Skill path identity ${index + 1}`),
          skillName: storedText(entry.skillName, `Stored Skill path name ${index + 1}`, 200),
          skillTier: entry.skillTier === null ? null : positiveInteger(entry.skillTier, `Stored Skill path tier ${index + 1}`),
        };
      }),
      calculatedPercentage: finiteNumber(value.calculatedPercentage, "Stored calculated Skill percentage"),
      originalTarget: finiteNumber(value.originalTarget, "Stored Skill original target"),
    };
  }
  throw new Error("Stored Roll governing-source kind is invalid.");
}

export function buildRollMechanicalSnapshot(
  governingSource: RollGoverningSourceSnapshot,
  resultTotal: number,
  modifiers: readonly PercentileTargetModifier[] | undefined,
  rawResultSource: RollRawResultSource,
): RollMechanicalSnapshot {
  return {
    schemaVersion: ROLL_MECHANICAL_SNAPSHOT_VERSION,
    rawResultSource,
    governingSource,
    resolution: resolvePercentileCheck({
      resultTotal,
      originalTarget: governingSource.originalTarget,
      modifiers,
    }),
  };
}

export function parseRollMechanicalSnapshot(value: unknown): RollMechanicalSnapshot | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || value.schemaVersion !== ROLL_MECHANICAL_SNAPSHOT_VERSION) {
    throw new Error("Stored Roll mechanical snapshot version is invalid.");
  }
  if (value.rawResultSource !== "original-roll" && value.rawResultSource !== "corrected-result") {
    throw new Error("Stored Roll raw-result source is invalid.");
  }
  const governingSource = parseStoredGoverningSource(value.governingSource);
  const resolution = parseStoredResolution(value.resolution);
  if (resolution.originalTarget !== governingSource.originalTarget) {
    throw new Error("Stored Roll target does not match its governing-source snapshot.");
  }
  return {
    schemaVersion: ROLL_MECHANICAL_SNAPSHOT_VERSION,
    rawResultSource: value.rawResultSource,
    governingSource,
    resolution,
  };
}
