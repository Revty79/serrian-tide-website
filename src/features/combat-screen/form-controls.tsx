"use client";
import type { DeclarationRollInput } from "@/features/tabletop-operations/action-declaration-service";
import { physicalPercentile } from "./choice-types";
import styles from "./combat-screen.module.css";
export type RollDraft = { method: "physical" | "digital"; value: string };
export const emptyRoll: RollDraft = { method: "physical", value: "" };
export function rollInput(draft: RollDraft): DeclarationRollInput {
  return draft.method === "digital" ? { method: "random" } : { method: "entered", enteredTotal: physicalPercentile(draft.value) };
}
export function RollFields({ value, onChange, disabled }: { value: RollDraft; onChange: (value: RollDraft) => void; disabled?: boolean }) {
  return <div className={styles.fields}><label className="st-field">Roll method<select className="st-control" disabled={disabled} value={value.method} onChange={(event) => onChange({ ...value, method: event.target.value as RollDraft["method"] })}><option value="physical">Physical percentile</option><option value="digital">Digital percentile</option></select></label>
    {value.method === "physical" ? <label className="st-field">Percentile result<input className="st-control" disabled={disabled} inputMode="numeric" placeholder="01–100 (00 = 100)" value={value.value} onChange={(event) => onChange({ ...value, value: event.target.value })} /></label> : <p className={styles.muted}>The server rolls once when you commit.</p>}</div>;
}
export function combatMessage(message: string) {
  return message.replace(/simultaneous declaration checkpoint/gi, "simultaneous choices").replace(/checkpoint/gi, "simultaneous choices")
    .replace(/effect plan/gi, "action result").replace(/Initiative Runtime/gi, "Initiative");
}
