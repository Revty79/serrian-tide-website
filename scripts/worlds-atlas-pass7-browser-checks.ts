import type {checkPass6Browser} from "./worlds-atlas-pass6-browser-checks";
export async function checkPass7Browser(options:Parameters<typeof checkPass6Browser>[0]){
 if(process.env.SERRIAN_PASS7_FOCUSED!=="1")await (await import("./worlds-atlas-pass6-browser-checks")).checkPass6Browser(options);
 // Full Pass 7 browser acceptance is added after the persistent numerical checkpoint.
}
