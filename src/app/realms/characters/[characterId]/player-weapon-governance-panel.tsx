import type { CharacterWeaponGovernanceResult } from "@/features/items/character-weapon-governance";
import type { PlayerWeaponGovernanceView } from "@/features/items/weapon-governance-management-service";
import { TabletopLiveRefresh } from "@/features/tabletop-operations/tabletop-live-refresh";

import styles from "./player-weapon-governance-panel.module.css";

function sourceDescription(result: CharacterWeaponGovernanceResult): string | null {
  if (
    result.status !== "resolved-normal"
    && result.status !== "resolved-persistent-override"
    && result.status !== "resolved-one-action-override"
  ) return null;
  if (result.source.kind === "skill") {
    return `${result.source.skillName} - ${result.source.allocationPath.map(({ skillName }) => skillName).join(" -> ")}`;
  }
  if (result.source.kind === "attribute") return `${result.source.attributeKey} straight Attribute check`;
  return result.source.label;
}

function isResolved(result: CharacterWeaponGovernanceResult): result is Extract<
  CharacterWeaponGovernanceResult,
  { status: "resolved-normal" | "resolved-persistent-override" | "resolved-one-action-override" }
> {
  return result.status === "resolved-normal"
    || result.status === "resolved-persistent-override"
    || result.status === "resolved-one-action-override";
}

function normalPath(result: CharacterWeaponGovernanceResult): string | null {
  if (result.normalResolution.status !== "resolved") return null;
  const selected = result.normalResolution.selectedAlternative;
  return selected.canonicalPath.rootToEndpoint.map(({ name }) => name).join(" -> ");
}

function statusLabel(result: CharacterWeaponGovernanceResult): string {
  if (result.status === "resolved-persistent-override") return "Persistent G.O.D. override";
  if (result.status === "resolved-normal") return "Normal canonical governance";
  if (result.status === "resolved-one-action-override") return "One-action G.O.D. ruling";
  if (result.status === "override-invalid") return "Override invalid - G.O.D. action needed";
  return "G.O.D. ruling needed";
}

export function PlayerWeaponGovernancePanel({
  view,
  showLiveStatus,
}: {
  view: PlayerWeaponGovernanceView;
  showLiveStatus: boolean;
}) {
  return <section className={styles.panel} aria-labelledby="player-weapon-governance-heading">
    <header className={styles.heading}>
      <div><p>YOUR WEAPON CHECKS</p><h2 id="player-weapon-governance-heading">Weapon Governance</h2></div>
      <span>{showLiveStatus ? <TabletopLiveRefresh mode="player" characterId={view.characterId} /> : null} Read-only. Your G.O.D. controls canonical mappings and Character exceptions.</span>
    </header>
    <div className={styles.weapons}>
      {view.weapons.map((weapon) => <article className={styles.weapon} key={weapon.itemId}>
        <header className={styles.weaponHeader}>
          <div><span>{weapon.canonicalId}</span><strong>{weapon.name}</strong></div>
          <small>{weapon.quantity} owned{weapon.equipmentStates.length ? ` - ${weapon.equipmentStates.join(", ")}` : ""}</small>
        </header>
        <div className={styles.modes}>
          {weapon.modes.map((mode) => {
            const source = sourceDescription(mode.resolution);
            const path = normalPath(mode.resolution);
            const resolved = isResolved(mode.resolution);
            return <section className={styles.mode} key={mode.firingModeId ?? "default"}>
              <header className={styles.modeHeader}><div><span>{mode.canonicalBehavior.replaceAll("-", " ")}</span><strong>{mode.label}</strong></div><em>{statusLabel(mode.resolution)}</em></header>
              {resolved ? <>
                <p className={styles.target}>Roll over {mode.resolution.originalTarget}%</p>
                <p className={styles.source}><strong>Governing source:</strong> {source}</p>
                {path ? <p className={styles.path}>Canonical path: {path}</p> : null}
                <p className={styles.explanation}>{mode.resolution.explanation}</p>
              </> : <p className={styles.ruling}>{mode.resolution.status === "override-invalid"
                ? `${mode.resolution.explanation} The G.O.D. must remove or replace the preserved override.`
                : mode.resolution.explanation}</p>}
            </section>;
          })}
        </div>
      </article>)}
      {!view.weapons.length ? <p className={styles.empty}>This Character owns no canonical weapons with a Weapon Profile.</p> : null}
    </div>
  </section>;
}
