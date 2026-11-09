"use client";
import {useState} from 'react';
import {boundsSchema,validateViewport,type GeographicBounds,type SpatialReference} from './geographic';
import styles from './geographic.module.css';

/** Navigation only: preserves every geometry, revision and unfinished draft. */
export function GeographicExtentControl({bounds,reference,onApply}:{bounds:GeographicBounds;reference:SpatialReference;onApply:(bounds:GeographicBounds)=>void}){
 const [values,setValues]=useState(bounds.map(String)),[error,setError]=useState(''),labels=reference.kind==='sphere'?['West longitude','South latitude','East longitude','North latitude']:['Minimum x','Minimum y','Maximum x','Maximum y'];
 return <details><summary>Choose coordinate extent</summary><p>View a precise extent in this surface&apos;s original {reference.units}. Spherical longitude can wrap from west to east across the antimeridian.</p><form aria-label="Geographic viewing extent" onSubmit={e=>{e.preventDefault();try{const next=boundsSchema.parse(values.map(Number));validateViewport(next,reference);setError('');onApply(next);}catch(e){setError((e as Error).message);}}}><div className={styles.controls}>{labels.map((label,i)=><label key={label}>{label}<input required type="number" step="any" className="st-control" value={values[i]} onChange={e=>setValues(previous=>previous.map((v,j)=>i===j?e.target.value:v))}/></label>)}</div><button type="submit" className="st-button is-secondary">View coordinate extent</button>{error&&<p role="alert">{error}</p>}</form></details>;
}
