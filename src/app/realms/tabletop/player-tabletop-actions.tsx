"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { ItemUseDialog } from "@/app/characters/item-use-dialog";
import { SpellCastDialog } from "@/app/characters/spell-cast-dialog";
import type { SpellCastSourceRequest } from "@/features/characters/character-spell-runtime";
import type { PlayerTabletopOwnedItem } from "@/features/tabletop-operations/player-tabletop-console";

import { recordPlayerTabletopFreeRoll } from "./actions";
import { executeTabletopItemUse, executeTabletopSpellUse, requestTabletopSourceUse } from "@/app/tabletop/source-use-actions";
import { stableSourceUseJson, type TabletopSourceUse } from "@/features/tabletop-operations/source-use";
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

function useRulingRequest(sessionId: number | null) {
  const router = useRouter();
  const [intent, setIntent] = useState("");
  const [message, setMessage] = useState("");
  const retry = useRef<{ signature: string; key: string } | null>(null);
  async function submit(source: TabletopSourceUse) {
    if (sessionId === null) throw new Error("Join an active Session to request a G.O.D. ruling.");
    const signature = stableSourceUseJson({ sessionId, source, intent });
    if (retry.current?.signature !== signature) retry.current = { signature, key: crypto.randomUUID() };
    const id = await requestTabletopSourceUse({ sessionId, source, intent, idempotencyKey: retry.current.key });
    retry.current = null;
    setIntent("");
    setMessage(`Request #${id} sent to G.O.D. No resources spent.`);
    router.refresh();
    return null;
  }
  const field = <label className="st-field"><span>Intent / circumstances</span><textarea className="st-control" maxLength={2000} rows={3} value={intent} onChange={(event) => setIntent(event.target.value)} /></label>;
  return { submit, field, message };
}

export function PlayerTabletopItemUse({
  characterId,
  item,
  disabled,
  sessionId,
}: {
  characterId: number;
  item: PlayerTabletopOwnedItem;
  disabled: boolean;
  sessionId: number | null;
}) {
  const router = useRouter();
  const ruling = useRulingRequest(sessionId);
  return <><ItemUseDialog
    sourceCharacterId={characterId}
    itemId={item.itemId}
    itemInstanceId={item.instanceId}
    itemName={item.name}
    activationLabel={item.requiresGodRuling ? "Request use" : item.runtimeProfile.activationLabel}
    disabled={disabled || (item.requiresGodRuling && sessionId === null)}
    executeUse={item.requiresGodRuling ? (request) => ruling.submit({ kind: "item", request }) : executeTabletopItemUse}
    confirmationLabel={item.requiresGodRuling ? "Request G.O.D. ruling" : undefined}
    confirmationContent={item.requiresGodRuling ? ruling.field : undefined}
    onComplete={() => router.refresh()}
  />{ruling.message ? <p role="status">{ruling.message}</p> : null}</>;
}

export function PlayerTabletopSpellUse({
  characterId,
  source,
  label,
  requiresGodRuling,
  sessionId,
}: {
  characterId: number;
  source: SpellCastSourceRequest;
  label: string;
  requiresGodRuling: boolean;
  sessionId: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ruling = useRulingRequest(sessionId);
  return <>
    <button type="button" disabled={requiresGodRuling && sessionId === null} onClick={() => setOpen(true)}>{requiresGodRuling ? "Request" : "Use"} {label}</button>
    {ruling.message ? <p role="status">{ruling.message}</p> : null}
    {open ? <SpellCastDialog
      casterCharacterId={characterId}
      source={source}
      executeCast={requiresGodRuling ? (request) => ruling.submit({ kind: "spell", request }) : executeTabletopSpellUse}
      confirmationLabel={requiresGodRuling ? "Request G.O.D. ruling" : undefined}
      confirmationContent={requiresGodRuling ? ruling.field : undefined}
      onClose={() => setOpen(false)}
      onCast={() => {
        setOpen(false);
        router.refresh();
      }}
    /> : null}
  </>;
}
