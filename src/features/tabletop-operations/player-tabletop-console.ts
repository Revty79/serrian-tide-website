import type { ActiveEffectsView } from "@/features/active-state/active-effects";
import type { ActiveManaView } from "@/features/active-state/active-mana";
import type { ActiveHealthView } from "@/features/active-state/models";
import type { CharacterAggregate } from "@/features/characters/models";
import { resolveCharacterSpellCastingContext } from "@/features/characters/character-spell-casting";
import type { SpellCastSourceRequest } from "@/features/characters/character-spell-runtime";
import { formatDerivedAbilityMechanicalEffectSummary } from "@/features/derived-abilities/derived-ability-effects";
import type { CharacterDerivedAbilityStatus } from "@/features/derived-abilities/models";
import type { CharacterEquipmentStateView } from "@/features/items/equipment-state";
import type { CharacterItemChargeStateView } from "@/features/items/item-charge";
import type { ItemRuntimeProfile } from "@/features/items/item-runtime";
import { formatMechanicalEffectSummary } from "@/features/mechanical-effects";
import { calculateSpell } from "@/features/spell-construction/engine/calculateSpell";
import { adaptSpellToMechanicalEffects } from "@/features/spell-construction/mechanical-effects-adapter";
import type { SpellDocument } from "@/features/spell-construction/models/spell";
import { parseSpellDocument } from "@/features/spell-construction/spellDocumentCodec";

import type { PlayerCalledCheckWorkspaceView } from "./called-check-service";
import type { RollLedgerEntry } from "./roll-runtime-service";
import type { PlayerCombatConsoleData } from "./player-tabletop-console-service";

export const PLAYER_TABLETOP_HISTORY_LIMIT = 30;

export type PlayerTabletopCharacterOption = Readonly<{
  characterId: number;
  characterName: string;
  campaignId: number;
  campaignName: string;
}>;

export type PlayerTabletopSelectionState =
  | { kind: "no-characters" }
  | { kind: "needs-selection" }
  | { kind: "single-available"; characterId: number }
  | { kind: "selected"; character: PlayerTabletopCharacterOption }
  | { kind: "unavailable" };

export function resolvePlayerTabletopSelection(
  characters: readonly PlayerTabletopCharacterOption[],
  selectedCharacterId: number | null,
): PlayerTabletopSelectionState {
  if (characters.length === 0) return { kind: "no-characters" };
  if (selectedCharacterId === null) {
    return characters.length === 1
      ? { kind: "single-available", characterId: characters[0]!.characterId }
      : { kind: "needs-selection" };
  }
  const selected = characters.find(({ characterId }) => characterId === selectedCharacterId);
  return selected ? { kind: "selected", character: selected } : { kind: "unavailable" };
}

export type PlayerTabletopPresenceKind =
  | "no-active-session"
  | "active-session-unrostered"
  | "active-session-rostered"
  | "active-scene"
  | "active-encounter";

export type PlayerTabletopPresence = Readonly<{
  kind: PlayerTabletopPresenceKind;
  label: string;
  detail: string;
  liveActionsAllowed: boolean;
  noncombatSourceUseAllowed: boolean;
}>;

export function resolvePlayerTabletopPresence(input: {
  hasActiveSession: boolean;
  rostered: boolean;
  sceneMember: boolean;
  hasActiveEncounter: boolean;
  encounterParticipant: boolean;
}): PlayerTabletopPresence {
  if (!input.hasActiveSession) return {
    kind: "no-active-session",
    label: "Waiting for an active Session",
    detail: "Persistent Character state and owned sources remain available. No Session, Scene, or Encounter has been fabricated.",
    liveActionsAllowed: false,
    noncombatSourceUseAllowed: true,
  };
  if (!input.rostered) return {
    kind: "active-session-unrostered",
    label: "Session active · not rostered",
    detail: "This Campaign has an active Session, but this Character is not participating in its live roster.",
    liveActionsAllowed: false,
    noncombatSourceUseAllowed: true,
  };
  if (!input.sceneMember) return {
    kind: "active-session-rostered",
    label: "Session active · rostered",
    detail: "This Character is in the Session roster and is waiting to enter the active Scene.",
    liveActionsAllowed: true,
    noncombatSourceUseAllowed: true,
  };
  if (!input.hasActiveEncounter) return {
    kind: "active-scene",
    label: "Active Scene",
    detail: "This Character is present in the current Scene. No active Encounter is attached to this Character.",
    liveActionsAllowed: true,
    noncombatSourceUseAllowed: true,
  };
  return {
    kind: "active-encounter",
    label: input.encounterParticipant ? "Active Encounter · participating" : "Active Encounter · not participating",
    detail: input.encounterParticipant
      ? "Encounter state is read-only here. Complete combat controls remain outside the Pass 12 console."
      : "An Encounter is active in this Scene, but this Character is not an Encounter Participant.",
    liveActionsAllowed: input.encounterParticipant,
    noncombatSourceUseAllowed: false,
  };
}

