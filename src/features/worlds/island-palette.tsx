"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { latestIslandAssets, assetReference, type IslandAsset } from "./island-assets";
import type { GeographicLandMask } from "./geographic-land-mask";
import type { Point } from "./atlas";
import styles from "./island-palette.module.css";

/** The same bounded authorized paths used for visible clipping answer a placement question. */
export function pointOnGeographicLand(mask: GeographicLandMask, point: Point) {
  if(mask.status!=="ready")return false;
  const c=document.createElement("canvas").getContext("2d");if(!c)return false;
  const x=point.x/2,y=mask.transform.includes("scale(1 -1)")?600-point.y/2:point.y/2;
  return mask.parts.some(part=>c.isPointInPath(new Path2D(part.path),x,y,"evenodd"));
}
export function IllustrationPalette({disabled,onChoose,disabledReason}:{disabled:boolean;disabledReason?:string;onChoose:(asset:IslandAsset,mode:"place"|"paint")=>void}) {
  const [search,setSearch]=useState(""),[family,setFamily]=useState("");
  const latest=latestIslandAssets;
  const query=search.trim().toLocaleLowerCase(),visible=latest.filter(a=>(!family||a.family===family)&&[a.name,...a.tags].join(" ").toLocaleLowerCase().includes(query));
  return <section aria-label="Illustration palette" className={styles.palette}><h3>Paint artwork</h3><p>Choose a picture, then place it on the map or paint a terrain stroke. Artwork decorates the geographic land; it does not reshape the coast.</p>
    <GuidedField label="Find an illustration" help="Search names and tags, such as mountain, forest or city. This searches the built-in illustrated collection."><input className="st-control" type="search" value={search} onChange={e=>setSearch(e.target.value)}/></GuidedField>
    <GuidedField label="Illustration family" help="Show one kind of artwork or browse the whole collection. Settlement markers are placed individually with a saved place."><select className="st-control" value={family} onChange={e=>setFamily(e.target.value)}><option value="">All families</option>{[...new Set(latest.map(a=>a.family))].map(f=><option key={f}>{f}</option>)}</select></GuidedField>
    {disabled&&<p>{disabledReason??"Finish the current gesture or apply pending fields before choosing artwork. Your current draft stays here."}</p>}
    <div className={styles.cards}>{visible.map(a=><article key={JSON.stringify(assetReference(a))}><Image unoptimized width={96} height={96} loading="lazy" className={styles.preview} src={`/cartography/${a.libraryId}/${a.libraryRevision}/${a.file}`} alt=""/><strong>{a.name}</strong><button type="button" className="st-button is-secondary" disabled={disabled} onClick={()=>onChoose(a,"place")}>{`Place ${a.name.toLocaleLowerCase()}`}</button>{a.paint&&<button type="button" className="st-button is-secondary" disabled={disabled} onClick={()=>onChoose(a,"paint")}>Paint {a.name.toLocaleLowerCase()}</button>}</article>)}</div>
    {!visible.length&&<p>No illustrations match. Try another name or choose All families.</p>}
  </section>;
}
export function OutsideLandConfirmation({noun,onConfirm,onCancel}:{noun:string;onConfirm:()=>void;onCancel:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} className={styles.confirmation} aria-labelledby="outside-land-title" onCancel={e=>{e.preventDefault();onCancel();}}><h2 id="outside-land-title">Place this {noun} outside known land?</h2><p>This point is outside the saved land currently known to the map, or its land is still loading. A {noun} placed here remains visible and keeps its own saved location. You can move it later.</p><div className={styles.actions}><button className="st-button is-secondary" onClick={onCancel}>Choose another position</button><button className="st-button" onClick={onConfirm}>Place here anyway</button></div></dialog>;
}
