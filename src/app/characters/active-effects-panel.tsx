"use client";

import { useState, type FormEvent } from "react";

import {
  addConditionAction,
  addModifierAction,
  endModifierAction,
  resolveConditionAction,
} from "./active-effects-actions";
import {
  getActiveModifierTotalRows,
  type ActiveEffectsView,
} from "@/features/active-state/active-effects";
import {
  MODIFIER_ATTRIBUTE_KEYS,
  TEMPORARY_MODIFIER_CHANNELS,
  type RuntimeDuration,
  type TemporaryModifierChannel,
} from "@/features/mechanical-effects";

import "./active-effects-panel.css";

type Props = {
  state: ActiveEffectsView;
  godMode: boolean;
  skillOptions?: Array<{ id: number; name: string }>;
  movementModes?: string[];
  onChange: (state: ActiveEffectsView) => void;
};

function signed(value: number) { return value > 0 ? `+${value}` : String(value); }
function sourceLabel(source: { kind: string; name: string; effectKey: string | null }) { return `${source.kind} · ${source.name}${source.effectKey ? ` · ${source.effectKey}` : ""}`; }
function duration(kind: RuntimeDuration["kind"], value: number): RuntimeDuration { return kind === "combat-steps" || kind === "combat-rounds" ? { kind, value: Math.max(1, Math.trunc(value)) } : { kind, value: null }; }

