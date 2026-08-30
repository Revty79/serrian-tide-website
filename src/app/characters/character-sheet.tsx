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
  getCharacterHp,
  getCharacterHpBreakdown,
  getCharacterHpMultiplier,
  getCharacterMagicSystem,
  getCharacterManaProfiles,
  getCharacterSkillRanks,
  getEffectiveSkillPoints,
  getMovementInitiative,
  getRacialSkillGrant,
  getSkillRollTarget,
  normalizeSkillAttributeKey,
} from "@/features/characters/character-rules";
import {
  getCharacterEncumbrance,
  getCharacterWeaponDamage,
  getCharacterWeaponDamageSummary,
} from "@/features/characters/character-sheet-rules";
import {
  getCanonicalCreditsFromHoldings,
  getStoredCampaignMoneyBreakdown,
} from "@/features/characters/currency-rules";

import { CharacterHitLocationChart } from "./character-hit-location-chart";
import { CharacterPrintCenter } from "./character-print-center";

type Props = {
  aggregate: CharacterAggregate;
  draft: CharacterDraft;
  selectedRace: CharacterAggregate["selectedRace"];
  ready: boolean;
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

export function CharacterSheet({ aggregate, draft, selectedRace, ready }: Props) {
  const hp = getCharacterHp(
    draft.attributes.CON,
    draft.profile.hpMultiplierSteps,
  );
  const hpMultiplier = getCharacterHpMultiplier(
    draft.profile.hpMultiplierSteps,
  );
  const encumbrance = getCharacterEncumbrance(aggregate.items);
  const attributeReferences = CHARACTER_ATTRIBUTE_REFERENCE_KEYS.map((key) => ({
    key,
    reference: getAttributeReference(
      aggregate.attributeReferenceCatalog,
      key,
      draft.attributes[key],
    ),
    fields: getAttributeReferenceFields(key),
  }));
  const hpBreakdown = getCharacterHpBreakdown(hp);
  const hitResultsByPool = new Map(
    hpBreakdown.pools.map((pool) => [
      pool.key,
      hpBreakdown.locations
        .filter((location) => location.poolKey === pool.key)
        .map((location) => location.result)
        .join("/"),
    ]),
  );
  const ranks = getCharacterSkillRanks(draft, aggregate.skillCatalog, selectedRace);
  const allocations = new Map(
    draft.skillAllocations.map((allocation) => [allocation.draftId, allocation]),
  );
  const skillMap = new Map(aggregate.skillCatalog.map((entry) => [entry.id, entry]));
  const itemMap = new Map(aggregate.authorizedItems.map((entry) => [entry.id, entry]));
  const ownedItems = draft.items.map((owned) => ({
    owned,
    item: itemMap.get(owned.itemId) ?? null,
  }));
  const weaponRows = ownedItems.filter(
    ({ item }) => item?.equipmentGroup === "weapon" || Boolean(item?.weaponType),
  );
  const armorRows = ownedItems.filter(
    ({ item }) => item?.equipmentGroup === "armor" || Boolean(item?.armorType),
  );
  const combatItemIds = new Set(
    [...weaponRows, ...armorRows].map(({ owned }) => owned.itemId),
  );
  const generalRows = ownedItems.filter(({ owned }) => !combatItemIds.has(owned.itemId));
  const manaProfiles = getCharacterManaProfiles(
    draft,
    aggregate.skillCatalog,
    selectedRace,
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
  const story = [
    ["Personality", draft.profile.personality],
    ["Goals", draft.profile.goals],
    ["Secrets", draft.profile.secrets],
    ["Backstory", draft.profile.backstory],
    ["Motivations", draft.profile.motivations],
  ].filter(([, value]) => value.trim());

  return (
    <div className="character-sheet-wrap">
      <CharacterPrintCenter
        aggregate={aggregate}
        draft={draft}
        selectedRace={selectedRace}
      />

      <section className="character-sheet" aria-labelledby="character-sheet-title">
        <header>
          <div>
            <p>SERRIAN TIDE CHARACTER RECORD</p>
            <h2 id="character-sheet-title">{draft.name || "Unnamed Character"}</h2>
            <span>
              {[selectedRace?.race.name, aggregate.campaign.name, aggregate.character.playerUsername]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <strong>{ready ? "CHARACTER READY" : "CHARACTER RECORD"}</strong>
        </header>

        <section className="character-sheet__identity" aria-label="Character identity">
          {[
            ["Age", draft.profile.age ?? "—"],
            ["Sex", draft.profile.sex || "—"],
            [
              "Height",
              draft.profile.heightFeet === null && draft.profile.heightInches === null
                ? "—"
                : `${draft.profile.heightFeet ?? 0} ft ${draft.profile.heightInches ?? 0} in`,
            ],
            ["Weight", draft.profile.weight ?? "—"],
            ["Deity", draft.profile.deity || "—"],
            ["Fate Points", draft.profile.fatePoints ?? "—"],
            ["Defining Marks & Quirks", draft.profile.definingMarks || "—"],
          ].map(([label, value]) => (
            <div key={label} className={label === "Defining Marks & Quirks" ? "is-wide" : undefined}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </section>

        <section className="character-sheet__summary-grid" aria-label="Core character record">
          <article>
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
          </article>
          <article>
            <h3>Hit Points</h3>
            <p className="character-sheet__total"><span>Total HP</span><strong>{displayNumber(hp)}</strong></p>
            <p className="character-sheet__total"><span>HP Multiplier</span><strong>×{hpMultiplier.toFixed(2)}</strong></p>
            <table>
              <thead><tr><th>Location</th><th>HP</th><th>Damage</th></tr></thead>
              <tbody>
                {hpBreakdown.pools.map((pool) => (
                  <tr key={pool.key}>
                    <th>{hitResultsByPool.get(pool.key)} · {pool.name}</th>
                    <td>{pool.hp}</td>
                    <td className="character-sheet__write-in"><span /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
          <article>
            <h3>Movement & Initiative</h3>
            <p className="character-sheet__total"><span>Base Initiative</span><strong>{getBaseInitiative(draft.attributes.DEX)}</strong></p>
            <table><tbody>
              {(selectedRace?.movementModes ?? []).map((mode) => (
                <tr key={mode.movementMode}>
                  <th>{mode.movementMode}</th>
                  <td>{displayNumber(mode.baseValue)}×</td>
                  <td>{displayNumber(getMovementInitiative(draft.attributes.DEX, mode.baseValue))} Init.</td>
                </tr>
              ))}
            </tbody></table>
          </article>
          <article>
            <h3>Mana</h3>
            <p className="character-sheet__total"><span>Base Magic</span><strong>{displayNumber(selectedRace?.race.baseMagic ?? 0)}</strong></p>
            <table><tbody>
              {manaProfiles.map((profile) => (
                <tr key={profile.system}>
                  <th>{profile.system}</th>
                  <td>{displayNumber(profile.manaPool)}</td>
                  <td>{profile.spellAccessLevel ?? "Below Apprentice"}</td>
                </tr>
              ))}
            </tbody></table>
          </article>
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
          </article>
          <article>
            <h3>Advancement Resources</h3>
            <table><tbody>
              <tr><th>Experience</th><td>{displayNumber(draft.profile.experience)}</td><td>Total {displayNumber(draft.profile.totalExperience)}</td></tr>
              <tr><th>Quintessence</th><td>{displayNumber(draft.profile.quintessence)}</td><td>Total {displayNumber(draft.profile.totalQuintessence)}</td></tr>
              <tr><th>Fame</th><td>{displayNumber(draft.profile.fame)}</td><td /></tr>
            </tbody></table>
          </article>
        </section>

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
                      <dd>{displayEncumbrance(encumbrance)}</dd>
                    </div>
                  ) : null}
                </dl>
              </article>
            ))}
          </div>
        </section>

        <div className="character-sheet__play-reference">
          <section className="character-sheet__section character-sheet__health">
            <div className="character-sheet__section-heading"><p>BODY TARGET</p><h3>Health & Hit Locations</h3></div>
            <CharacterHitLocationChart totalHp={hp} />
          </section>

          <section className="character-sheet__section character-sheet__combat">
            <div className="character-sheet__section-heading"><p>COMBAT RECORD</p><h3>Weapons & Armor</h3></div>
            <h4>Weapons</h4>
            <div className="character-sheet__table-scroll">
              <table><thead><tr><th>Weapon</th><th>Qty</th><th>%</th><th>Damage</th><th>Mod</th><th>Total</th><th>Type</th><th>Range / Reach</th><th>Dur.</th></tr></thead><tbody>
                {weaponRows.map(({ owned, item }) => {
                  const profile = item ? getCharacterWeaponDamage(item) : null;
                  const damage = item
                    ? getCharacterWeaponDamageSummary(item, draft.attributes)
                    : null;
                  return (
                    <tr key={owned.itemId}><th>{item?.name ?? `Item ${owned.itemId}`}{profile?.sourceName ? <small> · {profile.sourceName}</small> : null}</th><td>{owned.quantity}</td><td className="character-sheet__write-in"><span /></td><td>{profile?.damage || "—"}</td><td>{damage?.modifier ?? "—"}</td><td>{damage?.totalDamage ?? "—"}</td><td>{profile?.damageType || "—"}</td><td>{[item?.rangeText, item?.reachText].filter(Boolean).join(" / ") || "—"}</td><td>{item?.durability ?? "—"}</td></tr>
                  );
                })}
              </tbody></table>
            </div>
            <h4>Armor</h4>
            <div className="character-sheet__table-scroll">
              <table><thead><tr><th>Armor</th><th>Qty</th><th>Type</th><th>Coverage</th><th>Durability</th><th>Soak</th><th>Rules</th></tr></thead><tbody>
                {armorRows.map(({ owned, item }) => (
                  <tr key={owned.itemId}><th>{item?.name ?? `Item ${owned.itemId}`}</th><td>{owned.quantity}</td><td>{item?.armorType || item?.recordType || "—"}</td><td>{item?.coverage || "—"}</td><td>{item?.durability ?? "—"}</td><td>{item?.baseSoak ?? "—"}</td><td>{item?.armorRulesText || item?.armorDamageModifiers || "—"}</td></tr>
                ))}
              </tbody></table>
            </div>
          </section>
        </div>

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

        <section className="character-sheet__section character-sheet__inventory">
          <div className="character-sheet__section-heading"><p>POSSESSIONS</p><h3>Inventory & General Equipment</h3></div>
          <div className="character-sheet__table-scroll">
            <table><thead><tr><th>Item</th><th>Catalog</th><th>Type</th><th>Qty</th><th>Weight</th><th>Unit Cost</th><th>Total</th></tr></thead><tbody>
              {generalRows.map(({ owned, item }) => (
                <tr key={owned.itemId}><th>{item?.name ?? `Item ${owned.itemId}`}</th><td>{item?.equipmentGroup || item?.catalogScope || "Inventory"}</td><td>{item?.recordType || item?.category || "Item"}</td><td>{owned.quantity}</td><td>{item?.weight === null || item?.weight === undefined ? "—" : `${displayNumber(item.weight * owned.quantity)} ${item.weightUnit}`}</td><td>{displayNumber(owned.unitCostCredits)} cr</td><td>{displayNumber(owned.quantity * owned.unitCostCredits)} cr</td></tr>
              ))}
            </tbody></table>
          </div>
        </section>

        {story.length ? (
          <section className="character-sheet__section character-sheet__story-section">
            <div className="character-sheet__section-heading"><p>CHARACTER NOTES</p><h3>Story & Personality</h3></div>
            <div className="character-sheet__story">
              {story.map(([label, value]) => <article key={label}><h4>{label}</h4><p>{value}</p></article>)}
            </div>
          </section>
        ) : null}
      </section>
    </div>
  );
}
