import {floorLayer,type FloorDesign} from "./building-floor";
import {nativeAbsentObjects,type NativeCondition} from "./native-map-history";
import {redactUnderground,undergroundLayer,type UndergroundDesign} from "./underground";
import type {TownDesign} from "./town-map";

/** Pure ordinary projection: visibility is authored map visibility, never a
 * gameplay visibility decision. Source designs are never changed. */
export function consumptionFloorDesign(input:FloorDesign,conditions:NativeCondition[]=[]):FloorDesign{
 const absent=nativeAbsentObjects(conditions),design=structuredClone(input);
 design.features=design.features.filter(f=>!f.archived&&!absent.has(f.id)&&design.layers[floorLayer(f)].visible);
 let changed=true;while(changed){const ids=new Set(design.features.map(f=>f.id)),length=design.features.length;design.features=design.features.filter(f=>f.variant!=="opening"||ids.has(f.wallId)).filter(f=>f.variant!=="wall"||!f.roomId||ids.has(f.roomId));changed=length!==design.features.length;}
 design.features=design.features.map(f=>f.variant==="object"?{...f,destination:null}:f);
 return design;
}
export function consumptionTownDesign(input:TownDesign,conditions:NativeCondition[]=[]):TownDesign{
 const design=structuredClone(input),absent=nativeAbsentObjects(conditions),layers={road:"roads",district:"districts",building:"buildings",wall:"walls",water:"waterways",square:"districts",landmark:"landmarks",label:"labels"} as const;
 design.features=design.features.filter(f=>!f.archived&&!absent.has(f.id)&&design.layers[layers[f.kind]].visible);return design;
}
export function consumptionUndergroundDesign(input:UndergroundDesign,conditions:NativeCondition[]=[]):UndergroundDesign{
 const design=redactUnderground(structuredClone(input)),absent=nativeAbsentObjects(conditions);
 design.features=design.features.filter(f=>!f.archived&&!absent.has(f.id)&&design.layers[undergroundLayer(f,design)].visible);
 let changed=true;while(changed){const ids=new Set(design.features.map(f=>f.id)),length=design.features.length;design.features=design.features.filter(f=>f.variant!=="opening"||ids.has(f.wallId)).filter(f=>f.variant!=="wall"||!f.roomId||ids.has(f.roomId));changed=length!==design.features.length;}
 const ids=new Set(design.features.map(f=>f.id));design.attributes=Object.fromEntries(Object.entries(design.attributes).filter(([id])=>ids.has(id)).map(([id,value])=>[id,{...value,notes:""}]));return design;
}
