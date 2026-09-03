import { calculateSpell } from "@/features/spell-construction/engine/calculateSpell";
import { getSpellFrameworkName } from "@/features/spell-construction/data/spellIdentity";
import { parseSpellDocument } from "@/features/spell-construction/spellDocumentCodec";

import { resolveCharacterSpellCastingContext } from "./character-spell-casting";
import {
  getCharacterMagicSystem,
  getCharacterSkillRanks,
  getEffectiveSkillPoints,
  getRacialSkillGrant,
  getSkillRollTarget,
  normalizeSkillAttributeKey,
  type CharacterMagicSystem,
} from "./character-rules";
import type {
  CharacterAggregate,
  CharacterAuthorizedItem,
  CharacterDraft,
  CharacterRaceAggregate,
} from "./models";
import { getItemChargeDisplay } from "@/features/items/item-ownership";
import { getActiveDerivedAbilities } from "@/features/derived-abilities/derived-ability-rules";
import type { DerivedAbilityDefinition } from "@/features/derived-abilities/models";

export const CHARACTER_PRINT_SECTION_KEYS = [
  "quick",
  "skills",
  "powers",
  "specialAbilities",
  "derivedAbilities",
  "inventory",
  "equipment",
  "story",
] as const;

export type CharacterPrintSection =
  (typeof CHARACTER_PRINT_SECTION_KEYS)[number];

export type CharacterPrintPreset =
  | "quick"
  | "full"
  | "complete"
  | "custom";

export type CharacterPrintSelection = Record<CharacterPrintSection, boolean>;

export type CharacterPrintAvailability = {
  hasSkills: boolean;
  hasPowers: boolean;
  hasSpecialAbilities: boolean;
  hasDerivedAbilities: boolean;
  hasInventory: boolean;
  hasEquipment: boolean;
  hasStory: boolean;
};

export type CharacterPrintContentSummary = {
  skillCount: number;
  spellCount: number;
  supernaturalAbilityCount: number;
  specialAbilityCount: number;
  derivedAbilityCount: number;
  inventoryCount: number;
  equipmentCount: number;
  hasStory: boolean;
};

export const EMPTY_CHARACTER_PRINT_SELECTION: CharacterPrintSelection = {
  quick: false,
  skills: false,
  powers: false,
  specialAbilities: false,
  derivedAbilities: false,
  inventory: false,
  equipment: false,
  story: false,
};

export function getCharacterPrintAvailability(
  summary: CharacterPrintContentSummary,
): CharacterPrintAvailability {
  return {
    hasSkills: summary.skillCount > 0,
    hasPowers:
      summary.spellCount > 0 || summary.supernaturalAbilityCount > 0,
    hasSpecialAbilities: summary.specialAbilityCount > 0,
    hasDerivedAbilities: summary.derivedAbilityCount > 0,
    hasInventory: summary.inventoryCount > 0,
    hasEquipment: summary.equipmentCount > 0,
    hasStory: summary.hasStory,
  };
}

export function resolveCharacterPrintSelection(
  preset: CharacterPrintPreset,
  custom: CharacterPrintSelection,
  availability: CharacterPrintAvailability,
): CharacterPrintSelection {
  const requested: CharacterPrintSelection =
    preset === "custom"
      ? { ...custom }
      : preset === "quick"
        ? { ...EMPTY_CHARACTER_PRINT_SELECTION, quick: true }
        : preset === "full"
          ? {
              ...EMPTY_CHARACTER_PRINT_SELECTION,
              quick: true,
              skills: true,
              powers: true,
              specialAbilities: true,
              derivedAbilities: true,
              inventory: true,
              equipment: true,
            }
          : {
              quick: true,
              skills: true,
              powers: true,
              specialAbilities: true,
              derivedAbilities: true,
              inventory: true,
              equipment: true,
              story: true,
            };

  return {
    quick: requested.quick,
    skills: requested.skills && availability.hasSkills,
    powers: requested.powers && availability.hasPowers,
    specialAbilities:
      requested.specialAbilities && availability.hasSpecialAbilities,
    derivedAbilities:
      requested.derivedAbilities && availability.hasDerivedAbilities,
    inventory: requested.inventory && availability.hasInventory,
    equipment: requested.equipment && availability.hasEquipment,
    story: requested.story && availability.hasStory,
  };
}

