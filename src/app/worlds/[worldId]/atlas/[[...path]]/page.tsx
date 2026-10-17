import { redirect } from "next/navigation";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";
import { normalizeWorldsQuery } from "@/features/worlds/atlas-availability";

/** Old map bookmarks return to the information workspace without loading Atlas. */
export default async function RetainedAtlasBookmark({ params, searchParams }: {
  params: Promise<{worldId:string}>;
  searchParams: Promise<Record<string,string|string[]|undefined>>;
}) {
  await requireGodOrAdminAccessContext();
  const query=new URLSearchParams();
  for(const [key,value] of Object.entries(await searchParams))for(const item of Array.isArray(value)?value:value===undefined?[]:[value])query.append(key,item);
  const normalized=normalizeWorldsQuery(query);
  normalized.set("tab","overview");
  redirect(`/worlds/${(await params).worldId}?${normalized}`);
}
