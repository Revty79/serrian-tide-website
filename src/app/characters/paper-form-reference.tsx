import type { ReactNode } from "react";
import type { CharacterFormReference } from "@/features/characters/character-form-print";
import { paperNumber as n, paperSigned as signed } from "@/features/characters/paper-character";
import { FORM_ACCESS_LABELS } from "@/features/forms/form-access";
import { FORM_EQUIPMENT, FORM_MANIPULATION, FORM_SPEECH } from "@/features/races/race-form-mechanics";
import { formChoiceLabel as label, formRefreshLabel } from "@/features/forms/form-language";
import type { FormCosts, FormTiming } from "@/features/forms/form-transformation";
import { ABILITY_FACT_DEFINITIONS } from "@/features/ability-use-conditions/facts";
import { ABILITY_CONDITION_OPERATOR_LABELS } from "@/features/ability-use-conditions/authoring";
import type { DerivedAbilityUseConditionDefinition } from "@/features/derived-abilities/models";
import { interactionCondition } from "@/components/forms/form-preview";
import { Box, Table, Text, target } from "./paper-sheet-content";

const timing = (value: FormTiming) => [label(value.mode), value.initiativeCost == null ? "" : `${value.initiativeCost} Initiative`, value.time, value.notes].filter(Boolean).join("; ");
const costs = (value: FormCosts) => value.mode === "none" ? "No resource cost" : value.mode === "unspecified" ? "Unspecified" : value.costs.map(cost => `${cost.amount} ${cost.costType === "health" ? "HP" : label(cost.costType)} ${cost.resourceKey ?? ""} ${cost.notes}`).join("; ");
function Conditions({values}: {values: DerivedAbilityUseConditionDefinition[]}) {
  return values.length ? <>{values.map((row, i) => <Text key={i}>{[label(row.conditionType), ABILITY_FACT_DEFINITIONS.find(fact => fact.category === row.conditionType && fact.key === row.conditionKey)?.label ?? row.conditionKey, row.operator ? ABILITY_CONDITION_OPERATOR_LABELS[row.operator] : "", row.numericValue, row.textValue, row.notes].filter(value => value != null && value !== "").join("; ")}</Text>)}</> : <>None authored</>;
}
/** Read-only authored payload details. Omit storage identities, retaining all authored values. */
function Details({value}: {value: unknown}): ReactNode {
  if (value == null || value === "") return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? <ul>{value.map((entry, i) => <li key={i}><Details value={entry} /></li>)}</ul> : "None recorded";
  if (typeof value === "object") return <dl className="paper-form-details">{Object.entries(value).filter(([key]) => !["id", "key", "effectKey", "canonicalId", "schemaVersion", "sortOrder"].includes(key)).map(([key, entry]) => <div key={key}><dt>{label(key.replace(/([a-z])([A-Z])/g, "$1-$2"))}</dt><dd><Details value={entry} /></dd></div>)}</dl>;
  return String(value);
}
export function PaperFormReference({reference: {preview: p, access, sources, characterName, raceName}}: {reference: CharacterFormReference}) {
  const t = p.transformation;
  const rows: Array<[string, ReactNode]> = t ? [
    ["Entry method", `${label(t.entryMethod)}; ${t.entryNotes}`], ["Time to change", timing(t.entryTiming)], ["Cost to change", costs(t.entryCosts)],
    ["Conditions before changing", <Conditions key="requirements" values={t.requirements} />], ["Involuntary triggers", <Conditions key="triggers" values={t.involuntaryTriggers} />],
    ["Duration", `${label(t.duration.mode)}; ${t.duration.description}`], ["Exit methods", `${t.exitMethods.map(label).join(", ") || "Unspecified"}; ${t.exitNotes}`],
    ["Time to return", timing(t.exitTiming)], ["Cost to return", costs(t.exitCosts)],
    ["Use limits", `${label(t.limitMode)}; ${t.useLimits.map(limit => `${limit.maximumUses} uses; ${formRefreshLabel(limit.refreshScope)}; ${limit.refreshKey ?? ""}; ${limit.notes}`).join(" / ")}`],
    ["Cooldown / recovery", t.cooldown || "Unspecified"], ["Equipment on entry", t.equipmentEntryNotes || "Unspecified"], ["Equipment on exit", t.equipmentExitNotes || "Unspecified"], ["Transformation notes", t.notes || "None authored"],
  ] : [];
  return <article className="paper-form-reference">
    <header className="paper-section-intro"><p><strong>REFERENCE ONLY — NOT CURRENT FORM STATE</strong></p><p><strong>Character:</strong> {characterName} · <strong>Race:</strong> {raceName} · <strong>Form:</strong> {p.form.name}</p>
      {p.form.description ? <Text>{p.form.description}</Text> : null}{p.form.notes ? <Text>Notes: {p.form.notes}</Text> : null}
      <p>Size: {p.size} ({sources.size}) · Base Initiative: {n(p.baseInitiative)} · Maximum HP: {n(p.hp)}</p></header>
    <Box title={`Access: ${FORM_ACCESS_LABELS[access.status]}`}><Text>{access.explanation} Printing this reference does not grant access.</Text>
      {access.groups.map(group => <div key={group.groupNumber}><p>Requirement group {group.groupNumber + 1}: {FORM_ACCESS_LABELS[group.status]} (all within a group; any passing group).</p>{group.requirements.map(row => <Text key={row.key}>{FORM_ACCESS_LABELS[row.status]}: {row.explanation}</Text>)}</div>)}
    </Box>
    <Box title="Attributes"><Table headings={["Attribute", "Normal", "Form change", "Effective", "Modifier", "Roll target"]}>{p.attributes.map(row => <tr key={row.key} data-paper-check="row"><th>{row.key}</th><td>{n(row.stored)}</td><td>{signed(row.adjustment)}</td><td>{n(row.value)}</td><td>{signed(row.modifier)}</td><td>{target(row.rollTarget)}</td></tr>)}</Table>
      {p.attributeReferences.flatMap(row => row.fields.map(field => <Text key={`${row.key}:${field.label}`}>{row.key} — {field.label}: {field.value ?? "Not recorded for this score"}</Text>))}
    </Box>
    <Box title={`Anatomy / maximum HP — ${sources.anatomy}`}><Text>Current damage and injuries remain recorded on the Character. This page is a Form mechanical reference; no damage redistribution has occurred.</Text>
      <Table headings={["HP pool", "Maximum HP", "Percentage"]}>{p.anatomy.pools.map(pool => <tr key={pool.key} data-paper-check="row"><th>{pool.name}</th><td>{n(pool.maximumHp)}</td><td>{pool.percentage == null ? "Unspecified" : `${pool.percentage}%`}</td></tr>)}</Table>
      <Table headings={["Roll", "Hit location / body parts", "HP pool", "Effect"]}>{p.anatomy.hitLocations.map(location => <tr key={location.result} data-paper-check="row"><td>{location.result}</td><th>{location.name} · {location.bodyParts}</th><td>{location.poolName ?? "Unassigned"}</td><td>{location.locationEffect || "None authored"}</td></tr>)}</Table>
    </Box>
    <Box title={`Movement — ${sources.movement}`}><Table headings={["Mode", "Base value", "Movement Initiative", "Notes"]}>{p.movement.map((row, i) => <tr key={i} data-paper-check="row"><th>{row.movementMode}</th><td>{n(row.baseValue)}</td><td>{n(row.initiative)}</td><td>{row.notes}</td></tr>)}</Table><p>Includes saved movement advancement steps.</p>{!p.movement.length ? <p>None listed.</p> : null}</Box>
    <Box title={`Natural Protection — ${sources.protection}`}>
      {p.protections.length ? p.protections.map(row => <Text key={row.key}>{row.name}: Soak {n(row.naturalSoak)} · {row.coverage.kind === "all" ? "All locations" : row.coverage.locationKeys.map(key => p.anatomy.hitLocations.find(location => String(location.result) === key)?.name ?? "Unmatched authored location").join(", ")}</Text>) : <p>None listed.</p>}
    </Box>
    <Box title={`Natural Attacks — ${sources.attacks}`}>{p.attacks.length ? p.attacks.map(row => <section className="paper-entry" key={row.key}><h3>{row.attackName}</h3>
      <Text>Damage: {row.damage ?? "Unspecified"}; {row.damageType || "type unspecified"}. Initiative: {row.authoring.initiativeCost ?? "Unspecified"}. {label(row.authoring.mode)}; Skill: {row.skillName || "Unspecified"}; Magical: {row.authoring.magical == null ? "Unspecified" : row.authoring.magical ? "Yes" : "No"}.</Text>
      <Text>Reach {row.authoring.range.reach ?? "—"}; Short {row.authoring.range.short ?? "—"}; Medium {row.authoring.range.medium ?? "—"}; Long {row.authoring.range.long ?? "—"} {row.authoring.range.unit}.</Text>
      <Text>Required body parts: {row.anatomy.hpPoolIds.map(key => p.anatomy.pools.find(pool => pool.key === key)?.name ?? "Unmatched authored pool").join(", ") || "None authored"}. Required hit locations: {row.anatomy.hitLocationNumbers.map(number => p.anatomy.hitLocations.find(location => location.result === number)?.name ?? `Roll ${number}`).join(", ") || "None authored"}.</Text>
      {[row.notes, row.basisNotes, row.anatomy.notes].filter(Boolean).map((note, i) => <Text key={i}>{note}</Text>)}
      <p><strong>Effects on a hit</strong></p><Details value={row.authoring.onHitEffects} /><p><strong>Magic Construction</strong></p><Details value={row.authoring.magic} />
    </section>) : <p>None listed.</p>}</Box>
    <Box title={`Skills / abilities — ${sources.skills}`}><Table headings={["Skill", "Points", "Rank", "Roll target", "Source"]}>{p.skills.map(row => <tr key={row.allocationId} data-paper-check="row"><th>{row.name}</th><td>{n(row.points)}</td><td>{n(row.rank)}</td><td>{target(row.target)}</td><td>{row.formAddition ? "Includes Form addition" : "Normal Skill"}</td></tr>)}</Table>
      <p>Learned Skills remain. These reference values do not permanently grant Skills or abilities.</p>
      {p.grantedAbilities.map(row => <Text key={row.skillId}><strong>{row.name}</strong> ({row.fromRace ? "Normal Race" : "Form ability"}): {row.definition}</Text>)}
      {p.skillAdditions.filter(row => row.linkType !== "Granted").map((row, i) => <Text key={i}><strong>{row.skillName}</strong>: Form predisposition {row.value ?? 0}. {row.definition}</Text>)}
    </Box>
    <Box title="Interaction Rules"><p>{p.interactionMode === "race" ? "Normal Race rules" : p.interactionMode === "add" ? "Normal Race rules plus Form additions" : "Form replacements"}. Informational only.</p>{p.interactionRules.length ? p.interactionRules.map((row, i) => <Text key={i}><strong>{row.name}</strong>: {label(row.ruleType)}; {label(row.scope)} {row.percentage == null ? "" : `${row.percentage}%`}; {row.match === "ALL" ? "All conditions" : "Any condition"}: {row.conditions.map(interactionCondition).join("; ")}. {row.notes}</Text>) : <p>None authored.</p>}</Box>
    <Box title="Physical capabilities / equipment"><Text>Manipulation: {FORM_MANIPULATION[p.manipulation.state]} {p.manipulation.notes}</Text><Text>Speech: {FORM_SPEECH[p.speech.state]} {p.speech.notes}</Text><Text>Equipment: {FORM_EQUIPMENT[p.equipment.state]} {p.equipment.notes}</Text>{p.restrictions.map(row => <Text key={row.key}>{row.name}: {row.notes}</Text>)}<p>Reference only. Inventory, custody and equipped state are unchanged.</p></Box>
    <Box title="Transformation definition">{t ? <dl className="paper-form-details">{rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl> : <p>No transformation rules recorded. Entry, return, costs and limits require a ruling.</p>}</Box>
  </article>;
}
