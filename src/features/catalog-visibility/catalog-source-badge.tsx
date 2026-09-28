import type { CatalogSourceLabel } from "./catalog-query";
import styles from "./catalog-visibility-control.module.css";

export function CatalogSourceBadge({ source }: { source?: CatalogSourceLabel }) {
  if (!source || source === "other") return null;
  return <span className={styles.sourceBadge}>{source === "canon" ? "Serrian Tide Canon" : source === "mine" ? "Mine" : "Context"}</span>;
}
