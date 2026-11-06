"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { sameWorldReturn, type WorldAtlasContext } from "./world-atlas-context";
import { yearSchema } from "./world-year";

const Context = createContext<WorldAtlasContext | undefined>(undefined);
export function WorldAtlasContextProvider({ value, children }: { value: WorldAtlasContext; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorldAtlasContext() { return useContext(Context); }
type DateSelectionProps={context:WorldAtlasContext;onChoose:(year:number|undefined)=>void};
export function WorldAtlasDateSelection(props:DateSelectionProps){return <DateSelection key={`${props.context.timelineId}:${props.context.year??"current"}`} {...props}/>;}
function DateSelection({context,onChoose}:DateSelectionProps){
  const [text, setText] = useState(context.year?.toString() ?? ""), [error, setError] = useState("");
  return <form aria-label="World viewing year" onSubmit={event => {
    event.preventDefault();
    const parsed = /^-?\d+$/.test(text) ? yearSchema.safeParse(Number(text)) : undefined;
    if (!parsed?.success) { setError("Enter an integer canonical World year, including zero or a negative year."); return; }
    setError(""); onChoose(parsed.data);
  }}><label>Viewing context <input className="st-control" aria-label="World viewing year" inputMode="numeric" value={text} onChange={event => setText(event.target.value)} placeholder="Canonical World year"/></label> <button className="st-button is-secondary">View year</button> <button type="button" className="st-button is-secondary" onClick={() => onChoose(undefined)}>Current reference</button><p>{context.year === undefined ? "Current reference. No historical year is asserted." : `Year ${context.year}. Each record and map keeps its own historical coverage.`}</p>{error && <p role="alert">{error}</p>}</form>;
}
/** Cross-section browsing opens separately so both map and record drafts stay
 * mounted. The return is constrained to this World, never an arbitrary URL. */
export function WorldAtlasReturn({ worldId, returnTo }: { worldId: string; returnTo: string | null }) {
  const href = sameWorldReturn(worldId, returnTo);
  return href ? <a className="st-button is-secondary" href={href} target="_blank" rel="noopener">Return to saved World / Atlas view</a> : null;
}
