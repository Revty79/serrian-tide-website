"use client";

import { useInventoryLocations } from "./inventory-location-controls";
import { displayMeasurement } from "@/features/items/container-physics";
import {
  CHARACTER_ATTRIBUTE_KEYS,
  CHARACTER_ATTRIBUTE_LABELS,
  type CharacterAggregate,
  type CharacterDraft,
} from "@/features/characters/models";
import {
  CHARACTER_ATTRIBUTE_REFERENCE_KEYS,
  getAttributeReference,
  getAttributeReferenceFields,
} from "@/features/characters/attribute-reference";
import {
  getAttributeModifier,
  getAttributeRollTarget,
  getBaseInitiative,
  getCharacterBaseMagic,
  getCharacterHp,
  getCharacterHpMultiplier,
  getCharacterMagicSystem,
  getCharacterMovementBaseValue,
  getCharacterSkillRanks,
  getCharacterSkillPointsById,
  getEffectiveSkillPoints,
  getMovementInitiative,
  getRacialSkillGrant,
  getSkillRollTarget,
  normalizeSkillAttributeKey,
} from "@/features/characters/character-rules";
import {
  getCharacterEncumbrance,
} from "@/features/characters/character-sheet-rules";
import {
  getCanonicalCreditsFromHoldings,
  getStoredCampaignMoneyBreakdown,
} from "@/features/characters/currency-rules";
import { resolveCharacterDerivedAbilities } from "@/features/derived-abilities/character-derived-ability-resolver";
import type { ActiveHealthView } from "@/features/active-state/models";
import type { ActiveManaView } from "@/features/active-state/active-mana";
import type { ActiveEffectsView } from "@/features/active-state/active-effects";
import type { CharacterEquipmentStateView } from "@/features/items/equipment-state";
import type { CharacterItemChargeStateView } from "@/features/items/item-charge";

import { ActiveHealthPanel } from "./active-health-panel";
import { ActiveManaPanel } from "./active-mana-panel";
import { ActiveEffectsPanel } from "./active-effects-panel";
import { CharacterHitLocationChart } from "./character-hit-location-chart";
import { resolveRaceHealthAnatomy } from "@/features/active-state/anatomy";
import { OwnedEquipmentList } from "./owned-equipment-list";
import { FirearmSetupPanel } from "./firearm-setup-panel";
import { MagazinePanel } from "./magazine-panel";
import { ItemChargePanel } from "./item-charge-panel";
import { DerivedAbilityPanel } from "./derived-ability-panel";

type Props = {
  onInventoryVersionChange: (version: number) => void;
  aggregate: CharacterAggregate;
  draft: CharacterDraft;
  selectedRace: CharacterAggregate["selectedRace"];
  section: "attributes" | "skills" | "equipment";
  showAttributeTable?: boolean;
  showSkillTable?: boolean;
  activeHealth: ActiveHealthView;
  onActiveHealthChange: (health: ActiveHealthView) => void;
  activeMana: ActiveManaView;
  onActiveManaChange: (mana: ActiveManaView) => void;
  activeManaDisabled: boolean;
  itemUseDisabled: boolean;
  itemUseDisabledReason?: string;
  onItemUseComplete: () => void | Promise<void>;
  onDerivedAbilityChange: () => void | Promise<void>;
  activeEffects: ActiveEffectsView;
  onActiveEffectsChange: (state: ActiveEffectsView) => void;
  equipmentState: CharacterEquipmentStateView;
  onEquipmentStateChange: (state: CharacterEquipmentStateView) => void;
  equipmentStateDisabled: boolean;
  chargeState: CharacterItemChargeStateView;
  onChargeStateChange: (state: CharacterItemChargeStateView) => void;
  chargeStateDisabled: boolean;
  godMode: boolean;
  canOperateRuntime: boolean;
};

function displayNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function signedNumber(value: number): string {
  return value > 0 ? `+${displayNumber(value)}` : displayNumber(value);
}