export type PlayerTabletopItemEffectDetail = Readonly<{
  itemId: number;
  effectSummaries: readonly string[];
  requiresGodRuling: boolean;
}>;

export type PlayerTabletopFirearmState = Readonly<{
  itemInstanceId: number;
  selectedModeName: string;
  loadedAmmunitionName: string | null;
  loadedRounds: number;
  capacityRounds: number | null;
  readied: boolean;
  requiresCycling: boolean;
  requiresRecoilRecovery: boolean;
  updatedAt: string;
}>;

export type PlayerTabletopOwnedItem = Readonly<{
  ownershipKey: string;
  itemId: number;
  instanceId: number | null;
  name: string;
  category: string;
  description: string;
  quantity: number;
  equipmentState: string;
  currentCharges: number | null;
  maximumCharges: number | null;
  runtimeProfile: ItemRuntimeProfile;
  effects: readonly string[];
  requiresGodRuling: boolean;
  canUseSafely: boolean;
  legacyAggregateFirearm: boolean;
  firearmState: PlayerTabletopFirearmState | null;
}>;

export function assemblePlayerTabletopItems(input: {
  aggregate: CharacterAggregate;
  equipment: CharacterEquipmentStateView;
  charges: CharacterItemChargeStateView;
  effectDetails: readonly PlayerTabletopItemEffectDetail[];
  firearmStates: readonly PlayerTabletopFirearmState[];
}): PlayerTabletopOwnedItem[] {
  const definitions = new Map(input.aggregate.authorizedItems.map((entry) => [entry.id, entry]));
  const effects = new Map(input.effectDetails.map((entry) => [entry.itemId, entry]));
  const stackState = new Map(input.equipment.stacks.map((entry) => [entry.itemId, entry]));
  const instanceState = new Map(input.equipment.instances.map((entry) => [entry.instanceId, entry]));
  const chargeState = new Map(input.charges.instances.map((entry) => [entry.instanceId, entry]));
  const firearmState = new Map(input.firearmStates.map((entry) => [entry.itemInstanceId, entry]));

  const stacks = input.aggregate.items.map((owned): PlayerTabletopOwnedItem => {
    const definition = definitions.get(owned.itemId);
    const runtimeProfile = definition?.runtimeProfile ?? {
      useMode: "none" as const,
      quantityPerUse: null,
      maximumCharges: null,
      chargesPerUse: null,
      rechargeNotes: "",
      activationLabel: "Use",
      useNotes: "",
    };
    const detail = effects.get(owned.itemId);
    const state = stackState.get(owned.itemId);
    const activeStates = [
      state?.equippedQuantity ? `Equipped ×${state.equippedQuantity}` : null,
      state?.wornQuantity ? `Worn ×${state.wornQuantity}` : null,
      state?.wieldedQuantity ? `Wielded ×${state.wieldedQuantity}` : null,
    ].filter((value): value is string => value !== null);
    const legacyAggregateFirearm = definition?.isFirearm === true;
    const requiresGodRuling = detail?.requiresGodRuling ?? false;
    return {
      ownershipKey: `stack:${owned.itemId}`,
      itemId: owned.itemId,
      instanceId: null,
      name: owned.name,
      category: owned.category,
      description: definition?.description ?? "",
      quantity: owned.quantity,
      equipmentState: activeStates.length ? activeStates.join(" · ") : "Inactive",
      currentCharges: null,
      maximumCharges: runtimeProfile.maximumCharges,
      runtimeProfile,
      effects: detail?.effectSummaries ?? [],
      requiresGodRuling,
      canUseSafely: !legacyAggregateFirearm && runtimeProfile.useMode !== "none" && !requiresGodRuling,
      legacyAggregateFirearm,
      firearmState: null,
    };
  });

  const instances = input.aggregate.itemInstances.map((owned): PlayerTabletopOwnedItem => {
    const definition = definitions.get(owned.itemId);
    const detail = effects.get(owned.itemId);
    const charge = chargeState.get(owned.id);
    const requiresGodRuling = detail?.requiresGodRuling ?? false;
    return {
      ownershipKey: `instance:${owned.id}`,
      itemId: owned.itemId,
      instanceId: owned.id,
      name: `${owned.name} · Copy #${owned.id}`,
      category: owned.category,
      description: definition?.description ?? "",
      quantity: 1,
      equipmentState: instanceState.get(owned.id)?.state ?? "inactive",
      currentCharges: charge?.currentCharges ?? owned.currentCharges,
      maximumCharges: charge?.maximumCharges ?? owned.runtimeProfile.maximumCharges,
      runtimeProfile: owned.runtimeProfile,
      effects: detail?.effectSummaries ?? [],
      requiresGodRuling,
      canUseSafely: owned.runtimeProfile.useMode !== "none" && !requiresGodRuling,
      legacyAggregateFirearm: false,
      firearmState: firearmState.get(owned.id) ?? null,
    };
  });

  return [...instances, ...stacks].sort((left, right) => (
    left.name.localeCompare(right.name) || left.ownershipKey.localeCompare(right.ownershipKey)
  ));
}

