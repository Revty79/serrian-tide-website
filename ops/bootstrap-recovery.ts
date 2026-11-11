/** Explicit bootstrap recovery proof. Source reads only; restore always uses a new owned cluster. */
import path from "node:path";
import {readFile,writeFile,lstat,readdir,chown} from "node:fs/promises";
import {requireCondition,type EnvironmentProfile} from "../scripts/environment/model";

async function main(){
 let text="";for await(const chunk of process.stdin){text+=chunk;requireCondition(text.length<100000,"BOOTSTRAP_INPUT","Invalid recovery input.");}
 const input=JSON.parse(text),root=String(input.directory),key=path.join(root,"recovery.key.json"),trust=path.join(root,"trust.json"),snapshot=path.join(root,"snapshot"),opened=path.join(root,"opened");
 requireCondition(path.isAbsolute(root)&&/^[a-f0-9]{32}$/.test(input.runId)&&path.basename(root)===input.runId,"BOOTSTRAP_RECOVERY_PATH","Use the newly owned bootstrap recovery directory.");
 requireCondition(await readFile(path.join(root,"ownership"),"utf8")===`serrian-bootstrap:${input.runId}\n`,"BOOTSTRAP_RECOVERY_OWNER","The recovery directory is not owned by this operation.");
 const suppliedDatabaseUrl=process.env.DATABASE_URL;
 if(input.action==="restore"){
  requireCondition(!suppliedDatabaseUrl&&process.env.SERRIAN_INFRA_BOOTSTRAP_TARGET&&process.env.SERRIAN_INFRA_BOOTSTRAP_ADMIN,"BOOTSTRAP_RESTORE_CONTEXT","Restore must receive only its new cluster credentials.");
  // Existing artwork readers import the application pool. Satisfy module loading
  // with an unreachable sentinel, never a Production or implicit restore target.
  process.env.DATABASE_URL="postgresql://operator_inert:unused@127.0.0.1:1/no_implicit_database";
 }
 const {backupEnvironment,verifySnapshotArchive}=await import("../scripts/environment/snapshot");
 const {restoreEnvironment,checkRestored}=await import("../scripts/environment/restore");
 const {sealSnapshot,openSnapshot}=await import("../scripts/environment/transfer");
 const {keygen,trustKey,privatePermissions}=await import("../scripts/environment/private-files");
 await privatePermissions(root);
 const application={directory:process.cwd(),origin:input.origin,trustFile:trust,hosting:"ubuntu" as const};
 let result:unknown;
 if(input.action==="backup"){
  requireCondition(input.expected.name&&input.expected.role&&input.expected.port&&process.env.DATABASE_URL,"BOOTSTRAP_SOURCE","An explicit checked source is required.");
  process.env.SERRIAN_INFRA_BOOTSTRAP_SOURCE=process.env.DATABASE_URL;
  const profile:EnvironmentProfile={version:1,environmentId:"bootstrap-source-"+input.runId,purpose:"source",database:{urlEnv:"SERRIAN_INFRA_BOOTSTRAP_SOURCE",expectedName:input.expected.name,expectedRole:input.expected.role,expectedPort:input.expected.port,expectedHost:input.expected.host},roots:input.roots,application,reserveBytes:1024**3};
  await keygen(key,trust);
  await writeFile(path.join(root,"source-profile.json"),JSON.stringify(profile),{mode:0o600,flag:"wx"});
  const backup=await backupEnvironment(profile,snapshot,key,"Ubuntu bootstrap",input.frozen);
  const manifest=await verifySnapshotArchive(profile,snapshot,await trustKey(trust));
  requireCondition(manifest.database.migrations.length===162&&manifest.files.length===0,"BOOTSTRAP_SOURCE_CHANGED","The verified empty Atlas source changed.");
  await sealSnapshot(snapshot,key,path.join(root,"snapshot.stenv"));
  await openSnapshot(path.join(root,"snapshot.stenv"),key,opened);
  const reopened=await verifySnapshotArchive(profile,opened,await trustKey(trust));
  requireCondition(reopened.snapshotId===backup.snapshotId,"BOOTSTRAP_SNAPSHOT_PAIR","The independently opened snapshot differs.");
  result={passed:true,backup,sealed:true,independentlyOpened:true,sourceDatabase:profile.database.expectedName};
 }else if(input.action==="restore"){
  requireCondition(!suppliedDatabaseUrl,"BOOTSTRAP_RESTORE_CONTEXT","Production credentials may not enter the restore helper.");
  const source=JSON.parse(await readFile(path.join(root,"source-profile.json"),"utf8")) as EnvironmentProfile,target=path.join(root,"restored"),databaseName="serrian_bootstrap_"+input.runId;
  requireCondition(input.port!==source.database.expectedPort&&input.port>1024&&![3000,3003,5432,5433].includes(input.port),"BOOTSTRAP_RESTORE_PORT","A new independent restore listener is required.");
  const profile:EnvironmentProfile={version:1,environmentId:"bootstrap-restore-"+input.runId,purpose:"production-candidate",database:{urlEnv:"SERRIAN_INFRA_BOOTSTRAP_TARGET",adminUrlEnv:"SERRIAN_INFRA_BOOTSTRAP_ADMIN",expectedName:databaseName,expectedHost:"127.0.0.1",expectedPort:input.port,expectedRole:"postgres"},roots:{terrain:path.join(target,"terrain"),artwork:path.join(target,"artwork"),raster:path.join(target,"raster")},environmentDirectory:target,application,reserveBytes:1024**3};
  await writeFile(path.join(root,"restore-profile.json"),JSON.stringify(profile),{mode:0o600,flag:"wx"});
  const restored=await restoreEnvironment(profile,opened,key,profile.environmentId+"/"+databaseName);
  const checked=await checkRestored(profile);
  requireCondition(checked.migrations===162,"BOOTSTRAP_RESTORE_SCHEMA","The independently restored ledger is incomplete.");
  result={passed:true,independentRestore:restored,independentCheck:checked};
 }else throw Error("Unsupported bootstrap recovery operation");
 // Only newly generated operator artifacts, never the source roots or PG cluster.
 async function own(file:string){const s=await lstat(file);requireCondition(!s.isSymbolicLink(),"BOOTSTRAP_RECOVERY_LINK","Recovery artifacts may not traverse links.");if(s.isDirectory())for(const name of await readdir(file))await own(path.join(file,name));await chown(file,input.uid,input.gid);}
 for(const name of["recovery.key.json","trust.json","source-profile.json","snapshot","snapshot.stenv","opened","restore-profile.json","restored"]){const file=path.join(root,name);if(await lstat(file).then(()=>true,e=>{if(e.code==="ENOENT")return false;throw e;}))await own(file);}
 console.log(JSON.stringify(result));
}
void main().catch(error=>{const code=typeof error?.code==="string"&&/^[A-Z_]+$/.test(error.code)?error.code:"BOOTSTRAP_RECOVERY_FAILED";console.error("HOST_PROBE_FAILED: "+code);process.exitCode=1;});
