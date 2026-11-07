import { projectWorldContent } from "@/features/worlds/world-content-projection";
import { notFound, redirect } from "next/navigation";
import { normalizeWorldsQuery } from "@/features/worlds/atlas-availability";
import { requireWorldsAccessContext } from "@/lib/server-access";
import { getWorld, listWorlds, scopedWorldReferences, WorldError } from "@/features/worlds/world-service";
import { getCalendars } from "@/features/worlds/calendar-service";
import { WorldWorkspace } from "@/features/worlds/world-workspace";
import { withWorldPageAuthority } from "@/features/worlds/world-page-authority";
import { listSharedWorlds } from "@/features/worlds/world-shared-registry-service";
export const dynamic = "force-dynamic";
export const metadata = { title: "World Workshop | Serrian Tide" };
export default async function WorldPage({ params, searchParams }: { params: Promise<{ worldId: string }>; searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const access = await requireWorldsAccessContext();
  const rawQuery=await searchParams, original=new URLSearchParams();
  for(const [key,value] of Object.entries(rawQuery))for(const item of Array.isArray(value)?value:value===undefined?[]:[value])original.append(key,item);
  const normalized=normalizeWorldsQuery(original);
  const worldId = (await params).worldId;
  if(normalized.toString()!==original.toString())redirect(`/worlds/${worldId}${normalized.size?`?${normalized}`:""}`);
  // Match URLSearchParams.get in the client, including repeated context keys.
  const query={review:normalized.get("review"),timeline:normalized.get("timeline"),knowledge:normalized.get("knowledge"),ordinary:normalized.get("ordinary"),tab:normalized.get("tab")};
  const review = access.roles.includes("admin") && query.review === "1";
  const ordinary=query.knowledge==="ordinary"||query.ordinary==="1";
  if(query.review==="1"&&!access.roles.includes("admin"))notFound();
  return withWorldPageAuthority(access.session,review,async()=>{
  const loaded = await getWorld(access.session.user.id, worldId, review,query.timeline,ordinary).catch((error) => { if (error instanceof WorldError && error.status === 404) notFound(); throw error; });
  const bundle=projectWorldContent(loaded,loaded.permission!);
  const scopes=bundle.permission!.scopes;
  const [worlds, shared, tags, calendars] = await Promise.all([review?[bundle.world]:listWorlds(access.session.user.id,"mine"),review?[]:listSharedWorlds(access.session.user.id),scopes.includes("overview")?scopedWorldReferences(access.session.user.id,worldId,review):[],(query.tab==="chronology"||query.tab==="calendars")&&scopes.includes("timekeeping")?getCalendars(access.session.user.id,worldId,review,ordinary,bundle.selectedTimeline.id):undefined]);
  const navigation=[...worlds,...shared];if(!navigation.some(item=>item.id===worldId))navigation.unshift(bundle.world);
  return <WorldWorkspace key={worldId} initialBundle={bundle} initialOrdinary={ordinary} initialCalendars={calendars?projectWorldContent(calendars,bundle.permission!):undefined} worlds={navigation.map(({id,name,archived})=>({id,name,archived}))} tags={tags} review={review} />;
  });
}
