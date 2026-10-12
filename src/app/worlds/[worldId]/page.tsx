import { notFound } from "next/navigation";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";
import { getWorld, listWorlds, worldReferences, WorldError } from "@/features/worlds/world-service";
import { getCalendars } from "@/features/worlds/calendar-service";
import { WorldWorkspace } from "@/features/worlds/world-workspace";
export const dynamic = "force-dynamic";
export const metadata = { title: "World Workshop | Serrian Tide" };
export default async function WorldPage({ params, searchParams }: { params: Promise<{ worldId: string }>; searchParams: Promise<{ review?: string;timeline?:string;knowledge?:string;tab?:string }> }) {
  const access = await requireGodOrAdminAccessContext();
  const query=await searchParams;
  const review = access.roles.includes("admin") && query.review === "1";
  const worldId = (await params).worldId;
  const ordinary=query.knowledge==="ordinary";
  const bundle = await getWorld(access.session.user.id, worldId, review,query.timeline,ordinary).catch((error) => { if (error instanceof WorldError && error.status === 404) notFound(); throw error; });
  const [worlds, tags, calendars] = await Promise.all([listWorlds(access.session.user.id, review ? "review" : "mine"), worldReferences(access.session.user.id, review ? "review" : "mine"), query.tab==="chronology"||query.tab==="calendars"?getCalendars(access.session.user.id,worldId,review,ordinary,bundle.selectedTimeline.id):undefined]);
  return <WorldWorkspace key={worldId} initialBundle={bundle} initialOrdinary={ordinary} initialCalendars={calendars} worlds={worlds.map(({id,name,archived})=>({id,name,archived}))} tags={tags} review={review} />;
}
