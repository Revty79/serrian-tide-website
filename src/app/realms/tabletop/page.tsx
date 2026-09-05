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
  readPlayerTabletopRuntime,
} from "@/features/tabletop-operations/player-tabletop-console-service";
import { requirePlayer } from "@/lib/server-access";

import { PlayerTabletopWorkspace } from "./player-tabletop-workspace";
import styles from "./player-tabletop.module.css";

function selectedId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export default async function PlayerTabletopPage({
  searchParams,
}: {
  searchParams: Promise<{ character?: string | string[] }>;
}) {
  await requirePlayer().catch(() => redirect("/access"));
  const characters = await listPlayerTabletopCharacters();
  const query = await searchParams;
  const selection = resolvePlayerTabletopSelection(characters, selectedId(query.character));

  if (selection.kind === "single-available") {
    redirect(`/realms/tabletop?character=${selection.characterId}`);
  }

  if (selection.kind !== "selected") {
    return <main className={styles.page}>
      <section className={styles.emptyState} aria-labelledby="player-tabletop-title">
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
  const [aggregate, runtime] = await Promise.all([
    getCharacter(characterId, false),
    readPlayerTabletopRuntime(characterId),
  ]);
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
    encounter: runtime.hierarchy.encounter,
    health: runtime.health,
    mana: runtime.mana,
    effects: runtime.effects,
    items: assemblePlayerTabletopItems({
      aggregate,
      equipment: runtime.equipment,
      charges: runtime.charges,
      effectDetails: runtime.itemEffects,
      firearmStates: runtime.firearmStates,
    }),
    spells: assemblePlayerTabletopSpells(aggregate),
    derivedAbilities: assemblePlayerTabletopDerivedAbilities(aggregate),
    calledChecks: boundPlayerCalledCheckWorkspace(runtime.calledChecks),
    calledCheckHistory: runtime.calledCheckHistory.flatMap((workspace) => {
      const bounded = boundPlayerCalledCheckWorkspace(workspace);
      return bounded ? [bounded] : [];
    }),
    rolls: boundPlayerRollHistory(runtime.rolls),
    recentSessions: runtime.recentSessions,
    derivedAbilityUses: runtime.derivedAbilityUses,
    combat: runtime.combat,
  };

  return <PlayerTabletopWorkspace characters={characters} view={view} />;
}
