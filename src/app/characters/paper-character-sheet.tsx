import { type ReactNode } from "react";
import { arrangePaperSkillGroups, paperNumber as n, paperSigned, type PaperCharacterData } from "@/features/characters/paper-character";
import { CharacterHitLocationSilhouette } from "./character-hit-location-chart";
import { PaperSheetMasthead } from "./paper-sheet-masthead";

export type PaperReferences = { spells: boolean; skills: boolean; items: boolean; story: boolean };
export const NO_PAPER_REFERENCES: PaperReferences = { spells: false, skills: false, items: false, story: false };
function Table({ headings, children, className = "" }: { headings: string[]; children: ReactNode; className?: string }) {
  return <table className={className}><thead><tr>{headings.map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody>{children}</tbody></table>;
}
function Lines({ count = 2 }: { count?: number }) { return <div className="paper-pencil" aria-label="Pencil notes">{Array.from({ length: count }, (_, i) => <div key={i} />)}</div>; }
function Text({ children }: { children: ReactNode }) { return <p data-paper-check="text">{children}</p>; }
function Box({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) { return <section className={`paper-box ${className}`}><h2>{title}</h2><div className="paper-box-content">{children}</div></section>; }
const cssText = (value: string) => JSON.stringify(value.replace(/[\r\n]/g, " ")).replaceAll("<", "\\3c ");
const leaf = (name: string) => name.split(" → ").at(-1);
const target = (value: number | null) => value == null ? "—" : `${n(value)}%+`;

function OwnedInventory({ data: d }: { data: PaperCharacterData }) {
  const hasStatus = d.inventory.some((item) => item.status);
  return <Box title="Owned inventory"><Table headings={["Item", "Qty", "Equipment state", ...(hasStatus ? ["Charges / ammunition"] : [])]} className={`paper-inventory${hasStatus ? " paper-inventory-status" : ""}`}>
    {d.inventory.map((row) => <tr key={row.key} data-paper-check="row" data-paper-row={row.id}><th>{row.name}</th><td>{row.quantity}</td><td>{row.state}</td>{hasStatus ? <td>{row.status || "—"}</td> : null}</tr>)}
  </Table><div className="paper-currency"><b>Currency</b>{d.currency.map((row) => <span key={row.name}>{row.name}: <b>{n(row.quantity)}</b></span>)}<span className="paper-inline-write">Change</span></div><p className="paper-caption">State quantities are included in Qty.{hasStatus ? " Exact copies keep separate charges." : ""}</p></Box>;
}

function SkillTable({ rows }: { rows: ReturnType<typeof arrangePaperSkillGroups<PaperCharacterData['skills'][number]>>[number]['rows'] }) {
  return <Table headings={["Skill", "Pts", "Rank", "Target"]} className="paper-skills">{rows.map((row) => <tr key={row.id} data-paper-check="row" data-paper-row={row.reference}><th style={{paddingLeft: `${3 + row.displayDepth * 8}pt`}}>{row.displayName}</th><td>{n(row.points)}{row.racialPoints ? " R" : ""}</td><td>{n(row.rank)}</td><td>{target(row.target)}</td></tr>)}</Table>;
}

function CoreSpells({ data: d }: { data: PaperCharacterData }) {
  if (!d.spells.length) return null;
  return <Box title="Spellbook / Powers"><table className="paper-spell-quick"><thead><tr>{["Spell", "Roll", "Mana", "Ini.", "Sec.", "Range", "Duration"].map((label) => <th key={label}>{label}</th>)}</tr></thead>
    {d.spells.map((spell, i) => <tbody key={spell.key}><tr data-paper-check="row" data-paper-row={`SP${i + 1}`}>
      <th><b>{spell.name}{spell.requiresGodRuling ? " *" : ""}</b></th><td>{target(spell.target)}</td><td>{n(spell.manaCost)}</td><td>{n(spell.combatCastingTime)}</td><td>{n(spell.outOfCombatCastingTimeSeconds)}</td><td>{spell.range}</td><td>{spell.duration}</td>
    </tr><tr><td colSpan={7} className="paper-spell-use"><p data-paper-check="text"><b>Rules:</b> {spell.coreRules.join("; ") || "See saved definition"}{spell.notes ? ` · ${spell.notes}` : ""}</p>{spell.issues.map((issue,j) => <p key={j} data-paper-check="text">Review: {issue}</p>)}</td></tr></tbody>)}
  </table><p className="paper-caption">Known Spell · {[...new Set(d.spells.map((spell) => `${spell.system} / ${spell.practitionerLevel ?? "unavailable"}`))].join("; ")}. Ini. = combat; Sec. = out of combat. * Includes G.O.D. effects.</p></Box>;
}

/** Shared authorized printing and review exports use this exact renderer. */
export function PaperCharacterSheet({ data: d, references = NO_PAPER_REFERENCES }: { data: PaperCharacterData; references?: PaperReferences }) {
  const stamp = d.recordedAt.replace("T", " ").replace(/\.\d+Z$/, " UTC");
  const skillGroups = arrangePaperSkillGroups(d.skills);
  // Put a small set of ordinary Skills in the front-page quick-roll space when
  // the reverse needs room for several playable spells. Each allocation prints once.
  const frontSkills = d.spells.length >= 3 ? skillGroups.find((group) => group.name === "Core Skills" && group.rows.length <= 6 && group.rows.every((row) => row.displayDepth === 0)) : undefined;
  const derivedBrief = d.abilities.length ? <Box title="Derived Abilities">{d.abilities.map((ability) => <div key={ability.id} className="paper-ability-brief"><b>{ability.name}</b> · {ability.activation} · {ability.status}<span className="paper-caption"> / {ability.requirements}</span><Text>{ability.effect || ability.description}</Text>{ability.costs.length ? <Text>Cost: {ability.costs.join("; ")}</Text> : null}{ability.limits.length ? <Text>{ability.limits.join("; ")}</Text> : null}{ability.conditions.map((condition, i) => <Text key={i}>{condition}</Text>)}</div>)}</Box> : null;
  return <div className="paper-character-sheet" data-character-id={d.characterId} aria-label="Paper Character Sheet">
    <style>{`@page paper-character { @top-left { content: ${cssText(`${d.name} · ${d.campaign}`)}; } @bottom-left { content: ${cssText(`Recorded as of ${stamp}`)}; } @bottom-right { content: "Page " counter(page) " of " counter(pages); } }`}</style>
    <section className="paper-active">
      <PaperSheetMasthead title="Character sheet" folio="I · Play" />
      <header className="paper-identity"><div><h1 data-paper-check="text">{d.name}</h1><p>Player: {d.player} · Campaign: {d.campaign}</p></div><p data-paper-check="text"><b>{d.race}</b>{d.identity ? <><br />{d.identity}</> : null}</p></header>
      <div className="paper-totals">{d.totals.map((total) => <div key={total.name}><span>{total.name}</span><strong>{n(total.value)}</strong></div>)}</div>
      <Box title="Attributes"><div className="paper-attributes">{d.attributes.map((a) => <div key={a.key}><b>{a.key}</b><strong>{n(a.score)}</strong><span>Mod {paperSigned(a.modifier)}</span><span>{target(a.target)}</span></div>)}</div><p className="paper-caption">%+ is a roll target. Permanent values are shown; apply current conditions and situational rules.</p></Box>
      {frontSkills ? <Box title="Core Skills · quick rolls"><div className="paper-quick-skill-tables"><SkillTable rows={frontSkills.rows.slice(0, Math.ceil(frontSkills.rows.length / 2))} /><SkillTable rows={frontSkills.rows.slice(Math.ceil(frontSkills.rows.length / 2))} /></div></Box> : <div className="paper-quick-rolls"><b>Quick rolls</b>{d.quickRolls.map((row) => <span key={row.id}>{leaf(row.name)} <b>{target(row.target)}</b></span>)}</div>}
      <div className="paper-vitals">
        <Box title="Health & hit locations"><div className="paper-health-grid"><Table headings={["HP pool / hit", "Current", "Max", "Damage", "Now"]}>
          <tr className="paper-total"><th>Total HP</th><td>{n(d.health.total.remainingHp)}</td><td>{n(d.health.total.maximumHp)}</td><td>{n(d.health.total.damage)}</td><td className="paper-write" /></tr>
          {d.health.tracks.map((track) => <tr key={track.key}><th>{track.name}{track.orphaned ? " (old pool)" : ""}<small className="paper-hit-number">{d.health.anatomy.hitLocations.filter((location) => location.poolKey === track.key).map(({ result }) => result).join(", ")}</small></th><td>{n(track.remainingHp)}</td><td>{n(track.maximumHp)}</td><td>{n(track.damage)}</td><td className="paper-write" /></tr>)}
        </Table>{d.health.anatomy.kind === "humanoid" ? <CharacterHitLocationSilhouette className="paper-bob" title="Body Shot Bob — hit locations" /> : null}</div><div className="paper-hit-key"><p>{d.health.anatomy.hitLocations.map((hit) => `${hit.result} ${hit.name}`).join(" · ")}<br /><span className="paper-caption">Repeated hit results share one HP pool.</span></p></div></Box>
        <div className="paper-vitals-side">
          {d.mana.length ? <Box title="Mana"><Table headings={["System", "Current / max", "Now"]}>{d.mana.map((pool) => <tr key={pool.system}><th>{pool.system}<small>{pool.spellAccessLevel}</small></th><td>{n(pool.currentMana)} / {n(pool.maximumMana)}<small>{n(pool.manaSpent)} spent</small></td><td className="paper-write" /></tr>)}</Table></Box> : null}
          <Box title="Movement & Initiative"><p><b>Base Initiative {n(d.initiative)}</b><span className="paper-inline-write">Now</span></p><Table headings={["Mode", "Base", "Initiative"]}>{d.movement.map((mode) => <tr key={mode.name}><th>{mode.name}</th><td>{n(mode.base)}</td><td>{n(mode.value)}</td></tr>)}</Table>{!d.movement.length ? <p>Movement not recorded.</p> : null}<Lines count={2} /></Box>
        </div>
      </div>
      <Box title="Weapons"><Table headings={["Weapon / state", "Roll", "Damage / conditional modifier", "Ini.", "Reach / range"]} className="paper-weapons">{d.activeWeapons.map((weapon) => <tr key={`${weapon.key}:${weapon.mode}`}><th>{weapon.name}{weapon.mode ? ` / ${weapon.mode}` : ""}<small>{weapon.state}</small></th><td>{weapon.target == null ? "Ruling" : target(weapon.target)}</td><td>{weapon.damage}</td><td>{weapon.initiative}</td><td>{weapon.range}</td></tr>)}</Table>{!d.activeWeapons.length ? <p>No active weapons recorded.</p> : null}<p className="paper-caption">Damage depends on successes and attack rules. The modifier is conditional, not a fixed total.</p></Box>
      <div className="paper-bottom-pair">
        <Box title="Protection"><Table headings={["Protection / state", "Coverage", "Soak"]}>{d.protection.map((entry, i) => <tr key={i}><th>{entry.name}<small>{entry.state}</small></th><td>{entry.coverage}</td><td>{entry.soak}</td></tr>)}</Table>{!d.protection.length ? <p>None recorded.</p> : null}{d.protection.filter((entry) => entry.summary).map((entry, i) => <Text key={i}>{entry.summary}</Text>)}{d.interactions.map((rule, i) => <Text key={i}>{rule}</Text>)}</Box>
        <Box title="Conditions & play notes">{d.effects.length ? d.effects.map((effect, i) => <Text key={i}>{effect}</Text>) : <p>No active conditions recorded.</p>}<Lines count={3} /></Box>
      </div>
    </section>
    <section className="paper-core-back">
      <PaperSheetMasthead title="Skills, abilities & equipment" folio="II · Record" />
      <div className="paper-record-columns"><div>{skillGroups.filter((group) => group !== frontSkills).map(({name, rows}) => <Box key={name} title={name}><SkillTable rows={rows} /></Box>)}</div><OwnedInventory data={d} /></div>
      {derivedBrief}
      <CoreSpells data={d} />
      {d.activeWeapons.some((weapon) => weapon.timing.length) || d.movement.some((mode) => mode.notes) ? <Box title="Equipment & movement notes">{d.activeWeapons.flatMap((weapon) => weapon.timing.map((line, i) => <Text key={`${weapon.key}:${weapon.mode}:${i}`}>{weapon.name}: {line}</Text>))}{d.movement.filter((mode) => mode.notes).map((mode) => <Text key={mode.name}>{mode.name}: {mode.notes}</Text>)}</Box> : null}
      {d.gaps.length ? <Box title="Recorded information needing review">{d.gaps.map((gap, i) => <Text key={i}>{gap}</Text>)}</Box> : null}
    </section>
    {references.spells && (d.spells.length || d.abilities.length) ? <section className="paper-reference-start paper-power-start"><PaperSheetMasthead title="Spells & abilities" /><header className="paper-section-intro"><span className="paper-brand">OPTIONAL PLAY REFERENCE</span><p className="paper-caption">Casting values include the current practitioner level and authored timing modifiers. Structured effects and saved prose are shown separately; a disagreement in the saved definition needs a G.O.D. ruling.</p></header>
      {d.spells.map((spell, i) => <article className="paper-entry paper-spell" key={spell.key}><h3>SP{String(i + 1).padStart(2, "0")} / {spell.name}</h3><p>{spell.system} · {spell.practitionerLevel ?? "No casting context"} · Known Spell</p><Table headings={["Roll", "Mana", "Combat casting", "Out of combat", "Range"]}><tr><td>{target(spell.target)}</td><td>{n(spell.manaCost)}</td><td>{n(spell.combatCastingTime)} Initiative</td><td>{n(spell.outOfCombatCastingTimeSeconds)} seconds</td><td>{spell.range}</td></tr></Table>
        {spell.effects.map((effect, j) => <Text key={j}>{effect}</Text>)}
        {spell.rules.filter((rule) => rule.category === "effect").map((rule, j) => <Text key={j}><b>{rule.label}</b>{rule.text ? `: ${rule.text}` : ""}{spell.rules.some((other) => other.scope !== rule.scope) ? ` [${rule.scope || "Whole spell"}]` : ""}</Text>)}
        {spell.rules.some((rule) => rule.category !== "effect") ? <Text>{spell.rules.filter((rule) => rule.category !== "effect").map((rule, j) => <span key={j}>{j ? " · " : ""}<b>{rule.label}</b>{rule.text ? `: ${rule.text}` : ""}{spell.rules.some((other) => other.scope !== rule.scope) ? ` [${rule.scope || "Whole spell"}]` : ""}</span>)}</Text> : null}
        {spell.summary ? <Text><b>Saved description:</b> {spell.summary}</Text> : null}{spell.notes ? <Text><b>Requirements / notes:</b> {spell.notes}</Text> : null}
        {spell.progressive.map((stage, j) => <Text key={j}>{stage.tierName}: {stage.condition} — {stage.description}</Text>)}
        {spell.issues.map((issue, j) => <Text key={j}>Review: {issue}</Text>)}
      </article>)}
      {d.abilities.map((ability) => <article key={ability.id} className="paper-entry"><h3>{ability.name}</h3><Text>{ability.activation} · {ability.status}</Text><Text>{ability.description}</Text><Text>{ability.effect}</Text><Text>Requirements: {ability.requirements}</Text>{ability.costs.length ? <Text>Costs: {ability.costs.join("; ")}</Text> : null}{ability.limits.length ? <Text>Limits: {ability.limits.join("; ")}</Text> : null}{ability.conditions.map((condition, i) => <Text key={i}>Use condition: {condition}</Text>)}{ability.effects.map((effect, i) => <Text key={i}>{effect}</Text>)}</article>)}
    </section> : null}
    {references.skills && d.skills.length ? <section className="paper-reference-start"><PaperSheetMasthead title="Full skill descriptions" />{d.skills.map((row) => <article key={row.id} className="paper-entry"><h3>{row.reference} / {row.name}</h3><Text>{row.definition || "No definition recorded."}</Text>{row.manaCost != null ? <p className="paper-caption">Catalog metadata mana: {row.manaCost}. This is not a calculated casting cost. For a constructed spell, use the current casting value in Known spells.</p> : null}</article>)}</section> : null}
    {references.items && d.gear.length ? <section className="paper-reference-start"><PaperSheetMasthead title="Full item descriptions" />{d.gear.map((gear) => <article key={gear.id} className="paper-entry"><h3>{gear.id} / {gear.name}</h3>{gear.details.map((detail, i) => <Text key={i}>{detail}</Text>)}</article>)}</section> : null}
    {references.story && d.story.length ? <section className="paper-reference-start paper-story-start"><PaperSheetMasthead title="Story & profile" />{d.story.map((entry) => <article className="paper-entry" key={entry.name}><h3>{entry.name}</h3><Text>{entry.text}</Text></article>)}</section> : null}
  </div>;
}
