import { notFound } from "next/navigation";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";
import { getWorld, listWorlds, worldReferences, WorldError } from "@/features/worlds/world-service";
import { WorldWorkspace } from "@/features/worlds/world-workspace";
export const dynamic = "force-dynamic";
export const metadata = { title: "World Workshop | Serrian Tide" };
export default async function WorldPage({ params, searchParams }: { params: Promise<{ worldId: string }>; searchParams: Promise<{ review?: string;timeline?:string }> }) {
  const access = await requireGodOrAdminAccessContext();
  const query=await searchParams;
  const review = access.roles.includes("admin") && query.review === "1";
  const worldId = (await params).worldId;
  const bundle = await getWorld(access.session.user.id, worldId, review,query.timeline).catch((error) => { if (error instanceof WorldError && error.status === 404) notFound(); throw error; });
  const [worlds, tags] = await Promise.all([listWorlds(access.session.user.id, review ? "review" : "mine"), worldReferences(access.session.user.id, review ? "review" : "mine")]);
  return <WorldWorkspace key={worldId} initialBundle={bundle} worlds={worlds} tags={tags} review={review} />;
}
