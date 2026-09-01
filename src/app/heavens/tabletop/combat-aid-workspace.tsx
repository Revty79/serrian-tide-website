"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type {
  CombatAidEncounterView,
  CombatAidParticipant,
} from "@/features/tabletop-operations/combat-aid-service";

function value(value: number | null): string {
  return value === null ? "Unconfigured" : String(value);
}

function participantSubtitle(participant: CombatAidParticipant): string {
  return participant.identity.playerName
    ? `Player: ${participant.identity.playerName}`
    : participant.identity.creatureTemplateName
      ? `Creature: ${participant.identity.creatureTemplateName}`
      : participant.identity.kindLabel;
}

function SummaryCard({
  participant,
  selected,
  onSelect,
}: {
  participant: CombatAidParticipant;
  selected: boolean;
  onSelect: () => void;
}) {
  const conditions = participant.effects?.conditions.length ?? 0;
  const modifiers = participant.effects?.modifiers.length ?? 0;
  const injuries = participant.health?.unresolvedInjuryCount ?? 0;
  const weapon = participant.equipment?.wieldedWeapons[0];
  return <button type="button" className={selected ? "is-selected" : ""} onClick={onSelect}>
    <header>
      <div><span>{participant.identity.kindLabel}</span><strong>{participant.identity.name}</strong><small>{participantSubtitle(participant)}</small></div>
      {participant.errors.length ? <em title={participant.errors.map(({ message }) => message).join(" ")}>Partial</em> : null}
    </header>
    <dl>
      <div><dt>Health</dt><dd>{participant.health ? `${value(participant.health.total.remainingHp)} / ${value(participant.health.total.maximumHp)}` : "Unavailable"}</dd></div>
      <div><dt>Effects</dt><dd>{conditions} C · {modifiers} M</dd></div>
      <div><dt>Injuries</dt><dd>{injuries}</dd></div>
      <div><dt>Initiative</dt><dd>{participant.initiative.enrolled ? participant.initiative.currentInitiative : "Not enrolled"}</dd></div>
    </dl>
    <p>{participant.mana?.pools.length
      ? participant.mana.pools.map((pool) => `${pool.system} ${pool.currentMana}/${pool.maximumMana}`).join(" · ")
      : "No active Mana pools"}</p>
    <p>{participant.effects?.conditions.length
      ? `Conditions: ${participant.effects.conditions.map(({ name }) => name).join(" · ")}`
      : "No active Conditions"}</p>
    <p>{weapon ? `${weapon.itemName} · ${weapon.damage || "Damage unconfigured"} · Init ${weapon.initiativeCost ?? "—"}` : "No wielded weapon"}</p>
  </button>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="combat-aid-empty">{children}</p>;
}

