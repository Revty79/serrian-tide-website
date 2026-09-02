"use client";

import { useEffect, useRef, useState } from "react";

import type {
  PlayerEncounterNotification,
  PlayerEncounterUiSnapshot,
} from "./player-encounter-notifications";
import { derivePlayerEncounterNotifications } from "./player-encounter-notifications";
import styles from "./player-live-notification-center.module.css";

type DisplayNotification = PlayerEncounterNotification & { id: number };

const STORAGE_MAX_AGE = 30 * 60 * 1_000;

export function PlayerLiveNotificationCenter({
  characterId,
  snapshot,
}: {
  characterId: number;
  snapshot: PlayerEncounterUiSnapshot | null;
}) {
  const [notifications, setNotifications] = useState<DisplayNotification[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    const key = `serrian-tide:player-encounter:${characterId}`;
    let previous: PlayerEncounterUiSnapshot | null = null;
    try {
      const stored = window.sessionStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored) as { savedAt?: number; snapshot?: PlayerEncounterUiSnapshot };
        if (parsed.savedAt && Date.now() - parsed.savedAt <= STORAGE_MAX_AGE && parsed.snapshot?.characterId === characterId) {
          previous = parsed.snapshot;
        }
      }
    } catch {
      previous = null;
    }

    const incoming = derivePlayerEncounterNotifications(previous, snapshot).slice(0, 4);
    if (incoming.length) {
      setNotifications((current) => [
        ...incoming.map((notification) => ({ ...notification, id: nextId.current++ })),
        ...current,
      ].slice(0, 4));
    }
    try {
      if (snapshot) {
        window.sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), snapshot }));
      } else {
        window.sessionStorage.removeItem(key);
      }
    } catch {
      // Live notification history is optional; authoritative state remains in the refreshed view.
    }
  }, [characterId, snapshot]);

  useEffect(() => {
    const first = notifications[0];
    if (!first) return;
    const delay = first.priority === "critical" ? 12_000 : first.priority === "important" ? 9_000 : 6_000;
    const timer = window.setTimeout(() => {
      setNotifications((current) => current.filter(({ id }) => id !== first.id));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [notifications]);

  if (!notifications.length) return null;
  return (
    <div className={styles.stack} aria-label="Live encounter notifications">
      {notifications.map((notification) => (
        <article
          className={`${styles.notice} ${styles[notification.priority]}`}
          key={notification.id}
          role={notification.priority === "critical" ? "alert" : "status"}
          aria-atomic="true"
        >
          <strong>{notification.title}</strong>
          <span>{notification.detail}</span>
          <button
            type="button"
            aria-label={`Dismiss ${notification.title}`}
            onClick={() => setNotifications((current) => current.filter(({ id }) => id !== notification.id))}
          >
            &times;
          </button>
        </article>
      ))}
    </div>
  );
}
