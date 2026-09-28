"use client";
import { useRef, useState } from "react";
import type { EvolutionHistoryEntry } from "@/features/evolutions/evolution-execution";
import { getIndividualEvolutionHistory } from "./evolution-execution-actions";
import { EvolutionHistory } from "./evolution-execution-dialog";
import styles from "./creatures/creature-evolutions.module.css";

export function IndividualEvolutionHistory({ characterId }: { characterId: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [entries, setEntries] = useState<EvolutionHistoryEntry[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function open() {
    dialog.current?.showModal(); setBusy(true); setError(""); setEntries([]);
    try { setEntries(await getIndividualEvolutionHistory(characterId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "History could not be loaded."); }
    finally { setBusy(false); }
  }
  return <><button className="st-button" type="button" onClick={() => void open()}>Evolution history</button>
    <dialog ref={dialog} className={styles.dialog} aria-label={`Evolution history for individual ${characterId}`}>
      <h3>Evolution history — individual #{characterId}</h3><p>Historical evidence is available to the Campaign-owning G.O.D., including after archive. Events cannot be undone or edited.</p>
      {busy ? <p role="status">Loading history…</p> : error ? <p role="alert">{error}</p> : entries.length ? <EvolutionHistory entries={entries} /> : <p>No Evolution events recorded.</p>}
      <button className="st-button" type="button" onClick={() => dialog.current?.close()}>Close history</button>
    </dialog></>;
}
