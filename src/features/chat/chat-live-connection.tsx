"use client";

import { useEffect, useRef, useState } from "react";

import { parseChatLiveMessageData } from "./chat-interface";

type ChatLiveConnectionProps = {
  roomSlug: string;
  onReady: (roomSlug: string) => void | Promise<void>;
  onMessage: (roomSlug: string, messageId: number) => void | Promise<void>;
  onDirectory: (roomSlug: string) => void | Promise<void>;
  className?: string;
};

type ChatLiveStatus = "connecting" | "live" | "reconnecting";

export function ChatLiveConnection({
  roomSlug,
  onReady,
  onMessage,
  onDirectory,
  className,
}: ChatLiveConnectionProps) {
  const [status, setStatus] = useState<ChatLiveStatus>("connecting");
  const callbacksRef = useRef({ onReady, onMessage, onDirectory });
  const generationRef = useRef(0);

  useEffect(() => {
    callbacksRef.current = { onReady, onMessage, onDirectory };
  }, [onDirectory, onMessage, onReady]);

  useEffect(() => {
    const generation = ++generationRef.current;
    const pendingMessageIds = new Set<number>();
    let directoryPending = false;
    let accessCheckRequested = false;
    const source = new EventSource(`/api/chat/live?room=${encodeURIComponent(roomSlug)}`);
    const isCurrent = () => generationRef.current === generation;

    const handleReady = () => {
      if (!isCurrent()) return;
      accessCheckRequested = false;
      setStatus("live");
      void callbacksRef.current.onReady(roomSlug);
    };
    const handleMessage = (raw: Event) => {
      if (!isCurrent() || !(raw instanceof MessageEvent)) return;
      const payload = parseChatLiveMessageData(String(raw.data));
      if (!payload || pendingMessageIds.has(payload.messageId)) return;
      pendingMessageIds.add(payload.messageId);
      void Promise.resolve(callbacksRef.current.onMessage(roomSlug, payload.messageId))
        .finally(() => {
          if (isCurrent()) pendingMessageIds.delete(payload.messageId);
        });
    };
    const handleDirectory = () => {
      if (!isCurrent() || directoryPending) return;
      directoryPending = true;
      void Promise.resolve(callbacksRef.current.onDirectory(roomSlug))
        .finally(() => {
          if (isCurrent()) directoryPending = false;
        });
    };

    source.addEventListener("ready", handleReady);
    source.addEventListener("message", handleMessage);
    source.addEventListener("directory", handleDirectory);
    source.onerror = () => {
      if (!isCurrent()) return;
      setStatus("reconnecting");
      if (!accessCheckRequested) {
        accessCheckRequested = true;
        handleDirectory();
      }
    };

    return () => {
      generationRef.current += 1;
      pendingMessageIds.clear();
      directoryPending = false;
      accessCheckRequested = false;
      source.close();
    };
  }, [roomSlug]);

  const label = status === "live"
    ? "Live"
    : status === "connecting"
      ? "Connecting"
      : "Reconnecting";

  return (
    <span className={className} data-live-status={status} role="status" aria-live="polite">
      <span aria-hidden="true" />
      {label}
    </span>
  );
}
