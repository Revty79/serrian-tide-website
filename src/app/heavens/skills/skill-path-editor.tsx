"use client";

import { useMemo, useState } from "react";

import {
  previewSkillStructureChange,
  searchRecursiveSkillLibrary,
  type RecursiveSkillLibrary,
} from "@/features/skills/recursive-skill-library";

import type { SkillDraft, SkillRelationshipDraft } from "./actions";

type SkillPathEditorProps = {
  skillId?: number;
  skillName: string;
  proposedSkill: SkillDraft["core"];
  hierarchy: RecursiveSkillLibrary;
  relationships: SkillRelationshipDraft[];
  onChange: (relationships: SkillRelationshipDraft[]) => void;
};

function exactLineageLabel(
  hierarchy: RecursiveSkillLibrary,
  skillId: number,
): string {
  const paths = hierarchy.paths.filter(({ endpointSkillId }) => endpointSkillId === skillId);
  if (!paths.length) return `Skill #${skillId} · no complete lineage`;
  return paths.map((path) => path.rootToEndpointIds.map((id, index) => (
    `${path.rootToEndpointNames[index]} (#${id})`
  )).join(" → ")).join(" | ");
}

export function SkillPathEditor({
  skillId,
  skillName,
  proposedSkill,
  hierarchy,
  relationships,
  onChange,
}: SkillPathEditorProps) {
  const [search, setSearch] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const candidates = useMemo(() => {
    const matchingIds = search.trim()
      ? searchRecursiveSkillLibrary(hierarchy, search, 120).map(({ skill }) => skill.id)
      : hierarchy.skills.map(({ id }) => id);
    const uniqueIds = [...new Set(matchingIds)];
    return uniqueIds
      .filter((id) => id !== skillId)
      .map((id) => hierarchy.skills.find((skill) => skill.id === id)!)
      .sort((left, right) => left.name.localeCompare(right.name) || left.id - right.id)
      .slice(0, 80);
  }, [hierarchy, search, skillId]);
  const parentIds = useMemo(() => relationships
    .filter(({ relationshipType }) => relationshipType.trim().toLocaleLowerCase("en-US") === "parent")
    .map(({ relatedSkillId }) => relatedSkillId), [relationships]);
  const structure = useMemo(() => previewSkillStructureChange(hierarchy, {
    skillId,
    skillName,
    proposedParentIds: parentIds,
    proposedSkill,
  }), [hierarchy, parentIds, proposedSkill, skillId, skillName]);

  function addRelationship() {
    const selected = candidates.find((candidate) => candidate.id === Number(selectedCandidateId));
    if (!selected) return;
    if (relationships.some(({ relatedSkillId, relationshipType }) => (
      relatedSkillId === selected.id && relationshipType.trim().toLocaleLowerCase("en-US") === "parent"
    ))) return;
    onChange([...relationships, {
      relatedSkillId: selected.id,
      relatedSkillName: selected.name,
      relationshipType: "parent",
      sortOrder: relationships.length,
    }]);
    setSelectedCandidateId("");
  }

  function updateRelationship(index: number, update: Partial<SkillRelationshipDraft>) {
    onChange(relationships.map((relationship, currentIndex) => (
      currentIndex === index ? { ...relationship, ...update } : relationship
    )));
  }

  function move(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= relationships.length) return;
    const next = [...relationships];
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    onChange(next.map((relationship, sortOrder) => ({ ...relationship, sortOrder })));
  }

  return (
    <div className="skill-path-editor">
      <div className="skill-editor__intro">
        <p>Parent relationships are exact Skill IDs. Tiers and names are metadata and never determine placement.</p>
      </div>

      <div className="skill-path-editor__add">
        <label>
          <span>Find an exact parent at any depth</span>
          <input type="search" value={search} placeholder="Search name, #ID, Attribute, or classification" onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label>
          <span>Matching Skill identity</span>
          <select value={selectedCandidateId} onChange={(event) => setSelectedCandidateId(event.target.value)}>
            <option value="">{candidates.length ? "Select an exact Skill" : "No matching Skill"}</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} (#{candidate.id}) · {exactLineageLabel(hierarchy, candidate.id)}
              </option>
            ))}
          </select>
        </label>
        <button className="skills-secondary-button" type="button" disabled={!selectedCandidateId} onClick={addRelationship}>
          Add as Parent
        </button>
      </div>

      <div className="skill-path-editor__relationships">
        {relationships.length === 0 ? (
          <p className="skill-editor__empty">No relationships are attached. This Skill will be derived as a root.</p>
        ) : relationships.map((relationship, index) => (
          <article className="skill-path-editor__relationship" key={`${relationship.relatedSkillId}-${relationship.relationshipType}-${index}`}>
            <div>
              <strong>{relationship.relatedSkillName ?? `Skill #${relationship.relatedSkillId}`} <code>#{relationship.relatedSkillId}</code></strong>
              <small>{exactLineageLabel(hierarchy, relationship.relatedSkillId)}</small>
              <label>
                <span>Relationship</span>
                <input list="relationship-types" value={relationship.relationshipType} onChange={(event) => updateRelationship(index, { relationshipType: event.target.value })} />
              </label>
            </div>
            <div className="skill-path-editor__order">
              <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>Move Up</button>
              <button type="button" disabled={index === relationships.length - 1} onClick={() => move(index, 1)}>Move Down</button>
              <button className="is-danger" type="button" onClick={() => onChange(relationships.filter((_, current) => current !== index))}>Remove</button>
            </div>
          </article>
        ))}
      </div>

      <section className="skill-path-editor__preview" aria-label="Skill lineage preview">
        <div>
          <strong>Current path{structure.oldPaths.length === 1 ? "" : "s"}</strong>
          {structure.oldPaths.length ? structure.oldPaths.map((path) => <span key={path.key}>{path.rootToEndpointIds.map((id, index) => `${path.rootToEndpointNames[index]} (#${id})`).join(" → ")}</span>) : <span>New Skill · no stored path</span>}
        </div>
        <div>
          <strong>Proposed path{structure.proposedPaths.length === 1 ? "" : "s"}</strong>
          {structure.proposedPaths.length ? structure.proposedPaths.map((path) => <span key={path.key}>{path.rootToEndpointIds.map((id, index) => `${path.rootToEndpointNames[index]} (#${id})`).join(" → ")}</span>) : <span>No complete path · review required</span>}
        </div>
        {structure.affectedSkillIds.length > 1 ? <p>{structure.affectedSkillIds.length - 1} downstream descendant {structure.affectedSkillIds.length === 2 ? "identity is" : "identities are"} affected by this lineage.</p> : null}
        {structure.ambiguousMultipleParents ? <p role="status">Multiple parents remain separate exact routes and require explicit confirmation.</p> : null}
        {structure.validationErrors.length ? <ul role="alert">{structure.validationErrors.map((message) => <li key={message}>{message}</li>)}</ul> : null}
      </section>

      <datalist id="relationship-types"><option value="parent" /><option value="prerequisite" /></datalist>
    </div>
  );
}