export type PrintableCharacterSkillRow = {
  id: number;
  skillId: number;
  name: string;
  depth: number;
  points: number;
  racialPoints: number;
  rank: number;
  target: number;
  system: CharacterMagicSystem | null;
  special: boolean;
  definition: string;
  spellLevel: string | null;
  manaCost: number | null;
  spellDocumentJson: string | null;
};

export type PrintableCharacterSkillSection = {
  key: string;
  label: string;
  rows: PrintableCharacterSkillRow[];
};

export function getPrintableCharacterSkillRows(
  aggregate: CharacterAggregate,
  draft: CharacterDraft,
  selectedRace: CharacterRaceAggregate | null,
): PrintableCharacterSkillRow[] {
  const ranks = getCharacterSkillRanks(
    draft,
    aggregate.skillCatalog,
    selectedRace,
  );
  const allocations = new Map(
    draft.skillAllocations.map((allocation) => [allocation.draftId, allocation]),
  );
  const skills = new Map(
    aggregate.skillCatalog.map((skill) => [skill.id, skill]),
  );

  return draft.skillAllocations.flatMap((allocation) => {
    const skill = skills.get(allocation.skillId);
    const points = getEffectiveSkillPoints(
      allocation.points,
      selectedRace,
      allocation.skillId,
    );
    if (!skill || points <= 0) return [];

    const path: string[] = [];
    let cursor = allocation;
    let rootSkill = skill;
    const visited = new Set<number>();
    while (true) {
      const cursorSkill = skills.get(cursor.skillId);
      if (cursorSkill) {
        path.unshift(cursorSkill.name);
        rootSkill = cursorSkill;
      }
      if (cursor.parentDraftId === null || !visited.add(cursor.draftId)) break;
      const parent = allocations.get(cursor.parentDraftId);
      if (!parent) break;
      cursor = parent;
    }

    const rank = ranks.get(allocation.draftId) ?? 0;
    const attributeKey = normalizeSkillAttributeKey(skill.primaryAttribute);
    return [
      {
        id: allocation.draftId,
        skillId: skill.id,
        name: path.join(" → ") || skill.name,
        depth: Math.max(0, path.length - 1),
        points,
        racialPoints: getRacialSkillGrant(selectedRace, skill.id).minimum,
        rank,
        target: attributeKey
          ? getSkillRollTarget(draft.attributes[attributeKey], rank)
          : 100 - rank,
        system: getCharacterMagicSystem(rootSkill),
        special: skill.classification.toLowerCase().includes("special"),
        definition: skill.definition,
        spellLevel: skill.spellLevel,
        manaCost: skill.manaCost,
        spellDocumentJson: skill.spellDocumentJson,
      },
    ];
  });
}

export function getPrintableCharacterSkillSections(
  rows: readonly PrintableCharacterSkillRow[],
): PrintableCharacterSkillSection[] {
  return [
    {
      key: "core",
      label: "Core Skills",
      rows: rows.filter((row) => !row.system && !row.special),
    },
    ...(
      [
        "Spellcraft",
        "Talismanism",
        "Faith",
        "Psyonics",
        "Bardic Resonance",
      ] as const
    ).map((system) => ({
      key: system,
      label: system,
      rows: rows.filter((row) => row.system === system && !row.special),
    })),
    {
      key: "special",
      label: "Special Abilities",
      rows: rows.filter((row) => row.special),
    },
  ].filter((section) => section.rows.length > 0);
}

export function selectCharacterQuickRolls(
  rows: readonly PrintableCharacterSkillRow[],
  limit = 10,
): PrintableCharacterSkillRow[] {
  if (!Number.isInteger(limit) || limit <= 0) return [];
  return rows
    .filter(
      (row) =>
        row.points > 0 && Number.isFinite(row.target) && row.target >= 0,
    )
    .slice()
    .sort(
      (left, right) =>
        right.rank - left.rank ||
        left.target - right.target ||
        left.name.localeCompare(right.name) ||
        left.id - right.id,
    )
    .slice(0, limit);
}

export type PrintableCharacterOwnedItem = {
  rowKey: string;
  displayName: string;
  stateSummary: string;
  owned: { itemId: number; quantity: number; unitCostCredits: number };
  item: CharacterAuthorizedItem | null;
  isWeapon: boolean;
  isArmor: boolean;
};

