import {
  decodeMechanicalEffect,
  encodeMechanicalEffect,
  type MechanicalEffect,
} from "../mechanical-effects";

export const ITEM_USE_MODES = ["none", "consume-item", "charges", "unlimited"] as const;

export type ItemUseMode = (typeof ITEM_USE_MODES)[number];

export type ItemRuntimeProfile = {
  useMode: ItemUseMode;
  quantityPerUse: number | null;
  maximumCharges: number | null;
  chargesPerUse: number | null;
  rechargeNotes: string;
  activationLabel: string;
  useNotes: string;
};

export type ItemRuntimeDefinition = {
  isMagical: boolean;
  runtimeProfile: ItemRuntimeProfile;
  effects: MechanicalEffect[];
};

export type ItemRuntimeValidationIssue = {
  path: string;
  message: string;
};

export type ItemRuntimeProfileValidation =
  | { valid: true; profile: ItemRuntimeProfile; issues: [] }
  | { valid: false; profile: null; issues: ItemRuntimeValidationIssue[] };

export type ItemRuntimeDefinitionValidation =
  | { valid: true; definition: ItemRuntimeDefinition; issues: [] }
  | { valid: false; definition: null; issues: ItemRuntimeValidationIssue[] };

export type ItemEffectPersistenceRecord = {
  schemaVersion: number;
  effectJson: unknown;
  sortOrder: number;
};

export type ItemRuntimeDefinitionPersistenceRecord = {
  isMagical: boolean;
  runtimeProfile: unknown;
  effects: ItemEffectPersistenceRecord[];
};

export const DEFAULT_ITEM_RUNTIME_PROFILE: Readonly<ItemRuntimeProfile> = {
  useMode: "none",
  quantityPerUse: null,
  maximumCharges: null,
  chargesPerUse: null,
  rechargeNotes: "",
  activationLabel: "Use",
  useNotes: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveWholeNumber(value: unknown, path: string, label: string): ItemRuntimeValidationIssue[] {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    return [{ path, message: `${label} must be a positive whole number.` }];
  }
  return [];
}

export function validateItemRuntimeProfile(input: unknown): ItemRuntimeProfileValidation {
  if (!isRecord(input)) {
    return {
      valid: false,
      profile: null,
      issues: [{ path: "runtimeProfile", message: "Item runtime profile is required." }],
    };
  }

  if (typeof input.useMode !== "string" || !ITEM_USE_MODES.includes(input.useMode as ItemUseMode)) {
    return {
      valid: false,
      profile: null,
      issues: [{ path: "runtimeProfile.useMode", message: "Item use mode is not supported." }],
    };
  }
  if (
    input.activationLabel !== null
    && input.activationLabel !== undefined
    && typeof input.activationLabel !== "string"
  ) {
    return {
      valid: false,
      profile: null,
      issues: [{ path: "runtimeProfile.activationLabel", message: "Activation Label must be text." }],
    };
  }
  if (input.useNotes !== null && input.useNotes !== undefined && typeof input.useNotes !== "string") {
    return {
      valid: false,
      profile: null,
      issues: [{ path: "runtimeProfile.useNotes", message: "Use Notes must be text." }],
    };
  }
  if (input.rechargeNotes !== null && input.rechargeNotes !== undefined && typeof input.rechargeNotes !== "string") {
    return {
      valid: false,
      profile: null,
      issues: [{ path: "runtimeProfile.rechargeNotes", message: "Recharge Rule / Notes must be text." }],
    };
  }

  const useMode = input.useMode as ItemUseMode;
  const activationLabel = typeof input.activationLabel === "string"
    ? input.activationLabel.trim() || "Use"
    : "Use";
  const useNotes = typeof input.useNotes === "string" ? input.useNotes.trim() : "";
  const rechargeNotes = useMode === "charges" && typeof input.rechargeNotes === "string"
    ? input.rechargeNotes.trim()
    : "";
  const issues: ItemRuntimeValidationIssue[] = [];
  let quantityPerUse: number | null = null;
  let maximumCharges: number | null = null;
  let chargesPerUse: number | null = null;

  if (useMode === "consume-item") {
    quantityPerUse = input.quantityPerUse === null || input.quantityPerUse === undefined
      ? 1
      : input.quantityPerUse as number;
    issues.push(...positiveWholeNumber(
      quantityPerUse,
      "runtimeProfile.quantityPerUse",
      "Quantity Per Use",
    ));
  }

  if (useMode === "charges") {
    maximumCharges = input.maximumCharges as number | null;
    chargesPerUse = input.chargesPerUse as number | null;
    issues.push(...positiveWholeNumber(
      maximumCharges,
      "runtimeProfile.maximumCharges",
      "Maximum Charges",
    ));
    issues.push(...positiveWholeNumber(
      chargesPerUse,
      "runtimeProfile.chargesPerUse",
      "Charges Per Use",
    ));
    if (
      Number.isSafeInteger(maximumCharges)
      && Number.isSafeInteger(chargesPerUse)
      && (chargesPerUse as number) > (maximumCharges as number)
    ) {
      issues.push({
        path: "runtimeProfile.chargesPerUse",
        message: "Charges Per Use cannot exceed Maximum Charges.",
      });
    }
  }

  if (issues.length > 0) return { valid: false, profile: null, issues };
  return {
    valid: true,
    profile: {
      useMode,
      quantityPerUse,
      maximumCharges,
      chargesPerUse,
      rechargeNotes,
      activationLabel,
      useNotes,
    },
    issues: [],
  };
}

