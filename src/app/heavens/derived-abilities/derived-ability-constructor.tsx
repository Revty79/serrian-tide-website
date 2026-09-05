"use client";

import { useMemo, useState } from "react";

import {
  DERIVED_ABILITY_ACQUISITION_TYPES,
  DERIVED_ABILITY_ACTIVATION_TYPES,
  DERIVED_ABILITY_ATTRIBUTE_KEYS,
  DERIVED_ABILITY_COST_TYPES,
  DERIVED_ABILITY_REFRESH_SCOPES,
  DERIVED_ABILITY_USE_CONDITION_TYPES,
  type DerivedAbilityCostDefinition,
  type DerivedAbilityCostType,
  type DerivedAbilityRefreshScope,
  type DerivedAbilityRequirementDefinition,
  type DerivedAbilityRequirementOperator,
  type DerivedAbilityRequirementScope,
  type DerivedAbilityRequirementType,
  type DerivedAbilityUseConditionDefinition,
  type DerivedAbilityUseConditionType,
  type DerivedAbilityUseLimitDefinition,
} from "@/features/derived-abilities/models";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

import type {
  DerivedAbilityDraft,
  DerivedAbilityEditorReferences,
} from "./actions";
import { DerivedAbilityEffectsEditor } from "./derived-ability-effects-editor";

const NUMERIC_OPERATORS: Array<{
  value: Extract<DerivedAbilityRequirementOperator, "gte" | "gt" | "lte" | "lt" | "eq" | "neq">;
  label: string;
}> = [
  { value: "gte", label: "≥" },
  { value: "gt", label: ">" },
  { value: "lte", label: "≤" },
  { value: "lt", label: "<" },
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
];

const ACQUISITION_EXPLANATIONS = {
  automatic: "Available automatically according to its Live requirements.",
  learned: "Requirements establish eligibility only. Character ownership is handled later.",
  awarded: "Must eventually be explicitly granted through the Character system.",
} as const;

const ACTIVATION_EXPLANATIONS = {
  passive: "Operates while applicable.",
  activated: "Chosen deliberately by the player or G.O.D.",
  reaction: "May be used in response to a future game event or window.",
  triggered: "Becomes applicable because a defined event occurs.",
} as const;

function Field({
  label,
  children,
  wide = false,
  help,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
  help?: string;
}) {
  return (
    <label className={wide ? "derived-ability-field is-wide" : "derived-ability-field"}>
      <span>{label}</span>
      {children}
      {help ? <small>{help}</small> : null}
    </label>
  );
}

function RowActions({
  onUp,
  onDown,
  onRemove,
  upDisabled,
  downDisabled,
}: {
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  upDisabled: boolean;
  downDisabled: boolean;
}) {
  const preserveScroll = useInPlaceScrollPreservation();
  return (
    <div className="derived-ability-row-actions">
      <button type="button" disabled={upDisabled} onClick={() => void preserveScroll(onUp)}>Move Up</button>
      <button type="button" disabled={downDisabled} onClick={() => void preserveScroll(onDown)}>Move Down</button>
      <button type="button" className="is-danger" onClick={() => void preserveScroll(onRemove)}>Remove</button>
    </div>
  );
}

function numericValue(value: string): number | null {
  return value === "" ? null : Number(value);
}

function defaultRequirement(
  requirementScope: DerivedAbilityRequirementScope,
  groupNumber: number,
  sortOrder: number,
): DerivedAbilityRequirementDefinition {
  return {
    requirementScope,
    requirementType: "attribute",
    groupNumber,
    attributeKey: "STR",
    skillId: null,
    requiredDerivedAbilityId: null,
    operator: "gte",
    requiredValue: 40,
    notes: "",
    sortOrder,
  };
}

