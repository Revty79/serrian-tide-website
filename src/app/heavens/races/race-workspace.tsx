"use client";

import { GuidedField } from "@/components/field-guidance";
import { fieldHelp } from "@/features/guidance/field-help";

import { InteractionRulesEditor } from "@/app/heavens/interaction-rules-editor";
import { RaceNaturalProtectionEditor } from "./race-natural-protection-editor";
import { RaceAnatomyEditor } from "./race-anatomy-editor";
import { RaceNaturalAttacksEditor } from "./race-natural-attacks-editor";
import { raceHitLocations } from "@/features/races/race-anatomy";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LifecycleControls } from "@/app/heavens/lifecycle-controls";
import { RACE_SIZE_OPTIONS } from "@/db/race-schema";
import { isRaceSkillEligible } from "@/features/races/race-skills";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

import {
  createRaceVariant,
  getRace,
  listRaceSkillCandidates,
  listRaces,
  saveRace,
  type RaceAggregate,
  type RaceDraft,
  type RaceLibraryFilters,
  type RaceLibraryResult,
  type RaceSkillCandidate,
  type RaceSummary,
} from "./actions";

type Tab = "overview" | "mechanics" | "anatomy" | "attacks" | "quirk" | "skills" | "culture" | "variants" | "preview";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "mechanics", label: "Mechanics" },
  { id: "anatomy", label: "HP & Hit Locations" },
  { id: "attacks", label: "Natural Attacks" },
  { id: "quirk", label: "Quirk" },
  { id: "skills", label: "Skills & Abilities" },
  { id: "culture", label: "Culture & Play" },
  { id: "variants", label: "Variants" },
  { id: "preview", label: "Preview" },
];

const STANDARD_ATTRIBUTES = ["STR", "DEX", "CON", "INT", "WIS", "CHR"];

function newRaceDraft(): RaceDraft {
  return {
    core: {
      name: "",
      legacyDescription: "",
      physicalCharacteristics: "",
      physicalDescription: "",
      ageRangeText: "",
      ageMin: null,
      ageMax: null,
      size: "Medium",
      baseMagic: null,
      racialQuirkName: "",
      quirkSuccessEffect: "",
      quirkFailureEffect: "",
      commonLanguagesKnown: "",
      commonArchetypes: "",
      genreExamples: "",
      culturalMindset: "",
      outlookOnMagic: "",
      sourceSystem: null,
      sourceExternalId: null,
    },
    attributeCaps: STANDARD_ATTRIBUTES.map((attributeKey, sortOrder) => ({
      attributeKey,
      maxValue: 50,
      sortOrder,
    })),
    movementModes: [],
    naturalProtections: [],
    naturalAttacks: [],
    skillLinks: [],
  };
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <GuidedField label={label} help={fieldHelp("race", label)} className={wide ? "race-field race-field--wide" : "race-field"}>
      {children}
    </GuidedField>
  );
}

