"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { InitiativeTrackerReadModel } from "@/features/tabletop-operations/initiative-tracker";
import type { CombatAidEncounterView } from "@/features/tabletop-operations/combat-aid-service";
import type { ActionDeclarationWorkspaceView } from "@/features/tabletop-operations/action-declaration-service";
import type { DefenseInterventionWorkspaceView } from "@/features/tabletop-operations/defense-intervention-service";
import type { ActionEffectWorkspaceView } from "@/features/tabletop-operations/action-effect-plan-service";
import type { FirearmWorkspaceView } from "@/features/tabletop-operations/firearm-readiness-service";
import type { FirearmAttackWorkspaceView } from "@/features/tabletop-operations/firearm-attack-service";
import type { PlayerCombatRulingRequestView } from "@/features/tabletop-operations/player-combat-ruling-service";
import type { RollWorkspaceView } from "@/features/tabletop-operations/roll-runtime-service";

import {
  ActionDeclarationWorkspace,
  type BattleDeclarationPreset,
  type BattleDeclarationSourceChoice,
} from "./action-declaration-workspace";
import { ActionEffectPlanWorkspace } from "./action-effect-plan-workspace";
import { CombatAidWorkspace } from "./combat-aid-workspace";
import { DefenseInterventionWorkspace } from "./defense-intervention-workspace";
import { FirearmAttackWorkspace } from "./firearm-attack-workspace";
import { FirearmReadinessWorkspace } from "./firearm-readiness-workspace";
import { InitiativeTracker } from "./initiative-tracker";
import { PlayerCombatRulingWorkspace } from "./player-combat-ruling-workspace";
import { holdEncounterInitiative, passEncounterInitiative } from "./initiative-actions";

type BattleCommand = BattleDeclarationPreset["command"] | "defend" | "hold" | "pass";

const COMMANDS: readonly Readonly<{ key: BattleCommand; label: string }>[] = [
  { key: "attack", label: "Attack" },
  { key: "cast", label: "Cast" },
  { key: "item", label: "Item" },
  { key: "ability", label: "Ability" },
  { key: "defend", label: "Defend" },
  { key: "called-shot", label: "Called Shot" },
  { key: "move-other", label: "Move / Other" },
  { key: "hold", label: "Hold" },
  { key: "pass", label: "Pass" },
];

