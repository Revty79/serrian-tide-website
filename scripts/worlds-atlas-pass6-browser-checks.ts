import type {checkPass5Browser} from "./worlds-atlas-pass5-browser-checks";
export async function checkPass6Browser(options:Parameters<typeof checkPass5Browser>[0]){
 if(process.env.SERRIAN_PASS6_FOCUSED!=="1")await (await import("./worlds-atlas-pass5-browser-checks")).checkPass5Browser(options);
 if(process.env.SERRIAN_PASS6_DEVICES_ONLY!=="1")await (await import("./worlds-terrain-measurement-browser-checks")).checkMeasurementBrowser(options);
 await (await import("./worlds-terrain-measurement-device-checks")).checkMeasurementDevices(options);
}
