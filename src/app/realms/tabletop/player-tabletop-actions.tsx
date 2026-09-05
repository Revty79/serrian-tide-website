"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ItemUseDialog } from "@/app/characters/item-use-dialog";
import { SpellCastDialog } from "@/app/characters/spell-cast-dialog";
import type { SpellCastSourceRequest } from "@/features/characters/character-spell-runtime";
import type { PlayerTabletopOwnedItem } from "@/features/tabletop-operations/player-tabletop-console";

import { recordPlayerTabletopFreeRoll } from "./actions";
import styles from "./player-tabletop.module.css";

function idempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function PlayerTabletopDice({
  characterId,
  enabled,
}: {
  characterId: number;
  enabled: boolean;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<"random" | "entered">("random");
  const [enteredTotal, setEnteredTotal] = useState("");
  const [visibility, setVisibility] = useState<"table" | "private">("table");
  const [label, setLabel] = useState("General percentile Roll");
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(() => {
      void recordPlayerTabletopFreeRoll(characterId, {
        method,
        visibility,
        enteredTotal: method === "entered" ? Number(enteredTotal) : null,
        label,
        idempotencyKey: idempotencyKey(),
      }).then((result) => {
        setMessage({ error: false, text: `Roll recorded: ${result.resultTotal}.` });
        setEnteredTotal("");
        router.refresh();
      }).catch((error: unknown) => {
        setMessage({
          error: true,
          text: error instanceof Error ? error.message : "The Roll could not be recorded.",
        });
      });
    });
  }

  return <form className={styles.diceForm} onSubmit={submit}>
    <div className={styles.formGrid}>
      <label><span>Method</span><select value={method} onChange={(event) => setMethod(event.target.value as "random" | "entered")}><option value="random">Website Roll</option><option value="entered">Physical result</option></select></label>
      <label><span>Visibility</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as "table" | "private")}><option value="table">Table</option><option value="private">Private to you and G.O.D.</option></select></label>
      <label className={styles.wideField}><span>Label</span><input value={label} maxLength={160} onChange={(event) => setLabel(event.target.value)} /></label>
      {method === "entered" ? <label><span>Physical Roll (1–100)</span><input inputMode="numeric" min={1} max={100} required type="number" value={enteredTotal} onChange={(event) => setEnteredTotal(event.target.value)} /></label> : null}
    </div>
    <p className={styles.helpText}>A general Roll is logged as free and is not linked to a Called Check, action, target, or consequence.</p>
    <button type="submit" disabled={busy || !enabled || (method === "entered" && !enteredTotal)}>{busy ? "Recording…" : "Roll percentile"}</button>
    {!enabled ? <p className={styles.notice}>This Character must be rostered in an active Session before a Roll can be recorded.</p> : null}
    {message ? <p className={message.error ? styles.error : styles.notice} role={message.error ? "alert" : "status"}>{message.text}</p> : null}
  </form>;
}

export function PlayerTabletopItemUse({
  characterId,
  item,
  disabled,
}: {
  characterId: number;
  item: PlayerTabletopOwnedItem;
  disabled: boolean;
}) {
  const router = useRouter();
  return <ItemUseDialog
    sourceCharacterId={characterId}
    itemId={item.itemId}
    itemInstanceId={item.instanceId}
    itemName={item.name}
    activationLabel={item.runtimeProfile.activationLabel}
    disabled={disabled}
    onComplete={() => router.refresh()}
  />;
}

export function PlayerTabletopSpellUse({
  characterId,
  source,
  label,
}: {
  characterId: number;
  source: SpellCastSourceRequest;
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Use {label}</button>
    {open ? <SpellCastDialog
      casterCharacterId={characterId}
      source={source}
      onClose={() => setOpen(false)}
      onCast={() => {
        setOpen(false);
        router.refresh();
      }}
    /> : null}
  </>;
}
