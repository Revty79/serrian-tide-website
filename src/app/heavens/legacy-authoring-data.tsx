import styles from "./legacy-authoring-data.module.css";

/** Reference-only presentation. Hidden values remain in the owning draft unchanged. */
export function LegacyAuthoringData({ entries, title = "Legacy Data" }: {
  entries: Array<{ label: string; value: string | null | undefined }>;
  title?: string;
}) {
  const populated = entries.filter(({ value }) => value?.trim());
  if (!populated.length) return null;
  return <details className={styles.legacy}>
    <summary>{title}</summary>
    <dl>{populated.map(({ label, value }, index) => <div key={`${label}-${index}`}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </details>;
}
