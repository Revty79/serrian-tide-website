"use client";

import { useId, useState, type ReactNode } from "react";
import styles from "./forms.module.css";

export function FormEditorCard({ name, index, owner, actions, error, children }: {
  name: string;
  index: number;
  owner: "race" | "creature";
  actions: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  const bodyId = useId();
  const [collapsed, setCollapsed] = useState(false);
  const title = name || `Form ${index + 1}`;

  return <article className={styles.card} aria-label={`Form ${index + 1}`} data-creature-form={owner === "creature" || undefined}>
    <header>
      <h3>{title}</h3>
      <div className={styles.actions}>
        <button type="button" className="st-button" aria-expanded={!collapsed} aria-controls={bodyId} aria-label={`${collapsed ? "Expand" : "Collapse"} Form: ${title}`} onClick={() => setCollapsed(current => !current)}>
          {collapsed ? "Expand Form" : "Collapse Form"}
        </button>
        {actions}
      </div>
    </header>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    <div id={bodyId} className={styles.cardBody} hidden={collapsed}>
      {children}
    </div>
  </article>;
}
