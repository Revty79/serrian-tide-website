import {z} from "zod";
import {seededRandom} from "./generation-geometry";
import type {GenerationSpec} from "./generation-spec";
import {createLand} from "./map-generator-v2";
import {geoId,spatialReferenceSchema,type Coordinate,type SourceGeometry} from "./geographic";
import {canonicalAuthoringGeometry,validateAuthoringGeometry} from "./geographic-authoring-geometry";

export const geographicRecipeSchema=z.object({
 version:z.literal(1),algorithm:z.literal("serrian-geography-v1"),seed:z.string().trim().min(1).max(64),
 reference:spatialReferenceSchema,extent:z.tuple([z.number().finite(),z.number().finite(),z.number().finite(),z.number().finite()]),
 settings:z.object({continents:z.number().int().min(0).max(4),islands:z.number().int().min(0).max(20),landCoverage:z.number().int().min(10).max(55),complexity:z.number().int().min(0).max(100),size:z.enum(["small","medium","large","varied"]),shape:z.enum(["balanced","elongated","crescent","varied"])}).strict(),
}).strict().superRefine((r,ctx)=>{
 const [w,s,e,n]=r.extent,b=r.reference.kind==="plane"?r.reference.bounds:[-180,-75,180,75];
 if(w>=e||s>=n||w<b[0]||s<b[1]||e>b[2]||n>b[3]||r.reference.kind==="sphere"&&e-w>=120)ctx.addIssue({code:"custom",message:"Choose increasing bounds inside this surface. Spherical generation needs a local longitude span below 120 degrees and latitudes within 75 degrees.",path:["extent"]});
 if(!r.settings.continents&&!r.settings.islands)ctx.addIssue({code:"custom",message:"Choose at least one landmass or island.",path:["settings"]});
});
export type GeographicRecipe=z.infer<typeof geographicRecipeSchema>;
/** Portable request contract shared by the server, pending retries and local recovery. */
export const generationSaveSchema=z.object({mapId:geoId,timelineId:geoId,requestId:geoId,surfaceId:geoId,expectedContext:z.string().regex(/^[a-f0-9]{64}$/),outputDigest:z.string().regex(/^[a-f0-9]{64}$/),recipe:geographicRecipeSchema,name:z.string().trim().min(1).max(120),note:z.string().trim().min(1).max(2000),protected:z.boolean()}).strict();
export const geographicPresets={
 continent:{label:"Continent and offshore islands",settings:{continents:1,islands:5,landCoverage:45,complexity:72,size:"large",shape:"varied"}},
 separated:{label:"Separated landmasses",settings:{continents:3,islands:7,landCoverage:45,complexity:75,size:"varied",shape:"varied"}},
 archipelago:{label:"Island chains",settings:{continents:0,islands:16,landCoverage:25,complexity:68,size:"varied",shape:"varied"}},
 island:{label:"Single irregular island",settings:{continents:0,islands:1,landCoverage:40,complexity:85,size:"large",shape:"crescent"}},
} satisfies Record<string,{label:string;settings:GeographicRecipe["settings"]}>;
/** Immutable adapter defaults: later UI preset changes must never reroute old seeds. */
export function geographicBaseSpec(recipe:GeographicRecipe):GenerationSpec{const s=recipe.settings;return {
 version:1,algorithm:"serrian-atlas-v2",seed:recipe.seed,
 settings:{mapType:"world",continents:s.continents,islands:s.islands,landCoverage:s.landCoverage,ruggedness:s.complexity,size:s.size,shape:s.shape,mountains:0,forest:0,rivers:0,lakes:0,biome:"mixed",style:"illuminated"},
 plan:{landPosition:"center",islandPosition:"scattered",ruggedCoast:"all",baySide:"all",additionalBaySide:"none",bays:2,bayDepth:2,mountainRegion:"center",mountainOrientation:"varied",mountainRanges:1,forestRegion:"automatic",riverDirection:"automatic",lakeRegion:"automatic",desertRegion:"automatic",grasslandRegion:"automatic",wetlandRegion:"automatic",snowRegion:"automatic",extraTerrain:[]},
 description:null,interpretation:null,
};}
export type GeographicGeneration={baseSpec:GenerationSpec;features:{kind:"landmass"|"island";geometry:SourceGeometry}[];coverage:number;vertices:number};
/** A versioned adapter of Atlas V2 land algorithms, not a replacement generator.
 * IDs never enter the geographic output or its random stream. Each complete
 * coastline is a separate editable source, with no simplification/truncation. */
export function generateGeography(input:GeographicRecipe):GeographicGeneration{
 const recipe=geographicRecipeSchema.parse(input),spec=geographicBaseSpec(recipe);
 let vertexId=0;
 const random=seededRandom(`${spec.algorithm}:${spec.seed}`),lands=createLand(spec,random,()=>`00000000-0000-4000-8000-${String(++vertexId).padStart(12,"0")}`),[w,south,e,n]=recipe.extent;
 // Match the existing Atlas adapter: authored planar y increases down its canvas; spherical latitude increases north.
 const coordinate=(x:number,y:number):Coordinate=>[Number((w+x/2000*(e-w)).toPrecision(12)),Number((recipe.reference.kind==="plane"?south+y/1200*(n-south):n-y/1200*(n-south)).toPrecision(12))];
 const features=lands.map(land=>{const points=land.points.map(p=>coordinate(p.x,p.y)),geometry=canonicalAuthoringGeometry({type:"Polygon",coordinates:[[...points,points[0]]]});validateAuthoringGeometry(geometry,recipe.reference);return {kind:land.major?"landmass" as const:"island" as const,geometry};});
 // Also check common topology across generated sources, including geodesic edges.
 // The import validator has no interactive component cap; each individual source
 // has already passed the stricter D2 bounds above.
 validateGeneratedSeparation(features,recipe.reference);
 const area=lands.reduce((sum,l)=>sum+l.area,0);
 return {baseSpec:spec,features,coverage:Math.round(area/2400000*10000)/100,vertices:lands.reduce((sum,l)=>sum+l.points.length,0)};
}
import {validateSourceGeometry} from "./geographic-geometry";
function validateGeneratedSeparation(features:GeographicGeneration["features"],reference:GeographicRecipe["reference"]){
 const geometry:SourceGeometry={type:"MultiPolygon",coordinates:features.map(f=>(f.geometry as Extract<SourceGeometry,{type:"Polygon"}>).coordinates)};
 validateSourceGeometry(geometry,reference);
 if(reference.kind==="sphere"){
  const points=geometry.coordinates.flat(2),center=(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2;
  const coordinates=geometry.coordinates.map(p=>p.map(r=>r.map(([lon,lat])=>[Math.tan((lon-center)*Math.PI/180),Math.tan(lat*Math.PI/180)/Math.cos((lon-center)*Math.PI/180)] as Coordinate)));
  validateSourceGeometry({type:"MultiPolygon",coordinates},{version:1,kind:"plane",crs:"VALIDATION:generation",units:"projection units",bounds:[-10,-10,10,10]});
 }
}
export async function generationOutputDigest(result:GeographicGeneration){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(result.features))))).map(b=>b.toString(16).padStart(2,"0")).join("");}