function titleCase(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ExchangeOverview({ view, effects }: { view: ActionDeclarationWorkspaceView; effects: ActionEffectWorkspaceView | null }) {
  const declarations = [...view.declarations].reverse().slice(0, 12);
  return <section className="encounter-battle-exchanges" aria-labelledby="encounter-exchanges-title">
    <header><div><span>CURRENT EXCHANGES &amp; HISTORY</span><h3 id="encounter-exchanges-title" className="font-sans">Actions stay attached to timing, responses and Rolls</h3></div><strong>{view.declarations.filter(({ status }) => !["resolved", "cancelled", "abandoned"].includes(status)).length} open</strong></header>
    <div>{declarations.map((declaration) => {
      const targetIds = declaration.lockedSnapshot?.targetCharacterIds ?? declaration.draft.targetCharacterIds;
      const targetNames = targetIds.map((characterId) => view.participants.find((participant) => participant.characterId === characterId)?.name).filter((name): name is string => Boolean(name));
      const result = effects?.plans.find(({ declarationId }) => declarationId === declaration.id) ?? null;
      return <article key={declaration.id}>
      <header><div><strong>{declaration.actorName}</strong><span>{declaration.lockedSnapshot?.label ?? declaration.draft.label}</span></div><em className={`tabletop-status is-${declaration.status}`}>{titleCase(declaration.status)}</em></header>
      <p>{targetNames.length ? `Target${targetNames.length === 1 ? "" : "s"}: ${targetNames.join(", ")}.` : "No target selected."}</p>
      <p>{declaration.timing ? `Started at ${declaration.timing.startInitiative}; ${declaration.timing.remainingInitiativeCost} Initiative remains; completion ${declaration.timing.expectedCompletionInitiative}.` : "Not yet committed to Initiative."}</p>
      <small>{declaration.rollState.message}</small>
      {declaration.opportunities.length ? <small>{declaration.opportunities.filter(({ status }) => status === "pending").length} response choice{declaration.opportunities.filter(({ status }) => status === "pending").length === 1 ? "" : "s"} pending.</small> : null}
      {result ? <small>Consequences: {titleCase(result.status)}.</small> : null}
    </article>})}</div>
    {!declarations.length ? <p className="tabletop-empty">No action history has been recorded for this Encounter.</p> : null}
  </section>;
}

export function EncounterBattleScreen({
  initiative,
  combatAid,
  declarations,
  defenses,
  effects,
  firearmReadiness,
  firearmAttacks,
  playerRulings,
  rollWorkspace,
}: {
  initiative: InitiativeTrackerReadModel;
  combatAid: CombatAidEncounterView | null;
  declarations: ActionDeclarationWorkspaceView | null;
  defenses: DefenseInterventionWorkspaceView | null;
  effects: ActionEffectWorkspaceView | null;
  firearmReadiness: FirearmWorkspaceView | null;
  firearmAttacks: FirearmAttackWorkspaceView | null;
  playerRulings: readonly PlayerCombatRulingRequestView[];
  rollWorkspace: RollWorkspaceView | null;
}) {
  const router = useRouter();
  const godCombatants = declarations?.participants.filter(({ choiceOwner }) => choiceOwner === "god") ?? [];
  const firstCombatantId = godCombatants.find(({ participationStatus }) => participationStatus === "active")?.characterId ?? godCombatants[0]?.characterId ?? 0;
  const [selectedCombatantId, setSelectedCombatantId] = useState(firstCombatantId);
  const selectedCombatant = godCombatants.find(({ characterId }) => characterId === selectedCombatantId) ?? godCombatants[0] ?? null;
  const selectedCombatState = combatAid?.participants.find(({ identity }) => identity.characterId === selectedCombatant?.characterId) ?? null;
  const battleSourceChoices: BattleDeclarationSourceChoice[] = selectedCombatState ? [
    ...selectedCombatState.spellSources.map((spell) => ({
      key: `spell:${spell.kind}:${"allocationId" in spell ? spell.allocationId : spell.savedSpellId}`,
      kind: "spell" as const,
      ref: spell.kind === "catalog" ? `spell:catalog:${spell.allocationId}` : spell.kind === "personal" ? `spell:personal:${spell.savedSpellId}` : `spell:raw-saved:${spell.savedSpellId}`,
      instanceId: null,
      label: spell.name,
      detail: spell.kind === "catalog" ? "Catalog Spell" : spell.kind === "personal" ? "Spellbook source" : "Saved formula with no framework",
    })),
    ...(selectedCombatState.resources?.stacks ?? []).filter(({ runtime }) => runtime.useMode !== "charges").map((item) => ({
      key: `item:stack:${item.itemId}`,
      kind: "item" as const,
      ref: `item:${item.itemId}`,
      instanceId: null,
      label: item.itemName,
      detail: `${item.runtime.activationLabel} · ${item.quantity} available`,
    })),
    ...(selectedCombatState.resources?.chargedInstances ?? []).map((item) => ({
      key: `item:instance:${item.instanceId}`,
      kind: "item" as const,
      ref: `item:${item.itemId}`,
      instanceId: item.instanceId,
      label: item.itemName,
      detail: `${item.currentCharges} / ${item.maximumCharges ?? "?"} charges`,
    })),
    ...selectedCombatState.creatureAbilities.map((ability) => ({
      key: `creature-ability:${ability.canonicalId}`,
      kind: "creature-ability" as const,
      ref: ability.canonicalId,
      instanceId: null,
      label: ability.abilityName,
      detail: `${ability.activation}${ability.requirements ? ` · ${ability.requirements}` : ""}`,
    })),
    ...selectedCombatState.derivedAbilities.map((ability) => ({
      key: `derived-ability:${ability.id}`,
      kind: "derived-ability" as const,
      ref: `derived-ability:${ability.id}`,
      instanceId: null,
      label: ability.name,
      detail: `${titleCase(ability.activation)} · currently available`,
    })),
  ] : [];
  const selectionStale = selectedCombatantId !== 0 && selectedCombatant?.characterId !== selectedCombatantId;
  const [command, setCommand] = useState<BattleCommand>("attack");
  const [presetVersion, setPresetVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const trackerParticipant = initiative.participants.find(({ characterId }) => characterId === selectedCombatant?.characterId) ?? null;
  const responseCount = declarations?.declarations.reduce((total, declaration) => total + declaration.opportunities.filter(({ status }) => status === "pending").length, 0) ?? 0;
  const resultCount = effects?.plans.filter(({ status }) => !["applied", "declined"].includes(status)).length ?? 0;
  const declarationCommand = command !== "defend" && command !== "hold" && command !== "pass";

  function chooseCommand(next: BattleCommand): void {
    setCommand(next);
    setFeedback(null);
    if (next !== "defend" && next !== "hold" && next !== "pass") setPresetVersion((value) => value + 1);
  }

  async function disposition(kind: "hold" | "pass"): Promise<void> {
    if (!selectedCombatant || selectionStale) return;
    setBusy(true);
    setFeedback(null);
    try {
      if (kind === "hold") await holdEncounterInitiative(initiative.encounter.id, selectedCombatant.characterId);
      else await passEncounterInitiative(initiative.encounter.id, selectedCombatant.characterId);
      setFeedback({ kind: "success", message: `${selectedCombatant.name} is now ${kind === "hold" ? "holding" : "passed"}.` });
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Initiative disposition could not be recorded." });
    } finally {
      setBusy(false);
    }
  }

  return <section className="encounter-battle-screen" aria-labelledby="encounter-battle-title">
    <header className="encounter-battle-header">
      <div><span>UNIFIED ENCOUNTER RUNTIME</span><h2 id="encounter-battle-title" className="font-sans">{initiative.encounter.title}</h2><p>{initiative.nextEvent?.summary ?? "Initialize Initiative to begin battle operations."}</p></div>
      {initiative.runtime ? <dl><div><dt>Round</dt><dd>{initiative.runtime.runtime.roundNumber}</dd></div><div><dt>Step</dt><dd>{initiative.runtime.runtime.stepNumber}</dd></div><div><dt>Timeline</dt><dd>{initiative.runtime.runtime.timelineInitiative}</dd></div><div><dt>Responses</dt><dd>{responseCount}</dd></div><div><dt>Results</dt><dd>{resultCount}</dd></div></dl> : null}
    </header>

    <div className="encounter-battle-controlbar">
      <label className="st-field"><span>NPC or Creature to control</span><select className="st-control" value={selectionStale ? "" : selectedCombatant?.characterId ?? ""} onChange={(event) => { setSelectedCombatantId(Number(event.target.value)); setPresetVersion((value) => value + 1); }}><option value="">Choose a G.O.D.-controlled combatant</option>{godCombatants.map((participant) => <option key={participant.characterId} value={participant.characterId}>{participant.name} · Initiative {participant.currentInitiative} · {titleCase(participant.participationStatus)}</option>)}</select></label>
      {selectedCombatant ? <p><strong>{selectedCombatant.name}</strong><span>{selectedCombatant.hasActiveAction ? "Action in progress" : trackerParticipant?.isCurrentOpportunity ? "Normal opportunity ready" : "Waiting on the shared timeline"}</span></p> : null}
    </div>
    {selectionStale ? <p className="tabletop-feedback is-error">The previously selected combatant left this live Encounter. The first available G.O.D.-controlled combatant is shown; choose again before declaring.</p> : null}

    <nav className="encounter-battle-commands" aria-label="Battle commands">{COMMANDS.map((entry) => <button type="button" key={entry.key} className={command === entry.key ? "is-selected" : ""} aria-pressed={command === entry.key} disabled={selectionStale || (!selectedCombatant && !["defend"].includes(entry.key))} onClick={() => chooseCommand(entry.key)}>{entry.label}{entry.key === "defend" && responseCount ? <span>{responseCount}</span> : null}{entry.key === "attack" && resultCount ? <span>{resultCount}</span> : null}</button>)}</nav>
    {feedback ? <p className={`tabletop-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}

    <details className="encounter-battle-timeline" open><summary>Shared Initiative and ongoing actions</summary><InitiativeTracker data={initiative} /></details>
    {declarations ? <ExchangeOverview view={declarations} effects={effects} /> : <section className="encounter-battle-exchanges"><p className="tabletop-empty">Initialize Initiative to open the shared exchange history.</p></section>}
    {effects ? <ActionEffectPlanWorkspace encounterId={initiative.encounter.id} view={effects} compact /> : null}

    {command === "hold" || command === "pass" ? <section className="encounter-battle-operation"><header><div><span>{command.toUpperCase()}</span><h3 className="font-sans">Set {selectedCombatant?.name ?? "combatant"}&apos;s Initiative disposition</h3></div></header><p>This command records the existing {command === "hold" ? "Hold" : "Pass"} disposition through the authoritative Initiative tracker.</p><button className="st-button is-primary" type="button" disabled={busy || selectionStale || !selectedCombatant || (command === "hold" ? !trackerParticipant?.canHold : !trackerParticipant?.canPass)} onClick={() => void disposition(command)}>{command === "hold" ? "Hold Initiative" : "Pass Initiative"}</button>{trackerParticipant && !(command === "hold" ? trackerParticipant.canHold : trackerParticipant.canPass) ? <small>This command is unavailable at the current authoritative Initiative state.</small> : null}</section> : null}

    {declarationCommand && declarations && selectedCombatant && !selectionStale ? <section className="encounter-battle-operation"><header><div><span>{command.replaceAll("-", " ").toUpperCase()}</span><h3 className="font-sans">Declare for {selectedCombatant.name}</h3></div></header>{command === "cast" || command === "item" || command === "ability" ? <p className="tabletop-feedback">Choose a source loaded from this combatant&apos;s current state. Remaining end-to-end executors are Pass 3 boundaries; a preview or intent is not a completed action, and no prepared-Spell mechanic is implied.</p> : null}<ActionDeclarationWorkspace key={`${selectedCombatant.characterId}:${command}:${presetVersion}`} view={declarations} battlePreset={{ actorCharacterId: selectedCombatant.characterId, command }} battleSourceChoices={battleSourceChoices} />{command === "attack" || command === "called-shot" ? <>{firearmReadiness ? <FirearmReadinessWorkspace view={firearmReadiness} /> : null}{firearmReadiness && firearmAttacks ? <FirearmAttackWorkspace readiness={firearmReadiness} attackView={firearmAttacks} /> : null}</> : null}</section> : null}

    {command === "defend" && declarations && defenses ? <section className="encounter-battle-operation"><header><div><span>DEFEND</span><h3 className="font-sans">Resolve only eligible incoming responses</h3></div></header><DefenseInterventionWorkspace actions={declarations} defense={defenses} /></section> : null}
    {declarations ? <PlayerCombatRulingWorkspace encounterId={initiative.encounter.id} requests={playerRulings} /> : null}
    {command !== "defend" && declarations && defenses ? <DefenseInterventionWorkspace actions={declarations} defense={defenses} /> : null}
    {combatAid ? <details className="encounter-battle-reference" open><summary>Roster, active state and combat reference</summary><CombatAidWorkspace data={combatAid} rollWorkspace={rollWorkspace} /></details> : null}
  </section>;
}
