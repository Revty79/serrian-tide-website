import {terrainSettingsSchema} from "../src/features/worlds/terrain";
export const environmentFixtureId="4c000000-0000-4000-8000-000000000001";
export const environmentFixtureSettings=terrainSettingsSchema.parse({widthKm:2000,heightKm:1400,gridWidth:256,gridHeight:256,wrap:true});
/** Separate environmental coverage fixture. Matched 3C/4 art comparisons use
 * the unchanged winding-valley fixture, never this more varied new terrain. */
export function environmentFixtureGrid(){const grid=new Int16Array(256*256);for(let y=0;y<256;y++)for(let x=0;x<256;x++){const u=x/256,v=y/256,coast=.075+.025*Math.sin(v*15)+.015*Math.sin(v*37),mountain=3200*Math.exp(-(((u-.49-.025*Math.sin(v*13))/.052)**2))*(.65+.35*Math.sin(v*8)**2),hills=150*Math.sin(u*23+v*9)*Math.sin(v*29-u*8),interior=180+mountain+hills,lake=Math.hypot((u-.69)/.03,(v-.67)/.025);grid[y*256+x]=u<coast||u>1-coast||v>.94?-120:Math.round(lake<1?45:interior);}return grid;}
