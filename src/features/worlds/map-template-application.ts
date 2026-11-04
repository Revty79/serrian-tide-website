import {floorLayer,validateFloor,type FloorDesign,type FloorFrame} from "./building-floor";
import {townLayer,validateTownDesign,type TownDesign} from "./town-map";
import {undergroundLayer,validateUnderground,type UndergroundDesign} from "./underground";
import {compositionSchema,validateComposition,type AssetComposition} from "./atlas-assets";
import type {CompositionOverlay} from "./atlas-asset-client";

/** Existing-map application only adds new objects. Existing identities, links and settings stay exact. */
export function appendFloorTemplate(current:FloorDesign,addition:FloorDesign,frame:FloorFrame){
 if(addition.features.some(f=>current.layers[floorLayer(f)].locked))throw Error("Unlock the corresponding drawing layers before adding template objects.");
 const result={...current,features:[...current.features,...addition.features]};validateFloor(result,frame);return result;
}
export function appendTownTemplate(current:TownDesign,addition:TownDesign,frame:FloorFrame){
 if(addition.features.some(f=>current.layers[townLayer(f.kind)].locked))throw Error("Unlock the corresponding Town layers before adding template objects.");
 const result={...current,features:[...current.features,...addition.features]};validateTownDesign(result,frame);return result;
}
export function appendUndergroundTemplate(current:UndergroundDesign,addition:UndergroundDesign,frame:FloorFrame){
 if(addition.features.some(f=>current.layers[undergroundLayer(f,addition)].locked))throw Error("Unlock the corresponding underground layers before adding template objects.");
 const result={...current,features:[...current.features,...addition.features],attributes:{...current.attributes,...addition.attributes}};validateUnderground(result,frame);return result;
}
export function appendTemplateImages(current:AssetComposition,addition:AssetComposition|undefined,frame:FloorFrame){if(!addition)return current;const result={...current,placements:[...current.placements,...addition.placements]};compositionSchema.parse(result);validateComposition(result,{...frame,x:0,y:0});return result;}
export function templateImagePreview(worldId:string,layer:AssetComposition|undefined,reportError:(s:string)=>void,review=false):CompositionOverlay|undefined{return layer?{worldId,review,retryEpoch:0,layer,selected:"",active:false,reportError,select:()=>{},place:()=>{},edit:()=>{},preview:()=>{}}:undefined;}
