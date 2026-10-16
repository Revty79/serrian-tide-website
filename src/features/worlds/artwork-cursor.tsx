import {memo,useImperativeHandle,useState,type RefObject} from "react";
import type {Point} from "./atlas";
import type {AtlasGeographicFrame} from "./atlas-geographic-frame";
import type {BrushSettings} from "./cartography-controls";
import {IslandAssetDefinitions,IslandAssetUse} from "./island-asset-scene";
import {assetReference,type IslandAsset} from "./island-assets";
import styles from "./atlas.module.css";

export type ArtworkCursorHandle={move:(point:Point)=>void};
/** Pointer feedback has its own render boundary; moving it does not rebuild the editor. */
export const ArtworkCursor=memo(function ArtworkCursor({cursor,tool,asset,brush,frame,mapId}:{cursor:RefObject<ArtworkCursorHandle|null>;tool:string;asset:IslandAsset|null|undefined;brush:BrushSettings;frame?:AtlasGeographicFrame;mapId:string}){
 const [point,setPoint]=useState<Point|null>(null);useImperativeHandle(cursor,()=>({move:setPoint}),[]);
 if(!point)return null;const displayed=frame?.project(point)??point,scale=frame?.scaleAt(point)??1;
 if(tool==="symbol"&&asset)return <g data-export-omit pointerEvents="none" opacity={.55}><defs><IslandAssetDefinitions drawings={[{version:2,id:"preview",name:"Preview",archived:false,geographyId:null,type:"symbol",kind:brush.symbol,point,scale:brush.scale,rotation:brush.rotation,style:"colored",role:asset.role,assetRef:assetReference(asset)}]} prefix={`cursor-${mapId}`}/></defs><g transform={`translate(${displayed.x} ${displayed.y}) rotate(${brush.rotation}) scale(${brush.scale*scale})`}><IslandAssetUse reference={assetReference(asset)} prefix={`cursor-${mapId}`}/></g></g>;
 return tool==="paint"||tool==="sculpt"?<circle cx={displayed.x} cy={displayed.y} r={brush.radius*scale} className={styles.brushPreview} pointerEvents="none"/>:null;
});
