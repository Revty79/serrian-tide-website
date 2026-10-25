import type {checkPass2Browser} from "./worlds-atlas-pass2-browser-checks";
export async function checkPass3Browser(options:Parameters<typeof checkPass2Browser>[0]){
 if(process.env.SERRIAN_PASS3_GENERATION_ONLY!=="1")await (await import("./worlds-atlas-pass2-browser-checks")).checkPass2Browser(options);
 await (await import("./worlds-terrain-generation-browser-checks")).checkGenerationBrowser(options);
}
