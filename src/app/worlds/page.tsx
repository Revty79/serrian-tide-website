import type { Metadata } from "next";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";
import { listWorlds, worldReferences } from "@/features/worlds/world-service";
import { WorldRegistry } from "@/features/worlds/world-registry";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "World Registry | Serrian Tide", description: "Your private world-building workshop." };
export default async function WorldsPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const access = await requireGodOrAdminAccessContext();
  const isAdmin = access.roles.includes("admin");
  const review = isAdmin && (await searchParams).scope === "review";
  const [worlds, tags] = await Promise.all([listWorlds(access.session.user.id, review ? "review" : "mine"), worldReferences(access.session.user.id)]);
  return <WorldRegistry key={review ? "review" : "mine"} initialWorlds={worlds} tags={tags} isAdmin={isAdmin} review={review} />;
}
