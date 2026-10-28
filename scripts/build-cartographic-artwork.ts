/** Offline reproducible publication of the original vector masters. */
import {mkdir,writeFile} from "node:fs/promises";
import {ART_ASSETS,ART_PACKS,assetColors} from "../src/features/worlds/terrain-artwork-assets";
async function main(){
const out="public/worlds/cartography/v1";await mkdir(out,{recursive:true});
for(const a of ART_ASSETS){const colors=assetColors(a.pack,"natural",a.key),paths=a.paths.map(p=>`<path d="${p.d}" fill="${p.stroke?"none":colors[p.role]}" stroke="${p.stroke?colors[p.role]:a.pack==="fantasy"?colors.ink:"none"}" stroke-width="${p.stroke?p.width:a.pack==="fantasy"?.8:0}" stroke-linejoin="round" stroke-linecap="round"/>`).join("");await writeFile(`${out}/${a.pack}.${a.key}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 96" width="128" height="96"><title>${a.name}</title>${paths}</svg>\n`);}
await writeFile(`${out}/manifest.json`,JSON.stringify({version:1,license:"CC0-1.0",source:"Original authored vector masters in terrain-artwork-assets.ts",packs:ART_PACKS,assets:ART_ASSETS.map(({paths,...a})=>({...a,pathCount:paths.length}))},null,2)+"\n");
await writeFile(`${out}/LICENSE.txt`,"CC0 1.0 Universal\nOriginal cartographic vector masters authored for Serrian Tide Atlas.\nTo the extent possible under law, the authors waive copyright and related rights in these cartographic vector assets under CC0 1.0 Universal. No attribution is required.\nhttps://creativecommons.org/publicdomain/zero/1.0/\nThe dedication applies only to the vector artwork in this directory, not the application, trademarks or other assets.\n");
console.log(`Bundled ${ART_ASSETS.length} original versioned assets in ${Object.keys(ART_PACKS).length} packs.`);

}
main().catch(error=>{console.error(error);process.exitCode=1;});
