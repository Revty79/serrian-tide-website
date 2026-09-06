"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export const PRESERVED_SCROLL_ATTRIBUTE = "data-preserve-scroll";

type ScrollPosition = {
  left: number;
  top: number;
};

type PreservedElementPosition = ScrollPosition & {
  element: HTMLElement;
  key: string;
};

type InPlaceScrollSnapshot = {
  activeElement: HTMLElement | null;
  elements: PreservedElementPosition[];
  pathname: string;
  windowPosition: ScrollPosition;
};

export function clampScrollOffset(
  requested: number,
  scrollSize: number,
  clientSize: number,
): number {
  return Math.min(Math.max(0, requested), Math.max(0, scrollSize - clientSize));
}

export function isSameInPlaceRoute(capturedPathname: string, currentPathname: string): boolean {
  return capturedPathname === currentPathname;
}

function preservedElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${PRESERVED_SCROLL_ATTRIBUTE}]`));
}

function captureSnapshot(): InPlaceScrollSnapshot {
  return {
    activeElement: document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
    elements: preservedElements().flatMap((element) => {
      const key = element.getAttribute(PRESERVED_SCROLL_ATTRIBUTE)?.trim();
      return key ? [{ element, key, left: element.scrollLeft, top: element.scrollTop }] : [];
    }),
    pathname: window.location.pathname,
    windowPosition: { left: window.scrollX, top: window.scrollY },
  };
}

function findPreservedElement(position: PreservedElementPosition): HTMLElement | null {
  if (position.element.isConnected) return position.element;
  return preservedElements().find((element) => (
    element.getAttribute(PRESERVED_SCROLL_ATTRIBUTE) === position.key
  )) ?? null;
}

function restoreSnapshot(snapshot: InPlaceScrollSnapshot): boolean {
  if (!isSameInPlaceRoute(snapshot.pathname, window.location.pathname)) return false;

  for (const position of snapshot.elements) {
    const element = findPreservedElement(position);
    if (!element) continue;
    element.scrollLeft = clampScrollOffset(position.left, element.scrollWidth, element.clientWidth);
    element.scrollTop = clampScrollOffset(position.top, element.scrollHeight, element.clientHeight);
  }

  if (
    snapshot.activeElement?.isConnected &&
    (document.activeElement === document.body || document.activeElement === null)
  ) {
    snapshot.activeElement.focus({ preventScroll: true });
  }

  const scrollingElement = document.scrollingElement ?? document.documentElement;
  window.scrollTo({
    behavior: "auto",
    left: clampScrollOffset(
      snapshot.windowPosition.left,
      scrollingElement.scrollWidth,
      window.innerWidth,
    ),
    top: clampScrollOffset(
      snapshot.windowPosition.top,
      scrollingElement.scrollHeight,
      window.innerHeight,
    ),
  });
  return true;
}

export function useInPlaceScrollPreservation(): <Result>(
  operation: () => Result | Promise<Result>,
) => Promise<Result> {
  const latestOperationId = useRef(0);
  const pendingRestore = useRef<{
    operationId: number;
    snapshot: InPlaceScrollSnapshot;
  } | null>(null);
  const [restoreOperationId, setRestoreOperationId] = useState(0);

  const preserve = useCallback(async <Result,>(
    operation: () => Result | Promise<Result>,
  ): Promise<Result> => {
    const operationId = latestOperationId.current + 1;
    latestOperationId.current = operationId;
    const snapshot = captureSnapshot();
    try {
      return await operation();
    } finally {
      if (latestOperationId.current === operationId) {
        pendingRestore.current = { operationId, snapshot };
        setRestoreOperationId(operationId);
      }
    }
  }, []);

  useLayoutEffect(() => {
    const pending = pendingRestore.current;
    if (!pending || pending.operationId !== restoreOperationId) return;
    let animationFrame = 0;
    let settleFrame = 0;
    let mutationFrame = 0;
    let settleTimeout = 0;
    let cancelled = false;
    let observer: MutationObserver | null = null;

    const restoreIfCurrent = () => {
      if (
        cancelled
        || latestOperationId.current !== pending.operationId
        || pendingRestore.current?.operationId !== pending.operationId
      ) return;
      restoreSnapshot(pending.snapshot);
    };
    const removeInteractionListeners = () => {
      window.removeEventListener("wheel", stopFollowing);
      window.removeEventListener("touchstart", stopFollowing);
      window.removeEventListener("pointerdown", stopFollowing);
    };
    const stopFollowing = () => {
      cancelled = true;
      observer?.disconnect();
      observer = null;
      window.cancelAnimationFrame(mutationFrame);
      window.clearTimeout(settleTimeout);
      removeInteractionListeners();
      if (pendingRestore.current?.operationId === pending.operationId) {
        pendingRestore.current = null;
      }
    };

    // A Server Action can settle before its revalidated React Server Component
    // payload is committed. Restore through that second layout pass as well as
    // the synchronous state update that completed the action.
    restoreIfCurrent();
    animationFrame = window.requestAnimationFrame(() => {
      restoreIfCurrent();
      settleFrame = window.requestAnimationFrame(restoreIfCurrent);
    });
    observer = new MutationObserver(() => {
      window.cancelAnimationFrame(mutationFrame);
      mutationFrame = window.requestAnimationFrame(restoreIfCurrent);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    settleTimeout = window.setTimeout(() => {
      restoreIfCurrent();
      stopFollowing();
    }, 1_200);
    window.addEventListener("wheel", stopFollowing, { once: true, passive: true });
    window.addEventListener("touchstart", stopFollowing, { once: true, passive: true });
    window.addEventListener("pointerdown", stopFollowing, { once: true, passive: true });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      window.cancelAnimationFrame(settleFrame);
      window.cancelAnimationFrame(mutationFrame);
      window.clearTimeout(settleTimeout);
      observer?.disconnect();
      removeInteractionListeners();
    };
  }, [restoreOperationId]);

  useEffect(() => () => {
    latestOperationId.current += 1;
    pendingRestore.current = null;
  }, []);

  return preserve;
}
