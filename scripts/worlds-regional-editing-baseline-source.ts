import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import path from "node:path";
export const baseline="e1dd2196c3309069296822c84e7fc520a11e4ec7";
export async function baselineProof(checkout:string){
 const entries=execFileSync("git",["ls-tree","-r","-z",baseline],{windowsHide:true,maxBuffer:8*1024*1024}).toString("utf8").split("\0").filter(Boolean),digest=createHash("sha256");let count=0;
 for(const entry of entries){const [header,file]=entry.split("\t");if(!/^(src|data|public)\//.test(file)&&!["package.json","package-lock.json","next.config.ts","postcss.config.mjs","tsconfig.json"].includes(file))continue;const expected=header.split(" ")[2],raw=await readFile(path.join(checkout,file)),bytes=/\.(?:tsx?|jsx?|mjs|cjs|css|json|md|txt|svg|ya?ml)$/.test(file)?Buffer.from(raw.toString("utf8").replace(/\r\n/g,"\n")):raw;if(file==="tsconfig.json"){const original=JSON.parse(execFileSync("git",["show",baseline+":"+file],{windowsHide:true,encoding:"utf8"})),generated=JSON.parse(bytes.toString("utf8"));generated.include=generated.include.filter((entry:string)=>![".next-build-gate-dev/types/**/*.ts",".next-build-gate-dev/dev/types/**/*.ts"].includes(entry));assert.deepEqual(generated,original,"Only Next's generated development type includes may differ");}else assert.equal(createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex"),expected,"Published baseline source changed: "+file);digest.update(file+"\0").update(bytes);count++;}
 return {baseline,canonicalRuntimeSha256:digest.digest("hex"),files:count,generatedDevelopmentTypeIncludeOnly:true,buildId:(await readFile(path.join(checkout,".next/BUILD_ID"),"utf8")).trim()};
}
