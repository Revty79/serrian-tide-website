import { notFound, redirect } from "next/navigation";
import { normalizeWorldsQuery } from "@/features/worlds/atlas-availability";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";
import { getWorld, listWorlds, worldReferences, WorldError } from "@/features/worlds/world-service";
import { getCalendars } from "@/features/worlds/calendar-service";
import { WorldWorkspace } from "@/features/worlds/world-workspace";
export const dynamic = "force-dynamic";
export const metadata = { title: "World Workshop | Serrian Tide" };
export default async function WorldPage({ params, searchParams }: { params: Promise<{ worldId: string }>; searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const access = await requireGodOrAdminAccessContext();
  const rawQuery=await searchParams, original=new URLSearchParams();
  for(const [key,value] of Object.entries(rawQuery))for(const item of Array.isArray(value)?value:value===undefined?[]:[value])original.append(key,item);
  const normalized=normalizeWorldsQuery(original);
  const worldId = (await params).worldId;
  if(normalized.toString()!==original.toString())redirect(`/worlds/${worldId}${normalized.size?`?${normalized}`:""}`);
  // Match URLSearchParams.get in the client, including repeated context keys.
  const query={review:normalized.get("review"),timeline:normalized.get("timeline"),knowledge:normalized.get("knowledge"),ordinary:normalized.get("ordinary"),tab:normalized.get("tab")};
  const review = access.roles.includes("admin") && query.review === "1";
  const ordinary=query.knowledge==="ordinary"||query.ordinary==="1";
  const bundle = await getWorld(access.session.user.id, worldId, review,query.timeline,ordinary).catch((error) => { if (error instanceof WorldError && error.status === 404) notFound(); throw error; });
  const [worlds, tags, calendars] = await Promise.all([listWorlds(access.session.user.id, review ? "review" : "mine"), worldReferences(access.session.user.id, review ? "review" : "mine"), query.tab==="chronology"||query.tab==="calendars"?getCalendars(access.session.user.id,worldId,review,ordinary,bundle.selectedTimeline.id):undefined]);
  return <WorldWorkspace key={worldId} initialBundle={bundle} initialOrdinary={ordinary} initialCalendars={calendars} worlds={worlds.map(({id,name,archived})=>({id,name,archived}))} tags={tags} review={review} />;
}
