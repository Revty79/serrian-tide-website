"use client";
import { useEffect, useId, useState } from "react";
import type { findRelatedItems } from "@/app/heavens/items/actions";
import { ABILITY_FACT_DEFINITIONS } from "./facts";

export function AbilityFactSelector({ category, value, onChange, id: suppliedId }: {
  category: "event" | "equipment" | "state"; value: string | null; onChange: (key: string) => void; id?: string;
}) {
  const [search, setSearch] = useState("");
  const generatedId = useId(), id = suppliedId ?? generatedId;
  const [items, setItems] = useState<Awaited<ReturnType<typeof findRelatedItems>>>([]);
  const [itemError, setItemError] = useState("");
  const exactItem = /^equipment\.item:(.+):(owned|worn|wielded|equipped)$/.exec(value ?? "");
  const exactCondition = category === "state" && value?.startsWith("state.condition:");
  useEffect(() => {
    if (category !== "equipment") return;
    let active = true;
    const timer = setTimeout(() => { void import("@/app/heavens/items/actions").then(({ findRelatedItems }) => findRelatedItems(search)).then((rows) => { if (active) { setItems(rows); setItemError(""); } }, () => { if (active) setItemError("Item search is unavailable. Retry your search or retain the saved key."); }); }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [category, search]);
  const definitions = ABILITY_FACT_DEFINITIONS.filter((entry) => entry.category === category);
  const known = definitions.find(({ key }) => key === value);
  const matches = definitions.filter(({ label, key }) => `${label} ${key}`.toLowerCase().includes(search.toLowerCase()));
  return <div>
    <input className="st-control" aria-label="Search supported facts" placeholder={category === "equipment" ? "Search facts or Items" : "Search supported facts"} value={search} onChange={(event) => setSearch(event.target.value)} />
    <select id={id} className="st-control" aria-label="Supported condition fact" value={known?.key ?? ""} onChange={(event) => { if (event.target.value) onChange(event.target.value); }}>
      <option value="">{value && !known ? "Custom saved key" : "Choose a supported fact"}</option>
      {known && !matches.includes(known) && <option value={known.key}>{known.label}</option>}
      {matches.map(({ key, label, type }) => <option key={key} value={key}>{label} ({type === "boolean" ? "yes / no" : type})</option>)}
    </select>
    {known && <small>{known.producer}</small>}
    {category === "equipment" && <div>
      <select className="st-control" aria-label="Exact Item condition" value={exactItem?.[1] ?? ""} onChange={(event) => { if (event.target.value) onChange(`equipment.item:${event.target.value}:${exactItem?.[2] ?? "owned"}`); }}>
        <option value="">Choose an exact Item</option>
        {exactItem && !items.some(({ canonicalId }) => canonicalId === exactItem[1]) && <option value={exactItem[1]}>Saved Item: {exactItem[1]}</option>}
        {items.map(({ canonicalId, name }) => <option key={canonicalId} value={canonicalId}>{name}</option>)}
      </select>
      <select className="st-control" aria-label="Required Item state" disabled={!exactItem} value={exactItem?.[2] ?? "owned"} onChange={(event) => onChange(`equipment.item:${exactItem![1]}:${event.target.value}`)}>
        <option value="owned">Owned</option><option value="worn">Worn</option><option value="wielded">Wielded</option><option value="equipped">Equipped (including Worn or Wielded)</option>
      </select>
      {itemError && <p role="status">{itemError}</p>}
    </div>}
    {category === "state" && <label>Exact active Condition name<input className="st-control" placeholder="For example, Enraged" value={exactCondition ? value!.slice("state.condition:".length) : ""} onChange={(event) => onChange(`state.condition:${event.target.value}`)} /></label>}
    <details open={Boolean(value && !known && !exactItem && !exactCondition)}><summary>Advanced / custom key</summary>
      <input className="st-control" aria-label={category === "event" ? "Event Key" : "Condition Key"} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
      <p>Unknown keys require a G.O.D. ruling. Typing an Event Key does not create an event.</p>
      {category === "equipment" && <p>Exact Items: equipment.item:CANONICAL-ID:owned (or worn, wielded, equipped). The Item must exist in the catalog.</p>}
      {category === "state" && <p>Exact active condition: state.condition:Condition Name. Spelling and case must match the stored condition.</p>}
    </details>
  </div>;
}
