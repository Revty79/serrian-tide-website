"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatCampaignMoney } from "@/features/characters/currency-rules";
import {
  filterShopCatalogItems,
  getEffectiveShopPrice,
  matchesShopSearch,
  moveOrderedId,
  type ShopArchiveStatus,
  type ShopCatalogFilter,
  type ShopChangedSaleConfirmationMode,
  type ShopCharacterPurchaseMode,
  type ShopFulfillmentKind,
  type ShopSoldItemHandling,
  type ShopStorefrontState,
} from "@/features/shops/shop-builder";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

import {
  addShopOffering,
  addShopStaff,
  archiveShop,
  createShop,
  getShop,
  listShops,
  removeShopOffering,
  removeShopStaff,
  reorderShopOfferings,
  restoreShop,
  saveShopCore,
  updateShopOffering,
  updateShopStaff,
  type ShopCampaignSummary,
  type ShopDetail,
  type ShopOfferingRecord,
  type ShopStaffRecord,
  type ShopSummary,
} from "./actions";

type Feedback = { kind: "success" | "error"; message: string } | null;

const EMPTY_CREATE = {
  name: "",
  category: "",
  description: "",
  locationNotes: "",
  balanceCredits: 0,
};

const CATALOG_FILTERS: Array<[ShopCatalogFilter, string]> = [
  ["all", "All"],
  ["weapon", "Weapons"],
  ["armor", "Armor"],
  ["general", "General"],
  ["inventory", "Inventory"],
];

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function optionalNumber(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

function numberValue(value: string): number {
  return value.trim() === "" ? 0 : Number(value);
}

export function ShopWorkspace({
  campaigns,
  isAdmin,
}: {
  campaigns: ShopCampaignSummary[];
  isAdmin: boolean;
}) {
  const searchParams = useSearchParams();
  const preserveScroll = useInPlaceScrollPreservation();
  const createDialogRef = useRef<HTMLDialogElement>(null);
  const archiveDialogRef = useRef<HTMLDialogElement>(null);
  const initialCampaign = searchParams.get("campaign") ?? "";
  const initialStatus: ShopArchiveStatus = searchParams.get("status") === "archived"
    ? "archived"
    : "active";
  const [campaignId, setCampaignId] = useState(initialCampaign);
  const [status, setStatus] = useState<ShopArchiveStatus>(initialStatus);
  const [shops, setShops] = useState<ShopSummary[]>([]);
  const [detail, setDetail] = useState<ShopDetail | null>(null);
  const [shopSearch, setShopSearch] = useState("");
  const [npcSearch, setNpcSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<ShopCatalogFilter>("all");
  const [selectedNpcId, setSelectedNpcId] = useState("");
  const [newStaffRole, setNewStaffRole] = useState("");
  const [createDraft, setCreateDraft] = useState(EMPTY_CREATE);
  const [archiveReason, setArchiveReason] = useState("");
  const [loading, setLoading] = useState(Boolean(initialCampaign));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const selectedCampaign = campaigns.find(({ id }) => String(id) === campaignId) ?? null;
  const readOnly = Boolean(detail?.shop.archivedAt || detail?.campaign.archived);
  const visibleShops = useMemo(() => shops.filter((entry) => matchesShopSearch(entry, shopSearch)), [shops, shopSearch]);
  const assignedNpcIds = useMemo(() => new Set(detail?.staff.map(({ npcCharacterId }) => npcCharacterId) ?? []), [detail]);
  const visibleNpcs = useMemo(() => (detail?.eligibleNpcs ?? []).filter((npc) => {
    if (assignedNpcIds.has(npc.id)) return false;
    const search = npcSearch.trim().toLocaleLowerCase("en-US");
    return !search || [npc.name, npc.roleLabel, npc.npcKind, npc.npcBuildMode]
      .some((value) => value.toLocaleLowerCase("en-US").includes(search));
  }), [assignedNpcIds, detail, npcSearch]);
  const visibleCatalog = useMemo(() => detail ? filterShopCatalogItems(
    detail.authorizedItems,
    detail.offerings.map(({ itemId }) => itemId),
    catalogFilter,
    catalogSearch,
  ) : [], [catalogFilter, catalogSearch, detail]);

  useEffect(() => {
    if (!initialCampaign) return;
    let active = true;
    listShops(Number(initialCampaign), initialStatus)
      .then((records) => { if (active) setShops(records); })
      .catch((error) => {
        if (active) setFeedback({ kind: "error", message: messageFrom(error, "Shops could not be loaded.") });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialCampaign, initialStatus]);

  function replaceUrl(nextCampaignId: string, nextStatus: ShopArchiveStatus): void {
    const params = new URLSearchParams();
    if (nextCampaignId) params.set("campaign", nextCampaignId);
    if (nextStatus === "archived") params.set("status", "archived");
    window.history.replaceState(null, "", `/heavens/shops${params.size ? `?${params}` : ""}`);
  }

  async function changeCampaign(nextCampaignId: string): Promise<void> {
    await preserveScroll(async () => {
      setCampaignId(nextCampaignId);
      setDetail(null);
      setFeedback(null);
      setShops([]);
      replaceUrl(nextCampaignId, status);
      if (!nextCampaignId) return;
      setLoading(true);
      try {
        setShops(await listShops(Number(nextCampaignId), status));
      } catch (error) {
        setFeedback({ kind: "error", message: messageFrom(error, "Shops could not be loaded.") });
      } finally {
        setLoading(false);
      }
    });
  }

  async function changeStatus(nextStatus: ShopArchiveStatus): Promise<void> {
    if (!campaignId || nextStatus === status) return;
    await preserveScroll(async () => {
      setStatus(nextStatus);
      setDetail(null);
      setFeedback(null);
      replaceUrl(campaignId, nextStatus);
      setLoading(true);
      try {
        setShops(await listShops(Number(campaignId), nextStatus));
      } catch (error) {
        setFeedback({ kind: "error", message: messageFrom(error, "Shops could not be loaded.") });
      } finally {
        setLoading(false);
      }
    });
  }

  async function openShop(shopId: number): Promise<void> {
    if (!campaignId) return;
    await preserveScroll(async () => {
      setBusy(true);
      setFeedback(null);
      try {
        setDetail(await getShop(shopId, Number(campaignId)));
        setNpcSearch("");
        setCatalogSearch("");
        setSelectedNpcId("");
        setNewStaffRole("");
      } catch (error) {
        setFeedback({ kind: "error", message: messageFrom(error, "The Shop could not be opened.") });
      } finally {
        setBusy(false);
      }
    });
  }

  async function acceptMutation(operation: () => Promise<ShopDetail>, success: string): Promise<void> {
    if (!campaignId) return;
    await preserveScroll(async () => {
      setBusy(true);
      setFeedback(null);
      try {
        const updated = await operation();
        setDetail(updated);
        setShops(await listShops(Number(campaignId), status));
        setFeedback({ kind: "success", message: success });
      } catch (error) {
        setFeedback({ kind: "error", message: messageFrom(error, "The Shop change could not be saved.") });
      } finally {
        setBusy(false);
      }
    });
  }

  async function submitCreate(): Promise<void> {
    if (!campaignId) return;
    setBusy(true);
    setFeedback(null);
    try {
      const created = await createShop({
        campaignId: Number(campaignId),
        ...createDraft,
      });
      createDialogRef.current?.close();
      setCreateDraft(EMPTY_CREATE);
      setStatus("active");
      replaceUrl(campaignId, "active");
      setShops(await listShops(Number(campaignId), "active"));
      setDetail(created);
      setFeedback({ kind: "success", message: `${created.shop.name} was created with its storefront closed.` });
    } catch (error) {
      setFeedback({ kind: "error", message: messageFrom(error, "The Shop could not be created.") });
    } finally {
      setBusy(false);
    }
  }

  async function saveCore(): Promise<void> {
    if (!detail) return;
    await acceptMutation(() => saveShopCore({
      shopId: detail.shop.id,
      campaignId: detail.shop.campaignId,
      name: detail.shop.name,
      category: detail.shop.category,
      description: detail.shop.description,
      locationNotes: detail.shop.locationNotes,
      balanceCredits: detail.shop.balanceCredits,
      storefrontState: detail.shop.storefrontState,
      characterPurchaseMode: detail.shop.characterPurchaseMode,
      soldItemHandling: detail.shop.soldItemHandling,
      changedSaleConfirmationMode: detail.shop.changedSaleConfirmationMode,
    }), `${detail.shop.name || "Shop"} was saved.`);
  }

  async function addStaff(): Promise<void> {
    if (!detail || !selectedNpcId) return;
    const npc = detail.eligibleNpcs.find(({ id }) => id === Number(selectedNpcId));
    await acceptMutation(() => addShopStaff({
      shopId: detail.shop.id,
      campaignId: detail.shop.campaignId,
      npcCharacterId: Number(selectedNpcId),
      responsibilityLabel: newStaffRole,
      isPrimaryContact: detail.staff.length === 0,
    }), `${npc?.name ?? "NPC"} was assigned to ${detail.shop.name}.`);
    setSelectedNpcId("");
    setNewStaffRole("");
  }

  async function saveStaff(staff: ShopStaffRecord): Promise<void> {
    if (!detail) return;
    await acceptMutation(() => updateShopStaff({
      assignmentId: staff.id,
      shopId: detail.shop.id,
      campaignId: detail.shop.campaignId,
      npcCharacterId: staff.npcCharacterId,
      responsibilityLabel: staff.responsibilityLabel,
      isPrimaryContact: staff.isPrimaryContact,
    }), `${staff.npcName}'s Shop assignment was saved.`);
  }

  async function addOffering(itemId: number): Promise<void> {
    if (!detail) return;
    const catalogItem = detail.authorizedItems.find(({ id }) => id === itemId);
    await acceptMutation(() => addShopOffering({
      shopId: detail.shop.id,
      campaignId: detail.shop.campaignId,
      itemId,
      fulfillmentKind: "inventory-transfer",
      enabled: true,
      unlimitedStock: true,
      limitedQuantity: null,
      sellingPriceOverrideCredits: null,
      buyingPriceOverrideCredits: null,
      shopNote: "",
    }), `${catalogItem?.name ?? "Item"} was added to ${detail.shop.name}.`);
  }

  async function saveOffering(offering: ShopOfferingRecord): Promise<void> {
    if (!detail) return;
    await acceptMutation(() => updateShopOffering({
      offeringId: offering.id,
      shopId: detail.shop.id,
      campaignId: detail.shop.campaignId,
      itemId: offering.itemId,
      fulfillmentKind: offering.fulfillmentKind,
      enabled: offering.enabled,
      unlimitedStock: offering.unlimitedStock,
      limitedQuantity: offering.limitedQuantity,
      sellingPriceOverrideCredits: offering.sellingPriceOverrideCredits,
      buyingPriceOverrideCredits: offering.buyingPriceOverrideCredits,
      shopNote: offering.shopNote,
    }), `${offering.itemName} was saved.`);
  }

  async function moveOffering(offeringId: number, direction: "up" | "down"): Promise<void> {
    if (!detail) return;
    const ids = moveOrderedId(detail.offerings.map(({ id }) => id), offeringId, direction);
    if (ids.every((id, index) => id === detail.offerings[index]?.id)) return;
    await acceptMutation(
      () => reorderShopOfferings(detail.shop.id, detail.shop.campaignId, ids),
      "Shop offering order was saved.",
    );
  }

  async function submitArchive(): Promise<void> {
    if (!detail || !campaignId) return;
    await preserveScroll(async () => {
      setBusy(true);
      setFeedback(null);
      try {
        const name = detail.shop.name;
        await archiveShop(detail.shop.id, detail.shop.campaignId, archiveReason);
        archiveDialogRef.current?.close();
        setArchiveReason("");
        setDetail(null);
        setShops(await listShops(Number(campaignId), status));
        setFeedback({ kind: "success", message: `${name} was archived and its storefront was closed.` });
      } catch (error) {
        setFeedback({ kind: "error", message: messageFrom(error, "The Shop could not be archived.") });
      } finally {
        setBusy(false);
      }
    });
  }

  async function submitRestore(): Promise<void> {
    if (!detail || !campaignId) return;
    await preserveScroll(async () => {
      setBusy(true);
      setFeedback(null);
      try {
        const name = detail.shop.name;
        await restoreShop(detail.shop.id, detail.shop.campaignId);
        setDetail(null);
        setShops(await listShops(Number(campaignId), status));
        setFeedback({ kind: "success", message: `${name} was restored with its storefront closed.` });
      } catch (error) {
        setFeedback({ kind: "error", message: messageFrom(error, "The Shop could not be restored.") });
      } finally {
        setBusy(false);
      }
    });
  }

  function formatMoney(credits: number): string {
    if (!detail) return `${credits} Credits`;
    return formatCampaignMoney(
      credits,
      detail.campaign.currencySystem,
      detail.campaign.derivedCurrencies,
    );
  }

  function updateCore<Key extends keyof ShopDetail["shop"]>(
    key: Key,
    value: ShopDetail["shop"][Key],
  ): void {
    if (readOnly) return;
    setDetail((current) => current ? { ...current, shop: { ...current.shop, [key]: value } } : current);
    setFeedback(null);
  }

  function updateStaffDraft(id: number, changes: Partial<ShopStaffRecord>): void {
    if (readOnly) return;
    setDetail((current) => current ? {
      ...current,
      staff: current.staff.map((entry) => entry.id === id ? { ...entry, ...changes } : changes.isPrimaryContact
        ? { ...entry, isPrimaryContact: false }
        : entry),
    } : current);
  }

  function updateOfferingDraft(id: number, changes: Partial<ShopOfferingRecord>): void {
    if (readOnly) return;
    setDetail((current) => current ? {
      ...current,
      offerings: current.offerings.map((entry) => entry.id === id ? { ...entry, ...changes } : entry),
    } : current);
  }

  return <main className="shops-page">
    <header className="shops-header">
      <Link href="/heavens" className="font-evanescent shops-logo">SERRIAN<br />TIDE</Link>
      <div>
        <p>THE HEAVENS / SHOPS</p>
        <h1 className="font-sans">Shop Builder</h1>
        <span>Create practical Campaign storefronts, staff them with persistent NPCs, and curate Campaign-authorized offerings.</span>
      </div>
      <nav><Link href="/heavens">← The Heavens</Link></nav>
    </header>

    <section className={`shops-scope ${isAdmin ? "is-admin" : "is-god"}`}>
      <strong>{isAdmin ? "Administrator scope" : "Campaign owner scope"}</strong>
      <span>{isAdmin ? "You may inspect and manage Shops across Campaign owners; ownership remains unchanged." : "Only Campaigns you own are available here."}</span>
    </section>

    {feedback ? <p className={`shops-feedback is-${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</p> : null}

    <section className="shops-context">
      <div><p>CAMPAIGN CONTEXT</p><h2 className="font-sans">Choose the Shop archive</h2></div>
      <label><span>Campaign</span><select value={campaignId} onChange={(event) => void changeCampaign(event.target.value)}>
        <option value="">No Campaign Selected</option>
        {campaigns.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.archived ? " [Archived]" : ""}{isAdmin && entry.ownerLabel ? ` — Owner: ${entry.ownerLabel}` : ""}</option>)}
      </select></label>
      <button type="button" disabled={!campaignId || busy || selectedCampaign?.archived} onClick={() => { setFeedback(null); createDialogRef.current?.showModal(); }}>Create Shop</button>
    </section>

    <div className="shops-layout">
      <aside className="shops-library" data-preserve-scroll="shop-library">
        <header>
          <div><p>SHOP LIBRARY</p><h2>{selectedCampaign?.name ?? "No Campaign"}</h2></div>
          <div className="shops-segmented" aria-label="Shop archive status">
            <button type="button" aria-pressed={status === "active"} disabled={!campaignId || loading} onClick={() => void changeStatus("active")}>Active</button>
            <button type="button" aria-pressed={status === "archived"} disabled={!campaignId || loading} onClick={() => void changeStatus("archived")}>Archived</button>
          </div>
        </header>
        <label className="shops-field"><span>Search Shops</span><input type="search" value={shopSearch} disabled={!campaignId} placeholder="Name, type, description, or location" onChange={(event) => void preserveScroll(() => setShopSearch(event.target.value))} /></label>
        {!campaignId ? <p className="shops-empty">Choose a Campaign to view its Shops.</p>
          : loading ? <p className="shops-empty">Reading Shops…</p>
            : visibleShops.length ? <div className="shops-index">{visibleShops.map((entry) => <button type="button" key={entry.id} className={detail?.shop.id === entry.id ? "is-selected" : ""} onClick={() => void openShop(entry.id)} disabled={busy}>
              <span><strong>{entry.name}</strong><small>{entry.category}</small></span>
              <span className="shops-index__meta"><em className={`is-${entry.storefrontState}`}>{entry.archivedAt ? "Archived" : entry.storefrontState}</em><small>{entry.staffCount} staff · {entry.offeringCount} offerings</small></span>
            </button>)}</div>
              : <p className="shops-empty">No {status} Shops match this view.</p>}
      </aside>

      <section className="shops-editor">
        {!detail ? <div className="shops-editor-empty"><p>SHOP WORKSPACE</p><h2 className="font-sans">Open a Shop</h2><span>Select an existing Shop or create one for this Campaign.</span></div> : <>
          <header className="shops-editor__header">
            <div><p>SHOP-{String(detail.shop.id).padStart(4, "0")} · {detail.campaign.name}</p><h2 className="font-sans">{detail.shop.name || "Unnamed Shop"}</h2><span>{detail.shop.category || "No type set"} · {detail.shop.archivedAt ? "Archived" : detail.shop.storefrontState === "open" ? "Storefront open" : "Storefront closed"}</span></div>
            <div className="shops-editor__actions">
              {detail.shop.archivedAt ? <button type="button" disabled={busy || detail.campaign.archived} onClick={() => void submitRestore()}>Restore Shop</button>
                : <button className="is-danger" type="button" disabled={busy} onClick={() => { setFeedback(null); archiveDialogRef.current?.showModal(); }}>Archive Shop</button>}
            </div>
          </header>
          {readOnly ? <p className="shops-readonly">{detail.campaign.archived ? "This Campaign is archived. Its Shop records are read-only." : "This Shop is archived and read-only. Restore it before making changes."}</p> : null}
          {detail.shop.archiveReason ? <p className="shops-archive-note">Archive note: {detail.shop.archiveReason}</p> : null}

          <section className="shops-panel">
            <header><div><p>SHOP RECORD</p><h3>Identity, location &amp; balance</h3></div><button type="button" disabled={busy || readOnly} onClick={() => void saveCore()}>Save Shop</button></header>
            <div className="shops-form-grid">
              <label className="shops-field"><span>Shop Name</span><input value={detail.shop.name} maxLength={120} disabled={readOnly} onChange={(event) => updateCore("name", event.target.value)} /></label>
              <label className="shops-field"><span>Type / Category</span><input value={detail.shop.category} maxLength={120} disabled={readOnly} placeholder="Armorer, apothecary, ferry…" onChange={(event) => updateCore("category", event.target.value)} /></label>
              <label className="shops-field is-wide"><span>Description</span><textarea rows={4} maxLength={5000} disabled={readOnly} value={detail.shop.description} onChange={(event) => updateCore("description", event.target.value)} /></label>
              <label className="shops-field is-wide"><span>Location Notes</span><textarea rows={3} maxLength={1000} disabled={readOnly} value={detail.shop.locationNotes} onChange={(event) => updateCore("locationNotes", event.target.value)} /></label>
              <label className="shops-field"><span>Balance · canonical Campaign Credits</span><input type="number" min={0} step="0.01" disabled={readOnly} value={detail.shop.balanceCredits} onChange={(event) => updateCore("balanceCredits", numberValue(event.target.value))} /><small>{formatMoney(detail.shop.balanceCredits)}</small></label>
              <label className="shops-field"><span>Storefront</span><select disabled={readOnly} value={detail.shop.storefrontState} onChange={(event) => updateCore("storefrontState", event.target.value as ShopStorefrontState)}><option value="closed">Closed</option><option value="open">Open</option></select><small>New and restored Shops default to closed.</small></label>
            </div>
          </section>

          <section className="shops-panel">
            <header><div><p>TRANSACTION POLICIES</p><h3>Approval and resale settings</h3></div><button type="button" disabled={busy || readOnly} onClick={() => void saveCore()}>Save Policies</button></header>
            <p className="shops-help">These policies are stored now. Purchase and sale transactions arrive in Prompt 2.</p>
            <div className="shops-form-grid">
              <label className="shops-field"><span>Character Purchases</span><select disabled={readOnly} value={detail.shop.characterPurchaseMode} onChange={(event) => updateCore("characterPurchaseMode", event.target.value as ShopCharacterPurchaseMode)}><option value="god-approval-required">G.O.D. approval required</option><option value="immediate">Immediate</option></select></label>
              <label className="shops-field"><span>Sold Item Handling</span><select disabled={readOnly} value={detail.shop.soldItemHandling} onChange={(event) => updateCore("soldItemHandling", event.target.value as ShopSoldItemHandling)}><option value="add-to-shop-stock">Add to Shop stock</option><option value="remove-from-active-play">Remove from active play</option></select></label>
              <label className="shops-field is-wide"><span>Changed Sale Terms</span><select disabled={readOnly} value={detail.shop.changedSaleConfirmationMode} onChange={(event) => updateCore("changedSaleConfirmationMode", event.target.value as ShopChangedSaleConfirmationMode)}><option value="character-owner-accepts">Character owner must accept</option><option value="god-approval-finalizes">G.O.D. approval finalizes</option></select></label>
            </div>
          </section>

          <section className="shops-panel">
            <header><div><p>PERSISTENT NPC STAFF</p><h3>Assignments &amp; primary contact</h3></div><span>{detail.staff.length} assigned</span></header>
            <div className="shops-add-row">
              <label className="shops-field"><span>Find eligible NPC</span><input type="search" disabled={readOnly} value={npcSearch} placeholder="Name, role, kind, or build" onChange={(event) => setNpcSearch(event.target.value)} /></label>
              <label className="shops-field"><span>NPC</span><select disabled={readOnly} value={selectedNpcId} onChange={(event) => setSelectedNpcId(event.target.value)}><option value="">Select an active persistent NPC</option>{visibleNpcs.map((npc) => <option key={npc.id} value={npc.id}>{npc.name} · {npc.npcKind} · {npc.npcBuildMode}</option>)}</select></label>
              <label className="shops-field"><span>Responsibility / Role</span><input disabled={readOnly} maxLength={160} value={newStaffRole} placeholder="Proprietor, smith, buyer…" onChange={(event) => setNewStaffRole(event.target.value)} /></label>
              <button type="button" disabled={busy || readOnly || !selectedNpcId} onClick={() => void addStaff()}>Assign NPC</button>
            </div>
            {detail.staff.length ? <div className="shops-staff-list">{detail.staff.map((staff) => <article key={staff.id} className={staff.npcArchived ? "is-unavailable" : ""}>
              <div className="shops-card-identity"><p>{staff.npcKind === "creature" ? "Creature NPC" : "Race NPC"} · {staff.npcBuildMode}</p><h4>{staff.npcName}</h4>{staff.npcArchived ? <span>Archived NPC · retained for history</span> : null}</div>
              <label className="shops-field"><span>Responsibility / Role</span><input maxLength={160} disabled={readOnly} value={staff.responsibilityLabel} onChange={(event) => updateStaffDraft(staff.id, { responsibilityLabel: event.target.value })} /></label>
              <label className="shops-check"><input type="checkbox" disabled={readOnly} checked={staff.isPrimaryContact} onChange={(event) => updateStaffDraft(staff.id, { isPrimaryContact: event.target.checked })} /><span>Primary contact</span></label>
              <div className="shops-row-actions"><button type="button" disabled={busy || readOnly} onClick={() => void saveStaff(staff)}>Save Assignment</button><button className="is-danger" type="button" disabled={busy || readOnly} onClick={() => void acceptMutation(() => removeShopStaff(detail.shop.id, detail.shop.campaignId, staff.id), `${staff.npcName} was removed from this Shop.`)}>Remove</button></div>
            </article>)}</div> : <p className="shops-empty">No NPC staff assigned. The first assignment becomes the primary contact.</p>}
          </section>

          <section className="shops-panel">
            <header><div><p>CAMPAIGN-AUTHORIZED CATALOG</p><h3>Add Equipment or Inventory offerings</h3></div><span>{visibleCatalog.length} available</span></header>
            <div className="shops-catalog-tools">
              <label className="shops-field"><span>Search permitted Items</span><input type="search" disabled={readOnly} value={catalogSearch} placeholder="Name, ID, category, description, or type" onChange={(event) => setCatalogSearch(event.target.value)} /></label>
              <nav aria-label="Offering catalog filters">{CATALOG_FILTERS.map(([value, label]) => <button type="button" key={value} aria-pressed={catalogFilter === value} disabled={readOnly} onClick={() => void preserveScroll(() => setCatalogFilter(value))}>{label}</button>)}</nav>
            </div>
            {visibleCatalog.length ? <div className="shops-catalog" data-preserve-scroll="shop-catalog">{visibleCatalog.map((catalogItem) => <article key={catalogItem.id}>
              <div><p>{catalogItem.canonicalId} · {catalogItem.recordType}</p><h4>{catalogItem.name}</h4><span>{catalogItem.category}{catalogItem.equipmentGroup ? ` · ${catalogItem.equipmentGroup}` : " · Inventory"}</span>{catalogItem.description ? <small>{catalogItem.description}</small> : null}</div>
              <div className="shops-price"><span>Canonical price</span><strong>{catalogItem.credits === null ? "Not priced" : formatMoney(catalogItem.credits)}</strong><small>{catalogItem.priceBasis}</small></div>
              <button type="button" disabled={busy || readOnly} onClick={() => void addOffering(catalogItem.id)}>Add Offering</button>
            </article>)}</div> : <p className="shops-empty">No unlisted Campaign-authorized Items match this catalog view.</p>}
          </section>

          <section className="shops-panel">
            <header><div><p>SHOP OFFERINGS</p><h3>Pricing, stock &amp; fulfillment</h3></div><span>{detail.offerings.length} listings</span></header>
            {detail.offerings.length ? <div className="shops-offerings">{detail.offerings.map((offering, index) => {
              const effectiveSellingPrice = getEffectiveShopPrice(offering.canonicalPriceCredits, offering.sellingPriceOverrideCredits);
              const effectiveBuyingPrice = getEffectiveShopPrice(offering.canonicalPriceCredits, offering.buyingPriceOverrideCredits);
              return <article key={offering.id} className={!offering.enabled || offering.itemArchived || !offering.campaignAuthorized ? "is-unavailable" : ""}>
                <header><div className="shops-card-identity"><p>{offering.canonicalId} · {offering.recordType}</p><h4>{offering.itemName}</h4><span>{offering.category}{offering.itemArchived ? " · Archived Item" : ""}{!offering.campaignAuthorized ? " · No longer Campaign-authorized" : ""}</span></div><div className="shops-order"><button type="button" aria-label={`Move ${offering.itemName} up`} disabled={busy || readOnly || index === 0} onClick={() => void moveOffering(offering.id, "up")}>↑</button><button type="button" aria-label={`Move ${offering.itemName} down`} disabled={busy || readOnly || index === detail.offerings.length - 1} onClick={() => void moveOffering(offering.id, "down")}>↓</button></div></header>
                <div className="shops-price-grid"><div><span>Canonical</span><strong>{offering.canonicalPriceCredits === null ? "Not priced" : formatMoney(offering.canonicalPriceCredits)}</strong><small>{offering.priceBasis}</small></div><div><span>Effective selling price</span><strong>{effectiveSellingPrice === null ? "Not priced" : formatMoney(effectiveSellingPrice)}</strong><small>{offering.sellingPriceOverrideCredits === null ? "Canonical fallback" : "Shop override"}</small></div><div><span>Effective buying price</span><strong>{effectiveBuyingPrice === null ? "Not priced" : formatMoney(effectiveBuyingPrice)}</strong><small>{offering.buyingPriceOverrideCredits === null ? "Canonical fallback" : "Shop override"}</small></div></div>
                <div className="shops-form-grid">
                  <label className="shops-field"><span>Fulfillment</span><select disabled={readOnly} value={offering.fulfillmentKind} onChange={(event) => updateOfferingDraft(offering.id, { fulfillmentKind: event.target.value as ShopFulfillmentKind })}><option value="inventory-transfer">Transfer Item into Character inventory</option><option value="service-narrative">Record service / narrative offering</option></select></label>
                  <label className="shops-field"><span>Stock Tracking</span><select disabled={readOnly} value={offering.unlimitedStock ? "unlimited" : "limited"} onChange={(event) => updateOfferingDraft(offering.id, event.target.value === "unlimited" ? { unlimitedStock: true, limitedQuantity: null } : { unlimitedStock: false, limitedQuantity: offering.limitedQuantity ?? 0 })}><option value="unlimited">Unlimited</option><option value="limited">Limited</option></select></label>
                  {!offering.unlimitedStock ? <label className="shops-field"><span>Limited Quantity</span><input type="number" min={0} step={1} disabled={readOnly} value={offering.limitedQuantity ?? 0} onChange={(event) => updateOfferingDraft(offering.id, { limitedQuantity: numberValue(event.target.value) })} /></label> : null}
                  <label className="shops-field"><span>Selling Override · Credits</span><input type="number" min={0} step="0.01" disabled={readOnly} value={offering.sellingPriceOverrideCredits ?? ""} placeholder="Use canonical price" onChange={(event) => updateOfferingDraft(offering.id, { sellingPriceOverrideCredits: optionalNumber(event.target.value) })} /></label>
                  <label className="shops-field"><span>Buying Override · Credits</span><input type="number" min={0} step="0.01" disabled={readOnly} value={offering.buyingPriceOverrideCredits ?? ""} placeholder="Use canonical price" onChange={(event) => updateOfferingDraft(offering.id, { buyingPriceOverrideCredits: optionalNumber(event.target.value) })} /></label>
                  <label className="shops-field is-wide"><span>Shop-Facing Note</span><textarea rows={2} maxLength={1000} disabled={readOnly} value={offering.shopNote} onChange={(event) => updateOfferingDraft(offering.id, { shopNote: event.target.value })} /></label>
                </div>
                <label className="shops-check"><input type="checkbox" disabled={readOnly || (offering.enabled === false && (offering.itemArchived || !offering.campaignAuthorized))} checked={offering.enabled} onChange={(event) => updateOfferingDraft(offering.id, { enabled: event.target.checked })} /><span>Listing enabled</span></label>
                <div className="shops-row-actions"><button type="button" disabled={busy || readOnly} onClick={() => void saveOffering(offering)}>Save Offering</button><button className="is-danger" type="button" disabled={busy || readOnly} onClick={() => void acceptMutation(() => removeShopOffering(detail.shop.id, detail.shop.campaignId, offering.id), `${offering.itemName} was removed from this Shop.`)}>Remove</button></div>
              </article>;
            })}</div> : <p className="shops-empty">No offerings yet. Add Items from the Campaign-authorized catalog above.</p>}
          </section>
        </>}
      </section>
    </div>

    <dialog ref={createDialogRef} className="shops-dialog" onCancel={() => setCreateDraft(EMPTY_CREATE)}>
      <section>
        <header><p>NEW CAMPAIGN SHOP</p><h2 className="font-sans">Create Shop</h2><span>The storefront begins closed and approval-safe.</span></header>
        {feedback?.kind === "error" ? <p className="shops-feedback is-error" role="alert">{feedback.message}</p> : null}
        <div className="shops-form-grid">
          <label className="shops-field"><span>Shop Name</span><input autoFocus maxLength={120} value={createDraft.name} onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="shops-field"><span>Type / Category</span><input maxLength={120} placeholder="Armorer, apothecary, ferry…" value={createDraft.category} onChange={(event) => setCreateDraft((current) => ({ ...current, category: event.target.value }))} /></label>
          <label className="shops-field is-wide"><span>Description</span><textarea rows={3} maxLength={5000} value={createDraft.description} onChange={(event) => setCreateDraft((current) => ({ ...current, description: event.target.value }))} /></label>
          <label className="shops-field is-wide"><span>Location Notes</span><textarea rows={2} maxLength={1000} value={createDraft.locationNotes} onChange={(event) => setCreateDraft((current) => ({ ...current, locationNotes: event.target.value }))} /></label>
          <label className="shops-field"><span>Opening Balance · Credits</span><input type="number" min={0} step="0.01" value={createDraft.balanceCredits} onChange={(event) => setCreateDraft((current) => ({ ...current, balanceCredits: numberValue(event.target.value) }))} /></label>
        </div>
        <footer><button type="button" disabled={busy} onClick={() => { createDialogRef.current?.close(); setCreateDraft(EMPTY_CREATE); }}>Cancel</button><button type="button" disabled={busy} onClick={() => void submitCreate()}>{busy ? "Creating…" : "Create Shop"}</button></footer>
      </section>
    </dialog>

    <dialog ref={archiveDialogRef} className="shops-dialog" onCancel={() => setArchiveReason("")}>
      <section>
        <header><p>ARCHIVE SHOP</p><h2 className="font-sans">{detail?.shop.name ?? "Shop"}</h2><span>The storefront will close. Staff and offering history remain attached.</span></header>
        {feedback?.kind === "error" ? <p className="shops-feedback is-error" role="alert">{feedback.message}</p> : null}
        <label className="shops-field"><span>Archive Reason (optional)</span><textarea rows={3} maxLength={1000} value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} /></label>
        <footer><button type="button" disabled={busy} onClick={() => { archiveDialogRef.current?.close(); setArchiveReason(""); }}>Cancel</button><button className="is-danger" type="button" disabled={busy} onClick={() => void submitArchive()}>{busy ? "Archiving…" : "Archive Shop"}</button></footer>
      </section>
    </dialog>
  </main>;
}
