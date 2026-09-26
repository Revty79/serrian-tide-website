"use client";

import { Field, formatCreatureNumber, SectionHeading, Stats, HpAndLocations, Combat, Special } from "./creature-mechanics-editors";
import { CreatureFormsEditor } from "./creature-forms-editor";


import { CreatureHarvestUtilityEditor } from "@/app/heavens/creatures/creature-authoring-editor";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { LifecycleControls } from "@/app/heavens/lifecycle-controls";
import { CREATURE_SIZE_OPTIONS } from "@/db/creature-schema";
import {
  calculateCreatureChallengeRating,
  getCreatureKillXpForChallengeRating,
} from "@/features/creatures/challenge-rating";
import {
  resolveEffectiveCreatureStatistics,
} from "@/features/creatures/creature-size-rules";
import { createCreatureDraftCanonicalId } from "@/features/creatures/creature-canonical-ids";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

import {
  createDerivedCreature,
  getCreature,
  listChallengeRatingReferences,
  listCreatureFacets,
  listCreatures,
  saveCreature,
  type ChallengeRatingReference,
  type CreatureAggregate,
  type CreatureDraft,
  type CreatureFacets,
  type CreatureLibraryFilters,
  type CreatureLibraryResult,
  type CreatureSummary,
} from "./actions";

type Tab = "overview" | "stats" | "hp" | "combat" | "special" | "cr" | "preview" | "forms";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "stats", label: "Stats & Movement" },
  { id: "hp", label: "Health & Protection" },
  { id: "combat", label: "Combat" },
  { id: "special", label: "Abilities & Defenses" },
  { id: "forms", label: "Forms" },
  { id: "cr", label: "Variants & CR" },
  { id: "preview", label: "Preview" },
];

const ATTRIBUTES = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];

function newCreatureDraft(references: ChallengeRatingReference[]): CreatureDraft {
  return {
    core: {
      canonicalId: createCreatureDraftCanonicalId("CREATURE"),
      canonicalName: "",
      family: "",
      creatureType: "",
      size: "Medium",
      hpMultiplierSteps: 0,
      totalHp: null,
      baseMovementSteps: 0,
      baseMagicSteps: 0,
      challengeRating: 1,
      killXp: getCreatureKillXpForChallengeRating(1, references),
      parentCreatureId: null,
      parentCreatureName: null,
      calculatedChallengeRating: 1,
      challengeRatingAdjustment: 0,
      challengeRatingAdjustmentReason: "",
      description: "",
      typicalBehavior: "",
      habitatEcology: "",
      notes: "",
      sourceSystem: null,
    },
    attributes: ATTRIBUTES.map((attributeKey, sortOrder) => ({ attributeKey, value: null, notes: "", sortOrder })),
    movement: [],
    hpPools: [],
    hitLocations: [],
    attacks: [],
    skillLinks: [],
    abilities: [],
    defenses: [],
    uses: [],
    derivedCreatures: [],
  };
}

