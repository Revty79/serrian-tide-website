import {
  CHARACTER_ATTRIBUTE_KEYS,
  CHARACTER_ATTRIBUTE_LABELS,
  type CharacterAggregate,
  type CharacterDraft,
  type CharacterRaceAggregate,
} from "@/features/characters/models";
import { getCharacterAttributeCardDetails } from "@/features/characters/character-attribute-card";
import {
  type CharacterPrintData,
  type CharacterPrintPreset,
  type CharacterPrintSelection,
  type PrintableCharacterOwnedItem,
  type PrintableCharacterSkillSection,
} from "@/features/characters/character-print";
import {
  CHARACTER_HUMANOID_HIT_LOCATIONS,
  getAttributeModifier,
  getAttributeRollTarget,
  getBaseInitiative,
  getCharacterBaseMagic,
  getCharacterHp,
  getCharacterHpBreakdown,
  getCharacterHpMultiplier,
  getCharacterManaProfiles,
  getCharacterMovementBaseValue,
  getMovementInitiative,
} from "@/features/characters/character-rules";
import {
  getCharacterWeaponDamage,
  getCharacterWeaponDamageSummary,
} from "@/features/characters/character-sheet-rules";
import {
  getCanonicalCreditsFromHoldings,
  getStoredCampaignMoneyBreakdown,
} from "@/features/characters/currency-rules";
import { getDerivedAbilityRequirementSummary } from "@/features/derived-abilities/derived-ability-rules";
import { formatDerivedAbilityMechanicalEffectSummary } from "@/features/derived-abilities/derived-ability-effects";

import { CharacterHitLocationSilhouette } from "./character-hit-location-chart";

type Props = {
  aggregate: CharacterAggregate;
  draft: CharacterDraft;
  selectedRace: CharacterRaceAggregate | null;
  preset: CharacterPrintPreset;
  sections: CharacterPrintSelection;
  data: CharacterPrintData;
};

function displayNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function signedNumber(value: number): string {
  return value > 0 ? `+${displayNumber(value)}` : displayNumber(value);
}

function textOrDash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function compactText(value: string | null | undefined, maximum = 120): string {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (normalized.length <= maximum) return normalized;
  return `${normalized.slice(0, maximum - 1).trimEnd()}…`;
}

function PageHeader({
  aggregate,
  draft,
  title,
  detail,
}: {
  aggregate: CharacterAggregate;
  draft: CharacterDraft;
  title: string;
  detail: string;
}) {
  return (
    <header className="print-sheet-header">
      <div>
        <p>SERRIAN TIDE</p>
        <h1>{title}</h1>
      </div>
      <div>
        <strong>{draft.name || "Unnamed Character"}</strong>
        <span>{aggregate.campaign.name}</span>
        <small>{detail}</small>
      </div>
    </header>
  );
}

function PrintSection({
  title,
  eyebrow,
  className = "",
  children,
}: {
  title: string;
  eyebrow?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`print-sheet-section ${className}`.trim()}>
      <header>
        {eyebrow ? <span>{eyebrow}</span> : null}
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}

function SupplementalModule({
  title,
  eyebrow,
  className = "",
  children,
}: {
  title: string;
  eyebrow: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`print-supplemental-module ${className}`.trim()}>
      <header className="print-supplemental-module__header">
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}

