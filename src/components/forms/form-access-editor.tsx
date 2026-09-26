"use client";

import { useEffect, useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { listFormAccessReferences } from "@/app/heavens/form-access-actions";
import { CHARACTER_ATTRIBUTE_KEYS, CHARACTER_ATTRIBUTE_LABELS } from "@/features/characters/models";
import { createCreatureCanonicalIdentity } from "@/features/creatures/creature-canonical-ids";
import { NUMERIC_REQUIREMENT_OPERATORS, POSSESSION_REQUIREMENT_OPERATORS } from "@/features/requirements/requirement-primitives";
import { emptyFormAccess, emptyFormAccessRequirement, FORM_ACCESS_HELP, normalizeFormAccess, type FormAccess, type FormAccessOwner, type FormAccessRequirement, type FormAccessType } from "@/features/forms/form-access";
import styles from "./forms.module.css";

const labels = { gte: "Is at least", gt: "Is greater than", lte: "Is at most", lt: "Is less than", eq: "Equals", neq: "Does not equal", possessed: "Has this Skill or Ability", "not-possessed": "Does not have this Skill or Ability" };
const types: Record<FormAccessType, string> = { attribute: "Attribute", skill: "Skill / Special Ability", "derived-ability": "Derived Ability", "creature-ability": "Creature Ability", manual: "G.O.D. approval or story event" };
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
    <GuidedField className="st-field" label="Find a Skill or Ability" help="Search the library by name. Up to 50 results are shown. A previously chosen archived entry can stay selected."><input className="st-control" value={search} onChange={event => setSearch(event.target.value)} /></GuidedField>
    <GuidedField className="st-field" label={kind === "skill" ? "Required Skill / Special Ability" : "Required Derived Ability"} help={kind === "skill" ? "Choose the Skill or Special Ability needed. The type and library number help distinguish entries with similar names." : "Checks whether the normal Character has acquired this Derived Ability. Whether it can be used right now is a separate question."}><select className="st-control" value={id ?? ""} onChange={event => {
      const selected = entries.find(candidate => candidate.id === Number(event.target.value));
      onChange({ [kind === "skill" ? "skillId" : "requiredDerivedAbilityId"]: selected?.id ?? null, referenceName: selected?.name, skillClassification: selected?.classification ?? undefined });
    }}><option value="">Choose a Skill or Ability</option>{entries.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.classification ? ` · ${candidate.classification}` : ""} · #{candidate.id}</option>)}</select></GuidedField>
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
    <GuidedField className="st-field" label="Who can use this Form?" help="By default, no requirements are needed. Choose specific requirements to limit access. Choosing anyone clears those requirements. This setting never changes someone into the Form."><select className="st-control" value={access.mode} onChange={event => onChange(event.target.value === "unrestricted" ? emptyFormAccess() : { mode: "requirements", requirements: [emptyFormAccessRequirement(createCreatureCanonicalIdentity(), 0)] })}><option value="unrestricted">Anyone with this {owner === "race" ? "Race" : "Creature"} can use it</option><option value="requirements">Only those who meet specific requirements</option></select></GuidedField>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {access.mode === "requirements" && <><p>Meet every requirement in any one way to qualify below. A story event or approval always needs a G.O.D. ruling.</p>
      {groups.map((groupNumber, groupIndex) => <fieldset className={styles.sectionBody} key={groupNumber}><legend>{groupIndex ? "OR — " : ""}Way to qualify #{groupIndex + 1}</legend><p>{groupIndex ? "This is another way the Form can be unlocked. " : ""}All requirements in this section must be met.</p>
        {access.requirements.filter(row => row.groupNumber === groupNumber).map(row => {
          const patch = (change: Partial<FormAccessRequirement>) => update(access.requirements.map(entry => entry.key === row.key ? { ...entry, ...change } : entry));
          const numeric = row.requirementType === "attribute" || (row.requirementType === "skill" && row.requiredValue !== null);
          const operators = row.requirementType === "attribute" ? NUMERIC_REQUIREMENT_OPERATORS : row.requirementType === "skill" && owner === "race" ? [...POSSESSION_REQUIREMENT_OPERATORS, ...NUMERIC_REQUIREMENT_OPERATORS] : POSSESSION_REQUIREMENT_OPERATORS;
          return <div className={styles.card} key={row.key} data-access-requirement>
            <GuidedField className="st-field" label="Requirement type" help="Choose what must be true before using this Form. Checks use the saved normal Character or Creature. Changing the type clears the previous choice."><select className="st-control" value={row.requirementType} onChange={event => patch({ ...emptyFormAccessRequirement(row.key, row.groupNumber, event.target.value as FormAccessType), attributeKey: event.target.value === "attribute" ? "STR" : null, referenceName: undefined, skillClassification: undefined })}>{Object.entries(types).filter(([key]) => owner === "race" ? key !== "creature-ability" : key !== "derived-ability").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></GuidedField>
            {(row.requirementType === "skill" || row.requirementType === "derived-ability") && <LibraryReference key={row.requirementType} row={row} onChange={patch} />}
            {row.requirementType === "attribute" && <GuidedField className="st-field" label="Required Attribute" help={owner === "race" ? "Checks the saved normal Character score. Changes from this Form cannot help qualify for it." : "Checks the saved normal Creature score after its Size multiplier. An unrecorded score needs G.O.D. review."}><select className="st-control" value={row.attributeKey ?? ""} onChange={event => patch({ attributeKey: event.target.value as typeof row.attributeKey })}>{CHARACTER_ATTRIBUTE_KEYS.map(key => <option key={key} value={key}>{CHARACTER_ATTRIBUTE_LABELS[key]} ({key})</option>)}</select></GuidedField>}
            {row.requirementType === "creature-ability" && <GuidedField className="st-field" label="Required Creature Ability" help="Choose an Ability this Creature has in its normal body. An Ability gained only in a Form cannot unlock that Form. Change this requirement before removing the chosen normal Ability."><select className="st-control" value={row.requiredCreatureAbilityCanonicalId ?? ""} onChange={event => patch({ requiredCreatureAbilityCanonicalId: event.target.value || null })}><option value="">Choose a Normal Ability</option>{row.requiredCreatureAbilityCanonicalId && !creatureAbilities.some(ability => ability.canonicalId === row.requiredCreatureAbilityCanonicalId) && <option value={row.requiredCreatureAbilityCanonicalId}>Missing: {row.referenceName ?? row.requiredCreatureAbilityCanonicalId}</option>}{creatureAbilities.map(ability => <option key={ability.canonicalId} value={ability.canonicalId}>{ability.abilityName || "Unnamed Ability"}{creatureAbilities.filter(other => other.abilityName === ability.abilityName).length > 1 ? ` · ${ability.canonicalId}` : ""}</option>)}</select></GuidedField>}
            {row.requirementType !== "manual" && <GuidedField className="st-field" label="What must be true?" help={row.requirementType === "skill" ? owner === "race" ? "Having a Skill or Ability includes purchased points and Race grants, even a Special Ability with a zero minimum. Number comparisons check purchased Skill points only, not Rank, Attribute bonuses or Race minimums." : "Having a Skill means it is listed for the saved normal Creature. Creature Rank is descriptive and is not compared as Character Skill points." : "Check the normal score, or whether the Skill or Ability is present or absent. Preview changes cannot help meet this requirement."}><select className="st-control" value={row.operator ?? ""} onChange={event => patch({ operator: event.target.value as typeof row.operator, requiredValue: NUMERIC_REQUIREMENT_OPERATORS.some(op => op === event.target.value) ? row.requiredValue ?? 0 : null })}>{operators.map(op => <option key={op} value={op}>{labels[op]}</option>)}</select></GuidedField>}
            {numeric && <GuidedField className="st-field" label="Required value" help={row.requirementType === "skill" ? "Enter the purchased Skill points needed. If the Skill was learned along several paths, the highest investment counts. Zero is allowed; this is not Rank." : "Enter the required normal Attribute score. Zero is allowed. Form changes do not count."}><input className="st-control" type="number" step="any" value={row.requiredValue ?? ""} onChange={event => patch({ requiredValue: event.target.value === "" ? null : Number(event.target.value) })} /></GuidedField>}
            <GuidedField className="st-field" label={row.requirementType === "manual" ? "What must the G.O.D. confirm?" : "Requirement notes"} help={row.requirementType === "manual" ? "Describe the story event or approval needed. If the other requirements here are met, access is shown as Needs G.O.D. Review." : "Optional explanation of this prerequisite. Notes do not add automatic rules."}><textarea className="st-control" rows={2} value={row.notes} onChange={event => patch({ notes: event.target.value })} /></GuidedField>
            <button type="button" className="st-button" onClick={() => update(access.requirements.filter(entry => entry.key !== row.key))}>Remove this requirement</button>
          </div>;
        })}
        <button type="button" className="st-button" onClick={() => add(groupNumber)}>Add another requirement that must also be met</button>
        <button type="button" className="st-button" onClick={() => update(access.requirements.filter(row => row.groupNumber !== groupNumber))}>Remove this way to qualify</button>
      </fieldset>)}
      <button type="button" className="st-button" onClick={() => add(Math.max(-1, ...groups) + 1)}>Add another way to qualify</button>
    </>}
  </div></details>;
}