export function CreatureWorkspace({
  initialLibrary,
  initialFacets,
  initialReferences,
  username,
}: {
  initialLibrary: CreatureLibraryResult;
  initialFacets: CreatureFacets;
  initialReferences: ChallengeRatingReference[];
  username: string;
}) {
  const [filters, setFilters] = useState<CreatureLibraryFilters>({ page: 1, pageSize: 40 });
  const [library, setLibrary] = useState(initialLibrary);
  const [facets, setFacets] = useState(initialFacets);
  const [references, setReferences] = useState(initialReferences);
  const [draft, setDraft] = useState<CreatureDraft | CreatureAggregate | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [dirty, setDirty] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pending, setPending] = useState<{ kind: "open"; creature: CreatureSummary } | { kind: "new" } | null>(null);
  const preserveScroll = useInPlaceScrollPreservation();
  const archivedAt = draft && "archivedAt" in draft ? draft.archivedAt : null;
  const archiveReason = draft && "archiveReason" in draft ? draft.archiveReason : "";
  const isArchived = Boolean(archivedAt);
  const liveChallengeRating = useMemo(() => {
    if (!draft) return { draft: null, error: null };
    try {
      const calculation = calculateCreatureChallengeRating(draft, references);
      return {
        draft: {
          ...draft,
          core: {
            ...draft.core,
            calculatedChallengeRating: calculation.calculatedRating,
            challengeRating: calculation.finalRating,
            killXp: calculation.killXp,
          },
        },
        error: null,
      };
    } catch (error) {
      return {
        draft,
        error: error instanceof Error ? error.message : "Creature CR reward data is unavailable.",
      };
    }
  }, [draft, references]);

  const loadLibrary = useCallback(async (next: CreatureLibraryFilters) => {
    setLoadingLibrary(true);
    try {
      setLibrary(await listCreatures(next));
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Creature Library could not be loaded." });
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void preserveScroll(() => loadLibrary(filters)), 180);
    return () => window.clearTimeout(timer);
  }, [filters, loadLibrary, preserveScroll]);

  async function refreshReferences() {
    const [nextFacets, nextReferences] = await Promise.all([listCreatureFacets(Boolean(filters.archived)), listChallengeRatingReferences()]);
    setFacets(nextFacets);
    setReferences(nextReferences);
  }

  async function openCreature(summary: CreatureSummary) {
    await preserveScroll(async () => {
      setLoadingEditor(true);
      setFeedback(null);
      try {
        const aggregate = await getCreature(summary.id);
        if (!aggregate) throw new Error("Creature not found.");
        setDraft(aggregate);
        setDirty(false);
        setActiveTab("overview");
      } catch (error) {
        setFeedback({ kind: "error", message: error instanceof Error ? error.message : "That Creature could not be loaded." });
      } finally {
        setLoadingEditor(false);
      }
    });
  }

  function chooseCreature(summary: CreatureSummary) {
    if (dirty) void preserveScroll(() => setPending({ kind: "open", creature: summary }));
    else void openCreature(summary);
  }

  function createNew() {
    try {
      setDraft(newCreatureDraft(references));
      setFilters((current) => ({ ...current, archived: false, page: 1 }));
      setDirty(false);
      setActiveTab("overview");
      setFeedback(null);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Creature CR reward data is unavailable." });
    }
  }

  function beginNew() {
    if (dirty) void preserveScroll(() => setPending({ kind: "new" }));
    else void preserveScroll(createNew);
  }

  function discardAndContinue() {
    const next = pending;
    setPending(null);
    if (!next) return;
    if (next.kind === "new") createNew();
    else void openCreature(next.creature);
  }

  function change(next: CreatureDraft) {
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
        const saved = await saveCreature(draft);
        setDraft(saved);
        setDirty(false);
        setFeedback({ kind: "success", message: `${saved.core.canonicalName} was saved.` });
        await Promise.all([loadLibrary(filters), refreshReferences()]);
      } catch (error) {
        setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Creature could not be saved." });
      } finally {
        setSaving(false);
      }
    });
  }

  function changeArchiveView(archived: boolean) {
    void preserveScroll(async () => {
      setFilters((current) => ({ ...current, archived, page: 1 }));
      setDraft(null);
      setDirty(false);
      setFeedback(null);
      try {
        setFacets(await listCreatureFacets(archived));
      } catch (error) {
        setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Creature filters could not be loaded." });
      }
    });
  }

  async function lifecycleCompleted(event: { action: "archive" | "restore" | "delete" }) {
    const name = draft?.core.canonicalName || "Creature";
    setDraft(null);
    setDirty(false);
    setFeedback({
      kind: "success",
      message: event.action === "archive"
        ? `${name} was archived.`
        : event.action === "restore"
          ? `${name} was restored.`
          : `${name} was permanently deleted.`,
    });
    await Promise.all([loadLibrary(filters), refreshReferences()]);
  }

  return <main className="skills-page creatures-page">
    <header className="skills-page__header">
      <div className="skills-page__brand"><Link href="/heavens" className="font-evanescent creature-brand">SERRIAN<br />TIDE</Link></div>
      <div className="skills-page__title"><p>THE HEAVENS / CREATURES</p><h1>Creatures</h1><span>G.O.D. archive · {username}</span></div>
      <div className="skills-page__navigation"><Link href="/heavens">Back to The Heavens</Link></div>
    </header>

    <div className="skills-workspace creatures-workspace">
      {feedback ? <p className={`skill-editor__feedback creature-workspace__feedback is-${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</p> : null}
      <aside className="skill-library">
        <div className="skill-library__heading"><div><p>MASTER CONTENT</p><h2>Bestiary</h2></div><button className="skills-primary-button" type="button" onClick={beginNew}>New Creature</button></div>
        <div className="skill-library__search"><label htmlFor="creature-search">Search</label><input id="creature-search" type="search" value={filters.search ?? ""} placeholder="Search by name" onChange={(event) => setFilters({ ...filters, search: event.target.value, page: 1 })} /></div>
        <div className="skill-library__filters creature-library-filters">
          <label><span>Family</span><select value={filters.family ?? ""} onChange={(e) => setFilters({ ...filters, family: e.target.value || undefined, page: 1 })}><option value="">All</option>{facets.families.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Type</span><select value={filters.creatureType ?? ""} onChange={(e) => setFilters({ ...filters, creatureType: e.target.value || undefined, page: 1 })}><option value="">All</option>{facets.creatureTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Size</span><select value={filters.size ?? ""} onChange={(e) => setFilters({ ...filters, size: e.target.value as CreatureLibraryFilters["size"], page: 1 })}><option value="">All</option>{CREATURE_SIZE_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>CR</span><select value={filters.challengeRating ?? ""} onChange={(e) => setFilters({ ...filters, challengeRating: e.target.value ? Number(e.target.value) : null, page: 1 })}><option value="">All</option>{references.map((row) => <option key={row.challengeRating} value={row.challengeRating}>{row.challengeRating}</option>)}</select></label>
        </div>
        <div className="skill-library__toolbar">
          <div className="skill-library__view-toggle" aria-label="Creature lifecycle view">
            <button type="button" className={!filters.archived ? "is-active" : ""} aria-pressed={!filters.archived} disabled={dirty} onClick={() => changeArchiveView(false)}>Active</button>
            <button type="button" className={filters.archived ? "is-active" : ""} aria-pressed={Boolean(filters.archived)} disabled={dirty} onClick={() => changeArchiveView(true)}>Archived</button>
          </div>
          <span>{library.total.toLocaleString()} creatures</span>
        </div>
        <div data-preserve-scroll="creature-library-results" className={`skill-library__results${loadingLibrary ? " is-loading" : ""}`}>
          {library.items.map((entry) => <button key={entry.id} type="button" className={`skill-library__row${draft?.id === entry.id ? " is-selected" : ""}`} onClick={() => chooseCreature(entry)}>
            <span className="skill-library__row-name">{entry.canonicalName}</span>
            {entry.archivedAt ? <span className="skill-library__row-status">Archived</span> : null}
            <span className="skill-library__row-meta">{entry.family || "Unclassified"} · {entry.creatureType || "Creature"} · {entry.size}</span>
            <span className="skill-library__row-parents">CR {entry.challengeRating ?? "?"} · {entry.killXp ?? "?"} XP</span>
          </button>)}
          {!library.items.length && !loadingLibrary ? <p className="skill-library__empty">No Creatures match this view.</p> : null}
        </div>
        <nav className="skill-library__pagination"><button type="button" disabled={library.page <= 1 || loadingLibrary} onClick={() => setFilters({ ...filters, page: library.page - 1 })}>Previous</button><span>Page {library.page} of {library.pageCount}</span><button type="button" disabled={library.page >= library.pageCount || loadingLibrary} onClick={() => setFilters({ ...filters, page: library.page + 1 })}>Next</button></nav>
      </aside>

      {loadingEditor ? <section className="skill-editor skill-editor--empty"><p>LOADING CREATURE</p></section> : draft ? <section className="skill-editor creature-editor">
        <header className="skill-editor__header"><div><p>{draft.id ? `CREATURE ${draft.id}` : "NEW CREATURE DRAFT"}</p><h2>{draft.core.canonicalName || "Untitled Creature"}</h2><span>{isArchived ? `Archived${archiveReason ? ` · ${archiveReason}` : ""}` : dirty ? "Unsaved changes" : draft.id ? "Saved" : "Not yet persisted"}</span></div><div className="skill-editor__actions">{draft.id ? <LifecycleControls target={{ entityKind: "creature", entityId: draft.id }} archived={isArchived} disabled={saving || dirty} onCompleted={lifecycleCompleted} /> : null}<button className="skills-primary-button" type="button" disabled={saving || isArchived} onClick={() => void persist()}>{saving ? "Saving…" : "Save Creature"}</button></div></header>
        {liveChallengeRating.error ? <p className="skill-editor__feedback is-error">{liveChallengeRating.error}</p> : null}
        <nav className="skill-editor__tabs">{TABS.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : ""} onClick={() => void preserveScroll(() => setActiveTab(tab.id))}>{tab.label}</button>)}</nav>
        <fieldset className="skill-editor__content creature-editor__content lifecycle-editor-fields" disabled={isArchived}>
          {activeTab === "overview" ? <Overview draft={draft} onChange={change} /> : null}
          {activeTab === "stats" ? <Stats draft={draft} onChange={change} /> : null}
          {activeTab === "hp" ? <HpAndLocations draft={draft} onChange={change} /> : null}
          {activeTab === "combat" ? <Combat draft={draft} onChange={change} /> : null}
          {activeTab === "special" ? <Special draft={draft} onChange={change} /> : null}
          {activeTab === "forms" ? <CreatureFormsEditor draft={draft} onChange={change} /> : null}
          {activeTab === "cr" ? <VariantsAndCr draft={liveChallengeRating.draft ?? draft} references={references} onChange={change} onOpen={(summary) => void openCreature(summary)} onSaved={(saved) => { setDraft(saved); setDirty(false); void loadLibrary(filters); }} /> : null}
          {activeTab === "preview" ? <Preview draft={liveChallengeRating.draft ?? draft} /> : null}
        </fieldset>
      </section> : <section className="skill-editor skill-editor--empty"><p>CREATURE EDITOR</p><h2>Select a Creature or begin a new one.</h2><span>Full bestiary aggregates open here.</span></section>}
    </div>

    {pending ? <div className="skills-page__discard-confirm"><div><p>Unsaved changes</p><span>Leave this Creature draft and discard the unsaved changes?</span></div><div className="skills-page__discard-actions"><button type="button" onClick={() => void preserveScroll(() => setPending(null))}>Keep Editing</button><button className="skills-danger-button" type="button" onClick={() => void preserveScroll(discardAndContinue)}>Discard Changes</button></div></div> : null}
  </main>;
}

function Overview({ draft, onChange }: { draft: CreatureDraft; onChange: (draft: CreatureDraft) => void }) {
  const core = draft.core;
  const setCore = (update: Partial<CreatureDraft["core"]>) => onChange({ ...draft, core: { ...core, ...update } });
  return <div className="creature-section creature-form-grid">
    <Field label="Canonical Name" wide><input value={core.canonicalName} onChange={(e) => setCore({ canonicalName: e.target.value })} /></Field>
    <Field label="Size"><select value={core.size} onChange={(e) => setCore({ size: e.target.value })}>{CREATURE_SIZE_OPTIONS.map((size) => <option key={size}>{size}</option>)}</select></Field>
    <Field label="Family"><input value={core.family} onChange={(e) => setCore({ family: e.target.value })} /></Field>
    <Field label="Creature Type"><input value={core.creatureType} onChange={(e) => setCore({ creatureType: e.target.value })} /></Field>
    {core.parentCreatureId ? <Field label="Derived From" wide><input disabled value={core.parentCreatureName ?? `Creature ${core.parentCreatureId}`} /></Field> : null}
    <Field label="Description" wide><textarea rows={6} value={core.description} onChange={(e) => setCore({ description: e.target.value })} /></Field>
    <Field label="Typical Behavior" wide><textarea rows={5} value={core.typicalBehavior} onChange={(e) => setCore({ typicalBehavior: e.target.value })} /></Field>
    <Field label="Habitat & Ecology" wide><textarea rows={5} value={core.habitatEcology} onChange={(e) => setCore({ habitatEcology: e.target.value })} /></Field>
    <Field label="Notes" wide><textarea rows={5} value={core.notes} onChange={(e) => setCore({ notes: e.target.value })} /></Field>
  <CreatureHarvestUtilityEditor uses={draft.uses} onChange={(uses) => onChange({ ...draft, uses })} /></div>;
}

function VariantsAndCr({ draft, references, onChange, onOpen, onSaved }: { draft: CreatureDraft; references: ChallengeRatingReference[]; onChange: (draft: CreatureDraft) => void; onOpen: (summary: CreatureSummary) => void; onSaved: (saved: CreatureDraft) => void }) {
  const [variantName, setVariantName] = useState("");
  const [cloning, setCloning] = useState(false);
  const preserveScroll = useInPlaceScrollPreservation();
  const core = draft.core;
  const reference = references.find(({ challengeRating }) => challengeRating === core.challengeRating);
  async function clone() {
    if (!draft.id || !variantName.trim()) return;
    const creatureId = draft.id;
    await preserveScroll(async () => {
      setCloning(true);
      try {
        const saved = await createDerivedCreature(creatureId, variantName);
        onSaved(saved);
        setVariantName("");
      } finally { setCloning(false); }
    });
  }
  return <div className="creature-section">
    <SectionHeading eyebrow="AUTOMATED THREAT MODEL" title="Challenge Rating" />
    <div className="creature-cr-grid">
      <div><span>Calculated CR</span><strong>{core.calculatedChallengeRating ?? "?"}</strong></div><div><span>Adjustment</span><strong>{core.challengeRatingAdjustment >= 0 ? "+" : ""}{core.challengeRatingAdjustment}</strong></div><div><span>Final CR</span><strong>{core.challengeRating ?? "?"}</strong></div><div><span>Kill XP</span><strong>{core.killXp ?? "?"}</strong></div>
    </div>
    <div className="creature-form-grid"><Field label="Manual CR Adjustment"><input type="number" min={-49} max={49} value={core.challengeRatingAdjustment} onChange={(e) => onChange({ ...draft, core: { ...core, challengeRatingAdjustment: Number(e.target.value) } })} /></Field><Field label="Adjustment Reason"><input value={core.challengeRatingAdjustmentReason} onChange={(e) => onChange({ ...draft, core: { ...core, challengeRatingAdjustmentReason: e.target.value } })} /></Field></div>
    {reference ? <article className="creature-cr-reference"><h4>CR {reference.challengeRating} · {reference.threatBand}</h4><dl><div><dt>Attack</dt><dd>{reference.attackTargetGuidance}</dd></div><div><dt>Damage</dt><dd>{reference.damageGuidance}</dd></div><div><dt>Initiative</dt><dd>{reference.initiativeGuidance}</dd></div><div><dt>Soak</dt><dd>{reference.soakGuidance}</dd></div><div><dt>HP / Toughness</dt><dd>{reference.hpToughnessGuidance}</dd></div></dl></article> : <p className="skill-library__empty">CR reference rows will appear after the canon import.</p>}
    <SectionHeading eyebrow="INHERITANCE" title="Derived Creatures / Variants" />
    {draft.id ? <div className="creature-variant-create"><input placeholder="Variant name" value={variantName} onChange={(e) => setVariantName(e.target.value)} /><button className="skills-primary-button" type="button" disabled={!variantName.trim() || cloning} onClick={() => void clone()}>{cloning ? "Cloning…" : "Clone as Variant"}</button></div> : <p className="skill-library__empty">Save this Creature before creating variants.</p>}
    <div className="creature-derived-list">{draft.derivedCreatures.map((child) => <button type="button" key={child.id} onClick={() => onOpen({ ...child, family: "", creatureType: "" })}><strong>{child.canonicalName}</strong><span>{child.archivedAt ? "Archived · " : ""}{child.size} · CR {child.challengeRating ?? "?"} · {child.killXp ?? "?"} XP</span></button>)}</div>
  </div>;
}

function Preview({ draft }: { draft: CreatureDraft }) {
  const protection = draft.hitLocations.map((location) => Math.max(location.naturalArmor ?? 0, location.soak ?? 0));
  const effective = resolveEffectiveCreatureStatistics(draft);
  const effectiveAttributes = new Map(effective.attributes.map((row) => [row.attributeKey, row.effectiveValue]));
  const effectiveMovement = new Map(effective.movement.map((row) => [row.movementMode, row.effectiveValue]));
  return <article className="creature-preview"><header><p>{draft.core.family || "Creature"} · {draft.core.creatureType || "Unclassified"}</p><h3>{draft.core.canonicalName || "Untitled Creature"}</h3><span>{draft.core.size} ×{formatCreatureNumber(effective.sizeMultiplier)} · CR {draft.core.challengeRating ?? "?"} · {draft.core.killXp ?? "?"} XP</span></header><div className="creature-preview__facts">{draft.attributes.map((attribute) => <div key={attribute.attributeKey}><dt>{attribute.attributeKey}</dt><dd>Base {formatCreatureNumber(attribute.value)} · Effective {formatCreatureNumber(effectiveAttributes.get(attribute.attributeKey) ?? null)}</dd></div>)}</div><section><h4>Health & Exceptional Modifiers</h4><p>Effective CON {formatCreatureNumber(effective.effectiveConstitution)} · HP Multiplier ×{formatCreatureNumber(effective.hpMultiplier)} · Total HP {formatCreatureNumber(effective.calculatedTotalMaximumHp)} · Movement bonus +{formatCreatureNumber(effective.baseMovementBonus)} · Base Magic bonus +{formatCreatureNumber(effective.baseMagicBonus)}</p></section><section><h4>Description</h4><p>{draft.core.description || "No description."}</p></section><section><h4>Movement</h4><div className="creature-preview__chips">{draft.movement.map((row, index) => <span key={`${row.movementMode}-${index}`}>{row.movementMode}: Base {formatCreatureNumber(row.movementValue)} / Effective {formatCreatureNumber(effectiveMovement.get(row.movementMode) ?? null)} / Init {row.initiative ?? "—"}</span>)}</div></section><section><h4>Attacks</h4>{draft.attacks.length ? <ul>{draft.attacks.map((attack) => <li key={attack.canonicalId}><strong>{attack.attackName}</strong> · {attack.attackPercentage ?? "?"}% · {attack.damage ?? "—"} {attack.damageType}</li>)}</ul> : <p>No attacks.</p>}</section><section><h4>Protection</h4><p>Highest authored protection: {protection.length ? Math.max(...protection) : 0}. {draft.hitLocations.length} hit locations.</p></section><section><h4>Special</h4><div className="creature-preview__chips">{draft.abilities.map((row) => <span key={row.canonicalId}>{row.abilityName} · {row.crImpact}</span>)}</div></section><div className="creature-preview__columns"><section><h4>Behavior</h4><p>{draft.core.typicalBehavior || "Not specified."}</p></section><section><h4>Habitat & Ecology</h4><p>{draft.core.habitatEcology || "Not specified."}</p></section></div></article>;
}
