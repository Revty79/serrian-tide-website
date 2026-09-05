"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { LifecycleControls } from "@/app/heavens/lifecycle-controls";
import {
  getDetailedNpcHref,
  matchesNpcSearch,
  type NpcArchiveStatus,
  type NpcBuildMode,
  type NpcOrigin,
} from "@/features/npcs/npc-workflow";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";
import {
  createNpc,
  getSimpleNpc,
  listNpcArchive,
  listNpcOrigins,
  saveSimpleNpc,
  upgradeNpcToDetailed,
  type NpcArchiveRecord,
  type NpcCampaignSummary,
  type NpcOriginOption,
  type SimpleNpcDraft,
} from "./actions";

type Feedback = { kind: "success" | "error"; message: string } | null;

const EMPTY_CREATE_FORM = {
  origin: "race" as NpcOrigin,
  buildMode: "simple" as NpcBuildMode,
  sourceId: "",
  name: "",
  roleLabel: "",
  personalityDescription: "",
  notes: "",
};

function lifecycleKind(npc: NpcArchiveRecord): "race-npc" | "creature-npc" {
  return npc.npcKind === "creature" ? "creature-npc" : "race-npc";
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function NpcWorkspace({
  campaigns,
  isAdmin,
}: {
  campaigns: NpcCampaignSummary[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preserveScroll = useInPlaceScrollPreservation();
  const createDialogRef = useRef<HTMLDialogElement>(null);
  const initialCampaign = searchParams.get("campaign") ?? "";
  const initialStatus: NpcArchiveStatus = searchParams.get("status") === "archived"
    ? "archived"
    : "active";
  const requestedNpcId = Number(searchParams.get("npc"));
  const initialSimpleNpcId = Number.isSafeInteger(requestedNpcId) && requestedNpcId > 0
    ? requestedNpcId
    : null;
  const [campaignId, setCampaignId] = useState(initialCampaign);
  const [status, setStatus] = useState<NpcArchiveStatus>(initialStatus);
  const [records, setRecords] = useState<NpcArchiveRecord[]>([]);
  const [origins, setOrigins] = useState<NpcOriginOption[]>([]);
  const [search, setSearch] = useState("");
  const [sourceSearch, setSourceSearch] = useState("");
  const [creation, setCreation] = useState(EMPTY_CREATE_FORM);
  const [simpleDraft, setSimpleDraft] = useState<SimpleNpcDraft | null>(null);
  const [loading, setLoading] = useState(Boolean(initialCampaign));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function loadCampaign(nextCampaignId: number, nextStatus: NpcArchiveStatus) {
    const [nextRecords, nextOrigins] = await Promise.all([
      listNpcArchive(nextCampaignId, nextStatus),
      listNpcOrigins(nextCampaignId),
    ]);
    setRecords(nextRecords);
    setOrigins(nextOrigins);
  }

  useEffect(() => {
    if (!initialCampaign) return;
    let active = true;
    Promise.all([
      listNpcArchive(Number(initialCampaign), initialStatus),
      listNpcOrigins(Number(initialCampaign)),
      initialSimpleNpcId === null ? Promise.resolve(null) : getSimpleNpc(initialSimpleNpcId),
    ])
      .then(([nextRecords, nextOrigins, requestedSimpleNpc]) => {
        if (!active) return;
        setRecords(nextRecords);
        setOrigins(nextOrigins);
        if (requestedSimpleNpc) {
          if (
            requestedSimpleNpc.campaignId !== Number(initialCampaign)
            || requestedSimpleNpc.status !== initialStatus
          ) {
            throw new Error("The requested Simple NPC is not in this Campaign archive.");
          }
          setSimpleDraft(requestedSimpleNpc);
        }
      })
      .catch((error) => {
        if (active) setFeedback({ kind: "error", message: messageFrom(error, "NPC archive could not be loaded.") });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // The initial URL context is intentionally read once; later changes stay in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCampaign = campaigns.find(({ id }) => String(id) === campaignId) ?? null;
  const matchingOrigins = useMemo(() => origins.filter((entry) => (
    entry.origin === creation.origin
    && (!sourceSearch.trim() || [entry.name, entry.detail].some((value) => (
      value.toLocaleLowerCase("en-US").includes(sourceSearch.trim().toLocaleLowerCase("en-US"))
    )))
  )), [creation.origin, origins, sourceSearch]);
  const visibleNpcs = useMemo(() => records.filter((npc) => matchesNpcSearch({
    name: npc.name,
    roleLabel: npc.roleLabel,
    sourceName: npc.sourceName,
  }, search)), [records, search]);

  async function refresh(nextStatus = status): Promise<void> {
    if (!campaignId) return;
    setLoading(true);
    try {
      setRecords(await listNpcArchive(Number(campaignId), nextStatus));
    } finally {
      setLoading(false);
    }
  }

  async function changeCampaign(nextCampaignId: string): Promise<void> {
    await preserveScroll(async () => {
      setCampaignId(nextCampaignId);
      setStatus("active");
      setSearch("");
      setRecords([]);
      setOrigins([]);
      setSimpleDraft(null);
      setFeedback(null);
      if (!nextCampaignId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        await loadCampaign(Number(nextCampaignId), "active");
      } catch (error) {
        setFeedback({ kind: "error", message: messageFrom(error, "NPC archive could not be loaded.") });
      } finally {
        setLoading(false);
      }
    });
  }

  async function changeStatus(nextStatus: NpcArchiveStatus): Promise<void> {
    await preserveScroll(async () => {
      if (!campaignId || nextStatus === status) return;
      setStatus(nextStatus);
      setSimpleDraft(null);
      setFeedback(null);
      setLoading(true);
      try {
        setRecords(await listNpcArchive(Number(campaignId), nextStatus));
      } catch (error) {
        setFeedback({ kind: "error", message: messageFrom(error, "NPC archive could not be loaded.") });
      } finally {
        setLoading(false);
      }
    });
  }

  function openCreator(): void {
    void preserveScroll(() => {
      setCreation(EMPTY_CREATE_FORM);
      setSourceSearch("");
      setFeedback(null);
      createDialogRef.current?.showModal();
    });
  }

  function closeCreator(): void {
    void preserveScroll(() => createDialogRef.current?.close());
  }

  async function submitCreation(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!campaignId) return;
    await preserveScroll(async () => {
      setBusy(true);
      setFeedback(null);
      try {
        const created = await createNpc({
          campaignId: Number(campaignId),
          origin: creation.origin,
          buildMode: creation.buildMode,
          sourceId: Number(creation.sourceId),
          name: creation.name,
          roleLabel: creation.roleLabel,
          personalityDescription: creation.personalityDescription,
          notes: creation.notes,
        });
        createDialogRef.current?.close();
        if (created.href) {
          router.push(created.href);
          return;
        }
        setStatus("active");
        setSearch("");
        await refresh("active");
        setSimpleDraft(await getSimpleNpc(created.characterId));
        setFeedback({ kind: "success", message: `${creation.name.trim()} was created as a Simple NPC.` });
      } catch (error) {
        setFeedback({ kind: "error", message: messageFrom(error, "NPC could not be created.") });
      } finally {
        setBusy(false);
      }
    });
  }

  async function openSimple(npcId: number): Promise<void> {
    await preserveScroll(async () => {
      setBusy(true);
      setFeedback(null);
      try {
        setSimpleDraft(await getSimpleNpc(npcId));
      } catch (error) {
        setFeedback({ kind: "error", message: messageFrom(error, "Simple NPC could not be opened.") });
      } finally {
        setBusy(false);
      }
    });
  }

  async function saveSimple(): Promise<void> {
    if (!simpleDraft) return;
    await preserveScroll(async () => {
      setBusy(true);
      setFeedback(null);
      try {
        const saved = await saveSimpleNpc(simpleDraft);
        setSimpleDraft(saved);
        await refresh(status);
        setFeedback({ kind: "success", message: `${saved.name} was saved.` });
      } catch (error) {
        setFeedback({ kind: "error", message: messageFrom(error, "Simple NPC could not be saved.") });
      } finally {
        setBusy(false);
      }
    });
  }

  async function upgradeSimple(): Promise<void> {
    if (!simpleDraft) return;
    await preserveScroll(async () => {
      setBusy(true);
      setFeedback(null);
      try {
        const result = await upgradeNpcToDetailed(simpleDraft.id);
        if (!result.href) throw new Error("The detailed NPC editor route is unavailable.");
        router.push(result.href);
      } catch (error) {
        setFeedback({ kind: "error", message: messageFrom(error, "NPC could not be upgraded.") });
        setBusy(false);
      }
    });
  }

  async function lifecycleCompleted(
    npc: NpcArchiveRecord,
    action: "archive" | "restore" | "delete",
  ): Promise<void> {
    await preserveScroll(async () => {
      if (simpleDraft?.id === npc.id) setSimpleDraft(null);
      await refresh(status);
      setFeedback({
        kind: "success",
        message: action === "delete"
          ? `${npc.name} was permanently deleted.`
          : `${npc.name} was ${action === "archive" ? "archived" : "restored"}.`,
      });
    });
  }

  return <main className="npcs-page">
    <header className="npcs-header">
      <Link href="/heavens" className="font-evanescent npcs-logo">SERRIAN<br />TIDE</Link>
      <div><p>THE HEAVENS / NPCS</p><h1 className="font-sans">NPC Master Sheet</h1><span>Create, find, edit, archive, and restore Campaign NPCs.</span></div>
      <nav><Link href="/heavens">← The Heavens</Link></nav>
    </header>

    <aside
      className={`npcs-scope-banner ${isAdmin ? "is-admin" : "is-god"}`}
      aria-label="NPC campaign scope"
    >
      <div>
        <p>{isAdmin ? "ADMINISTRATOR SITE-WIDE SCOPE" : "G.O.D. OWNER SCOPE"}</p>
        <h2 className="font-sans">
          {isAdmin ? "NPCs across all Campaigns" : "NPCs in Campaigns you own"}
        </h2>
      </div>
      <span>
        {isAdmin
          ? "You can select and manage NPCs in active or archived Campaigns. The Administrator override does not change who owns each Campaign."
          : "Only active Campaigns you own are listed. Other G.O.D.s' Campaigns remain outside your scope."}
      </span>
    </aside>

    {feedback ? <p className={`npcs-feedback is-${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</p> : null}

    <section className="npcs-control">
      <div><p>CAMPAIGN CONTEXT</p><h2 className="font-sans">Choose the NPC archive</h2></div>
      <label><span>Campaign</span><select value={campaignId} onChange={(event) => void changeCampaign(event.target.value)}><option value="">No Campaign Selected</option>{campaigns.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.archived ? " [Archived]" : ""}{isAdmin && entry.ownerLabel ? ` — Owner: ${entry.ownerLabel}` : ""}</option>)}</select></label>
      <button type="button" disabled={!campaignId || busy || selectedCampaign?.archived} onClick={openCreator}>Create NPC</button>
    </section>

    <section className="npcs-master">
      <header>
        <div><p>MASTER NPC INDEX</p><h2 className="font-sans">{selectedCampaign?.name ?? "Select a Campaign"}</h2><span>{campaignId ? `${records.length} ${status} NPC records` : "NPCs live inside their Campaign."}</span></div>
        <div className="npcs-index-tools">
          <div className="npcs-segmented" aria-label="NPC archive status">
            <button type="button" aria-pressed={status === "active"} onClick={() => void changeStatus("active")} disabled={!campaignId || loading}>Active</button>
            <button type="button" aria-pressed={status === "archived"} onClick={() => void changeStatus("archived")} disabled={!campaignId || loading}>Archived</button>
          </div>
          <input type="search" disabled={!campaignId} aria-label="Search NPCs" placeholder="Search name, role, or source" value={search} onChange={(event) => void preserveScroll(() => setSearch(event.target.value))} />
        </div>
      </header>
      {!campaignId ? <div className="npcs-empty"><strong>No Campaign Selected</strong><span>Choose a Campaign above.</span></div>
        : loading ? <div className="npcs-empty"><strong>Reading NPCs…</strong></div>
          : visibleNpcs.length ? <div className="npcs-grid" data-preserve-scroll="npc-archive-grid">{visibleNpcs.map((npc) => {
            const detailedHref = getDetailedNpcHref({ campaignId: npc.campaignId, characterId: npc.id, origin: npc.npcKind });
            return <article key={npc.id} className="npcs-card">
              <header><span>NPC-{String(npc.id).padStart(4, "0")}</span><span className={`npcs-status is-${npc.status}`}>{npc.status}</span></header>
              <strong>{npc.name}</strong>
              <p>{npc.roleLabel || "No role label"}</p>
              <dl><div><dt>Kind</dt><dd>{npc.npcKind === "creature" ? "Creature NPC" : "Race NPC"}</dd></div><div><dt>Build</dt><dd>{npc.buildMode === "simple" ? "Simple" : "Detailed"}</dd></div><div><dt>Source</dt><dd>{npc.sourceName}</dd></div></dl>
              {npc.archiveReason ? <small>Archive note: {npc.archiveReason}</small> : null}
              <footer>
                {npc.buildMode === "simple"
                  ? <button type="button" disabled={busy} onClick={() => void openSimple(npc.id)}>Open Simple Editor</button>
                  : <Link href={detailedHref}>Open Detailed Editor</Link>}
                <LifecycleControls
                  target={{ entityKind: lifecycleKind(npc), entityId: npc.id }}
                  archived={npc.status === "archived"}
                  disabled={busy}
                  onCompleted={({ action }) => lifecycleCompleted(npc, action)}
                />
              </footer>
            </article>;
          })}</div>
            : <div className="npcs-empty"><strong>{search ? "No Matching NPCs" : `No ${status === "active" ? "Active" : "Archived"} NPCs`}</strong><span>{search ? "Try a different name, role, or source." : status === "active" ? "Create the first NPC for this Campaign." : "Archived NPCs remain available here."}</span></div>}
    </section>

    {simpleDraft ? <section className="npcs-simple-editor" aria-labelledby="simple-npc-heading">
      <header><div><p>COMPACT NPC RECORD</p><h2 id="simple-npc-heading" className="font-sans">{simpleDraft.name}</h2><span>{simpleDraft.sourceName} · {simpleDraft.status === "archived" ? "Archived and read-only" : "Simple NPC"}</span></div><button type="button" onClick={() => void preserveScroll(() => setSimpleDraft(null))}>Close</button></header>
      {simpleDraft.status === "archived" ? <p className="npcs-readonly-note">Restore this NPC before saving or upgrading it.</p> : null}
      <div className="npcs-form-grid">
        <label><span>Name</span><input disabled={simpleDraft.status === "archived"} value={simpleDraft.name} onChange={(event) => setSimpleDraft({ ...simpleDraft, name: event.target.value })} /></label>
        <label><span>Role / Label</span><input disabled={simpleDraft.status === "archived"} value={simpleDraft.roleLabel} onChange={(event) => setSimpleDraft({ ...simpleDraft, roleLabel: event.target.value })} /></label>
        <label><span>Origin</span><input disabled value={`${simpleDraft.npcKind === "creature" ? "Creature" : "Race"}: ${simpleDraft.sourceName}`} /></label>
        <label className="is-wide"><span>Short Personality / Description</span><textarea rows={3} disabled={simpleDraft.status === "archived"} value={simpleDraft.personalityDescription} onChange={(event) => setSimpleDraft({ ...simpleDraft, personalityDescription: event.target.value })} /></label>
        <label className="is-wide"><span>Notes</span><textarea rows={4} disabled={simpleDraft.status === "archived"} value={simpleDraft.notes} onChange={(event) => setSimpleDraft({ ...simpleDraft, notes: event.target.value })} /></label>
      </div>
      <footer>
        <span>Upgrade is one-way. It preserves this record and opens the full editor.</span>
        <div><button type="button" disabled={busy || simpleDraft.status === "archived"} onClick={() => void saveSimple()}>{busy ? "Working…" : "Save Simple NPC"}</button><button type="button" disabled={busy || simpleDraft.status === "archived"} onClick={() => void upgradeSimple()}>Upgrade to Detailed</button></div>
      </footer>
    </section> : null}

    <dialog ref={createDialogRef} className="npcs-dialog" aria-labelledby="create-npc-heading" onCancel={(event) => { event.preventDefault(); closeCreator(); }}>
      <form onSubmit={(event) => void submitCreation(event)}>
        <header><div><p>NEW CAMPAIGN NPC</p><h2 id="create-npc-heading" className="font-sans">Choose a source and build depth</h2></div><button type="button" onClick={closeCreator}>Close</button></header>
        <div className="npcs-dialog-body">
          <fieldset><legend>Origin</legend><label><input type="radio" name="npc-origin" value="race" checked={creation.origin === "race"} onChange={() => void preserveScroll(() => setCreation({ ...creation, origin: "race", sourceId: "" }))} /> Race</label><label><input type="radio" name="npc-origin" value="creature" checked={creation.origin === "creature"} onChange={() => void preserveScroll(() => setCreation({ ...creation, origin: "creature", sourceId: "" }))} /> Creature</label></fieldset>
          <fieldset><legend>Build Mode</legend><label><input type="radio" name="npc-build-mode" value="simple" checked={creation.buildMode === "simple"} onChange={() => void preserveScroll(() => setCreation({ ...creation, buildMode: "simple" }))} /> Simple</label><label><input type="radio" name="npc-build-mode" value="detailed" checked={creation.buildMode === "detailed"} onChange={() => void preserveScroll(() => setCreation({ ...creation, buildMode: "detailed" }))} /> Detailed</label></fieldset>
          <label><span>Find Source Master</span><input type="search" value={sourceSearch} placeholder={`Search ${creation.origin === "race" ? "Campaign Races" : "master Creatures"}`} onChange={(event) => void preserveScroll(() => setSourceSearch(event.target.value))} /></label>
          <label><span>Source Master</span><select required value={creation.sourceId} onChange={(event) => setCreation({ ...creation, sourceId: event.target.value })}><option value="">Choose {creation.origin === "race" ? "Race" : "Creature"}</option>{matchingOrigins.map((entry) => <option key={`${entry.origin}-${entry.id}`} value={entry.id}>{entry.name} · {entry.detail}</option>)}</select></label>
          <label><span>NPC Name</span><input required value={creation.name} onChange={(event) => setCreation({ ...creation, name: event.target.value })} /></label>
          <label><span>Role / Label</span><input required placeholder="Innkeeper, guide, rival…" value={creation.roleLabel} onChange={(event) => setCreation({ ...creation, roleLabel: event.target.value })} /></label>
          {creation.buildMode === "simple" ? <><label><span>Short Personality / Description</span><textarea rows={3} value={creation.personalityDescription} onChange={(event) => setCreation({ ...creation, personalityDescription: event.target.value })} /></label><label><span>Notes</span><textarea rows={3} value={creation.notes} onChange={(event) => setCreation({ ...creation, notes: event.target.value })} /></label></> : null}
        </div>
        <footer><span>{creation.buildMode === "detailed" ? "The full existing editor opens after creation." : "The compact editor opens in this archive."}</span><button type="submit" disabled={busy || !creation.sourceId}>{busy ? "Creating…" : `Create ${creation.buildMode === "simple" ? "Simple" : "Detailed"} NPC`}</button></footer>
      </form>
    </dialog>

  </main>;
}
