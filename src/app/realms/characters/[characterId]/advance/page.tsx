import { redirect } from "next/navigation";

import { getCharacter } from "@/app/characters/actions";
import "@/app/characters/character.css";
import { requirePlayer } from "@/lib/server-access";

import "./advance.css";
import { AdvanceWorkspace } from "./advance-workspace";

export default async function AdvanceCharacterPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  await requirePlayer().catch(() => redirect("/access"));
  const { characterId } = await params;
  const id = Number(characterId);
  if (!Number.isInteger(id) || id <= 0) redirect("/realms");

  const aggregate = await getCharacter(id, false).catch(() => null);
  if (!aggregate || !aggregate.profile.creationCompletedAt) {
    redirect(`/realms/characters/${id}`);
  }

  return <AdvanceWorkspace initialAggregate={aggregate} />;
}
