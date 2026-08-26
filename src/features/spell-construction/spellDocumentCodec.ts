import { createEmptyProgressiveMilestone } from "./data/progressiveRules";
import {
  COMBINED_SPHERE_TRADITION,
  LEGACY_SPHERE_TRADITIONS,
} from "./data/spellIdentity";
import {
  PRACTITIONER_LEVELS,
  type PractitionerLevel,
} from "./models/rules";
import {
  SPELL_SCHEMA_VERSION,
  SPELL_CASTING_SYSTEMS,
  TRADITIONS,
  type ProgressiveChange,
  type ProgressiveMilestone,
  type ProgressiveSpellData,
  type ScaledAddOnSelection,
  type SpellContainer,
  type SpellDocument,
  type SpellCastingSystem,
} from "./models/spell";
import { createStableId } from "./utilities/ids";

type LegacyScaledAddOnSelection = {
  id?: string;
  ruleId: string;
  additionalIncrements?: number;
  quantity?: number;
  description?: string;
};

type PersistedContainer = Omit<
  SpellContainer,
  "shape" | "durations" | "children"
> & {
  shape?: LegacyScaledAddOnSelection;
  duration?: LegacyScaledAddOnSelection;
  durations?: LegacyScaledAddOnSelection[];
  children: PersistedContainer[];
};

type PersistedProgressiveMilestone = Partial<ProgressiveMilestone> & {
  level?: PractitionerLevel;
  changes?: ProgressiveChange[];
};

type PersistedProgressiveSpellData = Partial<ProgressiveSpellData> & {
  milestones?: PersistedProgressiveMilestone[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isSelection(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.ruleId === "string" &&
    value.ruleId.length > 0 &&
    isFiniteQuantity(value.quantity)
  );
}

function isContainer(value: unknown): value is SpellContainer {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" ||
    typeof value.containerRuleId !== "string" ||
    !Array.isArray(value.effects) ||
    !value.effects.every(isSelection) ||
    !Array.isArray(value.modifiers) ||
    !value.modifiers.every(isSelection) ||
    !Array.isArray(value.durations) ||
    !value.durations.every(isSelection) ||
    !Array.isArray(value.children) ||
    !value.children.every(isContainer)
  ) {
    return false;
  }
  if (value.shape !== undefined && !isSelection(value.shape)) return false;
  if (
    value.multiTarget !== undefined &&
    (!isRecord(value.multiTarget) ||
      typeof value.multiTarget.ruleId !== "string" ||
      !isFiniteQuantity(value.multiTarget.additionalTargets))
  ) {
    return false;
  }
  return true;
}

function normalizeScaledSelection(
  selection: LegacyScaledAddOnSelection,
  defaultQuantity: number,
): ScaledAddOnSelection {
  return {
    id: selection.id ?? createStableId("addon"),
    ruleId: selection.ruleId,
    quantity: Math.max(
      0,
      selection.quantity ?? selection.additionalIncrements ?? defaultQuantity,
    ),
    description: selection.description ?? "",
  };
}

function normalizeContainer(container: PersistedContainer): SpellContainer {
  const { shape, duration, durations, children, ...rest } = container;
  const normalizedDurations =
    durations?.map((selection) =>
      normalizeScaledSelection(
        selection,
        selection.ruleId === "lingering" ? 1 : 0,
      ),
    ) ?? [];
  if (duration && normalizedDurations.length === 0) {
    const legacyExtra = Math.max(0, duration.additionalIncrements ?? 0);
    normalizedDurations.push({
      id: duration.id ?? createStableId("addon"),
      ruleId: duration.ruleId,
      quantity: duration.ruleId === "lingering" ? legacyExtra + 1 : 0,
      description: duration.description ?? "",
    });
  }

  return {
    ...rest,
    effects: Array.isArray(rest.effects)
      ? rest.effects.map((effect) => ({
          ...effect,
          description: effect.description ?? "",
        }))
      : [],
    modifiers: Array.isArray(rest.modifiers)
      ? rest.modifiers.map((modifier) => ({
          ...modifier,
          description: modifier.description ?? "",
        }))
      : [],
    rangeDescription: rest.rangeDescription ?? "",
    multiTarget: rest.multiTarget
      ? { ...rest.multiTarget, description: rest.multiTarget.description ?? "" }
      : undefined,
    shape: shape ? normalizeScaledSelection(shape, 0) : undefined,
    durations: normalizedDurations,
    children: Array.isArray(children) ? children.map(normalizeContainer) : [],
  };
}

function normalizeProgressiveChange(change: ProgressiveChange): ProgressiveChange {
  switch (change.kind) {
    case "add-container":
      return {
        ...change,
        container: normalizeContainer(
          change.container as unknown as PersistedContainer,
        ),
      };
    case "add-effect":
    case "set-effect":
      return {
        ...change,
        effect: {
          ...change.effect,
          description: change.effect.description ?? "",
        },
      };
    case "set-range":
      return { ...change, rangeDescription: change.rangeDescription ?? "" };
    case "set-shape":
      return {
        ...change,
        shape: change.shape
          ? normalizeScaledSelection(change.shape, 0)
          : undefined,
      };
    case "add-duration":
    case "set-duration":
      return {
        ...change,
        duration: normalizeScaledSelection(
          change.duration,
          change.duration.ruleId === "lingering" ? 1 : 0,
        ),
      };
    case "set-multi-target":
      return {
        ...change,
        multiTarget: change.multiTarget
          ? { ...change.multiTarget, description: change.multiTarget.description ?? "" }
          : undefined,
      };
    case "add-modifier":
    case "set-modifier":
      return {
        ...change,
        modifier: {
          ...change.modifier,
          description: change.modifier.description ?? "",
        },
      };
    default:
      return { ...change };
  }
}

