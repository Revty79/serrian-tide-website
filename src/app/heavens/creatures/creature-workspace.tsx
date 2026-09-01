"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CREATURE_CR_IMPACTS, CREATURE_SIZE_OPTIONS, type CreatureCrImpact } from "@/db/creature-schema";
import {
  calculateCreatureChallengeRating,
  getCreatureKillXpForChallengeRating,
} from "@/features/creatures/challenge-rating";
import {
  getCreatureHpPercentageStatus,
  resolveCreatureHitLocationMaximumHp,
  resolveCreatureHpModel,
  resolveEffectiveCreatureStatistics,
} from "@/features/creatures/creature-size-rules";

import {
  createDerivedCreature,
  deleteCreature,
  getCreature,
  listChallengeRatingReferences,
  listCreatureFacets,
  listCreatureSkillCandidates,
  listCreatures,
  saveCreature,
  type ChallengeRatingReference,
  type CreatureDraft,
  type CreatureFacets,
  type CreatureLibraryFilters,
  type CreatureLibraryResult,
  type CreatureSkillCandidate,
  type CreatureSummary,
} from "./actions";
import { CreatureAbilityEffectsEditor } from "./creature-ability-effects-editor";

type Tab = "overview" | "stats" | "hp" | "combat" | "special" | "cr" | "preview";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "stats", label: "Attributes & Movement" },
  { id: "hp", label: "HP & Hit Locations" },
  { id: "combat", label: "Attacks & Skills" },
  { id: "special", label: "Abilities & Defenses" },
  { id: "cr", label: "Variants & CR" },
  { id: "preview", label: "Preview" },
];

