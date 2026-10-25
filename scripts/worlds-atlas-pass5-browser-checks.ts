import type {checkPass4Browser} from "./worlds-atlas-pass4-browser-checks";
export async function checkPass5Browser(options:Parameters<typeof checkPass4Browser>[0]){
 if(process.env.SERRIAN_PASS5_FOCUSED!=="1")await (await import("./worlds-atlas-pass4-browser-checks")).checkPass4Browser(options);
 await (await import("./worlds-terrain-physical-browser-checks")).checkPhysicalBrowser(options);
}
