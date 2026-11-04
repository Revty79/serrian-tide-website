"use client";
import {useState} from "react";
import dynamic from "next/dynamic";
import type {TemplateContent,TemplateContext,TemplateFamily} from "./map-templates";
const Panel=dynamic(()=>import("./map-template-panel").then(m=>m.MapTemplatePanel),{ssr:false,loading:()=> <div role="status">Opening map templates...</div>});
export type TemplateLauncherProps={worldId:string;family:TemplateFamily;review?:boolean;disabled?:boolean;saveAction?:boolean;application?:"start"|"append";allowDecks?:boolean;geographyTarget?:"new"|"regeneration";context?:Partial<TemplateContext>;capture?:(images:boolean)=>TemplateContent|Promise<TemplateContent>;onApply?:(content:TemplateContent)=>void|Promise<void>};
export function MapTemplateLauncher(props:TemplateLauncherProps){
 const [open,setOpen]=useState<"browse"|"save">();
 return <><button type="button" className="st-button is-secondary" disabled={props.disabled} onClick={()=>setOpen("browse")}>Templates</button>{props.capture&&props.saveAction&&!props.review&&<button type="button" className="st-button is-secondary" disabled={props.disabled} onClick={()=>setOpen("save")}>Save as Template</button>}{open&&<Panel {...props} initialMode={open} onClose={()=>setOpen(undefined)}/>}</>;
}
