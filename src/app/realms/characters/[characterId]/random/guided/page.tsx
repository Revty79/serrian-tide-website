import { redirect } from "next/navigation";

import { getCharacter } from "@/app/characters/actions";
import { availableRandomMagicSystems } from "@/features/characters/random-character";

import { GuidedRandomCharacterWorkspace } from "./random-character-workspace";
import "./random-character.css";

export default async function GuidedRandomCharacterPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  const { characterId: rawCharacterId } = await params;
  const characterId = Number(rawCharacterId);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    redirect("/realms");
  }

  const aggregate = await getCharacter(characterId, false);
  if (aggregate.profile.creationCompletedAt) {
    redirect(`/realms/characters/${characterId}`);
  }

  return (
    <GuidedRandomCharacterWorkspace
      characterId={characterId}
      campaignName={aggregate.campaign.name}
      currentName={aggregate.character.name}
      races={aggregate.allowedRaces}
      magicSystems={availableRandomMagicSystems(aggregate.campaign.allowedSystems)}
    />
  );
}
