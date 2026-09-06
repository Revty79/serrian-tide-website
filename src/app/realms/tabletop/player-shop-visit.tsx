"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { formatCampaignMoney } from "@/features/characters/currency-rules";
import type { ShopCommerceView } from "@/features/tabletop-operations/shop-commerce-service";
import type { ShopVisitCurrencyView, ShopVisitView } from "@/features/tabletop-operations/shop-visit-service";

import {
  acceptShopTerms,
  cancelShopRequest,
  leaveShopVisit,
  submitShopPurchase,
  submitShopSale,
  type PlayerShopCommerceActionResult,
} from "./shop-visit-actions";
import styles from "./player-tabletop.module.css";

function money(value: number | null, currency: ShopVisitCurrencyView): string {
  return value === null ? "Price not listed" : formatCampaignMoney(value, currency.currencySystem, currency.derivedCurrencies);
}

function actionValue<T>(result: PlayerShopCommerceActionResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function stableKey(ref: React.MutableRefObject<string | null>): string {
  ref.current ??= globalThis.crypto.randomUUID();
  return ref.current;
}

export function PlayerShopVisit({ characterId, visit, commerce }: {
  characterId: number;
  visit: ShopVisitView;
  commerce: ShopCommerceView;
}) {
  const router = useRouter();
  const purchaseDialog = useRef<HTMLDialogElement>(null);
  const saleDialog = useRef<HTMLDialogElement>(null);
  const purchaseKey = useRef<string | null>(null);
  const saleKey = useRef<string | null>(null);
  const requestKeys = useRef(new Map<string, string>());
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [purchaseQuantities, setPurchaseQuantities] = useState<Record<number, number>>({});
  const [saleQuantities, setSaleQuantities] = useState<Record<number, number>>({});
  const [saleInstances, setSaleInstances] = useState<Set<number>>(new Set());
  const [purchaseNote, setPurchaseNote] = useState("");
  const [saleNote, setSaleNote] = useState("");
  const categories = useMemo(() => [...new Set(visit.shop.offerings.map((entry) => entry.category))], [visit.shop.offerings]);
  const needle = search.trim().toLocaleLowerCase();
  const offerings = visit.shop.offerings.filter((entry) => (
    (category === "all" || entry.category === category)
    && (!needle || [entry.name, entry.category, entry.family, entry.description, entry.canonicalId]
      .some((value) => value.toLocaleLowerCase().includes(needle)))
  ));
  const openRequests = commerce.requests.filter(({ status }) => status === "pending" || status === "owner-review");
  const selectedPurchaseLines = visit.shop.offerings.flatMap((offering) => {
    const quantity = purchaseQuantities[offering.id] ?? 0;
    return quantity > 0 && offering.sellingPriceCredits !== null ? [{
      offeringId: offering.id,
      quantity,
      expectedOfferingVersion: offering.version,
      quotedUnitPriceCredits: offering.sellingPriceCredits,
      quotedFulfillmentKind: offering.fulfillmentKind,
    }] : [];
  });
  const selectedPurchaseTotal = selectedPurchaseLines.reduce(
    (total, line) => total + line.quantity * line.quotedUnitPriceCredits,
    0,
  );

  async function run(work: () => Promise<string>): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await work());
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Shop action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function requestKey(action: string, requestId: number, termsVersion?: number): string {
    const identity = `${action}:${requestId}:${termsVersion ?? "none"}`;
    const existing = requestKeys.current.get(identity);
    if (existing) return existing;
    const created = globalThis.crypto.randomUUID();
    requestKeys.current.set(identity, created);
    return created;
  }

  async function purchase(): Promise<void> {
    const lines = selectedPurchaseLines;
    if (!lines.length) return setError("Choose at least one offering and quantity.");
    let requiresReconfirmation = false;
    const succeeded = await run(async () => {
      const result = actionValue(await submitShopPurchase({ visitId: visit.id, characterId, lines, narrativeNote: purchaseNote, submissionKey: stableKey(purchaseKey) }));
      requiresReconfirmation = result.status === "owner-review";
      return result.status === "completed"
        ? `Purchase completed. Receipt #${result.transactionId}.`
        : result.status === "owner-review"
          ? `Shop terms changed. Request #${result.requestId} needs your confirmation of the refreshed terms before any charge.`
          : `Purchase request #${result.requestId} is awaiting G.O.D. approval.`;
    });
    if (succeeded && requiresReconfirmation) {
      setError("The price or fulfillment changed after checkout was displayed. Your selections are preserved; review the refreshed request before accepting it.");
    } else if (succeeded) {
      purchaseKey.current = null;
      setPurchaseQuantities({});
      setPurchaseNote("");
      purchaseDialog.current?.close();
    }
  }

  async function sell(): Promise<void> {
    const lines = [
      ...commerce.ownedStacks.flatMap((entry) => (saleQuantities[entry.itemId] ?? 0) > 0 ? [{ itemId: entry.itemId, quantity: saleQuantities[entry.itemId]! }] : []),
      ...commerce.ownedInstances.flatMap((entry) => saleInstances.has(entry.id) ? [{ itemId: entry.itemId, itemInstanceId: entry.id, quantity: 1 }] : []),
    ];
    if (!lines.length) return setError("Choose at least one owned Item to offer for sale.");
    const succeeded = await run(async () => {
      const result = actionValue(await submitShopSale({ visitId: visit.id, characterId, lines, narrativeNote: saleNote, submissionKey: stableKey(saleKey) }));
      return `Sale request #${result.requestId} is awaiting G.O.D. review.`;
    });
    if (succeeded) {
      saleKey.current = null;
      setSaleQuantities({});
      setSaleInstances(new Set());
      setSaleNote("");
      saleDialog.current?.close();
    }
  }

  return <section className={styles.shopVisit} aria-labelledby="player-shop-visit-title">
    <header className={styles.shopVisitHero}>
      <div><p className={styles.eyebrow}>CURRENT SHOP VISIT · {visit.mode === "roleplay" ? "ROLEPLAY" : "SHOPPING"}</p><h2 id="player-shop-visit-title">{visit.shop.name}</h2><p>{visit.shop.category} · {visit.shop.storefrontState}{visit.placement.kind === "town" ? " · Town placement" : " · Independent placement"}</p></div>
      <button type="button" className="st-button is-secondary" disabled={busy} onClick={() => void run(async () => { await leaveShopVisit(characterId); return "You left the Shop."; })}>{busy ? "Working…" : "Leave Shop"}</button>
    </header>
    {error ? <p className={styles.shopVisitError} role="alert">{error}</p> : null}
    {notice ? <p className={styles.boundaryNotice} role="status">{notice}</p> : null}
    {visit.shop.description ? <p className={styles.shopVisitDescription}>{visit.shop.description}</p> : null}
    <div className={styles.shopVisitBalance}>
      <div><span>Your purse</span><strong>{money(commerce.characterBalanceCredits, visit.currency)}</strong></div>
      <div><span>Purchase policy</span><strong>{commerce.characterPurchaseMode === "immediate" ? "Immediate checkout" : "G.O.D. approval required"}</strong></div>
      <div><button type="button" className="st-button is-primary" disabled={busy || visit.shop.storefrontState !== "open"} onClick={() => { setError(null); purchaseDialog.current?.showModal(); }}>Buy</button><button type="button" className="st-button is-secondary" disabled={busy || visit.shop.storefrontState !== "open"} onClick={() => { setError(null); saleDialog.current?.showModal(); }}>Sell</button></div>
    </div>
    <div className={styles.shopVisitRoster}>
      <section><h3>Visiting party</h3><ul>{visit.visitors.map((visitor) => <li key={visitor.characterId}><strong>{visitor.name}</strong><span>{visitor.characterId === characterId ? "You" : visitor.playerName}</span></li>)}</ul></section>
      <section><h3>Staff</h3>{visit.shop.staff.length ? <ul>{visit.shop.staff.map((member) => <li key={member.npcCharacterId}><strong>{member.name}</strong><span>{[member.roleLabel, member.responsibilityLabel, member.isPrimaryContact ? "Primary contact" : null].filter(Boolean).join(" · ")}</span></li>)}</ul> : <p>No staff are publicly revealed for this placement.</p>}</section>
    </div>
    <section className={styles.shopVisitCatalog}>
      <header><div><p className={styles.eyebrow}>PUBLIC CATALOG</p><h3>Offerings</h3></div><div className={styles.shopVisitFilters}><label className="st-field"><span>Search</span><input className="st-control" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, family, or category" /></label><label className="st-field"><span>Category</span><select className="st-control" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div></header>
      {offerings.length ? <div className={styles.shopVisitOfferings}>{offerings.map((offering) => <article key={offering.id}><header><div><span>{offering.category} · {offering.canonicalId}</span><h4>{offering.name}</h4></div><strong>{money(offering.sellingPriceCredits, visit.currency)}</strong></header>{offering.description ? <p>{offering.description}</p> : null}<footer><span>{offering.fulfillmentKind === "service-narrative" ? "Service / narrative" : "Inventory item"}</span><span>{offering.unlimitedStock ? "Unlimited" : `${offering.limitedQuantity ?? 0} available`}</span>{offering.buyingPriceCredits !== offering.sellingPriceCredits ? <span>Shop buys for {money(offering.buyingPriceCredits, visit.currency)}</span> : null}</footer></article>)}</div> : <p className={styles.emptyCopy}>No enabled offerings match these filters.</p>}
    </section>
    <section className={styles.shopCommerceRequests}>
      <header><div><p className={styles.eyebrow}>APPROVALS</p><h3>Open requests</h3></div><strong>{openRequests.length}</strong></header>
      {openRequests.length ? <div>{openRequests.map((request) => <article key={request.id}><header><div><span>#{request.id} · {request.kind}</span><h4>{request.status === "owner-review" ? "Your acceptance is required" : "Awaiting G.O.D. review"}</h4></div><strong>{money(request.totalCredits, visit.currency)}</strong></header><ul>{request.lines.map((line) => <li key={line.id}>{line.quantity} × {line.name} · {money(line.currentUnitPriceCredits, visit.currency)} each{line.currentUnitPriceCredits !== line.quotedUnitPriceCredits ? " · revised" : ""}</li>)}</ul>{request.narrativeNote ? <p>{request.narrativeNote}</p> : null}<footer>{request.status === "owner-review" ? <button className="st-button is-primary" disabled={busy} type="button" onClick={() => void run(async () => { const result = actionValue(await acceptShopTerms({ requestId: request.id, expectedTermsVersion: request.termsVersion, submissionKey: requestKey("accept", request.id, request.termsVersion) })); requestKeys.current.delete(`accept:${request.id}:${request.termsVersion}`); return result.status === "completed" ? `Transaction receipt #${result.transactionId} completed.` : result.status === "owner-review" ? "Shop terms changed again. Review the refreshed terms before accepting." : "Current terms are accepted and await G.O.D. review."; })}>Accept Current Terms</button> : null}<button className="st-button is-secondary" disabled={busy} type="button" onClick={() => void run(async () => { actionValue(await cancelShopRequest({ requestId: request.id, submissionKey: requestKey("cancel", request.id) })); requestKeys.current.delete(`cancel:${request.id}:none`); return `Request #${request.id} cancelled.`; })}>Cancel</button></footer></article>)}</div> : <p className={styles.emptyCopy}>No Shop requests are waiting.</p>}
    </section>
    <section className={styles.shopCommerceHistory}><header><div><p className={styles.eyebrow}>RECEIPTS</p><h3>Recent Shop history</h3></div></header>{commerce.history.length ? <ol>{commerce.history.map((entry) => <li key={entry.id}><div><strong>Receipt #{entry.id} · {entry.kind}</strong><span>{new Date(entry.completedAt).toLocaleString()}</span></div><strong>{money(entry.totalCredits, visit.currency)}</strong><small>{entry.lines.map((line) => `${line.quantity} × ${line.name}`).join(", ")}{entry.narrativeNote ? ` · ${entry.narrativeNote}` : ""}</small></li>)}</ol> : <p className={styles.emptyCopy}>No completed transactions with this Shop yet.</p>}</section>
    <dialog ref={purchaseDialog} className={styles.shopCommerceDialog} onCancel={() => setError(null)}><section><header><div><p className={styles.eyebrow}>CHECKOUT</p><h3>Buy from {visit.shop.name}</h3><p>Prices and stock are checked again at execution.</p></div></header><div className={styles.shopCommercePicker}>{visit.shop.offerings.map((offering) => <label className="st-field" key={offering.id}><span>{offering.name} · {money(offering.sellingPriceCredits, visit.currency)}</span><input className="st-control" type="number" min={0} max={offering.unlimitedStock ? 999 : offering.limitedQuantity ?? 0} step={1} disabled={offering.sellingPriceCredits === null} value={purchaseQuantities[offering.id] ?? 0} onChange={(event) => setPurchaseQuantities((current) => ({ ...current, [offering.id]: Number(event.target.value) }))} /></label>)}</div><p><strong>Selected total: {money(selectedPurchaseTotal, visit.currency)}</strong></p><label className="st-field"><span>Narrative note (optional)</span><textarea className="st-control" rows={3} maxLength={1000} value={purchaseNote} onChange={(event) => setPurchaseNote(event.target.value)} /></label>{error ? <p className={styles.shopVisitError} role="alert">{error}</p> : null}<footer><button type="button" className="st-button is-secondary" disabled={busy} onClick={() => purchaseDialog.current?.close()}>Cancel</button><button type="button" className="st-button is-primary" disabled={busy || !selectedPurchaseLines.length} onClick={() => void purchase()}>{commerce.characterPurchaseMode === "immediate" ? "Complete Purchase" : "Submit Request"}</button></footer></section></dialog>
    <dialog ref={saleDialog} className={styles.shopCommerceDialog} onCancel={() => setError(null)}><section><header><div><p className={styles.eyebrow}>CHARACTER SALE</p><h3>Offer owned Items</h3><p>The G.O.D. reviews final terms. Pending requests reserve nothing.</p></div></header><div className={styles.shopCommercePicker}>{commerce.ownedStacks.map((entry) => <label className="st-field" key={`stack:${entry.itemId}`}><span>{entry.name} · {entry.quantity} owned · {money(entry.shopBuyingPriceCredits, visit.currency)} each</span><input className="st-control" type="number" min={0} max={entry.quantity} step={1} value={saleQuantities[entry.itemId] ?? 0} onChange={(event) => setSaleQuantities((current) => ({ ...current, [entry.itemId]: Number(event.target.value) }))} /></label>)}{commerce.ownedInstances.map((entry) => <label key={`instance:${entry.id}`}><input type="checkbox" disabled={entry.equipmentState !== "inactive"} checked={saleInstances.has(entry.id)} onChange={() => setSaleInstances((current) => { const next = new Set(current); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next; })} /><span><strong>{entry.name} copy #{entry.id}</strong> · {entry.currentCharges} charges · {entry.equipmentState}{entry.equipmentState !== "inactive" ? " · set Inactive before selling" : ` · ${money(entry.shopBuyingPriceCredits, visit.currency)}`}</span></label>)}</div><label className="st-field"><span>Narrative note (optional)</span><textarea className="st-control" rows={3} maxLength={1000} value={saleNote} onChange={(event) => setSaleNote(event.target.value)} /></label>{error ? <p className={styles.shopVisitError} role="alert">{error}</p> : null}<footer><button type="button" className="st-button is-secondary" disabled={busy} onClick={() => saleDialog.current?.close()}>Cancel</button><button type="button" className="st-button is-primary" disabled={busy} onClick={() => void sell()}>Submit Sale Request</button></footer></section></dialog>
    <p className={styles.boundaryNotice}>Roleplay and Shopping are narrative modes. Purchase permissions come from Shop policy; pending requests reserve neither money nor stock.</p>
  </section>;
}
