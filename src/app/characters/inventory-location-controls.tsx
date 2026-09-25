"use client";

import { useEffect, useRef, useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { calculateContainerPhysics, displayMeasurement, formatPhysical } from "@/features/items/container-physics";
import type { ContainmentCommand, PhysicalInventoryView, SubstanceCommand } from "@/features/items/inventory-containment-service";
import { getPhysicalInventoryAction, moveInventoryLocationAction, changeContainerSubstanceAction } from "./inventory-location-actions";
import "./inventory-location-controls.css";

export function useInventoryLocations(characterId: number, version: number, revision: string, onVersionChange: (version: number) => void) {
  const [view, setView] = useState<PhysicalInventoryView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const sequence = useRef(0);
  useEffect(() => {
    let cancelled = false;
    const request = ++sequence.current;
    getPhysicalInventoryAction(characterId).then(result => { if (!cancelled && request === sequence.current) { setView(result); setError(null); } })
      .catch(error => { if (!cancelled && request === sequence.current) setError(error instanceof Error ? error.message : "Inventory locations could not be loaded."); });
    return () => { cancelled = true; };
  }, [characterId, version, revision, refresh]);
  async function move(command: ContainmentCommand) {
    if (busy) return;
    sequence.current++; setBusy(true); setError(null); setNotice(null);
    try {
      const result = await moveInventoryLocationAction(command);
      setView(result); onVersionChange(result.commerceVersion); setNotice("Inventory location saved.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The Item could not be moved."); }
    finally { setBusy(false); }
  }
  async function changeSubstance(command: SubstanceCommand) {
    if (busy) return;
    sequence.current++; setBusy(true); setError(null); setNotice(null);
    try {
      const result = await changeContainerSubstanceAction(command);
      setView(result.view); onVersionChange(result.view.commerceVersion);
      setNotice(`${command.operation === "draw" ? "Drew" : "Added"} ${formatPhysical(result.adjustment.quantity)} ${result.adjustment.substance.unit} ${result.adjustment.substance.name}.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Substance could not be changed."); }
    finally { setBusy(false); }
  }
  return { view, busy, error, notice, move, changeSubstance, reload: () => setRefresh(value => value + 1) };
}
export type InventoryLocations = ReturnType<typeof useInventoryLocations>;

export function PhysicalInventorySummary({ locations }: { locations: InventoryLocations }) {
  return <div className="inventory-physical-summary">
    {locations.view ? <p><strong>Carried weight: {displayMeasurement(locations.view.carriedWeight, "lb")}</strong><small>Includes each owned Item once, nested contents, and authored loaded ammunition weight.</small></p> : <p>Loading inventory locations…</p>}
    {locations.view?.movementBlockedReason ? <p role="note">{locations.view.movementBlockedReason}</p> : null}
    {locations.error ? <p role="alert" className="inventory-location-error">{locations.error} <button className="st-button" type="button" disabled={locations.busy} onClick={locations.reload}>Reload locations</button></p> : null}
    {locations.notice ? <p role="status">{locations.notice}</p> : null}
  </div>;
}

function copyName(view: PhysicalInventoryView, instanceId: number): string {
  const copy = view.instances.find(row => row.instanceId === instanceId);
  return `${view.definitions.find(model => model.itemId === copy?.itemId)?.name ?? "Container"} #${instanceId}`;
}
export function locationPath(view: PhysicalInventoryView, instanceId: number | null): string {
  const labels: string[] = [], seen = new Set<number>();
  while (instanceId !== null && !seen.has(instanceId)) {
    seen.add(instanceId); labels.unshift(copyName(view, instanceId));
    instanceId = view.instances.find(copy => copy.instanceId === instanceId)?.containerInstanceId ?? null;
  }
  return labels.length ? labels.join(" → ") : "Loose";
}

export function InventoryLocationControl({ locations, itemId, instanceId, saved, disabled }: { locations: InventoryLocations; itemId: number; instanceId: number | null; saved: boolean; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("loose");
  const [destination, setDestination] = useState("loose");
  const [quantity, setQuantity] = useState(1);
  const view = locations.view;
  if (!saved) return <p className="inventory-location">Location: Loose · Save this copy before moving it.</p>;
  if (!view) return <p className="inventory-location">Location: loading…</p>;
  const copy = instanceId === null ? null : view.instances.find(row => row.instanceId === instanceId);
  const stack = instanceId === null ? view.stacks.find(row => row.itemId === itemId) : null;
  if (!copy && !stack) return <p className="inventory-location">Save pending inventory changes to load locations.</p>;
  const portions = copy ? [{ containerInstanceId: copy.containerInstanceId, quantity: 1 }] : [
    ...(stack!.looseQuantity ? [{ containerInstanceId: null, quantity: stack!.looseQuantity }] : []), ...stack!.allocations,
  ];
  const attachment = view.attachments.find(link => link.magazineInstanceId === instanceId);
  const currentSource = portions.find(portion => String(portion.containerInstanceId ?? "loose") === source) ?? portions[0];
  const blocked = disabled || locations.busy || !!view.movementBlockedReason || !!attachment;
  function descendsFrom(destinationId: number) {
    const seen = new Set<number>();
    let next: number | null = destinationId;
    while (next !== null && !seen.has(next)) {
      if (next === instanceId) return true;
      seen.add(next); next = view!.instances.find(row => row.instanceId === next)?.containerInstanceId ?? null;
    }
    return false;
  }
  const destinations = view.instances.filter(row => row.isContainer && row.containerInstanceId !== undefined && row.instanceId !== currentSource?.containerInstanceId && !descendsFrom(row.instanceId));
  const choices = [...(currentSource?.containerInstanceId !== null ? [{ id: "loose", label: "Loose" }] : []),
    ...destinations.map(row => ({ id: String(row.instanceId), label: locationPath(view, row.instanceId) }))];
  const selected = choices.find(choice => choice.id === destination)?.id ?? choices[0]?.id;
  const targetId = selected === "loose" || !selected ? null : Number(selected);
  let preview: string | null = null;
  if (open && selected && currentSource && quantity > 0 && quantity <= currentSource.quantity) {
    const graph = structuredClone(view.graph);
    if (copy) graph.instances.find(row => row.instanceId === instanceId)!.containerInstanceId = targetId;
    else {
      const owned = graph.stacks.find(row => row.itemId === itemId)!;
      if (currentSource.containerInstanceId === null) owned.looseQuantity -= quantity;
      else { const allocation = owned.allocations.find(row => row.containerInstanceId === currentSource.containerInstanceId)!; allocation.quantity -= quantity; }
      if (targetId === null) owned.looseQuantity += quantity;
      else { const allocation = owned.allocations.find(row => row.containerInstanceId === targetId); if (allocation) allocation.quantity += quantity; else owned.allocations.push({ containerInstanceId: targetId, quantity }); }
      owned.allocations = owned.allocations.filter(row => row.quantity > 0);
    }
    const result = calculateContainerPhysics(graph, view.definitions, view.loads, view.attachments, view.bulkContents);
    let ancestor = targetId;
    while (ancestor !== null) {
      const load = result.containers.find(container => container.instanceId === ancestor);
      if (load?.problems.length) { preview = load.problems[0]; break; }
      ancestor = graph.instances.find(row => row.instanceId === ancestor)?.containerInstanceId ?? null;
    }
  }
  return <div className="inventory-location">
    <p>Location: {attachment ? `Attached to ${copyName(view, attachment.weaponInstanceId)}` : portions.map(portion => `${copy ? "" : `${portion.quantity} × `}${locationPath(view, portion.containerInstanceId)}`).join("; ")}</p>
    <button className="st-button" type="button" disabled={blocked} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Close move controls" : "Move"}</button>
    {copy?.isContainer ? <SubstanceControls locations={locations} instanceId={copy.instanceId} disabled={blocked} /> : null}
    {attachment ? <small>Detach the magazine before moving it separately.</small> : null}
    {open ? <form className="inventory-move-form" onSubmit={event => {
      event.preventDefault(); if (!currentSource || !selected || blocked) return;
      void locations.move({ characterId: view.characterId, expectedCommerceVersion: view.commerceVersion,
        fromContainerInstanceId: currentSource.containerInstanceId, toContainerInstanceId: targetId,
        ...(copy ? { kind: "instance", instanceId: copy.instanceId } : { kind: "stack", itemId, quantity }) });
    }}>
      {!copy ? <GuidedField label="From" help="Choose which portion of this owned stack to move. The quantity owned does not change."><select className="st-control" value={String(currentSource?.containerInstanceId ?? "loose")} disabled={blocked} onChange={event => { setSource(event.target.value); setQuantity(1); }}>{portions.map(portion => <option key={String(portion.containerInstanceId)} value={String(portion.containerInstanceId ?? "loose")}>{locationPath(view, portion.containerInstanceId)} ({portion.quantity})</option>)}</select></GuidedField> : null}
      <GuidedField label="Destination" help="Choose another owned container copy or Loose. The server checks physical limits for this container and all its ancestors."><select className="st-control" value={selected ?? ""} disabled={blocked} onChange={event => setDestination(event.target.value)}>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></GuidedField>
      {!copy ? <GuidedField label="Quantity to move" help="Move only this many units from the selected location. The rest stay where they are."><input className="st-control" type="number" required min={1} max={currentSource?.quantity ?? 0} step={1} value={quantity} disabled={blocked} onChange={event => setQuantity(Number(event.target.value))} /></GuidedField> : null}
      {preview ? <p className="inventory-location-error">Preview: {preview}</p> : null}
      <button className="st-button is-primary" type="submit" disabled={blocked || !selected}>{locations.busy ? "Moving…" : "Move Item"}</button>
      {!choices.length ? <small>No other owned container is available.</small> : null}
    </form> : null}
  </div>;
}

function SubstanceControls({ locations, instanceId, disabled }: { locations: InventoryLocations; instanceId: number; disabled: boolean }) {
  const [quantity, setQuantity] = useState(1), [operation, setOperation] = useState<"add" | "draw">("draw");
  const [sourceItemId, setSourceItemId] = useState("");
  const view = locations.view!, load = view.containers.find(row => row.instanceId === instanceId);
  const source = load?.profile.source, stored = view.bulkContents.find(row => row.instanceId === instanceId);
  if (!source && !stored) return null;
  const substance = stored?.substance ?? source!.substance;
  const canAdd = source?.mode === "finite";
  return <details><summary>Substance: {substance.name} — {stored ? `${formatPhysical(stored.quantity)} ${substance.unit}` : source?.mode === "infinite" ? "Infinite source" : "Empty"}</summary>
    <p>Record an amount added or drawn. This does not apply consumption effects or create inventory Items.</p>
    <form className="inventory-move-form" onSubmit={event => { event.preventDefault(); if (!disabled) void locations.changeSubstance({ characterId: view.characterId, expectedCommerceVersion: view.commerceVersion,
      instanceId, operation: canAdd ? operation : "draw", quantity, ...(sourceItemId ? { sourceItemId: Number(sourceItemId) } : {}) }); }}>
      <GuidedField label="Substance action" help="Draw reduces a finite quantity. Drawing an infinite source keeps its identity and supply unchanged. Add records filling from an external supply; it does not transfer another container's contents."><select className="st-control" disabled={disabled} value={canAdd ? operation : "draw"} onChange={event => setOperation(event.target.value as "add" | "draw")}><option value="draw">Draw</option>{canAdd ? <option value="add">Add</option> : null}</select></GuidedField>
      {canAdd && !source.locked && operation === "add" ? <GuidedField label="Substance definition" help="Choose an authored substance from an owned source container. Existing substances must be drawn out before switching; only matching units are accepted."><select className="st-control" disabled={disabled} value={sourceItemId} onChange={event => setSourceItemId(event.target.value)}><option value="">{source.substance.name} (authored default)</option>{view.definitions.filter(row => row.container?.source?.substance.unit === source.substance.unit).map(row => <option key={row.itemId} value={row.itemId}>{row.container!.source!.substance.name} — {row.name}</option>)}</select></GuidedField> : null}
      <GuidedField label={`Substance quantity (${substance.unit})`} help="Enter a finite positive amount in the displayed unit. The server checks available quantity and all applicable container limits."><input className="st-control" type="number" min={0} step="any" required value={quantity} disabled={disabled} onChange={event => setQuantity(Number(event.target.value))} /></GuidedField>
      <button className="st-button" type="submit" disabled={disabled}>Apply substance change</button>
    </form>
  </details>;
}

export function ContainerContents({ view, instanceId, ancestors = [] }: { view: PhysicalInventoryView; instanceId: number; ancestors?: number[] }) {
  const load = view.containers.find(row => row.instanceId === instanceId);
  if (!load || ancestors.includes(instanceId)) return null;
  const copies = view.instances.filter(row => row.containerInstanceId === instanceId && !view.attachments.some(link => link.magazineInstanceId === row.instanceId));
  const stacks = view.stacks.flatMap(row => row.allocations.filter(allocation => allocation.containerInstanceId === instanceId).map(allocation => ({ ...allocation, itemId: row.itemId })));
  return <details className="inventory-container-contents"><summary>Contents of {copyName(view, instanceId)} ({copies.length + stacks.length})</summary>
    <p>Contents weight: {displayMeasurement(load.contentsWeight, "lb")} / {load.profile.weightCapacityMode === "unlimited" ? "Unlimited" : load.profile.maxWeightLb === null ? "limit not authored" : `${formatPhysical(load.profile.maxWeightLb)} lb`}<br />
      Volume: {displayMeasurement(load.usedVolume, "L")} / {load.profile.volumeCapacityMode === "unlimited" ? "Unlimited" : load.profile.volumeCapacityL === null ? "limit not authored" : `${formatPhysical(load.profile.volumeCapacityL)} L`}<br />
      Loaded container weight: {displayMeasurement(load.loadedWeight, "lb")}</p>
    {load.profile.containedWeightBehavior !== "normal" ? <p>External weight behavior: {load.profile.containedWeightBehavior}</p> : null}
    {load.profile.magicalContentRestriction !== "any" ? <p>Allowed: {load.profile.magicalContentRestriction}</p> : <p>Allowed: magical and mundane Items (subject to physical restrictions).</p>}
    {load.profile.timeBehavior !== "normal" ? <p>Time inside: {load.profile.timeBehavior}{load.profile.timeMultiplier !== null ? ` × ${load.profile.timeMultiplier}` : ""}; applies to {load.profile.timeAppliesTo}{load.profile.timeAppliesTo === "categories-types" ? `: ${[...load.profile.timeCategories, ...load.profile.timeRecordTypes].join(", ")}` : ""}.</p> : null}
    {load.profile.livingContentsAllowed ? <p>Living contents: allowed by profile; living containment is not available yet.</p> : null}
    {load.profile.source ? <p>{load.profile.source.mode === "infinite" ? "Infinite source" : "Finite source"}: {load.profile.source.substance.name}{load.profile.source.mode === "finite" ? `; maximum ${load.profile.source.maxQuantity} ${load.profile.source.substance.unit}` : ""}. Ordinary Items {load.profile.source.allowsItems ? "allowed" : "not allowed"}.</p> : null}
    {view.bulkContents.filter(row => row.instanceId === instanceId).map(row => <p key={row.instanceId}>Stored substance: {row.substance.name}, {formatPhysical(row.quantity)} {row.substance.unit}</p>)}
    {load.problems.map(problem => <p key={problem} className="inventory-location-error">{problem}</p>)}
    {copies.length || stacks.length ? <ul>{stacks.map(stack => <li key={`stack-${stack.itemId}`}>{stack.quantity} × {view.definitions.find(model => model.itemId === stack.itemId)?.name ?? `Item ${stack.itemId}`}</li>)}
      {copies.map(copy => <li key={copy.instanceId}>{copyName(view, copy.instanceId)}{copy.isContainer ? <ContainerContents view={view} instanceId={copy.instanceId} ancestors={[...ancestors, instanceId]} /> : null}</li>)}</ul> : <p>No discrete Items. Move Item contents to Loose from their rows; use substance controls to draw stored bulk contents.</p>}
  </details>;
}

/** Used within the Creature NPC's existing Inventory tab. */
export function SavedInventoryLocations({ characterId, disabled, revision }: { characterId: number; disabled: boolean; revision: string }) {
  const [version, setVersion] = useState(0);
  const locations = useInventoryLocations(characterId, version, revision, setVersion);
  return <section className="inventory-saved-locations" aria-label="Saved inventory locations"><h3>Saved inventory locations</h3><PhysicalInventorySummary locations={locations} />
    {locations.view?.stacks.map(stack => <article key={`stack-${stack.itemId}`}><strong>{locations.view!.definitions.find(model => model.itemId === stack.itemId)?.name} ({stack.ownedQuantity})</strong><InventoryLocationControl locations={locations} itemId={stack.itemId} instanceId={null} saved disabled={disabled} /></article>)}
    {locations.view?.instances.map(copy => <article key={copy.instanceId}><strong>{copyName(locations.view!, copy.instanceId)}</strong><InventoryLocationControl locations={locations} itemId={copy.itemId} instanceId={copy.instanceId} saved disabled={disabled} />{copy.isContainer ? <ContainerContents view={locations.view!} instanceId={copy.instanceId} /> : null}</article>)}
  </section>;
}