export function ActiveEffectsPanel({ state, godMode, skillOptions = [], movementModes = [], onChange }: Props) {
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conditionName, setConditionName] = useState("");
  const [conditionDescription, setConditionDescription] = useState("");
  const [conditionDuration, setConditionDuration] = useState<RuntimeDuration["kind"]>("until-removed");
  const [conditionDurationValue, setConditionDurationValue] = useState(1);
  const [modifierLabel, setModifierLabel] = useState("");
  const [modifierChannel, setModifierChannel] = useState<TemporaryModifierChannel>("attribute");
  const [modifierTarget, setModifierTarget] = useState("STR");
  const [modifierAmount, setModifierAmount] = useState(1);
  const [modifierDuration, setModifierDuration] = useState<RuntimeDuration["kind"]>("until-removed");
  const [modifierDurationValue, setModifierDurationValue] = useState(1);
  const activeConditions = state.conditions.filter(({ resolvedAt }) => resolvedAt === null);
  const activeModifiers = state.modifiers.filter(({ endedAt }) => endedAt === null);
  const pastConditions = state.conditions.filter(({ resolvedAt }) => resolvedAt !== null);
  const pastModifiers = state.modifiers.filter(({ endedAt }) => endedAt !== null);
  const activeModifierTotals = getActiveModifierTotalRows(activeModifiers);
  const skillNames = new Map(skillOptions.map(({ id, name }) => [`skill:${id}`, name]));

  function modifierTargetLabel(channel: TemporaryModifierChannel, targetKey: string) {
    if (channel === "skill") return skillNames.get(targetKey) ?? targetKey;
    if (channel === "movement") return targetKey.slice("movement:".length);
    if (targetKey === "self") return channel;
    return targetKey;
  }

  async function run(operation: () => Promise<ActiveEffectsView>) {
    setBusy(true); setError(null);
    try { onChange(await operation()); } catch (caught) { setError(caught instanceof Error ? caught.message : "Active State could not be updated."); }
    finally { setBusy(false); }
  }

  function changeChannel(channel: TemporaryModifierChannel) {
    setModifierChannel(channel);
    setModifierTarget(channel === "attribute" ? "STR" : channel === "skill" ? `skill:${skillOptions[0]?.id ?? ""}` : channel === "movement" ? `movement:${movementModes[0] ?? ""}` : "self");
  }

  function addCondition(event: FormEvent) {
    event.preventDefault();
    void run(() => addConditionAction({ characterId: state.characterId, name: conditionName, description: conditionDescription, duration: duration(conditionDuration, conditionDurationValue) })).then(() => { setConditionName(""); setConditionDescription(""); });
  }

  function addModifier(event: FormEvent) {
    event.preventDefault();
    void run(() => addModifierAction({ characterId: state.characterId, label: modifierLabel, channel: modifierChannel, targetKey: modifierTarget, amount: modifierAmount, duration: duration(modifierDuration, modifierDurationValue) })).then(() => setModifierLabel(""));
  }

  return <section className="active-effects-panel" aria-label="Conditions and Temporary Modifiers">
    <header><div><p>ACTIVE STATE</p><h3>Conditions &amp; Temporary Modifiers</h3></div><span>Names are descriptive. Only explicit modifiers affect runtime totals.</span></header>
    {error ? <p className="active-effects-panel__error" role="alert">{error}</p> : null}
    <div className="active-effects-panel__columns">
      <section><h4>Conditions <span>{activeConditions.length}</span></h4>{activeConditions.length ? activeConditions.map((entry) => <article key={entry.id}><strong>{entry.name}</strong><span>{entry.duration.label}</span>{entry.description ? <p>{entry.description}</p> : null}<small>Source: {sourceLabel(entry.source)}</small>{godMode ? <button type="button" disabled={busy} onClick={() => void run(() => resolveConditionAction(state.characterId, entry.id))}>Resolve</button> : null}</article>) : <p className="active-effects-panel__empty">No active Conditions.</p>}</section>
      <section><h4>Temporary Modifiers <span>{activeModifiers.length}</span></h4>{activeModifierTotals.length ? <div className="active-effects-panel__totals" aria-label="Combined active modifier totals">{activeModifierTotals.map((entry) => <span key={`${entry.channel}:${entry.targetKey}`}><b>{modifierTargetLabel(entry.channel, entry.targetKey)}</b> {signed(entry.total)}</span>)}</div> : null}{activeModifiers.length ? activeModifiers.map((entry) => <article key={entry.id}><strong>{entry.label} <b>{signed(entry.amount)}</b></strong><span>{entry.channel} · {modifierTargetLabel(entry.channel, entry.targetKey)} · {entry.duration.label}</span><small>Source: {sourceLabel(entry.source)}</small>{godMode ? <button type="button" disabled={busy} onClick={() => void run(() => endModifierAction(state.characterId, entry.id))}>End</button> : null}</article>) : <p className="active-effects-panel__empty">No active Temporary Modifiers.</p>}</section>
    </div>
    {godMode ? <div className="active-effects-panel__controls">
      <form onSubmit={addCondition}><h4>Add descriptive Condition</h4><label>Name<input required value={conditionName} onChange={(event) => setConditionName(event.target.value)} /></label><label>Description<textarea value={conditionDescription} onChange={(event) => setConditionDescription(event.target.value)} /></label><label>Duration<select value={conditionDuration} onChange={(event) => setConditionDuration(event.target.value as RuntimeDuration["kind"])}><option value="until-removed">Until Removed</option><option value="scene">Scene</option><option value="combat-steps">Combat Steps</option><option value="combat-rounds">Combat Rounds</option></select></label>{conditionDuration === "combat-steps" || conditionDuration === "combat-rounds" ? <label>Count<input type="number" min={1} step={1} value={conditionDurationValue} onChange={(event) => setConditionDurationValue(Number(event.target.value))} /></label> : null}<button type="submit" disabled={busy || !conditionName.trim()}>Add Condition</button></form>
      <form onSubmit={addModifier}><h4>Add explicit Modifier</h4><label>Label<input required value={modifierLabel} onChange={(event) => setModifierLabel(event.target.value)} /></label><label>Channel<select value={modifierChannel} onChange={(event) => changeChannel(event.target.value as TemporaryModifierChannel)}>{TEMPORARY_MODIFIER_CHANNELS.map((channel) => <option key={channel}>{channel}</option>)}</select></label>{modifierChannel === "attribute" ? <label>Attribute<select value={modifierTarget} onChange={(event) => setModifierTarget(event.target.value)}>{MODIFIER_ATTRIBUTE_KEYS.map((key) => <option key={key}>{key}</option>)}</select></label> : modifierChannel === "skill" ? <label>Skill<select value={modifierTarget} onChange={(event) => setModifierTarget(event.target.value)}><option value="">Choose Skill</option>{skillOptions.map((skill) => <option key={skill.id} value={`skill:${skill.id}`}>{skill.name}</option>)}</select></label> : modifierChannel === "movement" ? <label>Movement Mode<select value={modifierTarget} onChange={(event) => setModifierTarget(event.target.value)}><option value="">Choose Movement Mode</option>{movementModes.map((mode) => <option key={mode} value={`movement:${mode}`}>{mode}</option>)}</select></label> : <label>Target<input disabled value="self" /></label>}<label>Amount<input type="number" step={1} value={modifierAmount} onChange={(event) => setModifierAmount(Number(event.target.value))} /></label><label>Duration<select value={modifierDuration} onChange={(event) => setModifierDuration(event.target.value as RuntimeDuration["kind"])}><option value="until-removed">Until Removed</option><option value="scene">Scene</option><option value="combat-steps">Combat Steps</option><option value="combat-rounds">Combat Rounds</option></select></label>{modifierDuration === "combat-steps" || modifierDuration === "combat-rounds" ? <label>Count<input type="number" min={1} step={1} value={modifierDurationValue} onChange={(event) => setModifierDurationValue(Number(event.target.value))} /></label> : null}<button type="submit" disabled={busy || !modifierLabel.trim() || !modifierTarget || !Number.isInteger(modifierAmount) || modifierAmount === 0}>Add Modifier</button></form>
    </div> : null}
    {(pastConditions.length || pastModifiers.length) ? <div className="active-effects-panel__history"><button type="button" onClick={() => setHistory((value) => !value)}>{history ? "Hide" : "Show"} resolved/ended history ({pastConditions.length + pastModifiers.length})</button>{history ? <div>{pastConditions.map((entry) => <p key={`condition-${entry.id}`}><strong>{entry.name}</strong> · Resolved · {entry.resolutionNote || "No note"}</p>)}{pastModifiers.map((entry) => <p key={`modifier-${entry.id}`}><strong>{entry.label} {signed(entry.amount)}</strong> · Ended · {entry.endNote || "No note"}</p>)}</div> : null}</div> : null}
  </section>;
}
