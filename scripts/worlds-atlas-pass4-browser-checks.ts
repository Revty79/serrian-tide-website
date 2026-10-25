import type {checkPass3Browser} from "./worlds-atlas-pass3-browser-checks";
export async function checkPass4Browser(options:Parameters<typeof checkPass3Browser>[0]){
 if(process.env.SERRIAN_PASS4_FOCUSED!=="1")await (await import("./worlds-atlas-pass3-browser-checks")).checkPass3Browser(options);
 await (await import("./worlds-terrain-sculpting-browser-checks")).checkSculptingBrowser(options);
}
