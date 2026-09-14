"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readCombatScreen } from "@/features/combat-screen/screen-actions";
import { readCombatCommandSources } from "@/features/combat-screen/command-actions";
import { MeleeDrawControls } from "@/features/combat-screen/melee-draw-controls";
import { FirearmControls } from "@/features/combat-screen/firearm-controls";
import { combatScreenPrompt, type CombatScreenScope } from "@/features/combat-screen/screen-types";
import { TabletopLiveRefresh } from "@/features/tabletop-operations/tabletop-live-refresh";
import styles from "./player-tabletop.module.css";

type Preparation = {
  screen: Awaited<ReturnType<typeof readCombatScreen>>;
  sources: Awaited<ReturnType<typeof readCombatCommandSources>> | null;
};

export function PlayerTabletopCombatEquipment({ characterId, encounterId, onChange }: {
  characterId: number; encounterId: number; onChange: () => void;
}) {
  const scope = useMemo<CombatScreenScope>(() => ({ role: "player", characterId, encounterId }), [characterId, encounterId]);
  const [view, setView] = useState<Preparation | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [connection, setConnection] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const reload = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true);
    try {
      const screen = await readCombatScreen(scope, characterId);
      const sources = screen.projection && !screen.projection.closed ? await readCombatCommandSources(scope, characterId) : null;
      if (version !== generation.current) return;
      setView({ screen, sources }); setError("");
    } catch (caught) {
      if (version === generation.current) setError(caught instanceof Error ? caught.message : "Weapon preparation could not be refreshed.");
    } finally { if (version === generation.current) setLoading(false); }
  }, [scope, characterId]);
  async function refresh() { await reload(); onChange(); }
  const entity = view?.screen.projection?.entities.find((entry) => entry.participantId === characterId);
  const disabled = loading || !!error || connection !== "live" || !!view?.screen.pause.frozen || !!view?.screen.projection?.closed;

  return <section className={styles.combatEquipment} aria-label="Combat weapon preparation">
    <h3>Ready weapons for combat</h3>
    <TabletopLiveRefresh mode="player" characterId={characterId} onRefresh={() => void reload()} onStatus={setConnection} />
    <button className="st-button" disabled={loading} onClick={() => void reload()}>Refresh weapon preparation</button>
    {error ? <p role="alert">{error}</p> : null}
    {view ? <p role="status">{combatScreenPrompt(view.screen, entity)}</p> : <p role="status">Loading weapon preparation…</p>}
    {entity && view?.sources ? <>
      <p>Available Initiative: {entity.currentInitiative}. Drawing and loading finish through the encounter timeline.</p>
      <MeleeDrawControls scope={scope} entity={entity} options={view.sources.meleeDraws} disabled={disabled} refresh={refresh} expanded />
      {entity.currentAction ? <p role="status">Action underway: {entity.currentAction.remaining} Initiative remaining.</p> : null}
      {view.sources.firearms?.firearms.map((firearm) => <details key={firearm.itemInstanceId}>
        <summary>{firearm.itemName} · Copy #{firearm.itemInstanceId}</summary>
        <FirearmControls scope={scope} entity={entity} firearm={firearm}
          selectedModeId={firearm.state?.selectedFiringModeId ?? firearm.modes[0]?.id ?? 0}
          inventory={view.sources!.magazines} disabled={disabled} refresh={refresh} preparationOnly />
      </details>)}
    </> : null}
  </section>;
}
