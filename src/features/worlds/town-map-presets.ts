import type {TownDesign,TownFeature,TownFrame,TownPoint} from "./town-map";
import {nearestTownRoad,townRoadStyle} from "./town-road";

export const townBuildingPresets = [
 {id:"cottage",name:"Cottage",width:12,height:9,outline:"rectangle",group:"Homes"},
 {id:"house",name:"House",width:18,height:13,outline:"rectangle",group:"Homes"},
 {id:"townhouse",name:"Large Home",width:22,height:17,outline:"ell",group:"Homes"},
 {id:"courtyard",name:"Courtyard Home",width:28,height:24,outline:"court",group:"Homes"},
 {id:"shop",name:"Shop",width:16,height:12,outline:"rectangle",group:"Businesses"},
 {id:"inn",name:"Tavern / Inn",width:26,height:20,outline:"ell",group:"Businesses"},
 {id:"workshop",name:"Workshop",width:22,height:16,outline:"annex",group:"Businesses"},
 {id:"barn",name:"Barn / Warehouse",width:30,height:16,outline:"rectangle",group:"Businesses"},
 {id:"stable",name:"Stables",width:30,height:22,outline:"court",group:"Businesses"},
 {id:"public",name:"Town Hall",width:28,height:20,outline:"annex",group:"Landmarks"},
 {id:"temple",name:"Temple",width:24,height:32,outline:"cross",group:"Landmarks"},
 {id:"tower",name:"Tower",width:13,height:13,outline:"round",group:"Landmarks"},
 {id:"keep",name:"Castle / Keep",width:42,height:34,outline:"keep",group:"Landmarks"},
 {id:"shed",name:"Outbuilding",width:8,height:6,outline:"annex",group:"Homes"},
 {id:"stall",name:"Market Stall",width:7,height:5,outline:"rectangle",group:"Businesses"},
] as const;
export type TownBuildingPreset=typeof townBuildingPresets[number];
export type TownBrush={category:string;width:number;placement:"stamp"|"outline";size:number;rotation:number;architecture:"timber"|"stone"|"local"|"thatch";followRoad?:boolean};
export const defaultTownBrush=():TownBrush=>({category:"cottage",width:8,placement:"stamp",size:1,rotation:0,architecture:"timber",followRoad:true});
export function validTownBrush(value:unknown):value is TownBrush {if(!value||typeof value!=="object")return false;const b=value as TownBrush;return typeof b.category==="string"&&b.category.length<=120&&Number.isFinite(b.width)&&b.width>=.25&&b.width<=100&&(b.placement==="stamp"||b.placement==="outline")&&Number.isFinite(b.size)&&b.size>=.1&&b.size<=5&&Number.isFinite(b.rotation)&&Math.abs(b.rotation)<=360&&["timber","stone","local","thatch"].includes(b.architecture)&&(b.followRoad===undefined||typeof b.followRoad==="boolean");}
export const townRoadChoices=[{id:"street",name:"Street",width:8},{id:"main",name:"Main Road",width:12},{id:"lane",name:"Lane",width:4},{id:"trail",name:"Footpath",width:2},{id:"bridge",name:"Bridge",width:8},{id:"dock",name:"Dock",width:6}] as const;
export const townDetailChoices=[{id:"market",name:"Marketplace",tool:"square"},{id:"plaza",name:"Plaza",tool:"square"},{id:"park",name:"Park / Garden",tool:"square"},{id:"tree",name:"Tree",tool:"landmark"},{id:"well",name:"Well",tool:"landmark"},{id:"statue",name:"Statue",tool:"landmark"},{id:"gate",name:"Town Gate",tool:"landmark"},{id:"field",name:"Field",tool:"square"},{id:"grove",name:"Tree Group",tool:"landmark"},{id:"shrub",name:"Shrub",tool:"landmark"},{id:"garden",name:"Flower Garden",tool:"square"},{id:"orchard",name:"Orchard",tool:"square"},{id:"fence",name:"Fence",tool:"wall"},{id:"hedge",name:"Hedge",tool:"wall"},{id:"yard",name:"Enclosed Yard",tool:"square"},{id:"courtyard",name:"Courtyard",tool:"square"},{id:"stall",name:"Market Stall",tool:"building"},{id:"fountain",name:"Fountain",tool:"landmark"},{id:"trail",name:"Footpath",tool:"road"},{id:"dock",name:"Dock",tool:"road"}] as const;
export function townPreset(id:string){return townBuildingPresets.find(p=>p.id===id.split(":").at(-1))??townBuildingPresets[1];}
export function townObjectName(feature:Pick<TownFeature,"kind"|"category"|"name">){return feature.name||(feature.kind==="building"?townPreset(feature.category).name:townDetailChoices.find(p=>p.id===feature.category)?.name??townRoadChoices.find(p=>p.id===townRoadStyle(feature))?.name??({road:"Road",wall:"Town wall",district:"Neighborhood",square:"Public space",water:"Water",landmark:"Landmark",label:"Label"}[feature.kind]));}
export function townPresetOutline(outline:string):TownPoint[] {
 const ps=outline==="ell"?[[0,0],[.6,0],[.6,.4],[1,.4],[1,1],[0,1]]
  :outline==="annex"?[[0,0],[.7,0],[.7,.25],[1,.25],[1,.85],[.7,.85],[.7,1],[0,1]]
  :outline==="court"?[[0,0],[1,0],[1,1],[.72,1],[.72,.35],[.28,.35],[.28,1],[0,1]]
  :outline==="cross"?[[.33,0],[.67,0],[.67,.35],[1,.35],[1,.65],[.67,.65],[.67,1],[.33,1],[.33,.65],[0,.65],[0,.35],[.33,.35]]
  :outline==="round"?Array.from({length:12},(_,i)=>[.5+.5*Math.cos(i*Math.PI/6),.5+.5*Math.sin(i*Math.PI/6)])
  :outline==="keep"?[[0,0],[.25,0],[.25,.13],[.75,.13],[.75,0],[1,0],[1,1],[.75,1],[.75,.87],[.25,.87],[.25,1],[0,1]]
  :[[0,0],[1,0],[1,1],[0,1]];
 return ps.map(([x,y])=>({x,y}));
}
/** Visual pieces remain ordinary editable metre geometry, without permanent records. */
export function makeTownStamp(kind:TownFeature["kind"],point:TownPoint,brush:TownBrush,id:string,frame?:Pick<TownFrame,"width"|"height">):TownFeature {
 const preset=townPreset(brush.category),isBuilding=kind==="building",isArea=isBuilding||kind==="square",isGate=kind==="landmark"&&brush.category==="gate",width=(isBuilding?preset.width:brush.category==="market"?55:brush.category==="field"?100:45)*brush.size,height=(isBuilding?preset.height:brush.category==="market"?42:brush.category==="field"?65:35)*brush.size,r=brush.rotation*Math.PI/180;
 let points=isArea?townPresetOutline(isBuilding?preset.outline:"rectangle").map(q=>({x:point.x+(q.x-.5)*width*Math.cos(r)-(q.y-.5)*height*Math.sin(r),y:point.y+(q.x-.5)*width*Math.sin(r)+(q.y-.5)*height*Math.cos(r)})):isGate?[-1,1].map(side=>({x:point.x+side*7*brush.size*Math.cos(r),y:point.y+side*7*brush.size*Math.sin(r)})):[point];
 if(frame&&(isArea||isGate)){const xs=points.map(p=>p.x),ys=points.map(p=>p.y),dx=Math.min(0,frame.width-Math.max(...xs))-Math.min(0,Math.min(...xs)),dy=Math.min(0,frame.height-Math.max(...ys))-Math.min(0,Math.min(...ys));points=points.map(p=>({x:p.x+dx,y:p.y+dy}));}
 return {id,kind,shape:isArea?"area":isGate?"line":"point",points:points.map(p=>({x:Math.round(p.x*100)/100,y:Math.round(p.y*100)/100})),width:kind==="landmark"?(brush.category==="tree"?5:brush.category==="grove"?9:brush.category==="shrub"?2.5:brush.category==="fountain"?4:3)*brush.size:2,name:"",category:isBuilding?brush.architecture+":"+preset.id:brush.category,origin:"manual",placeId:null,shopLocationId:null,archived:false};
}
/** Preview and placement use the same optional street-facing alignment. Existing roads stay exact. */
export function placeTownStamp(kind:TownFeature["kind"],point:TownPoint,brush:TownBrush,id:string,frame:Pick<TownFrame,"width"|"height">,design:TownDesign) {
 if(kind!=="building"||!brush.followRoad||!design.layers.roads.visible)return makeTownStamp(kind,point,brush,id,frame);
 let nearest:{point:TownPoint;distance:number;angle:number;width:number;side:number}|undefined;
 for(const road of design.features){if(road.archived||road.kind!=="road")continue;const near=nearestTownRoad(point,road,Math.max(30,townPreset(brush.category).height*brush.size*2));if(near&&(!nearest||near.distance<nearest.distance)){const dx=Math.cos(near.angle),dy=Math.sin(near.angle);nearest={...near,width:road.width,side:dx*(point.y-near.point.y)-dy*(point.x-near.point.x)>=0?1:-1};}}
 if(!nearest)return makeTownStamp(kind,point,brush,id,frame);
 const clearance=nearest.width/2+townPreset(brush.category).height*brush.size/2+2,offset=Math.max(nearest.distance,clearance),p={x:nearest.point.x-Math.sin(nearest.angle)*offset*nearest.side,y:nearest.point.y+Math.cos(nearest.angle)*offset*nearest.side};
 return makeTownStamp(kind,p,{...brush,rotation:nearest.angle*180/Math.PI+(nearest.side>0?180:0)+brush.rotation},id,frame);
}
