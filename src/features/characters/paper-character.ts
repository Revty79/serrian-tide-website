import { buildCharacterPrintData, selectCharacterQuickRolls } from "./character-print";
import { CHARACTER_ATTRIBUTE_KEYS, type CharacterAggregate } from "./models";
import { characterAggregateToDraft, getAttributeModifier, getAttributeRollTarget, getBaseInitiative, getCharacterMovementBaseValue, getMovementInitiative } from "./character-rules";
import type { ActiveHealthView } from "@/features/active-state/models";
import type { ActiveManaView } from "@/features/active-state/active-mana";
import type { ActiveEffectsView } from "@/features/active-state/active-effects";
import type { CharacterEquipmentStateView } from "@/features/items/equipment-state";
import type { ProtectionLayers } from "@/features/protection/protection-layers";
import { formatMechanicalEffectSummary, type MechanicalEffect } from "@/features/mechanical-effects";
import { getDerivedAbilityRequirementSummary } from "@/features/derived-abilities/derived-ability-rules";
import { buildPaperSpells } from "./paper-spells";
import { getStoredCampaignMoneyBreakdown } from "./currency-rules";

export const paperNumber = (value: number | null | undefined) => value == null ? "Not recorded" : String(Number(value.toFixed(2)));
export const paperSigned = (value: number) => `${value > 0 ? "+" : ""}${paperNumber(value)}`;

/** Human-readable authored effects; preserve scope, duration and manual instructions. */
export function paperEffect(effect: MechanicalEffect): string {
  const summary = formatMechanicalEffectSummary(effect);
  if (effect.kind === "manual") return `${summary}. ${effect.description}`;
  if (effect.kind === "condition.apply") return `${summary}. ${effect.description} Duration: ${effect.duration.label || effect.duration.kind}${effect.duration.value == null ? "" : ` (${effect.duration.value})`}.`;
  if (effect.kind === "modifier.apply") return `${summary}; ${effect.channel}, ${effect.targetKey}. Duration: ${effect.duration.label || effect.duration.kind}${effect.duration.value == null ? "" : ` (${effect.duration.value})`}.`;
  return summary;
}

export type PaperWeaponDetail = { mode: string; target: number | null; governing: string; damage: string; initiative: string; range: string; timing: string[] };
export type PaperRuntime = {
  health: ActiveHealthView;
  mana: ActiveManaView;
  equipment: CharacterEquipmentStateView;
  effects: ActiveEffectsView;
  protection: ProtectionLayers;
  weapons: Record<number, PaperWeaponDetail[]>;
  ammunition: Record<number, string[]>;
  itemRules: Record<number, string[]>;
  interactions: string[];
  gaps: string[];
};

