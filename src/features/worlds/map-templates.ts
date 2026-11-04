import {mapAppearanceSchema} from "./terrain-appearance";
import {geographyTemplateCoverSchema} from "./map-template-geography-spec";
import {z} from "zod";
import {generationRecipeSchema,generationRecipeV2Schema,GENERATOR_VERSION} from "./terrain-source";
import {townDesignSchema,townFrameSchema,townGenerationSchema,validateTownDesign} from "./town-map";
import {copyFloor,emptyFloor,floorDesignSchema,floorFrameSchema,floorRound,validateFloor,type FloorDesign,type FloorFrame} from "./building-floor";
import {interiorTemplateLayout} from "./map-template-interior";
import {fitInteriorTemplate} from "./map-template-floor-alignment";
import {copyUnderground,generateUnderground,undergroundDesignSchema,undergroundSettingsSchema,validateUnderground} from "./underground";
import {craftClasses,craftDraftSchema,craftOutline,craftStarts,cloneCraftSurface,deckDraftSchema,outlineOnly,scaleCraftPlan,validateCraftSurface} from "./craft";
import {compositionSchema,validateComposition,type AssetComposition} from "./atlas-assets";

export const TEMPLATE_LIMITS={templates:256,revisions:128,ownerBytes:128*1024*1024,bodyBytes:5*1024*1024,contentBytes:1_500_000,packetBytes:4_000_000,decks:8,page:50} as const;
export const templateFamilies={geography:"World & Regions",town:"Towns & Cities",interior:"Building Interiors",underground:"Underground",craft:"Craft & Vehicles",appearance:"Styles & Appearance"} as const;
export const templateGenres=["natural","fantasy","historical","modern","science-fiction","custom"] as const;
export const templateFamilySchema=z.enum(["geography","town","interior","underground","craft","appearance"]);
export type TemplateFamily=z.infer<typeof templateFamilySchema>;
export const interiorPurposes=["house","inn","shop","temple","warehouse","manor","barracks","modern","custom"] as const;
const interiorRecipe=z.object({purpose:z.enum(interiorPurposes),rooms:z.number().int().min(2).max(8),flooring:z.enum(["plain","boards","tiles","stone"])}).strict();
const floorDrawing=z.object({frame:floorFrameSchema,design:floorDesignSchema,footprint:z.array(z.object({x:z.number().finite().min(0).max(20000),y:z.number().finite().min(0).max(20000)}).strict()).min(3).max(4096).optional()}).strict();
const images=z.array(z.object({surface:z.number().int().min(0).max(TEMPLATE_LIMITS.decks),layer:compositionSchema}).strict()).max(TEMPLATE_LIMITS.decks+1).default([]);
export const templateContentSchema=z.discriminatedUnion("family",[
 z.object({family:z.literal("appearance"),spec:mapAppearanceSchema,images}).strict(),
 z.object({family:z.literal("geography"),recipe:generationRecipeSchema,environment:geographyTemplateCoverSchema.optional(),images}).strict(),
 z.object({family:z.literal("town"),settings:townGenerationSchema,drawing:z.object({frame:townFrameSchema,design:townDesignSchema}).strict().optional(),images}).strict(),
 z.object({family:z.literal("interior"),recipe:interiorRecipe,drawing:floorDrawing.optional(),images}).strict(),
 z.object({family:z.literal("underground"),settings:undergroundSettingsSchema,drawing:z.object({frame:floorFrameSchema,design:undergroundDesignSchema}).strict().optional(),images}).strict(),
 z.object({family:z.literal("craft"),classification:z.enum(craftClasses),frame:floorFrameSchema,start:z.enum(craftStarts),compartments:z.number().int().min(2).max(8),suggestedDecks:z.number().int().min(0).max(TEMPLATE_LIMITS.decks),drawing:z.object({draft:craftDraftSchema,decks:z.array(deckDraftSchema).max(TEMPLATE_LIMITS.decks)}).strict().optional(),images}).strict(),
]);
export type TemplateContent=z.infer<typeof templateContentSchema>;
const metadata={name:z.string().trim().min(1).max(120),description:z.string().max(2000),subtype:z.string().trim().min(1).max(80),genre:z.enum(templateGenres),attribution:z.string().max(1000)};
export const templateCommandSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("save"),requestId:z.uuid(),templateId:z.uuid(),revision:z.number().int().min(0).max(TEMPLATE_LIMITS.revisions),...metadata,content:templateContentSchema}).strict(),
 z.object({action:z.literal("lifecycle"),requestId:z.uuid(),templateId:z.uuid(),revision:z.number().int().min(1).max(TEMPLATE_LIMITS.revisions),archived:z.boolean()}).strict(),
]);
export type TemplateCommand=z.infer<typeof templateCommandSchema>;
export type TemplateMetadata={id:string;name:string;description:string;subtype:string;genre:typeof templateGenres[number];attribution:string;provenance:string;family:TemplateFamily;revision:number;archived:boolean;builtIn:boolean;legacyStyle?:boolean;kind:"layout"|"preset";artwork:string[];limitations:string[]};
export type MapTemplate=TemplateMetadata&{content:TemplateContent};
export type TemplateLibrary={available:boolean;canEdit:boolean;templates:TemplateMetadata[];next:number|null};
export type TemplateContext={frame?:FloorFrame;footprint?:{x:number;y:number}[];fit:boolean;includeDecks:boolean;seed:string};
const localFrame=(f:FloorFrame):FloorFrame=>({...f,x:0,y:0,rotation:0});

