/** Author old-schema fixture records with the published pre-0158 producer.
 * Current services and every current assertion run after the real upgrade.
 * No application/schema shim, disabled trigger or shared target is used. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {access,copyFile,mkdir,readFile,symlink,writeFile} from "node:fs/promises";
import path from "node:path";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";

const commit="88704f86fea5534513139e942e9c54e63f2d1691";
export async function seedLegacyAtlas(f:RegionalFixture,kind:"town"|"underground"|"templates"){
 const url=new URL(f.databaseUrl),out=path.resolve(f.out),root=path.resolve(f.root);
 assert.equal(url.hostname,"127.0.0.1");assert.notEqual(url.port,"5432");
 assert.ok(out.startsWith(path.resolve("artifacts/collaboration-s7b-") ));
 assert.ok(root.startsWith(path.join(out,"owned-temp")+path.sep));
 assert.equal(path.resolve(f.data),path.join(root,"data"));
 assert.ok((await f.pool.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n<158);
 const storage=path.resolve("artifacts/collaboration-s7b-checkpoint-legacy-seeder-88704-lf"),source=path.join(storage,"source");
 if(!await access(path.join(storage,"ready.json")).then(()=>true,()=>false)){
  await mkdir(source,{recursive:true});
  const inventory=execFileSync("git",["ls-tree","-r","--name-only",commit],{encoding:"utf8",windowsHide:true}).trim().split(/\r?\n/);
  const sql=inventory.filter(file=>/^drizzle\/\d{4}_[^/]+\.sql$/.test(file)),archive=path.join(storage,"source.tar");
  execFileSync("git",["-c","core.autocrlf=false","-c","core.eol=lf","archive","--format=tar","--output",archive,commit,"src","scripts","data","public","package.json","tsconfig.json","drizzle/meta/_journal.json",...sql],{windowsHide:true});
  execFileSync("tar",["-xf",archive,"-C",source],{windowsHide:true});
  const blobs=execFileSync("git",["ls-tree","-r","--format=%(objectname)%x09%(path)",commit,"--","src","data","public","package.json","tsconfig.json"],{encoding:"utf8",windowsHide:true}).trim().split(/\r?\n/);
  for(const row of blobs){const [sha,file]=row.split("\t"),bytes=await readFile(path.join(source,file));assert.equal(createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex"),sha,"Legacy application source must match its published Git blob: "+file);}
  const sqlBlobs=(revision:string)=>new Map(execFileSync("git",["ls-tree","-r","--format=%(path)%x09%(objectname)",revision,"--","drizzle"],{encoding:"utf8",windowsHide:true}).trim().split(/\r?\n/).map(row=>{const [file,sha]=row.split("\t");return [file,sha] as const;}));
  const oldSql=sqlBlobs(commit),publishedSql=sqlBlobs("9ff9dd1c22b4e21e343c141dd5ecc8c07e85c4bf");
  for(const file of sql){assert.equal(oldSql.get(file),publishedSql.get(file),"Every legacy SQL source remains published unchanged: "+file);await copyFile(file,path.join(source,file));assert.ok((await readFile(path.join(source,file))).equals(await readFile(file)),"Use the exact protected working SQL bytes applied by the fixture: "+file);}
  assert.equal(await access(path.join(source,".env.local")).then(()=>true,()=>false),false);
  await symlink(path.resolve("node_modules"),path.join(source,"node_modules"),"junction");
  const templateFile=path.join(source,"scripts/worlds-templates-disposable.test.ts"),template=await readFile(templateFile,"utf8"),entry=template.lastIndexOf("\nmain().catch");
  assert.ok(entry>0);await writeFile(templateFile,template.slice(0,entry)+"\nexport {before as legacyBefore};\n");
  const undergroundFile=path.join(source,"scripts/worlds-underground-disposable.test.ts"),underground=await readFile(undergroundFile,"utf8"),undergroundEntry=underground.lastIndexOf("\nwithRegionalEditingFixture(");
  assert.ok(undergroundEntry>0);await writeFile(undergroundFile,underground.slice(0,undergroundEntry)+"\nexport {before as legacyBefore};\n");
  await writeFile(path.join(storage,"ready.json"),JSON.stringify({commit,applicationSourcesUnmodified:true,applicationSourceFilesVerified:blobs.length,sqlBytesMatchCurrentPublished:true,onlyTestEntryAdapters:true,noEnvironmentFiles:true},null,2));
 }
 assert.equal(JSON.parse(await readFile(path.join(storage,"ready.json"),"utf8")).commit,commit);
 const packet=path.join(out,`legacy-${kind}-fixture.json`),child=path.join(source,"scripts/checkpoint-legacy-bootstrap.mts");
 await writeFile(packet,JSON.stringify({...f,pool:undefined,runPostgres:undefined,kind},null,2));
 await writeFile(child,`import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';import pg from 'pg';
 const f=JSON.parse(await readFile(process.argv[2],'utf8')),u=new URL(f.databaseUrl);assert.equal(u.hostname,'127.0.0.1');assert.notEqual(u.port,'5432');assert.ok(path.resolve(f.root).startsWith(path.join(path.resolve(f.out),'owned-temp')+path.sep));
 process.env.DATABASE_URL=f.databaseUrl;process.env.SERRIAN_TERRAIN_ROOT=f.terrainRoot;process.env.SERRIAN_ASSET_ROOT=path.join(f.root,'private-artwork');f.pool=new pg.Pool({connectionString:f.databaseUrl});f.runPostgres=(name,args)=>{assert.equal(name,'pg_dump');execFileSync(path.join('C:/Program Files/PostgreSQL/18/bin',name+'.exe'),args,{windowsHide:true,stdio:'pipe',maxBuffer:32*1024*1024});};
 try{if(f.kind==='town')await(await import('./worlds-town-maps-disposable.test.ts')).townMapDatabase(f);else if(f.kind==='underground')await(await import('./worlds-underground-disposable.test.ts')).legacyBefore(f);else{assert.equal(f.kind,'templates');await(await import('./worlds-templates-disposable.test.ts')).legacyBefore(f);}}
 finally{await f.pool.end();const {pool}=await import('../src/db/index.ts');if(!pool.ended)await pool.end();}
 `);
 const text=execFileSync(process.execPath,["--conditions=react-server","--import","tsx",child,packet],{cwd:source,env:{...process.env,DATABASE_URL:f.databaseUrl,SERRIAN_TERRAIN_ROOT:f.terrainRoot,SERRIAN_ASSET_ROOT:path.join(f.root,"private-artwork"),SERRIAN_REGIONAL_EDIT_EVIDENCE:out},windowsHide:true,encoding:"utf8",maxBuffer:32*1024*1024});
 await writeFile(path.join(out,`legacy-${kind}-producer.log`),text);
 await copyFile(path.join(storage,"ready.json"),path.join(out,`legacy-${kind}-producer.json`));
 process.env.SERRIAN_ASSET_ROOT=path.join(f.root,"private-artwork");
}
