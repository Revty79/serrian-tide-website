import type {Page} from "playwright-core";
/** Equal drawing work for both published control and candidate after toolbar layout changes. */
export async function matchedCpuCanvas(page:Page){
 if(process.env.SERRIAN_FREEFORM_PASS!=="1")return;
 await page.addStyleTag({content:'canvas[aria-label="Terrain map canvas"]{width:1200px!important;height:600px!important;max-width:none!important;flex:none!important}'});
 await page.getByRole("button",{name:"Fit map",exact:true}).click();
}
