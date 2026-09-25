"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { containerAccessState, resolveInventoryAvailability } from "@/features/items/inventory-access";
import { displayMeasurement } from "@/features/items/container-physics";
import { decimalAdd } from "@/lib/decimal";
import type { CombatInventoryCommand } from "@/features/tabletop-operations/combat-inventory-service";
import { readCombatInventory, handleCombatInventory, ruleCombatInventoryCost } from "./command-actions";
import type { CombatScreenScope } from "./screen-types";
import "./inventory-handling-controls.css";

export function inventoryRequestKey() { return Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, "0")).join(""); }
export function InventoryHandlingControls({ scope, characterId, disabled, canControl, refresh, revision = "" }: {
  scope: CombatScreenScope; characterId: number; disabled: boolean; canControl: boolean; refresh: () => Promise<void>; revision?: string;
}) {
  const [workspace, setWorkspace] = useState<Awaited<ReturnType<typeof readCombatInventory>> | null>(null);
  const [operation, setOperation] = useState<CombatInventoryCommand["operation"]>("retrieve"), [selected, setSelected] = useState("");
  const [destination, setDestination] = useState(""), [quantity, setQuantity] = useState(1), [cost, setCost] = useState(""), [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const retry = useRef<{ fingerprint: string; command: CombatInventoryCommand } | null>(null);
  const reload = useCallback(async () => { try { setWorkspace(await readCombatInventory(scope, characterId)); } catch (caught) { setError(caught instanceof Error ? caught.message : "Inventory could not load."); } }, [scope, characterId]);
  useEffect(() => {
    let current = true;
    if (characterId > 0) readCombatInventory(scope, characterId).then(value => { if (current) setWorkspace(value); })
      .catch(caught => { if (current) setError(caught instanceof Error ? caught.message : "Inventory could not load."); });
    return () => { current = false; };
  }, [scope, revision, characterId]);
  if (characterId <= 0) return null;
  const view = workspace?.view;
  const name = (id: number) => view?.definitions.find(row => row.itemId === id)?.name ?? `Item #${id}`;
  const portions = view ? [
    ...view.instances.map(row => ({ key: `copy:${row.instanceId}`, instanceId: row.instanceId as number | null, itemId: row.itemId, containerInstanceId: row.containerInstanceId, quantity: 1,
      isContainer: row.isContainer, label: `${name(row.itemId)} #${row.instanceId}`, access: resolveInventoryAvailability(view.accessGraph, { instanceId: row.instanceId }) })),
    ...view.stacks.flatMap(row => [...(row.looseQuantity ? [{ containerInstanceId: null, quantity: row.looseQuantity }] : []), ...row.allocations].map(portion => ({
      key: `stack:${row.itemId}:${portion.containerInstanceId ?? "loose"}`, instanceId: null, itemId: row.itemId, ...portion, isContainer: false,
      label: `${name(row.itemId)} × ${portion.quantity}`, access: resolveInventoryAvailability(view.accessGraph, { itemId: row.itemId, containerInstanceId: portion.containerInstanceId }),
    }))),
  ] : [];
  const choices = portions.filter(row => operation === "open" || operation === "close" ? row.isContainer : operation === "retrieve" ? row.containerInstanceId !== null : row.containerInstanceId === null);
  const chosen = choices.find(row => row.key === selected) ?? choices[0];
  const containers = view?.instances.filter(row => row.isContainer && row.instanceId !== chosen?.instanceId) ?? [];
  const dest = containers.find(row => String(row.instanceId) === destination)?.instanceId ?? containers[0]?.instanceId ?? null;
  const chain = !view || !chosen ? [] : operation === "retrieve" ? chosen.access.ancestors : operation === "stow" && dest !== null ? [dest, ...resolveInventoryAvailability(view.accessGraph, { instanceId: dest }).ancestors]
    : (operation === "open" || operation === "close") && chosen.instanceId !== null ? [chosen.instanceId] : [];
  const costs = chain.map(id => view?.containers.find(row => row.instanceId === id)?.profile[`${operation === "drop" ? "retrieve" : operation}InitiativeCost`] ?? null);
  const unresolved = operation === "drop" || costs.some(value => value === null);
  const total = costs.reduce<number>((sum, value) => Number.isFinite(sum) ? decimalAdd(sum, value ?? 0) : sum, 0);
  async function run(task: () => Promise<unknown>) { if (busy) return; setBusy(true); setError(""); setNotice(""); try { await task(); await reload(); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Handling failed."); } finally { setBusy(false); } }
  function command() {
    if (!view || !chosen) throw new Error("Choose inventory to handle.");
    const base = { characterId, expectedCommerceVersion: view.commerceVersion, operation, itemId: chosen.itemId, instanceId: chosen.instanceId,
      quantity: chosen.instanceId === null ? quantity : 1, containerInstanceId: operation === "retrieve" ? chosen.containerInstanceId : operation === "stow" ? dest : null,
      ...(unresolved && scope.role === "god" ? { initiativeRuling: { cost: cost === "" ? NaN : Number(cost), reason } } : {}) };
    const fingerprint = JSON.stringify(base);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, command: { ...base, requestKey: inventoryRequestKey() } };
    return retry.current.command;
  }
  return <details className="inventory-combat-handling"><summary>Inventory handling</summary>
    <p>Retrieve to Loose before using an Item. Opening is separate. Stow from Loose; retrieval does not draw or ready a weapon.</p>
    {!view ? <p>Loading inventory…</p> : <>
      <p>Carried weight: {displayMeasurement(view.carriedWeight, "lb")}</p>
      <ul>{view.containers.map(row => { const access = resolveInventoryAvailability(view.accessGraph, { instanceId: row.instanceId }); return <li key={row.instanceId}>{name(view.instances.find(copy => copy.instanceId === row.instanceId)!.itemId)} #{row.instanceId}: {containerAccessState(view.accessGraph, row.instanceId)} · {access.custody}{access.blocker ? ` — ${access.blocker}` : ""}</li>; })}</ul>
      <GuidedField label="Handling operation" help="Combat handling spends Initiative through the encounter timeline. The Item stays in place until completion."><select className="st-control" value={operation} onChange={event => { setOperation(event.target.value as CombatInventoryCommand["operation"]); setSelected(""); }}>{["retrieve", "stow", "open", "close", "drop"].map(value => <option key={value}>{value}</option>)}</select></GuidedField>
      <GuidedField label="Inventory to handle" help="Choose an exact copy or the stack portion at a particular location. Unavailable portions remain visible for context."><select className="st-control" value={chosen?.key ?? ""} onChange={event => setSelected(event.target.value)}>{choices.map(row => <option key={row.key} value={row.key}>{row.label} · {row.containerInstanceId === null ? "Loose" : `container #${row.containerInstanceId}`}{row.access.blocker ? ` · ${row.access.blocker}` : ""}</option>)}</select></GuidedField>
      {chosen?.access.blocker ? <p role="note">{chosen.access.blocker}</p> : null}
      {operation === "stow" ? <GuidedField label="Stow destination" help="The destination and every ancestor must be carried and open. Capacity is checked again on completion."><select className="st-control" value={String(dest ?? "")} onChange={event => setDestination(event.target.value)}>{containers.map(row => <option key={row.instanceId} value={row.instanceId}>{name(row.itemId)} #{row.instanceId}</option>)}</select></GuidedField> : null}
      {chosen?.instanceId === null ? <GuidedField label="Handling quantity" help="Only this many units move. Ownership and the remaining quantity do not change."><input className="st-control" type="number" min={1} max={chosen.quantity} step={1} value={quantity} onChange={event => setQuantity(Number(event.target.value))} /></GuidedField> : null}
      <p>Initiative: {unresolved ? "G.O.D. ruling required" : `${costs.join(" + ")} = ${total}`}{chain.length ? ` · accessed containers: ${chain.map(id => `#${id}`).join(" → ")}` : ""}.</p>
      {scope.role === "god" ? <>
        <GuidedField label="Handling Initiative ruling" help="Supply the total cost only when a required authored cost is blank, or for Drop. Zero is allowed; no drop cost is assumed."><input className="st-control" type="number" min={0} step="any" value={cost} onChange={event => setCost(event.target.value)} /></GuidedField>
        <GuidedField label="Handling ruling reason" help="Explain this G.O.D. timing decision. It is retained with the request and action."><input className="st-control" value={reason} onChange={event => setReason(event.target.value)} /></GuidedField>
      </> : null}
      <button className="st-button" disabled={disabled || busy || !canControl || !chosen} onClick={() => void run(async () => { await handleCombatInventory(scope, command(), unresolved && scope.role === "player"); setNotice(unresolved && scope.role === "player" ? "Cost requested from G.O.D." : "Handling committed. Follow the encounter timeline."); })}>{unresolved && scope.role === "player" ? "Request handling cost" : "Start handling"}</button>
      {workspace?.requests.map(row => <div key={row.id}><p>Request #{row.id}: {row.intent} — {row.status}{row.godResponse ? `: ${row.godResponse}` : ""}</p>
        {scope.role === "god" && ["pending", "clarification-requested"].includes(row.status) ? <button className="st-button" disabled={disabled || busy || cost === "" || !reason.trim()} onClick={() => void run(() => ruleCombatInventoryCost(scope, row.id, Number(cost), reason))}>Approve handling cost #{row.id}</button> : null}
        {scope.role === "player" && row.status === "approved" && !row.linkedDeclarationId && !row.ruling.inventoryConsumedKey ? <button className="st-button" disabled={disabled || busy || !canControl} onClick={() => void run(() => handleCombatInventory(scope, { ...row.frozenRequest.inventoryHandling as CombatInventoryCommand, rulingRequestId: row.id }))}>Start approved handling #{row.id}</button> : null}
      </div>)}
      {workspace?.actions.map(row => <p role="status" key={row.id}>Handling #{row.id}: {row.label} — {row.status}{row.status === "pending" ? ` · ${row.remaining} Initiative remaining` : ""}</p>)}
    </>}
    <button className="st-button" disabled={busy} onClick={() => void reload()}>Refresh handling</button>
    {error ? <p role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
  </details>;
}