function changeRequirementType(
  requirement: DerivedAbilityRequirementDefinition,
  requirementType: DerivedAbilityRequirementType,
): DerivedAbilityRequirementDefinition {
  const position = {
    id: requirement.id,
    derivedAbilityId: requirement.derivedAbilityId,
    requirementScope: requirement.requirementScope,
    requirementType,
    groupNumber: requirement.groupNumber,
    sortOrder: requirement.sortOrder,
  };
  if (requirementType === "attribute") {
    return {
      ...position,
      attributeKey: "STR",
      skillId: null,
      requiredDerivedAbilityId: null,
      operator: "gte",
      requiredValue: 40,
      notes: "",
    };
  }
  if (requirementType === "skill") {
    return {
      ...position,
      attributeKey: null,
      skillId: null,
      requiredDerivedAbilityId: null,
      operator: "gte",
      requiredValue: 1,
      notes: "",
    };
  }
  if (requirementType === "derived-ability") {
    return {
      ...position,
      attributeKey: null,
      skillId: null,
      requiredDerivedAbilityId: null,
      operator: "possessed",
      requiredValue: null,
      notes: "",
    };
  }
  return {
    ...position,
    attributeKey: null,
    skillId: null,
    requiredDerivedAbilityId: null,
    operator: null,
    requiredValue: null,
    notes: "",
  };
}

function ReferenceSelect({
  kind,
  value,
  options,
  onChange,
}: {
  kind: "Skill" | "Derived Ability";
  value: number | null;
  options: Array<{ id: number; label: string }>;
  onChange: (id: number | null) => void;
}) {
  const [search, setSearch] = useState("");
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("en-US");
    if (!query) return options;
    return options.filter((entry) =>
      entry.label.toLocaleLowerCase("en-US").includes(query) ||
      String(entry.id).includes(query),
    );
  }, [options, search]);
  const selected = options.find((entry) => entry.id === value);
  const choices = selected && !visible.some((entry) => entry.id === selected.id)
    ? [selected, ...visible]
    : visible;
  return (
    <div className="derived-ability-reference-select">
      <input
        type="search"
        value={search}
        placeholder={`Find ${kind}`}
        aria-label={`Find ${kind}`}
        onChange={(event) => setSearch(event.target.value)}
      />
      <select
        value={value ?? ""}
        aria-label={kind}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      >
        <option value="">Choose {kind}</option>
        {choices.map((entry) => (
          <option key={entry.id} value={entry.id}>{entry.label}</option>
        ))}
      </select>
    </div>
  );
}