/** Saved aggregate only. The editor draft never enters this print boundary. */
export function buildPaperCharacter(aggregate: CharacterAggregate, runtime: PaperRuntime, recordedAt: string) {
  const draft = characterAggregateToDraft(aggregate);
  const data = buildCharacterPrintData(aggregate, draft, aggregate.selectedRace);
  const itemIds = [...new Set(data.ownedItems.map(({ owned }) => owned.itemId))];
  const references = new Map(itemIds.map((id, index) => [id, `G${String(index + 1).padStart(2, "0")}`]));
  const inventory = data.ownedItems.map((row, index) => {
    const copy = draft.itemInstances.find((instance) => `instance:${instance.draftId}` === row.rowKey);
    const instance = copy ? runtime.equipment.instances.find(({ instanceId }) => instanceId === copy.instanceId) : null;
    const stack = copy ? null : runtime.equipment.stacks.find(({ itemId }) => itemId === row.owned.itemId);
    const states = stack ? [["Wielded", stack.wieldedQuantity], ["Worn", stack.wornQuantity], ["Equipped", stack.equippedQuantity], ["Unequipped", stack.inactiveQuantity]] as const : [];
    const state = instance ? instance.state === "inactive" ? "Unequipped" : instance.state[0].toUpperCase() + instance.state.slice(1)
      : stack ? states.filter(([, count]) => count > 0).map(([label, count]) => `${label} ${count}/${stack.ownedQuantity}`).join("; ") : "Carried";
    const maximum = row.item?.powerResource?.maximumCharges ?? row.item?.runtimeProfile.maximumCharges;
    const charges = instance && (maximum != null || row.item?.runtimeProfile.useMode === "charges")
      ? `${instance.currentCharges}/${maximum ?? "?"} charges` : "";
    return { id: `INV${String(index + 1).padStart(2, "0")}`, key: row.rowKey, itemId: row.owned.itemId, name: row.displayName,
      quantity: row.owned.quantity, state, active: instance ? instance.state !== "inactive" : !!stack && stack.inactiveQuantity < stack.ownedQuantity,
      weapon: row.isWeapon, armor: row.isArmor, status: [charges, ...(copy?.instanceId ? runtime.ammunition[copy.instanceId] ?? [] : [])].filter(Boolean).join("; "),
      reference: references.get(row.owned.itemId)! };
  });
  const skills = data.skills.map((row, index) => ({ ...row, parentId: aggregate.skillAllocations.find((allocation) => allocation.id === row.id)?.parentAllocationId ?? null, reference: `SK${String(index + 1).padStart(2, "0")}` }));
  const quickIds = new Set(selectCharacterQuickRolls(data.skills, 4).map(({ id }) => id));
  const activeWeapons = inventory.filter(({ active, weapon }) => active && weapon).flatMap((row) => (
    (runtime.weapons[row.itemId] ?? [{ mode: "", target: null, governing: "Weapon profile unavailable", damage: "Not recorded", initiative: "Not recorded", range: "Not recorded", timing: [] }]).map((weapon) => ({ ...row, ...weapon }))
  ));
  const gear = itemIds.map((id) => {
    const item = aggregate.authorizedItems.find((entry) => entry.id === id);
    const profile = item?.runtimeProfile;
    const use = profile?.useMode === "consume-item" ? `${profile.activationLabel}: consumes ${profile.quantityPerUse} per use.`
      : profile?.useMode === "charges" ? `${profile.activationLabel}: ${profile.chargesPerUse} charge(s) per use.`
        : profile?.useMode === "unlimited" ? `${profile.activationLabel}: no charge or quantity cost.` : "";
    return { id: references.get(id)!, name: item?.name ?? aggregate.items.find((row) => row.itemId === id)?.name ?? `Item ${id}`,
      details: [item?.description, use, profile?.useNotes, profile?.rechargeNotes ? `Recharge: ${profile.rechargeNotes}` : "",
        item?.durability != null ? `Authored durability: ${item.durability}. Current durability: not recorded.` : "",
        item?.weaponRulesText, item?.armorRulesText, item?.armorDamageModifiers,
        ...(runtime.itemRules[id] ?? []), ...(runtime.weapons[id] ?? []).flatMap((weapon) => [
          `${weapon.mode || "Attack"}: ${weapon.target == null ? weapon.governing : `${weapon.target}%+ (${weapon.governing})`}; damage ${weapon.damage}; attack Initiative ${weapon.initiative}; ${weapon.range}.`, ...weapon.timing,
        ])].filter((text): text is string => !!text?.trim()) };
  });
  const purse = getStoredCampaignMoneyBreakdown(aggregate.profile.creditsRemaining, aggregate.campaign.currencySystem, aggregate.campaign.derivedCurrencies, aggregate.currencyHoldings);
  const currency = purse.entries.map(({name, quantity}) => ({name, quantity}));
  const protection = [
    ...runtime.protection.worn.map((entry) => ({ name: entry.itemName, state: `Worn ×${entry.activeQuantity}`, soak: paperNumber(entry.baseSoak),
      coverage: entry.coveredLocationKeys.map((key) => runtime.protection.locations.find((location) => location.key === key)?.name ?? key).join(", ") || entry.coverage || "Not recorded",
      summary: entry.damageModifiers.length ? entry.damageModifiers.map((modifier) => `${modifier.modifierText || `${modifier.damageType} ${modifier.modifier}`}${modifier.notes ? ` (${modifier.notes})` : ""}`).join("; ") : entry.damageModifiersSourceText,
      details: [entry.rulesText, entry.damageModifiersSourceText, ...entry.damageModifiers.map((modifier) => `${modifier.damageType}: ${modifier.modifierText || modifier.modifier} ${modifier.notes}`)].filter(Boolean) })),
    ...runtime.protection.natural.map((entry) => ({ name: entry.name, state: "Natural", soak: paperNumber(entry.soak),
      coverage: entry.coverage.kind === "all" ? "All locations" : entry.coverage.locationKeys.map((key) => runtime.protection.locations.find((location) => location.key === key)?.name ?? key).join(", "),
      summary: entry.armor == null ? "" : `Natural Armor ${entry.armor}`, details: entry.armor == null ? [] : [`Natural Armor ${entry.armor}`] })),
    ...runtime.protection.temporary.map((entry) => ({ name: entry.name, state: "Temporary", soak: paperNumber(entry.amount), coverage: entry.coverage.kind === "all" ? "All locations" : "See effect / ruling", summary: "", details: [] as string[] })),
  ];
  const profile = aggregate.profile;
  const effects = [
    ...runtime.effects.conditions.filter((entry) => !entry.resolvedAt).map((entry) => `${entry.name}: ${entry.description} (${entry.duration.label})`),
    ...runtime.effects.modifiers.filter((entry) => !entry.endedAt).map((entry) => `${entry.label}: ${paperSigned(entry.amount)} ${entry.channel}, ${entry.targetKey} (${entry.duration.label}).`),
    ...runtime.health.injuries.filter((entry) => !entry.resolved).map((entry) => `${entry.name} — ${entry.poolNameSnapshot}: ${entry.notes}`),
    ...runtime.equipment.activeManualPassives.map((entry) => `${entry.itemName}: ${entry.title}. ${entry.description} (${entry.lifecycleLabel})`),
  ];
  const invalidSpells = [...data.skills.filter((row) => row.spellDocumentJson && !data.spells.some((spell) => spell.key === `catalog:${row.id}`)).map((row) => row.name),
    ...aggregate.personalSpellbook.filter((row) => !data.spells.some((spell) => spell.key === `personal:${row.id}`)).map((row) => row.name)];
  return {
    characterId: aggregate.character.id, name: aggregate.character.name, player: aggregate.character.playerUsername, campaign: aggregate.campaign.name,
    recordedAt, race: aggregate.selectedRace?.race.name ?? "Not recorded", identity: [profile.age != null ? `Age ${profile.age}` : "", profile.sex,
      profile.heightFeet != null ? `${profile.heightFeet} ft ${profile.heightInches ?? 0} in` : "", profile.weight != null ? `Weight ${profile.weight}` : "", profile.deity ? `Deity: ${profile.deity}` : ""].filter(Boolean).join(" · "),
    attributes: CHARACTER_ATTRIBUTE_KEYS.map((key) => ({ key, score: draft.attributes[key], modifier: getAttributeModifier(draft.attributes[key]), target: getAttributeRollTarget(draft.attributes[key]) })),
    initiative: getBaseInitiative(draft.attributes.DEX),
    movement: (aggregate.selectedRace?.movementModes ?? []).map((mode) => ({ name: mode.movementMode, base: getCharacterMovementBaseValue(mode.baseValue, profile.baseMovementSteps),
      value: getMovementInitiative(draft.attributes.DEX, getCharacterMovementBaseValue(mode.baseValue, profile.baseMovementSteps)), notes: mode.notes })),
    health: { total: runtime.health.total, tracks: runtime.health.tracks, anatomy: runtime.health.anatomy },
    mana: runtime.mana.pools, effects, protection, interactions: runtime.interactions,
    totals: [{ name: "Fame", value: profile.fame }, { name: "XP", value: profile.experience }, { name: "Total XP", value: profile.totalExperience },
      { name: "Quintessence", value: profile.quintessence }, { name: "Total Quintessence", value: profile.totalQuintessence }, { name: "Fate", value: profile.fatePoints }],
    skills, quickRolls: skills.filter(({ id }) => quickIds.has(id)), inventory, gear, currency, activeWeapons,
    spells: buildPaperSpells(aggregate, data, runtime.mana.pools),
    abilities: data.derivedAbilities.map(({ ability, status }) => ({ id: ability.id, name: ability.name, status: status.available ? "Available" : "Unavailable", activation: ability.activationType,
      description: ability.description, effect: ability.mechanicalEffect,
      requirements: getDerivedAbilityRequirementSummary(ability, {skillNames: new Map(aggregate.skillCatalog.map((skill) => [skill.id, skill.name])), derivedAbilityNames: new Map(aggregate.derivedAbilities.map((entry) => [entry.id, entry.name]))}),
      costs: ability.costs.map((cost) => `${cost.amount} ${cost.resourceKey || cost.costType}${cost.notes ? `: ${cost.notes}` : ""}`),
      limits: ability.useLimits.map((limit) => `${limit.maximumUses} use(s) / ${limit.refreshScope}${limit.refreshKey ? ` (${limit.refreshKey})` : ""}. ${limit.notes}`),
      conditions: ability.useConditions.map((condition) => [condition.conditionType, condition.conditionKey, condition.operator, condition.numericValue, condition.textValue, condition.notes].filter((value) => value !== null && value !== "").join(" ")),
      effects: ability.effects.map(paperEffect) })),
    story: [{ name: "Appearance & identifying marks", text: [profile.skinColor, profile.eyeColor, profile.hairColor, profile.definingMarks].filter(Boolean).join(" · ") },
      ...([['Personality', 'personality'], ['Goals', 'goals'], ['Motivations', 'motivations'], ['Secrets', 'secrets'], ['Backstory', 'backstory']] as const).map(([name, key]) => ({ name, text: profile[key] }))].filter(({ text }) => text.trim()),
    gaps: [...runtime.gaps, ...runtime.protection.issues, ...(!purse.fullyRepresented ? [purse.formatted] : []), ...invalidSpells.map((name) => `The saved spell “${name}” could not be decoded. Its rules are unavailable; review its saved definition.`)],
  };
}
export type PaperCharacterData = ReturnType<typeof buildPaperCharacter>;

