"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type TabletopLiveRefreshProps =
  | { mode: "god"; campaignId: number }
  | { mode: "player"; characterId: number };

export function TabletopLiveRefresh(props: TabletopLiveRefreshProps) {
  const router = useRouter();
  const mode = props.mode;
  const subscriptionId = props.mode === "god" ? props.campaignId : props.characterId;
  const [status, setStatus] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const query = mode === "god"
      ? `mode=god&campaignId=${subscriptionId}`
      : `mode=player&characterId=${subscriptionId}`;
    const source = new EventSource(`/api/tabletop/live?${query}`);
    const refresh = () => {
      if (refreshTimer.current) return;
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        router.refresh();
      }, 80);
    };
    source.addEventListener("ready", () => {
      setStatus("live");
      refresh();
    });
    source.addEventListener("invalidation", refresh);
    source.onerror = () => setStatus("reconnecting");
    return () => {
      source.close();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [mode, router, subscriptionId]);

  return (
    <span className={`tabletop-live-status tabletop-live-status--${status}`} role="status">
      <span aria-hidden="true" />
      {status === "live" ? "Live" : status === "connecting" ? "Connecting" : "Reconnecting"}
    </span>
  );
}
