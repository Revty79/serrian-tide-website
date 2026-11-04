const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Open a saved Atlas view without navigating away from the current unfinished workspace. */
export function atlasBrowseUrl(worldId:string,target:string,sourceMapId:string,review=false){
 if(!uuid.test(worldId))return;
 const q=new URLSearchParams({tab:"atlas"}),parts=target.split(":");
 if(parts[0]==="town"&&uuid.test(parts[1]??"")&&parts.length<=3){if(parts[2]&&!uuid.test(parts[2]))return;q.set("townMap",parts[1]);const source=parts[2]||sourceMapId;if(uuid.test(source))q.set("townReturnMap",source);}
 else if(parts[0]==="underground"&&parts.length===2&&uuid.test(parts[1]??""))q.set("undergroundLevel",parts[1]);
 else if(parts[0]==="crafts"&&parts.length===2&&parts[1]===""){q.set("craftLibrary","1");if(uuid.test(sourceMapId))q.set("craftReturnMap",sourceMapId);}
 else if(parts[0]==="craft"&&parts.length<=3&&uuid.test(parts[1]??"")&&(!parts[2]||uuid.test(parts[2]))){q.set("craft",parts[1]);if(parts[2])q.set("craftDeck",parts[2]);if(uuid.test(sourceMapId))q.set("craftReturnMap",sourceMapId);}
 else if(uuid.test(target))q.set("terrainMap",target);
 else return;
 if(review)q.set("review","1");return `/worlds/${encodeURIComponent(worldId)}?${q}`;
}
