"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GuidedField } from "@/components/field-guidance";
import { fieldHelp } from "@/features/guidance/field-help";
import { isRaceSkillEligible } from "@/features/races/race-skills";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";
import { listRaceSkillCandidates, type RaceDraft, type RaceSkillCandidate } from "./actions";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <GuidedField className="race-field" label={label} help={fieldHelp("race", label)}>{children}</GuidedField>;
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
    <div className="skill-editor__intro">{authoringOnly && <p>These Form additions preserve Race grants and learned Character Skills. They are saved authoring intent only; no Skill points or abilities are applied now.</p>}<p>Skills link to the shared Skill Library. “Granted” entries must be Special Abilities.</p></div>
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
