"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { RACE_SIZE_OPTIONS } from "@/db/race-schema";

import {
  deleteRace,
  getRace,
  listRaceSkillCandidates,
  listRaces,
  saveRace,
  type RaceDraft,
  type RaceLibraryFilters,
  type RaceLibraryResult,
  type RaceSkillCandidate,
  type RaceSummary,
} from "./actions";

type Tab = "overview" | "mechanics" | "quirk" | "skills" | "culture" | "preview";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "mechanics", label: "Attributes & Movement" },
  { id: "quirk", label: "Quirk" },
  { id: "skills", label: "Skills & Abilities" },
  { id: "culture", label: "Culture & Play" },
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
    <label className={wide ? "race-field race-field--wide" : "race-field"}>
      <span>{label}</span>
      {children}
    </label>
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
  const [draft, setDraft] = useState<RaceDraft | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [dirty, setDirty] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pending, setPending] = useState<{ kind: "open"; race: RaceSummary } | { kind: "new" } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    const timer = window.setTimeout(() => void loadLibrary(filters), 180);
    return () => window.clearTimeout(timer);
  }, [filters, loadLibrary]);

  async function openRace(summary: RaceSummary) {
    setLoadingEditor(true);
    setFeedback(null);
    try {
      const aggregate = await getRace(summary.id);
      if (!aggregate) throw new Error("Race not found.");
      setDraft(aggregate);
      setDirty(false);
      setActiveTab("overview");
      setConfirmDelete(false);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "That Race could not be loaded." });
    } finally {
      setLoadingEditor(false);
    }
  }

  function chooseRace(summary: RaceSummary) {
    if (dirty) setPending({ kind: "open", race: summary });
    else void openRace(summary);
  }

  function createNew() {
    setDraft(newRaceDraft());
    setDirty(false);
    setFeedback(null);
    setActiveTab("overview");
    setConfirmDelete(false);
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
    else void openRace(next.race);
  }

  function change(next: RaceDraft) {
    setDraft(next);
    setDirty(true);
    setFeedback(null);
  }

  async function persist() {
    if (!draft) return;
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
      setSaving(false);
    }
  }

  async function removeRace() {
    if (!draft?.id) return;
    setSaving(true);
    try {
      const name = draft.core.name;
      await deleteRace(draft.id);
      setDraft(null);
      setDirty(false);
      setConfirmDelete(false);
      setFeedback({ kind: "success", message: `${name} was deleted.` });
      await loadLibrary(filters);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Race could not be deleted." });
    } finally {
      setSaving(false);
    }
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
            <button className="skills-primary-button" type="button" onClick={beginNew}>New Race</button>
          </div>
          <div className="skill-library__search">
            <label htmlFor="race-search">Search</label>
            <input id="race-search" type="search" value={filters.search ?? ""} placeholder="Search by name" onChange={(event) => setFilters({ ...filters, search: event.target.value, page: 1 })} />
          </div>
          <div className="skill-library__filters race-library-filters">
            <label><span>Size</span><select value={filters.size ?? ""} onChange={(event) => setFilters({ ...filters, size: event.target.value as RaceLibraryFilters["size"], page: 1 })}><option value="">All</option>{RACE_SIZE_OPTIONS.map((size) => <option key={size}>{size}</option>)}</select></label>
          </div>
          <div className="skill-library__toolbar"><span>{library.total.toLocaleString()} races</span></div>
          <div className={`skill-library__results${loadingLibrary ? " is-loading" : ""}`}>
            {library.items.map((entry) => (
              <button key={entry.id} type="button" className={`skill-library__row${draft?.id === entry.id ? " is-selected" : ""}`} onClick={() => chooseRace(entry)}>
                <span className="skill-library__row-name">{entry.name}</span>
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
              <div><p>{draft.id ? `RACE ${draft.id}` : "NEW RACE DRAFT"}</p><h2>{draft.core.name || "Untitled Race"}</h2><span>{dirty ? "Unsaved changes" : draft.id ? "Saved" : "Not yet persisted"}</span></div>
              <div className="skill-editor__actions">
                {draft.id && !confirmDelete ? <button className="skills-danger-button" type="button" onClick={() => setConfirmDelete(true)}>Delete</button> : null}
                <button className="skills-primary-button" type="button" disabled={saving} onClick={() => void persist()}>{saving ? "Saving…" : "Save Race"}</button>
              </div>
            </header>
            {confirmDelete ? <div className="skill-editor__delete-confirm"><div><strong>Delete {draft.core.name || "this Race"}?</strong><span>Race-owned caps, movement, and Skill links will be removed.</span></div><button className="skills-danger-button" type="button" onClick={() => void removeRace()}>Confirm Delete</button><button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button></div> : null}
            {feedback ? <p className={`skill-editor__feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
            <nav className="skill-editor__tabs">{TABS.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : ""} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</nav>
            <div className="skill-editor__content race-editor__content">
              {activeTab === "overview" ? <Overview draft={draft} onChange={change} /> : null}
              {activeTab === "mechanics" ? <Mechanics draft={draft} onChange={change} /> : null}
              {activeTab === "quirk" ? <Quirk draft={draft} onChange={change} /> : null}
              {activeTab === "skills" ? <Skills draft={draft} onChange={change} /> : null}
              {activeTab === "culture" ? <Culture draft={draft} onChange={change} /> : null}
              {activeTab === "preview" ? <Preview draft={draft} /> : null}
            </div>
          </section>
        ) : (
          <section className="skill-editor skill-editor--empty"><p>RACE EDITOR</p><h2>Select a Race or begin a new one.</h2><span>Complete Race aggregates open here.</span></section>
        )}
      </div>

      {pending ? <div className="skills-page__discard-confirm"><div><p>Unsaved changes</p><span>Leave this Race draft and discard the unsaved changes?</span></div><div className="skills-page__discard-actions"><button type="button" onClick={() => setPending(null)}>Keep Editing</button><button className="skills-danger-button" type="button" onClick={discardAndContinue}>Discard Changes</button></div></div> : null}
    </main>
  );
}

function Overview({ draft, onChange }: { draft: RaceDraft; onChange: (draft: RaceDraft) => void }) {
  const core = draft.core;
  const setCore = (update: Partial<RaceDraft["core"]>) => onChange({ ...draft, core: { ...core, ...update } });
  return <div className="race-section">
    <div className="skill-editor__intro"><p>Identity, physical description, age, and broad Race information.</p></div>
    <div className="race-form-grid">
      <Field label="Name" wide><input value={core.name} onChange={(e) => setCore({ name: e.target.value })} /></Field>
      <Field label="Size"><select value={core.size} onChange={(e) => setCore({ size: e.target.value })}>{RACE_SIZE_OPTIONS.map((size) => <option key={size}>{size}</option>)}</select></Field>
      <Field label="Base Magic"><input type="number" value={core.baseMagic ?? ""} onChange={(e) => setCore({ baseMagic: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
      <Field label="Age Range Text"><input value={core.ageRangeText} onChange={(e) => setCore({ ageRangeText: e.target.value })} /></Field>
      <Field label="Minimum Age"><input type="number" min={0} value={core.ageMin ?? ""} onChange={(e) => setCore({ ageMin: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
      <Field label="Maximum Age"><input type="number" min={0} value={core.ageMax ?? ""} onChange={(e) => setCore({ ageMax: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
      <Field label="Physical Characteristics" wide><textarea rows={5} value={core.physicalCharacteristics} onChange={(e) => setCore({ physicalCharacteristics: e.target.value })} /></Field>
      <Field label="Physical Description" wide><textarea rows={5} value={core.physicalDescription} onChange={(e) => setCore({ physicalDescription: e.target.value })} /></Field>
      <Field label="Legacy Description" wide><textarea rows={5} value={core.legacyDescription} onChange={(e) => setCore({ legacyDescription: e.target.value })} /></Field>
    </div>
  </div>;
}

function Mechanics({ draft, onChange }: { draft: RaceDraft; onChange: (draft: RaceDraft) => void }) {
  return <div className="race-section">
    <div className="race-subheading"><div><p>RACIAL LIMITS</p><h3>Attribute Caps</h3></div><button type="button" onClick={() => onChange({ ...draft, attributeCaps: [...draft.attributeCaps, { attributeKey: "", maxValue: 50, sortOrder: draft.attributeCaps.length }] })}>Add Attribute</button></div>
    <div className="race-row-list">{draft.attributeCaps.map((cap, index) => <div className="race-repeat-row" key={`${cap.attributeKey}-${index}`}>
      <input placeholder="Attribute" value={cap.attributeKey} onChange={(e) => onChange({ ...draft, attributeCaps: draft.attributeCaps.map((entry, i) => i === index ? { ...entry, attributeKey: e.target.value } : entry) })} />
      <input type="number" value={cap.maxValue} onChange={(e) => onChange({ ...draft, attributeCaps: draft.attributeCaps.map((entry, i) => i === index ? { ...entry, maxValue: Number(e.target.value) } : entry) })} />
      <button className="is-danger" type="button" onClick={() => onChange({ ...draft, attributeCaps: draft.attributeCaps.filter((_, i) => i !== index) })}>Remove</button>
    </div>)}</div>
    <div className="race-subheading race-subheading--spaced"><div><p>MOVEMENT</p><h3>Movement Modes</h3></div><button type="button" onClick={() => onChange({ ...draft, movementModes: [...draft.movementModes, { movementMode: "Land", baseValue: 0, notes: "", sortOrder: draft.movementModes.length }] })}>Add Movement</button></div>
    <div className="race-row-list">{draft.movementModes.map((movement, index) => <div className="race-repeat-row race-repeat-row--movement" key={`${movement.movementMode}-${index}`}>
      <input placeholder="Mode" value={movement.movementMode} onChange={(e) => onChange({ ...draft, movementModes: draft.movementModes.map((entry, i) => i === index ? { ...entry, movementMode: e.target.value } : entry) })} />
      <input type="number" placeholder="Base" value={movement.baseValue} onChange={(e) => onChange({ ...draft, movementModes: draft.movementModes.map((entry, i) => i === index ? { ...entry, baseValue: Number(e.target.value) } : entry) })} />
      <input placeholder="Notes" value={movement.notes} onChange={(e) => onChange({ ...draft, movementModes: draft.movementModes.map((entry, i) => i === index ? { ...entry, notes: e.target.value } : entry) })} />
      <button className="is-danger" type="button" onClick={() => onChange({ ...draft, movementModes: draft.movementModes.filter((_, i) => i !== index) })}>Remove</button>
    </div>)}</div>
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

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      listRaceSkillCandidates(search, classification || undefined)
        .then((rows) => { if (active) setCandidates(rows); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search, classification]);

  const classifications = useMemo(() => ["", "standard", "special ability", "sphere", "spell", "discipline", "psionic skill", "resonance", "reverberation"], []);

  function addLink() {
    const candidate = candidates.find(({ id }) => id === Number(selectedId));
    if (!candidate) return;
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
      <Field label="Search"><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
      <Field label="Classification"><select value={classification} onChange={(e) => setClassification(e.target.value)}>{classifications.map((value) => <option value={value} key={value}>{value || "All"}</option>)}</select></Field>
      <Field label="Matching Skills"><select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}><option value="">{loading ? "Searching…" : "Select a Skill"}</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.classification}{candidate.tier ? ` · T${candidate.tier}` : ""}</option>)}</select></Field>
      <Field label="Link Type"><select value={linkType} onChange={(e) => setLinkType(e.target.value)}><option>Skill</option><option>Granted</option></select></Field>
      <button className="skills-primary-button race-add-link" type="button" disabled={!selectedId} onClick={addLink}>Add Link</button>
    </div>
    <div className="race-row-list race-skill-links">{draft.skillLinks.map((link, index) => <article className="race-skill-link" key={`${link.skillId}-${link.linkType}-${index}`}>
      <div><strong>{link.skillName}</strong><span>{link.skillClassification}</span></div>
      <select value={link.linkType} onChange={(e) => onChange({ ...draft, skillLinks: draft.skillLinks.map((entry, i) => i === index ? { ...entry, linkType: e.target.value } : entry) })}><option>Skill</option><option>Granted</option></select>
      <input type="number" placeholder="Value" value={link.value ?? ""} onChange={(e) => onChange({ ...draft, skillLinks: draft.skillLinks.map((entry, i) => i === index ? { ...entry, value: e.target.value === "" ? null : Number(e.target.value) } : entry) })} />
      <button className="is-danger" type="button" onClick={() => onChange({ ...draft, skillLinks: draft.skillLinks.filter((_, i) => i !== index) })}>Remove</button>
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
    <div className="race-preview__grid"><section><h4>Physical</h4><p>{draft.core.physicalDescription || draft.core.physicalCharacteristics || "No physical description."}</p></section><section><h4>Quirk</h4><strong>{draft.core.racialQuirkName || "None"}</strong><p>{draft.core.quirkSuccessEffect || "No success effect."}</p><p>{draft.core.quirkFailureEffect || "No failure effect."}</p></section></div>
    <section><h4>Attribute Caps</h4><div className="race-preview__chips">{draft.attributeCaps.map((cap) => <span key={cap.attributeKey}>{cap.attributeKey} {cap.maxValue}</span>)}</div></section>
    <section><h4>Movement</h4><div className="race-preview__chips">{draft.movementModes.map((mode, index) => <span key={`${mode.movementMode}-${index}`}>{mode.movementMode} {mode.baseValue}</span>)}</div></section>
    <section><h4>Skills & Abilities</h4>{draft.skillLinks.length ? <ul>{draft.skillLinks.map((link, index) => <li key={`${link.skillId}-${index}`}><strong>{link.skillName}</strong> <span>{link.linkType}{link.value !== null ? ` · ${link.value}` : ""}</span></li>)}</ul> : <p>No linked Skills.</p>}</section>
    <div className="race-preview__grid"><section><h4>Culture</h4><p>{draft.core.culturalMindset || "Not specified."}</p></section><section><h4>Magic</h4><p>{draft.core.outlookOnMagic || "Not specified."}</p></section></div>
  </article>;
}
