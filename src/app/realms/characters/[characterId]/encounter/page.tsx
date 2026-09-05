import { redirect } from "next/navigation";

import { requirePlayer } from "@/lib/server-access";

export default async function PlayerEncounterPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  await requirePlayer().catch(() => redirect("/access"));
  const { characterId } = await params;
  const id = Number(characterId);
  if (!Number.isSafeInteger(id) || id <= 0) redirect("/realms/tabletop");
  redirect(`/realms/tabletop?character=${id}`);
}
