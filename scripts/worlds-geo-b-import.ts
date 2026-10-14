/** Frozen, bounded import into the verified existing Earth; never recreates it. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import {coordinateCount,geometryParts,type SourceImport,type SourceGeometry} from "../src/features/worlds/geographic";

export const EARTH={world:"981b883d-17a1-4603-b003-1053968e4f6c",map:"dd7cdb89-e5c1-4553-a8d1-0934f36f6c8c",surface:"964f24cd-7a7b-45dd-9d0e-c37fce26149a",timeline:"f364f134-8f75-423b-be5c-bdd9a5da3a41",owner:"SpA0DkGF8bhFUFhWnxgofw1nLBS7IGZ7"} as const;
export type PlanRecord={sourceRow:number;sourceIdentity:string;sourceGeometrySha256:string;sourcePropertiesSha256:string;componentFirst:number;componentCount:number;country:boolean;externalId:string;name:string;geometrySha256:string};
export type ImportPlan={version:number;manifestSha256:string;planSha256:string;sources:{layer:string;sourceRows:number;sourceComponents:number;importRecords:number;sourceCoordinates:number;zipSha256:string;edition:string;dataset:string}[];batches:{file:string;sha256:string;bytes:number;layer:string;dataset:string;records:PlanRecord[]}[]};
export function canonical(value:unknown):string{if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;if(value&&typeof value==="object")return `{${Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;return JSON.stringify(value);}
export const sha=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
export async function frozenPlan(){const text=await readFile("artifacts/guidance/geo-b/import-plan.json","utf8"),plan:ImportPlan=JSON.parse(text),{planSha256,...data}=plan;assert.equal(plan.version,1);assert.equal(sha(canonical(data)),planSha256);const manifest=JSON.parse((await readFile("data/geography/natural-earth-world-sources.json","utf8")).replace(/^\uFEFF/,""));assert.equal(sha(canonical(manifest)),plan.manifestSha256);return plan;}
export async function verifyEarth(pool:pg.Pool){
  const row=(await pool.query('select owner_id,archived_at from world where id=$1',[EARTH.world])).rows[0];assert.equal(row?.owner_id,EARTH.owner);assert.equal(row.archived_at,null);
  assert.equal((await pool.query('select username from "user" where id=$1',[EARTH.owner])).rows[0]?.username.toLowerCase(),"revty79");
  assert.ok((await pool.query("select 1 from user_role where user_id=$1 and role in ('god','admin')",[EARTH.owner])).rowCount);
  const map=(await pool.query('select world_id,map_kind,archived_at from world_atlas_map where id=$1',[EARTH.map])).rows[0];assert.equal(map?.world_id,EARTH.world);assert.equal(map.map_kind,"generic");assert.equal(map.archived_at,null);
  const surface=(await pool.query('select world_id,reference,realm_id,protected from world_geo_surface where id=$1',[EARTH.surface])).rows[0];assert.equal(surface?.world_id,EARTH.world);assert.deepEqual(surface.reference,{version:1,kind:"sphere",crs:"EPSG:4326",units:"degrees"});assert.equal(surface.realm_id,null);assert.equal(surface.protected,false);
  assert.equal((await pool.query('select surface_id from world_geo_view where map_id=$1 and world_id=$2',[EARTH.map,EARTH.world])).rows[0]?.surface_id,EARTH.surface);
  assert.equal((await pool.query('select world_id from world_timeline where id=$1',[EARTH.timeline])).rows[0]?.world_id,EARTH.world);
  const inspection=JSON.parse(await readFile("artifacts/guidance/geo-b/inspection.json","utf8"));
  for(const saved of inspection.records){const actual=(await pool.query('select f.geography_id,v.geometry,v.properties,d.id dataset_id,d.provenance from world_geo_feature f join world_geo_version v on v.feature_id=f.id and v.revision=1 join world_geo_dataset d on d.id=v.dataset_id where f.id=$1 and f.world_id=$2',[saved.id,EARTH.world])).rows[0];assert.ok(actual);assert.equal(actual.geography_id,saved.geography_id);assert.equal(actual.dataset_id,saved.dataset_id);assert.deepEqual(actual.provenance,saved.provenance);assert.equal(sha(JSON.stringify(actual.geometry)),saved.geometrySha256);assert.equal(actual.properties.NE_ID,saved.sourceIdentity);}
}
export async function importEarth(pool:pg.Pool,progressFile:string,limit=Infinity){
  const target=(await pool.query('select current_database() name,inet_server_addr()::text host,inet_server_port() port')).rows[0];assert.ok(["127.0.0.1/32","::1/128"].includes(target.host));
  assert.equal(target.name,process.env.SERRIAN_GEO_B_AUTHORIZED_TARGET);assert.ok(target.name==="serrian_tide_dev"||/^serrian_geo_b_\d+$/.test(target.name));
  if(target.name==="serrian_tide_dev"){assert.equal(target.port,5432);assert.equal(process.env.SERRIAN_GEO_B_APPLY,"verified");}
  assert.ok(path.resolve(progressFile).startsWith(path.resolve("artifacts/guidance/geo-b")+path.sep));
  await verifyEarth(pool);const plan=await frozenPlan();assert.equal(process.env.SERRIAN_GEO_B_VERIFIED_PLAN,plan.planSha256);
  const geographic=await import("../src/features/worlds/geographic-service");
  // Bind only earlier scales. A retry of a record first created at this scale
  // must use the same input, rather than adding its newly generated place ID.
  const countryPlaces=new Map<string,Map<string,string>>();
  async function refreshPlaces(){countryPlaces.clear();const rows=(await pool.query("select gd.provenance->>'dataset' dataset,gf.external_id,gf.geography_id from world_geo_feature gf join world_geo_version v on v.feature_id=gf.id and v.revision=1 join world_geo_dataset gd on gd.id=v.dataset_id where gf.world_id=$1 and gf.surface_id=$2 and gd.provenance->>'provider'='Natural Earth' and gd.provenance->>'dataset' in ('Admin 0 Countries 1:110m','Admin 0 Countries 1:50m','Admin 0 Countries 1:10m')",[EARTH.world,EARTH.surface])).rows;
    const identities=new Map<string,string>();for(const row of rows){const previous=identities.get(row.external_id);assert.ok(!previous||previous===row.geography_id,`Conflicting existing country identity ${row.external_id}`);identities.set(row.external_id,row.geography_id);const scale=countryPlaces.get(row.dataset)??new Map<string,string>();scale.set(row.external_id,row.geography_id);countryPlaces.set(row.dataset,scale);}}
  await refreshPlaces();const results=[];let created=0;const start=performance.now();
  for(const [index,batch] of plan.batches.entries()){
    if(index>=limit)break;const file=path.resolve("artifacts/guidance/geo-b",batch.file);assert.ok(file.startsWith(path.resolve("artifacts/guidance/geo-b/batches")+path.sep));
    const text=await readFile(file,"utf8");assert.equal(Buffer.byteLength(text),batch.bytes);assert.equal(sha(text),batch.sha256);const source:SourceImport=JSON.parse(text);
    const earlier=batch.dataset==="Admin 0 Countries 1:50m"?["Admin 0 Countries 1:110m"]:batch.dataset==="Admin 0 Countries 1:10m"?["Admin 0 Countries 1:110m","Admin 0 Countries 1:50m"]:[];
    for(const record of source.records){for(const name of earlier){const place=countryPlaces.get(name)?.get(record.externalId);if(place){record.geographyId=place;break;}}}
    const begin=performance.now(),result=await geographic.changeGeography(EARTH.owner,EARTH.world,{action:"import",surfaceId:EARTH.surface,mapId:EARTH.map,timelineId:EARTH.timeline,source});
    assert.ok("identities" in result&&result.identities);assert.equal(result.identities.length,source.records.length);assert.ok("created" in result);created+=result.created;
    const namespace=sha(canonical({provider:source.provenance.provider,dataset:source.provenance.dataset}));
    const saved=(await pool.query('select gf.external_id,gf.id,gf.geography_id,v.geometry,v.properties,gd.provenance from world_geo_feature gf join world_geo_version v on v.feature_id=gf.id and v.revision=1 join world_geo_dataset gd on gd.id=v.dataset_id where gf.world_id=$1 and gf.surface_id=$2 and gf.namespace=$3 and gf.external_id=any($4::text[])',[EARTH.world,EARTH.surface,namespace,source.records.map(r=>r.externalId)])).rows;
    assert.equal(saved.length,source.records.length);for(const [i,record] of source.records.entries()){const old=saved.find(r=>r.external_id===record.externalId);assert.equal(old.id,result.identities[i]);assert.equal(sha(canonical(old.geometry)),batch.records[i].geometrySha256);assert.deepEqual(old.properties,record.properties);assert.equal(old.provenance.fileSha256,source.provenance.fileSha256);}
    results.push({batch:index,layer:batch.layer,records:source.records.length,created:result.created,identities:result.identities,durationMs:performance.now()-begin});
    await writeFile(progressFile,JSON.stringify({target:target.name,planSha256:plan.planSha256,completedBatches:results.length,totalBatches:plan.batches.length,complete:results.length===plan.batches.length,created,results,durationMs:performance.now()-start},null,2));
    if(earlier.length||batch.dataset==="Admin 0 Countries 1:110m")await refreshPlaces();
    console.log(`PASS ${target.name} batch ${index+1}/${plan.batches.length} ${batch.layer}: ${source.records.length} identities, ${result.created} created`);
  }
  await verifyEarth(pool);return {created,results,plan,durationMs:performance.now()-start};
}
export async function earthCoverage(pool:pg.Pool,plan:ImportPlan){
  const layers=[];for(const layer of plan.sources){const namespace=sha(canonical({provider:"Natural Earth",dataset:layer.dataset})),rows=(await pool.query('select gf.external_id,gf.id,gf.geography_id,v.geometry from world_geo_feature gf join world_geo_version v on v.feature_id=gf.id and v.revision=1 where gf.world_id=$1 and gf.surface_id=$2 and gf.namespace=$3 order by gf.external_id',[EARTH.world,EARTH.surface,namespace])).rows as {external_id:string;id:string;geography_id:string;geometry:SourceGeometry}[];
    const expected=plan.batches.filter(b=>b.layer===layer.layer).flatMap(b=>b.records);assert.deepEqual(rows.map(r=>r.external_id).sort(),expected.map(r=>r.externalId).sort());
    const count=rows.reduce((sum,r)=>sum+coordinateCount(r.geometry),0),components=rows.reduce((sum,r)=>sum+geometryParts(r.geometry).length,0);assert.equal(count,layer.sourceCoordinates);assert.equal(components,layer.sourceComponents);
    const sourceRows=new Set(expected.map(r=>r.sourceRow));assert.equal(sourceRows.size,layer.sourceRows);
    layers.push({...layer,importedIdentities:rows.length,importedSourceRows:sourceRows.size,importedComponents:components,importedCoordinates:count,missingIdentities:[],duplicateIdentities:[]});
  }
  const countries=(await pool.query("select gf.external_id,count(distinct gf.geography_id)::int places from world_geo_feature gf join world_geo_version v on v.feature_id=gf.id and v.revision=1 join world_geo_dataset d on d.id=v.dataset_id where gf.world_id=$1 and gf.surface_id=$2 and d.provenance->>'dataset' in ('Admin 0 Countries 1:110m','Admin 0 Countries 1:50m','Admin 0 Countries 1:10m') group by gf.external_id",[EARTH.world,EARTH.surface])).rows;assert.ok(countries.every(r=>r.places===1));assert.equal(countries.length,258);
  return {planSha256:plan.planSha256,layers,distinctCountryPlaces:countries.length,exactSourceCoordinates:true,originalSampleIdentitiesPreserved:true,sourceLimitations:["Natural Earth is generalized overview/regional geography, not every islet or a survey.","Admin-0 source rows include dependencies and de facto interpretations, not a count of recognized sovereign states.","Provider flags northern Russia and southern Chile coastline accuracy; editions are not a live political feed.","Lakes, rivers, elevation, cities, subdivisions and dated political/geographic reconstructions remain later passes."]};
}
async function main(){const url=new URL(process.env.DATABASE_URL!);assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));assert.equal(url.pathname,`/${process.env.SERRIAN_GEO_B_AUTHORIZED_TARGET}`);const pool=new pg.Pool({connectionString:url.toString()});try{await importEarth(pool,process.argv[2],process.argv[3]?Number(process.argv[3]):Infinity);}finally{await pool.end();const application=await import("../src/db");await application.pool.end();}}
if(process.argv[1]?.endsWith("worlds-geo-b-import.ts"))main().catch(e=>{console.error(e);process.exitCode=1;});
