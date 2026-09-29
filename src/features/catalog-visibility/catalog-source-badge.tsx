import type { CatalogSourceLabel } from "./catalog-query";
import styles from "./catalog-visibility-control.module.css";

export function CatalogSourceBadge({ source, creatorLabel }: { source?: CatalogSourceLabel; creatorLabel?: string }) {
  const label = source === "canon" ? "Serrian Tide Canon" : source === "mine" ? "Mine" : source === "context" ? "Context" : "";
  if (!label && !creatorLabel) return null;
  return <>
    {label ? <span className={styles.sourceBadge}>{label}</span> : null}
    {creatorLabel ? <span className={styles.sourceBadge}>Created by: {creatorLabel}</span> : null}
  </>;
}
