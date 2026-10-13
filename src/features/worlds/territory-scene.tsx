import type { HistoricalTerritory } from "./historical-territories";
import { territoryPath } from "./historical-territories";
import styles from "./territories.module.css";

export function TerritoryScene({territories,selectedId,units=1}:{territories:HistoricalTerritory[];selectedId?:string|null;units?:number}) {
  return <g data-political-overlay>{territories.filter(t=>!t.archived).map((t,index)=>{const outer=t.boundaries.find(b=>!b.archived&&!b.parentId);if(!outer)return null;const x=outer.points.reduce((s,p)=>s+p.x,0)/outer.points.length,y=outer.points.reduce((s,p)=>s+p.y,0)/outer.points.length;return <g key={t.id} data-territory={t.id} data-selected={selectedId===t.id} data-coverage={t.coverage} className={styles.territory} style={{"--territory-ink":`var(--st-${index%2?"secondary":"primary"})`} as React.CSSProperties}>{t.boundaries.filter(b=>!b.archived&&!b.parentId).map(b=><path key={b.id} data-feature={b.id} d={territoryPath({...t,boundaries:[b,...t.boundaries.filter(h=>h.parentId===b.id)]})} fillRule="evenodd" strokeWidth={Math.max(3,2*units)}/>)}<text x={x} y={y} textAnchor="middle" fontSize={Math.max(20,13*units)}>{t.name}{t.coverage==="unknown"?" · unknown":t.coverage==="unclaimed"?" · unclaimed":t.coverage==="contested"?" · disputed":""}</text><title>{`${t.name} · ${t.coverage}. Political boundaries are separate from physical geography.`}</title></g>;})}</g>;
}
