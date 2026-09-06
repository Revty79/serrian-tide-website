"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { formatCampaignMoney } from "@/features/characters/currency-rules";
import type {
  ShopVisitCurrencyView,
  GodShopVisitWorkspace,
  GodShopVisitView,
  ShopVisitMode,
} from "@/features/tabletop-operations/shop-visit-service";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

import {
  endShopVisit,
  enterShopVisit,
  removeShopVisitor,
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

function VisitDetail({
  visit,
  canOperate,
  busy,
  feedback,
  run,
  clearFeedback,
  onReturn,
}: {
  visit: GodShopVisitView;
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
      <div><button type="button" className="st-button is-secondary" onClick={onReturn}>Return to Scene</button>{canOperate ? <button type="button" className="st-button is-danger" disabled={busy} onClick={openEndDialog}>End Visit</button> : null}</div>
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

  if (selectedVisit) return <VisitDetail visit={selectedVisit} canOperate={data.canOperate} busy={busy} feedback={feedback} run={run} clearFeedback={() => setFeedback(null)} onReturn={() => { setFeedback(null); setSelectedVisitId(null); }} />;

  return <section className="tabletop-shop-visits" aria-labelledby="tabletop-shop-visits-title">
    <header><div><span>PARTICIPANT VISITS</span><h4 id="tabletop-shop-visits-title">Enter Shop</h4><p>Send selected Player Characters into a revealed Shop without changing Scene, Encounter, Initiative, or pending actions.</p></div><strong>{data.activeVisits.length} active</strong></header>
    {feedback ? <p className={`tabletop-feedback is-${feedback.kind}`} role="status">{feedback.message}</p> : null}
    {data.activeVisits.length ? <div className="tabletop-shop-visit-list">{data.activeVisits.map((visit) => <article key={visit.id}><div><span>{visit.mode === "roleplay" ? "Roleplay" : "Shopping"}</span><strong>{visit.shop.name}</strong><small>{visit.visitors.map(({ name }) => name).join(", ")}</small></div><button type="button" className="st-button is-secondary" onClick={() => setSelectedVisitId(visit.id)}>View Visit</button></article>)}</div> : <p className="tabletop-empty">No Player Characters are currently visiting Shops.</p>}
    <div className="tabletop-shop-entry-list">{data.eligiblePlacements.map((placement) => <article key={placement.placement.kind === "town" ? `town:${placement.placement.townId}:${placement.shopId}` : `independent:${placement.shopId}`}><div><span>{placement.placementLabel}</span><strong>{placement.shopName}</strong><small>{placement.shopCategory} · {placement.storefrontState}</small></div>{data.canOperate ? <button type="button" className="st-button is-primary" disabled={busy} onClick={() => openEntry(placement)}>Enter Shop</button> : null}</article>)}</div>
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