export function CombatAidWorkspace({
  data,
  onOpenInitiative,
}: {
  data: CombatAidEncounterView;
  onOpenInitiative: () => void;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(data.participants[0]?.identity.characterId ?? null);
  const selected = data.participants.find(({ identity }) => identity.characterId === selectedId)
    ?? data.participants[0]
    ?? null;

  return <section className="combat-aid">
    <header className="combat-aid-heading">
      <div><span>READ-ONLY LIVE STATE</span><h6 className="font-sans">Combat Aid</h6><p>One table view of the authoritative state already owned by each runtime system.</p></div>
      <div><button type="button" onClick={() => router.refresh()}>Refresh State</button><button type="button" onClick={onOpenInitiative}>Open Initiative Tracker</button></div>
    </header>
    {data.encounter.status === "completed" ? <p className="combat-aid-history"><strong>Completed Encounter:</strong> participant membership is historical. The Character and NPC state shown below is current living Campaign state, not an Encounter snapshot.</p> : null}
    <section className="combat-aid-runtime-strip">
      <div><span>Encounter</span><strong>{data.encounter.title}</strong></div>
      <div><span>Initiative</span><strong>{data.initiativeRuntime ? data.initiativeRuntime.status : "Not started"}</strong></div>
      <div><span>Round / Step</span><strong>{data.initiativeRuntime ? `${data.initiativeRuntime.roundNumber} / ${data.initiativeRuntime.stepNumber}` : "—"}</strong></div>
      <div><span>Timeline</span><strong>{data.initiativeRuntime?.timelineInitiative ?? "—"}</strong></div>
    </section>

    <div className="combat-aid-layout">
      <aside className="combat-aid-overview">
        <header><span>ENCOUNTER PARTICIPANTS</span><strong>{data.participants.length}</strong></header>
        <div>{data.participants.map((participant) => <SummaryCard
          key={participant.identity.characterId}
          participant={participant}
          selected={participant.identity.characterId === selectedId}
          onSelect={() => setSelectedId(participant.identity.characterId)}
        />)}{!data.participants.length ? <Empty>No Encounter participants are available.</Empty> : null}</div>
      </aside>

      <section className="combat-aid-detail">
        {selected ? <>
          <header><div><span>{selected.identity.kindLabel}</span><h6 className="font-sans">{selected.identity.name}</h6><small>{participantSubtitle(selected)}</small></div><strong>Character #{selected.identity.characterId}</strong></header>
          {selected.errors.length ? <div className="combat-aid-errors">{selected.errors.map((error) => <p key={error.section}><strong>{error.section}:</strong> {error.message}</p>)}</div> : null}

          <div className="combat-aid-section-grid">
            <article className="is-wide">
              <header><span>HEALTH</span><strong>{selected.health ? `${value(selected.health.total.remainingHp)} / ${value(selected.health.total.maximumHp)} remaining` : "Unavailable"}</strong></header>
              {selected.health ? <>
                <div className="combat-aid-health-tracks">
                  <div><b>Total Health</b><span>{selected.health.total.damage} damage · {value(selected.health.total.remainingHp)} remaining</span></div>
                  {selected.health.tracks.map((track) => <div key={track.key}><b>{track.name}</b><span>{track.damage} damage · {value(track.remainingHp)} / {value(track.maximumHp)} remaining{track.orphaned ? " · Stored pool needs resolution" : ""}</span></div>)}
                </div>
                <details><summary>Hit-location reference ({selected.health.anatomy.kind})</summary><div className="combat-aid-hit-locations">{selected.health.anatomy.hitLocations.map((location) => <span key={location.result}><b>{location.result} · {location.name}</b>{location.bodyParts ? ` — ${location.bodyParts}` : ""}<small>{location.poolName ?? "No HP Pool"}</small></span>)}</div></details>
              </> : <Empty>Health state could not be resolved.</Empty>}
            </article>

            <article>
              <header><span>MANA</span><strong>{selected.mana?.pools.length ?? 0} pools</strong></header>
              {selected.mana?.pools.length ? <div className="combat-aid-list">{selected.mana.pools.map((pool) => <div key={pool.system}><b>{pool.system}</b><span>{pool.currentMana} / {pool.maximumMana}</span><small>{pool.sourceSkillName} · Access {pool.spellAccessLevel}</small></div>)}</div> : <Empty>No active Mana pools.</Empty>}
            </article>

            <article>
              <header><span>INITIATIVE</span><strong>{selected.initiative.enrolled ? selected.initiative.participationStatus : "Not enrolled"}</strong></header>
              {selected.initiative.enrolled ? <dl className="combat-aid-values">
                <div><dt>Current</dt><dd>{selected.initiative.currentInitiative}</dd></div><div><dt>Normal</dt><dd>{selected.initiative.normalTotalInitiative}</dd></div>
                <div><dt>Deferred</dt><dd>{selected.initiative.deferredInitiativeCost}</dd></div><div><dt>Mode</dt><dd>{selected.initiative.movementMode || "—"}</dd></div>
              </dl> : <Empty>This participant is not enrolled in the current Initiative runtime.</Empty>}
              {selected.initiative.enrolled && selected.initiative.pendingAction ? <p className="combat-aid-pending"><b>{selected.initiative.pendingAction.label}</b> · {selected.initiative.pendingAction.status} · {selected.initiative.pendingAction.remainingInitiativeCost} remaining · completes at {selected.initiative.pendingAction.expectedCompletionInitiative}</p> : null}
            </article>

            <article>
              <header><span>CONDITIONS &amp; MODIFIERS</span><strong>{(selected.effects?.conditions.length ?? 0) + (selected.effects?.modifiers.length ?? 0)} active</strong></header>
              {selected.effects && (selected.effects.conditions.length || selected.effects.modifiers.length) ? <div className="combat-aid-list">
                {selected.effects.conditions.map((condition) => <div key={`condition:${condition.id}`}><b>{condition.name}</b><span>{condition.duration.label}</span><small>{condition.description || "No description"} · Source: {condition.source.name}</small></div>)}
                {selected.effects.modifiers.map((modifier) => <div key={`modifier:${modifier.id}`}><b>{modifier.label}</b><span>{modifier.amount >= 0 ? "+" : ""}{modifier.amount} {modifier.channel}</span><small>{modifier.targetKey} · {modifier.duration.label} · Source: {modifier.source.name}</small></div>)}
              </div> : <Empty>No active Conditions or Modifiers.</Empty>}
            </article>

            <article>
              <header><span>UNRESOLVED INJURIES</span><strong>{selected.health?.unresolvedInjuryCount ?? 0}</strong></header>
              {selected.health?.injuries.some(({ resolved }) => !resolved) ? <div className="combat-aid-list">{selected.health.injuries.filter(({ resolved }) => !resolved).map((injury) => <div key={injury.id}><b>{injury.name}</b><span>{injury.poolNameSnapshot}{injury.hitLocationNameSnapshot ? ` · ${injury.hitLocationNameSnapshot}` : ""}</span><small>{injury.damageAmount === null ? "Damage not recorded" : `${injury.damageAmount} damage`} · {injury.notes || "No notes"}</small></div>)}</div> : <Empty>No unresolved injuries.</Empty>}
            </article>

            <article className="is-wide">
              <header><span>EQUIPMENT</span><strong>{(selected.equipment?.wieldedWeapons.length ?? 0) + (selected.equipment?.wornArmor.length ?? 0)} active profiles</strong></header>
              {selected.equipment ? <div className="combat-aid-equipment">
                <section><h6>Wielded Weapons</h6>{selected.equipment.wieldedWeapons.map((weapon) => <div key={weapon.ownershipKey}><b>{weapon.itemName}</b><span>{weapon.damage || "Damage unconfigured"} {weapon.damageType} · Initiative {weapon.initiativeCost ?? "unconfigured"}</span><small>Item #{weapon.itemId} · {weapon.ownershipKey} · {weapon.handedness} · {weapon.range || weapon.reach || "No range/reach"}</small></div>)}{!selected.equipment.wieldedWeapons.length ? <Empty>None wielded.</Empty> : null}</section>
                <section><h6>Worn Armor</h6>{selected.equipment.wornArmor.map((armor) => <div key={armor.ownershipKey}><b>{armor.itemName}</b><span>Soak {armor.baseSoak ?? "unconfigured"} · {armor.coverage || "Coverage unconfigured"}</span><small>Item #{armor.itemId} · {armor.ownershipKey} · {armor.coveredLocationKeys.join(", ") || "No mapped locations"}</small></div>)}{!selected.equipment.wornArmor.length ? <Empty>None worn.</Empty> : null}</section>
                <section><h6>Active Passives</h6>{selected.equipment.activeManualPassives.map((passive) => <div key={passive.passiveEffectId}><b>{passive.title}</b><span>{passive.itemName} · {passive.lifecycleLabel}</span><small>{passive.description}</small></div>)}{!selected.equipment.activeManualPassives.length ? <Empty>No active manual passives.</Empty> : null}</section>
              </div> : <Empty>Equipment state could not be resolved.</Empty>}
            </article>

            <article className="is-wide">
              <header><span>INVENTORY RESOURCES &amp; CHARGES</span><strong>{(selected.resources?.stacks.length ?? 0) + (selected.resources?.chargedInstances.length ?? 0)} entries</strong></header>
              {selected.resources ? <div className="combat-aid-resources">
                {selected.resources.stacks.map((stack) => <div key={`stack:${stack.itemId}`}><b>{stack.itemName}</b><span>Quantity {stack.quantity} · {stack.runtime.useMode === "none" ? "Inventory reference" : stack.runtime.activationLabel}</span><small>Item #{stack.itemId} · {stack.category}{stack.runtime.quantityPerUse ? ` · ${stack.runtime.quantityPerUse} per use` : ""}{stack.runtime.useNotes ? ` · ${stack.runtime.useNotes}` : ""}</small></div>)}
                {selected.resources.chargedInstances.map((instance) => <div key={`instance:${instance.instanceId}`}><b>{instance.itemName} · Copy #{instance.instanceId}</b><span>{instance.currentCharges} / {instance.maximumCharges} charges · {instance.chargesPerUse} per use</span><small>Item #{instance.itemId} · {instance.equipmentState}{instance.rechargeNotes ? ` · ${instance.rechargeNotes}` : ""}</small></div>)}
                {!selected.resources.stacks.length && !selected.resources.chargedInstances.length ? <Empty>No operational inventory resources or charged instances.</Empty> : null}
              </div> : <Empty>Inventory resource state could not be resolved.</Empty>}
            </article>
          </div>
        </> : <Empty>Select an Encounter participant to inspect current state.</Empty>}
      </section>
    </div>
  </section>;
}
