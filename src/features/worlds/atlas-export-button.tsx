"use client";
import dynamic from "next/dynamic";
import {useState} from "react";
import {useNativeExportContext} from "./native-map-history-client";
import type {NativeMapTarget} from "./native-map-history";
const ExportDialog=dynamic(()=>import("./atlas-export-dialog"),{ssr:false});
export function AtlasExportButton({worldId,review=false,target,disabled=false}:{worldId:string;review?:boolean;target:NativeMapTarget;disabled?:boolean}){
 const [open,setOpen]=useState(false),history=useNativeExportContext();
 return <><button type="button" className="st-button is-secondary" disabled={disabled} onClick={()=>setOpen(true)}>Export / Print</button>{open&&<ExportDialog key={JSON.stringify({worldId,target,history,review})} worldId={worldId} review={review} target={target} history={history} onClose={()=>setOpen(false)}/>}</>;
}
