"use client";

import {
  MODIFIER_ATTRIBUTE_KEYS,
  MECHANICAL_EFFECT_SCHEMA_VERSION,
  TEMPORARY_MODIFIER_CHANNELS,
  formatMechanicalEffectSummary,
  validateMechanicalEffect,
  type MechanicalEffect,
} from "@/features/mechanical-effects";
import {
  createCreatureAbilityEffectKey,
  reorderCreatureAbilityEffects,
  type CreatureAbilityDefinition,
} from "@/features/creatures/creature-ability";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

import "./creature-ability-effects-editor.css";

type Props = {
  ability: CreatureAbilityDefinition;
  skillOptions?: Array<{ id: number; name: string }>;
  onChange: (ability: CreatureAbilityDefinition) => void;
};

type DurationKind = "until-removed" | "scene" | "combat-steps" | "combat-rounds";

function newEffect(kind: MechanicalEffect["kind"]): MechanicalEffect {
  if (kind === "health.heal") return { kind, amount: 1, scope: "full-body" };
  if (kind === "health.damage") return { kind, amount: 1, application: "localized" };
  if (kind === "condition.apply") return { kind, name: "", description: "", duration: { kind: "until-removed", value: null } };
  if (kind === "modifier.apply") return { kind, label: "", channel: "initiative", targetKey: "self", amount: 1, duration: { kind: "until-removed", value: null } };
  return { kind, title: "", description: "" };
}

function durationFor(kind: DurationKind) {
  return kind === "combat-steps" || kind === "combat-rounds"
    ? { kind, value: 1 }
    : { kind, value: null };
}

