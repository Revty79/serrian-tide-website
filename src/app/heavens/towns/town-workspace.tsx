"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  compareTownNames,
  matchesTownAssociationSearch,
  matchesTownPlaceSearch,
  matchesTownSearch,
  type TownArchiveStatus,
  type TownCoreValues,
  type TownNpcAssociationValues,
  type TownPlaceValues,
} from "@/features/towns/town-builder";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

import {
  addTownNpc,
  archiveTown,
  archiveTownPlace,
  attachTownShop,
  createTown,
  createTownPlace,
  deleteTown,
  deleteTownPlace,
  detachTownShop,
  getTown,
  listTowns,
  previewTownLifecycle,
  reassignTownShop,
  removeTownNpc,
  reorderTownNpcs,
  reorderTownPlaces,
  reorderTownShops,
  restoreTown,
  restoreTownPlace,
  saveTown,
  updateTownNpc,
  updateTownPlace,
  type TownCampaignSummary,
  type TownDetail,
  type TownLifecyclePreview,
  type TownNpcRecord,
  type TownPlaceRecord,
  type TownSummary,
} from "./actions";

type Feedback = { kind: "success" | "error"; message: string } | null;
type PlaceDraft = Pick<TownPlaceValues, "name" | "category" | "description" | "locationNotes" | "godNotes">;
type NpcDraft = Pick<TownNpcAssociationValues, "relationshipLabel" | "townNote">;

const EMPTY_CORE: TownCoreValues = {
  campaignId: 0,
  name: "",
  category: "",
  overview: "",
  locationNotes: "",
  godNotes: "",
};

const EMPTY_PLACE: PlaceDraft = {
  name: "",
  category: "",
  description: "",
  locationNotes: "",
  godNotes: "",
};

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function coreFrom(detail: TownDetail): TownCoreValues {
  return {
    campaignId: detail.town.campaignId,
    name: detail.town.name,
    category: detail.town.category,
    overview: detail.town.overview,
    locationNotes: detail.town.locationNotes,
    godNotes: detail.town.godNotes,
  };
}

function placeFrom(place: TownPlaceRecord): PlaceDraft {
  return {
    name: place.name,
    category: place.category,
    description: place.description,
    locationNotes: place.locationNotes,
    godNotes: place.godNotes,
  };
}

function npcFrom(npc: TownNpcRecord): NpcDraft {
  return { relationshipLabel: npc.relationshipLabel, townNote: npc.townNote };
}

function moveId(ids: number[], id: number, direction: -1 | 1): number[] {
  const index = ids.indexOf(id);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[destination]] = [next[destination]!, next[index]!];
  return next;
}

