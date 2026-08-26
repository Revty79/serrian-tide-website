import { redirect } from "next/navigation";

import { getCharacter } from "@/app/characters/actions";
import { CharacterEditor } from "@/app/characters/character-editor";
import "@/app/characters/character.css";
import { requireGod } from "@/lib/server-access";

export default async function GodCharacterPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  await requireGod().catch(() => redirect("/access"));
  const { characterId } = await params;
  const id = Number(characterId);
  if (!Number.isInteger(id) || id <= 0) redirect("/heavens");

  const aggregate = await getCharacter(id, true).catch(() => null);
  if (!aggregate) redirect("/heavens");

  return <CharacterEditor initialAggregate={aggregate} godMode />;
}
