"use client";
import type {TerrainCanvasTool} from "./terrain-canvas";
import styles from "./terrain.module.css";

export type WorkspaceFamily="sculpt"|"paint"|"water"|"regions"|"places"|"inspect";
export function workspaceFamily(tool:TerrainCanvasTool):WorkspaceFamily{
 if(tool==="region")return "regions";
 if(tool==="material"||tool==="environment")return "paint";
 if(tool==="water")return "water";
 if(["locations","artwork","labels"].includes(tool))return "places";
 return ["pan","inspect","measure","refine"].includes(tool)?"inspect":"sculpt";
}
type Props={editable:boolean;family:WorkspaceFamily;tool:TerrainCanvasTool;paint:"ground"|"vegetation"|"biome";working:boolean;onFamily:(family:WorkspaceFamily)=>void;onTool:(tool:TerrainCanvasTool)=>void;onPaint:(kind:Props["paint"])=>void;onWater:(action:"source"|"lake"|"network"|"features")=>void;onCreate:()=>void;onChoose:()=>void;onOperation:(kind:"ridge"|"valley"|"area")=>void;canOperation:boolean;onOptions:(section:"detail"|"environment"|"world"|"measure")=>void};
export function TerrainWorkspaceTools(p:Props){
 const button=(tool:TerrainCanvasTool,label:string)=><button key={tool} type="button" className={`st-button ${p.tool===tool?"is-primary":"is-secondary"}`} aria-pressed={p.tool===tool} disabled={p.working} onClick={()=>p.onTool(tool)}>{label}</button>;
 return <nav aria-label="Mapmaking tools" className={styles.workspaceToolList}>
  <div className={styles.workspaceFamilies}>{([["sculpt","Sculpt"],["paint","Paint"],["water","Water"],["regions","Regions"],["places","Places"],["inspect","Inspect / Navigate"]] as const).map(([id,label])=><button key={id} type="button" className={`st-button ${p.family===id?"is-primary":"is-secondary"}`} aria-pressed={p.family===id} disabled={p.working} onClick={()=>p.onFamily(id)}>{label}</button>)}</div>
  <section className={styles.workspaceSubtools} aria-label={`${p.family} subtools`}>
   {p.family==="sculpt"&&<><h4>Shape the land</h4>{([["raise","Raise mountains"],["lower","Lower / carve valleys"],["smooth","Smooth"],["level","Flatten"],["sample","Sample height"],["coast-land","Extend land"],["coast-water","Carve a bay"],["coast-smooth","Smooth shoreline"]] as const).map(([id,label])=>button(id,label))}<button type="button" className="st-button is-secondary" onClick={()=>p.onOptions("detail")}>Add terrain detail</button><details><summary>Landforms &amp; areas</summary>{([["ridge","Build ridge"],["valley","Carve valley"],["area","Select area"]] as const).map(([kind,label])=><button type="button" key={kind} className="st-button is-secondary" disabled={!p.canOperation} onClick={()=>p.onOperation(kind)}>{label}</button>)}</details></>}
   {p.family==="paint"&&<><h4>What to paint</h4>{([["ground","Ground Materials"],["vegetation","Vegetation"],["biome","Biomes"]] as const).map(([id,label])=><button key={id} type="button" className={`st-button ${p.paint===id?"is-primary":"is-secondary"}`} aria-pressed={p.paint===id} disabled={p.working} onClick={()=>p.onPaint(id)}>{label}</button>)}<p>Choose a material or landscape in Options beside the map.</p><button type="button" className="st-button is-secondary" onClick={()=>p.onOptions("environment")}>Climate &amp; landscape boundaries</button></>}
   {p.family==="water"&&<><h4>Waterways</h4>{([["source","Start a River"],["lake","Draw a Lake"],["network","Rivers, sources & connections"],["features","Water features & wetlands"]] as const).map(([id,label])=><button key={id} type="button" className="st-button is-secondary" disabled={p.working} onClick={()=>p.onWater(id)}>{label}</button>)}<p>Review proposals and save accepted changes in Options.</p></>}
   {p.family==="regions"&&<><h4>Linked regions</h4>{!p.editable&&<p>Read-only review: only the World owner can create or change geography.</p>}<button type="button" className="st-button is-primary" disabled={!p.editable} onClick={p.onCreate}>Create Region</button><button type="button" className="st-button is-secondary" onClick={p.onChoose}>Choose Existing Region</button><p>Rectangle, Freehand and Point-by-Point appear in Options when creating. Add Area joins disconnected pieces to one region.</p></>}
   {p.family==="places"&&<><h4>Add places &amp; detail</h4>{button("locations","Towns & settlements")}{button("artwork","Artwork")}{button("labels","Labels & map layout")}<p>Settlements keep their permanent World records.</p></>}
   {p.family==="inspect"&&<><h4>Navigate &amp; inspect</h4>{button("pan","Pan")}{button("inspect","Inspect")}{button("measure","Measure")}<button type="button" className="st-button is-secondary" onClick={()=>p.onOptions("measure")}>Grid &amp; units</button><button type="button" className="st-button is-secondary" onClick={()=>p.onOptions("detail")}>Terrain sources &amp; detail</button><button type="button" className="st-button is-secondary" onClick={()=>p.onOptions("world")}>Appearance &amp; World settings</button></>}
  </section>
 </nav>;
}
