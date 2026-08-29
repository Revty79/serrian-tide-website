"use client";

import { useMemo, useState, type CSSProperties } from "react";

import {
  buildCharacterAdvancementTree,
  type CharacterAdvancementPlan,
  type CharacterAdvancementTreeEntry,
} from "@/features/characters/character-advancement-rules";
import type {
  CharacterAggregate,
  CharacterSkillAllocationDraft,
  CharacterSkillReference,
} from "@/features/characters/models";

const GROUP_LABELS: Record<string, string> = {
  STR: "Strength",
  DEX: "Dexterity",
  CON: "Constitution",
  INT: "Intelligence",
  WIS: "Wisdom",
  CHR: "Charisma",
  SPECIAL: "Special Abilities",
  OTHER: "Other Skills",
};
const GROUP_ORDER = ["STR", "DEX", "CON", "INT", "WIS", "CHR", "SPECIAL", "OTHER"];

function displayNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function AdvancementSkillTree({
  aggregate,
  projectedAllocations,
  plan,
  disabled,
  onSkillNumberChange,
}: {
  aggregate: CharacterAggregate;
  projectedAllocations: readonly CharacterSkillAllocationDraft[];
  plan: CharacterAdvancementPlan;
  disabled: boolean;
  onSkillNumberChange: (
    entry: CharacterAdvancementTreeEntry,
    requestedSkillNumber: number,
  ) => void;
}) {
  const [activeGroup, setActiveGroup] = useState("STR");
  const [describedSkill, setDescribedSkill] = useState<CharacterSkillReference | null>(null);
  const tree = useMemo(
    () => buildCharacterAdvancementTree(aggregate, projectedAllocations),
    [aggregate, projectedAllocations],
  );
  const groups = useMemo(() => {
    const available = new Map<string, CharacterAdvancementTreeEntry[]>();
    for (const entry of tree) {
      const entries = available.get(entry.group) ?? [];
      entries.push(entry);
      available.set(entry.group, entries);
    }
    return GROUP_ORDER.flatMap((key) => {
      const entries = available.get(key);
      return entries?.length
        ? [{ key, label: GROUP_LABELS[key] ?? key, entries }]
        : [];
    });
  }, [tree]);
  const selectedGroup = groups.find((group) => group.key === activeGroup) ?? groups[0];

  return (
    <section className="advancement-tree" aria-labelledby="advancement-tree-heading">
      <header className="advancement-section-heading">
        <p>PROJECTED SKILL TREE</p>
        <h2 id="advancement-tree-heading">Plan Skill Advancement</h2>
        <span>Change projected Skill # values. Newly unlocked branches appear immediately; nothing is permanent until confirmation.</span>
      </header>

      <nav className="character-skill-group-tabs" role="tablist" aria-label="Advancement Skill groups">
        {groups.map((group) => (
          <button
            key={group.key}
            type="button"
            role="tab"
            aria-selected={selectedGroup?.key === group.key}
            className={selectedGroup?.key === group.key ? "is-active" : ""}
            onClick={() => setActiveGroup(group.key)}
          >
            <span>{group.label}</span>
            <small>{group.entries.filter((entry) => entry.depth === 0).length}</small>
          </button>
        ))}
      </nav>

      {selectedGroup ? (
        <div className="advancement-tree__group" role="tabpanel">
          <header><span>{selectedGroup.label}</span><small>{selectedGroup.entries.length} visible Skills</small></header>
          <div>
            {selectedGroup.entries.map((entry) => (
              <article
                key={entry.key}
                className={entry.plannedPoints > 0 ? "advancement-skill-row is-planned" : "advancement-skill-row"}
                style={{ "--skill-depth": entry.depth } as CSSProperties}
              >
                <div className="advancement-skill-row__identity">
                  <div>
                    <strong>{entry.skill.name}</strong>
                    <button
                      type="button"
                      aria-label={`Read ${entry.skill.name} description`}
                      title={`Read ${entry.skill.name} description`}
                      onClick={() => setDescribedSkill(entry.skill)}
                    >
                      ?
                    </button>
                  </div>
                  <span>{entry.tierLabel}{entry.depth > 0 ? ` · ${entry.path.join(" → ")}` : ""}</span>
                </div>
                <div className="advancement-skill-row__current">
                  <span>Current #</span>
                  <strong>{displayNumber(entry.currentSkillNumber)}</strong>
                </div>
                <label>
                  <span>Projected #</span>
                  <input
                    aria-label={`${entry.skill.name} Projected Skill Number`}
                    type="number"
                    min={entry.currentSkillNumber}
                    max={entry.maximumSkillNumber}
                    step={1}
                    disabled={disabled}
                    value={entry.projectedSkillNumber}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => onSkillNumberChange(entry, Number(event.target.value))}
                  />
                </label>
                <div><span>Rank</span><strong>{displayNumber(entry.projectedRank)}</strong></div>
                <div><span>Roll Target</span><strong>{entry.projectedRollTarget === null ? "N/A" : `${displayNumber(entry.projectedRollTarget)}%`}</strong></div>
                <div className="advancement-skill-row__cost">
                  <span>Planned XP</span>
                  <strong>{entry.plannedPoints > 0 ? displayNumber(entry.experienceCost) : "—"}</strong>
                  {entry.plannedPoints > 0 ? <small>+{displayNumber(entry.plannedPoints)} point{entry.plannedPoints === 1 ? "" : "s"}</small> : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <p className="advance-empty">No Advancement Skill groups are available.</p>
      )}

      <footer className="advancement-tree__summary">
        <span>{plan.entries.length} planned Skill {plan.entries.length === 1 ? "change" : "changes"}</span>
        <strong>{displayNumber(plan.totalExperienceCost)} XP planned</strong>
      </footer>

      {describedSkill ? (
        <div className="advancement-dialog-backdrop" role="presentation">
          <section className="advancement-dialog advancement-dialog--description" role="dialog" aria-modal="true" aria-labelledby="advancement-description-title">
            <p>SKILL REFERENCE</p>
            <h2 id="advancement-description-title">{describedSkill.name}</h2>
            <span>{describedSkill.definition || "No description is recorded for this Skill."}</span>
            <div className="advancement-dialog__actions">
              <button type="button" onClick={() => setDescribedSkill(null)}>Close</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
