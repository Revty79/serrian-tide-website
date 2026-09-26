"use client";

import { useEffect, useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { listFormAccessReferences } from "@/app/heavens/form-access-actions";
import { CHARACTER_ATTRIBUTE_KEYS, CHARACTER_ATTRIBUTE_LABELS } from "@/features/characters/models";
import { createCreatureCanonicalIdentity } from "@/features/creatures/creature-canonical-ids";
import { NUMERIC_REQUIREMENT_OPERATORS, POSSESSION_REQUIREMENT_OPERATORS } from "@/features/requirements/requirement-primitives";
import { emptyFormAccess, emptyFormAccessRequirement, FORM_ACCESS_HELP, normalizeFormAccess, type FormAccess, type FormAccessOwner, type FormAccessRequirement, type FormAccessType } from "@/features/forms/form-access";
import styles from "./forms.module.css";

const labels = { gte: "≥", gt: ">", lte: "≤", lt: "<", eq: "=", neq: "≠", possessed: "Possessed", "not-possessed": "Not possessed" };
const types: Record<FormAccessType, string> = { attribute: "Attribute", skill: "Skill / Special Ability", "derived-ability": "Derived Ability", "creature-ability": "Creature Ability", manual: "Manual / G.O.D." };
type Candidate = { id: number; name: string; classification?: string | null };

function LibraryReference({ row, onChange }: { row: FormAccessRequirement; onChange: (patch: Partial<FormAccessRequirement>) => void }) {
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState("");
  const kind = row.requirementType === "skill" ? "skill" : "derived-ability";
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => { void listFormAccessReferences(kind, search).then(rows => { if (live) { setCandidates(rows); setError(""); } }).catch(error => { if (live) setError(error instanceof Error ? error.message : "Could not load references."); }); }, 150);
    return () => { live = false; clearTimeout(timer); };
  }, [kind, search]);
  const id = kind === "skill" ? row.skillId : row.requiredDerivedAbilityId;
  const entries = id && !candidates.some(candidate => candidate.id === id) ? [{ id, name: row.referenceName ?? `Saved ${types[row.requirementType]} #${id}`, classification: row.skillClassification }, ...candidates] : candidates;
  return <>
    <GuidedField className="st-field" label="Search access references" help="Search active saved definitions by name. Up to 50 results are shown. Existing archived references may be retained."><input className="st-control" value={search} onChange={event => setSearch(event.target.value)} /></GuidedField>
    <GuidedField className="st-field" label={kind === "skill" ? "Required Skill / Special Ability" : "Required Derived Ability"} help={kind === "skill" ? "Special Abilities use the shared Skill library. Classification and ID identify the saved definition." : "Uses the Character's resolved Normal possession status, including existing acquisition rules. Live conditions do not become transformation conditions."}><select className="st-control" value={id ?? ""} onChange={event => {
      const selected = entries.find(candidate => candidate.id === Number(event.target.value));
      onChange({ [kind === "skill" ? "skillId" : "requiredDerivedAbilityId"]: selected?.id ?? null, referenceName: selected?.name, skillClassification: selected?.classification ?? undefined });
    }}><option value="">Choose a saved definition</option>{entries.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.classification ? ` · ${candidate.classification}` : ""} · #{candidate.id}</option>)}</select></GuidedField>
    {id !== null && <p>{row.referenceName ?? `Saved ${types[row.requirementType]}`}{row.skillClassification ? ` · ${row.skillClassification}` : ""} · #{id}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </>;
}

