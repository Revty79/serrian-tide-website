"use client";
import {useState} from "react";
import type {TerrainPathPoint} from "./terrain-operations";
import {parseTerrainCoordinates} from "./terrain-coordinate-list";
import styles from "./terrain.module.css";

export function TerrainCoordinateList({width,height,limit=256,boundary=false,onChange,disabled=false,label="Coordinate list (column, row)",summary="Enter a coordinate list",description="One column, row pair per line in the selected source. Review the complete shape in the preview before accepting. This replaces only the active draft outline or course.",action="Use coordinate list"}:{width:number;height:number;limit?:number;boundary?:boolean;onChange:(points:TerrainPathPoint[])=>void|boolean;disabled?:boolean;label?:string;summary?:string;description?:string;action?:string}){
 const [text,setText]=useState(""),[error,setError]=useState("");
 return <details className={styles.details}><summary>{summary}</summary><p>{description}</p><label>{label}<textarea value={text} disabled={disabled} onChange={e=>setText(e.target.value)} rows={6}/></label>{error&&<p role="alert">{error}</p>}<button type="button" className="st-button is-secondary" disabled={disabled} onClick={()=>{try{const points=parseTerrainCoordinates(text,width,height,limit,boundary);if(onChange(points)===false)throw Error("The outline could not be changed. Review the map feedback; the coordinate list is retained.");setError("");}catch(e){setError(e instanceof Error?e.message:"Check the coordinate list.");}}}>{action}</button></details>;
}
