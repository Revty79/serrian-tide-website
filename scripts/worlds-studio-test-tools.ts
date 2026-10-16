import type {Page} from "playwright-core";
/** Open an optional panel through the same More tools menu used by a creator. */
export async function openStudioSection(page:Page,name:string){
 await page.getByRole("region",{name:"Map Studio",exact:true}).waitFor();
 const nav=page.getByRole("navigation",{name:"Studio tools",exact:true});
 if(!await nav.isVisible()){
  const more=page.getByRole("button",{name:"More tools",exact:true});
  if(await more.count()&&await more.getAttribute("aria-expanded")!=="true")await more.click();
  const menu=page.getByText("Choose map tools",{exact:true});
  await menu.waitFor({state:"visible"});if(!await menu.evaluate(el=>el.parentElement?.hasAttribute("open")))await menu.click();
 }
 await nav.waitFor({state:"visible"});
 await nav.getByRole("button",{name,exact:true}).click();
}
