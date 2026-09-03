"use client";

import { useMemo, useState } from "react";

import {
  MODIFIER_ATTRIBUTE_KEYS,
  RUNTIME_DURATION_KINDS,
  TEMPORARY_MODIFIER_CHANNELS,
  validateMechanicalEffect,
  type MechanicalEffect,
  type RuntimeDuration,
  type TemporaryModifierChannel,
} from "@/features/mechanical-effects";
import { formatDerivedAbilityMechanicalEffectSummary } from "@/features/derived-abilities/derived-ability-effects";

import type {
  DerivedAbilityDraft,
  DerivedAbilityEditorReferences,
} from "./actions";

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

function createEffect(kind: MechanicalEffect["kind"]): MechanicalEffect {
  if (kind === "health.heal") {
    return { kind, amount: 1, scope: "full-body" };
  }
  if (kind === "health.damage") {
    return { kind, amount: 1, application: "localized" };
  }
  if (kind === "condition.apply") {
    return {
      kind,
      name: "",
      description: "",
      duration: { kind: "until-removed", value: null },
    };
  }
  if (kind === "modifier.apply") {
    return {
      kind,
      label: "",
      channel: "attribute",
      targetKey: "STR",
      amount: 1,
      duration: { kind: "until-removed", value: null },
    };
  }
  return { kind, title: "", description: "" };
}

function durationForKind(
  current: RuntimeDuration,
  kind: RuntimeDuration["kind"],
): RuntimeDuration {
  const label = current.label?.trim();
  return kind === "combat-steps" || kind === "combat-rounds"
    ? { kind, value: 1, ...(label ? { label } : {}) }
    : { kind, value: null, ...(label ? { label } : {}) };
}

function DurationEditor({
  duration,
  onChange,
}: {
  duration: RuntimeDuration;
  onChange: (duration: RuntimeDuration) => void;
}) {
  const counted = duration.kind === "combat-steps" || duration.kind === "combat-rounds";
  return (
    <>
      <Field label="Duration">
        <select
          value={duration.kind}
          onChange={(event) => onChange(durationForKind(
            duration,
            event.target.value as RuntimeDuration["kind"],
          ))}
        >
          {RUNTIME_DURATION_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind === "until-removed"
                ? "Until Removed"
                : kind === "combat-steps"
                  ? "Combat Steps"
                  : kind === "combat-rounds"
                    ? "Combat Rounds"
                    : "Scene"}
            </option>
          ))}
        </select>
      </Field>
      {counted ? (
        <Field label="Duration Count">
          <input
            type="number"
            min={1}
            step={1}
            value={duration.value ?? 1}
            onChange={(event) => onChange({
              ...duration,
              value: Number(event.target.value),
            })}
          />
        </Field>
      ) : null}
      <Field label="Duration Label" wide help="Optional table-facing wording; duration behavior still uses the selected shared kind.">
        <input
          value={duration.label ?? ""}
          placeholder="Optional duration wording"
          onChange={(event) => onChange({
            ...duration,
            label: event.target.value || undefined,
          })}
        />
      </Field>
    </>
  );
}

function SkillTargetSelect({
  targetKey,
  skills,
  onChange,
}: {
  targetKey: string;
  skills: DerivedAbilityEditorReferences["skills"];
  onChange: (targetKey: string) => void;
}) {
  const [search, setSearch] = useState("");
  const selectedId = /^skill:([1-9]\d*)$/.exec(targetKey)?.[1] ?? "";
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("en-US");
    if (!query) return skills;
    return skills.filter((entry) =>
      entry.name.toLocaleLowerCase("en-US").includes(query) ||
      String(entry.id).includes(query),
    );
  }, [search, skills]);
  const selected = skills.find((entry) => String(entry.id) === selectedId);
  const choices = selected && !visible.some((entry) => entry.id === selected.id)
    ? [selected, ...visible]
    : visible;
  return (
    <div className="derived-ability-reference-select">
      <input
        type="search"
        value={search}
        placeholder="Find Skill"
        aria-label="Find modifier Skill"
        onChange={(event) => setSearch(event.target.value)}
      />
      <select
        aria-label="Modifier Skill"
        value={selectedId ? `skill:${selectedId}` : ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose Skill</option>
        {choices.map((entry) => (
          <option key={entry.id} value={`skill:${entry.id}`}>
            {entry.name} · #{entry.id}
          </option>
        ))}
      </select>
    </div>
  );
}