function RequirementRow({
  requirement,
  draftId,
  references,
  onChange,
  onUp,
  onDown,
  onRemove,
  upDisabled,
  downDisabled,
}: {
  requirement: DerivedAbilityRequirementDefinition;
  draftId?: number;
  references: DerivedAbilityEditorReferences;
  onChange: (requirement: DerivedAbilityRequirementDefinition) => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  upDisabled: boolean;
  downDisabled: boolean;
}) {
  const skillOptions = references.skills.map((entry) => ({
    id: entry.id,
    label: `${entry.name} · ${entry.classification}${entry.tier ? ` · Tier ${entry.tier}` : ""}`,
  }));
  const abilityOptions = references.abilities
    .filter((entry) => entry.id !== draftId)
    .map((entry) => ({ id: entry.id, label: entry.name }));
  const patch = (update: Partial<DerivedAbilityRequirementDefinition>) =>
    onChange({ ...requirement, ...update });
  return (
    <article className="derived-ability-edit-row">
      <header>
        <strong>{requirement.requirementType.replace("derived-ability", "Derived Ability")}</strong>
        <RowActions
          onUp={onUp}
          onDown={onDown}
          onRemove={onRemove}
          upDisabled={upDisabled}
          downDisabled={downDisabled}
        />
      </header>
      <div className="derived-ability-form-grid">
        <Field label="Requirement Type">
          <select
            value={requirement.requirementType}
            onChange={(event) => onChange(changeRequirementType(
              requirement,
              event.target.value as DerivedAbilityRequirementType,
            ))}
          >
            <option value="attribute">Attribute</option>
            <option value="skill">Skill</option>
            <option value="derived-ability">Derived Ability</option>
            <option value="manual">Manual</option>
          </select>
        </Field>
        {requirement.requirementType === "attribute" ? (
          <>
            <Field label="Attribute">
              <select
                value={requirement.attributeKey ?? ""}
                onChange={(event) => patch({ attributeKey: event.target.value })}
              >
                {DERIVED_ABILITY_ATTRIBUTE_KEYS.map((key) => (
                  <option key={key} value={key}>{key}</option>
                ))}
              </select>
            </Field>
            <Field label="Operator">
              <select
                value={requirement.operator ?? "gte"}
                onChange={(event) => patch({
                  operator: event.target.value as DerivedAbilityRequirementOperator,
                })}
              >
                {NUMERIC_OPERATORS.map((operator) => (
                  <option key={operator.value} value={operator.value}>{operator.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Value">
              <input
                type="number"
                step="any"
                value={requirement.requiredValue ?? ""}
                onChange={(event) => patch({ requiredValue: numericValue(event.target.value) })}
              />
            </Field>
          </>
        ) : null}
        {requirement.requirementType === "skill" ? (
          <>
            <Field
              label="Skill"
              wide
              help="The saved Skill ID is authoritative; tier and name are display context only."
            >
              <ReferenceSelect
                kind="Skill"
                value={requirement.skillId}
                options={skillOptions}
                onChange={(skillId) => patch({ skillId })}
              />
            </Field>
            <Field label="Operator">
              <select
                value={requirement.operator ?? "gte"}
                onChange={(event) => patch({
                  operator: event.target.value as DerivedAbilityRequirementOperator,
                })}
              >
                {NUMERIC_OPERATORS.map((operator) => (
                  <option key={operator.value} value={operator.value}>{operator.label}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Required Skill #"
              help="Uses actual stored points in this Skill, not calculated Rank."
            >
              <input
                type="number"
                step="any"
                value={requirement.requiredValue ?? ""}
                onChange={(event) => patch({ requiredValue: numericValue(event.target.value) })}
              />
            </Field>
          </>
        ) : null}
        {requirement.requirementType === "derived-ability" ? (
          <>
            <Field label="Derived Ability" wide>
              <ReferenceSelect
                kind="Derived Ability"
                value={requirement.requiredDerivedAbilityId}
                options={abilityOptions}
                onChange={(requiredDerivedAbilityId) => patch({ requiredDerivedAbilityId })}
              />
            </Field>
            <Field label="Possession">
              <select
                value={requirement.operator ?? "possessed"}
                onChange={(event) => patch({
                  operator: event.target.value as DerivedAbilityRequirementOperator,
                })}
              >
                <option value="possessed">Possessed</option>
                <option value="not-possessed">Not Possessed</option>
              </select>
            </Field>
          </>
        ) : null}
        {requirement.requirementType === "manual" ? (
          <Field label="Requirement Text" wide>
            <textarea
              rows={3}
              value={requirement.notes}
              placeholder="Must have completed training with the Order of Ash."
              onChange={(event) => patch({ notes: event.target.value })}
            />
          </Field>
        ) : (
          <Field label="Notes" wide>
            <input
              value={requirement.notes}
              placeholder="Optional authoring context"
              onChange={(event) => patch({ notes: event.target.value })}
            />
          </Field>
        )}
      </div>
    </article>
  );
}

function RequirementScopeEditor({
  scope,
  draft,
  references,
  onChange,
}: {
  scope: DerivedAbilityRequirementScope;
  draft: DerivedAbilityDraft;
  references: DerivedAbilityEditorReferences;
  onChange: (draft: DerivedAbilityDraft) => void;
}) {
  const preserveScroll = useInPlaceScrollPreservation();
  const scoped = draft.requirements
    .map((requirement, index) => ({ requirement, index }))
    .filter(({ requirement }) => requirement.requirementScope === scope)
    .sort((left, right) =>
      left.requirement.groupNumber - right.requirement.groupNumber ||
      left.requirement.sortOrder - right.requirement.sortOrder);
  const groups = [...new Set(scoped.map(({ requirement }) => requirement.groupNumber))]
    .sort((left, right) => left - right);

  function setRequirements(requirements: DerivedAbilityRequirementDefinition[]) {
    onChange({ ...draft, requirements });
  }

  function patchRequirement(index: number, requirement: DerivedAbilityRequirementDefinition) {
    setRequirements(draft.requirements.map((entry, position) =>
      position === index ? requirement : entry));
  }

  function removeRequirement(index: number) {
    setRequirements(draft.requirements.filter((_, position) => position !== index));
  }

  function moveRequirement(index: number, direction: -1 | 1) {
    const current = draft.requirements[index]!;
    const peers = scoped.filter(({ requirement }) =>
      requirement.groupNumber === current.groupNumber);
    const peerIndex = peers.findIndex((entry) => entry.index === index);
    const target = peers[peerIndex + direction];
    if (!target) return;
    setRequirements(draft.requirements.map((entry, position) => {
      if (position === index) return { ...entry, sortOrder: target.requirement.sortOrder };
      if (position === target.index) return { ...entry, sortOrder: current.sortOrder };
      return entry;
    }));
  }

  function addRequirement(groupNumber: number) {
    const group = scoped.filter(({ requirement }) =>
      requirement.groupNumber === groupNumber);
    setRequirements([
      ...draft.requirements,
      defaultRequirement(scope, groupNumber, group.length),
    ]);
  }

  function addGroup() {
    const groupNumber = groups.length ? Math.max(...groups) + 1 : 0;
    setRequirements([
      ...draft.requirements,
      defaultRequirement(scope, groupNumber, 0),
    ]);
  }

  function removeGroup(groupNumber: number) {
    const remaining = draft.requirements.filter((requirement) =>
      requirement.requirementScope !== scope || requirement.groupNumber !== groupNumber);
    const oldGroups = [...new Set(remaining
      .filter((requirement) => requirement.requirementScope === scope)
      .map(({ groupNumber: value }) => value))].sort((left, right) => left - right);
    setRequirements(remaining.map((requirement) => requirement.requirementScope === scope
      ? { ...requirement, groupNumber: oldGroups.indexOf(requirement.groupNumber) }
      : requirement));
  }

  function moveGroup(groupNumber: number, direction: -1 | 1) {
    const groupIndex = groups.indexOf(groupNumber);
    const other = groups[groupIndex + direction];
    if (other === undefined) return;
    setRequirements(draft.requirements.map((requirement) => {
      if (requirement.requirementScope !== scope) return requirement;
      if (requirement.groupNumber === groupNumber) return { ...requirement, groupNumber: other };
      if (requirement.groupNumber === other) return { ...requirement, groupNumber };
      return requirement;
    }));
  }

  return (
    <section className="derived-ability-requirement-scope">
      <header>
        <div>
          <h4>{scope === "acquisition" ? "Acquisition Requirements" : "Live Requirements"}</h4>
          <p>{scope === "acquisition"
            ? "What must be true to obtain or learn this ability."
            : "What must continue to be true for this ability to remain available."}</p>
        </div>
        {!groups.length ? (
          <button type="button" onClick={() => void preserveScroll(addGroup)}>Add Requirement</button>
        ) : null}
      </header>
      {!groups.length ? <p className="derived-ability-empty">No requirements · no restriction.</p> : null}
      {groups.map((groupNumber, groupIndex) => {
        const rows = scoped.filter(({ requirement }) =>
          requirement.groupNumber === groupNumber);
        return (
          <div key={groupNumber}>
            {groupIndex > 0 ? <div className="derived-ability-or">OR</div> : null}
            <section className="derived-ability-requirement-group">
              <header>
                <div>
                  <strong>GROUP {groupIndex + 1}</strong>
                  <span>ALL OF THESE</span>
                </div>
                <div>
                  <button type="button" disabled={groupIndex === 0} onClick={() => void preserveScroll(() => moveGroup(groupNumber, -1))}>Move Group Up</button>
                  <button type="button" disabled={groupIndex === groups.length - 1} onClick={() => void preserveScroll(() => moveGroup(groupNumber, 1))}>Move Group Down</button>
                  <button type="button" className="is-danger" onClick={() => void preserveScroll(() => removeGroup(groupNumber))}>Remove Group</button>
                </div>
              </header>
              <div className="derived-ability-row-list">
                {rows.map(({ requirement, index }, rowIndex) => (
                  <div key={requirement.id ?? `${scope}-${groupNumber}-${index}`}>
                    {rowIndex > 0 ? <div className="derived-ability-and">AND</div> : null}
                    <RequirementRow
                      requirement={requirement}
                      draftId={draft.id}
                      references={references}
                      onChange={(next) => patchRequirement(index, next)}
                      onUp={() => moveRequirement(index, -1)}
                      onDown={() => moveRequirement(index, 1)}
                      onRemove={() => removeRequirement(index)}
                      upDisabled={rowIndex === 0}
                      downDisabled={rowIndex === rows.length - 1}
                    />
                  </div>
                ))}
              </div>
              <button className="derived-ability-add" type="button" onClick={() => void preserveScroll(() => addRequirement(groupNumber))}>+ Add Requirement</button>
            </section>
          </div>
        );
      })}
      {groups.length ? <button className="derived-ability-add-or" type="button" onClick={() => void preserveScroll(addGroup)}>+ Add OR Group</button> : null}
    </section>
  );
}

function UseConditionsEditor({
  draft,
  onChange,
}: {
  draft: DerivedAbilityDraft;
  onChange: (draft: DerivedAbilityDraft) => void;
}) {
  const preserveScroll = useInPlaceScrollPreservation();
  function setRows(useConditions: DerivedAbilityUseConditionDefinition[]) {
    onChange({ ...draft, useConditions });
  }
  function patch(index: number, update: Partial<DerivedAbilityUseConditionDefinition>) {
    setRows(draft.useConditions.map((entry, position) =>
      position === index ? { ...entry, ...update } : entry));
  }
  function changeType(index: number, conditionType: DerivedAbilityUseConditionType) {
    patch(index, conditionType === "manual" ? {
      conditionType,
      conditionKey: null,
      operator: null,
      numericValue: null,
      textValue: null,
      notes: "",
    } : {
      conditionType,
      conditionKey: "",
      operator: null,
      numericValue: null,
      textValue: null,
      notes: "",
    });
  }
  function move(index: number, direction: -1 | 1) {
    const rows = [...draft.useConditions];
    const target = index + direction;
    if (!rows[target]) return;
    [rows[index], rows[target]] = [rows[target]!, rows[index]!];
    setRows(rows.map((entry, sortOrder) => ({ ...entry, sortOrder })));
  }
  return (
    <section className="derived-ability-card">
      <header className="derived-ability-card-heading">
        <div><p>WHEN IT CAN BE USED</p><h3>Use Conditions</h3><span>Definition metadata only; Pass 4 does not enforce these conditions.</span></div>
        <button type="button" onClick={() => void preserveScroll(() => setRows([...draft.useConditions, {
          conditionType: "event",
          conditionKey: "",
          operator: null,
          numericValue: null,
          textValue: null,
          notes: "",
          sortOrder: draft.useConditions.length,
        }]))}>Add Condition</button>
      </header>
      {!draft.useConditions.length ? <p className="derived-ability-empty">No use conditions.</p> : null}
      <div className="derived-ability-row-list">
        {draft.useConditions.map((condition, index) => (
          <article className="derived-ability-edit-row" key={condition.id ?? `condition-${index}`}>
            <header>
              <strong>{condition.conditionType} condition</strong>
              <RowActions onUp={() => move(index, -1)} onDown={() => move(index, 1)} onRemove={() => setRows(draft.useConditions.filter((_, position) => position !== index))} upDisabled={index === 0} downDisabled={index === draft.useConditions.length - 1} />
            </header>
            <div className="derived-ability-form-grid">
              <Field label="Condition Type">
                <select value={condition.conditionType} onChange={(event) => changeType(index, event.target.value as DerivedAbilityUseConditionType)}>
                  {DERIVED_ABILITY_USE_CONDITION_TYPES.map((type) => <option key={type} value={type}>{type[0]!.toUpperCase() + type.slice(1)}</option>)}
                </select>
              </Field>
              {condition.conditionType !== "manual" ? <Field label={condition.conditionType === "event" ? "Event Key" : "Condition Key"}><input value={condition.conditionKey ?? ""} placeholder={condition.conditionType === "event" ? "successful-parry" : "firearm-equipped"} onChange={(event) => patch(index, { conditionKey: event.target.value })} /></Field> : null}
              {condition.conditionType === "state" ? <><Field label="Comparison"><select value={condition.operator ?? ""} onChange={(event) => patch(index, { operator: (event.target.value || null) as DerivedAbilityRequirementOperator | null })}><option value="">Descriptive only</option>{NUMERIC_OPERATORS.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}</select></Field><Field label="Numeric Value"><input type="number" step="any" value={condition.numericValue ?? ""} onChange={(event) => patch(index, { numericValue: numericValue(event.target.value) })} /></Field></> : null}
              {condition.conditionType !== "manual" ? <Field label="Text Value" wide><input value={condition.textValue ?? ""} placeholder="Optional structured context" onChange={(event) => patch(index, { textValue: event.target.value || null })} /></Field> : null}
              <Field label={condition.conditionType === "manual" ? "Manual Condition" : "Notes"} wide><textarea rows={3} value={condition.notes} placeholder={condition.conditionType === "manual" ? "G.O.D. determines whether the situation applies." : "Optional human-readable context"} onChange={(event) => patch(index, { notes: event.target.value })} /></Field>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CostsEditor({ draft, onChange }: { draft: DerivedAbilityDraft; onChange: (draft: DerivedAbilityDraft) => void }) {
  const preserveScroll = useInPlaceScrollPreservation();
  function setRows(costs: DerivedAbilityCostDefinition[]) { onChange({ ...draft, costs }); }
  function patch(index: number, update: Partial<DerivedAbilityCostDefinition>) { setRows(draft.costs.map((entry, position) => position === index ? { ...entry, ...update } : entry)); }
  function move(index: number, direction: -1 | 1) { const rows = [...draft.costs]; const target = index + direction; if (!rows[target]) return; [rows[index], rows[target]] = [rows[target]!, rows[index]!]; setRows(rows.map((entry, sortOrder) => ({ ...entry, sortOrder }))); }
  return (
    <section className="derived-ability-card">
      <header className="derived-ability-card-heading"><div><p>COSTS</p><h3>Resource Costs</h3><span>Zero rows means no cost. Resources are not deducted in this pass.</span></div><button type="button" onClick={() => void preserveScroll(() => setRows([...draft.costs, { costType: "initiative", amount: 1, resourceKey: null, notes: "", sortOrder: draft.costs.length }]))}>Add Cost</button></header>
      {!draft.costs.length ? <p className="derived-ability-empty">No costs.</p> : null}
      <div className="derived-ability-row-list">
        {draft.costs.map((cost, index) => {
          const hasResourceKey = ["ammunition", "resource", "custom"].includes(cost.costType);
          return <article className="derived-ability-edit-row" key={cost.id ?? `cost-${index}`}><header><strong>{cost.costType} cost</strong><RowActions onUp={() => move(index, -1)} onDown={() => move(index, 1)} onRemove={() => setRows(draft.costs.filter((_, position) => position !== index))} upDisabled={index === 0} downDisabled={index === draft.costs.length - 1} /></header><div className="derived-ability-form-grid"><Field label="Cost Type"><select value={cost.costType} onChange={(event) => patch(index, { costType: event.target.value as DerivedAbilityCostType, resourceKey: null })}>{DERIVED_ABILITY_COST_TYPES.map((type) => <option key={type} value={type}>{type[0]!.toUpperCase() + type.slice(1)}</option>)}</select></Field><Field label="Amount"><input type="number" min="0.000001" step="any" value={cost.amount} onChange={(event) => patch(index, { amount: Number(event.target.value) })} /></Field>{hasResourceKey ? <Field label="Resource Key" wide><input value={cost.resourceKey ?? ""} placeholder={cost.costType === "ammunition" ? "Optional ammunition context" : "Resource identity"} onChange={(event) => patch(index, { resourceKey: event.target.value || null })} /></Field> : null}<Field label="Notes" wide><textarea rows={2} value={cost.notes} onChange={(event) => patch(index, { notes: event.target.value })} /></Field></div></article>;
        })}
      </div>
    </section>
  );
}

function UseLimitsEditor({ draft, onChange }: { draft: DerivedAbilityDraft; onChange: (draft: DerivedAbilityDraft) => void }) {
  const preserveScroll = useInPlaceScrollPreservation();
  function setRows(useLimits: DerivedAbilityUseLimitDefinition[]) { onChange({ ...draft, useLimits }); }
  function patch(index: number, update: Partial<DerivedAbilityUseLimitDefinition>) { setRows(draft.useLimits.map((entry, position) => position === index ? { ...entry, ...update } : entry)); }
  function move(index: number, direction: -1 | 1) { const rows = [...draft.useLimits]; const target = index + direction; if (!rows[target]) return; [rows[index], rows[target]] = [rows[target]!, rows[index]!]; setRows(rows.map((entry, sortOrder) => ({ ...entry, sortOrder }))); }
  return (
    <section className="derived-ability-card">
      <header className="derived-ability-card-heading"><div><p>USES AND REFRESH</p><h3>Use Limits / Recharge</h3><span>Definition metadata only; no counters or automatic recharge run yet.</span></div><button type="button" onClick={() => void preserveScroll(() => setRows([...draft.useLimits, { maximumUses: 1, refreshScope: "round", refreshKey: null, notes: "", sortOrder: draft.useLimits.length }]))}>Add Limit</button></header>
      {!draft.useLimits.length ? <p className="derived-ability-empty">No use limits.</p> : null}
      <div className="derived-ability-row-list">
        {draft.useLimits.map((limit, index) => <article className="derived-ability-edit-row" key={limit.id ?? `limit-${index}`}><header><strong>{limit.maximumUses} use{limit.maximumUses === 1 ? "" : "s"} · {limit.refreshScope}</strong><RowActions onUp={() => move(index, -1)} onDown={() => move(index, 1)} onRemove={() => setRows(draft.useLimits.filter((_, position) => position !== index))} upDisabled={index === 0} downDisabled={index === draft.useLimits.length - 1} /></header><div className="derived-ability-form-grid"><Field label="Maximum Uses"><input type="number" min={1} step={1} value={limit.maximumUses} onChange={(event) => patch(index, { maximumUses: Number(event.target.value) })} /></Field><Field label="Refresh Scope"><select value={limit.refreshScope} onChange={(event) => patch(index, { refreshScope: event.target.value as DerivedAbilityRefreshScope, refreshKey: null })}>{DERIVED_ABILITY_REFRESH_SCOPES.map((scope) => <option key={scope} value={scope}>{scope[0]!.toUpperCase() + scope.slice(1)}</option>)}</select></Field>{limit.refreshScope === "event" ? <Field label="Refresh Event Key" wide><input value={limit.refreshKey ?? ""} placeholder="appropriate-event" onChange={(event) => patch(index, { refreshKey: event.target.value || null })} /></Field> : null}<Field label="Notes" wide><textarea rows={2} value={limit.notes} onChange={(event) => patch(index, { notes: event.target.value })} /></Field></div></article>)}
      </div>
    </section>
  );
}

export function DerivedAbilityConstructor({
  draft,
  references,
  onChange,
}: {
  draft: DerivedAbilityDraft;
  references: DerivedAbilityEditorReferences;
  onChange: (draft: DerivedAbilityDraft) => void;
}) {
  const acquisitionRequirements = draft.requirements.filter((entry) => entry.requirementScope === "acquisition");
  const liveRequirements = draft.requirements.filter((entry) => entry.requirementScope === "live");
  const aggregate = "createdAt" in draft
    ? draft as DerivedAbilityDraft & { createdAt: string; updatedAt: string; legacyCampaignReferenceCount: number }
    : null;
  return (
    <div className="skill-editor__content derived-ability-editor__content">
      <section className="derived-ability-card">
        <header><p>IDENTITY</p><h3>Name & Description</h3></header>
        <div className="derived-ability-form-grid">
          <Field label="Name" wide><input value={draft.core.name} onChange={(event) => onChange({ ...draft, core: { ...draft.core, name: event.target.value } })} /></Field>
          <Field label="Description" wide><textarea rows={5} value={draft.core.description} onChange={(event) => onChange({ ...draft, core: { ...draft.core, description: event.target.value } })} /></Field>
        </div>
      </section>

      <section className="derived-ability-card">
        <header><p>ACQUISITION</p><h3>How It Is Obtained</h3></header>
        <div className="derived-ability-form-grid">
          <Field label="Acquisition Type">
            <select value={draft.acquisitionType} onChange={(event) => onChange({ ...draft, acquisitionType: event.target.value as DerivedAbilityDraft["acquisitionType"] })}>
              {DERIVED_ABILITY_ACQUISITION_TYPES.map((type) => <option key={type} value={type}>{type[0]!.toUpperCase() + type.slice(1)}</option>)}
            </select>
          </Field>
          <p className="derived-ability-explanation">{ACQUISITION_EXPLANATIONS[draft.acquisitionType]}</p>
        </div>
        {draft.acquisitionType === "automatic" && acquisitionRequirements.length ? <p className="derived-ability-warning"><strong>Definition warning:</strong> Automatic acquisition requirements are stored, but Character ownership behavior for this combination is deferred to Pass 6. Current automatic activity uses Live requirements.</p> : null}
        {draft.acquisitionType === "automatic" && !liveRequirements.length ? <p className="derived-ability-warning"><strong>Automatically available:</strong> This Automatic ability has no Live requirements and will be available whenever Derived Abilities are enabled for the campaign.</p> : null}
      </section>

      <section className="derived-ability-card derived-ability-requirements-card">
        <header><p>REQUIREMENTS</p><h3>Eligibility and Availability</h3></header>
        <RequirementScopeEditor scope="acquisition" draft={draft} references={references} onChange={onChange} />
        <RequirementScopeEditor scope="live" draft={draft} references={references} onChange={onChange} />
      </section>

      <section className="derived-ability-card">
        <header><p>ACTIVATION</p><h3>How It Operates</h3></header>
        <div className="derived-ability-form-grid">
          <Field label="Activation Type">
            <select value={draft.activationType} onChange={(event) => onChange({ ...draft, activationType: event.target.value as DerivedAbilityDraft["activationType"] })}>
              {DERIVED_ABILITY_ACTIVATION_TYPES.map((type) => <option key={type} value={type}>{type[0]!.toUpperCase() + type.slice(1)}</option>)}
            </select>
          </Field>
          <p className="derived-ability-explanation">{ACTIVATION_EXPLANATIONS[draft.activationType]} This classification does not execute combat behavior in Pass 5.</p>
        </div>
      </section>

      <UseConditionsEditor draft={draft} onChange={onChange} />
      <CostsEditor draft={draft} onChange={onChange} />
      <UseLimitsEditor draft={draft} onChange={onChange} />
      <DerivedAbilityEffectsEditor
        draft={draft}
        references={references}
        onChange={onChange}
      />

      <section className="derived-ability-card">
        <header><p>RULES</p><h3>Human-Readable Rules Text</h3></header>
        <Field label="Rules Text" wide help="Keep the complete table-facing rule here. Structured Mechanical Effects are stored independently."><textarea rows={7} value={draft.core.mechanicalEffect} onChange={(event) => onChange({ ...draft, core: { ...draft.core, mechanicalEffect: event.target.value } })} /></Field>
      </section>

      <section className="derived-ability-card">
        <header><p>METADATA</p><h3>{draft.core.sourceSystem ? "Canonical Ability" : "Custom Ability"}</h3></header>
        <dl className="derived-ability-metadata">
          <div><dt>Record Type</dt><dd>{draft.core.sourceSystem ? "Canonical" : "Custom"}</dd></div>
          <div><dt>Source System</dt><dd>{draft.core.sourceSystem ?? "Custom"}</dd></div>
          <div><dt>Source Identity</dt><dd>{draft.core.sourceExternalId ?? "—"}</dd></div>
          <div><dt>Legacy Trigger Mirror</dt><dd>{draft.legacyTriggers.length === 1 ? `${draft.legacyTriggers[0]!.attributeKey} ${draft.legacyTriggers[0]!.minimumScore}+` : "None"}</dd></div>
          {aggregate ? <><div><dt>Created</dt><dd>{new Date(aggregate.createdAt).toLocaleString()}</dd></div><div><dt>Updated</dt><dd>{new Date(aggregate.updatedAt).toLocaleString()}</dd></div><div><dt>Legacy Campaign References</dt><dd>{aggregate.legacyCampaignReferenceCount}</dd></div></> : null}
        </dl>
      </section>
    </div>
  );
}
