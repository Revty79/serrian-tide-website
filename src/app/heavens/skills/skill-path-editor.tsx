"use client";

import { useEffect, useState } from "react";

import type {
  SkillLibraryItem,
  SkillRelationshipDraft,
} from "./actions";

type SkillRelationshipCandidateContext = {
  tier: number | null;
  primaryAttribute: string | null;
  secondaryAttribute: string | null;
};

type SkillPathEditorProps = {
  skillId?: number;
  context: SkillRelationshipCandidateContext;
  relationships: SkillRelationshipDraft[];
  onChange: (relationships: SkillRelationshipDraft[]) => void;
  findCandidates: (
    search: string,
    context: SkillRelationshipCandidateContext,
    excludeId?: number,
  ) => Promise<SkillLibraryItem[]>;
};

export function SkillPathEditor({
  skillId,
  context,
  relationships,
  onChange,
  findCandidates,
}: SkillPathEditorProps) {
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<SkillLibraryItem[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let current = true;
    setSelectedCandidateId("");
    setCandidates([]);
    setLoading(true);

    const timeout = window.setTimeout(() => {
      findCandidates(search, context, skillId)
        .then((next) => {
          if (current) setCandidates(next);
        })
        .catch(() => {
          if (current) setCandidates([]);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 180);

    return () => {
      current = false;
      window.clearTimeout(timeout);
    };
  }, [
    context.primaryAttribute,
    context.secondaryAttribute,
    context.tier,
    findCandidates,
    search,
    skillId,
  ]);

  const attributes = [context.primaryAttribute, context.secondaryAttribute]
    .filter(
      (attribute): attribute is string =>
        Boolean(attribute?.trim()) && attribute?.toUpperCase() !== "N/A",
    )
    .join(" / ");

  const canHaveLowerTierRelationship =
    context.tier !== null && context.tier > 1 && Boolean(attributes);

  function addRelationship() {
    const selected = candidates.find(
      (candidate) => candidate.id === Number(selectedCandidateId),
    );
    if (!selected) return;
    if (relationships.some(({ relatedSkillId }) => relatedSkillId === selected.id)) {
      return;
    }

    onChange([
      ...relationships,
      {
        relatedSkillId: selected.id,
        relatedSkillName: selected.name,
        relationshipType: "parent",
        sortOrder: relationships.length,
      },
    ]);
    setSelectedCandidateId("");
  }

  function updateRelationship(
    index: number,
    update: Partial<SkillRelationshipDraft>,
  ) {
    onChange(
      relationships.map((relationship, currentIndex) =>
        currentIndex === index ? { ...relationship, ...update } : relationship,
      ),
    );
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
        <p>
          {canHaveLowerTierRelationship
            ? `Showing Tier ${context.tier! - 1} Skills sharing ${attributes}.`
            : "Tier-1 and tierless Skills do not have lower-tier relationship choices."}
        </p>
      </div>

      <div className="skill-path-editor__add">
        <label>
          <span>Find a related Skill</span>
          <input
            type="search"
            value={search}
            placeholder="Search the library"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <label>
          <span>Matching Skills</span>
          <select
            value={selectedCandidateId}
            onChange={(event) => setSelectedCandidateId(event.target.value)}
          >
            <option value="">
              {loading
                ? "Searching..."
                : candidates.length > 0
                  ? "Select a Skill"
                  : "No eligible Skills"}
            </option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} - Tier {candidate.tier} - {[
                  candidate.primaryAttribute,
                  candidate.secondaryAttribute,
                ].filter(Boolean).join(" / ")}
              </option>
            ))}
          </select>
        </label>

        <button
          className="skills-secondary-button"
          type="button"
          disabled={!selectedCandidateId}
          onClick={addRelationship}
        >
          Add Relationship
        </button>
      </div>

      <div className="skill-path-editor__relationships">
        {relationships.length === 0 ? (
          <p className="skill-editor__empty">
            No parent or prerequisite relationships are attached.
          </p>
        ) : (
          relationships.map((relationship, index) => (
            <article
              className="skill-path-editor__relationship"
              key={`${relationship.relatedSkillId}-${index}`}
            >
              <div>
                <strong>
                  {relationship.relatedSkillName ?? `Skill ${relationship.relatedSkillId}`}
                </strong>
                <label>
                  <span>Relationship</span>
                  <input
                    list="relationship-types"
                    value={relationship.relationshipType}
                    onChange={(event) =>
                      updateRelationship(index, { relationshipType: event.target.value })
                    }
                  />
                </label>
              </div>

              <div className="skill-path-editor__order">
                <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>
                  Move Up
                </button>
                <button
                  type="button"
                  disabled={index === relationships.length - 1}
                  onClick={() => move(index, 1)}
                >
                  Move Down
                </button>
                <button
                  className="is-danger"
                  type="button"
                  onClick={() =>
                    onChange(relationships.filter((_, current) => current !== index))
                  }
                >
                  Remove
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      <datalist id="relationship-types">
        <option value="parent" />
        <option value="prerequisite" />
      </datalist>
    </div>
  );
}
