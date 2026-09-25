"use client";
import { useRef, useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { containerAccessState, resolveInventoryAvailability } from "@/features/items/inventory-access";
import type { InventoryHandlingCommand } from "@/features/items/inventory-custody-service";
import type { InventoryLocations } from "./inventory-location-controls";

export function InventoryCustodyControls({ locations, itemId, instanceId, disabled }: { locations: InventoryLocations; itemId: number; instanceId: number | null; disabled: boolean }) {
  const [operation, setOperation] = useState<InventoryHandlingCommand["operation"]>("drop"), [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState(""), [reason, setReason] = useState(""), [scene, setScene] = useState(""), [allocation, setAllocation] = useState("");
  const [accessState, setAccessState] = useState<"open" | "closed" | "locked" | "sealed">("open"), [safeSpill, setSafeSpill] = useState(false);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const view = locations.view;
  if (!view) return null;
  const copy = instanceId === null ? null : view.instances.find(row => row.instanceId === instanceId);
  const custody = instanceId === null ? view.accessGraph.stackCustody.filter(row => row.itemId === itemId) : [];
  const availability = instanceId === null ? null : resolveInventoryAvailability(view.accessGraph, { instanceId: instanceId! });
  const container = instanceId === null ? null : view.accessGraph.containers.find(row => row.instanceId === instanceId);
  const normal = !view.activeEncounterId;
  const choices: InventoryHandlingCommand["operation"][] = [];
  if (normal && (!availability || availability.usable)) choices.push("drop");
  if ((normal || view.canRule) && (availability ? availability.custody !== "carried" && availability.ancestors.length === 0 : custody.length > 0)) choices.push("recover");
  if (normal && container?.closureMode === "open-close") choices.push("open", "close");
  if (view.canRule) {
    if (!availability || availability.ancestors.length === 0 && availability.custody === "carried") choices.push("stolen", "lost");
    if (container?.closureMode === "open-close") choices.push("access-ruling");
    if (copy?.isContainer) choices.push("destroy");
  }
  const selected = choices.includes(operation) ? operation : choices[0];
  const selectedCustody = custody.find(row => String(row.id) === allocation) ?? custody[0];
  const ruled = ["stolen", "lost", "access-ruling", "destroy"].includes(selected);
  return <div className="inventory-custody">
    {availability ? <p>Availability: {availability.blocker ?? (availability.usable ? "Carried · Loose" : "Carried · retrieve before use")}{availability.note ? ` · ${availability.note}` : ""}</p> : null}
    {container ? <p>Access: {containerAccessState(view.accessGraph, instanceId!)}</p> : null}
    {custody.map(row => <p key={row.id}>{row.quantity} × {row.status}{row.contextLabel ? ` in ${row.contextLabel}` : ""}{row.note ? ` · ${row.note}` : ""}</p>)}
    {view.canManage && choices.length ? <details><summary>Custody and access</summary><form className="inventory-move-form" onSubmit={event => {
      event.preventDefault(); if (!selected || disabled || locations.busy) return;
      const base = { characterId: view.characterId, expectedCommerceVersion: view.commerceVersion, operation: selected, itemId, instanceId,
        quantity: instanceId === null ? quantity : 1, note, reason, sceneId: scene ? Number(scene) : null,
        ...(selected === "recover" && instanceId === null ? { custodyId: selectedCustody?.id } : {}),
        ...(selected === "access-ruling" ? { accessState } : {}), ...(selected === "destroy" ? { confirmMagicalSpill: safeSpill } : {}) };
      const fingerprint = JSON.stringify(base);
      if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, "0")).join("") };
      void locations.handle({ ...base, requestKey: retry.current.key });
    }}>
      <GuidedField label="Inventory operation" help="Custody changes availability without changing ownership or child contents. Player drop requires an active Scene and a root that is not Worn or Wielded."><select className="st-control" value={selected} onChange={event => setOperation(event.target.value as InventoryHandlingCommand["operation"])}>{choices.map(value => <option key={value} value={value}>{value === "destroy" ? "Destroy container and spill contents" : value === "access-ruling" ? "Set access state (G.O.D.)" : value === "stolen" || value === "lost" ? `Mark ${value}` : value[0].toUpperCase() + value.slice(1)}</option>)}</select></GuidedField>
      {instanceId === null ? <GuidedField label="Custody quantity" help="Choose a whole quantity from the available Loose portion, or from the selected dropped/stolen/lost portion when recovering."><input className="st-control" type="number" min={1} step={1} value={quantity} onChange={event => setQuantity(Number(event.target.value))} /></GuidedField> : null}
      {selected === "recover" && instanceId === null ? <GuidedField label="Recover portion" help="Player recovery requires the same active Scene. G.O.D. may recover stolen or lost portions by ruling."><select className="st-control" value={selectedCustody?.id ?? ""} onChange={event => setAllocation(event.target.value)}>{custody.map(row => <option key={row.id} value={row.id}>{row.quantity} × {row.status} · {row.contextLabel || row.note}</option>)}</select></GuidedField> : null}
      <GuidedField label="Inventory Scene" help="Drop needs a current active Scene containing this Character. With exactly one eligible Scene, it is selected automatically. Missing Scene records never restore custody automatically."><select className="st-control" value={scene} onChange={event => setScene(event.target.value)}><option value="">Use the sole eligible Scene, if any</option>{view.scenes.map(row => <option key={row.sceneId} value={row.sceneId}>{row.contextLabel}</option>)}</select></GuidedField>
      <GuidedField label="Custody note" help="Readable location or narrative information, such as where the pack was dropped or who took it. This does not transfer ownership."><input className="st-control" value={note} onChange={event => setNote(event.target.value)} /></GuidedField>
      {ruled || view.canRule && selected === "recover" ? <GuidedField label="Inventory ruling reason" help="Record why G.O.D. is making this decision. Theft or loss may force the root equipment Inactive and reconcile its passive effects."><input className="st-control" required={ruled} value={reason} onChange={event => setReason(event.target.value)} /></GuidedField> : null}
      {selected === "access-ruling" ? <GuidedField label="Ruled access state" help="Only G.O.D. can adjudicate locked or sealed containers. This creates no key, lockpicking or damage mechanics."><select className="st-control" value={accessState} onChange={event => setAccessState(event.target.value as typeof accessState)}>{["open", "closed", "locked", "sealed"].map(value => <option key={value}>{value}</option>)}</select></GuidedField> : null}
      {selected === "destroy" ? <>
        <p>Retires this container. Exact children and stacks spill to its effective root custody. Finite substance is lost and recorded. Child Items survive.</p>
        <GuidedField label="Explicit safe spill ruling" help="Required for magical or special containers. Confirm only when your written ruling makes ordinary spilling valid. No magical destruction effects are inferred."><input type="checkbox" checked={safeSpill} onChange={event => setSafeSpill(event.target.checked)} /></GuidedField>
      </> : null}
      <button className="st-button" type="submit" disabled={disabled || locations.busy}>{selected === "destroy" ? "Resolve destruction and spill" : "Apply inventory operation"}</button>
    </form></details> : null}
  </div>;
}
