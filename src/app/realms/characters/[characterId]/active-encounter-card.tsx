import Link from "next/link";

import type { PlayerEncounterView } from "@/features/tabletop-operations/player-encounter-service";
import { TabletopLiveRefresh } from "@/features/tabletop-operations/tabletop-live-refresh";
import styles from "./active-encounter-card.module.css";

export function ActiveEncounterCard({
  characterId,
  encounter,
}: {
  characterId: number;
  encounter: PlayerEncounterView;
}) {
  const initiative = encounter.character.initiative;
  const currentInitiative = initiative.enrolled ? initiative.currentInitiative : null;
  return (
    <aside className={styles.card} aria-labelledby="player-active-encounter-heading">
      <div className={styles.signal} aria-hidden="true">&#9876;</div>
      <div className={styles.identity}>
        <p id="player-active-encounter-heading">ACTIVE ENCOUNTER</p>
        <h2>{encounter.context.encounterTitle}</h2>
        <span>{encounter.context.sessionTitle} &middot; {encounter.context.sceneTitle}</span>
      </div>
      <div className={styles.runtime} aria-label="Current Encounter position">
        <span>ROUND <strong>{encounter.initiativeRuntime?.roundNumber ?? "—"}</strong></span>
        <span>STEP <strong>{encounter.initiativeRuntime?.stepNumber ?? "—"}</strong></span>
        <span>YOUR INITIATIVE <strong>{currentInitiative ?? "—"}</strong></span>
      </div>
      <div className={styles.actions}>
        <TabletopLiveRefresh mode="player" characterId={characterId} />
        <Link href={`/realms/tabletop?character=${characterId}`}>Open Player Tabletop</Link>
      </div>
    </aside>
  );
}
