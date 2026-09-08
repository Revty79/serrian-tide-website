import Link from "next/link";
import { readCombatScreen } from "./screen-actions";
import type { CombatScreenScope } from "./screen-types";
import { CombatScreen } from "./combat-screen";
import styles from "./combat-screen.module.css";

export async function CombatRoute({ scope }: { scope: CombatScreenScope }) {
  const result = await readCombatScreen(scope).then((data) => ({ data, error: null }), (error: unknown) => ({ data: null, error: error instanceof Error ? error.message : "Combat could not be loaded." }));
  if (!result.data) return <main className={styles.page}><section className={styles.window}><h1>Combat unavailable</h1><p role="alert">{result.error}</p><Link href={scope.role === "god" ? "/heavens/tabletop" : `/realms/tabletop?character=${scope.characterId}`}>Return to Tabletop</Link></section></main>;
  return <CombatScreen scope={scope} initialData={result.data} />;
}
