/** A bounded browser-local hint. Every receiver verifies current server revisions. */
import {advanceTerrainSourceState} from "./terrain-regions";
export const GEOGRAPHY_CHANGED="serrian-atlas-geography-changed";
export const GEOGRAPHY_REVISIONS="serrian-atlas-geography-revisions";
let channel:BroadcastChannel|undefined;
export function geographyChannel(){
 if(typeof window==="undefined"||typeof BroadcastChannel==="undefined")return;
 if(!channel){channel=new BroadcastChannel("serrian-atlas-geography-v1");channel.onmessage=event=>{const worldId=event.data?.worldId;if(typeof worldId==="string"&&worldId.length<=128)window.dispatchEvent(new CustomEvent(GEOGRAPHY_CHANGED,{detail:{worldId}}));};}
 return channel;
}
export function notifyWorldGeography(worldId:string){if(typeof window==="undefined")return;window.dispatchEvent(new CustomEvent(GEOGRAPHY_CHANGED,{detail:{worldId}}));geographyChannel()?.postMessage({worldId});}
export type GeographyRevisions={worldId:string;mapId:string;sourceMapId:string;sourceState:string;rootRevision:number;regionalAvailable:boolean;heads:{materials:number;water:number;environment:number;artwork:number;labels:number;composition:number;towns:string}};
/** A late own acknowledgement may reconcile only the exact observed full vector. */
export function numericalAcknowledgementMatches(state:string|undefined,observed:Pick<GeographyRevisions,"sourceState"|"rootRevision">|undefined,rootRevision:number,detail?:{id:string;revision:number}){
 const root=advanceTerrainSourceState(state,null,rootRevision),accepted=detail?advanceTerrainSourceState(root,detail.id,detail.revision):root;
 return !!observed&&observed.rootRevision===rootRevision&&accepted!==undefined&&observed.sourceState===accepted;
}
