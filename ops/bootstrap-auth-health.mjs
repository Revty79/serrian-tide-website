// Anonymous checks of the real new application's auth routes. No account,
// password, session token or cookie jar is ever supplied or retained.
import {origins} from "./host-probe.mjs";
import {randomUUID} from "node:crypto";

export async function checkBootstrapAuthentication(env=process.env,deniedLegacyOrigin=null){
 const auth=origins(env),allowed=[...new Set([auth.base,...auth.trusted])];
 const denied="https://bootstrap-"+randomUUID()+".invalid";
 async function request(route,origin,body,expected){
  const headers={Host:new URL(auth.base).host};
  if(body!==undefined){headers["Content-Type"]="application/json";headers.Cookie="serrian_bootstrap_canary=1";}
  if(origin!==null)headers.Origin=origin;
  const response=await fetch("http://127.0.0.1:3003/api/auth/"+route,{method:body===undefined?"GET":"POST",headers,...body===undefined?{}:{body:JSON.stringify(body)},redirect:"manual",signal:AbortSignal.timeout(10000)});
  if(response.status!==expected)throw Error("BOOTSTRAP_AUTH_HEALTH");
  return response.json();
 }
 if(await request("get-session",auth.base,undefined,200)!==null)throw Error("BOOTSTRAP_AUTH_HEALTH");
 // The unrelated canary cookie forces normal CSRF origin validation. It is not
 // an authentication cookie, so sign-out cannot find/delete any user's session.
 for(const origin of allowed)if((await request("sign-out",origin,{},200)).success!==true)throw Error("BOOTSTRAP_AUTH_HEALTH");
 for(const origin of [denied,null,...deniedLegacyOrigin?[deniedLegacyOrigin]:[]])await request("sign-out",origin,{},403);
 await request("sign-out",auth.base,{callbackURL:denied+"/return"},403);
 return {passed:true,anonymousOnly:true,configuredOriginsChecked:allowed.length,csrfEnforced:true,accountCredentialsUsed:false,externalTunnelReachabilityChecked:false};
}
if(process.argv.includes("--auth-health")){
 let input="";for await(const chunk of process.stdin)input+=chunk;
 Promise.resolve().then(()=>checkBootstrapAuthentication(process.env,JSON.parse(input||"{}").deniedLegacyOrigin??null)).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error("HOST_PROBE_FAILED: BOOTSTRAP_AUTH_HEALTH");process.exitCode=1;});
}
