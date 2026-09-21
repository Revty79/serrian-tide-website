"use client";

import { Children, cloneElement, isValidElement, useId, type ReactNode } from "react";
import styles from "./field-guidance.module.css";

/** Help is outside the label: reading it must never toggle or edit the field. */
export function GuidedField({ label, help, children, className = "", controlClassName }: {
  label: string; help?: ReactNode; children: ReactNode; className?: string; controlClassName?: string;
}) {
  const id = useId();
  return <div className={`${className} ${styles.field}`} data-field-guidance={help ? label : undefined}>
    <label className={styles.label}>
      <span id={`${id}-label`} className={`${styles.caption} ${help ? styles.withHelp : ""}`}>{label}</span>
      {Children.map(children, (child) => {
        if (!isValidElement<{ className?: string; "aria-labelledby"?: string; "aria-describedby"?: string }>(child)) return child;
        if (typeof child.type === "string" && !["input", "textarea", "select"].includes(child.type)) return child;
        return cloneElement(child, {
          ...(controlClassName ? { className: [child.props.className, controlClassName].filter(Boolean).join(" ") } : {}),
          "aria-labelledby": child.props["aria-labelledby"] ?? `${id}-label`,
          "aria-describedby": [child.props["aria-describedby"], help ? `${id}-help` : null].filter(Boolean).join(" ") || undefined,
        });
      })}
    </label>
    {help ? <details className={styles.help} onKeyDown={(event) => {
      if (event.key === "Escape" && event.currentTarget.open) {
        event.preventDefault(); event.stopPropagation();
        event.currentTarget.open = false;
        event.currentTarget.querySelector("summary")?.focus();
      }
    }}>
      <summary aria-label={`Help for ${label}`} className={styles.trigger}><span aria-hidden="true">?</span></summary>
      <div id={`${id}-help`} className={styles.content} role="note">{help}</div>
    </details> : null}
  </div>;
}
