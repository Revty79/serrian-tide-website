"use client";
import type {FormEvent} from "react";
import {assetReference,islandAsset,islandAssets} from "./island-assets";
import type {MapDrawing} from "./cartography";
import {inspectorFields} from "./cartography-controls";
import styles from "./atlas.module.css";
/** Focused controls over existing drawing contracts; no separate copy of a selected object. */
export function AtlasSelectionControls({drawing,blocked,fieldsPending,onEditFields,onApplyFields,onChange,onClose}:{drawing:MapDrawing;blocked:boolean;fieldsPending:boolean;onEditFields:(e:FormEvent<HTMLFormElement>)=>void;onApplyFields:(e:FormEvent<HTMLFormElement>)=>void;onChange:(drawing:MapDrawing)=>boolean;onClose:()=>void}){
 const references=drawing.version===2?(drawing.type==="symbol"?[drawing.assetRef]:drawing.type==="terrain"?drawing.assetRefs:[]):[];
 const missing=references.some(reference=>{try{islandAsset(reference);return false;}catch{return true;}});
 const disabled=blocked||missing;
 const number=(name:string,label:string,value:number,min:number,max:number,step=1)=><label>{label}<input className="st-control" aria-label={label} type="number" name={name} defaultValue={value} min={min} max={max} step={step} required/></label>;
 return <form className={styles.quickTransform} key={JSON.stringify(drawing)} aria-label="Selected item settings" onChange={onEditFields} onSubmit={e=>{e.preventDefault();if(!disabled&&onChange(inspectorFields(drawing,new FormData(e.currentTarget))))onApplyFields(e);}}>
  {missing&&<p role="alert">This exact illustration revision is unavailable. Its saved reference is retained; restore the matching library before changing these settings.</p>}<fieldset className={styles.selectionFields} disabled={disabled}><input type="hidden" name="name" value={drawing.name}/><input type="hidden" name="kind" value={drawing.type==="label"?"label":drawing.kind}/><input type="hidden" name="style" value={"style"in drawing?drawing.style:""}/>
  {drawing.type==="symbol"&&<>{number("scale","Selection scale",drawing.scale,.4,4,.01)}{number("rotation","Selection rotation",drawing.rotation,-180,180,.01)}</>}
  {drawing.type==="label"&&<><label>Label words<input className="st-control" aria-label="Label words" name="text" defaultValue={drawing.text} maxLength={160} required/></label>{number("size","Selection text size",drawing.size,12,80,.01)}{number("rotation","Selection rotation",drawing.rotation,-180,180,.01)}</>}
  {drawing.type==="path"&&<>{number("width","Selected path width",drawing.width,1,24,.1)}{number("curve","Selected path curve",drawing.curve,0,1,.1)}</>}
  {drawing.type==="terrain"&&<><p>Painted group: each mark belongs to this brush stroke. Move or edit the group; individual trees are not separate map items.</p><input type="hidden" name="seed" value={drawing.seed}/>{number("radius","Painted group size",drawing.radius,12,160,.01)}{number("spacing","Painted group spacing",drawing.spacing,12,100,.01)}{number("density","Painted group density",drawing.density,1,3)}{drawing.version===2&&<fieldset><legend>Group illustrations (exact saved revisions)</legend>{islandAssets.filter(asset=>asset.paint&&asset.terrain===drawing.kind).map(asset=>{const reference=assetReference(asset),key=JSON.stringify(reference);return <label key={key}><input type="checkbox" name="assetRefs" value={key} defaultChecked={drawing.assetRefs.some(ref=>{try{return islandAsset(ref)===asset;}catch{return false;}})}/>{asset.name} · revision {asset.revision}</label>;})}</fieldset>}</>}
  <button className="st-button is-secondary" disabled={disabled}>Apply selected item changes</button></fieldset><button type="button" className="st-button is-secondary" disabled={fieldsPending} onClick={onClose}>Close item settings</button>
 </form>;
}