function displayEncumbrance(
  encumbrance: ReturnType<typeof getCharacterEncumbrance>,
): string {
  const measured = encumbrance.totals.length
    ? encumbrance.totals
        .map(({ weight, unit }) => `${displayNumber(weight)} ${unit}`)
        .join(" + ")
    : encumbrance.unknownQuantity > 0
      ? "Unknown"
      : "0 lb";
  return encumbrance.unknownQuantity > 0
    ? `${measured} · ${encumbrance.unknownQuantity} unweighed`
    : measured;
}

export function CharacterSheet({ onInventoryVersionChange, aggregate, draft, selectedRace, section, showAttributeTable = true, showSkillTable = true, activeHealth, onActiveHealthChange, activeMana, onActiveManaChange, activeManaDisabled, itemUseDisabled, itemUseDisabledReason, onItemUseComplete, onDerivedAbilityChange, activeEffects, onActiveEffectsChange, equipmentState, onEquipmentStateChange, equipmentStateDisabled, chargeState, onChargeStateChange, chargeStateDisabled, godMode, canOperateRuntime }: Props) {
  const locations = useInventoryLocations(aggregate.character.id, aggregate.profile.commerceVersion ?? 0, JSON.stringify(equipmentState), onInventoryVersionChange);
  const hp = getCharacterHp(
    draft.attributes.CON,
    draft.profile.hpMultiplierSteps,
  );
  const hpMultiplier = getCharacterHpMultiplier(
    draft.profile.hpMultiplierSteps,
  );
  const encumbrance = getCharacterEncumbrance([
    ...aggregate.items,
    ...draft.itemInstances.map((owned) => {
      const persisted = owned.instanceId === null
        ? null
        : aggregate.itemInstances.find(({ id }) => id === owned.instanceId) ?? null;
      const definition = aggregate.authorizedItems.find(({ id }) => id === owned.itemId) ?? null;
      return {
      characterId: aggregate.character.id,
      itemId: owned.itemId,
      canonicalId: definition?.canonicalId ?? persisted?.canonicalId ?? `ITEM-${owned.itemId}`,
      name: definition?.name ?? persisted?.name ?? `Item ${owned.itemId}`,
      catalogScope: definition?.catalogScope ?? persisted?.catalogScope ?? "inventory",
      equipmentGroup: definition?.equipmentGroup ?? persisted?.equipmentGroup ?? null,
      recordType: definition?.recordType ?? persisted?.recordType ?? "Item",
      category: definition?.category ?? persisted?.category ?? "Item",
      quantity: 1,
      unitCostCredits: owned.unitCostCredits,
      weight: definition?.weight ?? persisted?.weight ?? null,
      weightUnit: definition?.weightUnit ?? persisted?.weightUnit ?? "",
      acquiredAt: persisted?.acquiredAt ?? "",
    };
    }),
  ]);
  const attributeReferences = CHARACTER_ATTRIBUTE_REFERENCE_KEYS.map((key) => ({
    key,
    reference: getAttributeReference(
      aggregate.attributeReferenceCatalog,
      key,
      draft.attributes[key],
    ),
    fields: getAttributeReferenceFields(key),
  }));
  const ranks = getCharacterSkillRanks(draft, aggregate.skillCatalog, selectedRace);
  const allocations = new Map(
    draft.skillAllocations.map((allocation) => [allocation.draftId, allocation]),
  );
  const skillMap = new Map(aggregate.skillCatalog.map((entry) => [entry.id, entry]));
  const effectiveMovementModes = (selectedRace?.movementModes ?? []).map((mode) => ({
    ...mode,
    baseValue: getCharacterMovementBaseValue(
      mode.baseValue,
      draft.profile.baseMovementSteps,
    ),
  }));
  const effectiveBaseMagic = getCharacterBaseMagic(
    selectedRace?.race.baseMagic,
    draft.profile.baseMagicSteps,
  );
  function rootSkillFor(allocation: CharacterDraft["skillAllocations"][number]) {
    let cursor = allocation;
    const visited = new Set<number>();
    while (cursor.parentDraftId !== null) {
      if (!visited.add(cursor.draftId)) break;
      const parent = allocations.get(cursor.parentDraftId);
      if (!parent) break;
      cursor = parent;
    }
    return skillMap.get(cursor.skillId) ?? null;
  }
  const skillRows = draft.skillAllocations.flatMap((allocation) => {
    const skill = skillMap.get(allocation.skillId);
    const effectivePoints = getEffectiveSkillPoints(
      allocation.points,
      selectedRace,
      allocation.skillId,
    );
    if (!skill || effectivePoints <= 0) return [];
    const attributeKey = normalizeSkillAttributeKey(skill.primaryAttribute);
    const rank = ranks.get(allocation.draftId) ?? 0;
    const parent =
      allocation.parentDraftId === null
        ? null
        : allocations.get(allocation.parentDraftId) ?? null;
    const parentName = parent ? skillMap.get(parent.skillId)?.name ?? null : null;
    return [
      {
        id: allocation.draftId,
        name: parentName ? `${parentName} → ${skill.name}` : skill.name,
        points: effectivePoints,
        racialPoints: getRacialSkillGrant(selectedRace, skill.id).minimum,
        rank,
        target: attributeKey
          ? getSkillRollTarget(draft.attributes[attributeKey], rank)
          : 100 - rank,
        system: getCharacterMagicSystem(rootSkillFor(allocation) ?? skill),
        special: skill.classification.toLowerCase().includes("special"),
      },
    ];
  });
  const skillSections = [
    {
      key: "core",
      label: "Core Skills",
      rows: skillRows.filter((row) => !row.system && !row.special),
    },
    ...(["Spellcraft", "Talismanism", "Faith", "Psyonics", "Bardic Resonance"] as const).map(
      (system) => ({
        key: system,
        label: system,
        rows: skillRows.filter((row) => row.system === system && !row.special),
      }),
    ),
    {
      key: "special",
      label: "Special Abilities",
      rows: skillRows.filter((row) => row.special),
    },
  ].filter((section) => section.rows.length > 0);
  const purse = getStoredCampaignMoneyBreakdown(
    draft.profile.creditsRemaining,
    aggregate.campaign.currencySystem,
    aggregate.campaign.derivedCurrencies,
    draft.currencyHoldings,
  );
  const currencies = purse.entries;
  const creditEquivalent = getCanonicalCreditsFromHoldings(
    aggregate.campaign.derivedCurrencies,
    draft.currencyHoldings,
  );
  const derivedAbilityResolution = resolveCharacterDerivedAbilities({
    catalog: aggregate.derivedAbilities,
    ownerships: aggregate.derivedAbilityOwnerships,
    attributes: draft.attributes,
    skillPoints: getCharacterSkillPointsById(draft),
    allowedSystems: aggregate.campaign.allowedSystems,
  });

  return (
    <section className="character-sheet character-sheet--tab" aria-label={`${section} character record`}>
      {section === "attributes" ? <>
        <ActiveHealthPanel health={activeHealth} management={false} onHealthChange={onActiveHealthChange} />
        <ActiveManaPanel mana={activeMana} management={false} onManaChange={onActiveManaChange} />
        <ActiveEffectsPanel state={activeEffects} godMode={false} skillOptions={aggregate.skillCatalog.filter(({ archived }) => !archived).map(({ id, name }) => ({ id, name }))} movementModes={selectedRace?.movementModes.map(({ movementMode }) => movementMode) ?? []} onChange={onActiveEffectsChange} />
        <section className="character-sheet__summary-grid" aria-label="Core character record">
          {showAttributeTable ? <article>
            <h3>Attributes</h3>
            <table>
              <thead><tr><th>Attribute</th><th>#</th><th>Mod</th><th>%</th></tr></thead>
              <tbody>
                {CHARACTER_ATTRIBUTE_KEYS.map((key) => (
                  <tr key={key}>
                    <th>{CHARACTER_ATTRIBUTE_LABELS[key]}</th>
                    <td>{displayNumber(draft.attributes[key])}</td>
                    <td>{signedNumber(getAttributeModifier(draft.attributes[key]))}</td>
                    <td>{displayNumber(getAttributeRollTarget(draft.attributes[key]))}%+</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article> : null}
          <article>
            <h3>Movement & Initiative</h3>
            <p>HP Multiplier &times;{hpMultiplier.toFixed(2)} / Base Magic {displayNumber(effectiveBaseMagic)}</p>
            <p className="character-sheet__total"><span>Base Initiative</span><strong>{getBaseInitiative(draft.attributes.DEX)}</strong></p>
            <table><tbody>
              {effectiveMovementModes.map((mode) => (
                <tr key={mode.movementMode}>
                  <th>{mode.movementMode}</th>
                  <td>{displayNumber(mode.baseValue)}×</td>
                  <td>{displayNumber(getMovementInitiative(draft.attributes.DEX, mode.baseValue))} Init.</td>
                </tr>
              ))}
            </tbody></table>
          </article>
        </section>

        {showAttributeTable ? <>
        <section
          className="character-sheet__section character-sheet__web-only-reference"
          aria-labelledby="character-sheet-attribute-reference-title"
        >
          <div className="character-sheet__section-heading">
            <p>ATTRIBUTE SCORE REFERENCE</p>
            <h3 id="character-sheet-attribute-reference-title">
              Live Attribute Reference
            </h3>
            <span>Values shown for each stored Attribute score.</span>
          </div>
          <div className="character-sheet__attribute-reference-grid">
            {attributeReferences.map(({ key, reference, fields }) => (
              <article key={key}>
                <header>
                  <div>
                    <span>{key}</span>
                    <h4>{CHARACTER_ATTRIBUTE_LABELS[key]}</h4>
                  </div>
                  <strong>Score {displayNumber(draft.attributes[key])}</strong>
                </header>
                <dl>
                  {fields.map((field) => {
                    const value = reference?.[field.key] ?? null;
                    return (
                      <div key={field.key}>
                        <dt>{field.label}</dt>
                        <dd>{value === null ? "—" : displayNumber(value)}</dd>
                      </div>
                    );
                  })}
                  {key === "STR" ? (
                    <div>
                      <dt>Encumbrance</dt>
                      <dd>{locations.view ? displayMeasurement(locations.view.carriedWeight, "lb") : displayEncumbrance(encumbrance)}</dd>
                    </div>
                  ) : null}
                </dl>
              </article>
            ))}
          </div>
        </section>

        </> : null}
          <section className="character-sheet__section character-sheet__health">
            <div className="character-sheet__section-heading"><p>BODY TARGET</p><h3>Health & Hit Locations</h3></div>
            <CharacterHitLocationChart totalHp={hp} anatomy={resolveRaceHealthAnatomy(draft.attributes.CON, draft.profile.hpMultiplierSteps, selectedRace?.race.anatomy)} />
          </section>

      </> : null}
      {section === "skills" ? <>
        {showSkillTable ? <>
        <section className="character-sheet__section character-sheet__training">
          <div className="character-sheet__section-heading"><p>TRAINING RECORD</p><h3>Skills & Abilities</h3></div>
          <div className="character-sheet__skill-ledgers">
            {skillSections.map((section) => (
              <article key={section.key}>
                <h4>{section.label}</h4>
                <table><thead><tr><th>Skill</th><th>#</th><th>Rank</th><th>%</th></tr></thead><tbody>
                  {section.rows.map((row) => (
                    <tr key={row.id}><th>{row.name}</th><td>{displayNumber(row.points)}{row.racialPoints ? " R" : ""}</td><td>{displayNumber(row.rank)}</td><td>{displayNumber(row.target)}%+</td></tr>
                  ))}
                </tbody></table>
              </article>
            ))}
          </div>
        </section>

        </> : null}
        <section className="character-sheet__section">
          <div className="character-sheet__section-heading"><h3>Personal Spellbook</h3></div>
          {aggregate.personalSpellbook.length ? <ul>{aggregate.personalSpellbook.map((spell) => <li key={spell.id}><strong>{spell.name}</strong> / {spell.tradition}</li>)}</ul> : <p>No personal spells recorded.</p>}
          {!godMode ? <a href={`/realms/characters/${aggregate.character.id}/spellbook`}>Open Spellbook</a> : null}
        </section>
        <DerivedAbilityPanel
          characterId={aggregate.character.id}
          abilities={aggregate.derivedAbilities}
          statuses={derivedAbilityResolution.statuses}
          skillNames={new Map(aggregate.skillCatalog.map((skill) => [skill.id, skill.name]))}
          godMode={godMode}
          disabled={activeManaDisabled}
          runtimeDisabled={!canOperateRuntime}
          onComplete={onDerivedAbilityChange}
        />

      </> : null}
      {section === "equipment" ? <>
        <OwnedEquipmentList locations={locations} ownerDisabled={equipmentStateDisabled || aggregate.character.archivedAt !== null} aggregate={aggregate} draft={draft} equipment={equipmentState} disabled={equipmentStateDisabled || !canOperateRuntime} useDisabled={itemUseDisabled || !canOperateRuntime} useDisabledReason={itemUseDisabledReason} includeEffectHistory={godMode} onEquipmentChange={onEquipmentStateChange} onEffectsChange={onActiveEffectsChange} onUseComplete={onItemUseComplete} />
        {draft.itemInstances.some(owned => aggregate.authorizedItems.some(item => item.id === owned.itemId && (item.isFirearm || item.isMagazine))) ? <details className="character-equipment-disclosure"><summary>Magazine & Firearm Setup</summary>
          <MagazinePanel characterId={aggregate.character.id} revision={String(aggregate.profile.commerceVersion)} disabled={equipmentStateDisabled || !canOperateRuntime} onChange={onItemUseComplete} />
          <FirearmSetupPanel characterId={aggregate.character.id} equipmentRevision={`${aggregate.profile.commerceVersion}:${JSON.stringify(equipmentState.instances)}`} disabled={equipmentStateDisabled || !canOperateRuntime} compact onChange={onItemUseComplete} />
        </details> : null}
        {chargeState.instances.length ? <details className="character-equipment-disclosure"><summary>Charge Controls</summary>
          <ItemChargePanel state={chargeState} disabled={chargeStateDisabled || !canOperateRuntime} onChange={onChargeStateChange} />
        </details> : null}
        {equipmentState.activeManualPassives.length ? <details className="character-equipment-disclosure"><summary>Effects Requiring a G.O.D. Ruling</summary>{equipmentState.activeManualPassives.map(effect => <article key={effect.passiveEffectId}><h4>{effect.itemName}: {effect.title}</h4><p>{effect.lifecycleLabel}</p><p>{effect.description}</p></article>)}</details> : null}
        <details className="character-equipment-disclosure"><summary>Currency</summary>
        <section className="character-sheet__summary-grid" aria-label="Current currencies">
          <article>
            <h3>Currencies</h3>
            <p className="character-sheet__total">
              <span>{aggregate.campaign.currencySystem}</span>
              <strong>{aggregate.campaign.currencySystem === "Credits" ? purse.formatted : `${displayNumber(creditEquivalent || draft.profile.creditsRemaining)} cr eq.`}</strong>
            </p>
            <table><tbody>
              {currencies.map((entry) => (
                <tr key={entry.id}><th>{entry.name}</th><td>{entry.quantity}</td><td>{displayNumber(entry.creditsPerUnit)} cr each</td></tr>
              ))}
            </tbody></table>
          </article>        </section>
        </details>
      </> : null}
    </section>
  );
}
