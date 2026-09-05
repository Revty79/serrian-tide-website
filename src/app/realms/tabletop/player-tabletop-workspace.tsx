import Link from "next/link";

import { PlayerCalledCheckPanel } from "@/app/realms/characters/[characterId]/player-called-check-panel";
import type {
  PlayerTabletopCharacterOption,
  PlayerTabletopConsoleView,
} from "@/features/tabletop-operations/player-tabletop-console";
import { TabletopLiveRefresh } from "@/features/tabletop-operations/tabletop-live-refresh";

import {
  PlayerTabletopDice,
  PlayerTabletopItemUse,
  PlayerTabletopSpellUse,
} from "./player-tabletop-actions";
import styles from "./player-tabletop.module.css";

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function titleCase(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Section({
  id,
  eyebrow,
  title,
  detail,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return <section className={styles.section} aria-labelledby={id}>
    <header className={styles.sectionHeader}>
      <div><p className={styles.eyebrow}>{eyebrow}</p><h2 id={id}>{title}</h2></div>
      {detail ? <p>{detail}</p> : null}
    </header>
    {children}
  </section>;
}

export function PlayerTabletopWorkspace({
  characters,
  view,
}: {
  characters: readonly PlayerTabletopCharacterOption[];
  view: PlayerTabletopConsoleView;
}) {
  const activeConditions = view.effects.conditions.filter(({ resolvedAt }) => resolvedAt === null);
  const activeModifiers = view.effects.modifiers.filter(({ endedAt }) => endedAt === null);
  const priorEffects = [
    ...view.effects.conditions.filter(({ resolvedAt }) => resolvedAt !== null).map((entry) => ({
      key: `condition:${entry.id}`,
      name: entry.name,
      detail: entry.resolutionNote || "Resolved condition",
      at: entry.resolvedAt!,
    })),
    ...view.effects.modifiers.filter(({ endedAt }) => endedAt !== null).map((entry) => ({
      key: `modifier:${entry.id}`,
      name: entry.label,
      detail: entry.endNote || "Ended modifier",
      at: entry.endedAt!,
    })),
  ].sort((left, right) => right.at.localeCompare(left.at)).slice(0, 30);

  return <main className={styles.page}>
    <div className={styles.shell}>
      <TabletopLiveRefresh mode="player" characterId={view.identity.characterId} scope="console" />
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>PLAYER TABLETOP CONSOLE</p>
          <h1>{view.identity.characterName}</h1>
          <p>{view.identity.campaignName} · {view.identity.playerUsername}</p>
        </div>
        <form action="/realms/tabletop" method="get" className={styles.characterSelect}>
          <label htmlFor="tabletop-character">Campaign Character</label>
          <select id="tabletop-character" name="character" defaultValue={view.identity.characterId}>
            {characters.map((character) => <option key={character.characterId} value={character.characterId}>{character.characterName} — {character.campaignName}</option>)}
          </select>
          <button type="submit">Open</button>
        </form>
      </header>

      <section className={styles.statusStrip} aria-label="Current Character and Session status">
        <div><span>Health</span><strong>{view.health.total.remainingHp ?? "—"} / {view.health.total.maximumHp ?? "—"}</strong><small>{view.health.total.damage} damage · {view.health.unresolvedInjuryCount} unresolved injuries</small></div>
        <div><span>Mana</span><strong>{view.mana.pools.length ? view.mana.pools.reduce((sum, pool) => sum + pool.currentMana, 0) : "—"}</strong><small>{view.mana.pools.length ? `${view.mana.pools.length} canonical pool${view.mana.pools.length === 1 ? "" : "s"}` : "No resolved Mana pools"}</small></div>
        <div><span>Table state</span><strong>{view.presence.label}</strong><small>{view.presence.detail}</small></div>
      </section>

      <Section id="tabletop-context" eyebrow="LIVE CONTEXT" title="At the table" detail="The active hierarchy is displayed as recorded; this console never invents Session membership.">
        <div className={styles.contextGrid}>
          <article><span>Campaign</span><h3>{view.identity.campaignName}</h3><p>{view.identity.campaignOverview || "No Campaign overview has been provided."}</p></article>
          <article><span>Character</span><h3>{view.identity.characterName}</h3><p>{[view.identity.raceName, view.identity.age ? `Age ${view.identity.age}` : null, view.identity.sex].filter(Boolean).join(" · ") || "No public profile details"}</p><Link href={`/realms/characters/${view.identity.characterId}`}>Open full Character Sheet</Link></article>
          <article><span>Session</span><h3>{view.session?.title ?? "No active Session"}</h3><p>{view.session ? `${view.session.rostered ? "Rostered" : "Not rostered"} · started ${dateTime(view.session.startedAt)}` : "Persistent Character tools remain available."}</p></article>
          <article><span>Scene</span><h3>{view.scene?.title ?? "No active Scene"}</h3><p>{view.scene ? [view.scene.locationLabel, view.scene.description].filter(Boolean).join(" · ") || "No public Scene description" : "This Character has no active Scene membership."}</p></article>
          <article><span>Encounter</span><h3>{view.encounter?.title ?? "No active Encounter"}</h3>{view.encounter ? <p>{titleCase(view.encounter.encounterType)} · {view.encounter.participating ? titleCase(view.encounter.participationStatus) : "Not participating"}{view.encounter.roundNumber !== null ? ` · Round ${view.encounter.roundNumber}, Step ${view.encounter.stepNumber}` : ""}{view.encounter.currentInitiative !== null ? ` · Initiative ${view.encounter.currentInitiative}` : ""}</p> : <p>No Encounter is attached to this Character&apos;s active Scene.</p>}</article>
        </div>
        {view.encounter ? <p className={styles.boundaryNotice}>Combat state is read-only in Pass 12. Attack, Aim, Called Shot, reload, defense, and other Encounter controls arrive with the Player Combat Workspace in Pass 13.</p> : null}
      </Section>

      {view.calledChecks ? <PlayerCalledCheckPanel view={view.calledChecks} /> : null}

      <div className={styles.twoColumn}>
        <Section id="tabletop-state" eyebrow="ACTIVE STATE" title="Health, Mana & effects">
          <div className={styles.resourceList}>
            {view.health.tracks.map((track) => <article key={track.key}><h3>{track.name}</h3><strong>{track.remainingHp ?? "—"} / {track.maximumHp ?? "—"} HP</strong><span>{track.damage} damage{track.overDamage ? ` · ${track.overDamage} over-damage` : ""}</span></article>)}
            {view.mana.pools.map((pool) => <article key={pool.system}><h3>{pool.system}</h3><strong>{pool.currentMana} / {pool.maximumMana} Mana</strong><span>{pool.sourceSkillName} · {pool.sourceSkillPoints}%</span></article>)}
          </div>
          <div className={styles.effectGrid}>
            <div><h3>Conditions</h3>{activeConditions.length ? <ul>{activeConditions.map((entry) => <li key={entry.id}><strong>{entry.name}</strong><span>{entry.description || entry.duration.label} · {entry.source.name}</span></li>)}</ul> : <p>None active.</p>}</div>
            <div><h3>Modifiers</h3>{activeModifiers.length ? <ul>{activeModifiers.map((entry) => <li key={entry.id}><strong>{entry.amount >= 0 ? "+" : ""}{entry.amount} {titleCase(entry.channel)}</strong><span>{entry.label} · {entry.targetKey} · {entry.duration.label}</span></li>)}</ul> : <p>None active.</p>}</div>
          </div>
        </Section>

        <Section id="tabletop-dice" eyebrow="ROLL TRAY" title="General Rolls" detail="Called Checks and High/Low requests stay in the live requests panel.">
          <PlayerTabletopDice characterId={view.identity.characterId} enabled={view.presence.liveActionsAllowed} />
        </Section>
      </div>

      <Section id="tabletop-items" eyebrow="OWNED SOURCES" title="Items & equipment" detail="Every owned copy remains distinct. Aggregate legacy firearms are identified and never converted implicitly.">
        {view.items.length ? <div className={styles.cardGrid}>{view.items.map((item) => <article className={styles.sourceCard} key={item.ownershipKey}>
          <header><div><span>{item.category}</span><h3>{item.name}</h3></div><strong>{item.quantity > 1 ? `×${item.quantity}` : item.equipmentState}</strong></header>
          {item.description ? <p>{item.description}</p> : null}
          <dl><div><dt>Equipment</dt><dd>{item.equipmentState}</dd></div>{item.maximumCharges !== null ? <div><dt>Charges</dt><dd>{item.currentCharges ?? "—"} / {item.maximumCharges}</dd></div> : null}</dl>
          {item.firearmState ? <div className={styles.firearmState}><strong>{item.firearmState.selectedModeName}</strong><span>{item.firearmState.loadedRounds}{item.firearmState.capacityRounds === null ? "" : ` / ${item.firearmState.capacityRounds}`} rounds · {item.firearmState.loadedAmmunitionName ?? "No ammunition"}</span><span>{[item.firearmState.readied ? "Readied" : "Not readied", item.firearmState.requiresCycling ? "Requires cycling" : null, item.firearmState.requiresRecoilRecovery ? "Recoil recovery required" : null].filter(Boolean).join(" · ")}</span></div> : null}
          {item.effects.length ? <ul>{item.effects.map((effect, index) => <li key={index}>{effect}</li>)}</ul> : null}
          {item.legacyAggregateFirearm ? <p className={styles.ruling}>Legacy aggregate firearm · exact per-copy readiness is unavailable and no conversion was attempted.</p> : null}
          {item.requiresGodRuling ? <p className={styles.ruling}>G.O.D. ruling required before use.</p> : null}
          {item.canUseSafely ? <PlayerTabletopItemUse characterId={view.identity.characterId} item={item} disabled={!view.presence.noncombatSourceUseAllowed} /> : null}
        </article>)}</div> : <p className={styles.emptyCopy}>No owned Items are recorded for this Character.</p>}
      </Section>

      <Section id="tabletop-spells" eyebrow="KNOWN MAGIC" title="Spells" detail="Catalog Spell lineage and personal Spellbook identity are preserved exactly.">
        {view.spells.length ? <div className={styles.cardGrid}>{view.spells.map((spell) => <article className={styles.sourceCard} key={spell.key}>
          <header><div><span>{spell.sourceLabel} · {spell.tradition}</span><h3>{spell.name}</h3></div><strong>{spell.manaCost === null ? "Review" : `${spell.manaCost} Mana`}</strong></header>
          {spell.lineageLabel ? <p className={styles.lineage}>{spell.lineageLabel}</p> : null}
          <p>{spell.activationLabel}</p>
          {spell.effects.length ? <ul>{spell.effects.map((effect, index) => <li key={index}>{effect}</li>)}</ul> : null}
          {spell.issues.map((issue, index) => <p className={styles.ruling} key={index}>{issue}</p>)}
          {!spell.available ? <p className={styles.ruling}>This Character does not currently resolve the required casting source.</p> : null}
          {spell.requiresGodRuling ? <p className={styles.ruling}>Missing or manual mechanics require a G.O.D. ruling.</p> : null}
          {spell.canUseSafely && spell.castSource && view.presence.noncombatSourceUseAllowed ? <PlayerTabletopSpellUse characterId={view.identity.characterId} source={spell.castSource} label={spell.name} /> : null}
        </article>)}</div> : <p className={styles.emptyCopy}>No known or personal Spells are recorded for this Character.</p>}
      </Section>

      <Section id="tabletop-abilities" eyebrow="DERIVED ABILITIES" title="Possessed abilities" detail="Availability and authored mechanics are shown without granting, learning, or G.O.D.-confirmation controls.">
        {view.derivedAbilities.length ? <div className={styles.cardGrid}>{view.derivedAbilities.map((ability) => <article className={styles.sourceCard} key={ability.id}>
          <header><div><span>{titleCase(ability.activation)}</span><h3>{ability.name}</h3></div><strong>{ability.availability}</strong></header>
          <p>{ability.description}</p>
          {[...ability.requirements, ...ability.costs, ...ability.limits, ...ability.effects].length ? <ul>{[...ability.requirements, ...ability.costs, ...ability.limits, ...ability.effects].map((detail, index) => <li key={index}>{detail}</li>)}</ul> : null}
          {ability.requiresGodRuling ? <p className={styles.ruling}>Manual mechanics require a G.O.D. ruling.</p> : null}
        </article>)}</div> : <p className={styles.emptyCopy}>No Derived Abilities are currently possessed.</p>}
      </Section>

      <Section id="tabletop-history" eyebrow="RECENT RECORD" title="History" detail="Recent entries are bounded; this is not an unbounded archive load.">
        <div className={styles.historyGrid}>
          <div><h3>Completed table requests</h3>{view.calledCheckHistory.some((entry) => entry.calledChecks.length || entry.highLow.length) ? view.calledCheckHistory.map((entry) => <section key={entry.session.id}><h4>{entry.session.title}</h4><ol>{entry.calledChecks.map((request) => <li key={`check:${request.id}`}><strong>{titleCase(request.status)} · {request.purpose}</strong><span>{request.sourceLabel}{request.resolution ? ` · Roll ${request.resolution.resultTotal} · ${request.resolution.succeeded ? "Success" : "Failure"}` : ""}{request.rulingText ? ` · G.O.D. ruling: ${request.rulingText}` : ""}</span></li>)}{entry.highLow.map((request) => <li key={`high-low:${request.id}`}><strong>{titleCase(request.status)} · {request.purpose}</strong><span>High / Low{request.calledSide ? ` · Called ${titleCase(request.calledSide)}` : ""}{request.result ? ` · Roll ${request.result.resultTotal} · ${titleCase(request.result.rolledSide)}` : ""}{request.rulingText ? ` · G.O.D. ruling: ${request.rulingText}` : ""}</span></li>)}</ol></section>) : <p>No visible requests in completed Sessions.</p>}</div>
          <div><h3>Roll ledger</h3>{view.rolls.length ? <ol>{view.rolls.map((roll) => <li key={roll.id}><strong>{roll.effectiveResultTotal} · {roll.label}</strong><span>{titleCase(roll.purposeKind)} · {titleCase(roll.visibility)} · {dateTime(roll.createdAt)}{roll.status === "voided" ? " · Voided" : ""}</span></li>)}</ol> : <p>No visible Rolls in recent rostered Sessions.</p>}</div>
          <div><h3>Effect history</h3>{priorEffects.length ? <ol>{priorEffects.map((entry) => <li key={entry.key}><strong>{entry.name}</strong><span>{entry.detail} · {dateTime(entry.at)}</span></li>)}</ol> : <p>No resolved Conditions or ended Modifiers.</p>}</div>
          <div><h3>Ability uses</h3>{view.derivedAbilityUses.length ? <ol>{view.derivedAbilityUses.map((entry) => <li key={entry.id}><strong>{entry.abilityName}</strong><span>{entry.effectSummary || entry.manualSteps || "Recorded use"} · {dateTime(entry.usedAt)}</span></li>)}</ol> : <p>No recent Derived Ability uses.</p>}</div>
          <div><h3>Sessions</h3>{view.recentSessions.length ? <ol>{view.recentSessions.map((session) => <li key={session.id}><strong>#{session.sequenceNumber} · {session.title}</strong><span>{titleCase(session.status)} · {dateTime(session.startedAt)}</span>{session.sceneTitles.length ? <small>Scenes: {session.sceneTitles.join(", ")}</small> : null}{session.encounterTitles.length ? <small>Encounters: {session.encounterTitles.join(", ")}</small> : null}</li>)}</ol> : <p>No rostered Session history.</p>}</div>
        </div>
      </Section>
    </div>
  </main>;
}
