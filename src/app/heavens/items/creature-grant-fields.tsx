"use client";
import { useEffect, useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { findGrantCreatures, type ItemDraft } from "./actions";

export function CreatureGrantFields({ value, onChange }: { value: ItemDraft["creatureGrant"]; onChange: (value: ItemDraft["creatureGrant"]) => void }) {
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<Awaited<ReturnType<typeof findGrantCreatures>>>([]);
  const [error, setError] = useState("");
  const enabled = !!value;
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const timer = setTimeout(() => { void findGrantCreatures(search).then(rows => { if (current) { setCandidates(rows); setError(""); } }).catch(reason => { if (current) setError(reason instanceof Error ? reason.message : "Could not load Creature definitions."); }); }, 200);
    return () => { current = false; clearTimeout(timer); };
  }, [enabled, search]);
  return <div className="item-field--wide">
    <GuidedField className="item-field" label="Grants Creature on Purchase" help="Purchasing an inventory-transfer listing creates one persistent Creature per unit. A service listing remains a service. Related Creature properties are descriptive and do not grant animals.">
      <input type="checkbox" checked={enabled} onChange={event => onChange(event.target.checked ? { creatureId: 0 } : null)} />
    </GuidedField>
    {enabled ? <>
      <GuidedField className="item-field" label="Find granted Creature" help="Search for the exact species or variant this listing grants."><input value={search} onChange={event => setSearch(event.target.value)} /></GuidedField>
      <GuidedField className="item-field" label="Granted Creature definition" help="Required when enabled. Existing purchases keep their individual identity and state when this setting changes.">
        <select value={value?.creatureId || ""} onChange={event => onChange(candidates.find(candidate => candidate.creatureId === Number(event.target.value)) ?? { creatureId: 0 })}>
          <option value="">Choose a Creature</option>
          {value?.creatureId ? <option value={value.creatureId}>{value.creatureName ?? `Creature #${value.creatureId}`}</option> : null}
          {candidates.filter(candidate => candidate.creatureId !== value?.creatureId).map(candidate => <option key={candidate.creatureId} value={candidate.creatureId}>{candidate.creatureName} (#{candidate.creatureId})</option>)}
        </select>
      </GuidedField>
      {error ? <p role="alert">{error}</p> : null}
    </> : null}
  </div>;
}
