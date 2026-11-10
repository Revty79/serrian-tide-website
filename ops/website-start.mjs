// This is ordinary website startup. Environment-management startup remains separate.
import {spawn} from "node:child_process";
import {verifyBuild} from "./stamp-build.mjs";
const run=args=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:"inherit"});child.on("error",reject);child.on("exit",code=>code===0?resolve():reject(Error("WEBSITE_PREFLIGHT")));});
async function main(){
 await verifyBuild(process.cwd(),process.env.SERRIAN_RELEASE_COMMIT??"");
 const smoke=process.argv.includes("--smoke"),port=Number(process.env.PORT??3000),listen=smoke?"0.0.0.0":process.env.SERRIAN_WEBSITE_LISTEN??"0.0.0.0";
 if(!Number.isInteger(port)||port<1024||port>65535||!["127.0.0.1","0.0.0.0","::"].includes(listen))throw Error("LISTEN");
 if(smoke){process.env.DATABASE_URL="postgresql://smoke:unused@127.0.0.1:1/no_production_access";process.env.BETTER_AUTH_URL=`http://127.0.0.1:${port}`;process.env.BETTER_AUTH_SECRET="synthetic-startup-only-no-production-credentials";delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;}
 else{delete process.env.SERRIAN_PROBE_READ_ONLY_ROOTS;await run(["--conditions=react-server","--import","tsx","ops/website-check.ts","--check"]);}
 const child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname",listen,"--port",String(port)],{env:{...process.env,NODE_ENV:"production"},stdio:"inherit"});
 for(const signal of["SIGTERM","SIGINT"])process.on(signal,()=>child.kill(signal));child.on("error",()=>{process.exitCode=1;});child.on("exit",code=>{process.exitCode=code??1;});
}
main().catch(()=>{console.error("WEBSITE_START_REFUSED: review the protected deployment diagnostics; accepted data and environment-management commands are unchanged.");process.exitCode=1;});