/** Templates carry portable drawing/settings, never permanent Places, Shops or live destinations. */
export function portableTemplate(input:TemplateContent,newId:()=>string):TemplateContent{
 const c=templateContentSchema.parse(input);
 if(c.family==="appearance"){if(c.images.length)throw Error("Appearance presets retain style settings, not image placements.");return c;}
 const imageCopies=c.images.map(i=>({...i,layer:{...i.layer,placements:i.layer.placements.map(p=>({...p,id:newId()}))}}));
 if(c.family==="geography"){
  // An interpreted plan is bound to its source World's physical coordinates.
  const r=c.recipe.version==="world-heightmap-v3"?generationRecipeV2Schema.parse(Object.fromEntries(Object.keys(generationRecipeV2Schema.shape).map(k=>[k,k==="version"?GENERATOR_VERSION:(c.recipe as unknown as Record<string,unknown>)[k]]))):c.recipe;
  if(c.images.length)throw Error("Save geography settings separately from World-bound image positions.");
  return {...c,recipe:r,images:[]};
 }
 if(c.family==="town")return {...c,images:imageCopies,...c.drawing?{drawing:{frame:localFrame(c.drawing.frame),design:{...structuredClone(c.drawing.design),recipe:null,features:c.drawing.design.features.filter(f=>!f.archived).map(f=>({...f,id:newId(),points:f.points.map(p=>({...p})),placeId:null,shopLocationId:null,origin:"manual" as const}))}}}:{}};
 if(c.family==="interior")return {...c,images:imageCopies,...c.drawing?{drawing:{...c.drawing,frame:localFrame(c.drawing.frame),design:copyFloor(c.drawing.design,newId)}}:{}};
 if(c.family==="underground")return {...c,images:imageCopies,...c.drawing?{drawing:{frame:localFrame(c.drawing.frame),design:copyUnderground(c.drawing.design,newId)}}:{}};
 return {...c,images:imageCopies,...c.drawing?{drawing:{draft:{...c.drawing.draft,frame:localFrame(c.drawing.draft.frame),surface:cloneCraftSurface(c.drawing.draft.surface,newId).surface},decks:c.drawing.decks.map(d=>({...d,frame:localFrame(d.frame),surface:cloneCraftSurface(d.surface,newId).surface}))}}:{}};
}
export function validateTemplate(c:TemplateContent){
 templateContentSchema.parse(c);if(new TextEncoder().encode(JSON.stringify(c)).length>TEMPLATE_LIMITS.contentBytes)throw Error("This template exceeds its 1,500,000-byte reusable-drawing budget. Keep the source drawing and simplify the reusable copy.");
 if(new Set(c.images.map(i=>i.surface)).size!==c.images.length)throw Error("Choose one image layout per template surface.");
 if(c.family==="town"&&c.drawing)validateTownDesign(c.drawing.design,c.drawing.frame);
 if(c.family==="interior"&&c.drawing){validateFloor(c.drawing.design,c.drawing.frame);if(c.drawing.footprint?.some(p=>p.x>c.drawing!.frame.width||p.y>c.drawing!.frame.height))throw Error("The reusable building outline must fit its physical workspace.");}
 if(c.family==="underground"&&c.drawing)validateUnderground(c.drawing.design,c.drawing.frame);
 if(c.family==="craft"&&c.drawing){validateCraftSurface(c.drawing.draft.surface,c.drawing.draft.frame);c.drawing.decks.forEach(d=>validateCraftSurface(d.surface,d.frame));}
 for(const i of c.images){
  const f=c.family==="craft"?(i.surface===0?c.drawing?.draft.frame:c.drawing?.decks[i.surface-1]?.frame):"drawing" in c?c.drawing?.frame:undefined;
  if(!f||c.family!=="craft"&&i.surface!==0)throw Error("Reference images must belong to a retained template drawing.");validateComposition(i.layer,{...f,x:0,y:0});
 }
}
function scaleDrawing(d:FloorDesign,before:FloorFrame,after:FloorFrame,fit:boolean){
 if(!fit&&(before.width>after.width||before.height>after.height))throw Error("The saved drawing is larger than this workspace. Explicitly choose Fit drawing, or use a larger workspace.");
 return fit?scaleCraftPlan(d,before,after):d;
}
/** Resolve once for the preview; accepting uses these same independent object identities. */
export function resolveTemplate(input:TemplateContent,context:TemplateContext,newId:()=>string):TemplateContent{
 const c=portableTemplate(input,newId),frame=context.frame;
 if(c.family==="appearance")return c;
 if(c.family==="geography")return {...c,recipe:{...c.recipe,seed:context.seed}};
 if(c.family==="town"){
  if(!c.drawing||!frame)return {...c,settings:{...c.settings,seed:context.seed}};
  const a=c.drawing.frame,sx=context.fit?frame.width/a.width:1,sy=context.fit?frame.height/a.height:1;
  if(!context.fit&&(a.width>frame.width||a.height>frame.height))throw Error("Choose Fit drawing to reuse this Town drawing in a smaller workspace.");
  return {...c,drawing:{frame:{...frame},design:{...c.drawing.design,features:c.drawing.design.features.map(f=>({...f,points:f.points.map(p=>({x:floorRound(p.x*sx),y:floorRound(p.y*sy)})),width:Math.max(.25,Math.min(100,floorRound(f.width*Math.min(sx,sy))))}))}},images:scaleImages(c.images,[a],[frame],context.fit)};
 }
 if(c.family==="interior"){
  const f=frame??c.drawing?.frame??{x:0,y:0,width:24,height:18,rotation:0},footprint=context.footprint??c.drawing?.footprint??[{x:1,y:1},{x:f.width-1,y:1},{x:f.width-1,y:f.height-1},{x:1,y:f.height-1}],copy=c.drawing?fitInteriorTemplate(c.drawing,c.images,f,footprint,context.fit):undefined;
  const design={...(copy?.design??(c.recipe.purpose==="custom"?emptyFloor():interiorTemplateLayout(c.recipe.purpose,c.recipe.rooms,footprint,f,newId))),flooring:c.recipe.flooring};
  const result={...c,drawing:{frame:f,design,footprint},images:copy?.images??[]};validateTemplate(result);return result;
 }
 if(c.family==="underground"){
  const generated=c.drawing?null:generateUnderground({...c.settings,seed:context.seed},newId),before=c.drawing?.frame??generated!.frame,f=frame??before,d=c.drawing?.design??generated!.design;
  const design={...d,features:scaleDrawing(d,before,f,context.fit).features};
  const result={...c,drawing:{frame:f,design},images:scaleImages(c.images,[before],[f],context.fit)};validateTemplate(result);return result;
 }
 const f=frame??c.drawing?.draft.frame??c.frame,draft=c.drawing?{...c.drawing.draft,frame:f,surface:{...c.drawing.draft.surface,plan:scaleDrawing(c.drawing.draft.surface.plan,c.drawing.draft.frame,f,context.fit)}}:{name:"New craft",classification:c.classification,description:"",frame:f,surface:craftOutline(c.start,f,newId)};
 if(!c.drawing)draft.surface.plan.flooring=["spacecraft","space station","submarine","modern ship","aircraft","mobile base"].includes(c.classification)?"tiles":"boards";
 const decks=context.includeDecks?(c.drawing?.decks??Array.from({length:c.suggestedDecks},(_,i)=>{const df={...f,width:floorRound(Math.max(4,f.width*(1-i*.08))),height:floorRound(Math.max(4,f.height*(1-i*.1)))};const surface=outlineOnly({...draft.surface,plan:scaleCraftPlan(draft.surface.plan,f,df)},df,newId,true);surface.plan.flooring=draft.surface.plan.flooring;return {name:(["spacecraft","space station"].includes(c.classification)?["Bridge","Habitation","Engineering"]:["Main Deck","Lower Deck","Hold / Engine Room"])[i]??`Deck ${i+1}`,order:-i,height:null,frame:df,surface};})):[];
 const retainedImages=c.images.filter(i=>i.surface===0||context.includeDecks),before=[c.drawing?.draft.frame??c.frame,...c.drawing?.decks.map(d=>d.frame)??[]],after=[f,...decks.map(d=>d.frame)];
 const result={...c,frame:f,drawing:{draft,decks},images:scaleImages(retainedImages,before,after,context.fit)};validateTemplate(result);return result;
}
function scaleImages(images:TemplateContent["images"],before:FloorFrame[],after:FloorFrame[],fit:boolean){return images.map(i=>{const a=before[i.surface],b=after[i.surface],sx=fit?b.width/a.width:1,sy=fit?b.height/a.height:1;return {...i,layer:{...i.layer,placements:i.layer.placements.map(p=>({...p,x:p.x*sx,y:p.y*sy,width:p.width*sx,height:p.height*sy}))}};});}
export function templateFloor(content:TemplateContent):{frame:FloorFrame;design:FloorDesign}|undefined{return content.family==="craft"&&content.drawing?{frame:content.drawing.draft.frame,design:content.drawing.draft.surface.plan}:content.family==="interior"||content.family==="underground"?content.drawing:undefined;}
export function templateImageLayer(content:TemplateContent,surface=0):AssetComposition|undefined{return content.images.find(i=>i.surface===surface)?.layer;}
