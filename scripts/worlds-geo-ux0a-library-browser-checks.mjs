/** Sequential owned-runtime checks; performance is deliberately measured in a separate quiet run. */
import {execFileSync} from "node:child_process";
import {mkdirSync,openSync,closeSync,writeFileSync} from "node:fs";
import path from "node:path";
const directory=path.resolve("artifacts/guidance/geo-ux0a"),checks=[
 ["final-journeys","worlds-geo-ux0a-library-journeys.ts"],
 ["final-loading","worlds-geo-ux0a-lazy-artwork-browser.ts","--full-library"],
 ["final-compatibility","worlds-geo-ux0a-view-compatibility.ts","--full-library"],
 ["final-layout","worlds-geo-ux0a-layout-browser.ts","--full-library"],
 ["final-pinch","worlds-geo-ux0a-pinch-browser.ts","--full-library"],
 ["final-recovery","worlds-geo-ux0a-recovery-browser.ts","--performance-regression","--full-library"],
 ["final-scientific-setup","worlds-geo-ux0a-scientific-recovery-setup.ts"],
 ["final-scientific-recovery","worlds-geo-ux0a-scientific-recovery-browser.ts","--full-library"],
];
mkdirSync(directory,{recursive:true});const results=[];
for(const [name,file,...args] of checks){const log=openSync(path.join(directory,`library-${name}.log`),"w");try{console.log(`Checking ${name}`);execFileSync(process.execPath,["--conditions=react-server","--import","tsx",`scripts/${file}`,...args],{windowsHide:true,env:{...process.env,SERRIAN_UX0A_CHECKOUT:"runtime-checkout-library"},stdio:["ignore",log,log]});results.push({name,passed:true});console.log(`PASS ${name}`);}catch(error){console.error(`FAIL ${name}: inspect library-${name}.log`);results.push({name,passed:false});throw error;}finally{closeSync(log);writeFileSync(path.join(directory,"library-browser-checks-results.json"),JSON.stringify({passed:results.length===checks.length&&results.every(r=>r.passed),results},null,2));}}
