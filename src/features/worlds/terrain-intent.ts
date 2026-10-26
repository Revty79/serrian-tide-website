import {z} from "zod";
import type {TerrainGeometry} from "./terrain";

export const INTENT_VERSION="world-heightmap-v3" as const;
export const intentKinds={continent:"Continent",island:"Major island",chain:"Island group / chain",mountains:"Mountain range",plains:"Plains / lowlands",highlands:"Highlands",plateau:"Plateau",valley:"Valley",depression:"Depression",bay:"Sheltered bay"} as const;
export const landKind=(kind:string)=>kind==="continent"||kind==="island";
const coordinate=z.number().finite().min(-1e12).max(1e12),span=z.number().finite().min(.01).max(2e9);
const reference=z.discriminatedUnion("kind",[z.object({kind:z.literal("parent"),id:z.string().min(1).max(80),east:z.number().min(-1).max(1),south:z.number().min(-1).max(1)}).strict(),z.object({kind:z.literal("between"),ids:z.tuple([z.string().min(1).max(80),z.string().min(1).max(80)])}).strict()]);
export const intentFeatureSchema=z.object({id:z.string().min(1).max(80),name:z.string().trim().min(1).max(160),kind:z.enum(["continent","island","chain","mountains","plains","highlands","plateau","valley","depression","bay"]),x:coordinate,y:coordinate,width:span,height:span,angle:z.number().finite().min(-360).max(360),elevation:z.number().int().min(-30000).max(30000),ruggedness:z.number().min(0).max(100),coastline:z.number().min(0).max(100),count:z.number().int().min(1).max(24),islandWidth:span,distribution:z.enum(["chain","cluster","scattered"]),reference:reference.nullable()}).strict();
export const intentPlanSchema=z.object({space:z.object({x:coordinate,y:coordinate,width:span,height:span,periodX:span.nullable()}).strict(),area:z.object({x:coordinate,y:coordinate,width:span,height:span}).strict(),features:z.array(intentFeatureSchema).min(1).max(48)}).strict().superRefine((plan,ctx)=>{
 const ids=new Set<string>();let islands=0;
 for(const [i,f] of plan.features.entries()){if(ids.has(f.id))ctx.addIssue({code:"custom",path:["features",i,"id"],message:"Each proposed feature needs a distinct plan identity."});ids.add(f.id);islands+=f.kind==="chain"?f.count:landKind(f.kind)?1:0;if(landKind(f.kind)&&f.reference)ctx.addIssue({code:"custom",path:["features",i,"reference"],message:"Major landforms use absolute physical anchors."});}
 if(islands>256)ctx.addIssue({code:"custom",message:"Use at most 256 individual proposed landforms."});
 for(const [i,f] of plan.features.entries())if(f.reference){const targets=f.reference.kind==="parent"?[f.reference.id]:f.reference.ids;for(const id of targets)if(!plan.features.some(p=>p.id===id&&landKind(p.kind)&&!p.reference))ctx.addIssue({code:"custom",path:["features",i,"reference"],message:"A geographic relationship must refer to an existing independent landmass in this plan."});if(new Set(targets).size!==targets.length)ctx.addIssue({code:"custom",path:["features",i,"reference"],message:"Choose two different landmasses for a between relationship."});}
 const a=plan.area,s=plan.space;if(a.x<s.x||a.y<s.y||a.x+a.width>s.x+s.width+.00001||a.y+a.height>s.y+s.height+.00001)ctx.addIssue({code:"custom",path:["area"],message:"The proposal area must stay inside its active numerical terrain frame."});
});
export type IntentFeature=z.infer<typeof intentFeatureSchema>;
export type IntentPlan=z.infer<typeof intentPlanSchema>;
export type IntentIssue={id:string;kind:"unsupported"|"ambiguous"|"contradiction"|"unrecognized";text:string;explanation:string;featureId?:string;resolved:boolean;decision:string};
export const intentIssueSchema=z.object({id:z.string().max(80),kind:z.enum(["unsupported","ambiguous","contradiction","unrecognized"]),text:z.string().max(2000),explanation:z.string().max(1000),featureId:z.string().max(80).optional(),resolved:z.boolean(),decision:z.string().max(1000)}).strict();
export function intentPoint(f:IntentFeature,plan:IntentPlan){
 const r=f.reference;if(!r)return {x:f.x,y:f.y};
 if(r.kind==="parent"){const p=plan.features.find(p=>p.id===r.id)!;return {x:p.x+p.width*r.east+f.x,y:p.y+p.height*r.south+f.y};}
 const a=plan.features.find(p=>p.id===r.ids[0])!,b=plan.features.find(p=>p.id===r.ids[1])!,period=plan.space.periodX,dx=period?((b.x-a.x+period/2)%period+period)%period-period/2:b.x-a.x;return {x:a.x+dx/2+f.x,y:(a.y+b.y)/2+f.y};
}
export function moveIntentFeature(plan:IntentPlan,id:string,x:number,y:number):IntentPlan{return {...plan,features:plan.features.map(f=>{if(f.id!==id)return f;const point=intentPoint(f,plan);return {...f,x:f.x+x-point.x,y:f.y+y-point.y};})};}
export function removeIntentFeature(plan:IntentPlan,id:string):IntentPlan{return {...plan,features:plan.features.filter(f=>f.id!==id).map(f=>{if(f.reference&&(f.reference.kind==="parent"?f.reference.id===id:f.reference.ids.includes(id))){const point=intentPoint(f,plan);return {...f,...point,reference:null};}return f;})};}
export function defaultIntentFeature(kind:IntentFeature["kind"],plan:Pick<IntentPlan,"area">,id:string):IntentFeature{
 const a=plan.area,local=Math.max(a.width,a.height)<=100000,land=landKind(kind),width=land?(kind==="continent"?(local?a.width*.5:5000000):(local?1000:600000)):kind==="chain"?(local?a.width*.35:3000000):(local?a.width*.3:1500000);
 return {id,name:intentKinds[kind]+" "+id.replace(/\D/g,""),kind,x:a.x+a.width/2,y:a.y+a.height/2,width,height:kind==="mountains"?width*.1:kind==="valley"?width*.15:width*.65,angle:0,elevation:land||kind==="chain"?200:kind==="mountains"?(local?500:3500):kind==="bay"||kind==="depression"?-200:kind==="plains"?80:kind==="valley"?30:1000,ruggedness:land?25:kind==="plains"?3:40,coastline:45,count:kind==="chain"?5:1,islandWidth:local?500:300000,distribution:"chain",reference:null};
}
export function intentWarnings(shape:TerrainGeometry,plan:IntentPlan){
 const warnings:string[]=[],dx=shape.displayWidth/shape.width,dy=shape.displayHeight/shape.height;
 for(const f of plan.features){const p=intentPoint(f,plan),short=f.kind==="chain"?f.islandWidth:Math.min(f.width,f.height),samples=short/Math.max(dx,dy);if(samples<8)warnings.push(`${f.name}: only ${samples.toFixed(2)} samples across its smaller dimension (${(short/1000).toLocaleString()} km). Its requested size is retained. Use finer terrain, a smaller World, or explicitly resize it.`);const angle=f.angle*Math.PI/180,rx=Math.hypot(f.width/2*Math.cos(angle),f.height/2*Math.sin(angle)),ry=Math.hypot(f.width/2*Math.sin(angle),f.height/2*Math.cos(angle)),a=plan.area;if((!plan.space.periodX&&(p.x-rx<a.x||p.x+rx>a.x+a.width))||p.y-ry<a.y||p.y+ry>a.y+a.height)warnings.push(`${f.name} reaches the proposal boundary and may be cropped. Its physical dimensions have not been enlarged or reduced.`);}
 return warnings;
}
