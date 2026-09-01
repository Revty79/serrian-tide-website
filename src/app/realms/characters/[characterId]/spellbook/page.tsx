import { redirect } from "next/navigation";

import { getCharacter } from "@/app/characters/actions";
import { getActiveMana } from "@/app/characters/active-mana-actions";
import { listCharacterSpells } from "@/app/characters/spell-actions";
import "@/app/heavens/skills/skills.css";
import { requirePlayer } from "@/lib/server-access";

import "../../spell-player.css";
import { SpellbookWorkspace } from "./spellbook-workspace";

export default async function SpellbookPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  await requirePlayer().catch(() => redirect("/access"));
  const { characterId } = await params;
  const id = Number(characterId);
  if (!Number.isInteger(id) || id <= 0) redirect("/realms");

  const aggregate = await getCharacter(id, false).catch(() => null);
  if (!aggregate) redirect("/realms");
  const [spells, activeMana] = await Promise.all([
    listCharacterSpells(id),
    getActiveMana(id),
  ]);

  return (
    <SpellbookWorkspace
      aggregate={aggregate}
      initialSpells={spells}
      initialActiveMana={activeMana}
    />
  );
}
