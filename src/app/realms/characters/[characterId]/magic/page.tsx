import { redirect } from "next/navigation";

import { getCharacter } from "@/app/characters/actions";
import { listCharacterSpells } from "@/app/characters/spell-actions";
import "@/app/heavens/skills/skills.css";
import { requirePlayer } from "@/lib/server-access";

import "./magic.css";
import { MagicWorkspace } from "./magic-workspace";

export default async function MagicCalculatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ characterId: string }>;
  searchParams: Promise<{ spell?: string }>;
}) {
  await requirePlayer().catch(() => redirect("/access"));
  const { characterId } = await params;
  const id = Number(characterId);
  if (!Number.isInteger(id) || id <= 0) redirect("/realms");

  const aggregate = await getCharacter(id, false).catch(() => null);
  if (!aggregate) redirect("/realms");
  const spells = await listCharacterSpells(id);
  const query = await searchParams;
  const initialSpellId = query.spell ? Number(query.spell) : undefined;

  return (
    <MagicWorkspace
      aggregate={aggregate}
      initialSpells={spells}
      initialSpellId={Number.isInteger(initialSpellId) ? initialSpellId : undefined}
    />
  );
}