export type PlayerTabletopSpell = Readonly<{
  key: string;
  name: string;
  tradition: string;
  sourceLabel: string;
  lineageLabel: string | null;
  manaCost: number | null;
  activationLabel: string;
  effects: readonly string[];
  issues: readonly string[];
  available: boolean;
  requiresGodRuling: boolean;
  canUseSafely: boolean;
  castSource: SpellCastSourceRequest | null;
}>;

function summarizeSpell(
  aggregate: CharacterAggregate,
  document: SpellDocument,
  input: {
    key: string;
    sourceLabel: string;
    lineageLabel: string | null;
    allocationId?: number;
    savedSpellId?: number;
  },
): PlayerTabletopSpell {
  try {
    const calculation = calculateSpell(document);
    const adaptation = adaptSpellToMechanicalEffects(document);
    const effects = adaptation.valid
      ? adaptation.effects.map(({ definition }) => formatMechanicalEffectSummary(definition.effect))
      : [];
    const issues = adaptation.valid ? [] : adaptation.issues.map(({ message }) => message);
    const castingContext = resolveCharacterSpellCastingContext(
      aggregate,
      document,
      input.allocationId,
    );
    const requiresGodRuling = !adaptation.valid
      || adaptation.effects.length === 0
      || adaptation.effects.some(({ definition }) => definition.effect.kind === "manual");
    const castSource: SpellCastSourceRequest | null = input.allocationId
      ? { kind: "catalog", allocationId: input.allocationId }
      : input.savedSpellId
        ? { kind: "personal", savedSpellId: input.savedSpellId }
        : null;
    return {
      key: input.key,
      name: document.name || "Untitled Spell",
      tradition: document.tradition,
      sourceLabel: input.sourceLabel,
      lineageLabel: input.lineageLabel,
      manaCost: calculation.totalMana,
      activationLabel: `${calculation.baseCastingTime} Initiative · ${calculation.baseOutOfCombatCastingTimeSeconds}s outside combat`,
      effects,
      issues,
      available: castingContext !== null,
      requiresGodRuling,
      canUseSafely: castingContext !== null && !requiresGodRuling && castSource !== null,
      castSource,
    };
  } catch (error) {
    return {
      key: input.key,
      name: document.name || "Untitled Spell",
      tradition: document.tradition,
      sourceLabel: input.sourceLabel,
      lineageLabel: input.lineageLabel,
      manaCost: null,
      activationLabel: "Authored mechanics require review",
      effects: [],
      issues: [error instanceof Error ? error.message : "The saved Spell could not be resolved."],
      available: false,
      requiresGodRuling: true,
      canUseSafely: false,
      castSource: null,
    };
  }
}

