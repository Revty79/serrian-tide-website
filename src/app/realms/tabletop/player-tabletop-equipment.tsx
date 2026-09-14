"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Swords } from "lucide-react";

import { EquipmentStatePanel } from "@/app/characters/equipment-state-panel";
import { MagazinePanel } from "@/app/characters/magazine-panel";
import type { CharacterEquipmentStateView } from "@/features/items/equipment-state";
import styles from "./player-tabletop.module.css";

export function PlayerTabletopEquipment({ initial, combatId }: { initial: CharacterEquipmentStateView; combatId: number | null }) {
  const router = useRouter();
  const [updated, setUpdated] = useState<{ initial: CharacterEquipmentStateView; value: CharacterEquipmentStateView } | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const state = updated?.initial === initial ? updated.value : initial;
  const revision = `${JSON.stringify(initial)}:${refreshCount}`;

  function refresh() {
    setRefreshCount((count) => count + 1);
    router.refresh();
  }

  return <div className={styles.equipmentTools}>
    {combatId !== null ? <p className={styles.notice}>Combat is active. Preparation uses combat actions and Initiative. <Link href={`/realms/tabletop?character=${initial.characterId}&combat=${combatId}`}><Swords size={16} aria-hidden="true" />Open encounter</Link></p> : null}
    <EquipmentStatePanel
      state={state}
      disabled={combatId !== null}
      compact
      revision={revision}
      onChange={(value) => setUpdated({ initial, value })}
      onActiveEffectsChange={refresh}
      onPreparationChange={refresh}
    />
    <MagazinePanel characterId={initial.characterId} disabled={combatId !== null} compact revision={revision} onChange={refresh} />
  </div>;
}