function IdentityBand({
  aggregate,
  draft,
  selectedRace,
}: Pick<Props, "aggregate" | "draft" | "selectedRace">) {
  const profile = draft.profile;
  const height =
    profile.heightFeet === null && profile.heightInches === null
      ? "—"
      : `${profile.heightFeet ?? 0} ft ${profile.heightInches ?? 0} in`;
  const fields = [
    ["Player", aggregate.character.playerUsername],
    ["Character", draft.name || "Unnamed Character"],
    ["Campaign", aggregate.campaign.name],
    ["Race", selectedRace?.race.name ?? "—"],
    ["Age", profile.age ?? "—"],
    ["Sex", profile.sex || "—"],
    ["Height", height],
    ["Weight", profile.weight ?? "—"],
    ["Deity", profile.deity || "—"],
    ["Fate", profile.fatePoints ?? "—"],
    ["Fame", profile.fame],
    ["Experience", `${displayNumber(profile.experience)} / ${displayNumber(profile.totalExperience)} total`],
    ["Quintessence", `${displayNumber(profile.quintessence)} / ${displayNumber(profile.totalQuintessence)} total`],
  ];

  return (
    <section className="print-identity-band" aria-label="Character identity">
      <div className="print-identity-band__fields">
        {fields.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {profile.definingMarks.trim() ? (
        <p>
          <strong>Defining Marks / Quirks:</strong>{" "}
          {compactText(profile.definingMarks, 190)}
        </p>
      ) : null}
    </section>
  );
}

function AttributeReference({
  aggregate,
  draft,
  selectedRace,
}: Pick<Props, "aggregate" | "draft" | "selectedRace">) {
  return (
    <PrintSection title="Attributes" eyebrow="CORE ROLLS" className="print-attributes">
      <div className="print-attribute-grid">
        {CHARACTER_ATTRIBUTE_KEYS.map((key) => {
          const score = draft.attributes[key];
          const details = getCharacterAttributeCardDetails(
            aggregate.attributeReferenceCatalog,
            key,
            score,
            selectedRace?.movementModes ?? [],
            draft.profile.hpMultiplierSteps,
            draft.profile.baseMovementSteps,
          );
          return (
            <article key={key}>
              <header>
                <strong>{key}</strong>
                <span>{CHARACTER_ATTRIBUTE_LABELS[key]}</span>
              </header>
              <dl>
                <div><dt>Score</dt><dd>{displayNumber(score)}</dd></div>
                <div><dt>Modifier</dt><dd>{signedNumber(getAttributeModifier(score))}</dd></div>
                <div><dt>Roll</dt><dd>{displayNumber(getAttributeRollTarget(score))}%+</dd></div>
                {details.stats.map((stat) => (
                  <div key={stat.key}>
                    <dt>{stat.label}</dt>
                    <dd>{stat.value === null ? "—" : displayNumber(stat.value)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>
    </PrintSection>
  );
}

function HealthReference({ draft }: Pick<Props, "draft">) {
  const hp = getCharacterHp(
    draft.attributes.CON,
    draft.profile.hpMultiplierSteps,
  );
  const hpMultiplier = getCharacterHpMultiplier(
    draft.profile.hpMultiplierSteps,
  );
  const breakdown = getCharacterHpBreakdown(hp);
  const poolOrder = ["head", "torso", "rightArm", "leftArm", "rightLeg", "leftLeg"];
  const pools = breakdown.pools
    .slice()
    .sort((left, right) => poolOrder.indexOf(left.key) - poolOrder.indexOf(right.key));

  return (
    <PrintSection title="Health & Hit Locations" eyebrow="DAMAGE TRACKING" className="print-health">
      <p className="print-stat-line"><span>Total HP</span><strong>{displayNumber(hp)}</strong></p>
      <p className="print-stat-line"><span>HP Multiplier</span><strong>×{hpMultiplier.toFixed(2)}</strong></p>
      <table>
        <thead><tr><th>Pool</th><th>HP</th><th>Damage</th></tr></thead>
        <tbody>
          {pools.map((pool) => (
            <tr key={pool.key}>
              <th>{pool.key === "torso" ? "Chest / Torso" : pool.name}</th>
              <td>{displayNumber(pool.hp)}</td>
              <td><span className="print-write-line" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintSection>
  );
}

function BodyShotBob() {
  return (
    <PrintSection
      title="Body Shot Bob"
      eyebrow="D10 HIT LOCATION"
      className="print-body-shot-bob"
    >
      <div className="print-body-shot-bob__layout">
        <CharacterHitLocationSilhouette
          className="print-body-shot-bob__silhouette"
          title="Body Shot Bob d10 hit-location target"
        />
        <ol className="print-body-shot-bob__key">
          {CHARACTER_HUMANOID_HIT_LOCATIONS.map((location) => (
            <li key={location.result}>
              <strong>{location.result}</strong>
              <span>{location.name}</span>
            </li>
          ))}
        </ol>
      </div>
    </PrintSection>
  );
}

function MovementReference({
  draft,
  selectedRace,
}: Pick<Props, "draft" | "selectedRace">) {
  const dexterity = draft.attributes.DEX;
  const movementModes = (selectedRace?.movementModes ?? []).map((mode) => ({
    ...mode,
    baseValue: getCharacterMovementBaseValue(
      mode.baseValue,
      draft.profile.baseMovementSteps,
    ),
  }));
  return (
    <PrintSection title="Movement & Initiative" eyebrow="TURN ORDER">
      <p className="print-stat-line">
        <span>Base Initiative</span>
        <strong>{displayNumber(getBaseInitiative(dexterity))}</strong>
      </p>
      <table>
        <thead><tr><th>Mode</th><th>Base</th><th>Initiative</th></tr></thead>
        <tbody>
          {movementModes.map((mode) => (
            <tr key={mode.movementMode}>
              <th>{mode.movementMode}</th>
              <td>{displayNumber(mode.baseValue)}</td>
              <td>{displayNumber(getMovementInitiative(dexterity, mode.baseValue))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintSection>
  );
}

function ManaReference({
  aggregate,
  draft,
  selectedRace,
}: Pick<Props, "aggregate" | "draft" | "selectedRace">) {
  const profiles = getCharacterManaProfiles(
    draft,
    aggregate.skillCatalog,
    selectedRace,
    draft.profile.baseMagicSteps,
  );
  return (
    <PrintSection title="Mana" eyebrow="SUPERNATURAL RESOURCE">
      <p className="print-stat-line">
        <span>Base Magic</span>
        <strong>{displayNumber(getCharacterBaseMagic(selectedRace?.race.baseMagic, draft.profile.baseMagicSteps))}</strong>
      </p>
      {profiles.length ? (
        <table>
          <thead><tr><th>System</th><th>Pool</th><th>Access</th><th>Current / Used</th></tr></thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.system}>
                <th>{profile.system}</th>
                <td>{displayNumber(profile.manaPool)}</td>
                <td>{profile.spellAccessLevel ?? "Below Apprentice"}</td>
                <td><span className="print-write-line" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="print-empty">No supernatural resource currently recorded.</p>
      )}
    </PrintSection>
  );
}

function CurrencyReference({
  aggregate,
  draft,
}: Pick<Props, "aggregate" | "draft">) {
  const purse = getStoredCampaignMoneyBreakdown(
    draft.profile.creditsRemaining,
    aggregate.campaign.currencySystem,
    aggregate.campaign.derivedCurrencies,
    draft.currencyHoldings,
  );
  const creditEquivalent = getCanonicalCreditsFromHoldings(
    aggregate.campaign.derivedCurrencies,
    draft.currencyHoldings,
  );
  const entries = purse.entries.filter(({ quantity }) => quantity !== 0);
  return (
    <PrintSection title="Currency" eyebrow={aggregate.campaign.currencySystem.toUpperCase()}>
      {entries.length ? (
        <table><tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <th>{entry.name}</th>
              <td>{displayNumber(entry.quantity)}</td>
              <td>{displayNumber(entry.creditsPerUnit)} cr each</td>
            </tr>
          ))}
        </tbody></table>
      ) : (
        <p className="print-stat-line"><span>Current</span><strong>{purse.formatted}</strong></p>
      )}
      {aggregate.campaign.currencySystem === "Derived Currency" ? (
        <p className="print-small-note">{displayNumber(creditEquivalent)} credit equivalent</p>
      ) : null}
    </PrintSection>
  );
}

function WeaponTable({
  rows,
  draft,
}: {
  rows: readonly PrintableCharacterOwnedItem[];
  draft: CharacterDraft;
}) {
  return (
    <table className="print-combat-table">
      <thead><tr><th>Weapon</th><th>Qty</th><th>%</th><th>Damage</th><th>Mod</th><th>Total</th><th>Type</th><th>Range / Reach</th><th>Dur.</th></tr></thead>
      <tbody>
        {rows.map(({ rowKey, displayName, owned, item }) => {
          const profile = item ? getCharacterWeaponDamage(item) : null;
          const damage = item
            ? getCharacterWeaponDamageSummary(item, draft.attributes)
            : null;
          return (
            <tr key={rowKey}>
              <th>{displayName}{profile?.sourceName ? <small> · {profile.sourceName}</small> : null}</th>
              <td>{owned.quantity}</td>
              <td><span className="print-write-line is-short" /></td>
              <td>{profile?.damage || "—"}</td>
              <td>{damage?.modifier ?? "—"}</td>
              <td>{damage?.totalDamage ?? "—"}</td>
              <td>{profile?.damageType || "—"}</td>
              <td>{[item?.rangeText, item?.reachText].filter(Boolean).join(" / ") || "—"}</td>
              <td>{item?.durability ?? "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ArmorTable({ rows }: { rows: readonly PrintableCharacterOwnedItem[] }) {
  return (
    <table className="print-combat-table">
      <thead><tr><th>Armor</th><th>Qty</th><th>Coverage</th><th>Dur.</th><th>Soak</th><th>Properties / Rules</th></tr></thead>
      <tbody>
        {rows.map(({ rowKey, displayName, owned, item }) => (
          <tr key={rowKey}>
            <th>{displayName}</th>
            <td>{owned.quantity}</td>
            <td>{item?.coverage || "—"}</td>
            <td>{item?.durability ?? "—"}</td>
            <td>{item?.baseSoak ?? "—"}</td>
            <td>{compactText(item?.armorRulesText || item?.armorDamageModifiers || item?.description, 90) || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function QuickRolls({ data }: Pick<Props, "data">) {
  return (
    <PrintSection title="Quick Rolls" eyebrow="DETERMINISTIC DEVELOPED SKILLS" className="print-quick-rolls">
      <table>
        <thead><tr><th>Skill</th><th>#</th><th>Rank</th><th>%</th></tr></thead>
        <tbody>
          {data.quickRolls.map((row) => (
            <tr key={row.id}>
              <th>{row.name}</th>
              <td>{displayNumber(row.points)}{row.racialPoints ? " R" : ""}</td>
              <td>{displayNumber(row.rank)}</td>
              <td>{displayNumber(row.target)}%+</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintSection>
  );
}

function WritableArea({ title, lines = 4 }: { title: string; lines?: number }) {
  return (
    <PrintSection title={title} className="print-writable-area">
      <div>{Array.from({ length: lines }, (_, index) => <span key={index} />)}</div>
    </PrintSection>
  );
}

function SkillTables({
  sections,
  compact = false,
}: {
  sections: readonly PrintableCharacterSkillSection[];
  compact?: boolean;
}) {
  return (
    <div className={compact ? "print-skill-columns is-compact" : "print-skill-columns"}>
      {sections.map((section) => (
        <section key={section.key} className="print-skill-group">
          <h3>{section.label}</h3>
          <table>
            <thead><tr><th>Skill</th><th>#</th><th>Rank</th><th>%</th></tr></thead>
            <tbody>
              {section.rows.map((row) => (
                <tr key={row.id}>
                  <th>{row.name}</th>
                  <td>{displayNumber(row.points)}{row.racialPoints ? " R" : ""}</td>
                  <td>{displayNumber(row.rank)}</td>
                  <td>{displayNumber(row.target)}%+</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function CompactPowers({ data }: Pick<Props, "data">) {
  const spells = data.spells.slice(0, 6);
  const abilities = [
    ...data.supernaturalAbilities,
    ...data.specialAbilities,
  ].slice(0, 8);
  if (!spells.length && !abilities.length) return null;
  return (
    <PrintSection title="Powers & Abilities" eyebrow="COMPACT TABLETOP REFERENCE">
      <div className="print-compact-powers">
        {spells.map((spell) => (
          <article key={spell.key}>
            <h3>{spell.name}</h3>
            <p>{spell.system} · {spell.manaCost} Mana · {spell.mastery}</p>
            {spell.summary ? <span>{compactText(spell.summary, 150)}</span> : null}
          </article>
        ))}
        {abilities.map((ability) => (
          <article key={`ability:${ability.id}`}>
            <h3>{ability.name}</h3>
            <p>{ability.system} · Rank {displayNumber(ability.rank)} · {displayNumber(ability.target)}%+</p>
            {ability.summary ? <span>{compactText(ability.summary, 150)}</span> : null}
          </article>
        ))}
      </div>
    </PrintSection>
  );
}

function itemPriority(row: PrintableCharacterOwnedItem): number {
  const text = [
    row.item?.name,
    row.item?.recordType,
    row.item?.category,
  ].join(" ").toLowerCase();
  return /ammunition|ammo|consumable|potion|dose|charge/.test(text) ? 0 : 1;
}

function CompactInventory({ data }: Pick<Props, "data">) {
  if (!data.inventory.length) return null;
  const rows = data.inventory
    .slice()
    .sort(
      (left, right) =>
        itemPriority(left) - itemPriority(right) ||
        (left.item?.name ?? "").localeCompare(right.item?.name ?? ""),
    )
    .slice(0, 12);
  return (
    <PrintSection title="Compact Inventory" eyebrow="AMMUNITION & TABLETOP SUPPLIES">
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Weight</th><th>Type</th><th>Short Notes</th></tr></thead>
        <tbody>
          {rows.map(({ rowKey, displayName, stateSummary, owned, item }) => (
            <tr key={rowKey}>
              <th>{displayName}</th>
              <td>{owned.quantity}</td>
              <td>{item?.weight === null || item?.weight === undefined ? "—" : `${displayNumber(item.weight * owned.quantity)} ${item.weightUnit}`}</td>
              <td>{item?.recordType || item?.category || "Item"}</td>
              <td>{stateSummary || compactText(item?.description || item?.weaponRulesText || item?.armorRulesText, 80) || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.inventory.length > rows.length ? (
        <p className="print-small-note">+ {data.inventory.length - rows.length} more owned items in Full Tabletop Character.</p>
      ) : null}
    </PrintSection>
  );
}

function QuickReferencePageOne(props: Props) {
  const { aggregate, draft, selectedRace, data } = props;
  return (
    <section className="print-page print-page--quick-one">
      <PageHeader aggregate={aggregate} draft={draft} title="Tabletop Quick Reference" detail="Page 1 · Active Play Dashboard" />
      <IdentityBand aggregate={aggregate} draft={draft} selectedRace={selectedRace} />
      <AttributeReference aggregate={aggregate} draft={draft} selectedRace={selectedRace} />
      <div className="print-page-one-grid">
        <div>
          <HealthReference draft={draft} />
          <BodyShotBob />
          <MovementReference draft={draft} selectedRace={selectedRace} />
          <ManaReference aggregate={aggregate} draft={draft} selectedRace={selectedRace} />
          <CurrencyReference aggregate={aggregate} draft={draft} />
        </div>
        <div>
          <PrintSection title="Weapons" eyebrow="COMBAT">
            {data.weapons.length ? <WeaponTable rows={data.weapons} draft={draft} /> : <p className="print-empty">No weapons currently owned.</p>}
          </PrintSection>
          <PrintSection title="Armor" eyebrow="PROTECTION">
            {data.armor.length ? <ArmorTable rows={data.armor} /> : <p className="print-empty">No armor currently owned.</p>}
          </PrintSection>
          <QuickRolls data={data} />
          <WritableArea title="Status Effects / Temporary Conditions" lines={5} />
        </div>
      </div>
    </section>
  );
}

function QuickReferencePageTwo(props: Props) {
  const { aggregate, draft, data } = props;
  return (
    <section className="print-page print-page--quick-two">
      <PageHeader aggregate={aggregate} draft={draft} title="Tabletop Quick Reference" detail="Page 2 · Detailed Tabletop Reference" />
      <PrintSection title="Full Skill Roll Reference" eyebrow="ALL DEVELOPED & RACIALLY GRANTED SKILLS">
        <SkillTables sections={data.skillSections} compact />
      </PrintSection>
      <div className="print-page-two-grid">
        <CompactPowers data={data} />
        <CompactInventory data={data} />
      </div>
      <WritableArea title="Notes" lines={8} />
    </section>
  );
}

function SupplementalSkills(props: Props) {
  if (!props.sections.skills || props.sections.quick || !props.data.skills.length) return null;
  return (
    <SupplementalModule title="Full Skill Reference" eyebrow="COMPLETE DEVELOPED SKILLS">
      <SkillTables sections={props.data.skillSections} />
    </SupplementalModule>
  );
}

function SupplementalPowers(props: Props) {
  const showPowers = props.sections.powers && (props.data.spells.length || props.data.supernaturalAbilities.length);
  const showSpecial = props.sections.specialAbilities && props.data.specialAbilities.length;
  if (!showPowers && !showSpecial) return null;
  const abilities = [
    ...(showPowers ? props.data.supernaturalAbilities : []),
    ...(showSpecial ? props.data.specialAbilities : []),
  ];
  return (
    <SupplementalModule
      title="Spellbook, Powers & Abilities"
      eyebrow="COMPLETE MECHANICAL REFERENCE"
      className="print-supplemental-module--powers"
    >
      {showPowers && props.data.spells.length ? (
        <PrintSection title="Spellbook" eyebrow="ACTUAL KNOWN & PERSONAL SPELLS">
          <div className="print-full-spellbook">
            {props.data.spells.map((spell) => (
              <article key={spell.key}>
                <header><div><span>{spell.source}</span><h3>{spell.name}</h3></div><strong>{spell.system}</strong></header>
                <dl>
                  <div><dt>Framework</dt><dd>{spell.framework}</dd></div>
                  <div><dt>Mana</dt><dd>{spell.manaCost}</dd></div>
                  <div><dt>Mastery</dt><dd>{spell.mastery}</dd></div>
                  <div><dt>Combat Cast</dt><dd>{displayNumber(spell.combatCastingTime)}</dd></div>
                  <div><dt>Out of Combat</dt><dd>{displayNumber(spell.outOfCombatCastingTimeSeconds)} sec</dd></div>
                  <div><dt>Access</dt><dd>{spell.accessLevel ?? "—"}</dd></div>
                  {spell.rank !== null ? <div><dt>Rank / Roll</dt><dd>{displayNumber(spell.rank)} / {spell.target === null ? "—" : `${displayNumber(spell.target)}%+`}</dd></div> : null}
                </dl>
                {spell.summary ? <p>{spell.summary}</p> : null}
                {spell.notes ? <p><strong>Notes:</strong> {spell.notes}</p> : null}
                {spell.components.length ? <ul>{spell.components.map((component, index) => <li key={`${spell.key}:component:${index}`}><strong>{component.label}</strong>{component.detail ? ` · ${component.detail}` : ""} · {displayNumber(component.cost)} Mana</li>)}</ul> : null}
                {spell.progressive.length ? <div className="print-progressive"><strong>Progressive Tiers</strong>{spell.progressive.map((tier) => <p key={`${spell.key}:${tier.tierName}`}><b>{tier.tierName}</b>{tier.condition ? ` · ${tier.condition}` : ""}{tier.description ? ` · ${tier.description}` : ""}</p>)}</div> : null}
              </article>
            ))}
          </div>
        </PrintSection>
      ) : null}
      {abilities.length ? (
        <PrintSection title="Powers & Special Abilities" eyebrow="DEVELOPED CHARACTER ABILITIES">
          <table>
            <thead><tr><th>Name</th><th>System</th><th>#</th><th>Rank</th><th>%</th><th>Rules</th></tr></thead>
            <tbody>
              {abilities.map((ability) => (
                <tr key={ability.id}>
                  <th>{ability.name}</th><td>{ability.system}</td><td>{displayNumber(ability.points)}</td><td>{displayNumber(ability.rank)}</td><td>{displayNumber(ability.target)}%+</td><td>{ability.summary || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PrintSection>
      ) : null}
    </SupplementalModule>
  );
}

function SupplementalDerivedAbilities(props: Props) {
  if (!props.sections.derivedAbilities || !props.data.derivedAbilities.length) return null;
  const references = {
    skillNames: new Map(
      props.aggregate.skillCatalog.map((skill) => [skill.id, skill.name]),
    ),
    derivedAbilityNames: new Map(
      props.aggregate.derivedAbilities.map((ability) => [ability.id, ability.name]),
    ),
  };
  return (
    <SupplementalModule title="Derived Abilities" eyebrow="ACTIVE DERIVED ABILITIES">
      <PrintSection title="Derived Abilities" eyebrow="CURRENT LIVE REQUIREMENTS">
        <table>
          <thead><tr><th>Name</th><th>Requirement</th><th>Description</th><th>Rules Text</th></tr></thead>
          <tbody>
            {props.data.derivedAbilities.map(({ ability, status }) => (
              <tr key={ability.id}>
                <th>{ability.name}{status.available ? "" : " · KNOWN, UNAVAILABLE"}</th>
                <td>{getDerivedAbilityRequirementSummary(ability, references)}</td>
                <td>{ability.description || "—"}</td>
                <td>{[
                  ability.mechanicalEffect,
                  ...ability.effects.map(formatDerivedAbilityMechanicalEffectSummary),
                ].filter(Boolean).join("; ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PrintSection>
    </SupplementalModule>
  );
}

function SupplementalInventory(props: Props) {
  if (!props.sections.inventory || !props.data.ownedItems.length) return null;
  return (
    <SupplementalModule title="Complete Inventory" eyebrow="EVERY CURRENTLY OWNED ITEM">
      <PrintSection title="Owned Items" eyebrow="NO CROSS-UNIT WEIGHT CONVERSIONS">
        <table>
          <thead><tr><th>Item</th><th>Qty</th><th>Weight</th><th>Catalog</th><th>Type</th><th>Notes / Rules</th></tr></thead>
          <tbody>
            {props.data.ownedItems.map(({ rowKey, displayName, stateSummary, owned, item }) => (
              <tr key={rowKey}>
                <th>{displayName}</th>
                <td>{owned.quantity}</td>
                <td>{item?.weight === null || item?.weight === undefined ? "—" : `${displayNumber(item.weight * owned.quantity)} ${item.weightUnit}`}</td>
                <td>{item?.equipmentGroup || item?.catalogScope || "Inventory"}</td>
                <td>{item?.recordType || item?.category || "Item"}</td>
                <td>{stateSummary || item?.description || item?.weaponRulesText || item?.armorRulesText || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PrintSection>
    </SupplementalModule>
  );
}

function SupplementalEquipment(props: Props) {
  if (!props.sections.equipment || (!props.data.weapons.length && !props.data.armor.length)) return null;
  return (
    <SupplementalModule title="Equipment Detail" eyebrow="WEAPONS, AMMUNITION RESOLUTION, AND ARMOR">
      {props.data.weapons.length ? <PrintSection title="Weapons" eyebrow="COMPLETE COMBAT EQUIPMENT"><WeaponTable rows={props.data.weapons} draft={props.draft} />{props.data.weapons.map(({ owned, item }) => item?.weaponRulesText || item?.description ? <p className="print-equipment-note" key={`weapon:${owned.itemId}`}><strong>{item.name}:</strong> {item.weaponRulesText || item.description}</p> : null)}</PrintSection> : null}
      {props.data.armor.length ? <PrintSection title="Armor" eyebrow="COMPLETE PROTECTION"><ArmorTable rows={props.data.armor} />{props.data.armor.map(({ owned, item }) => item?.armorRulesText || item?.description ? <p className="print-equipment-note" key={`armor:${owned.itemId}`}><strong>{item.name}:</strong> {item.armorRulesText || item.description}</p> : null)}</PrintSection> : null}
    </SupplementalModule>
  );
}

function SupplementalStory(props: Props) {
  if (!props.sections.story) return null;
  const profile = props.draft.profile;
  const sections = [
    ["Personality", profile.personality],
    ["Goals", profile.goals],
    ["Motivations", profile.motivations],
    ["Secrets", profile.secrets],
    ["Backstory", profile.backstory],
    ["Defining Marks / Character Quirks", profile.definingMarks],
  ].filter(([, value]) => value.trim());
  return (
    <SupplementalModule title="Profile & Story Archive" eyebrow="COMPLETE CHARACTER RECORD" className="print-supplemental-module--story">
      <PrintSection title="Physical Profile" eyebrow="STORED CHARACTER DETAILS">
        <div className="print-profile-grid">
          {[
            ["Age", profile.age], ["Sex", profile.sex], ["Height (ft)", profile.heightFeet], ["Height (in)", profile.heightInches], ["Weight", profile.weight], ["Skin", profile.skinColor], ["Eyes", profile.eyeColor], ["Hair", profile.hairColor], ["Deity", profile.deity], ["Fate", profile.fatePoints], ["Fame", profile.fame],
          ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{textOrDash(value)}</strong></div>)}
        </div>
      </PrintSection>
      {props.selectedRace ? (
        <PrintSection title={props.selectedRace.race.name} eyebrow="RACE RECORD">
          <div className="print-profile-grid">
            <div><span>Size</span><strong>{textOrDash(props.selectedRace.race.size)}</strong></div>
            <div><span>Effective Base Magic</span><strong>{displayNumber(getCharacterBaseMagic(props.selectedRace.race.baseMagic, profile.baseMagicSteps))}</strong></div>
            <div><span>Age Range</span><strong>{textOrDash(props.selectedRace.race.ageRangeText)}</strong></div>
            <div><span>Racial Quirk</span><strong>{textOrDash(props.selectedRace.race.racialQuirkName)}</strong></div>
          </div>
          {props.selectedRace.race.physicalDescription ? <p>{props.selectedRace.race.physicalDescription}</p> : null}
          {props.selectedRace.race.quirkSuccessEffect ? <p><strong>Quirk Success:</strong> {props.selectedRace.race.quirkSuccessEffect}</p> : null}
          {props.selectedRace.race.quirkFailureEffect ? <p><strong>Quirk Failure:</strong> {props.selectedRace.race.quirkFailureEffect}</p> : null}
        </PrintSection>
      ) : null}
      <div className="print-story-grid">
        {sections.map(([label, value]) => <article key={label}><h2>{label}</h2><p>{value}</p></article>)}
      </div>
    </SupplementalModule>
  );
}

function SupplementalFlow(props: Props) {
  const hasSkills = props.sections.skills && !props.sections.quick && props.data.skills.length > 0;
  const hasPowers =
    (props.sections.powers && (props.data.spells.length > 0 || props.data.supernaturalAbilities.length > 0)) ||
    (props.sections.specialAbilities && props.data.specialAbilities.length > 0);
  const hasDerivedAbilities = props.sections.derivedAbilities && props.data.derivedAbilities.length > 0;
  const hasInventory = props.sections.inventory && props.data.ownedItems.length > 0;
  const hasEquipment = props.sections.equipment && (props.data.weapons.length > 0 || props.data.armor.length > 0);
  const hasStory = props.sections.story;
  if (!hasSkills && !hasPowers && !hasDerivedAbilities && !hasInventory && !hasEquipment && !hasStory) return null;

  const title = props.preset === "complete"
    ? "Complete Character Record"
    : props.preset === "full"
      ? "Full Tabletop Character"
      : "Custom Character Print";
  const detail = props.preset === "complete"
    ? "Supplemental mechanics, profile, and story"
    : props.preset === "full"
      ? "Supplemental mechanical detail"
      : "Selected supplemental sections";

  return (
    <section className={`print-supplemental-flow${props.sections.quick ? " print-supplemental-flow--after-quick" : ""}`}>
      <PageHeader aggregate={props.aggregate} draft={props.draft} title={title} detail={detail} />
      <SupplementalSkills {...props} />
      <SupplementalPowers {...props} />
      <SupplementalDerivedAbilities {...props} />
      <SupplementalInventory {...props} />
      <SupplementalEquipment {...props} />
      <SupplementalStory {...props} />
    </section>
  );
}

export function PrintableCharacterSheet(props: Props) {
  const hasSelection = Object.values(props.sections).some(Boolean);
  return (
    <div
      className="printable-character-sheet"
      data-print-preset={props.preset}
      aria-hidden="true"
    >
      {hasSelection ? (
        <>
          {props.sections.quick ? <QuickReferencePageOne {...props} /> : null}
          {props.sections.quick ? <QuickReferencePageTwo {...props} /> : null}
          <SupplementalFlow {...props} />
        </>
      ) : null}
    </div>
  );
}
