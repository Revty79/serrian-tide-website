"use client";

import type { ItemAuthoringReferences } from "./actions";
import {
  MODIFIER_ATTRIBUTE_KEYS,
  TEMPORARY_MODIFIER_CHANNELS,
  type MechanicalEffect,
} from "@/features/mechanical-effects";
import { passiveLifecycleLabel, type PassiveRequiredEquipmentState } from "@/features/items/equipment-state";

const DEFAULT_EFFECT_KINDS: readonly MechanicalEffect["kind"][] = ["health.damage", "health.heal", "condition.apply", "modifier.apply", "manual"];

function effectKindLabel(kind: MechanicalEffect["kind"]): string {
  if (kind === "health.damage") return "Health Damage";
  if (kind === "health.heal") return "Health Healing";
  if (kind === "condition.apply") return "Condition";
  if (kind === "modifier.apply") return "Modifier";
  return "Manual / G.O.D.";
}

export function MechanicalEffectEditor({
  effect,
  skills,
  onChange,
  onKindChange,
  allowedKinds = DEFAULT_EFFECT_KINDS,
  passiveRequiredEquipmentState,
}: {
  effect: MechanicalEffect;
  skills: ItemAuthoringReferences["skills"];
  onChange: (effect: MechanicalEffect) => void;
  onKindChange?: (kind: MechanicalEffect["kind"]) => void;
  allowedKinds?: readonly MechanicalEffect["kind"][];
  passiveRequiredEquipmentState?: PassiveRequiredEquipmentState;
}) {
  const effectKinds = allowedKinds.includes(effect.kind) ? allowedKinds : [effect.kind, ...allowedKinds];
  const lifecycleLabel = passiveRequiredEquipmentState ? passiveLifecycleLabel(passiveRequiredEquipmentState) : null;
  const timing = effect.kind === "health.heal" || effect.kind === "health.damage" ? effect.timing?.mode ?? "immediate" : null;
  const updateTiming = (mode: "immediate" | "over-time") => {
    if (effect.kind !== "health.heal" && effect.kind !== "health.damage") return;
    onChange(mode === "immediate" ? { ...effect, timing: { mode } } : { ...effect, timing: { mode, frequency: effect.timing?.frequency ?? "combat-rounds", applications: effect.timing?.applications ?? 1, firstApplication: effect.timing?.firstApplication ?? "immediate" } });
  };
  return <div className="item-form-grid">
    {onKindChange ? <label className="item-field item-field--wide"><span>Effect Type</span><select value={effect.kind} onChange={(event) => onKindChange(event.target.value as MechanicalEffect["kind"])}>{effectKinds.map((kind) => <option key={kind} value={kind} disabled={!allowedKinds.includes(kind)}>{effectKindLabel(kind)}{allowedKinds.includes(kind) ? "" : " (unsupported saved effect)"}</option>)}</select></label> : null}
    {effect.kind === "health.heal" ? <><label className="item-field"><span>Amount</span><input type="number" min={0} step="any" value={effect.amount} onChange={(event) => onChange({ ...effect, amount: Number(event.target.value) })} /></label><label className="item-field"><span>Application</span><select value={effect.scope} onChange={(event) => onChange({ ...effect, scope: event.target.value as "full-body" | "area" })}><option value="full-body">Full Body</option><option value="area">Specific HP Area</option></select></label><label className="item-field"><span>Timing</span><select value={timing ?? "immediate"} onChange={(event) => updateTiming(event.target.value as "immediate" | "over-time")}><option value="immediate">Immediate</option><option value="over-time">Over Time</option></select></label></> : null}
    {effect.kind === "health.damage" ? <><label className="item-field"><span>Amount</span><input type="number" min={0} step="any" value={effect.amount} onChange={(event) => onChange({ ...effect, amount: Number(event.target.value) })} /></label><label className="item-field"><span>Application</span><select value={effect.application} onChange={(event) => onChange({ ...effect, application: event.target.value as "localized" | "area" | "full-body" })}><option value="localized">Hit / Chosen Area</option><option value="area">Specific HP Area</option><option value="full-body">Full Body</option></select></label><label className="item-field"><span>Timing</span><select value={timing ?? "immediate"} onChange={(event) => updateTiming(event.target.value as "immediate" | "over-time")}><option value="immediate">Immediate</option><option value="over-time">Over Time</option></select></label></> : null}
    {timing === "over-time" && (effect.kind === "health.heal" || effect.kind === "health.damage") ? <><label className="item-field"><span>Frequency</span><select value={effect.timing?.frequency ?? "combat-rounds"} onChange={(event) => onChange({ ...effect, timing: { ...effect.timing!, mode: "over-time", frequency: event.target.value as "combat-steps" | "combat-rounds" } })}><option value="combat-steps">Each Combat Step</option><option value="combat-rounds">Each Combat Round</option></select></label><label className="item-field"><span>Applications</span><input type="number" min={1} step={1} value={effect.timing?.applications ?? 1} onChange={(event) => onChange({ ...effect, timing: { ...effect.timing!, mode: "over-time", applications: Number(event.target.value) } })} /></label><label className="item-field"><span>First Application</span><select value={effect.timing?.firstApplication ?? "immediate"} onChange={(event) => onChange({ ...effect, timing: { ...effect.timing!, mode: "over-time", firstApplication: event.target.value as "immediate" | "next-interval" } })}><option value="immediate">Immediately</option><option value="next-interval">At Next Interval</option></select></label></> : null}
    {effect.kind === "condition.apply" ? <><label className="item-field"><span>Condition Name</span><input value={effect.name} onChange={(event) => onChange({ ...effect, name: event.target.value })} /></label>{lifecycleLabel ? <label className="item-field"><span>Lifecycle</span><input disabled value={lifecycleLabel} /></label> : <><label className="item-field"><span>Duration</span><select value={effect.duration.kind} onChange={(event) => { const kind = event.target.value as "until-removed" | "scene" | "combat-steps" | "combat-rounds"; onChange({ ...effect, duration: kind === "combat-steps" || kind === "combat-rounds" ? { kind, value: 1 } : { kind, value: null } }); }}><option value="until-removed">Until Removed</option><option value="scene">Scene</option><option value="combat-steps">Combat Steps</option><option value="combat-rounds">Combat Rounds</option></select></label>{effect.duration.kind === "combat-steps" || effect.duration.kind === "combat-rounds" ? <label className="item-field"><span>Duration Count</span><input type="number" min={1} step={1} value={effect.duration.value ?? 1} onChange={(event) => onChange({ ...effect, duration: { ...effect.duration, value: Number(event.target.value) } })} /></label> : null}</>}<label className="item-field item-field--wide"><span>Description</span><textarea rows={3} value={effect.description} onChange={(event) => onChange({ ...effect, description: event.target.value })} /></label></> : null}
    {effect.kind === "modifier.apply" ? <><label className="item-field"><span>Label</span><input value={effect.label} onChange={(event) => onChange({ ...effect, label: event.target.value })} /></label><label className="item-field"><span>Channel</span><select value={effect.channel} onChange={(event) => { const channel = event.target.value as typeof effect.channel; const targetKey = channel === "attribute" ? "STR" : channel === "skill" ? `skill:${skills[0]?.id ?? ""}` : channel === "movement" ? "movement:Land" : "self"; onChange({ ...effect, channel, targetKey }); }}>{TEMPORARY_MODIFIER_CHANNELS.map((channel) => <option key={channel}>{channel}</option>)}</select></label>{effect.channel === "attribute" ? <label className="item-field"><span>Attribute</span><select value={effect.targetKey} onChange={(event) => onChange({ ...effect, targetKey: event.target.value })}>{MODIFIER_ATTRIBUTE_KEYS.map((key) => <option key={key}>{key}</option>)}</select></label> : null}{effect.channel === "skill" ? <label className="item-field"><span>Skill</span><select value={effect.targetKey} onChange={(event) => onChange({ ...effect, targetKey: event.target.value })}>{skills.map((skill) => <option key={skill.id} value={`skill:${skill.id}`}>{skill.name}</option>)}</select></label> : null}{effect.channel === "movement" ? <label className="item-field"><span>Movement Mode</span><input value={effect.targetKey.replace("movement:", "")} onChange={(event) => onChange({ ...effect, targetKey: `movement:${event.target.value}` })} /></label> : null}<label className="item-field"><span>Amount</span><input type="number" step={1} value={effect.amount} onChange={(event) => onChange({ ...effect, amount: Number(event.target.value) })} /></label>{lifecycleLabel ? <label className="item-field"><span>Lifecycle</span><input disabled value={lifecycleLabel} /></label> : <><label className="item-field"><span>Duration</span><select value={effect.duration.kind} onChange={(event) => { const kind = event.target.value as "until-removed" | "scene" | "combat-steps" | "combat-rounds"; onChange({ ...effect, duration: kind === "combat-steps" || kind === "combat-rounds" ? { kind, value: 1 } : { kind, value: null } }); }}><option value="until-removed">Until Removed</option><option value="scene">Scene</option><option value="combat-steps">Combat Steps</option><option value="combat-rounds">Combat Rounds</option></select></label>{effect.duration.kind === "combat-steps" || effect.duration.kind === "combat-rounds" ? <label className="item-field"><span>Duration Count</span><input type="number" min={1} step={1} value={effect.duration.value ?? 1} onChange={(event) => onChange({ ...effect, duration: { ...effect.duration, value: Number(event.target.value) } })} /></label> : null}</>}</> : null}
    {effect.kind === "manual" ? <><label className="item-field"><span>Title</span><input value={effect.title} onChange={(event) => onChange({ ...effect, title: event.target.value })} /></label><label className="item-field item-field--wide"><span>Description / Instructions</span><textarea rows={4} value={effect.description} onChange={(event) => onChange({ ...effect, description: event.target.value })} /></label></> : null}
  </div>;
}
