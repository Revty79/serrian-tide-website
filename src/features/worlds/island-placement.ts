import { validateMapDraft, type GeographyRecord, type MapDraft } from "./atlas";
import type { MapDrawing } from "./cartography";
import { islandAsset } from "./island-assets";

/** Stage one drawing, its optional persistent place and default label as one undoable map action. */
export function draftWithDrawing(draft:MapDraft,source:MapDrawing,places:GeographyRecord[],options:{historical:boolean;placeName:string;autoLabel:boolean},id=()=>crypto.randomUUID()) {
  let next=draft;
  const realPlace=source.type==="symbol"&&(source.version===2?islandAsset(source.assetRef).role==="place":!["mountain","pine"].includes(source.kind));
  if(options.historical&&realPlace&&!source.geographyId)throw new Error("Choose a saved location for this historical landmark.");
  if(realPlace&&!source.geographyId){
    const name=source.version===2?options.placeName.trim():`New ${source.type==="symbol"?source.kind:"place"}`;
    if(!name)throw new Error("Give this place a name before placing it.");
    const place={id:id(),revision:null,name,description:"",kind:"location" as const,context:source.version===2?"settlement" as const:"place" as const,parentId:null};
    source={...source,geographyId:place.id};next={...next,geographies:[...next.geographies,place]};
  }else if(source.geographyId&&!next.geographies.some(g=>g.id===source.geographyId)){
    const place=places.find(g=>g.id===source.geographyId&&!g.archived);if(!place)throw new Error("Choose an active place in this World.");
    if(realPlace&&place.kind!=="location")throw new Error("Settlement and landmark symbols need a location record.");
    next={...next,geographies:[...next.geographies,{id:place.id,revision:place.revision,name:place.name,description:place.description,kind:place.kind,context:place.context,parentId:place.parentId}]};
  }
  const additions=[source],place=next.geographies.find(g=>g.id===source.geographyId);
  if(source.version===2&&source.type==="symbol"&&source.role==="place"&&place&&options.autoLabel&&!(next.drawings??[]).some(d=>!d.archived&&d.type==="label"&&d.geographyId===place.id)){
    const bounds=islandAsset(source.assetRef).viewBox.split(" ").map(Number),below=source.point.y+(bounds[1]+bounds[3])*source.scale+34,margin=Math.min(950,place.name.length*9+12);
    additions.push({version:1,type:"label",id:id(),archived:false,geographyId:place.id,name:`${place.name} label`,text:place.name,point:{x:Math.max(margin,Math.min(2000-margin,source.point.x)),y:Math.round((below<1170?below:Math.max(25,source.point.y+bounds[1]*source.scale-16))*100)/100},rotation:0,size:25,style:"place"});
  }
  next={...next,drawings:[...(next.drawings??[]),...additions]};validateMapDraft(next);return next;
}

/** Default city labels follow a name change; deliberately customized label wording stays intact. */
export function renameIllustratedPlace(draft:MapDraft,placeId:string,name:string):MapDraft{
  const old=draft.geographies.find(g=>g.id===placeId),linked=(draft.drawings??[]).some(d=>d.version===2&&d.type==="symbol"&&d.role==="place"&&d.geographyId===placeId);
  return {...draft,geographies:draft.geographies.map(g=>g.id===placeId?{...g,name}:g),drawings:draft.drawings?.map(d=>linked&&d.type==="label"&&d.geographyId===placeId&&d.text===old?.name?{...d,text:name,name:d.name===`${old.name} label`?`${name} label`:d.name}:d)};
}
