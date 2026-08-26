import { redirect } from "next/navigation";

import { getCharacter } from "@/app/characters/actions";
import { CharacterEditor } from "@/app/characters/character-editor";
import "@/app/characters/character.css";
import { requireGod } from "@/lib/server-access";
import { getGodCharacterReturnHref } from "@/features/navigation/authenticated-navigation";

export default async function GodCharacterPage({
  params,
  searchParams,
}: {
  params: Promise<{ characterId: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  await requireGod().catch(() => redirect("/access"));
  const { characterId } = await params;
  const id = Number(characterId);
  if (!Number.isInteger(id) || id <= 0) redirect("/heavens");

  const aggregate = await getCharacter(id, true).catch(() => null);
  if (!aggregate) redirect("/heavens");
  const sourceValue = (await searchParams).source;
  const source = sourceValue === "campaigns" || sourceValue === "npcs"
    ? sourceValue
    : "heavens";
  const backHref = getGodCharacterReturnHref({
    source,
    campaignId: aggregate.campaign.id,
    playerUserId: source === "npcs" ? null : aggregate.character.playerUserId,
  });

  return (
    <CharacterEditor
      initialAggregate={aggregate}
      godMode
      backHref={backHref}
      backLabel={source === "npcs" ? "NPCs" : source === "campaigns" ? "Campaign Control" : "Heavens"}
    />
  );
}