export function getPrintableCharacterOwnedItems(
  aggregate: CharacterAggregate,
  draft: CharacterDraft,
): PrintableCharacterOwnedItem[] {
  const itemMap = new Map(
    aggregate.authorizedItems.map((item) => [item.id, item]),
  );
  const stacks = draft.items.map((owned) => {
    const item = itemMap.get(owned.itemId) ?? null;
    return {
      rowKey: `stack:${owned.itemId}`,
      displayName: item?.name ?? `Item ${owned.itemId}`,
      stateSummary: "",
      owned,
      item,
      isWeapon:
        item?.equipmentGroup === "weapon" || Boolean(item?.weaponType),
      isArmor: item?.equipmentGroup === "armor" || Boolean(item?.armorType),
    };
  });
  const instances = draft.itemInstances.map((instance, index) => {
    const item = itemMap.get(instance.itemId) ?? null;
    const persisted = instance.instanceId === null
      ? null
      : aggregate.itemInstances.find(({ id }) => id === instance.instanceId) ?? null;
    const chargeDisplay = getItemChargeDisplay({
      currentCharges: persisted?.currentCharges ?? item?.runtimeProfile.maximumCharges ?? 0,
      maximumCharges: item?.runtimeProfile.maximumCharges ?? null,
    });
    const copyLabel = instance.instanceId === null ? `New copy ${index + 1}` : `Copy #${instance.instanceId}`;
    return {
      rowKey: `instance:${instance.draftId}`,
      displayName: `${item?.name ?? persisted?.name ?? `Item ${instance.itemId}`} · ${copyLabel}`,
      stateSummary: `${chargeDisplay.label}${chargeDisplay.exceedsCurrentMaximum ? " · Above current maximum" : ""}`,
      owned: {
        itemId: instance.itemId,
        quantity: 1,
        unitCostCredits: instance.unitCostCredits,
      },
      item,
      isWeapon: item?.equipmentGroup === "weapon" || Boolean(item?.weaponType),
      isArmor: item?.equipmentGroup === "armor" || Boolean(item?.armorType),
    };
  });
  return [...stacks, ...instances];
}

export type PrintableCharacterAbilityRow = {
  id: number;
  name: string;
  system: string;
  points: number;
  rank: number;
  target: number;
  summary: string;
  special: boolean;
};

export function getPrintableCharacterAbilityRows(
  skills: readonly PrintableCharacterSkillRow[],
): PrintableCharacterAbilityRow[] {
  return skills
    .filter(
      (skill) =>
        (Boolean(skill.system) || skill.special) && !skill.spellDocumentJson,
    )
    .map((skill) => ({
      id: skill.id,
      name: skill.name,
      system: skill.special
        ? "Special Ability"
        : skill.system ?? "Supernatural",
      points: skill.points,
      rank: skill.rank,
      target: skill.target,
      summary: skill.definition.trim(),
      special: skill.special,
    }));
}

export type PrintableCharacterSpellRow = {
  key: string;
  name: string;
  source: "Known Catalog Spell" | "Personal Spell";
  system: string;
  framework: string;
  manaCost: number;
  mastery: string;
  combatCastingTime: number;
  outOfCombatCastingTimeSeconds: number;
  accessLevel: string | null;
  rank: number | null;
  target: number | null;
  summary: string;
  notes: string;
  components: Array<{
    label: string;
    detail: string;
    cost: number;
  }>;
  progressive: Array<{
    tierName: string;
    condition: string;
    description: string;
  }>;
};

function printableSpellRow(
  aggregate: CharacterAggregate,
  source: "Known Catalog Spell" | "Personal Spell",
  key: string,
  documentJson: string,
  skill?: PrintableCharacterSkillRow,
): PrintableCharacterSpellRow | null {
  try {
    const document = parseSpellDocument(documentJson);
    const calculation = calculateSpell(document);
    const castingContext = resolveCharacterSpellCastingContext(
      aggregate,
      document,
      skill?.id,
    );
    return {
      key,
      name: document.name.trim() || "Untitled Spell",
      source,
      system:
        skill?.system ??
        castingContext?.system ??
        document.castingSystem ??
        document.tradition,
      framework: getSpellFrameworkName(document) || document.tradition,
      manaCost: calculation.baseSpellManaCost,
      mastery: String(calculation.baseSpellMastery),
      combatCastingTime: calculation.combatCastingTime,
      outOfCombatCastingTimeSeconds:
        calculation.baseOutOfCombatCastingTimeSeconds,
      accessLevel:
        skill?.spellLevel ??
        castingContext?.profile.spellAccessLevel ??
        document.practitionerLevel ??
        null,
      rank: skill?.rank ?? null,
      target: skill?.target ?? null,
      summary: document.description.trim() || document.flavorLine.trim(),
      notes: document.notes.trim(),
      components: calculation.breakdown.map((line) => ({
        label: line.label,
        detail: line.detail ?? line.componentDescription ?? "",
        cost: line.cost,
      })),
      progressive: document.progressive.enabled
        ? document.progressive.milestones.map((milestone) => ({
            tierName: milestone.tierName,
            condition: milestone.condition,
            description: milestone.description,
          }))
        : [],
    };
  } catch {
    return null;
  }
}