export function TownWorkspace({
  campaigns,
  isAdmin,
}: {
  campaigns: TownCampaignSummary[];
  isAdmin: boolean;
}) {
  const searchParams = useSearchParams();
  const preserveScroll = useInPlaceScrollPreservation();
  const initialCampaign = searchParams.get("campaign") ?? "";
  const initialTown = Number(searchParams.get("town"));
  const initialStatus: TownArchiveStatus = searchParams.get("status") === "archived" ? "archived" : "active";
  const activeCampaignRef = useRef(initialCampaign);
  const requestIdRef = useRef(0);

  const [campaignId, setCampaignId] = useState(initialCampaign);
  const [status, setStatus] = useState<TownArchiveStatus>(initialStatus);
  const [towns, setTowns] = useState<TownSummary[]>([]);
  const [detail, setDetail] = useState<TownDetail | null>(null);
  const [coreDraft, setCoreDraft] = useState<TownCoreValues>(EMPTY_CORE);
  const [placeDrafts, setPlaceDrafts] = useState<Record<number, PlaceDraft>>({});
  const [npcDrafts, setNpcDrafts] = useState<Record<number, NpcDraft>>({});
  const [townSearch, setTownSearch] = useState("");
  const [shopSearch, setShopSearch] = useState("");
  const [npcSearch, setNpcSearch] = useState("");
  const [placeSearch, setPlaceSearch] = useState("");
  const [placeStatus, setPlaceStatus] = useState<TownArchiveStatus>("active");
  const [selectedShopId, setSelectedShopId] = useState("");
  const [selectedNpcId, setSelectedNpcId] = useState("");
  const [newNpcRelationship, setNewNpcRelationship] = useState("");
  const [newNpcNote, setNewNpcNote] = useState("");
  const [createDraft, setCreateDraft] = useState({ name: "", category: "", overview: "" });
  const [newPlace, setNewPlace] = useState<PlaceDraft>(EMPTY_PLACE);
  const [showCreate, setShowCreate] = useState(false);
  const [showNewPlace, setShowNewPlace] = useState(false);
  const [lifecycle, setLifecycle] = useState<TownLifecyclePreview | null>(null);
  const [loading, setLoading] = useState(Boolean(initialCampaign));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const selectedCampaign = campaigns.find(({ id }) => String(id) === campaignId) ?? null;
  const readOnly = Boolean(detail?.town.archivedAt || detail?.campaign.archived);
  const visibleTowns = useMemo(
    () => towns.filter((entry) => matchesTownSearch(entry, townSearch)).sort(compareTownNames),
    [townSearch, towns],
  );
  const visibleAvailableShops = useMemo(() => (detail?.availableShops ?? []).filter((entry) => (
    entry.assignedTownId !== detail?.town.id
    && matchesTownAssociationSearch({ name: entry.name, category: entry.category }, shopSearch)
  )).sort(compareTownNames), [detail, shopSearch]);
  const visibleLinkedShops = useMemo(() => (detail?.shops ?? []).filter((entry) => (
    matchesTownAssociationSearch({ name: entry.name, category: entry.category }, shopSearch)
  )), [detail, shopSearch]);
  const directlyLinkedNpcIds = useMemo(() => new Set(detail?.npcs.flatMap((entry) => (
    entry.associationId === null ? [] : [entry.npcCharacterId]
  )) ?? []), [detail]);
  const visibleAvailableNpcs = useMemo(() => (detail?.availableNpcs ?? []).filter((entry) => (
    !directlyLinkedNpcIds.has(entry.id) && matchesTownAssociationSearch({
      name: entry.name,
      roleLabel: entry.roleLabel,
      kind: entry.npcKind,
      buildMode: entry.npcBuildMode,
    }, npcSearch)
  )).sort(compareTownNames), [detail, directlyLinkedNpcIds, npcSearch]);
  const visibleLinkedNpcs = useMemo(() => (detail?.npcs ?? []).filter((entry) => matchesTownAssociationSearch({
    name: entry.name,
    roleLabel: entry.roleLabel,
    kind: entry.npcKind,
    buildMode: entry.npcBuildMode,
    relationshipLabel: entry.associationId === null
      ? entry.shopAssociations.map(({ shopName, responsibilityLabel }) => `${shopName} ${responsibilityLabel}`).join(" ")
      : npcDrafts[entry.associationId]?.relationshipLabel ?? entry.relationshipLabel,
    note: entry.associationId === null ? "Shop staff" : npcDrafts[entry.associationId]?.townNote ?? entry.townNote,
  }, npcSearch)), [detail, npcDrafts, npcSearch]);
  const visiblePlaces = useMemo(() => (detail?.places ?? []).filter((entry) => (
    (placeStatus === "archived") === Boolean(entry.archivedAt)
    && matchesTownPlaceSearch(placeDrafts[entry.id] ?? entry, placeSearch)
  )), [detail, placeDrafts, placeSearch, placeStatus]);

  function replaceUrl(nextCampaign: string, nextStatus: TownArchiveStatus, townId?: number): void {
    const params = new URLSearchParams();
    if (nextCampaign) params.set("campaign", nextCampaign);
    if (nextStatus === "archived") params.set("status", "archived");
    if (townId) params.set("town", String(townId));
    window.history.replaceState(null, "", `/heavens/towns${params.size ? `?${params}` : ""}`);
  }

  function initializeDetail(next: TownDetail): void {
    setDetail(next);
    setCoreDraft(coreFrom(next));
    setPlaceDrafts(Object.fromEntries(next.places.map((entry) => [entry.id, placeFrom(entry)])));
    setNpcDrafts(Object.fromEntries(next.npcs.flatMap((entry) => (
      entry.associationId === null ? [] : [[entry.associationId, npcFrom(entry)]]
    ))));
    setSelectedShopId("");
    setSelectedNpcId("");
    setLifecycle(null);
  }

  function mergeDetail(next: TownDetail): void {
    setDetail(next);
    setPlaceDrafts((current) => {
      const merged = { ...current };
      for (const entry of next.places) if (!merged[entry.id]) merged[entry.id] = placeFrom(entry);
      return merged;
    });
    setNpcDrafts((current) => {
      const merged = { ...current };
      for (const entry of next.npcs) {
        if (entry.associationId !== null && !merged[entry.associationId]) {
          merged[entry.associationId] = npcFrom(entry);
        }
      }
      return merged;
    });
  }

  async function refreshIndex(expectedCampaign: string, expectedStatus = status): Promise<void> {
    const records = await listTowns(Number(expectedCampaign), expectedStatus);
    if (activeCampaignRef.current === expectedCampaign) setTowns(records);
  }

  useEffect(() => {
    if (!initialCampaign) return;
    const expectedCampaign = initialCampaign;
    const requestId = ++requestIdRef.current;
    Promise.all([
      listTowns(Number(expectedCampaign), initialStatus),
      Number.isSafeInteger(initialTown) && initialTown > 0 ? getTown(initialTown, Number(expectedCampaign)) : Promise.resolve(null),
    ]).then(([records, selected]) => {
      if (activeCampaignRef.current !== expectedCampaign || requestIdRef.current !== requestId) return;
      setTowns(records);
      if (selected) initializeDetail(selected);
    }).catch((error) => {
      if (activeCampaignRef.current === expectedCampaign) setFeedback({ kind: "error", message: messageFrom(error, "Towns could not be loaded.") });
    }).finally(() => {
      if (activeCampaignRef.current === expectedCampaign) setLoading(false);
    });
  // Initial URL state is intentionally read once; subsequent state is managed in place.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changeCampaign(nextCampaign: string): Promise<void> {
    activeCampaignRef.current = nextCampaign;
    ++requestIdRef.current;
    await preserveScroll(async () => {
      setCampaignId(nextCampaign);
      setTowns([]);
      setDetail(null);
      setCoreDraft(EMPTY_CORE);
      setPlaceDrafts({});
      setNpcDrafts({});
      setTownSearch("");
      setShopSearch("");
      setNpcSearch("");
      setPlaceSearch("");
      setFeedback(null);
      replaceUrl(nextCampaign, status);
      if (!nextCampaign) return;
      setLoading(true);
      const requestId = ++requestIdRef.current;
      try {
        const records = await listTowns(Number(nextCampaign), status);
        if (activeCampaignRef.current === nextCampaign && requestIdRef.current === requestId) setTowns(records);
      } catch (error) {
        if (activeCampaignRef.current === nextCampaign) setFeedback({ kind: "error", message: messageFrom(error, "Towns could not be loaded.") });
      } finally {
        if (activeCampaignRef.current === nextCampaign) setLoading(false);
      }
    });
  }

  async function changeStatus(nextStatus: TownArchiveStatus): Promise<void> {
    if (!campaignId) return;
    await preserveScroll(async () => {
      setStatus(nextStatus);
      setDetail(null);
      setCoreDraft(EMPTY_CORE);
      setFeedback(null);
      replaceUrl(campaignId, nextStatus);
      setLoading(true);
      try {
        await refreshIndex(campaignId, nextStatus);
      } catch (error) {
        setFeedback({ kind: "error", message: messageFrom(error, "Towns could not be loaded.") });
      } finally {
        setLoading(false);
      }
    });
  }

  async function openTown(townId: number): Promise<void> {
    const expectedCampaign = campaignId;
    const requestId = ++requestIdRef.current;
    await preserveScroll(async () => {
      setBusy(true);
      setFeedback(null);
      try {
        const next = await getTown(townId, Number(expectedCampaign));
        if (activeCampaignRef.current !== expectedCampaign || requestIdRef.current !== requestId) return;
        initializeDetail(next);
        replaceUrl(expectedCampaign, status, townId);
      } catch (error) {
        if (activeCampaignRef.current === expectedCampaign) setFeedback({ kind: "error", message: messageFrom(error, "Town could not be opened.") });
      } finally {
        if (activeCampaignRef.current === expectedCampaign) setBusy(false);
      }
    });
  }

  async function mutate(operation: () => Promise<TownDetail>, success: string): Promise<TownDetail | null> {
    const expectedCampaign = campaignId;
    return preserveScroll(async () => {
      setBusy(true);
      setFeedback(null);
      try {
        const next = await operation();
        if (activeCampaignRef.current !== expectedCampaign) return null;
        mergeDetail(next);
        await refreshIndex(expectedCampaign);
        setFeedback({ kind: "success", message: success });
        return next;
      } catch (error) {
        if (activeCampaignRef.current === expectedCampaign) setFeedback({ kind: "error", message: messageFrom(error, "Town could not be changed.") });
        return null;
      } finally {
        if (activeCampaignRef.current === expectedCampaign) setBusy(false);
      }
    });
  }

  async function makeTown(): Promise<void> {
    if (!campaignId) return;
    const created = await mutate(() => createTown({
      campaignId: Number(campaignId),
      name: createDraft.name,
      category: createDraft.category,
      overview: createDraft.overview,
      locationNotes: "",
      godNotes: "",
    }), "Town created.");
    if (!created) return;
    initializeDetail(created);
    setCreateDraft({ name: "", category: "", overview: "" });
    setShowCreate(false);
    replaceUrl(campaignId, "active", created.town.id);
  }

  async function persistTown(): Promise<void> {
    if (!detail) return;
    const saved = await mutate(() => saveTown({ ...coreDraft, townId: detail.town.id }), "Town details saved.");
    if (saved) setCoreDraft(coreFrom(saved));
  }

  async function attachSelectedShop(): Promise<void> {
    if (!detail || !selectedShopId) return;
    const selected = detail.availableShops.find(({ id }) => String(id) === selectedShopId);
    if (!selected) return;
    let next: TownDetail | null;
    if (selected.assignedTownId && selected.assignedTownId !== detail.town.id) {
      if (!window.confirm(`Move ${selected.name} from ${selected.assignedTownName} to ${detail.town.name}? This changes only its Town membership.`)) return;
      next = await mutate(() => reassignTownShop(selected.assignedTownId!, detail.town.id, detail.town.campaignId, selected.id), `${selected.name} reassigned to this Town.`);
    } else {
      next = await mutate(() => attachTownShop(detail.town.id, detail.town.campaignId, selected.id), `${selected.name} attached.`);
    }
    if (next) setSelectedShopId("");
  }

  async function addSelectedNpc(): Promise<void> {
    if (!detail || !selectedNpcId) return;
    const selected = detail.availableNpcs.find(({ id }) => String(id) === selectedNpcId);
    const next = await mutate(() => addTownNpc({
      townId: detail.town.id,
      campaignId: detail.town.campaignId,
      npcCharacterId: Number(selectedNpcId),
      relationshipLabel: newNpcRelationship,
      townNote: newNpcNote,
    }), `${selected?.name ?? "NPC"} associated.`);
    if (next) {
      setSelectedNpcId("");
      setNewNpcRelationship("");
      setNewNpcNote("");
    }
  }

  async function persistNpc(entry: TownNpcRecord): Promise<void> {
    if (!detail || entry.associationId === null) return;
    const associationId = entry.associationId;
    const draft = npcDrafts[associationId] ?? npcFrom(entry);
    const saved = await mutate(() => updateTownNpc({
      townId: detail.town.id,
      campaignId: detail.town.campaignId,
      npcCharacterId: entry.npcCharacterId,
      associationId,
      ...draft,
    }), `${entry.name} relationship saved.`);
    if (saved) {
      const updated = saved.npcs.find((candidate) => candidate.associationId === associationId);
      if (updated) setNpcDrafts((current) => ({ ...current, [associationId]: npcFrom(updated) }));
    }
  }

  async function makePlace(): Promise<void> {
    if (!detail) return;
    const saved = await mutate(() => createTownPlace({
      townId: detail.town.id,
      campaignId: detail.town.campaignId,
      ...newPlace,
    }), "Place created.");
    if (saved) {
      setNewPlace(EMPTY_PLACE);
      setShowNewPlace(false);
    }
  }

  async function persistPlace(entry: TownPlaceRecord): Promise<void> {
    if (!detail) return;
    const draft = placeDrafts[entry.id] ?? placeFrom(entry);
    const saved = await mutate(() => updateTownPlace({
      townId: detail.town.id,
      campaignId: detail.town.campaignId,
      placeId: entry.id,
      ...draft,
    }), `${draft.name || entry.name} saved.`);
    if (saved) {
      const updated = saved.places.find(({ id }) => id === entry.id);
      if (updated) setPlaceDrafts((current) => ({ ...current, [entry.id]: placeFrom(updated) }));
    }
  }

  async function inspectLifecycle(): Promise<void> {
    if (!detail) return;
    setBusy(true);
    try {
      setLifecycle(await previewTownLifecycle(detail.town.id, detail.town.campaignId));
    } catch (error) {
      setFeedback({ kind: "error", message: messageFrom(error, "Town lifecycle could not be previewed.") });
    } finally {
      setBusy(false);
    }
  }

  async function applyTownLifecycle(action: "archive" | "restore" | "delete"): Promise<void> {
    if (!detail) return;
    const current = detail;
    let reason = "";
    let confirmation = "";
    if (action === "archive") {
      reason = window.prompt("Optional archive reason:") ?? "";
    }
    if (action === "delete") {
      const answer = window.prompt(`Permanent deletion removes Town-owned Places and memberships. Shops and NPCs survive. Type ${current.town.name} to confirm:`);
      if (answer === null) return;
      confirmation = answer;
    }
    await preserveScroll(async () => {
      setBusy(true);
      setFeedback(null);
      try {
        if (action === "archive") await archiveTown(current.town.id, current.town.campaignId, reason);
        if (action === "restore") await restoreTown(current.town.id, current.town.campaignId);
        if (action === "delete") await deleteTown(current.town.id, current.town.campaignId, confirmation);
        setDetail(null);
        setCoreDraft(EMPTY_CORE);
        setLifecycle(null);
        const nextStatus: TownArchiveStatus = action === "archive" ? "archived" : action === "restore" ? "active" : status;
        setStatus(nextStatus);
        await refreshIndex(campaignId, nextStatus);
        replaceUrl(campaignId, nextStatus);
        setFeedback({ kind: "success", message: action === "delete" ? "Town permanently deleted; linked Shops and NPCs survived." : `Town ${action}d.` });
      } catch (error) {
        setFeedback({ kind: "error", message: messageFrom(error, `Town could not be ${action}d.`) });
      } finally {
        setBusy(false);
      }
    });
  }

  return <main className="towns-page">
    <header className="towns-header">
      <Link href="/heavens" className="font-evanescent towns-logo">SERRIAN<br />TIDE</Link>
      <div><p>THE HEAVENS / TOWN BUILDER</p><h1 className="font-sans">Campaign Towns</h1><span>Organize existing Shops and NPCs with Town-owned descriptive Places.</span></div>
      <nav><Link href="/heavens">← The Heavens</Link></nav>
    </header>

    <p className={`towns-scope ${isAdmin ? "is-admin" : ""}`}>{isAdmin ? "Administrator view: Campaign ownership and authorization are still enforced." : "Only Campaigns you own are available here."}</p>
    {feedback ? <p role="status" className={`towns-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}

    <section className="towns-context">
      <div><p>Campaign scope</p><h2>{selectedCampaign?.name ?? "Choose a Campaign"}</h2><span>Results never cross the selected Campaign.</span></div>
      <label className="towns-field"><span>Campaign</span><select aria-label="Town Campaign" value={campaignId} disabled={busy} onChange={(event) => void changeCampaign(event.target.value)}><option value="">Choose a Campaign</option>{campaigns.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.archived ? " — archived" : ""}{entry.ownerLabel ? ` — ${entry.ownerLabel}` : ""}</option>)}</select></label>
      <button type="button" disabled={!campaignId || Boolean(selectedCampaign?.archived)} onClick={() => setShowCreate((value) => !value)}>New Town</button>
    </section>

    {showCreate ? <section className="towns-create" aria-label="Create Town">
      <label className="towns-field"><span>Town name</span><input value={createDraft.name} onChange={(event) => setCreateDraft({ ...createDraft, name: event.target.value })} /></label>
      <label className="towns-field"><span>Type / category</span><input value={createDraft.category} placeholder="Port town, capital, frontier…" onChange={(event) => setCreateDraft({ ...createDraft, category: event.target.value })} /></label>
      <label className="towns-field is-wide"><span>Overview</span><textarea rows={2} value={createDraft.overview} onChange={(event) => setCreateDraft({ ...createDraft, overview: event.target.value })} /></label>
      <div className="towns-actions"><button type="button" disabled={busy} onClick={() => void makeTown()}>Create Town</button><button type="button" onClick={() => setShowCreate(false)}>Cancel</button></div>
    </section> : null}

    <div className="towns-layout">
      <aside className="towns-library" data-preserve-scroll="town-index">
        <header><div><p>Campaign library</p><h2>Towns</h2></div><span>{visibleTowns.length} shown</span></header>
        <div className="towns-segmented"><button type="button" aria-pressed={status === "active"} onClick={() => void changeStatus("active")}>Active</button><button type="button" aria-pressed={status === "archived"} onClick={() => void changeStatus("archived")}>Archived</button></div>
        <label className="towns-field"><span>Search Towns</span><input type="search" value={townSearch} placeholder="Name, category, overview, location" onChange={(event) => setTownSearch(event.target.value)} /></label>
        {!campaignId ? <p className="towns-empty">Choose a Campaign to view Towns.</p> : loading ? <p className="towns-empty">Reading Towns…</p> : visibleTowns.length ? <div className="towns-index">{visibleTowns.map((entry) => <button type="button" key={entry.id} className={detail?.town.id === entry.id ? "is-selected" : ""} disabled={busy} onClick={() => void openTown(entry.id)}><strong>{entry.name}</strong><span>{entry.category}</span><small>{entry.shopCount} Shops · {entry.npcCount} NPCs · {entry.placeCount} Places</small></button>)}</div> : <p className="towns-empty">No {status} Towns match this view.</p>}
      </aside>

      <section className="towns-editor">
        {!detail ? <div className="towns-empty is-large"><h2>Select a Town</h2><p>Create or choose a Town to manage its descriptive record and relationships.</p></div> : <>
          <header className="towns-editor__header"><div><p>{detail.town.category} · {detail.campaign.name}</p><h2>{detail.town.name}</h2><span>Updated {new Date(detail.town.updatedAt).toLocaleString()}</span></div><div className="towns-actions"><button type="button" disabled={readOnly || busy} onClick={() => void persistTown()}>Save Town</button><button type="button" disabled={busy} onClick={() => void inspectLifecycle()}>Archive / Delete</button></div></header>
          {readOnly ? <p className="towns-readonly">This Town or its Campaign is archived. Restore it before editing relationships or Places.</p> : null}

          {lifecycle ? <section className="towns-lifecycle"><header><div><p>Lifecycle preview</p><h3>{lifecycle.townName}</h3></div><button type="button" onClick={() => setLifecycle(null)}>Close</button></header><ul>{lifecycle.dependencies.map((entry) => <li key={entry.label}><span>{entry.label}</span><strong>{entry.count}</strong></li>)}</ul><p>Archiving makes the Town read-only. Permanent deletion removes memberships and Town-owned Places; Shops and NPC records survive.</p><div className="towns-actions">{lifecycle.canArchive ? <button type="button" onClick={() => void applyTownLifecycle("archive")}>Archive Town</button> : null}{lifecycle.canRestore ? <button type="button" onClick={() => void applyTownLifecycle("restore")}>Restore Town</button> : null}<button type="button" className="is-danger" disabled={!lifecycle.canDelete} title={lifecycle.permanentDeletionEnabled ? "" : "Permanent deletion is disabled."} onClick={() => void applyTownLifecycle("delete")}>Permanently Delete</button></div></section> : null}

          <section className="towns-panel towns-core"><header><div><p>Town record</p><h3>Identity & notes</h3></div></header><div className="towns-grid two"><label className="towns-field"><span>Name</span><input disabled={readOnly} value={coreDraft.name} onChange={(event) => setCoreDraft({ ...coreDraft, name: event.target.value })} /></label><label className="towns-field"><span>Type / category</span><input disabled={readOnly} value={coreDraft.category} onChange={(event) => setCoreDraft({ ...coreDraft, category: event.target.value })} /></label><label className="towns-field is-wide"><span>Overview</span><textarea rows={4} disabled={readOnly} value={coreDraft.overview} onChange={(event) => setCoreDraft({ ...coreDraft, overview: event.target.value })} /></label><label className="towns-field"><span>Location notes</span><textarea rows={3} disabled={readOnly} value={coreDraft.locationNotes} onChange={(event) => setCoreDraft({ ...coreDraft, locationNotes: event.target.value })} /></label><label className="towns-field"><span>G.O.D. notes</span><textarea rows={3} disabled={readOnly} value={coreDraft.godNotes} onChange={(event) => setCoreDraft({ ...coreDraft, godNotes: event.target.value })} /></label></div></section>

          <section className="towns-panel"><header><div><p>Existing Campaign records</p><h3>Shops</h3><span>One Town per Shop; Shop staff, offerings, balances, and state remain unchanged.</span></div><strong>{detail.shops.length} attached</strong></header><label className="towns-field"><span>Search Shops</span><input type="search" value={shopSearch} placeholder="Name or category" onChange={(event) => setShopSearch(event.target.value)} /></label><div className="towns-add-row"><label className="towns-field"><span>Available Campaign Shop</span><select aria-label="Available Campaign Shop" disabled={readOnly} value={selectedShopId} onChange={(event) => setSelectedShopId(event.target.value)}><option value="">Choose a Shop</option>{visibleAvailableShops.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.category}{entry.assignedTownName ? ` · currently ${entry.assignedTownName}` : " · standalone"}</option>)}</select></label><button type="button" disabled={readOnly || !selectedShopId || busy} onClick={() => void attachSelectedShop()}>{detail.availableShops.find(({ id }) => String(id) === selectedShopId)?.assignedTownId ? "Reassign Here" : "Attach Shop"}</button></div><div className="towns-card-list" data-preserve-scroll="town-shops">{visibleLinkedShops.length ? visibleLinkedShops.map((entry, index) => <article className="towns-card" key={entry.membershipId}><div className="towns-card__identity"><p>{entry.category}{entry.archived ? " · archived reference" : ""}</p><h4>{entry.name}</h4><span>{entry.staffCount} assigned staff · Shop #{entry.shopId}</span></div><div className="towns-order"><button type="button" aria-label={`Move ${entry.name} up`} disabled={readOnly || index === 0 || busy} onClick={() => void mutate(() => reorderTownShops(detail.town.id, detail.town.campaignId, moveId(detail.shops.map(({ membershipId }) => membershipId), entry.membershipId, -1)), `${entry.name} moved.`)}>↑</button><button type="button" aria-label={`Move ${entry.name} down`} disabled={readOnly || index === visibleLinkedShops.length - 1 || busy} onClick={() => void mutate(() => reorderTownShops(detail.town.id, detail.town.campaignId, moveId(detail.shops.map(({ membershipId }) => membershipId), entry.membershipId, 1)), `${entry.name} moved.`)}>↓</button></div><div className="towns-actions"><Link className="towns-link-button" href={`/heavens/shops?campaign=${detail.town.campaignId}&shop=${entry.shopId}`}>Open Shop Record</Link><button type="button" disabled={readOnly || busy} onClick={() => void mutate(() => detachTownShop(detail.town.id, detail.town.campaignId, entry.membershipId), `${entry.name} detached; the Shop remains standalone.`)}>Detach</button></div></article>) : <p className="towns-empty">No attached Shops match this search.</p>}</div></section>

          <section className="towns-panel">
            <header><div><p>Town NPC directory</p><h3>NPC associations</h3><span>Direct Town associations and staff at active attached Shops appear once per NPC.</span></div><strong>{detail.npcs.length} associated</strong></header>
            <label className="towns-field"><span>Search NPCs</span><input type="search" value={npcSearch} placeholder="Name, role, kind, build, relationship, note, or Shop" onChange={(event) => setNpcSearch(event.target.value)} /></label>
            <div className="towns-npc-add"><label className="towns-field"><span>Available Campaign NPC</span><select aria-label="Available Campaign NPC" disabled={readOnly} value={selectedNpcId} onChange={(event) => setSelectedNpcId(event.target.value)}><option value="">Choose an NPC</option>{visibleAvailableNpcs.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.npcKind} · {entry.npcBuildMode} · {entry.roleLabel}</option>)}</select></label><label className="towns-field"><span>Town relationship</span><input disabled={readOnly} value={newNpcRelationship} placeholder="Mayor, local guide, regular…" onChange={(event) => setNewNpcRelationship(event.target.value)} /></label><label className="towns-field"><span>Town note</span><input disabled={readOnly} value={newNpcNote} onChange={(event) => setNewNpcNote(event.target.value)} /></label><button type="button" disabled={readOnly || !selectedNpcId || busy} onClick={() => void addSelectedNpc()}>Associate NPC</button></div>
            <div className="towns-card-list" data-preserve-scroll="town-npcs">
              {visibleLinkedNpcs.length ? visibleLinkedNpcs.map((entry) => {
                const associationId = entry.associationId;
                const draft = associationId === null ? npcFrom(entry) : npcDrafts[associationId] ?? npcFrom(entry);
                const directAssociations = detail.npcs.filter((npc) => npc.associationId !== null);
                const directIndex = associationId === null ? -1 : directAssociations.findIndex((npc) => npc.associationId === associationId);
                return <article className="towns-card is-editable" key={entry.npcCharacterId}>
                  <div className="towns-card__identity"><p>{entry.npcKind} · {entry.npcBuildMode}{entry.archived ? " · archived reference" : ""}</p><h4>{entry.name}</h4><span>{entry.roleLabel || "No role label"}</span></div>
                  <div className="towns-card__content">
                    {entry.shopAssociations.length ? <div className="towns-grid two">{entry.shopAssociations.map((association) => <p key={association.shopId}><strong>Shop staff · {association.shopName}</strong><br /><span>{association.responsibilityLabel || "No staff responsibility"}{association.isPrimaryContact ? " · Primary contact" : ""}</span></p>)}</div> : null}
                    {associationId !== null ? <div className="towns-grid two"><label className="towns-field"><span>Town relationship</span><input disabled={readOnly} value={draft.relationshipLabel} onChange={(event) => setNpcDrafts({ ...npcDrafts, [associationId]: { ...draft, relationshipLabel: event.target.value } })} /></label><label className="towns-field"><span>Town note</span><input disabled={readOnly} value={draft.townNote} onChange={(event) => setNpcDrafts({ ...npcDrafts, [associationId]: { ...draft, townNote: event.target.value } })} /></label></div> : <p>This NPC appears automatically because they staff an active Shop attached to this Town. Add a direct association above to record Town-specific notes.</p>}
                  </div>
                  {associationId !== null ? <div className="towns-order"><button type="button" aria-label={`Move ${entry.name} up`} disabled={readOnly || directIndex <= 0 || busy} onClick={() => void mutate(() => reorderTownNpcs(detail.town.id, detail.town.campaignId, moveId(directAssociations.map((npc) => npc.associationId!), associationId, -1)), `${entry.name} moved.`)}>↑</button><button type="button" aria-label={`Move ${entry.name} down`} disabled={readOnly || directIndex === directAssociations.length - 1 || busy} onClick={() => void mutate(() => reorderTownNpcs(detail.town.id, detail.town.campaignId, moveId(directAssociations.map((npc) => npc.associationId!), associationId, 1)), `${entry.name} moved.`)}>↓</button></div> : null}
                  <div className="towns-actions"><Link className="towns-link-button" href={`/heavens/npcs/${entry.npcCharacterId}?campaign=${detail.town.campaignId}`}>Open NPC Record</Link>{associationId !== null ? <><button type="button" disabled={readOnly || busy} onClick={() => void persistNpc(entry)}>Save Relationship</button><button type="button" disabled={readOnly || busy} onClick={() => void mutate(() => removeTownNpc(detail.town.id, detail.town.campaignId, associationId), `${entry.name} direct association removed; other qualifying Shop staff associations remain.`)}>Remove Direct Association</button></> : null}</div>
                </article>;
              }) : <p className="towns-empty">No associated NPCs match this search.</p>}
            </div>
          </section>

          <section className="towns-panel"><header><div><p>Town-owned descriptive records</p><h3>Places</h3><span>Places describe the Town; they do not create runtime mechanics.</span></div><button type="button" disabled={readOnly} onClick={() => setShowNewPlace((value) => !value)}>New Place</button></header>{showNewPlace ? <div className="towns-place-form"><div className="towns-grid two"><label className="towns-field"><span>Place name</span><input value={newPlace.name} onChange={(event) => setNewPlace({ ...newPlace, name: event.target.value })} /></label><label className="towns-field"><span>Type / category</span><input value={newPlace.category} onChange={(event) => setNewPlace({ ...newPlace, category: event.target.value })} /></label><label className="towns-field is-wide"><span>Description</span><textarea rows={3} value={newPlace.description} onChange={(event) => setNewPlace({ ...newPlace, description: event.target.value })} /></label><label className="towns-field"><span>Location notes</span><textarea rows={2} value={newPlace.locationNotes} onChange={(event) => setNewPlace({ ...newPlace, locationNotes: event.target.value })} /></label><label className="towns-field"><span>G.O.D. notes</span><textarea rows={2} value={newPlace.godNotes} onChange={(event) => setNewPlace({ ...newPlace, godNotes: event.target.value })} /></label></div><div className="towns-actions"><button type="button" disabled={busy} onClick={() => void makePlace()}>Create Place</button><button type="button" onClick={() => setShowNewPlace(false)}>Cancel</button></div></div> : null}<div className="towns-place-tools"><div className="towns-segmented"><button type="button" aria-pressed={placeStatus === "active"} onClick={() => setPlaceStatus("active")}>Active ({detail.places.filter(({ archivedAt }) => !archivedAt).length})</button><button type="button" aria-pressed={placeStatus === "archived"} onClick={() => setPlaceStatus("archived")}>Archived ({detail.places.filter(({ archivedAt }) => archivedAt).length})</button></div><label className="towns-field"><span>Search Places</span><input type="search" value={placeSearch} placeholder="Name, category, description, location" onChange={(event) => setPlaceSearch(event.target.value)} /></label></div><div className="towns-card-list" data-preserve-scroll="town-places">{visiblePlaces.length ? visiblePlaces.map((entry, index) => { const draft = placeDrafts[entry.id] ?? placeFrom(entry); return <article className="towns-place" key={entry.id}><header><div><p>{draft.category || "Uncategorized"}{entry.archivedAt ? " · archived" : ""}</p><h4>{draft.name || entry.name}</h4><span>Updated {new Date(entry.updatedAt).toLocaleString()}</span></div><div className="towns-order"><button type="button" aria-label={`Move ${entry.name} up`} disabled={readOnly || index === 0 || busy} onClick={() => void mutate(() => reorderTownPlaces(detail.town.id, detail.town.campaignId, placeStatus, moveId(detail.places.filter((place) => Boolean(place.archivedAt) === (placeStatus === "archived")).map(({ id }) => id), entry.id, -1)), `${entry.name} moved.`)}>↑</button><button type="button" aria-label={`Move ${entry.name} down`} disabled={readOnly || index === visiblePlaces.length - 1 || busy} onClick={() => void mutate(() => reorderTownPlaces(detail.town.id, detail.town.campaignId, placeStatus, moveId(detail.places.filter((place) => Boolean(place.archivedAt) === (placeStatus === "archived")).map(({ id }) => id), entry.id, 1)), `${entry.name} moved.`)}>↓</button></div></header><div className="towns-grid two"><label className="towns-field"><span>Name</span><input disabled={readOnly || Boolean(entry.archivedAt)} value={draft.name} onChange={(event) => setPlaceDrafts({ ...placeDrafts, [entry.id]: { ...draft, name: event.target.value } })} /></label><label className="towns-field"><span>Type / category</span><input disabled={readOnly || Boolean(entry.archivedAt)} value={draft.category} onChange={(event) => setPlaceDrafts({ ...placeDrafts, [entry.id]: { ...draft, category: event.target.value } })} /></label><label className="towns-field is-wide"><span>Description</span><textarea rows={3} disabled={readOnly || Boolean(entry.archivedAt)} value={draft.description} onChange={(event) => setPlaceDrafts({ ...placeDrafts, [entry.id]: { ...draft, description: event.target.value } })} /></label><label className="towns-field"><span>Location notes</span><textarea rows={2} disabled={readOnly || Boolean(entry.archivedAt)} value={draft.locationNotes} onChange={(event) => setPlaceDrafts({ ...placeDrafts, [entry.id]: { ...draft, locationNotes: event.target.value } })} /></label><label className="towns-field"><span>G.O.D. notes</span><textarea rows={2} disabled={readOnly || Boolean(entry.archivedAt)} value={draft.godNotes} onChange={(event) => setPlaceDrafts({ ...placeDrafts, [entry.id]: { ...draft, godNotes: event.target.value } })} /></label></div>{entry.archiveReason ? <p className="towns-archive-note">Archive reason: {entry.archiveReason}</p> : null}<div className="towns-actions">{!entry.archivedAt ? <><button type="button" disabled={readOnly || busy} onClick={() => void persistPlace(entry)}>Save Place</button><button type="button" disabled={readOnly || busy} onClick={() => { const reason = window.prompt("Optional archive reason:") ?? ""; void mutate(() => archiveTownPlace(detail.town.id, detail.town.campaignId, entry.id, reason), `${entry.name} archived.`); }}>Archive</button></> : <button type="button" disabled={readOnly || busy} onClick={() => void mutate(() => restoreTownPlace(detail.town.id, detail.town.campaignId, entry.id), `${entry.name} restored.`)}>Restore</button>}<button type="button" className="is-danger" disabled={readOnly || busy} onClick={() => { const confirmation = window.prompt(`Type ${entry.name} to permanently delete this Town-owned Place:`); if (confirmation !== null) void mutate(() => deleteTownPlace(detail.town.id, detail.town.campaignId, entry.id, confirmation), `${entry.name} permanently deleted.`); }}>Delete</button></div></article>; }) : <p className="towns-empty">No {placeStatus} Places match this search.</p>}</div></section>
        </>}
      </section>
    </div>
  </main>;
}