function allocationLineageLabel(aggregate: CharacterAggregate, allocationId: number): string {
  const allocations = new Map(aggregate.skillAllocations.map((entry) => [entry.id, entry]));
  const lineage: string[] = [];
  const seen = new Set<number>();
  let current = allocations.get(allocationId) ?? null;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    lineage.unshift(current.skillName);
    current = current.parentAllocationId === null ? null : allocations.get(current.parentAllocationId) ?? null;
  }
  return lineage.join(" → ");
}

export function assemblePlayerTabletopSpells(aggregate: CharacterAggregate): PlayerTabletopSpell[] {
  const skills = new Map(aggregate.skillCatalog.map((entry) => [entry.id, entry]));
  const spells: PlayerTabletopSpell[] = [];
  for (const allocation of aggregate.skillAllocations) {
    if (allocation.points <= 0) continue;
    const skill = skills.get(allocation.skillId);
    if (!skill?.spellDocumentJson) continue;
    try {
      spells.push(summarizeSpell(aggregate, parseSpellDocument(skill.spellDocumentJson), {
        key: `catalog:${allocation.id}`,
        sourceLabel: "Known Catalog Spell",
        lineageLabel: allocationLineageLabel(aggregate, allocation.id),
        allocationId: allocation.id,
      }));
    } catch {
      spells.push({
        key: `catalog:${allocation.id}`,
        name: skill.name,
        tradition: "Unknown",
        sourceLabel: "Known Catalog Spell",
        lineageLabel: allocationLineageLabel(aggregate, allocation.id),
        manaCost: null,
        activationLabel: "Saved document requires review",
        effects: [],
        issues: ["The canonical Spell document could not be read."],
        available: false,
        requiresGodRuling: true,
        canUseSafely: false,
        castSource: null,
      });
    }
  }
  for (const saved of aggregate.personalSpellbook) {
    try {
      spells.push(summarizeSpell(aggregate, parseSpellDocument(saved.documentJson), {
        key: `personal:${saved.id}`,
        sourceLabel: "Personal Spellbook",
        lineageLabel: null,
        savedSpellId: saved.id,
      }));
    } catch {
      spells.push({
        key: `personal:${saved.id}`,
        name: saved.name || "Untitled Spell",
        tradition: saved.tradition,
        sourceLabel: "Personal Spellbook",
        lineageLabel: null,
        manaCost: null,
        activationLabel: "Saved document requires review",
        effects: [],
        issues: ["The personal Spell document could not be read."],
        available: false,
        requiresGodRuling: true,
        canUseSafely: false,
        castSource: null,
      });
    }
  }
  return spells.sort((left, right) => left.name.localeCompare(right.name) || left.key.localeCompare(right.key));
}

export type PlayerTabletopDerivedAbility = Readonly<{
  id: number;
  name: string;
  description: string;
  activation: string;
  availability: string;
  requirements: readonly string[];
  costs: readonly string[];
  limits: readonly string[];
  effects: readonly string[];
  requiresGodRuling: boolean;
}>;

function statusLabel(status: CharacterDerivedAbilityStatus): string {
  return status.available ? "Available" : status.possessed ? "Owned · unavailable" : "Not owned";
}