export function RaceWorkspace({
  initialLibrary,
  username,
}: {
  initialLibrary: RaceLibraryResult;
  username: string;
}) {
  const [filters, setFilters] = useState<RaceLibraryFilters>({ page: 1, pageSize: 40 });
  const [library, setLibrary] = useState(initialLibrary);
  const [draft, setDraft] = useState<RaceDraft | RaceAggregate | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [dirty, setDirty] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pending, setPending] = useState<{ kind: "open"; race: Pick<RaceSummary, "id"> } | { kind: "new" } | { kind: "variant"; parentId: number; name: string } | null>(null);
  const [creatingVariant, setCreatingVariant] = useState(false);
  const operationBusy = useRef(false);
  const busy = saving || loadingEditor || creatingVariant;
  const preserveScroll = useInPlaceScrollPreservation();
  const archivedAt = draft && "archivedAt" in draft ? draft.archivedAt : null;
  const archiveReason = draft && "archiveReason" in draft ? draft.archiveReason : "";
  const isArchived = Boolean(archivedAt);

  const loadLibrary = useCallback(async (next: RaceLibraryFilters) => {
    setLoadingLibrary(true);
    try {
      setLibrary(await listRaces(next));
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Race Library could not be loaded." });
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void preserveScroll(() => loadLibrary(filters)), 180);
    return () => window.clearTimeout(timer);
  }, [filters, loadLibrary, preserveScroll]);

  async function openRace(summary: Pick<RaceSummary, "id">) {
    if (operationBusy.current) return;
    operationBusy.current = true;
    await preserveScroll(async () => {
      setLoadingEditor(true);
      setFeedback(null);
      try {
        const aggregate = await getRace(summary.id);
        if (!aggregate) throw new Error("Race not found.");
        setDraft(aggregate);
        setDirty(false);
        setActiveTab("overview");
      } catch (error) {
        setFeedback({ kind: "error", message: error instanceof Error ? error.message : "That Race could not be loaded." });
      } finally {
        operationBusy.current = false;
        setLoadingEditor(false);
      }
    });
  }

  function chooseRace(summary: Pick<RaceSummary, "id">) {
    if (operationBusy.current) return;
    if (dirty) void preserveScroll(() => setPending({ kind: "open", race: summary }));
    else void openRace(summary);
  }

  function createNew() {
    setDraft(newRaceDraft());
    setFilters((current) => ({ ...current, archived: false, page: 1 }));
    setDirty(false);
    setFeedback(null);
    setActiveTab("overview");
  }

  function beginNew() {
    if (operationBusy.current) return;
    if (dirty) void preserveScroll(() => setPending({ kind: "new" }));
    else void preserveScroll(createNew);
  }

  function discardAndContinue() {
    const next = pending;
    setPending(null);
    if (!next) return;
    if (next.kind === "new") createNew();
    else if (next.kind === "variant") void createVariantNow(next.parentId, next.name);
    else void openRace(next.race);
  }

  async function createVariantNow(parentId: number, name: string): Promise<boolean> {
    if (operationBusy.current) return false;
    operationBusy.current = true;
    setCreatingVariant(true);
    setFeedback(null);
    try {
      const saved = await createRaceVariant(parentId, name);
      setDraft(saved);
      setDirty(false);
      setFeedback({ kind: "success", message: `${saved.core.name} was created as a variant.` });
      await loadLibrary(filters);
      return true;
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Race variant could not be created." });
      return false;
    } finally {
      operationBusy.current = false;
      setCreatingVariant(false);
    }
  }

  async function requestVariant(name: string): Promise<boolean> {
    if (!draft?.id || operationBusy.current) return false;
    if (dirty) {
      setPending({ kind: "variant", parentId: draft.id, name });
      return false;
    }
    return createVariantNow(draft.id, name);
  }

  function change(next: RaceDraft) {
    if (operationBusy.current) return;
    setDraft(next);
    setDirty(true);
    setFeedback(null);
  }

  async function persist() {
    if (!draft || operationBusy.current) return;
    operationBusy.current = true;
    await preserveScroll(async () => {
      setSaving(true);
      setFeedback(null);
      try {
        const saved = await saveRace(draft);
        setDraft(saved);
        setDirty(false);
        setFeedback({ kind: "success", message: `${saved.core.name} was saved.` });
        await loadLibrary(filters);
      } catch (error) {
        setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Race could not be saved." });
      } finally {
        operationBusy.current = false;
        setSaving(false);
      }
    });
  }

  function changeArchiveView(archived: boolean) {
    if (operationBusy.current) return;
    void preserveScroll(() => {
      setFilters((current) => ({ ...current, archived, page: 1 }));
      setDraft(null);
      setDirty(false);
      setFeedback(null);
    });
  }

  async function lifecycleCompleted(event: { action: "archive" | "restore" | "delete" }) {
    const name = draft?.core.name || "Race";
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
    await loadLibrary(filters);
  }

  return (
    <main className="skills-page races-page">
      <header className="skills-page__header">
        <div className="skills-page__brand">
          <Link href="/heavens" className="font-evanescent race-brand">SERRIAN<br />TIDE</Link>
        </div>
        <div className="skills-page__title">
          <p>THE HEAVENS / RACES</p>
          <h1>Races</h1>
          <span>G.O.D. archive · {username}</span>
        </div>
        <div className="skills-page__navigation"><Link href="/heavens">Back to The Heavens</Link></div>
      </header>

      <div className="skills-workspace races-workspace">
        <aside className="skill-library">
          <div className="skill-library__heading">
            <div><p>MASTER CONTENT</p><h2>Race Library</h2></div>
            <button className="skills-primary-button" type="button" disabled={busy} onClick={beginNew}>New Race</button>
          </div>
          <div className="skill-library__search">
            <label htmlFor="race-search">Search</label>
            <input id="race-search" type="search" value={filters.search ?? ""} placeholder="Search by name" onChange={(event) => setFilters({ ...filters, search: event.target.value, page: 1 })} />
          </div>
          <div className="skill-library__filters race-library-filters">
            <label><span>Size</span><select value={filters.size ?? ""} onChange={(event) => setFilters({ ...filters, size: event.target.value as RaceLibraryFilters["size"], page: 1 })}><option value="">All</option>{RACE_SIZE_OPTIONS.map((size) => <option key={size}>{size}</option>)}</select></label>
          </div>
          <div className="skill-library__toolbar">
            <div className="skill-library__view-toggle" aria-label="Race lifecycle view">
              <button type="button" className={!filters.archived ? "is-active" : ""} aria-pressed={!filters.archived} disabled={dirty} onClick={() => changeArchiveView(false)}>Active</button>
              <button type="button" className={filters.archived ? "is-active" : ""} aria-pressed={Boolean(filters.archived)} disabled={dirty} onClick={() => changeArchiveView(true)}>Archived</button>
            </div>
            <span>{library.total.toLocaleString()} races</span>
          </div>
          <div data-preserve-scroll="race-library-results" className={`skill-library__results${loadingLibrary ? " is-loading" : ""}`}>
            {library.items.map((entry) => (
              <button key={entry.id} type="button" className={`skill-library__row${draft?.id === entry.id ? " is-selected" : ""}`} onClick={() => chooseRace(entry)}>
                <span className="skill-library__row-name">{entry.name}</span>
                {entry.archivedAt ? <span className="skill-library__row-status">Archived</span> : null}
                <span className="skill-library__row-meta">{entry.size || "Size N/A"}{entry.ageRangeText ? ` · ${entry.ageRangeText}` : ""}</span>
                <span className="skill-library__row-parents">{entry.attributeCapCount} caps · {entry.movementModeCount} movement · {entry.skillLinkCount} skill links</span>
              </button>
            ))}
            {!library.items.length && !loadingLibrary ? <p className="skill-library__empty">No Races match this view.</p> : null}
          </div>
          <nav className="skill-library__pagination">
            <button type="button" disabled={library.page <= 1 || loadingLibrary} onClick={() => setFilters({ ...filters, page: library.page - 1 })}>Previous</button>
            <span>Page {library.page} of {library.pageCount}</span>
            <button type="button" disabled={library.page >= library.pageCount || loadingLibrary} onClick={() => setFilters({ ...filters, page: library.page + 1 })}>Next</button>
          </nav>
        </aside>

        {loadingEditor ? (
          <section className="skill-editor skill-editor--empty"><p>LOADING RACE</p></section>
        ) : draft ? (
          <section className="skill-editor race-editor">
            <header className="skill-editor__header">
              <div><p>{draft.id ? `RACE ${draft.id}` : "NEW RACE DRAFT"}</p><h2>{draft.core.name || "Untitled Race"}</h2><span>{isArchived ? `Archived${archiveReason ? ` · ${archiveReason}` : ""}` : dirty ? "Unsaved changes" : draft.id ? "Saved" : "Not yet persisted"}</span></div>
              <div className="skill-editor__actions">
                {draft.id ? <LifecycleControls target={{ entityKind: "race", entityId: draft.id }} archived={isArchived} disabled={busy || dirty} onCompleted={lifecycleCompleted} /> : null}
                <button className="skills-primary-button" type="button" disabled={busy || isArchived} onClick={() => void persist()}>{saving ? "Saving…" : "Save Race"}</button>
              </div>
            </header>
            {feedback ? <p className={`skill-editor__feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
            <nav className="skill-editor__tabs">{TABS.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : ""} onClick={() => void preserveScroll(() => setActiveTab(tab.id))}>{tab.label}</button>)}</nav>
            {activeTab === "variants" ? <div className="skill-editor__content race-editor__content"><Variants key={draft.id ?? "new"} draft={draft} busy={busy} archived={isArchived} onOpen={chooseRace} onCreate={requestVariant} /></div> : null}
            <fieldset className="skill-editor__content race-editor__content lifecycle-editor-fields" disabled={isArchived || busy} hidden={activeTab === "variants"}>
              {activeTab === "overview" ? <Overview draft={draft} onChange={change} /> : null}
              {activeTab === "mechanics" ? <Mechanics draft={draft} onChange={change} /> : null}
              {activeTab === "anatomy" ? <RaceAnatomyEditor value={draft.core.anatomy ?? null} onChange={(anatomy) => change({ ...draft, core: { ...draft.core, anatomy } })} /> : null}
              {activeTab === "attacks" ? <RaceNaturalAttacksEditor value={draft.naturalAttacks ?? []} anatomy={draft.core.anatomy ?? null} skillOptions={draft.skillLinks.map(row => ({ id: row.skillId, name: row.skillName }))} onChange={naturalAttacks => change({ ...draft, naturalAttacks })} /> : null}
              {activeTab === "quirk" ? <Quirk draft={draft} onChange={change} /> : null}
              {activeTab === "skills" ? <Skills draft={draft} onChange={change} /> : null}
              {activeTab === "culture" ? <Culture draft={draft} onChange={change} /> : null}
              {activeTab === "preview" ? <Preview draft={draft} /> : null}
            </fieldset>
          </section>
        ) : (
          <section className="skill-editor skill-editor--empty"><p>RACE EDITOR</p><h2>Select a Race or begin a new one.</h2><span>Complete Race aggregates open here.</span></section>
        )}
      </div>

      {pending ? <div className="skills-page__discard-confirm"><div><p>Unsaved changes</p><span>{pending.kind === "variant" ? "Discard the unsaved changes and clone the last saved Race definition? Keep Editing to save your changes first." : "Leave this Race draft and discard the unsaved changes?"}</span></div><div className="skills-page__discard-actions"><button type="button" onClick={() => void preserveScroll(() => setPending(null))}>Keep Editing</button><button className="skills-danger-button" type="button" onClick={() => void preserveScroll(discardAndContinue)}>Discard Changes</button></div></div> : null}
    </main>
  );
}

function Variants({ draft, busy, archived, onOpen, onCreate }: {
  draft: RaceDraft | RaceAggregate;
  busy: boolean;
  archived: boolean;
  onOpen: (race: Pick<RaceSummary, "id">) => void;
  onCreate: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const variants = "variants" in draft ? draft.variants : [];
  return <section className="race-section" aria-label="Race Variants">
    <div className="race-subheading"><div><p>COPY ON CREATE</p><h3>Race Variants</h3></div></div>
    <p className="race-help">A Variant starts as an independent copy of this Race&apos;s saved definition. Later edits to either Race do not change the other.</p>
    {draft.core.parentRaceId ? <p>Variant of <button className="st-button" type="button" disabled={busy} onClick={() => onOpen({ id: draft.core.parentRaceId! })}>{draft.core.parentRaceName ?? `Race ${draft.core.parentRaceId}`}</button></p> : null}
    {!draft.id ? <p>Save this Race before creating variants.</p> : archived ? <p>Restore this Race before creating a Variant.</p> : <div className="race-variant-create">
      <Field label="Variant Name"><input placeholder="Variant name" value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></Field>
      <button className="skills-primary-button" type="button" disabled={busy || !name.trim()} onClick={async () => { if (await onCreate(name)) setName(""); }}>{busy ? "Cloning…" : "Clone as Variant"}</button>
    </div>}
    <div className="race-variant-list">{variants.map((variant) => <button className="st-button" key={variant.id} type="button" disabled={busy} onClick={() => onOpen(variant)}><strong>{variant.name}</strong><span>{variant.archivedAt ? "Archived · " : ""}Race {variant.id}</span></button>)}</div>
    {draft.id && !variants.length ? <p className="race-help">No direct Variants yet.</p> : null}
  </section>;
}

function Overview({ draft, onChange }: { draft: RaceDraft; onChange: (draft: RaceDraft) => void }) {
  const core = draft.core;
  const setCore = (update: Partial<RaceDraft["core"]>) => onChange({ ...draft, core: { ...core, ...update } });
  return <div className="race-section">
    <div className="skill-editor__intro"><p>Identity, physical description, age, and broad Race information.</p></div>
    <div className="race-form-grid">
      <Field label="Name" wide><input value={core.name} onChange={(e) => setCore({ name: e.target.value })} /></Field>
      <Field label="Description" wide><textarea rows={6} value={core.legacyDescription} onChange={(e) => setCore({ legacyDescription: e.target.value })} /></Field>
      <Field label="Size"><select value={core.size} onChange={(e) => setCore({ size: e.target.value })}>{RACE_SIZE_OPTIONS.map((size) => <option key={size}>{size}</option>)}</select></Field>
      <Field label="Age Range Text"><input value={core.ageRangeText} onChange={(e) => setCore({ ageRangeText: e.target.value })} /></Field>
      <Field label="Minimum Age"><input type="number" min={0} value={core.ageMin ?? ""} onChange={(e) => setCore({ ageMin: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
      <Field label="Maximum Age"><input type="number" min={0} value={core.ageMax ?? ""} onChange={(e) => setCore({ ageMax: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
      <Field label="Physical Characteristics" wide><textarea rows={5} value={core.physicalCharacteristics} onChange={(e) => setCore({ physicalCharacteristics: e.target.value })} /></Field>
      <Field label="Physical Description" wide><textarea rows={5} value={core.physicalDescription} onChange={(e) => setCore({ physicalDescription: e.target.value })} /></Field>
    </div>
  </div>;
}

function Mechanics({ draft, onChange }: { draft: RaceDraft; onChange: (draft: RaceDraft) => void }) {
  const preserveScroll = useInPlaceScrollPreservation();
  return <div className="race-section">
    <div className="race-form-grid"><Field label="Base Magic"><input type="number" step="any" value={draft.core.baseMagic ?? ""} onChange={(e) => onChange({ ...draft, core: { ...draft.core, baseMagic: e.target.value === "" ? null : Number(e.target.value) } })} /></Field></div>
    <p className="race-help">Racial Mana multiplier: a supernatural Skill Mana value of 5 with Base Magic 3 produces 15 Mana. Characters advance Base Magic through Quintessence.</p>
    <div className="race-subheading"><div><p>RACIAL LIMITS</p><h3>Attribute Caps</h3></div><button type="button" onClick={() => void preserveScroll(() => onChange({ ...draft, attributeCaps: [...draft.attributeCaps, { attributeKey: "", maxValue: 50, sortOrder: draft.attributeCaps.length }] }))}>Add Attribute</button></div>
    <div className="race-row-list">{draft.attributeCaps.map((cap, index) => <div className="race-repeat-row" key={`${cap.attributeKey}-${index}`}>
      <Field label="Attribute"><input placeholder="Attribute" value={cap.attributeKey} onChange={(e) => onChange({ ...draft, attributeCaps: draft.attributeCaps.map((entry, i) => i === index ? { ...entry, attributeKey: e.target.value } : entry) })} /></Field>
      <Field label="Attribute Cap"><input type="number" value={cap.maxValue} onChange={(e) => onChange({ ...draft, attributeCaps: draft.attributeCaps.map((entry, i) => i === index ? { ...entry, maxValue: Number(e.target.value) } : entry) })} /></Field>
      <button className="is-danger" type="button" onClick={() => void preserveScroll(() => onChange({ ...draft, attributeCaps: draft.attributeCaps.filter((_, i) => i !== index) }))}>Remove</button>
    </div>)}</div>
    <div className="race-subheading race-subheading--spaced"><div><p>MOVEMENT</p><h3>Movement Modes</h3></div><button type="button" onClick={() => void preserveScroll(() => onChange({ ...draft, movementModes: [...draft.movementModes, { movementMode: "Land", baseValue: 0, notes: "", sortOrder: draft.movementModes.length }] }))}>Add Movement</button></div>
    <div className="race-row-list">{draft.movementModes.map((movement, index) => <div className="race-repeat-row race-repeat-row--movement" key={`${movement.movementMode}-${index}`}>
      <Field label="Movement Mode"><input placeholder="Movement Mode" value={movement.movementMode} onChange={(e) => onChange({ ...draft, movementModes: draft.movementModes.map((entry, i) => i === index ? { ...entry, movementMode: e.target.value } : entry) })} /></Field>
      <Field label="Base Movement"><input type="number" placeholder="Base Movement" value={movement.baseValue} onChange={(e) => onChange({ ...draft, movementModes: draft.movementModes.map((entry, i) => i === index ? { ...entry, baseValue: Number(e.target.value) } : entry) })} /></Field>
      <Field label="Notes"><input placeholder="Notes" value={movement.notes} onChange={(e) => onChange({ ...draft, movementModes: draft.movementModes.map((entry, i) => i === index ? { ...entry, notes: e.target.value } : entry) })} /></Field>
      <button className="is-danger" type="button" onClick={() => void preserveScroll(() => onChange({ ...draft, movementModes: draft.movementModes.filter((_, i) => i !== index) }))}>Remove</button>
    </div>)}</div>
    <RaceNaturalProtectionEditor value={draft.naturalProtections ?? []} locations={raceHitLocations(draft.core.anatomy)} onChange={(naturalProtections) => onChange({ ...draft, naturalProtections })} />
    <InteractionRulesEditor owner="race" value={draft.core.interactionRules} onChange={(interactionRules) => onChange({ ...draft, core: { ...draft.core, interactionRules } })} />
  </div>;
}

function Quirk({ draft, onChange }: { draft: RaceDraft; onChange: (draft: RaceDraft) => void }) {
  const core = draft.core;
  const setCore = (update: Partial<RaceDraft["core"]>) => onChange({ ...draft, core: { ...core, ...update } });
  return <div className="race-section race-form-grid">
    <Field label="Racial Quirk Name" wide><input value={core.racialQuirkName} onChange={(e) => setCore({ racialQuirkName: e.target.value })} /></Field>
    <Field label="Success Effect" wide><textarea rows={8} value={core.quirkSuccessEffect} onChange={(e) => setCore({ quirkSuccessEffect: e.target.value })} /></Field>
    <Field label="Failure Effect" wide><textarea rows={8} value={core.quirkFailureEffect} onChange={(e) => setCore({ quirkFailureEffect: e.target.value })} /></Field>
  </div>;
}

function Skills({ draft, onChange }: { draft: RaceDraft; onChange: (draft: RaceDraft) => void }) {
  const [search, setSearch] = useState("");
  const [classification, setClassification] = useState("");
  const [candidates, setCandidates] = useState<RaceSkillCandidate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [linkType, setLinkType] = useState("Skill");
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const preserveScroll = useInPlaceScrollPreservation();

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      listRaceSkillCandidates(search, classification || undefined)
        .then((rows) => { if (active) { setCandidates(rows); setSearchError(""); } })
        .catch(() => { if (active) { setCandidates([]); setSearchError("Skill search failed. Please try again."); } })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search, classification]);

  const classifications = useMemo(() => ["", "standard", "special ability", "sphere", "spell", "discipline", "psionic skill", "resonance", "reverberation"], []);

  function addLink() {
    const candidate = candidates.find(({ id }) => id === Number(selectedId));
    if (!candidate || loading || !isRaceSkillEligible(candidate)) return;
    if (draft.skillLinks.some((link) => link.skillId === candidate.id && link.linkType.toLowerCase() === linkType.toLowerCase())) return;
    onChange({ ...draft, skillLinks: [...draft.skillLinks, {
      skillId: candidate.id,
      skillName: candidate.name,
      skillClassification: candidate.classification,
      linkType,
      value: null,
      sortOrder: draft.skillLinks.length,
    }] });
    setSelectedId("");
  }

  return <div className="race-section">
    <div className="skill-editor__intro"><p>Skills link to the shared Skill Library. “Granted” entries must be Special Abilities.</p></div>
    <div className="race-skill-picker">
      <Field label="Search"><input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setSelectedId(""); setCandidates([]); setLoading(true); }} /></Field>
      <Field label="Classification"><select value={classification} onChange={(e) => { setClassification(e.target.value); setSelectedId(""); setCandidates([]); setLoading(true); }}>{classifications.map((value) => <option value={value} key={value}>{value || "All"}</option>)}</select></Field>
      <Field label="Matching Skills"><select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}><option value="">{loading ? "Searching…" : "Select a Skill"}</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.classification}{candidate.tier ? ` · T${candidate.tier}` : ""}</option>)}</select></Field>
      <Field label="Link Type"><select value={linkType} onChange={(e) => setLinkType(e.target.value)}><option>Skill</option><option>Granted</option></select></Field>
      <button className="skills-primary-button race-add-link" type="button" disabled={!selectedId || loading} onClick={() => void preserveScroll(addLink)}>Add Link</button>
    </div>
    {searchError ? <p role="alert">{searchError}</p> : null}
    <div className="race-row-list race-skill-links">{draft.skillLinks.map((link, index) => <article className="race-skill-link" key={`${link.skillId}-${link.linkType}-${index}`}>
      <div><strong>{link.skillName}</strong><span>{link.skillClassification}</span></div>
      <select value={link.linkType} onChange={(e) => onChange({ ...draft, skillLinks: draft.skillLinks.map((entry, i) => i === index ? { ...entry, linkType: e.target.value } : entry) })}><option>Skill</option><option>Granted</option></select>
      <Field label="Link Value"><input type="number" placeholder="Value" value={link.value ?? ""} onChange={(e) => onChange({ ...draft, skillLinks: draft.skillLinks.map((entry, i) => i === index ? { ...entry, value: e.target.value === "" ? null : Number(e.target.value) } : entry) })} /></Field>
      <button className="is-danger" type="button" onClick={() => void preserveScroll(() => onChange({ ...draft, skillLinks: draft.skillLinks.filter((_, i) => i !== index) }))}>Remove</button>
    </article>)}</div>
  </div>;
}

function Culture({ draft, onChange }: { draft: RaceDraft; onChange: (draft: RaceDraft) => void }) {
  const core = draft.core;
  const setCore = (update: Partial<RaceDraft["core"]>) => onChange({ ...draft, core: { ...core, ...update } });
  return <div className="race-section race-form-grid">
    <Field label="Common Languages Known" wide><textarea rows={4} value={core.commonLanguagesKnown} onChange={(e) => setCore({ commonLanguagesKnown: e.target.value })} /></Field>
    <Field label="Common Archetypes" wide><textarea rows={4} value={core.commonArchetypes} onChange={(e) => setCore({ commonArchetypes: e.target.value })} /></Field>
    <Field label="Genre Examples" wide><textarea rows={4} value={core.genreExamples} onChange={(e) => setCore({ genreExamples: e.target.value })} /></Field>
    <Field label="Cultural Mindset" wide><textarea rows={6} value={core.culturalMindset} onChange={(e) => setCore({ culturalMindset: e.target.value })} /></Field>
    <Field label="Outlook on Magic" wide><textarea rows={6} value={core.outlookOnMagic} onChange={(e) => setCore({ outlookOnMagic: e.target.value })} /></Field>
  </div>;
}

function Preview({ draft }: { draft: RaceDraft }) {
  return <article className="race-preview">
    <header><p>{draft.core.size || "Race"}</p><h3>{draft.core.name || "Untitled Race"}</h3><span>{draft.core.ageRangeText || "Age range not specified"}</span></header>
    <section><h4>Description</h4><p>{draft.core.legacyDescription || "No description yet."}</p></section>
    <div className="race-preview__grid"><section><h4>Physical</h4><p>{draft.core.physicalDescription || draft.core.physicalCharacteristics || "No physical description."}</p></section><section><h4>Quirk</h4><strong>{draft.core.racialQuirkName || "None"}</strong><p>{draft.core.quirkSuccessEffect || "No success effect."}</p><p>{draft.core.quirkFailureEffect || "No failure effect."}</p></section></div>
    <section><h4>Attribute Caps</h4><div className="race-preview__chips">{draft.attributeCaps.map((cap) => <span key={cap.attributeKey}>{cap.attributeKey} {cap.maxValue}</span>)}</div></section>
    <section><h4>HP &amp; Hit Locations</h4>{draft.core.anatomy ? <><div className="race-preview__chips">{draft.core.anatomy.hpPools.map((pool) => <span key={pool.canonicalId}>{pool.poolName}: {pool.hpPercentage ?? "Unassigned"}%</span>)}</div><ul>{draft.core.anatomy.hitLocations.map((location) => <li key={location.hitLocationNumber}>{location.hitLocationNumber}: {location.locationName} — {draft.core.anatomy!.hpPools.find((pool) => pool.canonicalId === location.hpPoolCanonicalId)?.poolName ?? "No HP Pool"}{location.locationEffect ? ` · ${location.locationEffect}` : ""}</li>)}</ul></> : <p>Standard humanoid HP pools and hit locations.</p>}</section>
    <section><h4>Movement</h4><div className="race-preview__chips">{draft.movementModes.map((mode, index) => <span key={`${mode.movementMode}-${index}`}>{mode.movementMode} {mode.baseValue}</span>)}</div></section>
    <section><h4>Skills & Abilities</h4>{draft.skillLinks.length ? <ul>{draft.skillLinks.map((link, index) => <li key={`${link.skillId}-${index}`}><strong>{link.skillName}</strong> <span>{link.linkType}{link.value !== null ? ` · ${link.value}` : ""}</span></li>)}</ul> : <p>No linked Skills.</p>}</section>
    <div className="race-preview__grid"><section><h4>Culture</h4><p>{draft.core.culturalMindset || "Not specified."}</p></section><section><h4>Magic</h4><p>{draft.core.outlookOnMagic || "Not specified."}</p></section></div>
  </article>;
}
