import type { ReactNode } from "react";
import { arrangePaperSkillGroups, paperNumber as n, type PaperCharacterData } from "@/features/characters/paper-character";

export const target = (value: number | null) => value == null ? "Not recorded" : `${n(value)}%+`;
export function Table({headings, children, className = ""}: {headings: string[]; children: ReactNode; className?: string}) {
  return <table className={className}><thead><tr>{headings.map(heading => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody>{children}</tbody></table>;
}
export function Lines({count = 2}: {count?: number}) {return <div className="paper-pencil" aria-label="Pencil notes">{Array.from({length: count}, (_, i) => <div key={i} />)}</div>;}
export function Text({children}: {children: ReactNode}) {return <p data-paper-check="text">{children}</p>;}
export function Box({title, children, className = ""}: {title: string; children: ReactNode; className?: string}) {return <section className={`paper-box ${className}`}><h2>{title}</h2><div className="paper-box-content">{children}</div></section>;}

export function SkillTable({skills}: {skills: PaperCharacterData["skills"]}) {
  const rows = arrangePaperSkillGroups(skills).flatMap(group => group.rows);
  return <Table headings={["Skill", "Pts", "Rank", "Target"]} className="paper-skills">{rows.map(row => <tr key={row.id} data-paper-check="row" data-paper-row={row.reference}><th style={{paddingLeft: `${3 + row.displayDepth * 8}pt`}}>{row.displayName}</th><td>{n(row.points)}{row.racialPoints ? " R" : ""}</td><td>{n(row.rank)}</td><td>{row.hasRoll ? target(row.target) : "—"}</td></tr>)}</Table>;
}
export function OwnedInventory({data}: {data: PaperCharacterData}) {
  const hasStatus = data.inventory.some(row => row.status);
  return <Box title="Owned inventory"><Table headings={["Item", "Qty", "Equipment state", ...(hasStatus ? ["Charges / ammunition"] : [])]} className={`paper-inventory${hasStatus ? " paper-inventory-status" : ""}`}>{data.inventory.map(row => <tr key={row.key} data-paper-check="row" data-paper-row={row.id}><th>{row.name}</th><td>{row.quantity}</td><td>{row.state}</td>{hasStatus ? <td>{row.status || "—"}</td> : null}</tr>)}</Table>{!data.inventory.length ? <p>None recorded.</p> : <p className="paper-caption">Equipment state quantities are included in Qty. Individually tracked copies remain separate.</p>}</Box>;
}
export function SpecialAbilities({data}: {data: PaperCharacterData}) {
  const rows = data.skills.filter(skill => skill.special);
  return <Box title="Special Abilities">{!rows.length ? <p>None recorded.</p> : rows.map(row => {
    const constructed = data.spells.find(spell => spell.key === `catalog:${row.id}`);
    return constructed ? <SpellEntry key={row.id} spell={{...constructed, target: row.hasRoll ? constructed.target : null}} /> : <article key={row.id} className="paper-ability-brief" data-paper-entry={row.reference}><h3>{row.name}</h3>{row.hasRoll ? <p>Target {target(row.target)} · Rank {n(row.rank)}</p> : null}<Text>{row.definition || "No effect recorded."}</Text>{row.manaCost != null ? <Text>Recorded mana cost: {n(row.manaCost)}. See the saved definition for use requirements.</Text> : null}</article>;
  })}</Box>;
}
export function DerivedAbilities({data, detailed = false}: {data: PaperCharacterData; detailed?: boolean}) {
  return <Box title="Derived Abilities">{!data.abilities.length ? <p>None recorded.</p> : data.abilities.map(ability => <article key={ability.id} className="paper-ability-brief" data-paper-entry={`DA${ability.id}`}><h3>{ability.name}</h3><Text>{ability.activation} · {ability.status}{!detailed ? ` · Requires: ${ability.requirements}` : ""}</Text>
    {ability.description && (detailed || !ability.effect) ? <Text>{ability.description}</Text> : null}{ability.effect && (!detailed || ability.effect !== ability.description) ? <Text>Effect: {ability.effect}</Text> : null}
    {ability.effects.map((effect, i) => <Text key={i}>{effect}</Text>)}
    {detailed ? <Text>Requirements: {ability.requirements}</Text> : null}
    {ability.costs.length ? <Text>Costs: {ability.costs.join("; ")}</Text> : null}
    {ability.limits.length ? <Text>Limits: {ability.limits.join("; ")}</Text> : null}
    {ability.conditions.map((condition, i) => <Text key={i}>Use condition: {condition}</Text>)}
  </article>)}</Box>;
}
export function RecordedSkill({skill}: {skill: PaperCharacterData["skills"][number]}) {
  return <article className="paper-entry" data-paper-entry={skill.reference}><h3>{skill.name}</h3><p>Points {n(skill.points)} · Rank {n(skill.rank)}{skill.hasRoll ? ` · Target ${target(skill.target)}` : ""}{skill.spellLevel ? ` · ${skill.spellLevel}` : ""}</p><Text>{skill.definition || "No definition recorded."}</Text>
    {skill.spellDocumentJson ? <Text>Review: the saved construction could not be decoded. Playable casting cost and timing are unavailable.</Text> : null}
    {skill.manaCost != null ? <Text>Catalog metadata mana: {n(skill.manaCost)}. This is a recorded value, not a calculated casting cost. Apply the saved definition; no construction document is available for a casting preview.</Text> : null}
  </article>;
}
export function SpellEntry({spell, detailed = false}: {spell: PaperCharacterData["spells"][number]; detailed?: boolean}) {
  return <article className={`paper-entry paper-spell ${detailed ? "" : "paper-spell-compact"}`} data-paper-entry={spell.key}>
    <h3>{spell.name}</h3>
    {detailed ? <><p className="paper-caption">{spell.system} · {spell.practitionerLevel ?? "No casting context"} · Known Spell{spell.requiresGodRuling ? " · Includes G.O.D. resolution" : ""}</p>
    <Table headings={["Roll", "Mana", "Combat", "Out of combat", "Range", "Duration"]}><tr data-paper-check="row"><td>{target(spell.target)}</td><td>{n(spell.manaCost)}</td><td>{n(spell.combatCastingTime)} Initiative</td><td>{n(spell.outOfCombatCastingTimeSeconds)} seconds</td><td>{spell.range}</td><td>{spell.duration}</td></tr></Table></> : <>
      <p className="paper-spell-stats" data-paper-check="text">{spell.target != null ? <span>Roll <b>{target(spell.target)}</b> · </span> : null}Mana <b data-playable-mana>{n(spell.manaCost)}</b> · Casting <b data-playable-initiative>{n(spell.combatCastingTime)}</b> Initiative / {n(spell.outOfCombatCastingTimeSeconds)} seconds</p>
      <Text>{spell.range} · {spell.duration}{spell.requiresGodRuling ? " · G.O.D. resolution" : ""}</Text>
    </>}
    <Text><b>Constructed effects / requirements:</b> {spell.coreRules.join("; ") || "See saved definition."}</Text>
    {spell.notes ? <Text>Requirements / notes: {spell.notes}</Text> : null}
    {spell.progressive.map((stage, i) => <Text key={i}>{stage.tierName}: {stage.condition} — {stage.description}</Text>)}
    {detailed ? <>{spell.rules.map((rule, i) => <Text key={i}><b>{rule.label}</b>{rule.text ? `: ${rule.text}` : ""}{rule.scope ? ` [${rule.scope}]` : ""}</Text>)}{spell.summary ? <Text><b>Saved description:</b> {spell.summary}</Text> : null}</> : null}
    {spell.catalogManaCost != null && spell.catalogManaCost !== spell.manaCost ? <p className="paper-caption" data-paper-check="text">Catalog mana {n(spell.catalogManaCost)}; current casting cost {n(spell.manaCost)}.</p> : null}
    {spell.issues.map((issue, i) => <Text key={i}>Review: {issue}</Text>)}
  </article>;
}
