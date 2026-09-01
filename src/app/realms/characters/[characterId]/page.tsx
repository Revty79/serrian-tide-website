import { redirect } from "next/navigation";

import { getCharacter } from "@/app/characters/actions";
import { CharacterEditor } from "@/app/characters/character-editor";
import "@/app/characters/character.css";
import { getActiveHealth } from "@/features/active-state/active-health-service";
import { getActiveMana } from "@/features/active-state/active-mana-service";
import { getActiveEffects } from "@/features/active-state/active-effects-service";
import { getCharacterEquipmentState } from "@/features/items/equipment-state-service";
import { getCharacterItemChargeState } from "@/features/items/item-charge-service";
import { requirePlayer } from "@/lib/server-access";

export default async function PlayerCharacterPage({
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
  const [activeHealth, activeMana, activeEffects, equipmentState, chargeState] = await Promise.all([
    getActiveHealth(id).catch(() => null),
    getActiveMana(id).catch(() => null),
    getActiveEffects(id).catch(() => null),
    getCharacterEquipmentState(id).catch(() => null),
    getCharacterItemChargeState(id).catch(() => null),
  ]);
  if (!activeHealth || !activeMana || !activeEffects || !equipmentState || !chargeState) redirect("/realms");

  return <CharacterEditor initialAggregate={aggregate} initialActiveHealth={activeHealth} initialActiveMana={activeMana} initialActiveEffects={activeEffects} initialEquipmentState={equipmentState} initialChargeState={chargeState} godMode={false} />;
}
