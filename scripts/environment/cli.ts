import path from "node:path";
import {createServer} from "node:http";
import {EnvironmentError,requireCondition} from "./model";
import {keygen,trustKey} from "./private-files";
import {loadProfile,inspectEnvironment,backupEnvironment,verifySnapshotArchive} from "./snapshot";
import {restoreEnvironment,checkRestored} from "./restore";
import {sealSnapshot,openSnapshot} from "./transfer";
import {secretgen,isolateDevelopment,migrateCandidate,prepareCutover,startEnvironment} from "./operations";
export const HELP=`Serrian Tide environment manager (no implicit .env or shared target)
  keygen --key-file FILE --trust-file FILE
  secretgen --environment ID --out FILE
  inspect --profile FILE
  backup --profile FILE --destination NEW_DIR --key-file FILE --operator NAME --frozen ALL_APPLICATION_JOB_IMPORT_AND_DIRECT_WRITERS_STOPPED
  verify --profile FILE --snapshot DIR
  seal --snapshot DIR --key-file FILE --out NEW_FILE
  open --archive FILE --key-file FILE --destination NEW_DIR
  restore --profile FILE --snapshot DIR --key-file FILE --confirm ENVIRONMENT/DATABASE [--precreated-empty true] [--resume true]
  check --profile FILE
  isolate-dev --profile FILE --key-file FILE --confirm ENVIRONMENT/DATABASE
  migrate --profile FILE --snapshot PRE_MIGRATION_BACKUP --key-file FILE --confirm ENVIRONMENT/DATABASE --frozen ALL_APPLICATION_JOB_IMPORT_AND_DIRECT_WRITERS_STOPPED
  prepare-cutover --profile FILE --snapshot PROMOTED_DIR --rollback-snapshot FORMER_PRODUCTION_DIR --key-file FILE --out NEW_PLAN --operator NAME
  start --profile FILE [--port 3000] [--listen 127.0.0.1] [--plan FILE --approve-plan EXACT_SHA256]
  maintenance [--port 3000]
Private key/snapshot parents must already be protected. No command stops/deletes old environments, switches proxy/DNS traffic, creates subscriptions or copies Production secrets. Public startup itself requires explicit signed-plan approval. See docs/operations/environment-portability.md.`;
const allowed:Record<string,string[]>={keygen:["key-file","trust-file"],secretgen:["environment","out"],inspect:["profile"],backup:["profile","destination","key-file","operator","frozen"],verify:["profile","snapshot"],seal:["snapshot","key-file","out"],open:["archive","key-file","destination"],restore:["profile","snapshot","key-file","confirm","precreated-empty","resume"],check:["profile"],"isolate-dev":["profile","key-file","confirm"],migrate:["profile","snapshot","key-file","confirm","frozen"],"prepare-cutover":["profile","snapshot","rollback-snapshot","key-file","out","operator"],start:["profile","port","listen","plan","approve-plan"],maintenance:["port"]};
export async function main(args=process.argv.slice(2)){
  const cancellation=new AbortController();const cancel=()=>cancellation.abort();if(["backup","restore"].includes(args[0])){process.once("SIGINT",cancel);process.once("SIGTERM",cancel);}try{const [command,...rest]=args;if(!command||command==="help"||command==="--help"){console.log(HELP);return;}requireCondition(Object.hasOwn(allowed,command)&&rest.length%2===0,"COMMAND","Choose a documented command with --name value pairs.");const options=new Map<string,string>();for(let i=0;i<rest.length;i+=2){const name=rest[i].slice(2);requireCondition(rest[i].startsWith("--")&&allowed[command].includes(name)&&!options.has(name)&&rest[i+1]&&!rest[i+1].startsWith("--"),"COMMAND","An option is missing, duplicated or unsupported.");options.set(name,rest[i+1]);}
    const get=(key:string)=>{const value=options.get(key);requireCondition(value,"COMMAND","A required command option is missing: "+key);return value;},file=(key:string)=>path.resolve(get(key)),flag=(key:string)=>{const v=options.get(key);requireCondition(v===undefined||v==="true"||v==="false","COMMAND","Boolean options require true or false.");return v==="true";};let result:unknown;
    if(command==="keygen")result=await keygen(file("key-file"),file("trust-file"));
    else if(command==="secretgen")result=await secretgen(file("out"),get("environment"));
    else if(command==="seal")result=await sealSnapshot(file("snapshot"),file("key-file"),file("out"));
    else if(command==="open")result=await openSnapshot(file("archive"),file("key-file"),file("destination"));
    else if(command==="maintenance"){const port=Number(options.get("port")??process.env.PORT??3000);requireCondition(Number.isInteger(port)&&port>=1024&&port<=65535,"LISTEN_CONTEXT","Choose a supported maintenance port.");const server=createServer((request,response)=>{const healthy=request.method==="GET"&&request.url==="/health";response.writeHead(healthy?200:503,{"Content-Type":"application/json","Cache-Control":"no-store","Retry-After":"300"});response.end(JSON.stringify({status:"maintenance",applicationRunning:false}));});await new Promise<void>(resolve=>server.listen(port,"0.0.0.0",resolve));console.log(JSON.stringify({maintenance:true,applicationRunning:false,port}));return;}
    else{const p=await loadProfile(file("profile"));
      if(command==="inspect")result=await inspectEnvironment(p);
      else if(command==="backup")result=await backupEnvironment(p,file("destination"),file("key-file"),get("operator"),get("frozen"),cancellation.signal);
      else if(command==="verify"){const m=await verifySnapshotArchive(p,file("snapshot"),await trustKey(p.application.trustFile));result={verified:true,snapshotId:m.snapshotId,files:m.files.length,tables:m.database.tables.length};}
      else if(command==="restore")result=await restoreEnvironment(p,file("snapshot"),file("key-file"),get("confirm"),{precreatedEmpty:flag("precreated-empty"),resume:flag("resume"),signal:cancellation.signal});
      else if(command==="check")result=await checkRestored(p);
      else if(command==="isolate-dev")result=await isolateDevelopment(p,file("key-file"),get("confirm"));
      else if(command==="migrate")result=await migrateCandidate(p,file("key-file"),file("snapshot"),get("confirm"),get("frozen"));
      else if(command==="prepare-cutover")result=await prepareCutover(p,file("snapshot"),file("rollback-snapshot"),file("key-file"),file("out"),get("operator"));
      else if(command==="start"){process.exitCode=await startEnvironment(p,Number(options.get("port")??process.env.PORT??3000),options.get("listen")??"127.0.0.1",options.has("plan")?file("plan"):undefined,options.get("approve-plan"));return;}
    }console.log(JSON.stringify(result));
  }catch(error){if(error instanceof EnvironmentError)console.error(error.code+": "+error.message);else console.error("OPERATION_FAILED: The operation is incomplete. Keep the original and partial candidate unchanged; use the documented recovery/preflight procedure. Database/tool diagnostics are not printed because they can contain private records or credentials.");process.exitCode=1;}finally{process.removeListener("SIGINT",cancel);process.removeListener("SIGTERM",cancel);}
}