function normalizeProgressive(
  progressive: PersistedProgressiveSpellData | undefined,
): ProgressiveSpellData {
  const persistedMilestones = Array.isArray(progressive?.milestones)
    ? progressive.milestones
    : [];
  return {
    enabled: progressive?.enabled ?? false,
    costMode: "original-base",
    milestones: PRACTITIONER_LEVELS.map((level) => {
      const fallback = createEmptyProgressiveMilestone(level);
      const persisted = persistedMilestones.find(
        (milestone) => milestone.level === level,
      );
      if (!persisted) return fallback;
      return {
        ...fallback,
        tierName: persisted.tierName ?? fallback.tierName,
        condition: persisted.condition ?? "",
        description: persisted.description ?? "",
        notes: persisted.notes ?? "",
        flavorLine: persisted.flavorLine ?? "",
        changes: Array.isArray(persisted.changes)
          ? persisted.changes.map(normalizeProgressiveChange)
          : [],
      };
    }),
  };
}

function normalizeSpell(spell: SpellDocument): SpellDocument {
  const persistedContainers = spell.containers as unknown as PersistedContainer[];
  const normalizedContainers = persistedContainers.map(normalizeContainer);
  const movedModifiers: SpellDocument["modifiers"] = [];
  const moveContainerModifiers = (container: SpellContainer): SpellContainer => {
    movedModifiers.push(...container.modifiers);
    return {
      ...container,
      modifiers: [],
      children: container.children.map(moveContainerModifiers),
    };
  };

  const persistedTradition = spell.tradition as unknown as string;
  const tradition = LEGACY_SPHERE_TRADITIONS.includes(
    persistedTradition as (typeof LEGACY_SPHERE_TRADITIONS)[number],
  )
    ? COMBINED_SPHERE_TRADITION
    : spell.tradition;
  const persistedCastingSystem = spell.castingSystem as unknown as string | undefined;
  const castingSystem = SPELL_CASTING_SYSTEMS.includes(
    persistedCastingSystem as SpellCastingSystem,
  )
    ? persistedCastingSystem as SpellCastingSystem
    : LEGACY_SPHERE_TRADITIONS.includes(
        persistedTradition as (typeof LEGACY_SPHERE_TRADITIONS)[number],
      )
      ? persistedTradition as SpellCastingSystem
      : tradition === "Psionics"
        ? "Psyonics"
        : tradition === "Bardic Resonance"
          ? "Bardic Resonance"
          : undefined;
  const frameworkSkillId = Number.isInteger(spell.frameworkSkillId) &&
    Number(spell.frameworkSkillId) > 0
    ? Number(spell.frameworkSkillId)
    : undefined;

  return {
    ...spell,
    schemaVersion: SPELL_SCHEMA_VERSION,
    tradition,
    castingSystem,
    frameworkSkillId,
    sphere: spell.sphere ?? "",
    discipline: spell.discipline ?? "",
    resonance: spell.resonance ?? "",
    description: spell.description ?? "",
    notes: spell.notes ?? "",
    flavorLine: spell.flavorLine ?? "",
    progressive: normalizeProgressive(
      spell.progressive as PersistedProgressiveSpellData | undefined,
    ),
    modifiers: [
      ...(Array.isArray(spell.modifiers)
        ? spell.modifiers.map((modifier) => ({
            ...modifier,
            description: modifier.description ?? "",
          }))
        : []),
      ...movedModifiers,
    ],
    containers: normalizedContainers.map(moveContainerModifiers),
  };
}

export function parseSpellDocument(value: unknown): SpellDocument {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw new Error("The Spell Construction document is not valid JSON.");
    }
  }
  if (!isRecord(parsed)) {
    throw new Error("The Spell Construction extension is not a document.");
  }
  const schemaVersion = Number(parsed.schemaVersion ?? 1);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new Error("The Spell Construction schema version is invalid.");
  }
  if (schemaVersion > SPELL_SCHEMA_VERSION) {
    throw new Error(
      `Spell Construction schema ${schemaVersion} is newer than this application supports.`,
    );
  }
  if (
    typeof parsed.id !== "string" ||
    typeof parsed.name !== "string" ||
    typeof parsed.createdAt !== "string" ||
    typeof parsed.modifiedAt !== "string" ||
    !Array.isArray(parsed.containers) ||
    !Array.isArray(parsed.modifiers)
  ) {
    throw new Error("The Spell Construction document is missing required fields.");
  }

  const normalized = normalizeSpell(parsed as unknown as SpellDocument);
  if (!TRADITIONS.includes(normalized.tradition)) {
    throw new Error("The Spell Construction tradition is unsupported.");
  }
  if (
    !normalized.containers.every(isContainer) ||
    !normalized.modifiers.every(isSelection) ||
    normalized.progressive.milestones.length !== PRACTITIONER_LEVELS.length
  ) {
    throw new Error("The Spell Construction document contains invalid components.");
  }
  return normalized;
}
