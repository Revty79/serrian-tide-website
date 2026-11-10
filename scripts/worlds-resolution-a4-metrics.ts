import type {Page} from "playwright-core";
/** Actual browser/application observations, not hardware suitability claims. */
export async function resolutionMetrics(page:Page,name:string){
 const cdp=await page.context().newCDPSession(page);try{await cdp.send("Performance.enable");const {metrics}=await cdp.send("Performance.getMetrics"),{targetInfos}=await cdp.send("Target.getTargets");return{name,observedAt:new Date().toISOString(),browserMetrics:Object.fromEntries(metrics.filter((m:{name:string})=>["JSHeapUsedSize","JSHeapTotalSize","TaskDuration","ScriptDuration","LayoutDuration"].includes(m.name)).map((m:{name:string;value:number})=>[m.name,m.value])),workerTargets:targetInfos.filter((t:{type:string})=>["worker","shared_worker"].includes(t.type)).length,canvas:await page.getByLabel("Terrain map canvas",{exact:true}).evaluate(c=>({...c.dataset})),testProcessPeakRssBytes:process.resourceUsage().maxRSS*1024,browserHeapIsSnapshotNotPeak:true};}finally{await cdp.detach();}
}
