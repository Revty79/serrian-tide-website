import {compositionSchema} from "./atlas-assets";
import {z} from "zod";
import {copyFloor,emptyFloor,floorDesignSchema,floorFrameSchema,floorRound,initialFloor,validateFloor,type FloorDesign,type FloorFeature,type FloorFrame} from "./building-floor";
import type {TownPoint} from "./town-map";
import {regionalAuthoringSchema} from "./terrain-regional-scope";

export const CRAFT_LIMITS={crafts:512,decks:64,connections:1024,revisions:512,worldBytes:128*1024*1024,bodyBytes:5*1024*1024,draftBytes:4_000_000,history:30,historyBytes:12*1024*1024} as const;
export const craftClasses=["sailing ship","modern ship","submarine","aircraft","airship","spacecraft","space station","train","railcar","caravan","wagon","carriage","rover","mobile base","land vehicle","mech","custom"] as const;
export const craftTransitions=["stairs","hatch","ladder","lift","ramp"] as const;
export const craftStarts=["blank","rectangle","hull","rounded","symmetric"] as const;
const id=z.uuid(),revision=z.number().int().positive(),name=z.string().trim().min(1).max(160),point=z.object({x:z.number().finite().min(0).max(20000),y:z.number().finite().min(0).max(20000)}).strict();
export const craftSurfaceSchema=z.object({version:z.literal(1),outlineId:id.nullable(),plan:floorDesignSchema,details:z.record(id,z.object({notes:z.string().max(2000),transition:z.enum(craftTransitions).optional()}).strict())}).strict();
export type CraftSurface=z.infer<typeof craftSurfaceSchema>;
export const craftDraftSchema=z.object({name,classification:z.enum(craftClasses),description:z.string().max(12000),frame:floorFrameSchema,surface:craftSurfaceSchema}).strict();
export type CraftDraft=z.infer<typeof craftDraftSchema>;
export const deckDraftSchema=z.object({name,order:z.number().int().min(-1000).max(1000),height:z.number().finite().min(-20000).max(20000).nullable(),frame:floorFrameSchema,surface:craftSurfaceSchema}).strict();
export type DeckDraft=z.infer<typeof deckDraftSchema>;
export const surfaceKeySchema=z.union([z.literal("exterior"),id]);
export type CraftSurfaceKey=z.infer<typeof surfaceKeySchema>;
const request={requestId:id},target={craftId:id,surface:surfaceKeySchema,revision};
export const craftCommandSchema=z.discriminatedUnion("action",[
 z.object({...request,action:z.literal("create"),craftId:id,draft:craftDraftSchema,templateImages:compositionSchema.optional(),templateDecks:z.array(z.object({id:z.uuid(),draft:deckDraftSchema,images:compositionSchema.optional()}).strict()).max(8).optional()}).strict(),
 z.object({...request,...target,action:z.literal("save"),draft:z.union([craftDraftSchema,deckDraftSchema])}).strict(),
 z.object({...request,action:z.literal("create-deck"),craftId:id,deckId:id,draft:deckDraftSchema,copyFrom:surfaceKeySchema.nullable(),copyRevision:revision.nullable(),copyObjects:z.boolean(),templateImages:compositionSchema.optional()}).strict(),
 z.object({...request,action:z.literal("duplicate"),craftId:id,revision,newCraftId:id,name}).strict(),
 z.object({...request,...target,action:z.literal("lifecycle"),archived:z.boolean()}).strict(),
 z.object({...request,action:z.literal("place"),craftId:id,revision:z.number().int().nonnegative(),mapId:z.string().min(1).max(128),regional:regionalAuthoringSchema.optional(),x:z.number().finite().min(-1e12).max(1e12),y:z.number().finite().min(0).max(1e12),rotation:z.number().finite().min(-180).max(180)}).strict(),
 z.object({...request,action:z.literal("unplace"),craftId:id,revision}).strict(),
 z.object({...request,action:z.literal("connect"),craftId:id,connectionId:id,source:surfaceKeySchema,sourceRevision:revision,sourceFeatureId:id,destination:surfaceKeySchema,destinationRevision:z.number().int().nonnegative(),arrivalFeatureId:id,arrivalPoint:point,kind:z.enum(craftTransitions),twoWay:z.boolean(),newDeck:deckDraftSchema.nullable()}).strict(),
 z.object({...request,action:z.literal("connection-lifecycle"),craftId:id,connectionId:id,revision,archived:z.boolean()}).strict(),
]);
export type CraftCommand=z.infer<typeof craftCommandSchema>;
export type CraftResult={craftId:string;surface?:CraftSurfaceKey;revision?:number;placementRevision?:number;connectionId?:string};
export type CraftRecord=CraftDraft&{id:string;worldId:string;revision:number;archived:boolean};
export type CraftDeck=DeckDraft&{id:string;worldId:string;craftId:string;revision:number;archived:boolean};
export type CraftPlacement={craftId:string;worldId:string;terrainId:string;sourceMapId:string;x:number;y:number;rotation:number;revision:number;removed:boolean};
export type CraftConnection={id:string;worldId:string;craftId:string;revision:number;source:CraftSurfaceKey;sourceFeatureId:string;sourcePoint:TownPoint;destination:CraftSurfaceKey;arrivalFeatureId:string;arrivalPoint:TownPoint;kind:typeof craftTransitions[number];twoWay:boolean;archived:boolean};
export type CraftSummary={id:string;name:string;classification:typeof craftClasses[number];revision:number;archived:boolean;placed:boolean};
export type CraftMarker={id:string;name:string;classification:typeof craftClasses[number];x:number;y:number;rotation:number;revision:number};
export type CraftBundle={available:boolean;canEdit:boolean;worldId:string;crafts:CraftSummary[];next:number|null;craft:CraftRecord|null;decks:Omit<CraftDeck,"surface">[];deck:CraftDeck|null;connections:CraftConnection[];placement:CraftPlacement|null;history:{revision:number;createdAt:string}[];historyPreview?:{revision:number;draft:CraftDraft|DeckDraft};markers:CraftMarker[];map?:{id:string;width:number;height:number;wrap:boolean;regional?:z.infer<typeof regionalAuthoringSchema>}};
export const emptyCraftSurface=():CraftSurface=>({version:1,outlineId:null,plan:emptyFloor(),details:{}});
export function validateCraftSurface(surface:CraftSurface,frame:FloorFrame){
 craftSurfaceSchema.parse(surface);if(frame.x!==0||frame.y!==0||frame.rotation!==0)throw Error("Craft workspaces use one shared origin. Rotate or move the drawing itself.");validateFloor(surface.plan,frame);
 if(surface.outlineId&&!surface.plan.features.some(f=>f.id===surface.outlineId&&f.variant==="area"&&!f.archived))throw Error("Choose an active outline or leave the boundary blank.");
 const ids=new Set(surface.plan.features.map(f=>f.id));for(const key of Object.keys(surface.details))if(!ids.has(key))throw Error("Object information must belong to this surface.");
 for(const f of surface.plan.features)if(f.variant==="object"&&f.destination)throw Error("Craft connections use their own deck identities. Choose a destination in Connections.");
 if(JSON.stringify(surface).length>CRAFT_LIMITS.draftBytes)throw Error("This surface exceeds the four-megabyte recovery limit. Keep the draft and simplify it.");
}
export function craftOutline(start:typeof craftStarts[number],frame:FloorFrame,newId:()=>string):CraftSurface{
 const s=emptyCraftSurface();if(start==="blank")return s;const w=frame.width,h=frame.height;
 const ps=start==="rectangle"?[[.08,.08],[.92,.08],[.92,.92],[.08,.92]]:start==="hull"?[[.5,.035],[.83,.22],[.92,.65],[.83,.94],[.17,.94],[.08,.65],[.17,.22]]:start==="symmetric"?[[.5,.04],[.66,.24],[.67,.44],[.94,.62],[.86,.84],[.61,.74],[.5,.94],[.39,.74],[.14,.84],[.06,.62],[.33,.44],[.34,.24]]:Array.from({length:24},(_,i)=>{const a=-Math.PI/2+i*Math.PI/12;return [.5+.43*Math.cos(a),.5+.46*Math.sin(a)];});
 const d=initialFloor("outline",ps.map(([x,y])=>({x:floorRound(x*w),y:floorRound(y*h)})),frame,newId);d.features[0].name="Outline";return {...s,outlineId:d.features[0].id,plan:d};
}
export function cloneCraftSurface(source:CraftSurface,newId:()=>string){
 const plan=copyFloor({...source.plan,features:source.plan.features.map(f=>({...f,archived:false}))},newId),ids=new Map(source.plan.features.map((f,i)=>[f.id,plan.features[i].id]));plan.features=plan.features.map((f,i)=>({...f,archived:source.plan.features[i].archived}));
 return {surface:{version:1 as const,outlineId:source.outlineId?ids.get(source.outlineId)??null:null,plan,details:Object.fromEntries(Object.entries(source.details).map(([key,value])=>[ids.get(key)!,structuredClone(value)]))},ids};
}
export function outlineOnly(source:CraftSurface,frame:FloorFrame,newId:()=>string,arrange=false){
 const f=source.plan.features.find(f=>f.id===source.outlineId&&f.variant==="area");if(!f||f.variant!=="area")return emptyCraftSurface();const plan=initialFloor(arrange?"generate":"outline",f.points,frame,newId);plan.features[0].name="Deck boundary";return {version:1 as const,outlineId:plan.features[0].id,plan,details:{}};
}
export function scaleCraftPlan(plan:FloorDesign,before:FloorFrame,after:FloorFrame):FloorDesign{
 const sx=after.width/before.width,sy=after.height/before.height,q=(p:TownPoint)=>({x:floorRound(p.x*sx),y:floorRound(p.y*sy)});return {...plan,features:plan.features.map(f=>"points" in f?{...f,points:f.points.map(p=>({...p,...q(p)}))}:f.variant==="object"?{...f,point:q(f.point),width:floorRound(f.width*sx),height:floorRound(f.height*sy)}:f)};
}
export function craftFeature(plan:FloorDesign,id:string):FloorFeature{const f=plan.features.find(f=>f.id===id&&!f.archived);if(!f||f.variant!=="opening"&&(f.variant!=="object"||f.kind!=="transition"))throw Error("Choose an active hatch, stair, ladder, lift, ramp or entrance.");return f;}
