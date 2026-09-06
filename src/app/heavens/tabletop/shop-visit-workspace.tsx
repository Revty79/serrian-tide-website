"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { formatCampaignMoney } from "@/features/characters/currency-rules";
import type {
  ShopVisitCurrencyView,
  GodShopVisitWorkspace,
  GodShopVisitView,
  ShopVisitPublicShopView,
  ShopVisitMode,
} from "@/features/tabletop-operations/shop-visit-service";
import type { ShopCommerceView } from "@/features/tabletop-operations/shop-commerce-service";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

import {
  endShopVisit,
  enterShopVisit,
  completeGodOverridePurchase,
  correctCharacterBalance,
  giveCharacterMoney,
  removeShopVisitor,
  reviewShopRequest,
  setShopVisitMode,
  type ShopVisitActionResult,
} from "./shop-visit-actions";

type Feedback = { kind: "success" | "error"; message: string };

async function expectAction<T>(result: Promise<ShopVisitActionResult<T>>): Promise<T> {
  const settled = await result;
  if (!settled.ok) throw new Error(settled.error);
  return settled.value;
}

function money(value: number | null, currency: ShopVisitCurrencyView): string {
  return value === null
    ? "Price not listed"
    : formatCampaignMoney(value, currency.currencySystem, currency.derivedCurrencies);
}