export function FormAccessEditor({ owner, value, onChange, creatureAbilities = [] }: { owner: FormAccessOwner; value: FormAccess | undefined; onChange: (access: FormAccess) => void; creatureAbilities?: readonly { canonicalId: string; abilityName: string }[] }) {
  const access = value ?? emptyFormAccess();
  const update = (rows: FormAccessRequirement[]) => onChange({ mode: "requirements", requirements: rows.map((row, sortOrder) => ({ ...row, sortOrder })) });
  const groups = [...new Set(access.requirements.map(row => row.groupNumber))].sort((a, b) => a - b);
  const add = (groupNumber: number) => update([...access.requirements, emptyFormAccessRequirement(createCreatureCanonicalIdentity(), groupNumber)]);
  let error = "";
  try { normalizeFormAccess(access, owner); } catch (cause) { error = cause instanceof Error ? cause.message : "Check Access requirements."; }
  return <details className={styles.section} data-form-access-editor><summary>Access</summary><div className={styles.sectionBody}>
    <p>{FORM_ACCESS_HELP}</p>
    <GuidedField className="st-field" label="Access mode" help="Unrestricted requires nothing and clears requirement groups. Requirements uses AND within each group; any passing OR alternative grants eligibility. This does not activate a Form."><select className="st-control" value={access.mode} onChange={event => onChange(event.target.value === "unrestricted" ? emptyFormAccess() : { mode: "requirements", requirements: [emptyFormAccessRequirement(createCreatureCanonicalIdentity(), 0)] })}><option value="unrestricted">Unrestricted</option><option value="requirements">Requirements</option></select></GuidedField>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {access.mode === "requirements" && <><p>All requirements in one group must pass. Different groups are OR alternatives. Manual requirements need a G.O.D. ruling; they never automatically pass.</p>
      {groups.map((groupNumber, groupIndex) => <fieldset className={styles.sectionBody} key={groupNumber}><legend>{groupIndex ? "OR — " : ""}Access group {groupIndex + 1}</legend>
        {access.requirements.filter(row => row.groupNumber === groupNumber).map(row => {
          const patch = (change: Partial<FormAccessRequirement>) => update(access.requirements.map(entry => entry.key === row.key ? { ...entry, ...change } : entry));
          const numeric = row.requirementType === "attribute" || (row.requirementType === "skill" && row.requiredValue !== null);
          const operators = row.requirementType === "attribute" ? NUMERIC_REQUIREMENT_OPERATORS : row.requirementType === "skill" && owner === "race" ? [...POSSESSION_REQUIREMENT_OPERATORS, ...NUMERIC_REQUIREMENT_OPERATORS] : POSSESSION_REQUIREMENT_OPERATORS;
          return <div className={styles.card} key={row.key} data-access-requirement>
            <GuidedField className="st-field" label="Requirement type" help="Choose a Normal-state prerequisite. Changing type clears fields that no longer apply."><select className="st-control" value={row.requirementType} onChange={event => patch({ ...emptyFormAccessRequirement(row.key, row.groupNumber, event.target.value as FormAccessType), attributeKey: event.target.value === "attribute" ? "STR" : null, referenceName: undefined, skillClassification: undefined })}>{Object.entries(types).filter(([key]) => owner === "race" ? key !== "creature-ability" : key !== "derived-ability").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></GuidedField>
            {(row.requirementType === "skill" || row.requirementType === "derived-ability") && <LibraryReference key={row.requirementType} row={row} onChange={patch} />}
            {row.requirementType === "attribute" && <GuidedField className="st-field" label="Required Attribute" help={owner === "race" ? "Uses saved Normal Character Attributes. Form adjustments never unlock access." : "Uses the saved Normal Creature's effective Attribute after its native Size multiplier. Missing values need G.O.D. review."}><select className="st-control" value={row.attributeKey ?? ""} onChange={event => patch({ attributeKey: event.target.value as typeof row.attributeKey })}>{CHARACTER_ATTRIBUTE_KEYS.map(key => <option key={key} value={key}>{CHARACTER_ATTRIBUTE_LABELS[key]} ({key})</option>)}</select></GuidedField>}
            {row.requirementType === "creature-ability" && <GuidedField className="st-field" label="Required Creature Ability" help="Select an Ability from this Creature's Normal definition by its stable identity. Form-only Abilities do not satisfy access. Removing a referenced Normal Ability requires editing this prerequisite too."><select className="st-control" value={row.requiredCreatureAbilityCanonicalId ?? ""} onChange={event => patch({ requiredCreatureAbilityCanonicalId: event.target.value || null })}><option value="">Choose a Normal Ability</option>{row.requiredCreatureAbilityCanonicalId && !creatureAbilities.some(ability => ability.canonicalId === row.requiredCreatureAbilityCanonicalId) && <option value={row.requiredCreatureAbilityCanonicalId}>Missing: {row.referenceName ?? row.requiredCreatureAbilityCanonicalId}</option>}{creatureAbilities.map(ability => <option key={ability.canonicalId} value={ability.canonicalId}>{ability.abilityName || "Unnamed Ability"} · {ability.canonicalId}</option>)}</select></GuidedField>}
            {row.requirementType !== "manual" && <GuidedField className="st-field" label="Access comparison" help={row.requirementType === "skill" ? owner === "race" ? "Possession includes purchased Skill points and Race grants, including Granted Special Abilities with zero minimum. Numeric comparisons use purchased Skill # investment only, not Rank, Attributes or racial minimums." : "Possession means a Skill link in the saved Normal snapshot. Textual Creature rank is not Character Skill points." : "Compare the Normal value or require possession/absence. Preview changes never satisfy prerequisites."}><select className="st-control" value={row.operator ?? ""} onChange={event => patch({ operator: event.target.value as typeof row.operator, requiredValue: NUMERIC_REQUIREMENT_OPERATORS.some(op => op === event.target.value) ? row.requiredValue ?? 0 : null })}>{operators.map(op => <option key={op} value={op}>{labels[op]}</option>)}</select></GuidedField>}
            {numeric && <GuidedField className="st-field" label="Required value" help={row.requirementType === "skill" ? "Compare the highest persisted purchased Skill # investment for this Skill. Zero is valid; this is not a Rank calculation." : "A finite value on the existing Attribute scale. Uses Normal state only."}><input className="st-control" type="number" step="any" value={row.requiredValue ?? ""} onChange={event => patch({ requiredValue: event.target.value === "" ? null : Number(event.target.value) })} /></GuidedField>}
            <GuidedField className="st-field" label={row.requirementType === "manual" ? "Manual access requirement" : "Access notes"} help={row.requirementType === "manual" ? "Explain the narrative event or ruling that the G.O.D. must confirm. This produces Manual Review when the group's automatic prerequisites pass." : "Optional explanation of this prerequisite. Notes do not add automatic rules."}><textarea className="st-control" rows={2} value={row.notes} onChange={event => patch({ notes: event.target.value })} /></GuidedField>
            <button type="button" className="st-button" onClick={() => update(access.requirements.filter(entry => entry.key !== row.key))}>Remove access requirement</button>
          </div>;
        })}
        <button type="button" className="st-button" onClick={() => add(groupNumber)}>Add AND requirement</button>
        <button type="button" className="st-button" onClick={() => update(access.requirements.filter(row => row.groupNumber !== groupNumber))}>Remove access group</button>
      </fieldset>)}
      <button type="button" className="st-button" onClick={() => add(Math.max(-1, ...groups) + 1)}>Add OR group</button>
    </>}
  </div></details>;
}
