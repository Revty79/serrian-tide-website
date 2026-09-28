"use client";
import { useEffect, useRef, useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { emptyEvolutionRequirement, EVOLUTION_MANUAL_CATEGORIES, EVOLUTION_MANUAL_LABELS, EVOLUTION_OPERATOR_LABELS, EVOLUTION_REQUIREMENT_TYPES, EVOLUTION_STATUS_LABELS, EVOLUTION_TYPE_LABELS, isNumericEvolutionRequirement, type EvolutionEvaluation, type EvolutionRequirement, type EvolutionRequirements } from "@/features/evolutions/evolution-requirements";
import type { CreatureEvolutionPath } from "@/features/creatures/creature-evolutions";
import { NUMERIC_REQUIREMENT_OPERATORS, POSSESSION_REQUIREMENT_OPERATORS } from "@/features/requirements/requirement-primitives";
import * as creatureActions from "./creatures/evolution-actions";
import * as raceActions from "./races/evolution-actions";
import { searchEvolutionRequirementReferences } from "./creatures/evolution-actions";
import type { RaceEvolutionPath } from "@/features/races/race-evolutions";
import styles from "./creatures/creature-evolutions.module.css";
type Authoring = EvolutionRequirements & { path: { version: number }; canEdit: boolean; abilities: Array<{ canonicalId: string; name: string }>; forms: Array<{ key: string; name: string }> };
type RequirementsProps = { kind: "creature"; path: CreatureEvolutionPath; onSaved: (paths: CreatureEvolutionPath[]) => void; onClose: () => void } | { kind: "race"; path: RaceEvolutionPath; onSaved: (paths: RaceEvolutionPath[]) => void; onClose: () => void };
type PreviewProps = { kind: "creature"; path: CreatureEvolutionPath; onClose: () => void } | { kind: "race"; path: RaceEvolutionPath; onClose: () => void };
const failure = (reason: unknown) => reason instanceof Error ? reason.message : "Evolution requirements could not be loaded or saved.";
const newKey = () => `req-${Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16)).join("-")}`;

export function EvolutionRequirementsDialog(props: RequirementsProps) {
  const { path, onClose, kind } = props;
  const sourceId = props.kind === "creature" ? props.path.sourceCreatureId : props.path.sourceRaceId;
  const api = kind === "creature" ? creatureActions : raceActions;
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<Authoring | null>(null), [value, setValue] = useState<EvolutionRequirements>({ mode: "unrestricted", requirements: [] });
  const [groups, setGroups] = useState<number[]>([0]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); let current = true;
    void api.getEvolutionRequirements(sourceId, path.id).then(result => { if (current) { setData(result); setValue({ mode: result.mode, requirements: result.requirements }); setGroups([...new Set(result.requirements.map(row => row.groupNumber))].length ? [...new Set(result.requirements.map(row => row.groupNumber))] : [0]); } }).catch(reason => { if(current) setError(failure(reason)); });
    return () => { current = false; };
  }, [sourceId, path.id, api]);
  function update(rows: EvolutionRequirement[], nextGroups = groups) {
    setValue(current => ({ ...current, requirements: nextGroups.flatMap((groupNumber, index) => rows.filter(row => row.groupNumber === groupNumber).map((row, sortOrder) => ({ ...row, groupNumber: index, sortOrder }))) }));
    setGroups(nextGroups.map((_, index) => index));
  }
  async function save() {
    if (!data) return;
    if (value.mode === "requirements" && groups.some(group => !value.requirements.some(row => row.groupNumber === group))) { setError("Add a requirement to each group or remove the empty group."); return; }
    setBusy(true); setError("");
    try {
      const input = { pathId: path.id, expectedVersion: data.path.version, requirements: value };
      if (props.kind === "creature") props.onSaved(await creatureActions.saveEvolutionPathRequirements({ ...input, sourceCreatureId: props.path.sourceCreatureId }));
      else props.onSaved(await raceActions.saveEvolutionPathRequirements({ ...input, sourceRaceId: props.path.sourceRaceId }));
    }
    catch(reason) { setError(failure(reason)); } finally { setBusy(false); }
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="evolution-requirements-title" onCancel={event => { if(busy) event.preventDefault(); else onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <h3 id="evolution-requirements-title">Requirements for {path.name}</h3>
      <p>Every requirement within a group must be met. Any complete group can qualify the individual. Manual notes require G.O.D. review; they do not grant approval.</p>
      {!data ? <p>Loading requirements…</p> : <fieldset className={styles.fields} disabled={busy || !data.canEdit}>
        <GuidedField className="st-field" label="Requirement mode" help="Unrestricted means no prerequisites. Choosing Unrestricted clears this draft's requirements when saved. Eligibility still checks the exact source and destination archive state.">
          <select className="st-control" value={value.mode} onChange={event => { setValue({ mode: event.target.value as EvolutionRequirements["mode"], requirements: [] }); setGroups([0]); }}>
            <option value="unrestricted">Unrestricted</option><option value="requirements">Has requirements</option>
          </select>
        </GuidedField>
        {value.mode === "requirements" ? <>
          {groups.map((group, index) => <section key={group} className={styles.card} aria-label={`Requirement group ${index + 1}`}>
            <h4>{index ? "OR — " : ""}Group {index + 1}: meet every requirement</h4>
            {value.requirements.filter(row => row.groupNumber === group).map((row, rowIndex, rows) => <div key={row.key} className={styles.card}>
              <RequirementFields kind={kind} row={row} data={data} onChange={next => update(value.requirements.map(old => old.key === row.key ? next : old))} />
              <div className={styles.actions}>
                <button className="st-button" type="button" disabled={!rowIndex} onClick={() => { const list = [...value.requirements], current = list.findIndex(old => old.key === row.key); [list[current - 1],list[current]] = [list[current],list[current - 1]]; update(list); }}>Move requirement up</button>
                <button className="st-button" type="button" disabled={rowIndex === rows.length - 1} onClick={() => { const list = [...value.requirements], current = list.findIndex(old => old.key === row.key); [list[current + 1],list[current]] = [list[current],list[current + 1]]; update(list); }}>Move requirement down</button>
                <button className="st-button is-danger" type="button" onClick={() => update(value.requirements.filter(old => old.key !== row.key))}>Remove requirement</button>
              </div>
            </div>)}
            <div className={styles.actions}>
              <button className="st-button" type="button" onClick={() => update([...value.requirements, emptyEvolutionRequirement(newKey(), group)])}>Add requirement</button>
              <button className="st-button" type="button" disabled={!index} onClick={() => { const next = [...groups]; [next[index - 1],next[index]] = [next[index],next[index - 1]]; update(value.requirements,next); }}>Move group up</button>
              <button className="st-button is-danger" type="button" onClick={() => update(value.requirements.filter(row => row.groupNumber !== group),groups.filter(old => old !== group))}>Remove group</button>
            </div>
          </section>)}
          <button className="st-button" type="button" onClick={() => setGroups([...groups, groups.length ? Math.max(...groups) + 1 : 0])}>Add alternative group</button>
        </> : null}
      </fieldset>}
      {error ? <p role="alert">{error}</p> : null}
      <div className={styles.actions}><button className="st-button is-primary" type="submit" disabled={busy || !data?.canEdit}>{busy ? "Saving…" : "Save requirements"}</button><button className="st-button" type="button" disabled={busy} onClick={onClose}>Close</button></div>
    </form>
  </dialog>;
}

function RequirementFields({ row, data, onChange, kind }: { kind: "race" | "creature"; row: EvolutionRequirement; data: Authoring; onChange: (value: EvolutionRequirement) => void }) {
  const [search,setSearch] = useState(""), [candidates,setCandidates] = useState<Array<{id:number;name:string}>>([]), [error,setError] = useState("");
  useEffect(() => { if(row.requirementType !== "skill" && row.requirementType !== "item" && row.requirementType !== "derived-ability") return;
    let current = true; const kind = row.requirementType;
    const timer = setTimeout(() => { void searchEvolutionRequirementReferences(kind,search).then(rows => { if(current) { setCandidates(rows);setError(""); } }).catch(reason => { if(current) setError(failure(reason)); }); },200);
    return () => { current = false;clearTimeout(timer); };
  },[row.requirementType,search]);
  const numeric = isNumericEvolutionRequirement(row.requirementType) || (kind === "race" && row.requirementType === "skill" && NUMERIC_REQUIREMENT_OPERATORS.some(op => op === row.operator));
  const referenceId = row.requirementType === "skill" ? row.skillId : row.requirementType === "derived-ability" ? row.derivedAbilityId : row.itemId;
  return <div className={styles.fields}>
    <GuidedField className="st-field" label="Requirement type" help="Use saved facts where available. Story events, milestones, environment, approval and currently being in a Form require G.O.D. review.">
      <select className="st-control" value={row.requirementType} onChange={event => onChange({ ...emptyEvolutionRequirement(row.key,row.groupNumber,event.target.value as EvolutionRequirement["requirementType"]), ...(kind === "race" && event.target.value === "item" ? { itemHolder: "character" as const } : {}), sortOrder:row.sortOrder })}>{EVOLUTION_REQUIREMENT_TYPES.filter(type => kind === "race" ? type !== "creature-ability" : type !== "derived-ability").map(type => <option key={type} value={type}>{EVOLUTION_TYPE_LABELS[type]}</option>)}</select>
    </GuidedField>
    {row.requirementType === "skill" || row.requirementType === "item" || row.requirementType === "derived-ability" ? <>
      <GuidedField className="st-field" label="Find requirement reference" help="Search active shared-library records under your saved catalog visibility. Stored archived references can be retained."><input className="st-control" value={search} onChange={event => setSearch(event.target.value)} /></GuidedField>
      <GuidedField className="st-field" label="Required reference" help={kind === "creature" ? "The saved ID identifies the Skill or Item. Creature Skills check possession, never purchased Character points." : "Uses the exact Skill, Item or Derived Ability ID. Skill possession includes racial grants; numeric Skill checks use highest saved purchased points, excluding grants and calculated Rank."}>
        <select className="st-control" required value={referenceId ?? ""} onChange={event => { const selected = candidates.find(candidate => candidate.id === Number(event.target.value)); if(selected) onChange({ ...row, [row.requirementType === "skill" ? "skillId" : row.requirementType === "derived-ability" ? "derivedAbilityId" : "itemId"]: selected.id, referenceName:selected.name,referenceArchived:false }); }}>
          <option value="">Choose a reference</option>{referenceId ? <option value={referenceId}>{row.referenceName ?? `Record #${referenceId}`} (#{referenceId}){row.referenceArchived ? " — Archived, retained" : ""}</option> : null}
          {candidates.filter(candidate => candidate.id !== referenceId).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name} (#{candidate.id})</option>)}
        </select>
      </GuidedField>{error ? <p role="alert">{error}</p> : null}
    </> : null}
    {row.requirementType === "creature-ability" ? <GuidedField className="st-field" label="Required Creature Ability" help="Choose an Ability authored on this exact Normal source Creature. Preview checks the individual's current snapshot, including G.O.D. edits."><select className="st-control" required value={row.creatureAbilityCanonicalId ?? ""} onChange={event => onChange({ ...row,creatureAbilityCanonicalId:event.target.value || null })}><option value="">Choose an Ability</option>{data.abilities.map(ability => <option key={ability.canonicalId} value={ability.canonicalId}>{ability.name} ({ability.canonicalId})</option>)}</select></GuidedField> : null}
    {row.requirementType === "form-access" ? <GuidedField className="st-field" label="Required Form qualification" help={kind === "creature" ? "Checks the exact Form's frozen Access rules in the individual's snapshot. No Form is activated." : "Checks this exact saved Race Form using the Character's Normal state and existing Form Access rules. No Form is activated."}><select className="st-control" required value={(kind === "race" ? row.raceFormKey : row.creatureFormKey) ?? ""} onChange={event => onChange({ ...row,[kind === "race" ? "raceFormKey" : "creatureFormKey"]:event.target.value || null })}><option value="">Choose a Form</option>{data.forms.map(form => <option key={form.key} value={form.key}>{form.name} ({form.key})</option>)}</select></GuidedField> : null}
    {row.requirementType === "item" ? <GuidedField className="st-field" label="Item holder" help="Requires at least one carried, Loose, usable copy. Contained, attached, dropped, lost, stolen or retired Items do not qualify. Retrieve them first. Nothing is consumed. An owner-scoped requirement cannot pass without an owner."><select className="st-control" value={row.itemHolder ?? (kind === "race" ? "character" : "creature")} onChange={event => onChange({ ...row,itemHolder:event.target.value as EvolutionRequirement["itemHolder"] })}>{kind === "race" ? <option value="character">This Character</option> : <><option value="creature">This Creature</option><option value="owner">Owning Character</option></>}</select></GuidedField> : null}
    {row.requirementType === "condition" ? <GuidedField className="st-field" label="Condition name" help="Matches unresolved Active Effects conditions on the exact individual. Comparison ignores case, surrounding/repeated whitespace and Unicode compatibility differences."><input className="st-control" required value={row.conditionName ?? ""} onChange={event => onChange({ ...row,conditionName:event.target.value })} /></GuidedField> : null}
    {row.requirementType === "manual" ? <GuidedField className="st-field" label="Review category" help="The category explains what the G.O.D. must confirm. There is no automatic approval or new campaign tracking state."><select className="st-control" value={row.manualCategory ?? "god-approval"} onChange={event => onChange({ ...row,manualCategory:event.target.value as EvolutionRequirement["manualCategory"] })}>{EVOLUTION_MANUAL_CATEGORIES.map(category => <option key={category} value={category}>{EVOLUTION_MANUAL_LABELS[category]}</option>)}</select></GuidedField> : <>
      <GuidedField className="st-field" label="Comparison" help="Numeric comparisons use the individual's saved profile. Current Experience is spendable Experience; Total Experience is the separate saved total. Unknown age or missing profile data needs review. No Experience is spent."><select className="st-control" value={row.operator ?? "possessed"} onChange={event => onChange({ ...row,operator:event.target.value as EvolutionRequirement["operator"], requiredValue: NUMERIC_REQUIREMENT_OPERATORS.some(op => op === event.target.value) ? row.requiredValue ?? 0 : null })}>{(kind === "race" && row.requirementType === "skill" ? [...POSSESSION_REQUIREMENT_OPERATORS, ...NUMERIC_REQUIREMENT_OPERATORS] : numeric ? NUMERIC_REQUIREMENT_OPERATORS : ["item","form-access"].includes(row.requirementType) ? ["possessed"] as const : POSSESSION_REQUIREMENT_OPERATORS).map(op => <option key={op} value={op}>{row.requirementType === "form-access" ? "Must qualify" : EVOLUTION_OPERATOR_LABELS[op]}</option>)}</select></GuidedField>
      {numeric ? <GuidedField className="st-field" label="Required value" help={row.requirementType === "skill" ? "Enter the required purchased Skill points. Racial grants, Rank, Attributes and parent bonuses are excluded." : "Enter a nonnegative threshold for the saved age or selected Experience field."}><input className="st-control" type="number" min={0} step="any" required value={row.requiredValue ?? ""} onChange={event => onChange({ ...row,requiredValue:event.target.value === "" ? null : Number(event.target.value) })} /></GuidedField> : null}
    </>}
    <GuidedField className="st-field" label="Requirement notes" help="Required for manual review: state the event or approval needed. Optional notes for automatic requirements do not grant approval or alter the check."><textarea className="st-control" rows={2} required={row.requirementType === "manual"} value={row.notes} onChange={event => onChange({ ...row,notes:event.target.value })} /></GuidedField>
  </div>;
}

export function EvolutionEligibilityDialog(props: PreviewProps) {
  const { path, onClose, kind } = props;
  const sourceId = props.kind === "creature" ? props.path.sourceCreatureId : props.path.sourceRaceId;
  const api = kind === "creature" ? creatureActions : raceActions;
  const dialog=useRef<HTMLDialogElement>(null);
  const [search,setSearch]=useState(""),[individuals,setIndividuals]=useState<Awaited<ReturnType<typeof creatureActions.findEvolutionPreviewIndividuals>>>([]);
  const [id,setId]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState<(EvolutionEvaluation & { pathId: number; pathVersion: number })|null>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  useEffect(()=>{let current=true;const timer=setTimeout(()=>{void api.findEvolutionPreviewIndividuals(sourceId,search).then(rows=>{if(current){setIndividuals(rows);setError("");}}).catch(reason=>{if(current)setError(failure(reason));});},200);return()=>{current=false;clearTimeout(timer);};},[sourceId,search,api]);
  async function preview(){setBusy(true);setError("");setResult(null);try{setResult(await api.previewEvolutionEligibility(id,path.id));}catch(reason){setError(failure(reason));}finally{setBusy(false);}}
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="evolution-preview-title" onCancel={event=>{if(busy)event.preventDefault();else onClose();}}>
    <h3 id="evolution-preview-title">Eligibility preview — {path.name}</h3><p>Campaign G.O.D. preview only. No Evolution, Form change, Item use or Experience spending occurs.</p>
    <fieldset className={styles.fields} disabled={busy}>
      <GuidedField className="st-field" label={kind === "race" ? "Find Character" : "Find individual Creature"} help="Shows up to 30 active individuals using this exact source definition in Campaigns you run as G.O.D."><input className="st-control" value={search} onChange={event=>{setSearch(event.target.value);setId(0);setResult(null);}} /></GuidedField>
      <GuidedField className="st-field" label={kind === "race" ? "Character" : "Individual Creature"} help={kind === "race" ? "Uses this Character's current Race, saved profile, Skills, Derived Abilities, inventory and conditions." : "Uses this individual's saved current snapshot, profile, inventory and conditions."}><select className="st-control" value={id || ""} onChange={event=>{setId(Number(event.target.value));setResult(null);}}><option value="">Choose an individual</option>{individuals.map(row=><option key={row.id} value={row.id}>{row.name} (#{row.id}) — {row.campaignName}</option>)}</select></GuidedField>
      <button className="st-button" type="button" disabled={!id} onClick={()=>void preview()}>Check eligibility</button>
    </fieldset>
    {error?<p role="alert">{error}</p>:null}
    {result?<div aria-live="polite"><h4>{EVOLUTION_STATUS_LABELS[result.status]}</h4><p>{result.explanation}</p><p>Path #{result.pathId}, revision {result.pathVersion}. Saved facts at the time of this check.</p>{result.groups.map(group=><section key={group.groupNumber} className={styles.card}><h4>Group {group.groupNumber+1}: {EVOLUTION_STATUS_LABELS[group.status]}</h4>{group.requirements.map(row=><p key={row.key}>{EVOLUTION_STATUS_LABELS[row.status]}: {row.explanation}</p>)}</section>)}</div>:null}
    <button className="st-button" type="button" disabled={busy} onClick={onClose}>Close preview</button>
  </dialog>;
}