const ATTRIBUTES = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function newCreatureDraft(references: ChallengeRatingReference[]): CreatureDraft {
  const seed = `CREATURE-${Date.now().toString(36).toUpperCase()}`;
  return {
    core: {
      canonicalId: seed,
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

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "creature-field creature-field--wide" : "creature-field"}><span>{label}</span>{children}</label>;
}

function OptionalNumber({ value, onChange, ...props }: { value: number | null; onChange: (value: number | null) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <input {...props} type="number" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} />;
}

function formatCreatureNumber(value: number | null) {
  return value === null ? "—" : Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
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
  const [draft, setDraft] = useState<CreatureDraft | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [dirty, setDirty] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pending, setPending] = useState<{ kind: "open"; creature: CreatureSummary } | { kind: "new" } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
    const timer = window.setTimeout(() => void loadLibrary(filters), 180);
    return () => window.clearTimeout(timer);
  }, [filters, loadLibrary]);

  async function refreshReferences() {
    const [nextFacets, nextReferences] = await Promise.all([listCreatureFacets(), listChallengeRatingReferences()]);
    setFacets(nextFacets);
    setReferences(nextReferences);
  }

  async function openCreature(summary: CreatureSummary) {
    setLoadingEditor(true);
    setFeedback(null);
    try {
      const aggregate = await getCreature(summary.id);
      if (!aggregate) throw new Error("Creature not found.");
      setDraft(aggregate);
      setDirty(false);
      setActiveTab("overview");
      setConfirmDelete(false);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "That Creature could not be loaded." });
    } finally {
      setLoadingEditor(false);
    }
  }

  function chooseCreature(summary: CreatureSummary) {
    if (dirty) setPending({ kind: "open", creature: summary });
    else void openCreature(summary);
  }

  function createNew() {
    try {
      setDraft(newCreatureDraft(references));
      setDirty(false);
      setActiveTab("overview");
      setConfirmDelete(false);
      setFeedback(null);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Creature CR reward data is unavailable." });
    }
  }

  function beginNew() {
    if (dirty) setPending({ kind: "new" });
    else createNew();
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
  }

  async function removeCreature() {
    if (!draft?.id) return;
    setSaving(true);
    try {
      const name = draft.core.canonicalName;
      await deleteCreature(draft.id);
      setDraft(null);
      setDirty(false);
      setConfirmDelete(false);
      setFeedback({ kind: "success", message: `${name} was deleted.` });
      await loadLibrary(filters);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Creature could not be deleted." });
    } finally {
      setSaving(false);
    }
  }

  return <main className="skills-page creatures-page">
    <header className="skills-page__header">
      <div className="skills-page__brand"><Link href="/heavens" className="font-evanescent creature-brand">SERRIAN<br />TIDE</Link></div>
      <div className="skills-page__title"><p>THE HEAVENS / CREATURES</p><h1>Creatures</h1><span>G.O.D. archive · {username}</span></div>
      <div className="skills-page__navigation"><Link href="/heavens">Back to The Heavens</Link></div>
    </header>

    <div className="skills-workspace creatures-workspace">
      <aside className="skill-library">
        <div className="skill-library__heading"><div><p>MASTER CONTENT</p><h2>Bestiary</h2></div><button className="skills-primary-button" type="button" onClick={beginNew}>New Creature</button></div>
        <div className="skill-library__search"><label htmlFor="creature-search">Search</label><input id="creature-search" type="search" value={filters.search ?? ""} placeholder="Search by name" onChange={(event) => setFilters({ ...filters, search: event.target.value, page: 1 })} /></div>
        <div className="skill-library__filters creature-library-filters">
          <label><span>Family</span><select value={filters.family ?? ""} onChange={(e) => setFilters({ ...filters, family: e.target.value || undefined, page: 1 })}><option value="">All</option>{facets.families.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Type</span><select value={filters.creatureType ?? ""} onChange={(e) => setFilters({ ...filters, creatureType: e.target.value || undefined, page: 1 })}><option value="">All</option>{facets.creatureTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Size</span><select value={filters.size ?? ""} onChange={(e) => setFilters({ ...filters, size: e.target.value as CreatureLibraryFilters["size"], page: 1 })}><option value="">All</option>{CREATURE_SIZE_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>CR</span><select value={filters.challengeRating ?? ""} onChange={(e) => setFilters({ ...filters, challengeRating: e.target.value ? Number(e.target.value) : null, page: 1 })}><option value="">All</option>{references.map((row) => <option key={row.challengeRating} value={row.challengeRating}>{row.challengeRating}</option>)}</select></label>
        </div>
        <div className="skill-library__toolbar"><span>{library.total.toLocaleString()} creatures</span></div>
        <div className={`skill-library__results${loadingLibrary ? " is-loading" : ""}`}>
          {library.items.map((entry) => <button key={entry.id} type="button" className={`skill-library__row${draft?.id === entry.id ? " is-selected" : ""}`} onClick={() => chooseCreature(entry)}>
            <span className="skill-library__row-name">{entry.canonicalName}</span>
            <span className="skill-library__row-meta">{entry.family || "Unclassified"} · {entry.creatureType || "Creature"} · {entry.size}</span>
            <span className="skill-library__row-parents">CR {entry.challengeRating ?? "?"} · {entry.killXp ?? "?"} XP</span>
          </button>)}
          {!library.items.length && !loadingLibrary ? <p className="skill-library__empty">No Creatures match this view.</p> : null}
        </div>
        <nav className="skill-library__pagination"><button type="button" disabled={library.page <= 1 || loadingLibrary} onClick={() => setFilters({ ...filters, page: library.page - 1 })}>Previous</button><span>Page {library.page} of {library.pageCount}</span><button type="button" disabled={library.page >= library.pageCount || loadingLibrary} onClick={() => setFilters({ ...filters, page: library.page + 1 })}>Next</button></nav>
      </aside>

      {loadingEditor ? <section className="skill-editor skill-editor--empty"><p>LOADING CREATURE</p></section> : draft ? <section className="skill-editor creature-editor">
        <header className="skill-editor__header"><div><p>{draft.id ? `CREATURE ${draft.id}` : "NEW CREATURE DRAFT"}</p><h2>{draft.core.canonicalName || "Untitled Creature"}</h2><span>{dirty ? "Unsaved changes" : draft.id ? "Saved" : "Not yet persisted"}</span></div><div className="skill-editor__actions">{draft.id && !confirmDelete ? <button className="skills-danger-button" type="button" onClick={() => setConfirmDelete(true)}>Delete</button> : null}<button className="skills-primary-button" type="button" disabled={saving} onClick={() => void persist()}>{saving ? "Saving…" : "Save Creature"}</button></div></header>
        {confirmDelete ? <div className="skill-editor__delete-confirm"><div><strong>Delete {draft.core.canonicalName}?</strong><span>Derived Creatures must be deleted first.</span></div><button className="skills-danger-button" type="button" onClick={() => void removeCreature()}>Confirm Delete</button><button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button></div> : null}
        {feedback ? <p className={`skill-editor__feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
        {liveChallengeRating.error ? <p className="skill-editor__feedback is-error">{liveChallengeRating.error}</p> : null}
        <nav className="skill-editor__tabs">{TABS.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : ""} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</nav>
        <div className="skill-editor__content creature-editor__content">
          {activeTab === "overview" ? <Overview draft={draft} onChange={change} /> : null}
          {activeTab === "stats" ? <Stats draft={draft} onChange={change} /> : null}
          {activeTab === "hp" ? <HpAndLocations draft={draft} onChange={change} /> : null}
          {activeTab === "combat" ? <Combat draft={draft} onChange={change} /> : null}
          {activeTab === "special" ? <Special draft={draft} onChange={change} /> : null}
          {activeTab === "cr" ? <VariantsAndCr draft={liveChallengeRating.draft ?? draft} references={references} onChange={change} onOpen={(summary) => void openCreature(summary)} onSaved={(saved) => { setDraft(saved); setDirty(false); void loadLibrary(filters); }} /> : null}
          {activeTab === "preview" ? <Preview draft={liveChallengeRating.draft ?? draft} /> : null}
        </div>
      </section> : <section className="skill-editor skill-editor--empty"><p>CREATURE EDITOR</p><h2>Select a Creature or begin a new one.</h2><span>Full bestiary aggregates open here.</span></section>}
    </div>

    {pending ? <div className="skills-page__discard-confirm"><div><p>Unsaved changes</p><span>Leave this Creature draft and discard the unsaved changes?</span></div><div className="skills-page__discard-actions"><button type="button" onClick={() => setPending(null)}>Keep Editing</button><button className="skills-danger-button" type="button" onClick={discardAndContinue}>Discard Changes</button></div></div> : null}
  </main>;
}

function Overview({ draft, onChange }: { draft: CreatureDraft; onChange: (draft: CreatureDraft) => void }) {
  const core = draft.core;
  const setCore = (update: Partial<CreatureDraft["core"]>) => onChange({ ...draft, core: { ...core, ...update } });
  return <div className="creature-section creature-form-grid">
    <Field label="Canonical Name" wide><input value={core.canonicalName} onChange={(e) => {
      const name = e.target.value;
      const shouldGenerate = !draft.id && (!core.canonicalId || core.canonicalId.startsWith("CREATURE-"));
      setCore({ canonicalName: name, ...(shouldGenerate && slug(name) ? { canonicalId: `CREATURE-${slug(name).toUpperCase()}` } : {}) });
    }} /></Field>
    <Field label="Canonical ID"><input value={core.canonicalId} disabled={Boolean(draft.id)} onChange={(e) => setCore({ canonicalId: e.target.value })} /></Field>
    <Field label="Size"><select value={core.size} onChange={(e) => setCore({ size: e.target.value })}>{CREATURE_SIZE_OPTIONS.map((size) => <option key={size}>{size}</option>)}</select></Field>
    <Field label="Family"><input value={core.family} onChange={(e) => setCore({ family: e.target.value })} /></Field>
    <Field label="Creature Type"><input value={core.creatureType} onChange={(e) => setCore({ creatureType: e.target.value })} /></Field>
    {core.parentCreatureId ? <Field label="Derived From" wide><input disabled value={core.parentCreatureName ?? `Creature ${core.parentCreatureId}`} /></Field> : null}
    <Field label="Description" wide><textarea rows={6} value={core.description} onChange={(e) => setCore({ description: e.target.value })} /></Field>
    <Field label="Typical Behavior" wide><textarea rows={5} value={core.typicalBehavior} onChange={(e) => setCore({ typicalBehavior: e.target.value })} /></Field>
    <Field label="Habitat & Ecology" wide><textarea rows={5} value={core.habitatEcology} onChange={(e) => setCore({ habitatEcology: e.target.value })} /></Field>
    <Field label="Notes" wide><textarea rows={5} value={core.notes} onChange={(e) => setCore({ notes: e.target.value })} /></Field>
  </div>;
}

function Stats({ draft, onChange }: { draft: CreatureDraft; onChange: (draft: CreatureDraft) => void }) {
  const effective = resolveEffectiveCreatureStatistics(draft);
  const effectiveAttributes = new Map(effective.attributes.map((row) => [row.attributeKey, row.effectiveValue]));
  const effectiveMovement = new Map(effective.movement.map((row) => [row.movementMode, row.effectiveValue]));
  return <div className="creature-section">
    <SectionHeading eyebrow="EXCEPTIONAL CREATURE MODIFIERS" title="Persistent Step Improvements" />
    <div className="creature-form-grid">
      <Field label="HP Multiplier Steps"><input type="number" min={0} step={1} value={draft.core.hpMultiplierSteps} onChange={(e) => onChange({ ...draft, core: { ...draft.core, hpMultiplierSteps: Math.max(0, Math.trunc(Number(e.target.value))) } })} /><small>Resolved multiplier: ×{formatCreatureNumber(effective.hpMultiplier)}</small></Field>
      <Field label="Base Movement Steps"><input type="number" min={0} step={1} value={draft.core.baseMovementSteps} onChange={(e) => onChange({ ...draft, core: { ...draft.core, baseMovementSteps: Math.max(0, Math.trunc(Number(e.target.value))) } })} /><small>Resolved bonus: +{formatCreatureNumber(effective.baseMovementBonus)}</small></Field>
      <Field label="Base Magic Steps"><input type="number" min={0} step={1} value={draft.core.baseMagicSteps} onChange={(e) => onChange({ ...draft, core: { ...draft.core, baseMagicSteps: Math.max(0, Math.trunc(Number(e.target.value))) } })} /><small>Resolved bonus: +{formatCreatureNumber(effective.baseMagicBonus)}</small></Field>
    </div>
    <p className="skill-library__empty">These exceptional modifiers are separate from Size. Each step uses the established Character quarter-step rule.</p>
    <SectionHeading eyebrow="BASE STAT BLOCK" title="Attributes" />
    <div className="creature-row-list">{draft.attributes.map((row, index) => <div className="creature-repeat-row creature-attribute-row" key={row.attributeKey}>
      <select value={row.attributeKey} onChange={(e) => onChange({ ...draft, attributes: draft.attributes.map((entry, i) => i === index ? { ...entry, attributeKey: e.target.value } : entry) })}>{ATTRIBUTES.map((attribute) => <option key={attribute}>{attribute}</option>)}</select>
      <div><OptionalNumber value={row.value} placeholder="Base Value" onChange={(value) => onChange({ ...draft, attributes: draft.attributes.map((entry, i) => i === index ? { ...entry, value } : entry) })} /><small>Effective: {formatCreatureNumber(effectiveAttributes.get(row.attributeKey) ?? null)}</small></div>
      <input placeholder="Notes" value={row.notes} onChange={(e) => onChange({ ...draft, attributes: draft.attributes.map((entry, i) => i === index ? { ...entry, notes: e.target.value } : entry) })} />
    </div>)}</div>
    <SectionHeading eyebrow="MOBILITY & INITIATIVE" title="Movement Modes" action="Add Movement" onAction={() => onChange({ ...draft, movement: [...draft.movement, { movementMode: "Land", movementValue: null, initiative: null, requirements: "", notes: "", sortOrder: draft.movement.length }] })} />
    <div className="creature-row-list">{draft.movement.map((row, index) => <div className="creature-repeat-row creature-movement-row" key={`${row.movementMode}-${index}`}>
      <input placeholder="Mode" value={row.movementMode} onChange={(e) => patchArray(draft, onChange, "movement", index, { movementMode: e.target.value })} />
      <div><OptionalNumber value={row.movementValue} placeholder="Base Movement" onChange={(value) => patchArray(draft, onChange, "movement", index, { movementValue: value })} /><small>Effective: {formatCreatureNumber(effectiveMovement.get(row.movementMode) ?? null)}</small></div>
      <OptionalNumber value={row.initiative} placeholder="Initiative" onChange={(value) => patchArray(draft, onChange, "movement", index, { initiative: value })} />
      <input placeholder="Requirements" value={row.requirements} onChange={(e) => patchArray(draft, onChange, "movement", index, { requirements: e.target.value })} />
      <input placeholder="Notes" value={row.notes} onChange={(e) => patchArray(draft, onChange, "movement", index, { notes: e.target.value })} />
      <RemoveButton onClick={() => removeArray(draft, onChange, "movement", index)} />
    </div>)}</div>
  </div>;
}

function HpAndLocations({ draft, onChange }: { draft: CreatureDraft; onChange: (draft: CreatureDraft) => void }) {
  const hpModel = resolveCreatureHpModel(draft, draft.hpPools);
  const effective = hpModel.statistics;
  const percentageStatus = getCreatureHpPercentageStatus(draft.hpPools);
  return <div className="creature-section">
    <SectionHeading eyebrow="CALCULATED TOUGHNESS" title="Creature Total HP" />
    <div className="creature-cr-grid">
      <div className="creature-total-hp-stat"><span>Total HP</span><strong>{formatCreatureNumber(hpModel.calculatedTotalHp)}</strong></div>
      <div><span>Effective CON</span><strong>{formatCreatureNumber(effective.effectiveConstitution)}</strong></div>
      <div><span>HP Multiplier</span><strong>×{formatCreatureNumber(effective.hpMultiplier)}</strong></div>
    </div>
    <SectionHeading eyebrow="TOUGHNESS MODEL" title="HP Pools" action="Add HP Pool" onAction={() => onChange({ ...draft, hpPools: [...draft.hpPools, { canonicalId: `${draft.core.canonicalId}-hp-${draft.hpPools.length + 1}`, poolName: `Pool ${draft.hpPools.length + 1}`, hpPercentage: null, maximumHp: null, notes: "", sortOrder: draft.hpPools.length }] })} />
    <p className={percentageStatus.complete ? "creature-hp-allocation is-complete" : "creature-hp-allocation is-warning"}>Allocated HP: {formatCreatureNumber(percentageStatus.totalPercentage)}%{percentageStatus.complete ? " · Complete" : " · HP Pool percentages should total 100%. You may still save an incomplete Creature."}</p>
    <div className="creature-row-list">{draft.hpPools.map((row, index) => <div className="creature-repeat-row creature-pool-row" key={`${row.canonicalId}-${index}`}>
      <input placeholder="Canonical ID" value={row.canonicalId} onChange={(e) => patchArray(draft, onChange, "hpPools", index, { canonicalId: e.target.value })} />
      <input placeholder="Pool Name" value={row.poolName} onChange={(e) => patchArray(draft, onChange, "hpPools", index, { poolName: e.target.value })} />
      <div><OptionalNumber value={row.hpPercentage} placeholder="HP %" onChange={(value) => patchArray(draft, onChange, "hpPools", index, { hpPercentage: value })} /><small>Maximum HP: {formatCreatureNumber(hpModel.pools[index]?.maximumHp ?? null)}</small></div>
      <input placeholder="Notes" value={row.notes} onChange={(e) => patchArray(draft, onChange, "hpPools", index, { notes: e.target.value })} />
      <RemoveButton onClick={() => removeArray(draft, onChange, "hpPools", index)} />
    </div>)}</div>
    <SectionHeading eyebrow="D10 LOCATION TABLE" title="Hit Locations 0–9" action="Add Location" onAction={() => {
      const used = new Set(draft.hitLocations.map(({ hitLocationNumber }) => hitLocationNumber));
      const number = Array.from({ length: 10 }, (_, i) => i).find((value) => !used.has(value));
      if (number === undefined) return;
      onChange({ ...draft, hitLocations: [...draft.hitLocations, { hitLocationNumber: number, locationName: "", bodyPartsIncluded: "", hpPoolCanonicalId: draft.hpPools[0]?.canonicalId ?? null, naturalArmor: null, soak: null, locationEffect: "", notes: "", sortOrder: draft.hitLocations.length }] });
    }} />
    <div className="creature-location-cards">{draft.hitLocations.map((row, index) => <article className="creature-location-card" key={`${row.hitLocationNumber}-${index}`}>
      <div className="creature-location-card__header"><strong>Location {row.hitLocationNumber}</strong><RemoveButton onClick={() => removeArray(draft, onChange, "hitLocations", index)} /></div>
      <div className="creature-form-grid">
        <Field label="Roll #"><input type="number" min={0} max={9} value={row.hitLocationNumber} onChange={(e) => patchArray(draft, onChange, "hitLocations", index, { hitLocationNumber: Number(e.target.value) })} /></Field>
        <Field label="Location Name"><input value={row.locationName} onChange={(e) => patchArray(draft, onChange, "hitLocations", index, { locationName: e.target.value })} /></Field>
        <Field label="Body Parts" wide><input value={row.bodyPartsIncluded} onChange={(e) => patchArray(draft, onChange, "hitLocations", index, { bodyPartsIncluded: e.target.value })} /></Field>
        <Field label="HP Pool"><select value={row.hpPoolCanonicalId ?? ""} onChange={(e) => patchArray(draft, onChange, "hitLocations", index, { hpPoolCanonicalId: e.target.value || null })}><option value="">None</option>{draft.hpPools.map((pool) => <option key={pool.canonicalId} value={pool.canonicalId}>{pool.poolName}</option>)}</select><small>Maximum HP: {formatCreatureNumber(resolveCreatureHitLocationMaximumHp(row.hpPoolCanonicalId, hpModel.pools))}</small></Field>
        <Field label="Natural Armor"><OptionalNumber value={row.naturalArmor} onChange={(value) => patchArray(draft, onChange, "hitLocations", index, { naturalArmor: value })} /></Field>
        <Field label="Soak"><OptionalNumber value={row.soak} onChange={(value) => patchArray(draft, onChange, "hitLocations", index, { soak: value })} /></Field>
        <Field label="Location Effect" wide><input value={row.locationEffect} onChange={(e) => patchArray(draft, onChange, "hitLocations", index, { locationEffect: e.target.value })} /></Field>
        <Field label="Notes" wide><textarea rows={2} value={row.notes} onChange={(e) => patchArray(draft, onChange, "hitLocations", index, { notes: e.target.value })} /></Field>
      </div>
    </article>)}</div>
  </div>;
}

function Combat({ draft, onChange }: { draft: CreatureDraft; onChange: (draft: CreatureDraft) => void }) {
  return <div className="creature-section">
    <SectionHeading eyebrow="DIRECT COMBAT" title="Attacks" action="Add Attack" onAction={() => onChange({ ...draft, attacks: [...draft.attacks, { canonicalId: `${draft.core.canonicalId}-attack-${draft.attacks.length + 1}`, attackName: "", attackPercentage: null, damage: null, damageType: "", rangeReach: "", requiredAnatomy: "", requirements: "", usesRecharge: "", specialEffect: "", notes: "", sortOrder: draft.attacks.length }] })} />
    <div className="creature-card-list">{draft.attacks.map((row, index) => <article className="creature-edit-card" key={`${row.canonicalId}-${index}`}><CardHeader title={row.attackName || `Attack ${index + 1}`} onRemove={() => removeArray(draft, onChange, "attacks", index)} /><div className="creature-form-grid">
      <Field label="Attack Name"><input value={row.attackName} onChange={(e) => patchArray(draft, onChange, "attacks", index, { attackName: e.target.value })} /></Field><Field label="Canonical ID"><input value={row.canonicalId} onChange={(e) => patchArray(draft, onChange, "attacks", index, { canonicalId: e.target.value })} /></Field>
      <Field label="Attack %"><OptionalNumber value={row.attackPercentage} onChange={(value) => patchArray(draft, onChange, "attacks", index, { attackPercentage: value })} /></Field><Field label="Damage"><input value={row.damage ?? ""} onChange={(e) => patchArray(draft, onChange, "attacks", index, { damage: e.target.value || null })} /></Field>
      <Field label="Damage Type"><input value={row.damageType} onChange={(e) => patchArray(draft, onChange, "attacks", index, { damageType: e.target.value })} /></Field><Field label="Range / Reach"><input value={row.rangeReach} onChange={(e) => patchArray(draft, onChange, "attacks", index, { rangeReach: e.target.value })} /></Field>
      <Field label="Required Anatomy"><input value={row.requiredAnatomy} onChange={(e) => patchArray(draft, onChange, "attacks", index, { requiredAnatomy: e.target.value })} /></Field><Field label="Uses / Recharge"><input value={row.usesRecharge} onChange={(e) => patchArray(draft, onChange, "attacks", index, { usesRecharge: e.target.value })} /></Field>
      <Field label="Requirements" wide><input value={row.requirements} onChange={(e) => patchArray(draft, onChange, "attacks", index, { requirements: e.target.value })} /></Field><Field label="Special Effect" wide><textarea rows={2} value={row.specialEffect} onChange={(e) => patchArray(draft, onChange, "attacks", index, { specialEffect: e.target.value })} /></Field><Field label="Notes" wide><textarea rows={2} value={row.notes} onChange={(e) => patchArray(draft, onChange, "attacks", index, { notes: e.target.value })} /></Field>
    </div></article>)}</div>
    <CreatureSkills draft={draft} onChange={onChange} />
  </div>;
}

function CreatureSkills({ draft, onChange }: { draft: CreatureDraft; onChange: (draft: CreatureDraft) => void }) {
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<CreatureSkillCandidate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => listCreatureSkillCandidates(search).then((rows) => { if (active) setCandidates(rows); }), 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search]);
  const add = () => {
    const candidate = candidates.find(({ id }) => id === Number(selectedId));
    if (!candidate || draft.skillLinks.some(({ skillId }) => skillId === candidate.id)) return;
    onChange({ ...draft, skillLinks: [...draft.skillLinks, { skillId: candidate.id, skillName: candidate.name, skillClassification: candidate.classification, rank: null, notes: "", sortOrder: draft.skillLinks.length }] });
    setSelectedId("");
  };
  return <>
    <SectionHeading eyebrow="SHARED SKILL LIBRARY" title="Creature Skills" />
    <div className="creature-skill-picker"><Field label="Search"><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></Field><Field label="Matching Skill"><select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}><option value="">Select a Skill</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.classification}</option>)}</select></Field><button className="skills-primary-button" type="button" disabled={!selectedId} onClick={add}>Add Skill</button></div>
    <div className="creature-row-list">{draft.skillLinks.map((row, index) => <div className="creature-repeat-row creature-skill-row" key={`${row.skillId}-${index}`}><div><strong>{row.skillName}</strong><span>{row.skillClassification}</span></div><input placeholder="Rank" value={row.rank ?? ""} onChange={(e) => patchArray(draft, onChange, "skillLinks", index, { rank: e.target.value || null })} /><input placeholder="Notes" value={row.notes} onChange={(e) => patchArray(draft, onChange, "skillLinks", index, { notes: e.target.value })} /><RemoveButton onClick={() => removeArray(draft, onChange, "skillLinks", index)} /></div>)}</div>
  </>;
}

function Special({ draft, onChange }: { draft: CreatureDraft; onChange: (draft: CreatureDraft) => void }) {
  return <div className="creature-section">
    <SectionHeading eyebrow="SPECIAL MECHANICS" title="Abilities" action="Add Ability" onAction={() => onChange({ ...draft, abilities: [...draft.abilities, { canonicalId: `${draft.core.canonicalId}-ability-${draft.abilities.length + 1}`, abilityName: "", abilityType: "", activation: "", requirements: "", usesRecharge: "", description: "", mechanicalEffect: "", notes: "", sortOrder: draft.abilities.length, crImpact: "None", effects: [] }] })} />
    <div className="creature-card-list">{draft.abilities.map((row, index) => <article className="creature-edit-card" key={`${row.canonicalId}-${index}`}><CardHeader title={row.abilityName || `Ability ${index + 1}`} onRemove={() => removeArray(draft, onChange, "abilities", index)} /><div className="creature-form-grid">
      <Field label="Ability Name"><input value={row.abilityName} onChange={(e) => patchArray(draft, onChange, "abilities", index, { abilityName: e.target.value })} /></Field><Field label="Canonical ID"><input value={row.canonicalId} onChange={(e) => patchArray(draft, onChange, "abilities", index, { canonicalId: e.target.value })} /></Field><Field label="Type"><input value={row.abilityType} onChange={(e) => patchArray(draft, onChange, "abilities", index, { abilityType: e.target.value })} /></Field><Field label="Activation"><input value={row.activation} onChange={(e) => patchArray(draft, onChange, "abilities", index, { activation: e.target.value })} /></Field><Field label="CR Impact"><CrImpact value={row.crImpact} onChange={(crImpact) => patchArray(draft, onChange, "abilities", index, { crImpact })} /></Field><Field label="Uses / Recharge"><input value={row.usesRecharge} onChange={(e) => patchArray(draft, onChange, "abilities", index, { usesRecharge: e.target.value })} /></Field><Field label="Requirements" wide><input value={row.requirements} onChange={(e) => patchArray(draft, onChange, "abilities", index, { requirements: e.target.value })} /></Field><Field label="Description" wide><textarea rows={3} value={row.description} onChange={(e) => patchArray(draft, onChange, "abilities", index, { description: e.target.value })} /></Field><Field label="Mechanical Notes (Legacy Text)" wide><textarea rows={3} value={row.mechanicalEffect} onChange={(e) => patchArray(draft, onChange, "abilities", index, { mechanicalEffect: e.target.value })} /></Field><Field label="Notes" wide><textarea rows={2} value={row.notes} onChange={(e) => patchArray(draft, onChange, "abilities", index, { notes: e.target.value })} /></Field>
    </div><CreatureAbilityEffectsEditor ability={row} skillOptions={draft.skillLinks.map(({ skillId, skillName }) => ({ id: skillId, name: skillName }))} onChange={(ability) => patchArray(draft, onChange, "abilities", index, { ...ability, crImpact: row.crImpact })} /></article>)}</div>
    <SectionHeading eyebrow="PROTECTION & RESISTANCE" title="Defenses" action="Add Defense" onAction={() => onChange({ ...draft, defenses: [...draft.defenses, { seedIdentity: null, defenseType: "", against: "", value: null, notes: "", sortOrder: draft.defenses.length, crImpact: "None" }] })} />
    <div className="creature-row-list">{draft.defenses.map((row, index) => <div className="creature-repeat-row creature-defense-row" key={index}><input placeholder="Defense Type" value={row.defenseType} onChange={(e) => patchArray(draft, onChange, "defenses", index, { defenseType: e.target.value })} /><input placeholder="Against" value={row.against} onChange={(e) => patchArray(draft, onChange, "defenses", index, { against: e.target.value })} /><input placeholder="Value" value={row.value ?? ""} onChange={(e) => patchArray(draft, onChange, "defenses", index, { value: e.target.value || null })} /><CrImpact value={row.crImpact} onChange={(crImpact) => patchArray(draft, onChange, "defenses", index, { crImpact })} /><input placeholder="Notes" value={row.notes} onChange={(e) => patchArray(draft, onChange, "defenses", index, { notes: e.target.value })} /><RemoveButton onClick={() => removeArray(draft, onChange, "defenses", index)} /></div>)}</div>
    <SectionHeading eyebrow="NARRATIVE / HARVEST / UTILITY" title="Uses" action="Add Use" onAction={() => onChange({ ...draft, uses: [...draft.uses, { seedIdentity: null, useName: "", notes: "", sortOrder: draft.uses.length }] })} />
    <div className="creature-row-list">{draft.uses.map((row, index) => <div className="creature-repeat-row creature-use-row" key={index}><input placeholder="Use" value={row.useName} onChange={(e) => patchArray(draft, onChange, "uses", index, { useName: e.target.value })} /><input placeholder="Notes" value={row.notes} onChange={(e) => patchArray(draft, onChange, "uses", index, { notes: e.target.value })} /><RemoveButton onClick={() => removeArray(draft, onChange, "uses", index)} /></div>)}</div>
  </div>;
}

function VariantsAndCr({ draft, references, onChange, onOpen, onSaved }: { draft: CreatureDraft; references: ChallengeRatingReference[]; onChange: (draft: CreatureDraft) => void; onOpen: (summary: CreatureSummary) => void; onSaved: (saved: CreatureDraft) => void }) {
  const [variantName, setVariantName] = useState("");
  const [cloning, setCloning] = useState(false);
  const core = draft.core;
  const reference = references.find(({ challengeRating }) => challengeRating === core.challengeRating);
  async function clone() {
    if (!draft.id || !variantName.trim()) return;
    setCloning(true);
    try {
      const saved = await createDerivedCreature(draft.id, variantName);
      onSaved(saved);
      setVariantName("");
    } finally { setCloning(false); }
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
    <div className="creature-derived-list">{draft.derivedCreatures.map((child) => <button type="button" key={child.id} onClick={() => onOpen({ ...child, family: "", creatureType: "" })}><strong>{child.canonicalName}</strong><span>{child.size} · CR {child.challengeRating ?? "?"} · {child.killXp ?? "?"} XP</span></button>)}</div>
  </div>;
}

function Preview({ draft }: { draft: CreatureDraft }) {
  const protection = draft.hitLocations.map((location) => Math.max(location.naturalArmor ?? 0, location.soak ?? 0));
  const effective = resolveEffectiveCreatureStatistics(draft);
  const effectiveAttributes = new Map(effective.attributes.map((row) => [row.attributeKey, row.effectiveValue]));
  const effectiveMovement = new Map(effective.movement.map((row) => [row.movementMode, row.effectiveValue]));
  return <article className="creature-preview"><header><p>{draft.core.family || "Creature"} · {draft.core.creatureType || "Unclassified"}</p><h3>{draft.core.canonicalName || "Untitled Creature"}</h3><span>{draft.core.size} ×{formatCreatureNumber(effective.sizeMultiplier)} · CR {draft.core.challengeRating ?? "?"} · {draft.core.killXp ?? "?"} XP</span></header><div className="creature-preview__facts">{draft.attributes.map((attribute) => <div key={attribute.attributeKey}><dt>{attribute.attributeKey}</dt><dd>Base {formatCreatureNumber(attribute.value)} · Effective {formatCreatureNumber(effectiveAttributes.get(attribute.attributeKey) ?? null)}</dd></div>)}</div><section><h4>Health & Exceptional Modifiers</h4><p>Effective CON {formatCreatureNumber(effective.effectiveConstitution)} · HP Multiplier ×{formatCreatureNumber(effective.hpMultiplier)} · Total HP {formatCreatureNumber(effective.calculatedTotalMaximumHp)} · Movement bonus +{formatCreatureNumber(effective.baseMovementBonus)} · Base Magic bonus +{formatCreatureNumber(effective.baseMagicBonus)}</p></section><section><h4>Description</h4><p>{draft.core.description || "No description."}</p></section><section><h4>Movement</h4><div className="creature-preview__chips">{draft.movement.map((row, index) => <span key={`${row.movementMode}-${index}`}>{row.movementMode}: Base {formatCreatureNumber(row.movementValue)} / Effective {formatCreatureNumber(effectiveMovement.get(row.movementMode) ?? null)} / Init {row.initiative ?? "—"}</span>)}</div></section><section><h4>Attacks</h4>{draft.attacks.length ? <ul>{draft.attacks.map((attack) => <li key={attack.canonicalId}><strong>{attack.attackName}</strong> · {attack.attackPercentage ?? "?"}% · {attack.damage ?? "—"} {attack.damageType}</li>)}</ul> : <p>No attacks.</p>}</section><section><h4>Protection</h4><p>Highest authored protection: {protection.length ? Math.max(...protection) : 0}. {draft.hitLocations.length} hit locations.</p></section><section><h4>Special</h4><div className="creature-preview__chips">{draft.abilities.map((row) => <span key={row.canonicalId}>{row.abilityName} · {row.crImpact}</span>)}{draft.defenses.map((row, index) => <span key={`${row.defenseType}-${index}`}>{row.defenseType} · {row.crImpact}</span>)}</div></section><div className="creature-preview__columns"><section><h4>Behavior</h4><p>{draft.core.typicalBehavior || "Not specified."}</p></section><section><h4>Habitat & Ecology</h4><p>{draft.core.habitatEcology || "Not specified."}</p></section></div></article>;
}

function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="creature-subheading"><div><p>{eyebrow}</p><h3>{title}</h3></div>{action && onAction ? <button type="button" onClick={onAction}>{action}</button> : null}</div>;
}
function CardHeader({ title, onRemove }: { title: string; onRemove: () => void }) { return <header className="creature-edit-card__header"><strong>{title}</strong><RemoveButton onClick={onRemove} /></header>; }
function RemoveButton({ onClick }: { onClick: () => void }) { return <button className="is-danger" type="button" onClick={onClick}>Remove</button>; }
function CrImpact({ value, onChange }: { value: CreatureCrImpact; onChange: (value: CreatureCrImpact) => void }) { return <select value={value} onChange={(e) => onChange(e.target.value as CreatureCrImpact)}>{CREATURE_CR_IMPACTS.map((impact) => <option key={impact}>{impact}</option>)}</select>; }

function patchArray<K extends "movement" | "hpPools" | "hitLocations" | "attacks" | "skillLinks" | "abilities" | "defenses" | "uses">(
  draft: CreatureDraft,
  onChange: (draft: CreatureDraft) => void,
  key: K,
  index: number,
  update: Partial<CreatureDraft[K][number]>,
) {
  const rows = draft[key].map((row, i) => i === index ? { ...row, ...update } : row) as CreatureDraft[K];
  onChange({ ...draft, [key]: rows });
}

function removeArray<K extends "movement" | "hpPools" | "hitLocations" | "attacks" | "skillLinks" | "abilities" | "defenses" | "uses">(
  draft: CreatureDraft,
  onChange: (draft: CreatureDraft) => void,
  key: K,
  index: number,
) {
  const rows = draft[key].filter((_, i) => i !== index) as CreatureDraft[K];
  onChange({ ...draft, [key]: rows });
}
