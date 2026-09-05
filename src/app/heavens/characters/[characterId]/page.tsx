import { redirect } from "next/navigation";

import { getCharacter } from "@/app/characters/actions";
import { CharacterEditor } from "@/app/characters/character-editor";
import "@/app/characters/character.css";
import { getActiveHealth } from "@/features/active-state/active-health-service";
import { getActiveMana } from "@/features/active-state/active-mana-service";
import { getActiveEffects } from "@/features/active-state/active-effects-service";
import { getCharacterEquipmentState } from "@/features/items/equipment-state-service";
import { getCharacterItemChargeState } from "@/features/items/item-charge-service";
import { getGodCharacterReturnHref } from "@/features/navigation/authenticated-navigation";
import { getManagedCharacterCapabilities } from "@/features/authorization/managed-character-capability-service";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";

export default async function GodCharacterPage({
  params,
  searchParams,
}: {
  params: Promise<{ characterId: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  await requireGodOrAdminAccessContext().catch(() => redirect("/access"));
  const { characterId } = await params;
  const id = Number(characterId);
  if (!Number.isInteger(id) || id <= 0) redirect("/heavens");

  const capabilities = await getManagedCharacterCapabilities(id).catch(() => null);
  if (!capabilities?.canManageRecord) redirect("/heavens");

  const aggregate = await getCharacter(id, true).catch(() => null);
  if (!aggregate) redirect("/heavens");
  if (aggregate.character.isNpc && aggregate.character.npcBuildMode === "simple") {
    redirect(`/heavens/npcs?campaign=${aggregate.campaign.id}`);
  }
  const [activeHealth, activeMana, activeEffects, equipmentState, chargeState] = await Promise.all([
    getActiveHealth(id).catch(() => null),
    getActiveMana(id).catch(() => null),
    getActiveEffects(id, true).catch(() => null),
    getCharacterEquipmentState(id).catch(() => null),
    getCharacterItemChargeState(id).catch(() => null),
  ]);
  if (!activeHealth || !activeMana || !activeEffects || !equipmentState || !chargeState) redirect("/heavens");
  const sourceValue = (await searchParams).source;
  const source = sourceValue === "npcs" ? "npcs" : "heavens";
  const backHref = getGodCharacterReturnHref({
    source,
    campaignId: aggregate.campaign.id,
    playerUserId: source === "npcs" ? null : aggregate.character.playerUserId,
  });

  return (
    <CharacterEditor
      initialAggregate={aggregate}
      initialActiveHealth={activeHealth}
      initialActiveMana={activeMana}
      initialActiveEffects={activeEffects}
      initialEquipmentState={equipmentState}
      initialChargeState={chargeState}
      godMode
      canOperateRuntime={capabilities.canOperateRuntime}
      backHref={backHref}
      backLabel={source === "npcs" ? "NPCs" : "Campaign Control"}
    />
  );
}
