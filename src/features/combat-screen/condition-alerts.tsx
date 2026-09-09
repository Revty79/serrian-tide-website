"use client";

import { useEffect, useState } from "react";
import type { CombatConditionAlert } from "@/features/tabletop-operations/combat-condition-alerts";
import styles from "./combat-screen.module.css";

export function ConditionAlerts({ alerts, storageKey, onInspect }: {
  alerts: CombatConditionAlert[]; storageKey: string; onInspect: (participantId: number) => void;
}) {
  const [acknowledged, setAcknowledged] = useState<string[] | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      let saved: string[] = [];
      try {
        const value: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]");
        if (Array.isArray(value)) saved = value.filter((entry): entry is string => typeof entry === "string");
      } catch { /* Alerts remain usable when browser storage is unavailable. */ }
      if (active) setAcknowledged(saved);
    });
    return () => { active = false; };
  }, [storageKey]);
  const visible = acknowledged === null ? [] : alerts.filter((alert) => !acknowledged.includes(alert.id));
  function acknowledge(id: string) {
    const next = [...new Set([...(acknowledged ?? []), id])];
    setAcknowledged(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep the in-page acknowledgement. */ }
  }
  return <section className={visible.length ? styles.conditionAlerts : undefined} aria-label="Combat condition alerts">
    <div role="alert" aria-live="assertive" aria-relevant="additions" aria-atomic="false">
      {visible.map((alert) => <article className={styles.conditionAlert} key={alert.id}>
        <div><h2>{alert.actorName}: {alert.title}</h2><p>{alert.detail}</p></div>
        <div className={styles.actions}>
          <button className="st-button" onClick={() => onInspect(alert.participantId)}>Inspect {alert.actorName}</button>
          <button className="st-button" onClick={() => acknowledge(alert.id)}>Acknowledge</button>
        </div>
      </article>)}
    </div>
  </section>;
}
