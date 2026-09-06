"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";
import type {
  LocationPlacementWorkspace,
  LocationTownOption,
  TownPlacementSelection,
  TownRefreshPreview,
} from "@/features/tabletop-operations/location-placement-service";

import {
  addShopToScene,
  addTownToScene,
  createSceneFromTown,
  detachShopFromScene,
  detachTownFromScene,
  prepareSessionShop,
  prepareSessionTown,
  previewTownPlacementRefresh,
  refreshTownPlacement,
  removePreparedSessionShop,
  removePreparedSessionTown,
  setShopPlacementVisibility,
  setTownChildState,
  setTownPlacementVisibility,
} from "./location-actions";

type Feedback = { kind: "success" | "error"; message: string };

function searchMatch(search: string, values: readonly (string | null)[]): boolean {
  const needle = search.trim().toLocaleLowerCase();
  return !needle || values.some((value) => value?.toLocaleLowerCase().includes(needle));
}

function activeTownContents(town: LocationTownOption) {
  return {
    shops: town.shops.filter(({ archived }) => !archived),
    places: town.places.filter(({ archived }) => !archived),
    npcs: town.npcs.filter(({ archived }) => !archived),
  };
}

function preparedLabel(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

export function SessionLocationPreparation({
  data,
  canOperate,
}: {
  data: LocationPlacementWorkspace;
  canOperate: boolean;
}) {
  const router = useRouter();
  const preserveScroll = useInPlaceScrollPreservation();
  const [townSearch, setTownSearch] = useState("");
  const [shopSearch, setShopSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const preparedTownIds = new Set(data.preparedTownIds);
  const preparedShopIds = new Set(data.preparedShopIds);
  const preparedTowns = data.preparedTownIds.flatMap((id) => {
    const value = data.towns.find((town) => town.id === id);
    return value ? [value] : [];
  });
  const preparedShops = data.preparedShopIds.flatMap((id) => {
    const value = data.shops.find((shop) => shop.id === id);
    return value ? [value] : [];
  });
  const availableTowns = data.towns.filter((town) => (
    !town.archived
    && !preparedTownIds.has(town.id)
    && searchMatch(townSearch, [town.name, town.category, town.overview])
  ));
  const availableShops = data.shops.filter((shop) => (
    !shop.archived
    && !preparedShopIds.has(shop.id)
    && searchMatch(shopSearch, [shop.name, shop.category, shop.townName])
  ));

  async function run(work: () => Promise<void>, success: string): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await preserveScroll(work);
      setFeedback({ kind: "success", message: success });
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The location preparation action failed." });
    } finally {
      setBusy(false);
    }
  }

  return <section className="tabletop-location-prep" aria-labelledby="session-location-prep-title">
    <header>
      <div><span>SESSION LOCATIONS</span><h3 id="session-location-prep-title" className="font-sans">Towns & independent Shops</h3></div>
      <strong>{preparedLabel(preparedTowns.length, "Town")} · {preparedLabel(preparedShops.length, "Shop")}</strong>
    </header>
    <p className="tabletop-location-copy">Prepare reusable Campaign locations here, or place them directly from a Scene. Preparation is private and does not reveal content to players.</p>
    {feedback ? <p className={`tabletop-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
    <div className="tabletop-location-prepared-grid">
      <section>
        <h4>Prepared Towns</h4>
        {preparedTowns.length ? <div className="tabletop-location-pills">{preparedTowns.map((town) => <article key={town.id}>
          <div><strong>{town.name}</strong><span>{town.category}{town.archived ? " · Archived source" : ""}</span></div>
          {canOperate && data.sessionEditable ? <button type="button" disabled={busy} onClick={() => void run(() => removePreparedSessionTown(data.sessionId, town.id), `${town.name} was removed from Session preparation.`)}>Remove</button> : null}
        </article>)}</div> : <p className="tabletop-empty">No Towns are prepared for this Session.</p>}
      </section>
      <section>
        <h4>Prepared independent Shops</h4>
        {preparedShops.length ? <div className="tabletop-location-pills">{preparedShops.map((shop) => <article key={shop.id}>
          <div><strong>{shop.name}</strong><span>{shop.category} · {shop.storefrontState}{shop.townName ? ` · Also linked to ${shop.townName}` : " · Standalone"}</span></div>
          {canOperate && data.sessionEditable ? <button type="button" disabled={busy} onClick={() => void run(() => removePreparedSessionShop(data.sessionId, shop.id), `${shop.name} was removed from Session preparation.`)}>Remove</button> : null}
        </article>)}</div> : <p className="tabletop-empty">No independent Shops are prepared for this Session.</p>}
      </section>
    </div>
    {canOperate && data.sessionEditable ? <div className="tabletop-location-selector-grid">
      <section>
        <header><div><span>CAMPAIGN TOWNS</span><h4>Prepare a Town</h4></div><input type="search" value={townSearch} placeholder="Find a Town" onChange={(event) => setTownSearch(event.target.value)} /></header>
        <div className="tabletop-location-option-list">{availableTowns.map((town) => {
          const contents = activeTownContents(town);
          return <article key={town.id}><div><strong>{town.name}</strong><span>{town.category} · {contents.shops.length} Shops · {contents.places.length} places · {contents.npcs.length} NPCs</span></div><button type="button" disabled={busy} onClick={() => void run(() => prepareSessionTown(data.sessionId, town.id), `${town.name} is prepared for this Session.`)}>Prepare</button></article>;
        })}</div>
        {!availableTowns.length ? <p className="tabletop-empty">No available Towns match this search.</p> : null}
      </section>
      <section>
        <header><div><span>CAMPAIGN SHOPS</span><h4>Prepare an independent Shop</h4></div><input type="search" value={shopSearch} placeholder="Find a Shop" onChange={(event) => setShopSearch(event.target.value)} /></header>
        <div className="tabletop-location-option-list">{availableShops.map((shop) => <article key={shop.id}><div><strong>{shop.name}</strong><span>{shop.category} · {shop.storefrontState}{shop.townName ? ` · ${shop.townName}` : " · Standalone"}</span></div><button type="button" disabled={busy} onClick={() => void run(() => prepareSessionShop(data.sessionId, shop.id), `${shop.name} is prepared for independent placement.`)}>Prepare</button></article>)}</div>
        {!availableShops.length ? <p className="tabletop-empty">No available Shops match this search.</p> : null}
      </section>
    </div> : <p className="tabletop-readonly-notice">{canOperate ? "These prepared references are retained as Session history. Reopen the Session before changing them." : "Admin view is read-only. Only the Campaign-owning G.O.D. can change Session preparation."}</p>}
  </section>;
}

function TownPlacementComposer({
  data,
  busy,
  setBusy,
  onFeedback,
  canOperate,
}: {
  data: LocationPlacementWorkspace;
  busy: boolean;
  setBusy: (value: boolean) => void;
  onFeedback: (feedback: Feedback) => void;
  canOperate: boolean;
}) {
  const router = useRouter();
  const preserveScroll = useInPlaceScrollPreservation();
  const [search, setSearch] = useState("");
  const [townId, setTownId] = useState<number | null>(null);
  const [shopIds, setShopIds] = useState<Set<number>>(new Set());
  const [placeIds, setPlaceIds] = useState<Set<number>>(new Set());
  const [npcIds, setNpcIds] = useState<Set<number>>(new Set());
  const placedIds = new Set(data.sceneTowns.map(({ town }) => town.id));
  const options = data.towns.filter((town) => !town.archived && !placedIds.has(town.id) && searchMatch(search, [town.name, town.category, town.overview]));
  const selected = data.towns.find((town) => town.id === townId && !town.archived) ?? null;
  const contents = selected ? activeTownContents(selected) : null;

  function choose(value: number | null): void {
    setTownId(value);
    const town = data.towns.find((entry) => entry.id === value);
    const next = town ? activeTownContents(town) : null;
    setShopIds(new Set(next?.shops.map(({ id }) => id) ?? []));
    setPlaceIds(new Set(next?.places.map(({ id }) => id) ?? []));
    setNpcIds(new Set(next?.npcs.map(({ id }) => id) ?? []));
  }

  function toggle(setter: (value: Set<number>) => void, current: Set<number>, id: number): void {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  }

  const selection: TownPlacementSelection = { shopIds: [...shopIds], placeIds: [...placeIds], npcCharacterIds: [...npcIds] };

  async function run(mode: "place" | "create"): Promise<void> {
    if (!selected) return;
    setBusy(true);
    try {
      if (mode === "place") {
        if (data.selectedSceneId === null) throw new Error("Select or create a Scene before placing a Town.");
        const result = await preserveScroll(() => addTownToScene(data.selectedSceneId!, selected.id, selection));
        onFeedback({ kind: "success", message: result.created ? `${selected.name} and its selected contents were added hidden.` : `${selected.name} is already placed; existing Scene choices were preserved.` });
        choose(null);
        router.refresh();
      } else {
        const result = await createSceneFromTown(data.sessionId, selected.id, selection);
        onFeedback({ kind: "success", message: `${selected.name} created a planned Scene with hidden location content.` });
        router.push(`/heavens/tabletop?campaign=${data.campaignId}&session=${data.sessionId}&scene=${result.sceneId}`, { scroll: false });
      }
    } catch (error) {
      onFeedback({ kind: "error", message: error instanceof Error ? error.message : "Town placement failed." });
    } finally {
      setBusy(false);
    }
  }

  return <section className="tabletop-location-composer">
    <header><div><span>TOWN PLACEMENT</span><h4>Add Town to Scene</h4></div><input type="search" value={search} placeholder="Search Towns" onChange={(event) => setSearch(event.target.value)} /></header>
    <label><span>Campaign Town</span><select value={townId ?? ""} disabled={busy} onChange={(event) => choose(event.target.value ? Number(event.target.value) : null)}><option value="">Choose a Town</option>{options.map((town) => <option value={town.id} key={town.id}>{town.name} — {town.category}</option>)}</select></label>
    {selected && contents ? <div className="tabletop-location-preview">
      <header><div><span>INCLUSION PREVIEW</span><strong>{selected.name}</strong></div><small>{shopIds.size + placeIds.size + npcIds.size} of {contents.shops.length + contents.places.length + contents.npcs.length} selected</small></header>
      <div>
        <fieldset><legend>Shops ({contents.shops.length})</legend>{contents.shops.map((shop) => <label key={shop.id}><input type="checkbox" checked={shopIds.has(shop.id)} onChange={() => toggle(setShopIds, shopIds, shop.id)} /><span><strong>{shop.name}</strong>{shop.category} · {shop.storefrontState} · {shop.staff.length} staff</span></label>)}</fieldset>
        <fieldset><legend>Places ({contents.places.length})</legend>{contents.places.map((place) => <label key={place.id}><input type="checkbox" checked={placeIds.has(place.id)} onChange={() => toggle(setPlaceIds, placeIds, place.id)} /><span><strong>{place.name}</strong>{place.category || "Place"}</span></label>)}</fieldset>
        <fieldset><legend>Associated NPCs & staff ({contents.npcs.length})</legend>{contents.npcs.map((npc) => <label key={npc.id}><input type="checkbox" checked={npcIds.has(npc.id)} onChange={() => toggle(setNpcIds, npcIds, npc.id)} /><span><strong>{npc.name}</strong>{npc.npcBuildMode} {npc.npcKind} NPC{npc.staff.length ? ` · staff in ${npc.staff.length} Shop${npc.staff.length === 1 ? "" : "s"}` : ""}</span></label>)}</fieldset>
      </div>
      <p>Selected NPCs reuse existing Session roster and Scene memberships. No Encounter or Initiative enrollment occurs.</p>
    </div> : null}
    <footer><button type="button" className="is-primary" disabled={busy || !canOperate || !selected || data.selectedSceneId === null} onClick={() => void run("place")}>Add Town to Scene</button><button type="button" disabled={busy || !canOperate || !selected || !data.sessionEditable} onClick={() => void run("create")}>Create Scene from Town</button></footer>
  </section>;
}

export function SceneLocationWorkspace({
  data,
  canOperate,
}: {
  data: LocationPlacementWorkspace;
  canOperate: boolean;
}) {
  const router = useRouter();
  const preserveScroll = useInPlaceScrollPreservation();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [shopSearch, setShopSearch] = useState("");
  const [shopId, setShopId] = useState<number | null>(null);
  const [refreshPreview, setRefreshPreview] = useState<TownRefreshPreview | null>(null);
  const placedShopIds = useMemo(() => new Set(data.sceneShops.map(({ shop }) => shop.id)), [data.sceneShops]);
  const shopOptions = data.shops.filter((shop) => !shop.archived && !placedShopIds.has(shop.id) && searchMatch(shopSearch, [shop.name, shop.category, shop.townName]));

  async function run(work: () => Promise<void>, success: string): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await preserveScroll(work);
      setFeedback({ kind: "success", message: success });
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Scene location action failed." });
    } finally {
      setBusy(false);
    }
  }

  async function previewRefresh(sceneId: number, townId: number): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      setRefreshPreview(await previewTownPlacementRefresh(sceneId, townId));
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Town refresh preview failed." });
    } finally {
      setBusy(false);
    }
  }

  function changes(preview: TownRefreshPreview): number {
    return preview.shopAdditions.length + preview.shopRemovals.length + preview.placeAdditions.length + preview.placeRemovals.length + preview.npcAdditions.length + preview.npcRemovals.length;
  }

  return <section className="tabletop-scene-locations" aria-labelledby="scene-location-directory-title">
    <header><div><span>SCENE LOCATIONS</span><h3 id="scene-location-directory-title" className="font-sans">Location directory & player reveal</h3></div><strong>{preparedLabel(data.sceneTowns.length, "Town")} · {preparedLabel(data.sceneShops.length, "independent Shop")}</strong></header>
    <p className="tabletop-location-copy">Placement begins hidden. Reveal only the descriptive content players should receive; Shop management, private notes, inventory, money, and NPC profiles stay server-side.</p>
    {feedback ? <p className={`tabletop-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
    {canOperate && (data.sceneEditable || data.sessionEditable) ? <div className="tabletop-location-controls">
      <TownPlacementComposer data={data} busy={busy} setBusy={setBusy} onFeedback={setFeedback} canOperate={canOperate} />
      <section className="tabletop-location-composer">
        <header><div><span>SHOP PLACEMENT</span><h4>Add Shop to Scene</h4></div><input type="search" value={shopSearch} placeholder="Search Shops" onChange={(event) => setShopSearch(event.target.value)} /></header>
        <label><span>Campaign Shop</span><select value={shopId ?? ""} disabled={busy || data.selectedSceneId === null} onChange={(event) => setShopId(event.target.value ? Number(event.target.value) : null)}><option value="">Choose a Shop</option>{shopOptions.map((shop) => <option key={shop.id} value={shop.id}>{shop.name} — {shop.category} — {shop.storefrontState}</option>)}</select></label>
        {shopId ? (() => { const selected = data.shops.find(({ id }) => id === shopId); return selected ? <div className="tabletop-shop-preview"><strong>{selected.name}</strong><span>{selected.description || "No public description"}</span><small>{selected.storefrontState === "closed" ? "Closed — placement will not change this state." : "Open"}{selected.townName ? ` · Also linked to ${selected.townName}` : " · Standalone"}</small></div> : null; })() : null}
        <footer><button type="button" className="is-primary" disabled={busy || !shopId || data.selectedSceneId === null || !data.sceneEditable} onClick={() => void run(async () => { const selected = data.shops.find(({ id }) => id === shopId); const result = await addShopToScene(data.selectedSceneId!, shopId!); setShopId(null); setFeedback({ kind: "success", message: result.created ? `${selected?.name ?? "Shop"} was placed hidden.` : `${selected?.name ?? "Shop"} is already independently placed.` }); }, "Shop placed.")}>Add Shop to Scene</button></footer>
      </section>
    </div> : null}
    {data.selectedSceneId === null ? <p className="tabletop-empty">Create or select a Scene to place and reveal locations. Create Scene from Town remains available above.</p> : <div className="tabletop-location-directory">
      {data.sceneTowns.map((placement) => <article className="tabletop-town-placement" key={placement.town.id}>
        <header><div><span>{placement.town.category}{placement.town.archived ? " · Archived source" : ""}</span><h4>{placement.town.name}</h4><p>{placement.town.overview || "No Town overview."}</p></div><div><em className={placement.revealed ? "is-revealed" : "is-hidden"}>{placement.revealed ? "Town revealed" : "Hidden from players"}</em>{canOperate && data.sceneEditable ? <><button type="button" disabled={busy} onClick={() => void run(() => setTownPlacementVisibility(data.selectedSceneId!, placement.town.id, !placement.revealed, !placement.revealed), placement.revealed ? `${placement.town.name} is hidden from players.` : `${placement.town.name} and all included content are revealed.`)}>{placement.revealed ? "Hide Town" : "Reveal Town + Included"}</button><button type="button" disabled={busy || placement.town.archived} onClick={() => void previewRefresh(data.selectedSceneId!, placement.town.id)}>Preview Refresh</button><button type="button" className="is-danger" disabled={busy} onClick={() => { if (window.confirm(`Detach ${placement.town.name} from this Scene? Campaign records and Character memberships will be preserved.`)) void run(() => detachTownFromScene(data.selectedSceneId!, placement.town.id), `${placement.town.name} was detached; Campaign records and Character references were preserved.`); }}>Detach</button></> : null}</div></header>
        <div className="tabletop-town-content-grid">
          {([
            ["shop", "Shops", placement.shops] as const,
            ["place", "Places of interest", placement.places] as const,
            ["npc", "Associated NPCs & staff", placement.npcs] as const,
          ]).map(([kind, label, entries]) => <section key={kind}><header><h5>{label}</h5><strong>{entries.filter(({ included }) => included).length}/{entries.length}</strong></header>{entries.length ? <div>{entries.map((entry) => <article className={!entry.included ? "is-excluded" : ""} key={entry.id}>
            <div><strong>{entry.name}</strong><span>{"storefrontState" in entry ? `${entry.category} · ${entry.storefrontState}` : "npcBuildMode" in entry ? `${entry.npcBuildMode} ${entry.npcKind} NPC` : entry.category || "Place"}</span></div>
            <em className={entry.included && placement.revealed && entry.revealed ? "is-revealed" : "is-hidden"}>{!entry.included ? "Excluded" : placement.revealed && entry.revealed ? "Visible" : "Hidden"}</em>
            {canOperate && data.sceneEditable ? <div><button type="button" disabled={busy} onClick={() => void run(() => setTownChildState({ sceneId: data.selectedSceneId!, townId: placement.town.id, kind, childId: entry.id, included: !entry.included, revealed: false }), `${entry.name} is ${entry.included ? "excluded" : "included and hidden"}.`)}>{entry.included ? "Exclude" : "Include"}</button><button type="button" disabled={busy || !entry.included || !placement.revealed} onClick={() => void run(() => setTownChildState({ sceneId: data.selectedSceneId!, townId: placement.town.id, kind, childId: entry.id, included: true, revealed: !entry.revealed }), `${entry.name} is ${entry.revealed ? "hidden" : "revealed"}.`)}>{entry.revealed ? "Hide" : "Reveal"}</button></div> : null}
          </article>)}</div> : <p className="tabletop-empty">No referenced entries.</p>}</section>)}
        </div>
      </article>)}
      {data.sceneShops.length ? <section className="tabletop-independent-shops"><header><div><span>INDEPENDENT PLACEMENTS</span><h4>Separately placed Shops</h4></div><strong>{data.sceneShops.length}</strong></header>{data.sceneShops.map((placement) => <article key={placement.shop.id}><div><strong>{placement.shop.name}</strong><span>{placement.shop.category} · {placement.shop.storefrontState}{placement.shop.townName ? ` · also linked to ${placement.shop.townName}` : " · standalone"}</span><p>{placement.shop.description || "No public Shop description."}</p></div><em className={placement.revealed ? "is-revealed" : "is-hidden"}>{placement.revealed ? "Visible" : "Hidden"}</em>{canOperate && data.sceneEditable ? <div><button type="button" disabled={busy} onClick={() => void run(() => setShopPlacementVisibility(data.selectedSceneId!, placement.shop.id, !placement.revealed), `${placement.shop.name} is ${placement.revealed ? "hidden" : "revealed"}.`)}>{placement.revealed ? "Hide" : "Reveal"}</button><button type="button" className="is-danger" disabled={busy} onClick={() => { if (window.confirm(`Detach ${placement.shop.name} from this Scene? The Shop will not be deleted.`)) void run(() => detachShopFromScene(data.selectedSceneId!, placement.shop.id), `${placement.shop.name} was detached without changing the Shop.`); }}>Detach</button></div> : null}</article>)}</section> : null}
      {!data.sceneTowns.length && !data.sceneShops.length ? <p className="tabletop-empty">No Towns or Shops are placed in this Scene.</p> : null}
    </div>}
    {refreshPreview ? <div className="tabletop-location-refresh" role="dialog" aria-modal="true" aria-labelledby="town-refresh-title">
      <section><header><div><span>PLACEMENT REFRESH</span><h4 id="town-refresh-title">{refreshPreview.townName}</h4></div><button type="button" onClick={() => setRefreshPreview(null)}>Close</button></header><p>Existing inclusion and visibility choices are preserved. New references are included but hidden. Removed builder relationships detach only their Town-derived placement references.</p>
        <div>{([
          ["Shops", refreshPreview.shopAdditions, refreshPreview.shopRemovals],
          ["Places", refreshPreview.placeAdditions, refreshPreview.placeRemovals],
          ["NPCs", refreshPreview.npcAdditions, refreshPreview.npcRemovals],
        ] as const).map(([label, additions, removals]) => <section key={label}><h5>{label}</h5><p><strong>+{additions.length}</strong> additions: {additions.map(({ name }) => name).join(", ") || "None"}</p><p><strong>−{removals.length}</strong> removals: {removals.map(({ name }) => name).join(", ") || "None"}</p></section>)}</div>
        <footer><button type="button" onClick={() => setRefreshPreview(null)}>Cancel</button><button type="button" className="is-primary" disabled={busy || changes(refreshPreview) === 0} onClick={() => void run(async () => { await refreshTownPlacement(data.selectedSceneId!, refreshPreview.townId); setRefreshPreview(null); }, `${refreshPreview.townName} placement was refreshed.`)}>Apply {changes(refreshPreview)} changes</button></footer>
      </section>
    </div> : null}
  </section>;
}
