"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GuidedField } from "@/components/field-guidance";
import { fieldHelp } from "@/features/guidance/field-help";
import { isRaceSkillEligible } from "@/features/races/race-skills";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";
import { listRaceSkillCandidates, type RaceDraft, type RaceSkillCandidate } from "./actions";

function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return <GuidedField className="race-field" label={label} help={help ?? fieldHelp("race", label)}>{children}</GuidedField>;
}

export function RaceSkillLinksEditor({ draft, onChange, authoringOnly = false }: { draft: Pick<RaceDraft, "skillLinks">; onChange: (draft: Pick<RaceDraft, "skillLinks">) => void; authoringOnly?: boolean }) {
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
    <div className="skill-editor__intro">{authoringOnly && <p>These Form additions preserve Race grants and learned Character Skills. These choices are shown in preview only; no actual Skill points or abilities change.</p>}<p>Choose Skills from the shared Skill Library. “Granted” entries must be Special Abilities.</p></div>
    <div className="race-skill-picker">
      <Field label="Search"><input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setSelectedId(""); setCandidates([]); setLoading(true); }} /></Field>
      <Field label="Classification"><select value={classification} onChange={(e) => { setClassification(e.target.value); setSelectedId(""); setCandidates([]); setLoading(true); }}>{classifications.map((value) => <option value={value} key={value}>{value || "All"}</option>)}</select></Field>
      <Field label="Matching Skills"><select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}><option value="">{loading ? "Searching…" : "Select a Skill"}</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.classification}{candidate.tier ? ` · T${candidate.tier}` : ""}</option>)}</select></Field>
      <Field label={authoringOnly ? "What does this Form provide?" : "Link Type"} help={authoringOnly ? "Choose a Skill predisposition or a granted Special Ability. These add to normal Race choices; they do not replace learned Skills." : undefined}><select value={linkType} onChange={(e) => setLinkType(e.target.value)}><option value="Skill">{authoringOnly ? "Skill predisposition" : "Skill"}</option><option value="Granted">{authoringOnly ? "Granted Special Ability" : "Granted"}</option></select></Field>
      <button className="skills-primary-button race-add-link" type="button" disabled={!selectedId || loading} onClick={() => void preserveScroll(addLink)}>{authoringOnly ? "Add Skill or Ability" : "Add Link"}</button>
    </div>
    {searchError ? <p role="alert">{searchError}</p> : null}
    <div className="race-row-list race-skill-links">{draft.skillLinks.map((link, index) => <article className="race-skill-link" key={`${link.skillId}-${link.linkType}-${index}`}>
      <div><strong>{link.skillName}</strong><span>{link.skillClassification}</span></div>
      <select aria-label={authoringOnly ? "What this Form provides" : "Link Type"} value={link.linkType} onChange={(e) => onChange({ ...draft, skillLinks: draft.skillLinks.map((entry, i) => i === index ? { ...entry, linkType: e.target.value } : entry) })}><option value="Skill">{authoringOnly ? "Skill predisposition" : "Skill"}</option><option value="Granted">{authoringOnly ? "Granted Special Ability" : "Granted"}</option></select>
      <Field label={authoringOnly ? "Form Skill points" : "Link Value"} help={authoringOnly ? "Enter the extra Skill points this Form contributes alongside purchased points and normal Race grants. Blank or zero adds no points. A granted Special Ability is still present with a zero minimum; this does not set Rank." : undefined}><input type="number" placeholder="Value" value={link.value ?? ""} onChange={(e) => onChange({ ...draft, skillLinks: draft.skillLinks.map((entry, i) => i === index ? { ...entry, value: e.target.value === "" ? null : Number(e.target.value) } : entry) })} /></Field>
      <button className="is-danger" type="button" onClick={() => void preserveScroll(() => onChange({ ...draft, skillLinks: draft.skillLinks.filter((_, i) => i !== index) }))}>Remove</button>
    </article>)}</div>
  </div>;
}
