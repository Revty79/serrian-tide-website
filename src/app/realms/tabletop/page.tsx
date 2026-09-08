import { redirect } from "next/navigation";

import { getCharacter } from "@/app/characters/actions";
import {
  assemblePlayerTabletopDerivedAbilities,
  assemblePlayerTabletopItems,
  assemblePlayerTabletopSpells,
  boundPlayerCalledCheckWorkspace,
  boundPlayerRollHistory,
  resolvePlayerTabletopPresence,
  resolvePlayerTabletopSelection,
  type PlayerTabletopConsoleView,
} from "@/features/tabletop-operations/player-tabletop-console";
import {
  listPlayerTabletopCharacters,
  readPlayerTabletopState,
} from "@/features/tabletop-operations/player-tabletop-console-service";
import { requirePlayer } from "@/lib/server-access";
import { readPlayerShopVisitInTransaction } from "@/features/tabletop-operations/shop-visit-service";
import { db } from "@/db";
import { readShopCommerceInTransaction } from "@/features/tabletop-operations/shop-commerce-service";

import { isTabletopReferenceRoll } from "@/features/tabletop-operations/tabletop-ui-policy";

import { PlayerTabletopWorkspace } from "./player-tabletop-workspace";
import styles from "./player-tabletop.module.css";
import { CombatRoute } from "@/features/combat-screen/combat-route";
import { listPlayerCombatEncounters } from "@/features/combat-screen/screen-actions";

function selectedId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export default async function PlayerTabletopPage({
  searchParams,
}: {
  searchParams: Promise<{ character?: string | string[]; combat?: string }>;
}) {
  const access = await requirePlayer().catch(() => redirect("/access"));
  const characters = await listPlayerTabletopCharacters();
  const query = await searchParams;
  const selection = resolvePlayerTabletopSelection(characters, selectedId(query.character));

  if (selection.kind === "single-available") {
    redirect(`/realms/tabletop?character=${selection.characterId}${query.combat ? `&combat=${encodeURIComponent(query.combat)}` : ""}`);
  }

  if (selection.kind !== "selected") {
    return <main className={styles.page}>
      <section className={styles.emptyState} aria-labelledby="player-tabletop-title">
        <a className={styles.emptyBrand} href="/realms" aria-label="Return to the Realms">SERRIAN TIDE</a>
        <p className={styles.eyebrow}>PLAYER TABLETOP</p>
        <h1 id="player-tabletop-title">Choose your Character</h1>
        <p>
          {selection.kind === "no-characters"
            ? "No playable Campaign Character is currently assigned to this account."
            : selection.kind === "unavailable"
              ? "That Character is unavailable. Choose one of your assigned Characters."
              : "Select the exact Campaign Character whose tabletop state you want to open."}
        </p>
        {characters.length ? <nav className={styles.characterChoices} aria-label="Assigned Characters">
          {characters.map((character) => <a key={character.characterId} href={`/realms/tabletop?character=${character.characterId}`}>
            <strong>{character.characterName}</strong>
            <span>{character.campaignName}</span>
          </a>)}
        </nav> : null}
        <a className={styles.backLink} href="/realms">Return to the Realms</a>
      </section>
    </main>;
  }

  const characterId = selection.character.characterId;
  if (query.combat) return <CombatRoute key={`player:${characterId}:${query.combat}`} scope={{ role: "player", characterId, encounterId: Number(query.combat) }} />;
  const combatEncounters = await listPlayerCombatEncounters(characterId);
  const [aggregate, runtime] = await Promise.all([
    getCharacter(characterId, false),
    readPlayerTabletopState(characterId),
  ]);
  const shopVisit = await db.transaction((tx) => readPlayerShopVisitInTransaction(tx, characterId, access.user.id));
  const shopCommerce = shopVisit
    ? await db.transaction((tx) => readShopCommerceInTransaction(tx, {
        campaignId: shopVisit.campaignId,
        shopId: shopVisit.shop.id,
        characterId,
        viewerUserId: access.user.id,
        godView: false,
      }))
    : null;
  const presence = resolvePlayerTabletopPresence({
    hasActiveSession: runtime.hierarchy.session !== null,
    rostered: runtime.hierarchy.rostered,
    sceneMember: runtime.hierarchy.scene !== null,
    hasActiveEncounter: runtime.hierarchy.encounter !== null,
    encounterParticipant: runtime.hierarchy.encounter?.participating ?? false,
  });
  const view: PlayerTabletopConsoleView = {
    identity: runtime.identity,
    presence,
    session: runtime.hierarchy.session ? {
      ...runtime.hierarchy.session,
      rostered: runtime.hierarchy.rostered,
    } : null,
    scene: runtime.hierarchy.scene,
    locations: runtime.locations,
    health: runtime.health,
    mana: runtime.mana,
    effects: runtime.effects,
    items: assemblePlayerTabletopItems({
      aggregate,
      equipment: runtime.equipment,
      charges: runtime.charges,
      effectDetails: runtime.itemEffects,
      firearmStates: [],
    }),
    spells: assemblePlayerTabletopSpells(aggregate),
    derivedAbilities: assemblePlayerTabletopDerivedAbilities(aggregate),
    calledChecks: boundPlayerCalledCheckWorkspace(runtime.calledChecks),
    calledCheckHistory: runtime.calledCheckHistory.flatMap((workspace) => {
      const bounded = boundPlayerCalledCheckWorkspace(workspace);
      return bounded ? [bounded] : [];
    }),
    rolls: boundPlayerRollHistory(runtime.rolls.filter(isTabletopReferenceRoll)),
    recentSessions: runtime.recentSessions,
    derivedAbilityUses: runtime.derivedAbilityUses,
  };

  const activeEncounters = combatEncounters.filter((entry) => entry.status === "active");
  const combatLinks = combatEncounters.length ? <section className={styles.section} aria-label="Character encounters"><h2>Encounters</h2>
    {activeEncounters.map((entry) => <p key={entry.id}><a className="st-button is-primary" href={`/realms/tabletop?character=${characterId}&combat=${entry.id}`}>Open Combat · {entry.title}</a></p>)}
    <details><summary>Encounter records</summary>{combatEncounters.filter((entry) => entry.status !== "active").map((entry) => <p key={entry.id}><a href={`/realms/tabletop?character=${characterId}&combat=${entry.id}`}>{entry.title} · {entry.status}</a></p>)}</details>
  </section> : null;
  return <PlayerTabletopWorkspace characters={characters} view={view} shopVisit={shopVisit} shopCommerce={shopCommerce} combatLinks={combatLinks} />;
}
