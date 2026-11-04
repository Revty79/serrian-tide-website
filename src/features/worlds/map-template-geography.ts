import {EMPTY_ENVIRONMENT,climatePreset,environmentLayerSchema,validateEnvironmentFrame,type EnvironmentLayer} from "./terrain-environment";
export {geographyTemplateEnvironmentSchema,geographyTemplateCoverSchema,type GeographyTemplateEnvironment,type GeographyTemplateCover} from "./map-template-geography-spec";
import type {GeographyTemplateEnvironment} from "./map-template-geography-spec";
/** Visual land coverage uses the existing environmental model; it never changes heights or water. */
export function geographyTemplateEnvironment(preset:GeographyTemplateEnvironment,world:{width:number;height:number;wrap:boolean}):EnvironmentLayer{
 const kind=preset.kind,epsilon=Math.max(1e-5,Math.max(world.width,world.height)*1e-12),parts=world.wrap?4:1,biome=kind==="arid"?"hotDesert":kind==="wetland"?"wetland":kind==="alpine"||kind==="volcanic"?"alpine":"deciduous",vegetation=kind==="woodland"?"woodland":kind==="wetland"?"wetland":kind==="alpine"?"alpine":"bare";
 const layer:EnvironmentLayer={...structuredClone(EMPTY_ENVIRONMENT),settings:climatePreset(kind==="arid"?"arid":"temperate"),biomes:true,vegetation:true,regions:Array.from({length:parts},(_,i)=>({id:preset.id.slice(0,-1)+i.toString(16),name:"Template "+kind+" coverage",kind:kind==="woodland"?"vegetation":"biome",shape:"polygon",points:[{x:Math.max(epsilon,world.width*i/parts),y:epsilon},{x:world.width*(i+1)/parts-epsilon,y:epsilon},{x:world.width*(i+1)/parts-epsilon,y:world.height-epsilon},{x:Math.max(epsilon,world.width*i/parts),y:world.height-epsilon}],radiusM:1,strength:1,biome,vegetation,density:kind==="woodland"?.8:kind==="wetland"?.65:kind==="alpine"?.2:.03,scaleM:10,clustering:.6,protected:false}))};
 environmentLayerSchema.parse(layer);validateEnvironmentFrame(layer,world);return layer;
}
