"use client";

import { useRef, useState } from "react";
import type { EquipmentState } from "@/features/items/equipment-state";
import { adjustOwnerInventoryAction, getOwnerGrantItemsAction } from "./owner-inventory-actions";

type Removal = { itemId: number; name: string; instanceId: number | null; states: { state: EquipmentState; quantity: number }[]; charges?: string };
type Props = { characterId: number; version: number; disabled: boolean; remove?: Removal; onComplete: () => void | Promise<void> };

export function OwnerInventoryControl({ characterId, version, disabled, remove, onComplete }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const expectedVersion = useRef(version);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Awaited<ReturnType<typeof getOwnerGrantItemsAction>>>([]);
  const [search, setSearch] = useState("");
  const [itemId, setItemId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState<EquipmentState>("inactive");
  const selected = items.find(item => item.id === itemId);
  const maximum = remove?.states.find(entry => entry.state === state)?.quantity ?? 1000;

  async function open() {
    expectedVersion.current = version;
    setError(null); setQuantity(1); setSearch(""); setItemId(null);
    setState(remove?.states[0]?.state ?? "inactive");
    dialog.current?.showModal();
    if (remove) return;
    setBusy(true);
    try { setItems(await getOwnerGrantItemsAction(characterId)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The available items could not be loaded."); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (inFlight.current || busy || disabled || (!remove && !selected)) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const base = { characterId, itemId: remove?.itemId ?? selected!.id, quantity, expectedCommerceVersion: expectedVersion.current };
      await adjustOwnerInventoryAction(remove ? { ...base, operation: "remove", instanceId: remove.instanceId, state } : { ...base, operation: "grant" });
      await onComplete();
      dialog.current?.close();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The inventory adjustment could not be completed."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <>
    <button type="button" className={`st-button${remove ? "" : " is-primary"}`} disabled={disabled || busy} onClick={() => void open()}>{remove ? "Remove" : "Add Item"}</button>
    <dialog ref={dialog} className="character-inventory-dialog" aria-label={remove ? `Remove ${remove.name}` : "Add Item"} onCancel={event => { if (busy) event.preventDefault(); }}>
      <form onSubmit={event => { event.preventDefault(); void confirm(); }}>
        <h3>{remove ? `Remove ${remove.name}` : "Add Item"}</h3>
        <p>{remove ? "Remove from this Character's inventory. No currency is refunded." : "Grant campaign-available items to this Character. No currency is charged; new items start inactive."}</p>
        {remove ? <>
          {remove.instanceId !== null ? <p>Exact copy #{remove.instanceId}{remove.charges ? ` · ${remove.charges}` : ""}</p> : <label className="st-field"><span>Remove from state</span><select className="st-control" disabled={busy} value={state} onChange={event => { setState(event.target.value as EquipmentState); setQuantity(1); }}>{remove.states.map(entry => <option key={entry.state} value={entry.state}>{entry.state} ({entry.quantity} owned)</option>)}</select><small>Other copies keep their current equipment state.</small></label>}
        </> : <>
          <label className="st-field"><span>Search campaign items</span><input className="st-control" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, type, or item ID" /></label>
          <div className="character-inventory-dialog__results" role="group" aria-label="Available campaign items">
            {items.filter(item => [item.name, item.canonicalId, item.recordType].some(value => value.toLowerCase().includes(search.trim().toLowerCase()))).map(item => <label key={item.id}><input type="radio" name="grant-item" checked={itemId === item.id} disabled={busy} onChange={() => setItemId(item.id)} /><span><strong>{item.name}</strong><small>{item.recordType} · {item.canonicalId}</small></span></label>)}
            {!busy && !items.length ? <p>No items are currently available in this Campaign.</p> : null}
          </div>
          {selected?.description ? <details><summary>Item description</summary><p>{selected.description}</p></details> : null}
        </>}
        {remove?.instanceId != null ? null : <label className="st-field"><span>Quantity to {remove ? "remove" : "add"}</span><input className="st-control" type="number" min={1} max={maximum} step={1} required value={quantity} disabled={busy} onChange={event => setQuantity(Number(event.target.value))} /><small>{remove ? `Up to ${maximum} copies in the selected state.` : "Enter a whole number. Add up to 1,000 copies per adjustment."}</small></label>}
        {remove || selected ? <p className="character-inventory-dialog__confirmation">{remove ? "Remove" : "Add"} {quantity} × {remove?.name ?? selected?.name}{remove?.instanceId != null ? ` (copy #${remove.instanceId})` : remove ? ` (${state})` : ""}?</p> : null}
        {error ? <p className="character-feedback is-error" role="alert">{error}</p> : null}
        <footer><button type="button" className="st-button" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button><button type="submit" className={`st-button ${remove ? "is-danger" : "is-primary"}`} disabled={disabled || busy || (!remove && !selected)}>{busy ? "Working…" : remove ? "Confirm Removal" : "Confirm Addition"}</button></footer>
      </form>
    </dialog>
  </>;
}