export function validateItemRuntimeDefinition(input: {
  isMagical: unknown;
  runtimeProfile: unknown;
  effects: unknown;
}): ItemRuntimeDefinitionValidation {
  const issues: ItemRuntimeValidationIssue[] = [];
  if (typeof input.isMagical !== "boolean") {
    issues.push({ path: "isMagical", message: "Magical Item classification must be Yes or No." });
  }
  const profileValidation = validateItemRuntimeProfile(input.runtimeProfile);
  if (!profileValidation.valid) issues.push(...profileValidation.issues);

  const effects: MechanicalEffect[] = [];
  const effectInputs = Array.isArray(input.effects) ? input.effects : [];
  if (!Array.isArray(input.effects)) {
    issues.push({ path: "effects", message: "Item Mechanical Effects must be an ordered list." });
  }
  effectInputs.forEach((effect, index) => {
    try {
      effects.push(decodeMechanicalEffect(encodeMechanicalEffect(effect as MechanicalEffect)));
    } catch (error) {
      issues.push({
        path: `effects.${index}`,
        message: `Effect ${index + 1}: ${error instanceof Error ? error.message : "Invalid Mechanical Effect."}`,
      });
    }
  });

  if (issues.length > 0 || !profileValidation.valid || typeof input.isMagical !== "boolean") {
    return { valid: false, definition: null, issues };
  }
  return {
    valid: true,
    definition: {
      isMagical: input.isMagical,
      runtimeProfile: profileValidation.profile,
      effects,
    },
    issues: [],
  };
}

export function encodeItemEffects(effects: readonly MechanicalEffect[]): ItemEffectPersistenceRecord[] {
  return effects.map((effect, sortOrder) => ({ ...encodeMechanicalEffect(effect), sortOrder }));
}

export function decodeItemEffects(rows: readonly ItemEffectPersistenceRecord[]): MechanicalEffect[] {
  const ordered = [...rows].sort((left, right) => left.sortOrder - right.sortOrder);
  const seen = new Set<number>();
  return ordered.map((row) => {
    if (!Number.isSafeInteger(row.sortOrder) || row.sortOrder < 0 || seen.has(row.sortOrder)) {
      throw new Error("Persisted Item Mechanical Effects contain an invalid or duplicate sort order.");
    }
    seen.add(row.sortOrder);
    return decodeMechanicalEffect(row);
  });
}

export function encodeItemRuntimeDefinition(
  definition: ItemRuntimeDefinition,
): ItemRuntimeDefinitionPersistenceRecord {
  const validation = validateItemRuntimeDefinition(definition);
  if (!validation.valid) {
    throw new Error(validation.issues.map(({ message }) => message).join(" "));
  }
  return {
    isMagical: validation.definition.isMagical,
    runtimeProfile: { ...validation.definition.runtimeProfile },
    effects: encodeItemEffects(validation.definition.effects),
  };
}

export function decodeItemRuntimeDefinition(
  record: ItemRuntimeDefinitionPersistenceRecord,
): ItemRuntimeDefinition {
  const validation = validateItemRuntimeDefinition({
    isMagical: record.isMagical,
    runtimeProfile: record.runtimeProfile,
    effects: decodeItemEffects(record.effects),
  });
  if (!validation.valid) {
    throw new Error(validation.issues.map(({ message }) => message).join(" "));
  }
  return validation.definition;
}

export function copyItemRuntimeDefinition(
  definition: ItemRuntimeDefinition,
): ItemRuntimeDefinition {
  return {
    isMagical: definition.isMagical,
    runtimeProfile: { ...definition.runtimeProfile },
    effects: definition.effects.map((effect) => ({ ...effect })),
  };
}

export function formatItemActivatedUse(profile: ItemRuntimeProfile): string {
  switch (profile.useMode) {
    case "none":
      return "No Activated Use";
    case "consume-item":
      return `Consume ${profile.quantityPerUse}`;
    case "charges":
      return `${profile.maximumCharges} Maximum Charges · ${profile.chargesPerUse} per Use`;
    case "unlimited":
      return "Unlimited";
  }
}
