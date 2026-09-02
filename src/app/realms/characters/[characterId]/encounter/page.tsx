import { redirect } from "next/navigation";

import { requirePlayer } from "@/lib/server-access";

import { getPlayerEncounter } from "./actions";
import { PlayerEncounterConsole } from "./player-encounter-console";

export default async function PlayerEncounterPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  await requirePlayer().catch(() => redirect("/access"));
  const { characterId } = await params;
  const id = Number(characterId);
  if (!Number.isSafeInteger(id) || id <= 0) redirect("/realms");
  const encounter = await getPlayerEncounter(id).catch(() => null);
  if (!encounter) redirect(`/realms/characters/${id}`);
  return <PlayerEncounterConsole view={encounter} />;
}

