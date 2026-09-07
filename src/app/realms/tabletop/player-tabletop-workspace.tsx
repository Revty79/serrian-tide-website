import Link from "next/link";

import { PlayerCalledCheckPanel } from "@/app/realms/characters/[characterId]/player-called-check-panel";
import type {
  PlayerTabletopCharacterOption,
  PlayerTabletopConsoleView,
} from "@/features/tabletop-operations/player-tabletop-console";
import { TabletopLiveRefresh } from "@/features/tabletop-operations/tabletop-live-refresh";
import type { ShopVisitView } from "@/features/tabletop-operations/shop-visit-service";
import type { ShopCommerceView } from "@/features/tabletop-operations/shop-commerce-service";

import {
  PlayerTabletopDice,
  PlayerTabletopItemUse,
  PlayerTabletopSpellUse,
} from "./player-tabletop-actions";
import { PlayerCombatConsole, PlayerCombatIntentButton } from "./player-combat-console";
import styles from "./player-tabletop.module.css";
import { PlayerShopVisit } from "./player-shop-visit";

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function titleCase(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function CombatAvailabilityNotice({ availability }: { availability: PlayerTabletopConsoleView["combatAvailability"] }) {
  return <aside className={`${styles.boundaryNotice} ${styles.closedWork}`} role="status">
    <span>{availability.reason}</span>
    {availability.unfinishedWork?.length ? <ul>
      {availability.unfinishedWork.map((work) => <li key={work.declarationId}>
        <strong>Exchange #{work.declarationId}: {work.label}</strong>
        <span>{work.message}</span>
      </li>)}
    </ul> : null}
  </aside>;
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
  shopVisit,
  shopCommerce,
  requestedMode,
}: {
  characters: readonly PlayerTabletopCharacterOption[];
  view: PlayerTabletopConsoleView;
  shopVisit: ShopVisitView | null;
  shopCommerce: ShopCommerceView | null;
  requestedMode: "battle" | "reference" | null;
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
  const battleHref = `/realms/tabletop?character=${view.identity.characterId}&mode=battle`;
  const referenceHref = `/realms/tabletop?character=${view.identity.characterId}&mode=reference`;
  const equipmentLabels = view.items
    .filter(({ equipmentState }) => !["inactive", "stowed", "owned"].includes(equipmentState.toLowerCase()))
    .map(({ name, equipmentState }) => `${name} (${equipmentState})`);

  if (view.combat && !shopVisit && requestedMode !== "reference") {
    return <main className={`${styles.page} ${styles.battlePage}`}>
      <div className={`${styles.shell} ${styles.battleShell}`}>
        <PlayerCombatConsole
          characterId={view.identity.characterId}
          characterName={view.identity.characterName}
          campaignName={view.identity.campaignName}
          encounterTitle={view.encounter?.title ?? "Active Encounter"}
          returnHref={referenceHref}
          combat={view.combat}
          items={view.items}
          spells={view.spells}
          abilities={view.derivedAbilities}
          resources={{
            health: `${view.health.total.remainingHp ?? "—"} / ${view.health.total.maximumHp ?? "—"}`,
            mana: view.mana.pools.length ? String(view.mana.pools.reduce((sum, pool) => sum + pool.currentMana, 0)) : "—",
            relevantItems: view.items.length,
          }}
          conditionLabels={activeConditions.map(({ name }) => name)}
          equipmentLabels={equipmentLabels}
        />
      </div>
    </main>;
  }

  return <main className={styles.page}>
    <div className={styles.shell}>
      <TabletopLiveRefresh mode="player" characterId={view.identity.characterId} scope="console" />
      <header className={styles.hero}>
        <Link className={styles.brandMark} href="/realms" aria-label="Return to the Realms">
          <span>SERRIAN</span>
          <span>TIDE</span>
        </Link>
        <div className={styles.heroBody}>
          <div className={styles.heroTopline}>
            <div>
              <p className={styles.eyebrow}>PLAYER TABLETOP CONSOLE</p>
              <h1>{view.identity.characterName}</h1>
              <p>{view.identity.campaignName} · {view.identity.playerUsername}</p>
            </div>
            <nav className={styles.heroNav} aria-label="Player tabletop navigation">
              {shopVisit ? <a href="#player-shop-visit-title" aria-current="location">In {shopVisit.shop.name}</a> : null}
              <Link href="/realms">Realms</Link>
              <Link href={`/realms/characters/${view.identity.characterId}`}>Character Sheet</Link>
            </nav>
          </div>
          <form action="/realms/tabletop" method="get" className={styles.characterSelect}>
            <label htmlFor="tabletop-character">Campaign Character</label>
            <select id="tabletop-character" name="character" defaultValue={view.identity.characterId}>
              {characters.map((character) => <option key={character.characterId} value={character.characterId}>{character.characterName} — {character.campaignName}</option>)}
            </select>
            <button type="submit">Open</button>
          </form>
        </div>
      </header>

      <section className={styles.statusStrip} aria-label="Current Character and Session status">
        <div><span>Health</span><strong>{view.health.total.remainingHp ?? "—"} / {view.health.total.maximumHp ?? "—"}</strong><small>{view.health.total.damage} damage · {view.health.unresolvedInjuryCount} unresolved injuries</small></div>
        <div><span>Mana</span><strong>{view.mana.pools.length ? view.mana.pools.reduce((sum, pool) => sum + pool.currentMana, 0) : "—"}</strong><small>{view.mana.pools.length ? `${view.mana.pools.length} canonical pool${view.mana.pools.length === 1 ? "" : "s"}` : "No resolved Mana pools"}</small></div>
        <div><span>Table state</span><strong>{view.presence.label}</strong><small>{view.presence.detail}</small></div>
      </section>

      {shopVisit ? <>
        <PlayerShopVisit characterId={view.identity.characterId} visit={shopVisit} commerce={shopCommerce!} />
        {view.encounter && view.combatAvailability.status !== "ready" ? <CombatAvailabilityNotice availability={view.combatAvailability} /> : null}
        {view.calledChecks ? <PlayerCalledCheckPanel view={view.calledChecks} /> : null}
      </> : <>

      <Section id="tabletop-context" eyebrow="LIVE CONTEXT" title="At the table" detail="The active hierarchy is displayed as recorded; this console never invents Session membership.">
        <div className={styles.contextGrid}>
          <article><span>Campaign</span><h3>{view.identity.campaignName}</h3><p>{view.identity.campaignOverview || "No Campaign overview has been provided."}</p></article>
          <article><span>Character</span><h3>{view.identity.characterName}</h3><p>{[view.identity.raceName, view.identity.age ? `Age ${view.identity.age}` : null, view.identity.sex].filter(Boolean).join(" · ") || "No public profile details"}</p><Link href={`/realms/characters/${view.identity.characterId}`}>Open full Character Sheet</Link></article>
          <article><span>Session</span><h3>{view.session?.title ?? "No active Session"}</h3><p>{view.session ? `${view.session.rostered ? "Rostered" : "Not rostered"} · started ${dateTime(view.session.startedAt)}` : "Persistent Character tools remain available."}</p></article>
          <article><span>Scene</span><h3>{view.scene?.title ?? "No active Scene"}</h3><p>{view.scene ? [view.scene.locationLabel, view.scene.description].filter(Boolean).join(" · ") || "No public Scene description" : "This Character has no active Scene membership."}</p></article>
          <article><span>Encounter</span><h3>{view.encounter?.title ?? "No active Encounter"}</h3>{view.encounter ? <p>{titleCase(view.encounter.encounterType)} · {view.encounter.participating ? titleCase(view.encounter.participationStatus) : "Not participating"}{view.encounter.roundNumber !== null ? ` · Round ${view.encounter.roundNumber}, Step ${view.encounter.stepNumber}` : ""}{view.encounter.currentInitiative !== null ? ` · Initiative ${view.encounter.currentInitiative}` : ""}</p> : <p>No Encounter is attached to this Character&apos;s active Scene.</p>}</article>
        </div>
        {view.encounter && view.combatAvailability.status !== "ready" ? <CombatAvailabilityNotice availability={view.combatAvailability} /> : null}
      </Section>

      {view.scene ? <Section
        id="tabletop-scene-locations"
        eyebrow="SCENE DIRECTORY"
        title="Revealed locations"
        detail="Only descriptive details revealed by the G.O.D. for this Character's active Scene appear here."
      >
        {view.locations.towns.length || view.locations.shops.length ? <div className={styles.locationDirectory}>
          {view.locations.towns.map((town) => <article className={styles.locationTown} key={town.id}>
            <header><div><span>{town.category}</span><h3>{town.name}</h3></div><strong>{town.shops.length + town.places.length + town.npcs.length} revealed</strong></header>
            {town.overview ? <p>{town.overview}</p> : null}
            <div className={styles.locationColumns}>
              <section><h4>Shops</h4>{town.shops.length ? town.shops.map((shop) => <div className={styles.locationEntry} key={shop.id}>
                <div><strong>{shop.name}</strong><span>{shop.category} · {titleCase(shop.storefrontState)}</span></div>
                {shop.description ? <p>{shop.description}</p> : null}
                {shop.staff.length ? <ul>{shop.staff.map((member) => <li key={member.npcCharacterId}><strong>{member.name}</strong>{[member.roleLabel, member.responsibilityLabel, member.isPrimaryContact ? "Primary contact" : null].filter(Boolean).join(" · ")}</li>)}</ul> : null}
              </div>) : <p>No Shops have been revealed.</p>}</section>
              <section><h4>Places of interest</h4>{town.places.length ? town.places.map((place) => <div className={styles.locationEntry} key={place.id}><div><strong>{place.name}</strong><span>{place.category || "Place"}</span></div>{place.description ? <p>{place.description}</p> : null}</div>) : <p>No places have been revealed.</p>}</section>
              <section><h4>People</h4>{town.npcs.length ? town.npcs.map((npc) => <div className={styles.locationEntry} key={npc.id}><div><strong>{npc.name}</strong><span>{npc.roleLabel || "Associated NPC"}</span></div></div>) : <p>No associated NPCs have been revealed.</p>}</section>
            </div>
          </article>)}
          {view.locations.shops.length ? <article className={styles.locationTown}>
            <header><div><span>INDEPENDENT PLACEMENTS</span><h3>Other Shops</h3></div><strong>{view.locations.shops.length}</strong></header>
            <div className={styles.locationColumns}>{view.locations.shops.map((shop) => <section className={styles.locationEntry} key={shop.id}><div><strong>{shop.name}</strong><span>{shop.category} · {titleCase(shop.storefrontState)}</span></div>{shop.description ? <p>{shop.description}</p> : null}</section>)}</div>
          </article> : null}
        </div> : <p className={styles.emptyCopy}>No Scene locations have been revealed to players.</p>}
      </Section> : null}

      {view.combat ? <section className={styles.battleEntry} aria-labelledby="player-active-encounter-entry">
        <div>
          <p className={styles.eyebrow}>ACTIVE ENCOUNTER</p>
          <h2 id="player-active-encounter-entry">{view.encounter?.title ?? "Return to combat"}</h2>
          <p>The encounter runner keeps the roster, your combatant, commands, focused exchange, and pending activity in one shared layout.</p>
        </div>
        <Link className="st-button" href={battleHref}>Resume Encounter</Link>
      </section> : null}

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
          {view.combat ? <PlayerCombatIntentButton characterId={view.identity.characterId} combat={view.combat} sourceKind="item" sourceRef={item.ownershipKey} sourceInstanceId={item.instanceId} label={item.name} /> : null}
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
          {view.combat ? <PlayerCombatIntentButton characterId={view.identity.characterId} combat={view.combat} sourceKind="spell" sourceRef={spell.key} label={spell.name} /> : null}
        </article>)}</div> : <p className={styles.emptyCopy}>No known or personal Spells are recorded for this Character.</p>}
      </Section>

      <Section id="tabletop-abilities" eyebrow="DERIVED ABILITIES" title="Possessed abilities" detail="Availability and authored mechanics are shown without granting, learning, or G.O.D.-confirmation controls.">
        {view.derivedAbilities.length ? <div className={styles.cardGrid}>{view.derivedAbilities.map((ability) => <article className={styles.sourceCard} key={ability.id}>
          <header><div><span>{titleCase(ability.activation)}</span><h3>{ability.name}</h3></div><strong>{ability.availability}</strong></header>
          <p>{ability.description}</p>
          {[...ability.requirements, ...ability.costs, ...ability.limits, ...ability.effects].length ? <ul>{[...ability.requirements, ...ability.costs, ...ability.limits, ...ability.effects].map((detail, index) => <li key={index}>{detail}</li>)}</ul> : null}
          {ability.requiresGodRuling ? <p className={styles.ruling}>Manual mechanics require a G.O.D. ruling.</p> : null}
          {view.combat ? <PlayerCombatIntentButton characterId={view.identity.characterId} combat={view.combat} sourceKind="derived-ability" sourceRef={`derived-ability:${ability.id}`} label={ability.name} /> : null}
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
      </>}
    </div>
  </main>;
}