export function assemblePlayerTabletopDerivedAbilities(
  aggregate: CharacterAggregate,
): PlayerTabletopDerivedAbility[] {
  const statuses = new Map(aggregate.derivedAbilityStatuses.map((entry) => [entry.abilityId, entry]));
  const skillNames = new Map(aggregate.skillCatalog.map((entry) => [entry.id, entry.name]));
  return aggregate.derivedAbilities.flatMap((ability): PlayerTabletopDerivedAbility[] => {
    const status = statuses.get(ability.id);
    if (!status?.possessed) return [];
    const requirements = ability.requirements.map((entry) => [
      entry.requirementScope,
      entry.requirementType,
      entry.attributeKey ?? (entry.skillId ? skillNames.get(entry.skillId) ?? "Unavailable authored Skill" : null),
      entry.operator,
      entry.requiredValue,
      entry.notes,
    ].filter((value) => value !== null && value !== "").join(" · "));
    const costs = ability.costs.map((entry) => [
      `${entry.amount} ${entry.costType}`,
      entry.resourceKey,
      entry.notes,
    ].filter(Boolean).join(" · "));
    const limits = ability.useLimits.map((entry) => [
      `${entry.maximumUses} use${entry.maximumUses === 1 ? "" : "s"}`,
      `refresh: ${entry.refreshScope}`,
      entry.refreshKey,
      entry.notes,
    ].filter(Boolean).join(" · "));
    const requiresGodRuling = status.liveResult === "manual"
      || ability.useConditions.some(({ conditionType }) => conditionType === "manual")
      || ability.effects.some(({ kind }) => kind === "manual");
    return [{
      id: ability.id,
      name: ability.name,
      description: ability.description,
      activation: ability.activationType,
      availability: statusLabel(status),
      requirements,
      costs,
      limits,
      effects: ability.effects.map(formatDerivedAbilityMechanicalEffectSummary),
      requiresGodRuling,
    }];
  }).sort((left, right) => left.name.localeCompare(right.name) || left.id - right.id);
}

export function boundPlayerCalledCheckWorkspace(
  view: PlayerCalledCheckWorkspaceView | null,
  limit = PLAYER_TABLETOP_HISTORY_LIMIT,
): PlayerCalledCheckWorkspaceView | null {
  if (!view) return null;
  const prioritizePending = <T extends { status: string; createdAt?: string; issuedAt?: string }>(rows: readonly T[]) => (
    [...rows].sort((left, right) => {
      const pendingDifference = Number(right.status === "pending") - Number(left.status === "pending");
      if (pendingDifference) return pendingDifference;
      return (right.createdAt ?? right.issuedAt ?? "").localeCompare(left.createdAt ?? left.issuedAt ?? "");
    }).slice(0, limit)
  );
  return {
    ...view,
    calledChecks: prioritizePending(view.calledChecks),
    highLow: prioritizePending(view.highLow),
  };
}

export function boundPlayerRollHistory(
  rolls: readonly RollLedgerEntry[],
  limit = PLAYER_TABLETOP_HISTORY_LIMIT,
): RollLedgerEntry[] {
  return [...rolls]
    .sort((left, right) => right.id - left.id)
    .slice(0, limit);
}

export type PlayerTabletopConsoleView = Readonly<{
  identity: {
    characterId: number;
    characterName: string;
    campaignId: number;
    campaignName: string;
    campaignOverview: string;
    playerUsername: string;
    raceName: string | null;
    age: number | null;
    sex: string;
  };
  presence: PlayerTabletopPresence;
  session: null | {
    id: number;
    title: string;
    status: "active";
    rostered: boolean;
    startedAt: string;
  };
  scene: null | {
    id: number;
    title: string;
    locationLabel: string;
    description: string;
  };
  encounter: null | {
    id: number;
    title: string;
    encounterType: string;
    description: string;
    participating: boolean;
    roundNumber: number | null;
    stepNumber: number | null;
    currentInitiative: number | null;
    participationStatus: string;
  };
  health: ActiveHealthView;
  mana: ActiveManaView;
  effects: ActiveEffectsView;
  items: readonly PlayerTabletopOwnedItem[];
  spells: readonly PlayerTabletopSpell[];
  derivedAbilities: readonly PlayerTabletopDerivedAbility[];
  calledChecks: PlayerCalledCheckWorkspaceView | null;
  calledCheckHistory: readonly PlayerCalledCheckWorkspaceView[];
  rolls: readonly RollLedgerEntry[];
  recentSessions: readonly {
    id: number;
    title: string;
    sequenceNumber: number;
    status: "active" | "completed";
    startedAt: string;
    completedAt: string | null;
    sceneTitles: readonly string[];
    encounterTitles: readonly string[];
  }[];
  derivedAbilityUses: readonly {
    id: number;
    abilityName: string;
    effectSummary: string;
    manualSteps: string;
    usedAt: string;
  }[];
  combat: PlayerCombatConsoleData | null;
}>;
