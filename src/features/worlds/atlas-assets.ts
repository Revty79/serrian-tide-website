import {z} from "zod";
import {artworkAsset} from "./terrain-artwork-assets";

export const ASSET_LIMITS={fileBytes:8*1024*1024,pixels:16*1024*1024,edge:8192,creatorBytes:256*1024*1024,versions:512,placements:256,sources:32,bodyBytes:256*1024,history:30,cacheBytes:24*1024*1024} as const;
export const assetScales=["world","regional","town","building","interior","underground"] as const;
export const assetGenres=["fantasy","historical","modern","science-fiction","general"] as const;
export const assetMetadataSchema=z.object({purpose:z.enum(["reference","symbol"]).default("reference"),name:z.string().trim().min(1).max(160),description:z.string().max(2000),category:z.string().trim().min(1).max(60),tags:z.array(z.string().trim().min(1).max(40)).max(24),genres:z.array(z.enum(assetGenres)).min(1).max(5),scales:z.array(z.enum(assetScales)).min(1).max(6),source:z.string().max(500),license:z.string().max(500),attribution:z.string().max(1000)}).strict();
export type AssetMetadata=z.infer<typeof assetMetadataSchema>;
export const defaultAssetMetadata=(name="My artwork"):AssetMetadata=>({purpose:"reference",name,description:"",category:"References",tags:[],genres:["fantasy"],scales:[...assetScales],source:"",license:"Private creator upload",attribution:""});
export const assetKeySchema=z.string().max(100).refine(id=>!!artworkAsset(id)||z.string().uuid().safeParse(id).success,"Choose an installed or uploaded asset.");
export const compositionTargetSchema=z.object({kind:z.enum(["terrain","town","floor","underground"]),id:z.string().min(1).max(128)}).strict();
export type CompositionTarget=z.infer<typeof compositionTargetSchema>;
export const assetPlacementSchema=z.object({id:z.string().uuid(),assetId:assetKeySchema,version:z.number().int().min(1).max(512),name:z.string().max(160),x:z.number().finite().min(-1e12).max(1e12),y:z.number().finite().min(-1e12).max(1e12),width:z.number().finite().min(.01).max(2e12),height:z.number().finite().min(.01).max(2e12),rotation:z.number().finite().min(-180).max(180),opacity:z.number().min(0).max(1),flipX:z.boolean(),flipY:z.boolean(),visible:z.boolean(),locked:z.boolean(),tier:z.enum(["reference","overlay"])}).strict().superRefine((p,c)=>{if(artworkAsset(p.assetId)&&p.version!==1)c.addIssue({code:"custom",message:"Installed artwork retains version 1."});});
export type AssetPlacement=z.infer<typeof assetPlacementSchema>;
export const compositionSchema=z.object({version:z.literal(1),placements:z.array(assetPlacementSchema).max(ASSET_LIMITS.placements)}).strict().superRefine((l,c)=>{if(new Set(l.placements.map(p=>p.id)).size!==l.placements.length)c.addIssue({code:"custom",message:"Artwork placements must have distinct identities."});if(new Set(l.placements.map(p=>p.assetId+":"+p.version)).size>ASSET_LIMITS.sources)c.addIssue({code:"custom",message:"Use at most 32 different asset versions on one map."});});
export type AssetComposition=z.infer<typeof compositionSchema>;
export const emptyComposition=():AssetComposition=>({version:1,placements:[]});
export const assetCommandSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("import"),requestId:z.string().uuid(),assetId:z.string().uuid(),revision:z.number().int().nonnegative(),metadata:assetMetadataSchema,filename:z.string().min(1).max(180),mime:z.enum(["image/png","image/jpeg","image/webp"])}).strict(),
 z.object({action:z.literal("metadata"),requestId:z.string().uuid(),assetId:z.string().uuid(),revision:z.number().int().positive(),metadata:assetMetadataSchema}).strict(),
 z.object({action:z.literal("archive"),requestId:z.string().uuid(),assetId:z.string().uuid(),revision:z.number().int().positive(),archived:z.boolean()}).strict(),
 z.object({action:z.literal("preferences"),requestId:z.string().uuid(),revision:z.number().int().nonnegative(),favorites:z.array(assetKeySchema).max(128),recent:z.array(assetKeySchema).max(32)}).strict(),
 z.object({action:z.literal("compose"),requestId:z.string().uuid(),target:compositionTargetSchema,revision:z.number().int().nonnegative(),layer:compositionSchema}).strict()
]);
export type AssetCommand=z.infer<typeof assetCommandSchema>;
export type AssetImport=Extract<AssetCommand,{action:"import"}>;
export type AssetObject={sha256:string;bytes:number;type:"original"|"128"|"768"|"1536"};
export type AssetVersion={assetId:string;version:number;metadata:AssetMetadata;filename:string;format:string;width:number;height:number;bytes:number;createdAt:string;objects:AssetObject[]};
export type LibraryAsset={id:string;revision:number;headVersion:number;archived:boolean;versions:AssetVersion[];usage:{worldId:string;kind:string;mapId:string;revision:number}[]};
export type AssetLibrary={available:boolean;canEdit:boolean;assets:LibraryAsset[];revision:number;favorites:string[];recent:string[];usedBytes:number};
export type CompositionSaved={available:boolean;revision:number;layer:AssetComposition;history:{revision:number;createdAt:string}[]};
export type AssetFrame={x:number;y:number;width:number;height:number;wrap?:boolean;wrapWidth?:number};
export function compositionPoint(q:{x:number;y:number},frame:AssetFrame){return frame.wrapWidth?{...q,x:q.x+Math.round((frame.x+frame.width/2-q.x)/frame.wrapWidth)*frame.wrapWidth}:q;}
export function validateComposition(layer:AssetComposition,frame:AssetFrame){for(const p of layer.placements)if(p.x<frame.x||p.y<frame.y||p.x>frame.x+frame.width||p.y>frame.y+frame.height||p.width>frame.width*2||p.height>frame.height*2)throw Error("Keep artwork centers inside this map and dimensions within twice its size.");}
export function placementLocal(p:AssetPlacement,q:{x:number;y:number}){const a=-p.rotation*Math.PI/180,dx=q.x-p.x,dy=q.y-p.y;return {x:dx*Math.cos(a)-dy*Math.sin(a),y:dx*Math.sin(a)+dy*Math.cos(a)};}
export function hitComposition(layer:AssetComposition,q:{x:number;y:number},tolerance=0){return [...layer.placements].reverse().find(p=>{const v=placementLocal(p,q);return p.visible&&p.opacity>0&&Math.abs(v.x)<=p.width/2+tolerance&&Math.abs(v.y)<=p.height/2+tolerance;});}
export function snapCompositionPoint(q:{x:number;y:number},grid:number,anchors:{x:number;y:number}[],tolerance:number){let distance=tolerance;const nearest=anchors.reduce<{x:number;y:number}|undefined>((best,p)=>{const d=Math.hypot(p.x-q.x,p.y-q.y);if(d<=distance){distance=d;return p;}return best;},undefined);return nearest??(grid>0?{x:Math.round(q.x/grid)*grid,y:Math.round(q.y/grid)*grid}:q);}
export function assetImageUrl(worldId:string,assetId:string,version:number,size:"128"|"768"|"1536"="128",review=false){return `/api/worlds/${worldId}/assets/image?asset=${encodeURIComponent(assetId)}&version=${version}&size=${size}${review?"&review=1":""}`;}
