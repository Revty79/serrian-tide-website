import styles from "./atlas.module.css";

/** Only actions supported by the selected retained representation are supplied. */
export function AtlasCoastlineControls({name,mode,blocked,dirty,saving,canAdd,onPoint,onAdd,onSmooth,onShape,onSave,onDone,notice,error,saveHelp}:{
 name:string;mode:"points"|"bay"|"extend";blocked:boolean;dirty:boolean;saving:boolean;canAdd:boolean;
 onPoint:()=>void;onAdd:()=>void;onSmooth?:()=>void;onShape?:(kind:"bay"|"extend")=>void;
 onSave:()=>void;onDone:()=>void;notice?:string;error?:string;saveHelp?:string;
}){
 return <section className={styles.coastEditor} aria-label="Coastline editing">
  <div className={styles.coastHeading}>
   <strong>Edit coastline · {name}</strong>
   <button className="st-button" disabled={blocked||!dirty||!!saveHelp} onClick={onSave}>{saving?"Saving…":"Save coastline"}</button>
   <button className="st-button is-secondary" disabled={blocked||dirty} onClick={onDone}>Done</button>
  </div>
  <div role="group" aria-label="Coastline tools">
   <button className="st-button is-secondary" disabled={blocked} aria-pressed={mode==="points"} onClick={onPoint}>Move boundary point</button>
   <button className="st-button is-secondary" disabled={blocked||!canAdd} onClick={onAdd}>Add point</button>
   {onSmooth&&<button className="st-button is-secondary" disabled={blocked} onClick={onSmooth}>Smooth</button>}
   {onShape&&<><button className="st-button is-secondary" disabled={blocked} aria-pressed={mode==="bay"} onClick={()=>onShape("bay")}>Carve bay</button><button className="st-button is-secondary" disabled={blocked} aria-pressed={mode==="extend"} onClick={()=>onShape("extend")}>Extend land</button></>}
  </div>
  <small>{mode==="points"?"Drag a visible boundary point. Select a point before adding another.":mode==="bay"?"Start at the highlighted coast and drag toward land to carve a bay.":"Start at the highlighted coast and drag toward the sea to extend land."} {onShape?"":"This coast supports point editing; brush shaping and smoothing are unavailable."} Undo and Redo are above.</small>
  <small role="status">{dirty?"Unsaved coastline changes. Save coastline or Undo your changes before Done.":notice||"Coastline saved. Done returns to selection."}{saveHelp&&` ${saveHelp}`}</small>
  {error&&<small role="alert">{error}</small>}
 </section>;
}
