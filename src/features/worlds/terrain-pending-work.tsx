"use client";
import styles from "./terrain.module.css";
export type PendingWorkAction={label:string;run:()=>void;disabled?:boolean};
export type PendingWorkItem={id:string;name:string;reason:string;review:()=>void;actions:PendingWorkAction[]};
const plainLabel=(value:string)=>value.replace(/\bdraft\b/gi,word=>word[0]==="D"?"Changes":"changes");
export function TerrainPendingWork({items,destination,leaving,onContinue,onCancel,browse}:{browse?:{href:string;label:string};leaving?:string;items:PendingWorkItem[];destination:string;onContinue:()=>void;onCancel:()=>void}){
 return <section aria-label="Pending Work" className={styles.pendingWork}>
  <h4>Before you leave this map</h4>{leaving&&<p>Current map: {leaving}</p>}<p className={styles.pendingDestination}><strong>You want to open: {destination}</strong></p>
  <p>Your saved map is safe. The items below are unfinished changes or previews. Save changes you want to keep, or use the matching Cancel or Discard action. Export makes a separate copy.</p>
  {browse&&<div className={styles.feedback}><a className="st-button is-primary" href={browse.href} target="_blank" rel="noopener">{browse.label}</a><p>Your work stays open here. The saved map opens separately; you can look at it without saving or discarding anything on this map.</p></div>}
  <ul>{items.map(item=><li key={item.id}><h5>{plainLabel(item.name)}</h5><p>{item.reason}</p><div className={styles.actions}><button type="button" className="st-button is-secondary" onClick={item.review}>Review {plainLabel(item.name)}</button>{item.actions.map(action=><button type="button" key={action.label} className="st-button is-secondary" disabled={action.disabled} onClick={action.run}>{plainLabel(action.label)}</button>)}</div></li>)}</ul>
  {!items.length&&<p role="status">Your unfinished work is taken care of. You can continue below.</p>}
  <div className={styles.actions}><button type="button" className="st-button is-primary" disabled={destination!=="Stay on this map"&&!!items.length} onClick={onContinue}>{destination==="Stay on this map"?"Return to Map":destination==="Save Region"?"Continue Saving Region":destination==="Create New Region"?"Continue Creating Region":`Continue to ${destination}`}</button>{destination!=="Stay on this map"&&<button type="button" className="st-button is-secondary" onClick={onCancel}>Keep editing this map</button>}</div>
 </section>;
}
