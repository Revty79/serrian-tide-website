"use client";
import styles from "./terrain.module.css";
export type PendingWorkAction={label:string;run:()=>void;disabled?:boolean};
export type PendingWorkItem={id:string;name:string;reason:string;review:()=>void;actions:PendingWorkAction[]};
export function TerrainPendingWork({items,destination,onContinue,onCancel}:{items:PendingWorkItem[];destination:string;onContinue:()=>void;onCancel:()=>void}){
 return <section aria-label="Pending Work" className={styles.pendingWork}>
  <h4>Resolve drafts</h4><p className={styles.pendingDestination}><strong>Next: {destination}</strong></p>
  <p>Resolve each item below. Your drafts stay here until you recover, save or explicitly discard them. Export makes a copy and keeps the draft.</p>
  <ul>{items.map(item=><li key={item.id}><h5>{item.name}</h5><p>{item.reason}</p><div className={styles.actions}><button type="button" className="st-button is-secondary" onClick={item.review}>Review {item.name}</button>{item.actions.map(action=><button type="button" key={action.label} className="st-button is-secondary" disabled={action.disabled} onClick={action.run}>{action.label}</button>)}</div></li>)}</ul>
  {!items.length&&<p role="status">All blockers are resolved. Continue when you are ready.</p>}
  <div className={styles.actions}><button type="button" className="st-button is-primary" disabled={destination!=="Stay on this map"&&!!items.length} onClick={onContinue}>{destination==="Stay on this map"?"Return to Map":destination==="Save Region"?"Continue Saving Region":destination==="Create New Region"?"Continue Creating Region":"Continue to Region"}</button>{destination!=="Stay on this map"&&<button type="button" className="st-button is-secondary" onClick={onCancel}>Cancel navigation</button>}</div>
 </section>;
}