/** Keep parent paths unambiguous even when allocations were purchased out of order. */
export function arrangePaperSkillGroups<T extends {id:number;parentId:number|null;name:string;depth:number;special:boolean;system:string|null}>(skills: readonly T[]) {
  const groups = new Map<string,T[]>();
  for(const row of skills) {
    const group=row.special ? "Special Abilities" : row.system ?? "Core Skills";
    groups.set(group,[...groups.get(group) ?? [],row]);
  }
  return [...groups].map(([name,rows])=>{
    const ids=new Set(rows.map(row=>row.id));
    const visited=new Set<number>();
    const ordered: Array<T & {displayName:string;displayDepth:number}> = [];
    function visit(row:T,depth:number) {
      if(visited.has(row.id)) return;
      visited.add(row.id);
      ordered.push({...row,displayName:depth===0 && row.depth>0 ? row.name : row.name.split(" → ").at(-1)!,displayDepth:depth});
      for(const child of rows.filter(candidate=>candidate.parentId===row.id)) visit(child,depth+1);
    }
    for(const row of rows.filter(candidate=>candidate.parentId===null || !ids.has(candidate.parentId))) visit(row,0);
    for(const row of rows) if(!visited.has(row.id)) visit(row,0);
    return {name,rows:ordered};
  });
}
