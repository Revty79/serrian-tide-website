// Read-only planning for a positively identified, already-running legacy source.
// The caller must first verify container identity and exact protected env values.
// Normal preflight/startup never calls this planner; its candidate must pass origins().
import {isIP as bootstrapIP} from "node:net";
import {networkInterfaces as bootstrapInterfaces} from "node:os";

function localAddress(address){
 if(bootstrapIP(address)!==4)return false;
 const [a,b]=address.split(".").map(Number);
 return a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168);
}
function legacyPublicAddress(address){
 if(bootstrapIP(address)!==4||localAddress(address))return false;
 const [a,b]=address.split(".").map(Number);
 return a!==0&&a!==127&&a<224&&!(a===169&&b===254)&&!(a===100&&b>=64&&b<=127)&&!(a===198&&(b===18||b===19));
}
export function bootstrapAuthPlan(env,validate,interfaces=bootstrapInterfaces()){
 let failure;
 try{const auth=validate(env,interfaces);return {transition:false,originalBase:auth.base,candidate:auth};}catch(error){failure=error;}
 let legacy;try{legacy=new URL(env.BETTER_AUTH_URL??"");}catch{throw failure;}
 if(legacy.origin!==env.BETTER_AUTH_URL||legacy.username||legacy.password||legacy.protocol!=="http:"||legacy.port!=="3003"||!legacyPublicAddress(legacy.hostname))throw failure;
 const assigned=new Set(Object.values(interfaces).flatMap(entries=>entries??[]).filter(entry=>entry.family==="IPv4"&&entry.internal===false&&localAddress(entry.address)).map(entry=>entry.address));
 const trusted=(env.BETTER_AUTH_TRUSTED_ORIGINS??"").split(",").map(value=>value.trim()).filter(Boolean);
 const local=trusted.filter(value=>{try{const u=new URL(value);return u.origin===value&&!u.username&&!u.password&&u.protocol==="http:"&&u.port==="3003"&&assigned.has(u.hostname);}catch{return false;}});
 // Never infer a tunnel's availability or add a new trusted origin. The first
 // explicitly configured assigned LAN origin is stable even when a tunnel expires.
 if(!local.length)throw Error("BOOTSTRAP_AUTH_LOCAL_REQUIRED");
 const candidate=validate({...env,BETTER_AUTH_URL:local[0]},interfaces);
 return {transition:true,originalBase:legacy.origin,candidate};
}