export function CreatureAbilityEffectsEditor({ ability, skillOptions = [], onChange }: Props) {
  const preserveScroll = useInPlaceScrollPreservation();
  function add() {
    const effectKey = createCreatureAbilityEffectKey(ability.effects);
    onChange({
      ...ability,
      effects: [...ability.effects, {
        effectKey,
        schemaVersion: MECHANICAL_EFFECT_SCHEMA_VERSION,
        effect: newEffect("manual"),
        sortOrder: ability.effects.length,
      }],
    });
  }

  function replace(index: number, effect: MechanicalEffect) {
    const current = ability.effects[index];
    onChange({
      ...ability,
      effects: ability.effects.map((entry, effectIndex) => effectIndex === index
        ? { ...current, schemaVersion: MECHANICAL_EFFECT_SCHEMA_VERSION, effect, sortOrder: index }
        : entry),
    });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= ability.effects.length) return;
    const effects = [...ability.effects];
    [effects[index], effects[target]] = [effects[target], effects[index]];
    onChange({ ...ability, effects: reorderCreatureAbilityEffects(effects) });
  }

  return <section className="creature-ability-effects">
    <header><div><p>COMMON RUNTIME CONTRACT</p><h4>Structured Effects</h4></div><button type="button" onClick={() => void preserveScroll(add)}>Add Effect</button></header>
    <p className="creature-ability-effects__note">Structured Effects use the shared Active State bridge. Mechanical Notes above remain descriptive and are never parsed.</p>
    {!ability.effects.length ? <p className="creature-ability-effects__empty">No structured effects. At runtime, existing descriptive instructions become one temporary Manual instruction.</p> : null}
    {ability.effects.map((entry, index) => {
      const effect = entry.effect;
      const validation = validateMechanicalEffect(effect);
      return <article key={entry.effectKey}>
        <header><div><strong>{validation.valid ? formatMechanicalEffectSummary(validation.effect) : `Effect ${index + 1}`}</strong><span>{entry.effectKey} · Order {index + 1}</span></div><div><button type="button" disabled={index === 0} onClick={() => void preserveScroll(() => move(index, -1))}>Up</button><button type="button" disabled={index === ability.effects.length - 1} onClick={() => void preserveScroll(() => move(index, 1))}>Down</button><button type="button" className="is-danger" onClick={() => void preserveScroll(() => onChange({ ...ability, effects: reorderCreatureAbilityEffects(ability.effects.filter((_, effectIndex) => effectIndex !== index)) }))}>Remove</button></div></header>
        <div className="creature-ability-effects__grid">
          <label><span>Effect</span><select value={effect.kind} onChange={(event) => replace(index, newEffect(event.target.value as MechanicalEffect["kind"]))}><option value="health.damage">Health Damage</option><option value="health.heal">Health Healing</option><option value="condition.apply">Apply Condition</option><option value="modifier.apply">Apply Temporary Modifier</option><option value="manual">Manual / G.O.D. Resolution</option></select></label>
          {effect.kind === "health.damage" ? <><label><span>Amount</span><input type="number" min={0} step="any" value={effect.amount} onChange={(event) => replace(index, { ...effect, amount: Number(event.target.value) })} /></label><label><span>Application</span><input disabled value="Localized · runtime anatomy selection" /></label></> : null}
          {effect.kind === "health.heal" ? <><label><span>Amount</span><input type="number" min={0} step="any" value={effect.amount} onChange={(event) => replace(index, { ...effect, amount: Number(event.target.value) })} /></label><label><span>Application</span><select value={effect.scope} onChange={(event) => replace(index, { ...effect, scope: event.target.value as "full-body" | "area" })}><option value="full-body">Full Body</option><option value="area">Area Applied</option></select></label></> : null}
          {effect.kind === "condition.apply" ? <><label><span>Condition Name</span><input value={effect.name} onChange={(event) => replace(index, { ...effect, name: event.target.value })} /></label><label><span>Duration</span><select value={effect.duration.kind} onChange={(event) => replace(index, { ...effect, duration: durationFor(event.target.value as DurationKind) })}><option value="until-removed">Until Removed</option><option value="scene">Scene</option><option value="combat-steps">Combat Steps</option><option value="combat-rounds">Combat Rounds</option></select></label>{effect.duration.kind === "combat-steps" || effect.duration.kind === "combat-rounds" ? <label><span>Duration Count</span><input type="number" min={1} step={1} value={effect.duration.value ?? 1} onChange={(event) => replace(index, { ...effect, duration: { ...effect.duration, value: Number(event.target.value) } })} /></label> : null}<label className="is-wide"><span>Description</span><textarea rows={3} value={effect.description} onChange={(event) => replace(index, { ...effect, description: event.target.value })} /></label></> : null}
          {effect.kind === "modifier.apply" ? <><label><span>Label</span><input value={effect.label} onChange={(event) => replace(index, { ...effect, label: event.target.value })} /></label><label><span>Channel</span><select value={effect.channel} onChange={(event) => { const channel = event.target.value as typeof effect.channel; const targetKey = channel === "attribute" ? "STR" : channel === "skill" ? `skill:${skillOptions[0]?.id ?? ""}` : channel === "movement" ? "movement:Land" : "self"; replace(index, { ...effect, channel, targetKey }); }}>{TEMPORARY_MODIFIER_CHANNELS.map((channel) => <option key={channel}>{channel}</option>)}</select></label>{effect.channel === "attribute" ? <label><span>Attribute</span><select value={effect.targetKey} onChange={(event) => replace(index, { ...effect, targetKey: event.target.value })}>{MODIFIER_ATTRIBUTE_KEYS.map((key) => <option key={key}>{key}</option>)}</select></label> : null}{effect.channel === "skill" ? <label><span>Skill Target</span><select value={effect.targetKey} onChange={(event) => replace(index, { ...effect, targetKey: event.target.value })}><option value="">Choose linked Skill</option>{skillOptions.map((skill) => <option key={skill.id} value={`skill:${skill.id}`}>{skill.name} · #{skill.id}</option>)}</select></label> : null}{effect.channel === "movement" ? <label><span>Movement Mode</span><input value={effect.targetKey.replace("movement:", "")} onChange={(event) => replace(index, { ...effect, targetKey: `movement:${event.target.value}` })} /></label> : null}<label><span>Amount</span><input type="number" step="any" value={effect.amount} onChange={(event) => replace(index, { ...effect, amount: Number(event.target.value) })} /></label><label><span>Duration</span><select value={effect.duration.kind} onChange={(event) => replace(index, { ...effect, duration: durationFor(event.target.value as DurationKind) })}><option value="until-removed">Until Removed</option><option value="scene">Scene</option><option value="combat-steps">Combat Steps</option><option value="combat-rounds">Combat Rounds</option></select></label>{effect.duration.kind === "combat-steps" || effect.duration.kind === "combat-rounds" ? <label><span>Duration Count</span><input type="number" min={1} step={1} value={effect.duration.value ?? 1} onChange={(event) => replace(index, { ...effect, duration: { ...effect.duration, value: Number(event.target.value) } })} /></label> : null}</> : null}
          {effect.kind === "manual" ? <><label><span>Title</span><input value={effect.title} onChange={(event) => replace(index, { ...effect, title: event.target.value })} /></label><label className="is-wide"><span>Instructions</span><textarea rows={4} value={effect.description} onChange={(event) => replace(index, { ...effect, description: event.target.value })} /></label></> : null}
        </div>
        {!validation.valid ? <ul>{validation.issues.map((issue) => <li key={`${issue.path}-${issue.message}`}>{issue.message}</li>)}</ul> : null}
      </article>;
    })}
  </section>;
}
