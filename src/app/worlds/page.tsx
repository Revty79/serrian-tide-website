import type { Metadata } from "next";
import { requireWorldsAccessContext } from "@/lib/server-access";
import { listWorlds, worldReferences } from "@/features/worlds/world-service";
import { WorldRegistry } from "@/features/worlds/world-registry";
import { eligibleCampaigns } from "@/features/worlds/campaign-association-service";
import { sharedWorldPage } from "@/features/worlds/world-shared-registry-service";
import { worldInvitationInbox } from "@/features/worlds/world-collaboration-service";
import { adminWorldRegistry } from "@/features/worlds/world-admin-registry-service";
import { WorldAdminRegistry } from "@/features/worlds/world-admin-registry-client";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "World Registry | Serrian Tide", description: "Your private world-building workshop." };
export default async function WorldsPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const access = await requireWorldsAccessContext();
  const isAdmin = access.roles.includes("admin");
  const params=await searchParams;
  const review = isAdmin && params.scope === "review";
  if(review)return <WorldAdminRegistry actorId={access.session.user.id} initial={await adminWorldRegistry(access.session.user.id,params)}/>;
  const [worlds, tags] = await Promise.all([listWorlds(access.session.user.id, review ? "review" : "mine"), worldReferences(access.session.user.id, review ? "review" : "mine")]);
  const canCreate=access.roles.includes("god")||isAdmin;
  const [campaignChoices,shared,invitations]=await Promise.all([review||!canCreate?[]:eligibleCampaigns(access.session.user.id),sharedWorldPage(access.session.user.id),review?[]:worldInvitationInbox(access.session.user.id)]);
  return <WorldRegistry actorId={access.session.user.id} key={review ? "review" : "mine"} initialWorlds={worlds} tags={tags} isAdmin={isAdmin} review={review} campaignChoices={campaignChoices} canCreateWorld={canCreate} initialShared={shared.worlds} initialSharedMore={shared.hasMore} initialInvitations={invitations}/>;
}