function targetForChannel(
  channel: TemporaryModifierChannel,
  skills: DerivedAbilityEditorReferences["skills"],
): string {
  if (channel === "attribute") return "STR";
  if (channel === "skill") return skills[0] ? `skill:${skills[0].id}` : "";
  if (channel === "movement") return "movement:Land";
  return "self";
}

export function DerivedAbilityEffectsEditor({
  draft,
  references,
  onChange,
}: {
  draft: DerivedAbilityDraft;
  references: DerivedAbilityEditorReferences;
  onChange: (draft: DerivedAbilityDraft) => void;
}) {
  const setEffects = (effects: MechanicalEffect[]) => onChange({ ...draft, effects });
  const replace = (index: number, effect: MechanicalEffect) => setEffects(
    draft.effects.map((entry, position) => position === index ? effect : entry),
  );
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.effects.length) return;
    const effects = [...draft.effects];
    [effects[index], effects[target]] = [effects[target]!, effects[index]!];
    setEffects(effects);
  };

  return (
    <section className="derived-ability-card derived-ability-effects-card">
      <header className="derived-ability-card-heading">
        <div>
          <p>SYSTEM CONSEQUENCES</p>
          <h3>Mechanical Effects</h3>
          <span>
            Mechanical Effects are structured consequences the Serrian Tide runtime can understand.
            Rules Text remains the complete table-facing rule; use Manual effects for G.O.D. judgment.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setEffects([...draft.effects, createEffect("health.heal")])}
        >
          Add Effect
        </button>
      </header>
      {!draft.effects.length ? (
        <p className="derived-ability-empty">
          No structured effects. Rules Text remains available as a manual compatibility fallback.
        </p>
      ) : null}
      <div className="derived-ability-row-list">
        {draft.effects.map((effect, index) => {
          const validation = validateMechanicalEffect(effect);
          return (
            <article className="derived-ability-edit-row derived-ability-effect-row" key={index}>
              <header>
                <div>
                  <strong>
                    {validation.valid
                      ? formatDerivedAbilityMechanicalEffectSummary(validation.effect)
                      : `Effect ${index + 1}`}
                  </strong>
                  <span>Effect {index + 1}</span>
                </div>
                <div className="derived-ability-row-actions">
                  <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>Move Up</button>
                  <button type="button" disabled={index === draft.effects.length - 1} onClick={() => move(index, 1)}>Move Down</button>
                  <button className="is-danger" type="button" onClick={() => setEffects(draft.effects.filter((_, position) => position !== index))}>Remove</button>
                </div>
              </header>
              <div className="derived-ability-form-grid">
                <Field label="Effect Type">
                  <select
                    value={effect.kind}
                    onChange={(event) => replace(
                      index,
                      createEffect(event.target.value as MechanicalEffect["kind"]),
                    )}
                  >
                    <option value="health.heal">Heal</option>
                    <option value="health.damage">Damage</option>
                    <option value="condition.apply">Apply Condition</option>
                    <option value="modifier.apply">Apply Modifier</option>
                    <option value="manual">Manual</option>
                  </select>
                </Field>

                {effect.kind === "health.heal" ? (
                  <>
                    <Field label="Amount">
                      <input type="number" min="0.000001" step="any" value={effect.amount} onChange={(event) => replace(index, { ...effect, amount: Number(event.target.value) })} />
                    </Field>
                    <Field label="Scope">
                      <select value={effect.scope} onChange={(event) => replace(index, { ...effect, scope: event.target.value as "full-body" | "area" })}>
                        <option value="full-body">Full Body</option>
                        <option value="area">Area</option>
                      </select>
                    </Field>
                  </>
                ) : null}

                {effect.kind === "health.damage" ? (
                  <>
                    <Field label="Amount">
                      <input type="number" min="0.000001" step="any" value={effect.amount} onChange={(event) => replace(index, { ...effect, amount: Number(event.target.value) })} />
                    </Field>
                    <Field label="Application" help="The target and hit location are selected only when a future runtime use is resolved.">
                      <input disabled value="Localized" />
                    </Field>
                  </>
                ) : null}

                {effect.kind === "condition.apply" ? (
                  <>
                    <Field label="Condition Name">
                      <input value={effect.name} onChange={(event) => replace(index, { ...effect, name: event.target.value })} />
                    </Field>
                    <Field label="Description" wide>
                      <textarea rows={3} value={effect.description} onChange={(event) => replace(index, { ...effect, description: event.target.value })} />
                    </Field>
                    <DurationEditor duration={effect.duration} onChange={(duration) => replace(index, { ...effect, duration })} />
                  </>
                ) : null}

                {effect.kind === "modifier.apply" ? (
                  <>
                    <Field label="Label">
                      <input value={effect.label} onChange={(event) => replace(index, { ...effect, label: event.target.value })} />
                    </Field>
                    <Field label="Modifier Channel">
                      <select
                        value={effect.channel}
                        onChange={(event) => {
                          const channel = event.target.value as TemporaryModifierChannel;
                          replace(index, {
                            ...effect,
                            channel,
                            targetKey: targetForChannel(channel, references.skills),
                          });
                        }}
                      >
                        {TEMPORARY_MODIFIER_CHANNELS.map((channel) => (
                          <option key={channel} value={channel}>
                            {channel[0]!.toUpperCase() + channel.slice(1)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {effect.channel === "attribute" ? (
                      <Field label="Attribute Target">
                        <select value={effect.targetKey} onChange={(event) => replace(index, { ...effect, targetKey: event.target.value })}>
                          {MODIFIER_ATTRIBUTE_KEYS.map((key) => <option key={key} value={key}>{key}</option>)}
                        </select>
                      </Field>
                    ) : null}
                    {effect.channel === "skill" ? (
                      <Field label="Skill Target" wide help="Persists the stable target skill:<positive-id>. It does not change stored Skill # or unlock eligibility.">
                        <SkillTargetSelect
                          targetKey={effect.targetKey}
                          skills={references.skills}
                          onChange={(targetKey) => replace(index, { ...effect, targetKey })}
                        />
                      </Field>
                    ) : null}
                    {effect.channel === "movement" ? (
                      <Field label="Movement Mode" help="Persists the shared stable form movement:<mode>.">
                        <input
                          value={effect.targetKey.replace(/^movement:/, "")}
                          placeholder="Land"
                          onChange={(event) => replace(index, {
                            ...effect,
                            targetKey: `movement:${event.target.value}`,
                          })}
                        />
                      </Field>
                    ) : null}
                    {effect.channel === "initiative" || effect.channel === "soak" || effect.channel === "damage" ? (
                      <Field label="Target" help="The shared validator requires self for this channel.">
                        <input disabled value="Self" />
                      </Field>
                    ) : null}
                    <Field label="Amount" help="Positive is a bonus; negative is a penalty. Must be a non-zero whole number.">
                      <input type="number" step={1} value={effect.amount} onChange={(event) => replace(index, { ...effect, amount: Number(event.target.value) })} />
                    </Field>
                    <DurationEditor duration={effect.duration} onChange={(duration) => replace(index, { ...effect, duration })} />
                  </>
                ) : null}

                {effect.kind === "manual" ? (
                  <>
                    <Field label="Title">
                      <input value={effect.title} onChange={(event) => replace(index, { ...effect, title: event.target.value })} />
                    </Field>
                    <Field label="Description" wide>
                      <textarea rows={4} value={effect.description} onChange={(event) => replace(index, { ...effect, description: event.target.value })} />
                    </Field>
                    <p className="derived-ability-effect-note">
                      Manual Mechanical Effects are consequences requiring table judgment. They are separate from Manual Requirements, which determine eligibility.
                    </p>
                  </>
                ) : null}
              </div>
              {!validation.valid ? (
                <ul className="derived-ability-validation-list">
                  {validation.issues.map((issue) => (
                    <li key={`${issue.path}-${issue.message}`}>{issue.message}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
