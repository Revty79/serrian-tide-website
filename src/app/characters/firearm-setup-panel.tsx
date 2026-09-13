"use client";
import { useEffect, useRef, useState } from "react";
import { prepareFirearmSetup, readFirearmSetup } from "./firearm-setup-actions";
import type { CharacterFirearmSetup } from "@/features/items/firearm-setup-service";

export function FirearmSetupPanel({ characterId, equipmentRevision, disabled }: { characterId: number; equipmentRevision: string; disabled: boolean }) {
  const [view, setView] = useState<CharacterFirearmSetup | null>(null), [message, setMessage] = useState("");
  const [modes, setModes] = useState<Record<number, string>>({}), [magazines, setMagazines] = useState<Record<number, string>>({}), [busy, setBusy] = useState(false);
  const [rounds, setRounds] = useState<Record<number, string>>({});
  const running = useRef(false), retry = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => { let current = true; void readFirearmSetup(characterId).then((result) => { if (current) setView(result); }).catch((error) => { if (current) setMessage(error.message); }); return () => { current = false; }; }, [characterId, equipmentRevision]);
  async function run(command: Omit<Parameters<typeof prepareFirearmSetup>[0], "requestKey">) {
    if (running.current) return; running.current = true; setBusy(true);
    const fingerprint = JSON.stringify(command);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try { setView(await prepareFirearmSetup({ ...command, requestKey: retry.current.key })); retry.current = null; setMessage("Firearm setup saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Firearm setup could not be confirmed."); setView(await readFirearmSetup(characterId)); }
    finally { running.current = false; setBusy(false); }
  }
  if (view && !view.firearms.length && !message) return null;
  return <section className="equipment-state-panel__firearms" aria-label="Firearm equipment setup"><h4>Prepare your firearms</h4><p>Before combat: confirm the copy, load ammunition, then ready the weapon. Each copy below shows its next step.</p>
    {message ? <p role="status">{message}</p> : null}{view?.combatActive ? <p>Active combat: open Combat, choose Attack and select this weapon. Loading, magazine filling, readying and firing are together there, with their Initiative costs.</p> : null}
    <button className="st-button" disabled={busy} onClick={() => void readFirearmSetup(characterId).then(setView).catch((error) => setMessage(error.message))}>Refresh firearm setup</button>
    {view?.firearms.map((entry) => { const blocked = disabled || busy || !view.canManage || view.combatActive, input = { characterId, instanceId: entry.instanceId, expectedVersion: entry.state?.version };
      const next = !entry.state ? "Confirm this copy as empty" : entry.equipmentState !== "wielded" ? "Set this copy to Wielded in Equipment State" : !entry.state.loadedRounds ? entry.reloadType === "Magazine" ? "Attach a loaded magazine" : entry.reloadType === "Single" ? "Load loose rounds" : "Set Reload Type in the item profile" : !entry.state.readied || entry.state.needsRecovery ? "Ready firearm" : "Loaded and readied";
      return <fieldset key={entry.instanceId}><legend>{entry.name} · Copy #{entry.instanceId}</legend><p><strong>Next: {next}.</strong></p>
        {!entry.state ? <><label className="st-field">Initial firing mode<select className="st-control" value={modes[entry.instanceId] ?? entry.modes[0]?.id ?? ""} onChange={(event) => setModes({ ...modes, [entry.instanceId]: event.target.value })}>{entry.modes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name}</option>)}</select></label>
          {!entry.modes.length ? <p>Add an authored Firing Mode in Heavens → Items → Weapon Profile before initializing this copy.</p> : null}
          <button className="st-button" disabled={blocked || !entry.modes.length} onClick={() => void run({ ...input, operation: "initialize", firingModeId: Number(modes[entry.instanceId]) || entry.modes[0]?.id })}>Initialize empty firearm</button></>
          : <><p>{entry.state.loadedRounds} rounds · {entry.state.readied && !entry.state.needsRecovery ? entry.state.loadedRounds ? "Loaded and readied" : "Readied, but empty" : "Needs preparation"}</p>
            {entry.equipmentState !== "wielded" ? <p>Set Equipment State to Wielded above before readying this copy.</p> : !entry.readinessMode ? <p>Set the drawing/readying relationship in Heavens → Items → Weapon Profile.</p> : null}
            <button className="st-button" disabled={blocked || entry.equipmentState !== "wielded" || !entry.readinessMode || entry.state.readied && !entry.state.needsRecovery} onClick={() => void run({ ...input, operation: "ready" })}>Ready firearm</button>
            {entry.reloadType === "Single" ? <><label className="st-field">Loose rounds to insert<input className="st-control" type="number" min={1} step={1} value={rounds[entry.instanceId] ?? "1"} onChange={(event) => setRounds({ ...rounds, [entry.instanceId]: event.target.value })} /></label><button className="st-button" disabled={blocked} onClick={() => void run({ ...input, operation: "load", rounds: Number(rounds[entry.instanceId] ?? "1") })}>Load loose rounds</button></> : null}
            {!entry.attachedMagazineInstanceId && entry.state.loadedRounds > 0 ? <button className="st-button" disabled={blocked} onClick={() => void run({ ...input, operation: "unload" })}>Unload to inventory</button> : null}
            {entry.reloadType === "Magazine" ? <><p>{entry.attachedMagazineInstanceId ? `Magazine copy #${entry.attachedMagazineInstanceId} attached. Removing it retains its rounds.` : "No magazine attached. Choose a loaded copy below; loose cartridges must first be put into a magazine."}</p>
              {!entry.magazines.length ? <p>No owned magazine is linked to fit this weapon. Check compatible magazine models in the weapon item profile and the Character&apos;s owned copies.</p> : null}
              <label className="st-field">Prepared magazine<select className="st-control" value={magazines[entry.instanceId] ?? ""} onChange={(event) => setMagazines({ ...magazines, [entry.instanceId]: event.target.value })}><option value="">Choose a detached compatible copy</option>{entry.magazines.map((magazine) => <option key={magazine.instanceId} value={magazine.instanceId} disabled={!!magazine.attachedWeaponInstanceId}>{magazine.name} · Copy #{magazine.instanceId} · {magazine.loadedRounds}/{magazine.capacity}</option>)}</select></label>
              <button className="st-button" disabled={blocked || !magazines[entry.instanceId]} onClick={() => void run({ ...input, operation: "magazine", magazineInstanceId: Number(magazines[entry.instanceId]) })}>Attach magazine</button>
              <button className="st-button" disabled={blocked || !entry.attachedMagazineInstanceId} onClick={() => void run({ ...input, operation: "magazine", magazineInstanceId: null })}>Remove magazine</button>
            </> : null}
          </>}
      </fieldset>; })}
  </section>;
}
