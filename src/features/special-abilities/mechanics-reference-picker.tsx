"use client";
import { useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { referenceKey, type MechanicsReference } from "./models";
import type { MechanicsEditorReferences } from "./authoring";

export function MechanicsReferencePicker({ kind, value, references, onChange }: {
  kind: MechanicsReference["kind"]; value: MechanicsReference; references: MechanicsEditorReferences | null; onChange: (ref: MechanicsReference) => void;
}) {
  const [search, setSearch] = useState("");
  const name = kind === "skill" ? "Skill" : "Derived Ability";
  const selectedKey = referenceKey(value);
  const candidates = references?.options.filter(row => row.kind === kind && (!row.archived || referenceKey(row) === selectedKey)) ?? [];
  const selected = candidates.find(row => referenceKey(row) === selectedKey);
  const id = value.kind === "skill" ? value.skillId : value.derivedAbilityId;
  return <div className="mechanics-picker">
    <GuidedField label={`Find ${name}`} help="Search the available catalog by name, then choose the exact definition below. Existing archived links remain readable.">
      <input className="st-control" type="search" value={search} onChange={event => setSearch(event.target.value)} />
    </GuidedField>
    <GuidedField label={`Selected ${name}`} help="The selected record is saved by its identity. This link does not grant or execute it.">
      <select className="st-control" value={id || ""} disabled={!references} onChange={event => onChange(kind === "skill"
        ? { kind, skillId: Number(event.target.value) } : { kind, derivedAbilityId: Number(event.target.value) })}>
        <option value="">Choose {name}</option>
        {id > 0 && !selected && <option value={id} disabled>{references ? "Saved reference unavailable" : "Loading saved reference…"}</option>}
        {candidates.filter(row => referenceKey(row) === selectedKey || row.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(row =>
          <option key={referenceKey(row)} value={row.kind === "skill" ? row.skillId : row.derivedAbilityId} disabled={row.archived}>
            {row.name}{row.classification ? ` · ${row.classification}` : ""}{candidates.filter(other => other.name === row.name).length > 1 ? ` · record #${row.kind === "skill" ? row.skillId : row.derivedAbilityId}` : ""}{row.archived ? " · Archived (retained)" : ""}
          </option>)}
      </select>
    </GuidedField>
    {selected?.archived && <p role="status">Archived reference retained. You may keep it or choose an available replacement.</p>}
    {references && id > 0 && !selected && <p role="alert">This selected definition is unavailable. It has not been replaced or removed.</p>}
  </div>;
}
