"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  CAMPAIGN_SETTINGS_TABS,
  getCampaignControlHref,
  type CampaignSettingsTab,
} from "@/features/campaigns/campaign-workflow";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";
import {
  getCampaignAdmin,
  getCampaignReferenceData,
  saveCampaignAdmin,
  type CampaignAdminDraft,
  type CampaignAdminSummary,
  type CampaignReferenceData,
} from "./actions";
import { CampaignInventorySelector } from "./campaign-inventory-selector";

const SYSTEMS = ["Tier 1", "Tier 2", "Tier 3", "Spellcraft", "Talismanism", "Faith", "Psyonics", "Special Abilities", "Bardic Resonance", "Derived Abilities"] as const;

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "campaign-field campaign-field--wide" : "campaign-field"}><span>{label}</span>{children}</label>;
}

export function CampaignWorkspace({
  initialCampaigns,
  initialCampaignId,
}: {
  initialCampaigns: CampaignAdminSummary[];
  initialCampaignId: number | null;
}) {
  const [campaigns] = useState(initialCampaigns);
  const [selectedId, setSelectedId] = useState<number | null>(initialCampaignId);
  const [draft, setDraft] = useState<CampaignAdminDraft | null>(null);
  const [references, setReferences] = useState<CampaignReferenceData | null>(null);
  const [tab, setTab] = useState<CampaignSettingsTab>("rules");
  const [loading, setLoading] = useState(Boolean(initialCampaignId));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [raceSearch, setRaceSearch] = useState("");
  const preserveScroll = useInPlaceScrollPreservation();

  useEffect(() => {
    if (!initialCampaignId) return;
    let active = true;
    Promise.all([
      getCampaignAdmin(initialCampaignId),
      getCampaignReferenceData(initialCampaignId),
    ])
      .then(([nextDraft, nextRefs]) => {
        if (!active) return;
        setDraft(nextDraft);
        setReferences(nextRefs);
        setDirty(false);
        setTab("rules");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setFeedback({
          kind: "error",
          message: error instanceof Error ? error.message : "Campaign could not be loaded.",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialCampaignId]);

  async function openCampaign(id: number) {
    if (dirty && !window.confirm("Discard unsaved Campaign changes?")) return;
    await preserveScroll(async () => {
      setSelectedId(id);
      setLoading(true);
      setFeedback(null);
      try {
        const [nextDraft, nextRefs] = await Promise.all([
          getCampaignAdmin(id),
          getCampaignReferenceData(id),
        ]);
        setDraft(nextDraft);
        setReferences(nextRefs);
        setDirty(false);
        setTab("rules");
      } catch (error) {
        setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Campaign could not be loaded." });
      } finally { setLoading(false); }
    });
  }

  function change(next: CampaignAdminDraft) {
    setDraft(next);
    setDirty(true);
    setFeedback(null);
  }

  async function persist() {
    if (!draft) return;
    await preserveScroll(async () => {
      setSaving(true);
      setFeedback(null);
      try {
        const saved = await saveCampaignAdmin(draft);
        setDraft(saved);
        setDirty(false);
        setFeedback({ kind: "success", message: `${saved.name} was saved.` });
      } catch (error) {
        setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Campaign could not be saved." });
      } finally { setSaving(false); }
    });
  }

  const filteredRaces = useMemo(() => references?.races.filter((race) => !raceSearch || race.name.toLowerCase().includes(raceSearch.toLowerCase())) ?? [], [references, raceSearch]);

  return <main className="campaign-page">
    <header className="campaign-header"><Link href={getCampaignControlHref({ campaignId: selectedId })} className="font-evanescent campaign-logo">SERRIAN<br />TIDE</Link><div><p>THE HEAVENS / CAMPAIGN SETTINGS</p><h1 className="font-sans">Edit Campaign</h1><span>Creator-owned rules, access, currency, and authorized content.</span></div><nav><Link href={getCampaignControlHref({ campaignId: selectedId })}>← Return to Campaign Control</Link><Link className="is-primary" href="/heavens/campaigns/new">New Campaign</Link></nav></header>
    {feedback ? <p className={`campaign-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
    <div className="campaign-workspace">
      <aside className="campaign-library"><header><p>YOUR WORLDS</p><h2>Campaign Library</h2></header><div>{campaigns.map((entry) => <button key={entry.id} type="button" className={selectedId === entry.id ? "is-selected" : ""} onClick={() => void openCampaign(entry.id)}><strong>{entry.name}</strong><span>{entry.playerCount} Players · {entry.characterCount} Characters · {entry.npcCount} NPCs</span><small>{entry.currencySystem}</small></button>)}{!campaigns.length ? <p>No Campaigns yet.</p> : null}</div></aside>
      {loading ? <section className="campaign-editor campaign-empty"><p>LOADING CAMPAIGN SETTINGS</p></section> : draft && references ? <section className="campaign-editor"><header className="campaign-editor-header"><div><p>CAMPAIGN {draft.id}</p><h2>{draft.name}</h2><span>{dirty ? "Unsaved changes" : "Saved"}</span></div><button type="button" disabled={saving || !dirty} onClick={() => void persist()}>{saving ? "Saving…" : "Save Campaign"}</button></header><nav className="campaign-tabs">{CAMPAIGN_SETTINGS_TABS.map((entry) => <button key={entry.id} type="button" className={tab === entry.id ? "is-active" : ""} onClick={() => void preserveScroll(() => setTab(entry.id))}>{entry.label}</button>)}</nav><div className="campaign-editor-content">
        {tab === "rules" ? <Rules draft={draft} onChange={change} /> : null}
        {tab === "races" ? <Races draft={draft} races={filteredRaces} search={raceSearch} onSearch={setRaceSearch} onChange={change} /> : null}
        {tab === "inventory" ? <CampaignInventorySelector key={draft.id} campaignId={draft.id} tags={references.tags} selectedTagIds={draft.inventoryTagIds} selectedItemIds={draft.inventoryItemIds} onSelectedTagIdsChange={(inventoryTagIds) => void preserveScroll(() => change({ ...draft, inventoryTagIds }))} onSelectedItemIdsChange={(inventoryItemIds) => void preserveScroll(() => change({ ...draft, inventoryItemIds }))} /> : null}
      </div></section> : <section className="campaign-editor campaign-empty"><p>CAMPAIGN SETTINGS</p><h2>Select a Campaign to edit, or create a new one.</h2></section>}
    </div>
  </main>;
}

function Rules({ draft, onChange }: { draft: CampaignAdminDraft; onChange: (draft: CampaignAdminDraft) => void }) {
  const set = (update: Partial<CampaignAdminDraft>) => onChange({ ...draft, ...update });
  const preserveScroll = useInPlaceScrollPreservation();
  return <div className="campaign-section"><div className="campaign-form-grid"><Field label="Campaign Name" wide><input value={draft.name} onChange={(e) => set({ name: e.target.value })} /></Field><Field label="Campaign Overview" wide><textarea rows={8} className="min-h-40 w-full resize-y rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm leading-6 text-slate-100 outline-none focus:border-amber-300/50" value={draft.overview} onChange={(e) => set({ overview: e.target.value })} /><small className="mt-2 block text-xs leading-5 text-slate-400">Player-visible introduction to the Campaign, its setting, premise, tone, and starting context.</small></Field><Field label="Attribute Points"><input type="number" min={0} value={draft.attributePoints} onChange={(e) => set({ attributePoints: Number(e.target.value) })} /></Field><Field label="Skill Points"><input type="number" min={0} value={draft.skillPoints} onChange={(e) => set({ skillPoints: Number(e.target.value) })} /></Field><Field label="Max Starting Points per Skill"><input type="number" min={0} value={draft.maxStartingSkill} onChange={(e) => set({ maxStartingSkill: Number(e.target.value) })} /></Field><Field label="Points to Unlock Next Tier"><input type="number" min={0} value={draft.pointsToUnlockNextTier} onChange={(e) => set({ pointsToUnlockNextTier: Number(e.target.value) })} /></Field><Field label="Max Points in Standard Skill"><input type="number" min={0} value={draft.maxPointsInSkill} onChange={(e) => set({ maxPointsInSkill: Number(e.target.value) })} /></Field><Field label="Starting Credits"><input type="number" min={0} value={draft.startingCreditAmount} onChange={(e) => set({ startingCreditAmount: Number(e.target.value) })} /></Field><Field label="Fate Method"><select value={draft.fatePointMethod} onChange={(e) => set({ fatePointMethod: e.target.value as CampaignAdminDraft["fatePointMethod"] })}><option>Assigned</option><option>Rolled</option></select></Field>{draft.fatePointMethod === "Assigned" ? <Field label="Assigned Fate Points"><input type="number" min={0} step={1} value={draft.assignedFatePoints ?? 0} onChange={(e) => set({ assignedFatePoints: Math.max(0, Math.trunc(Number(e.target.value))) })} /></Field> : null}<Field label="Currency System"><select value={draft.currencySystem} onChange={(e) => set({ currencySystem: e.target.value as CampaignAdminDraft["currencySystem"] })}><option>Credits</option><option>Derived Currency</option></select></Field></div>
    <SectionHeading eyebrow="RULE AVAILABILITY" title="Allowed Systems" /><div className="campaign-check-grid">{SYSTEMS.map((system) => <label key={system} className={draft.allowedSystems.includes(system) ? "is-selected" : ""}><input type="checkbox" checked={draft.allowedSystems.includes(system)} onChange={(e) => set({ allowedSystems: e.target.checked ? [...draft.allowedSystems, system] : draft.allowedSystems.filter((entry) => entry !== system) })} /><span>{system}</span></label>)}</div>
    {draft.currencySystem === "Derived Currency" ? <><SectionHeading eyebrow="DENOMINATIONS" title="Derived Currencies" action="Add Currency" onAction={() => set({ derivedCurrencies: [...draft.derivedCurrencies, { name: "", description: "", creditsPerUnit: 1 }] })} /><div className="campaign-currency-list">{draft.derivedCurrencies.map((currency, index) => <article key={currency.id ?? `new-${index}`}><input placeholder="Name" value={currency.name} onChange={(e) => set({ derivedCurrencies: draft.derivedCurrencies.map((entry, i) => i === index ? { ...entry, name: e.target.value } : entry) })} /><input placeholder="Description" value={currency.description} onChange={(e) => set({ derivedCurrencies: draft.derivedCurrencies.map((entry, i) => i === index ? { ...entry, description: e.target.value } : entry) })} /><input type="number" min={0.000001} step="any" value={currency.creditsPerUnit} onChange={(e) => set({ derivedCurrencies: draft.derivedCurrencies.map((entry, i) => i === index ? { ...entry, creditsPerUnit: Number(e.target.value) } : entry) })} /><button type="button" onClick={() => void preserveScroll(() => set({ derivedCurrencies: draft.derivedCurrencies.filter((_, i) => i !== index) }))}>Remove</button></article>)}</div></> : null}
  </div>;
}

function Races({ draft, races, search, onSearch, onChange }: { draft: CampaignAdminDraft; races: CampaignReferenceData["races"]; search: string; onSearch: (value: string) => void; onChange: (draft: CampaignAdminDraft) => void }) {
  return <div className="campaign-section"><SectionHeading eyebrow="CHARACTER CREATION" title="Allowed Races" /><input className="campaign-search" type="search" value={search} placeholder="Search Races" onChange={(e) => onSearch(e.target.value)} /><div className="campaign-selection-list">{races.map((race) => <label key={race.id} className={draft.allowedRaceIds.includes(race.id) ? "is-selected" : ""}><input type="checkbox" checked={draft.allowedRaceIds.includes(race.id)} onChange={(e) => onChange({ ...draft, allowedRaceIds: e.target.checked ? [...draft.allowedRaceIds, race.id] : draft.allowedRaceIds.filter((id) => id !== race.id) })} /><div><strong>{race.name}</strong><span>{race.size}</span></div></label>)}</div></div>;
}

function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  const preserveScroll = useInPlaceScrollPreservation();
  return <header className="campaign-section-heading"><div><p>{eyebrow}</p><h3 className="font-sans">{title}</h3></div>{action && onAction ? <button type="button" onClick={() => void preserveScroll(onAction)}>{action}</button> : null}</header>;
}