export function getPrintableCharacterSpellRows(
  aggregate: CharacterAggregate,
  skills: readonly PrintableCharacterSkillRow[],
): PrintableCharacterSpellRow[] {
  const rows: PrintableCharacterSpellRow[] = [];

  for (const skill of skills) {
    if (!skill.spellDocumentJson) continue;
    const row = printableSpellRow(
      aggregate,
      "Known Catalog Spell",
      `catalog:${skill.id}`,
      skill.spellDocumentJson,
      skill,
    );
    if (row) rows.push(row);
  }

  for (const saved of aggregate.personalSpellbook) {
    const row = printableSpellRow(
      aggregate,
      "Personal Spell",
      `personal:${saved.id}`,
      saved.documentJson,
    );
    if (row) rows.push(row);
  }

  return rows.sort(
    (left, right) =>
      left.system.localeCompare(right.system) ||
      left.name.localeCompare(right.name) ||
      left.key.localeCompare(right.key),
  );
}

export type CharacterPrintData = {
  skills: PrintableCharacterSkillRow[];
  skillSections: PrintableCharacterSkillSection[];
  quickRolls: PrintableCharacterSkillRow[];
  spells: PrintableCharacterSpellRow[];
  supernaturalAbilities: PrintableCharacterAbilityRow[];
  specialAbilities: PrintableCharacterAbilityRow[];
  derivedAbilities: DerivedAbilityDefinition[];
  ownedItems: PrintableCharacterOwnedItem[];
  weapons: PrintableCharacterOwnedItem[];
  armor: PrintableCharacterOwnedItem[];
  inventory: PrintableCharacterOwnedItem[];
  availability: CharacterPrintAvailability;
};

export function buildCharacterPrintData(
  aggregate: CharacterAggregate,
  draft: CharacterDraft,
  selectedRace: CharacterRaceAggregate | null,
): CharacterPrintData {
  const skills = getPrintableCharacterSkillRows(
    aggregate,
    draft,
    selectedRace,
  );
  const abilities = getPrintableCharacterAbilityRows(skills);
  const spells = getPrintableCharacterSpellRows(aggregate, skills);
  const ownedItems = getPrintableCharacterOwnedItems(aggregate, draft);
  const weapons = ownedItems.filter(({ isWeapon }) => isWeapon);
  const armor = ownedItems.filter(({ isArmor }) => isArmor);
  const combatIds = new Set(
    [...weapons, ...armor].map(({ owned }) => owned.itemId),
  );
  const inventory = ownedItems.filter(
    ({ owned }) => !combatIds.has(owned.itemId),
  );
  const storyValues = [
    draft.profile.personality,
    draft.profile.goals,
    draft.profile.motivations,
    draft.profile.secrets,
    draft.profile.backstory,
    draft.profile.definingMarks,
  ];
  const supernaturalAbilities = abilities.filter(({ special }) => !special);
  const specialAbilities = abilities.filter(({ special }) => special);
  const derivedAbilities = getActiveDerivedAbilities(
    aggregate.derivedAbilities,
    { attributes: draft.attributes },
    aggregate.campaign.allowedSystems,
  );

  return {
    skills,
    skillSections: getPrintableCharacterSkillSections(skills),
    quickRolls: selectCharacterQuickRolls(skills),
    spells,
    supernaturalAbilities,
    specialAbilities,
    derivedAbilities,
    ownedItems,
    weapons,
    armor,
    inventory,
    availability: getCharacterPrintAvailability({
      skillCount: skills.length,
      spellCount: spells.length,
      supernaturalAbilityCount: supernaturalAbilities.length,
      specialAbilityCount: specialAbilities.length,
      derivedAbilityCount: derivedAbilities.length,
      inventoryCount: ownedItems.length,
      equipmentCount: weapons.length + armor.length,
      hasStory: storyValues.some((value) => value.trim().length > 0),
    }),
  };
}