function GodCommerceCard({
  commerce,
  currency,
  busy,
  run,
}: {
  commerce: ShopCommerceView;
  currency: ShopVisitCurrencyView;
  busy: boolean;
  run: (work: () => Promise<void>, success: string) => Promise<boolean>;
}) {
  const operationKeys = useRef(new Map<string, string>());
  const [prices, setPrices] = useState<Record<number, number>>(() => Object.fromEntries(
    commerce.requests.flatMap((request) => request.lines.map((line) => [line.id, line.currentUnitPriceCredits])),
  ));
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const open = commerce.requests.filter(({ status }) => status === "pending" || status === "owner-review");

  function key(kind: string, id: number): string {
    const identity = `${kind}:${id}`;
    const current = operationKeys.current.get(identity);
    if (current) return current;
    const created = globalThis.crypto.randomUUID();
    operationKeys.current.set(identity, created);
    return created;
  }

  return <article className="tabletop-shop-commerce-card">
    <header><div><span>CHARACTER COMMERCE</span><h5>{commerce.characterName}</h5></div><strong>{money(commerce.characterBalanceCredits, currency)}</strong></header>
    <p>Shop balance: {money(commerce.shopBalanceCredits, currency)} · {commerce.changedSaleConfirmationMode === "character-owner-accepts" ? "Owner accepts changed sale terms" : "G.O.D. approval finalizes changed sale terms"}</p>
    {open.length ? <div>{open.map((request) => <section key={request.id}>
      <header><div><span>#{request.id} · {request.kind}</span><strong>{request.status === "owner-review" ? "Owner review" : "Pending"}</strong></div><strong>{money(request.totalCredits, currency)}</strong></header>
      <div>{request.lines.map((line) => <label className="st-field" key={line.id}><span>{line.quantity} × {line.name}{request.kind === "sale" ? " · final unit price" : ` · ${money(line.currentUnitPriceCredits, currency)}`}</span>{request.kind === "sale" ? <input className="st-control" type="number" min={0} step="0.01" value={prices[line.id] ?? line.currentUnitPriceCredits} onChange={(event) => setPrices((current) => ({ ...current, [line.id]: Number(event.target.value) }))} /> : null}</label>)}</div>
      {request.narrativeNote ? <p>{request.narrativeNote}</p> : null}
      <label className="st-field"><span>Review / rejection reason</span><input className="st-control" maxLength={1000} value={reasons[request.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [request.id]: event.target.value }))} /></label>
      <footer><button className="st-button is-primary" type="button" disabled={busy || request.status === "owner-review"} onClick={() => void run(async () => {
        await expectAction(reviewShopRequest({
          requestId: request.id,
          characterId: commerce.characterId,
          decision: "approve",
          revisedLines: request.kind === "sale" ? request.lines.map((line) => ({ requestLineId: line.id, quantity: line.quantity, unitPriceCredits: prices[line.id] ?? line.currentUnitPriceCredits })) : undefined,
          reason: reasons[request.id],
          submissionKey: key("approve", request.id),
        }));
        operationKeys.current.delete(`approve:${request.id}`);
      }, request.kind === "sale" ? "Sale request reviewed." : "Purchase request reviewed.")}>Approve Current Terms</button><button className="st-button is-danger" type="button" disabled={busy || !(reasons[request.id] ?? "").trim()} onClick={() => void run(async () => {
        await expectAction(reviewShopRequest({ requestId: request.id, characterId: commerce.characterId, decision: "reject", reason: reasons[request.id], submissionKey: key("reject", request.id) }));
        operationKeys.current.delete(`reject:${request.id}`);
      }, `Request #${request.id} rejected.`)}>Reject</button></footer>
    </section>)}</div> : <p>No purchase or sale requests await review.</p>}
    {commerce.history.length ? <details><summary>Recent receipts ({commerce.history.length})</summary><ol>{commerce.history.map((entry) => <li key={entry.id}><strong>#{entry.id} · {entry.kind} · {money(entry.totalCredits, currency)}</strong><span>{entry.lines.map((line) => `${line.quantity} × ${line.name}`).join(", ")}</span></li>)}</ol></details> : null}
  </article>;
}

function GodMoneyTools({
  campaignId,
  characters,
  currency,
  busy,
  run,
}: {
  campaignId: number;
  characters: GodShopVisitWorkspace["campaignCharacters"];
  currency: ShopVisitCurrencyView;
  busy: boolean;
  run: (work: () => Promise<void>, success: string) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const key = useRef<string | null>(null);
  const [characterId, setCharacterId] = useState(characters[0]?.characterId ?? 0);
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"grant" | "correction">("grant");
  return <>
    <button type="button" className="st-button is-secondary" disabled={busy || !characters.length} onClick={() => dialog.current?.showModal()}>Give / Correct Money</button>
    <dialog ref={dialog} className="tabletop-shop-commerce-dialog"><section><header><div><span>TRACEABLE MONEY EVENT</span><h4>Character money</h4><p>Grants and deliberate balance corrections are recorded in the Character&apos;s purse history.</p></div></header><label className="st-field"><span>Character</span><select className="st-control" value={characterId} onChange={(event) => setCharacterId(Number(event.target.value))}>{characters.map((entry) => <option value={entry.characterId} key={entry.characterId}>{entry.name} · {entry.playerName}</option>)}</select></label><label className="st-field"><span>Action</span><select className="st-control" value={mode} onChange={(event) => setMode(event.target.value as "grant" | "correction")}><option value="grant">Give money</option><option value="correction">Correct balance</option></select></label><label className="st-field"><span>{mode === "grant" ? "Positive amount" : "New canonical balance"}</span><input className="st-control" type="number" min={0} step="0.01" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /><small>{money(amount, currency)}</small></label><label className="st-field"><span>Required reason</span><textarea className="st-control" rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label><footer><button type="button" className="st-button is-secondary" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button><button type="button" className="st-button is-primary" disabled={busy || !characterId || !reason.trim() || (mode === "grant" && amount <= 0)} onClick={() => void run(async () => {
      key.current ??= globalThis.crypto.randomUUID();
      if (mode === "grant") await expectAction(giveCharacterMoney({ campaignId, characterId, amountCredits: amount, reason, submissionKey: key.current }));
      else await expectAction(correctCharacterBalance({ campaignId, characterId, newBalanceCredits: amount, reason, submissionKey: key.current }));
      key.current = null;
      dialog.current?.close();
    }, mode === "grant" ? "Money grant recorded." : "Balance correction recorded.")}>Record {mode === "grant" ? "Grant" : "Correction"}</button></footer></section></dialog>
  </>;
}

function GodOverridePurchase({
  campaignId,
  shop,
  currency,
  characters,
  busy,
  run,
}: {
  campaignId: number;
  shop: ShopVisitPublicShopView;
  currency: ShopVisitCurrencyView;
  characters: GodShopVisitWorkspace["campaignCharacters"];
  busy: boolean;
  run: (work: () => Promise<void>, success: string) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const key = useRef<string | null>(null);
  const [characterId, setCharacterId] = useState(characters[0]?.characterId ?? 0);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [narrativeNote, setNarrativeNote] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const selected = shop.offerings.flatMap((offering) => (quantities[offering.id] ?? 0) > 0
    ? [{ offeringId: offering.id, quantity: quantities[offering.id]! }]
    : []);
  return <>
    <button type="button" className="st-button is-secondary" disabled={busy || !characters.length} onClick={() => dialog.current?.showModal()}>Transaction Override</button>
    <dialog ref={dialog} className="tabletop-shop-commerce-dialog"><section><header><div><span>G.O.D. TRANSACTION OVERRIDE</span><h4>Purchase from {shop.name}</h4><p>Use only for a closed Shop or a transaction outside current visit context. Campaign, archive, ownership, stock, and funds rules still apply.</p></div></header><label className="st-field"><span>Campaign Character</span><select className="st-control" value={characterId} onChange={(event) => setCharacterId(Number(event.target.value))}>{characters.map((entry) => <option value={entry.characterId} key={entry.characterId}>{entry.name} · {entry.playerName}</option>)}</select></label><div className="tabletop-shop-commerce-picker">{shop.offerings.map((offering) => <label className="st-field" key={offering.id}><span>{offering.name} · {money(offering.sellingPriceCredits, currency)}</span><input className="st-control" type="number" min={0} max={offering.unlimitedStock ? 999 : offering.limitedQuantity ?? 0} step={1} value={quantities[offering.id] ?? 0} onChange={(event) => setQuantities((current) => ({ ...current, [offering.id]: Number(event.target.value) }))} /></label>)}</div><label className="st-field"><span>Narrative note (optional)</span><textarea className="st-control" rows={2} maxLength={1000} value={narrativeNote} onChange={(event) => setNarrativeNote(event.target.value)} /></label><label className="st-field"><span>Required override reason</span><textarea className="st-control" rows={3} maxLength={1000} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} /></label><footer><button type="button" className="st-button is-secondary" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button><button type="button" className="st-button is-primary" disabled={busy || !characterId || !selected.length || !overrideReason.trim()} onClick={() => void run(async () => {
      key.current ??= globalThis.crypto.randomUUID();
      await expectAction(completeGodOverridePurchase({ campaignId, shopId: shop.id, characterId, lines: selected, narrativeNote, overrideReason, submissionKey: key.current }));
      key.current = null;
      setQuantities({});
      setNarrativeNote("");
      setOverrideReason("");
      dialog.current?.close();
    }, "G.O.D. override purchase completed and recorded.")}>Complete Override Purchase</button></footer></section></dialog>
  </>;
}

function VisitDetail({
  visit,
  campaignCharacters,
  canOperate,
  busy,
  feedback,
  run,
  clearFeedback,
  onReturn,
}: {
  visit: GodShopVisitView;
  campaignCharacters: GodShopVisitWorkspace["campaignCharacters"];
  canOperate: boolean;
  busy: boolean;
  feedback: Feedback | null;
  run: (work: () => Promise<void>, success: string) => Promise<boolean>;
  clearFeedback: () => void;
  onReturn: () => void;
}) {
  const endDialogRef = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [endReason, setEndReason] = useState("");
  const [endClientError, setEndClientError] = useState<string | null>(null);
  const categories = useMemo(() => [...new Set(visit.shop.offerings.map((entry) => entry.category))], [visit.shop.offerings]);
  const normalized = search.trim().toLocaleLowerCase();
  const offerings = visit.shop.offerings.filter((entry) => (
    (category === "all" || entry.category === category)
    && (!normalized || [entry.name, entry.category, entry.family, entry.description, entry.canonicalId]
      .some((value) => value.toLocaleLowerCase().includes(normalized)))
  ));

  function openEndDialog(): void {
    setEndReason("");
    setEndClientError(null);
    clearFeedback();
    endDialogRef.current?.showModal();
  }

  function closeEndDialog(): void {
    if (busy) return;
    endDialogRef.current?.close();
    setEndReason("");
    setEndClientError(null);
    clearFeedback();
  }

  async function submitEndVisit(): Promise<void> {
    if (busy) return;
    const normalized = endReason.trim();
    if (!normalized) {
      setEndClientError("Visit end reason is required.");
      return;
    }
    if (normalized.length > 1000) {
      setEndClientError("Visit end reason cannot exceed 1,000 characters.");
      return;
    }
    setEndClientError(null);
    const succeeded = await run(
      () => expectAction(endShopVisit(visit.id, endReason)),
      `${visit.shop.name} visit ended.`,
    );
    if (succeeded) endDialogRef.current?.close();
  }

  return <section className="tabletop-shop-visit-detail" aria-labelledby={`shop-visit-${visit.id}-title`}>
    <header>
      <div><span>ACTIVE SHOP VISIT</span><h4 id={`shop-visit-${visit.id}-title`}>{visit.shop.name}</h4><p>{visit.shop.category} · {visit.placement.kind === "town" ? "Town placement" : "Independent placement"}</p></div>
      <div><button type="button" className="st-button is-secondary" onClick={onReturn}>Return to Scene</button>{canOperate ? <><GodMoneyTools campaignId={visit.campaignId} characters={campaignCharacters} currency={visit.currency} busy={busy} run={run} /><GodOverridePurchase campaignId={visit.campaignId} shop={visit.shop} currency={visit.currency} characters={campaignCharacters} busy={busy} run={run} /><button type="button" className="st-button is-danger" disabled={busy} onClick={openEndDialog}>End Visit</button></> : null}</div>
    </header>
    {feedback ? <p className={`tabletop-feedback is-${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</p> : null}
    {visit.closedShopOverride ? <p className="tabletop-shop-visit-override"><strong>Closed-Shop override:</strong> {visit.closedShopOverrideReason}</p> : null}
    <div className="tabletop-shop-visit-summary">
      <div><span>Mode</span>{canOperate ? <select className="st-control" aria-label="Visit mode" disabled={busy} value={visit.mode} onChange={(event) => void run(() => expectAction(setShopVisitMode(visit.id, event.target.value as ShopVisitMode)), "Shop visit mode updated.")}><option value="roleplay">Roleplay</option><option value="shopping">Shopping</option></select> : <strong>{visit.mode === "roleplay" ? "Roleplay" : "Shopping"}</strong>}</div>
      <div><span>Visitors</span><strong>{visit.visitors.length}</strong></div>
      <div><span>Storefront</span><strong>{visit.shop.storefrontState}</strong></div>
    </div>
    <section className="tabletop-shop-visitors"><h5>Player Characters in this Shop</h5><div>{visit.visitors.map((visitor) => <article key={visitor.characterId}><div><strong>{visitor.name}</strong><span>{visitor.playerName}</span></div>{canOperate ? <button type="button" className="st-button is-danger" disabled={busy} onClick={() => void run(() => expectAction(removeShopVisitor(visit.id, visitor.characterId)), `${visitor.name} left the Shop visit.`)}>Remove Visitor</button> : null}</article>)}</div></section>
    <section className="tabletop-shop-public-staff"><h5>Public staff</h5>{visit.shop.staff.length ? <ul>{visit.shop.staff.map((member) => <li key={member.npcCharacterId}><strong>{member.name}</strong><span>{[member.roleLabel, member.responsibilityLabel, member.isPrimaryContact ? "Primary contact" : null].filter(Boolean).join(" · ")}</span></li>)}</ul> : <p>No staff are publicly revealed for this placement.</p>}</section>
    <section className="tabletop-shop-offerings">
      <header><div><h5>Offerings</h5><span>{offerings.length} shown</span></div><div><label className="st-field"><span>Search offerings</span><input className="st-control" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="st-field"><span>Category</span><select className="st-control" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div></header>
      {offerings.length ? <div>{offerings.map((offering) => <article key={offering.id}><header><div><span>{offering.category} · {offering.canonicalId}</span><h6>{offering.name}</h6></div><strong>{money(offering.sellingPriceCredits, visit.currency)}</strong></header>{offering.description ? <p>{offering.description}</p> : null}<footer><span>{offering.fulfillmentKind === "service-narrative" ? "Service / narrative" : "Inventory item"}</span><span>{offering.unlimitedStock ? "Unlimited" : `${offering.limitedQuantity ?? 0} available`}</span>{offering.buyingPriceCredits !== offering.sellingPriceCredits ? <span>Buys for {money(offering.buyingPriceCredits, visit.currency)}</span> : null}</footer></article>)}</div> : <p>No enabled offerings match these filters.</p>}
    </section>
    {canOperate ? <section className="tabletop-shop-commerce"><header><div><span>TRANSACTIONS</span><h5>Purchases, sales and approvals</h5></div><strong>{visit.commerce.reduce((total, entry) => total + entry.requests.filter(({ status }) => status === "pending" || status === "owner-review").length, 0)} open</strong></header>{visit.commerce.length ? <div>{visit.commerce.map((entry) => <GodCommerceCard key={entry.characterId} commerce={entry} currency={visit.currency} busy={busy} run={run} />)}</div> : <p>No active visitor commerce is available.</p>}</section> : null}
    {canOperate ? <dialog
      ref={endDialogRef}
      className="tabletop-shop-end-dialog"
      aria-labelledby={`shop-visit-${visit.id}-end-title`}
      onCancel={(event) => {
        if (busy) {
          event.preventDefault();
          return;
        }
        setEndReason("");
        setEndClientError(null);
        clearFeedback();
      }}
    >
      <section>
        <header><div><span>END SHOP VISIT</span><h4 id={`shop-visit-${visit.id}-end-title`}>End {visit.shop.name}?</h4><p>All remaining visitors will return to their normal Tabletop view. Visit history is retained.</p></div></header>
        <label className="st-field"><span>Reason</span><textarea autoFocus className="st-control" rows={4} maxLength={1000} value={endReason} onChange={(event) => { setEndReason(event.target.value); setEndClientError(null); }} /></label>
        <small>{endReason.length.toLocaleString("en-US")} / 1,000 characters</small>
        {endClientError ? <p className="tabletop-feedback is-error" role="alert">{endClientError}</p> : null}
        {!endClientError && feedback?.kind === "error" ? <p className="tabletop-feedback is-error" role="alert">{feedback.message}</p> : null}
        <footer><button type="button" className="st-button is-secondary" disabled={busy} onClick={closeEndDialog}>Cancel</button><button type="button" className="st-button is-danger" disabled={busy} onClick={() => void submitEndVisit()}>{busy ? "Ending…" : "End Visit"}</button></footer>
      </section>
    </dialog> : null}
  </section>;
}

export function GodShopVisitWorkspacePanel({ data }: { data: GodShopVisitWorkspace }) {
  const router = useRouter();
  const preserveScroll = useInPlaceScrollPreservation();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const [entryKey, setEntryKey] = useState<string | null>(null);
  const [selectedCharacters, setSelectedCharacters] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<ShopVisitMode>("shopping");
  const [overrideReason, setOverrideReason] = useState("");
  const selectedVisit = data.activeVisits.find(({ id }) => id === selectedVisitId) ?? null;
  const entry = data.eligiblePlacements.find((placement) => {
    const key = placement.placement.kind === "town" ? `town:${placement.placement.townId}:${placement.shopId}` : `independent:${placement.shopId}`;
    return key === entryKey;
  }) ?? null;

  async function run(work: () => Promise<void>, success: string): Promise<boolean> {
    setBusy(true);
    setFeedback(null);
    try {
      await preserveScroll(work);
      setFeedback({ kind: "success", message: success });
      router.refresh();
      return true;
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Shop visit action failed." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openEntry(placement: GodShopVisitWorkspace["eligiblePlacements"][number]): void {
    setEntryKey(placement.placement.kind === "town" ? `town:${placement.placement.townId}:${placement.shopId}` : `independent:${placement.shopId}`);
    setSelectedCharacters(new Set());
    setMode("shopping");
    setOverrideReason("");
    setFeedback(null);
  }

  if (selectedVisit) return <VisitDetail visit={selectedVisit} campaignCharacters={data.campaignCharacters} canOperate={data.canOperate} busy={busy} feedback={feedback} run={run} clearFeedback={() => setFeedback(null)} onReturn={() => { setFeedback(null); setSelectedVisitId(null); }} />;

  return <section className="tabletop-shop-visits" aria-labelledby="tabletop-shop-visits-title">
    <header><div><span>PARTICIPANT VISITS</span><h4 id="tabletop-shop-visits-title">Enter Shop</h4><p>Send selected Player Characters into a revealed Shop without changing Scene, Encounter, Initiative, or pending actions.</p></div><div>{data.canTransact ? <GodMoneyTools campaignId={data.campaignId} characters={data.campaignCharacters} currency={data.currency} busy={busy} run={run} /> : null}<strong>{data.activeVisits.length} active</strong></div></header>
    {feedback ? <p className={`tabletop-feedback is-${feedback.kind}`} role="status">{feedback.message}</p> : null}
    {data.activeVisits.length ? <div className="tabletop-shop-visit-list">{data.activeVisits.map((visit) => <article key={visit.id}><div><span>{visit.mode === "roleplay" ? "Roleplay" : "Shopping"}</span><strong>{visit.shop.name}</strong><small>{visit.visitors.map(({ name }) => name).join(", ")}</small></div><button type="button" className="st-button is-secondary" onClick={() => setSelectedVisitId(visit.id)}>View Visit</button></article>)}</div> : <p className="tabletop-empty">No Player Characters are currently visiting Shops.</p>}
    <div className="tabletop-shop-entry-list">{data.eligiblePlacements.map((placement) => <article key={placement.placement.kind === "town" ? `town:${placement.placement.townId}:${placement.shopId}` : `independent:${placement.shopId}`}><div><span>{placement.placementLabel}</span><strong>{placement.shopName}</strong><small>{placement.shopCategory} · {placement.storefrontState}</small></div><div>{data.canTransact ? <GodOverridePurchase campaignId={data.campaignId} shop={placement.shop} currency={data.currency} characters={data.campaignCharacters} busy={busy} run={run} /> : null}{data.canOperate ? <button type="button" className="st-button is-primary" disabled={busy} onClick={() => openEntry(placement)}>Enter Shop</button> : null}</div></article>)}</div>
    {!data.canOperate ? <p className="tabletop-readonly-notice">Admin view is read-only. Only the Campaign-owning G.O.D. can manage participant visits.</p> : null}
    {entry ? <div className="tabletop-shop-entry-dialog" role="dialog" aria-modal="true" aria-labelledby="shop-entry-dialog-title">
      <section><header><div><span>CONFIRM PARTICIPANTS</span><h4 id="shop-entry-dialog-title">Enter {entry.shopName}</h4><p>{entry.placementLabel} · {entry.storefrontState}</p></div><button type="button" className="st-button is-secondary" onClick={() => setEntryKey(null)}>Close</button></header>
        {feedback ? <p className={`tabletop-feedback is-${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</p> : null}
        <label className="st-field"><span>Visit mode</span><select className="st-control" value={mode} onChange={(event) => setMode(event.target.value as ShopVisitMode)}><option value="shopping">Shopping</option><option value="roleplay">Roleplay</option></select></label>
        <fieldset><legend>Player Characters</legend>{data.eligiblePlayers.map((character) => <label key={character.characterId}><input type="checkbox" checked={selectedCharacters.has(character.characterId)} onChange={() => setSelectedCharacters((current) => { const next = new Set(current); if (next.has(character.characterId)) next.delete(character.characterId); else next.add(character.characterId); return next; })} /><span><strong>{character.name}</strong>{character.playerName}</span></label>)}</fieldset>
        {!data.eligiblePlayers.length ? <p className="tabletop-empty">No active Player Characters are on both this Session roster and Scene membership.</p> : null}
        {entry.storefrontState === "closed" ? <label className="st-field"><span>Closed-Shop override reason</span><textarea className="st-control" rows={3} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Record why entry is permitted while the Shop remains closed." /></label> : null}
        <footer><button type="button" className="st-button is-secondary" onClick={() => setEntryKey(null)}>Cancel</button><button type="button" className="st-button is-primary" disabled={busy || !selectedCharacters.size || (entry.storefrontState === "closed" && !overrideReason.trim())} onClick={() => void run(async () => { const result = await expectAction(enterShopVisit({ sceneId: data.sceneId, shopId: entry.shopId, placement: entry.placement, characterIds: [...selectedCharacters], mode, closedShopOverrideReason: overrideReason })); setEntryKey(null); setSelectedVisitId(result.visitId); }, `${entry.shopName} visit opened for ${selectedCharacters.size} Player Character${selectedCharacters.size === 1 ? "" : "s"}.`)}>Confirm Entry</button></footer>
      </section>
    </div> : null}
  </section>;
}
