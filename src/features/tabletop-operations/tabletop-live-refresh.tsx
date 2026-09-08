"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type TabletopLiveRefreshProps =
  | { mode: "god"; campaignId: number }
  | { mode: "player"; characterId: number; scope?: "console" };

export function TabletopLiveRefresh(props: TabletopLiveRefreshProps & { onRefresh?: () => void; onStatus?: (status: "connecting" | "live" | "reconnecting") => void }) {
  const router = useRouter();
  const mode = props.mode;
  const subscriptionId = props.mode === "god" ? props.campaignId : props.characterId;
  const playerScope = props.mode === "player" ? props.scope : undefined;
  const [status, setStatus] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ onRefresh: props.onRefresh, onStatus: props.onStatus });
  useEffect(() => { callbacks.current = { onRefresh: props.onRefresh, onStatus: props.onStatus }; }, [props.onRefresh, props.onStatus]);

  useEffect(() => {
    const query = mode === "god"
      ? `mode=god&campaignId=${subscriptionId}`
      : `mode=player&characterId=${subscriptionId}${playerScope ? `&scope=${playerScope}` : ""}`;
    const source = new EventSource(`/api/tabletop/live?${query}`);
    const refresh = () => {
      if (refreshTimer.current) return;
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        if (callbacks.current.onRefresh) callbacks.current.onRefresh();
        else router.refresh();
      }, 80);
    };
    source.addEventListener("ready", () => {
      setStatus("live");
      callbacks.current.onStatus?.("live");
      refresh();
    });
    source.addEventListener("invalidation", refresh);
    source.onerror = () => { setStatus("reconnecting"); callbacks.current.onStatus?.("reconnecting"); };
    return () => {
      source.close();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [mode, playerScope, router, subscriptionId]);

  return (
    <span className={`tabletop-live-status tabletop-live-status--${status}`} role="status">
      <span aria-hidden="true" />
      {status === "live" ? "Live" : status === "connecting" ? "Connecting" : "Reconnecting"}
    </span>
  );
}
