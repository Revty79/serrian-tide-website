"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CharacterDraft } from "@/features/characters/models";
import type { CharacterCreationTab } from "@/features/characters/character-creation";
import { creationAutosavePrefix, creationDraftContent, creationDraftFingerprint, encodeCreationAutosave, readCreationAutosaves, retireCreationAutosave,
  type CreationAutosaveScope, type StoredCreationAutosave } from "@/features/characters/character-creation-autosave";

export function useCharacterCreationRecovery({ scope, enabled, base, draft, dirty, tab, onRestore }: {
  scope: CreationAutosaveScope; enabled: boolean; base: CharacterDraft; draft: CharacterDraft; dirty: boolean; tab: CharacterCreationTab;
  onRestore: (entry: StoredCreationAutosave, isCurrent: () => boolean) => Promise<boolean>;
}) {
  const prefix = creationAutosavePrefix(scope);
  const activePrefix = useRef(prefix);
  const ownKey = useRef<string | null>(null), lastRaw = useRef<string | null>(null), discarded = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const restoreRef = useRef(onRestore);
  useEffect(() => { restoreRef.current = onRestore; });
  const [readyScope, setReadyScope] = useState<string | null>(null);
  const ready = readyScope === prefix;
  const [restoring, setRestoring] = useState(false);
  const [candidates, setCandidates] = useState<StoredCreationAutosave[]>([]);
  const [error, setError] = useState(""), [savedAt, setSavedAt] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    let current = true;
    if (activePrefix.current !== prefix) {
      activePrefix.current = prefix; initialized.current = false;
      ownKey.current = null; lastRaw.current = null; discarded.current = false;
      setReadyScope(null); setCandidates([]); setSavedAt(""); setError("");
    }
    if (initialized.current) return;
    if (!enabled) { initialized.current = true; queueMicrotask(() => { if (current) setReadyScope(prefix); }); return () => { current = false; }; }
    void (async () => {
      try {
        ownKey.current ??= prefix + crypto.randomUUID();
        const found = readCreationAutosaves(localStorage, scope);
        const pending = found.entries.filter(entry => {
          if (creationDraftContent(entry.value.draft) !== creationDraftContent(base)) return true;
          retireCreationAutosave(localStorage, entry); return false;
        });
        if (found.unreadable && current) setError("An older browser draft could not be read. It has been retained; use Save Character to protect your current work.");
        if (pending.length === 1 && pending[0].value.base === creationDraftFingerprint(base)) {
          if (current) setRestoring(true);
          const restored = await restoreRef.current(pending[0], () => current);
          if (!current) return;
          if (restored) {
            localStorage.setItem(ownKey.current, pending[0].raw); lastRaw.current = pending[0].raw;
            retireCreationAutosave(localStorage, pending[0]);
          }
          else { setCandidates(pending); return; }
        } else if (pending.length) { if (current) setCandidates(pending); return; }
        if (current) { initialized.current = true; setReadyScope(prefix); }
      } catch {
        if (current) { initialized.current = true; setError("Device backup is unavailable. Keep this page open until the Character is saved to your account."); setReadyScope(prefix); }
      } finally { if (current) setRestoring(false); }
    })();
    return () => { current = false; };
    // A mounted editor owns one Character/account scope and reads recovery once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix, enabled]);

  useLayoutEffect(() => {
    if (!enabled || !ready || activePrefix.current !== prefix || !ownKey.current || discarded.current) return;
    try {
      if (!dirty) {
        if (lastRaw.current) retireCreationAutosave(localStorage, { key: ownKey.current, raw: lastRaw.current });
        lastRaw.current = null;
        return;
      }
      const when = new Date().toISOString(), raw = encodeCreationAutosave(scope, base, draft, tab, when);
      localStorage.setItem(ownKey.current, raw);
      lastRaw.current = raw;
      queueMicrotask(() => { if (alive.current) setSavedAt(when); });
    } catch { queueMicrotask(() => { if (alive.current) { setSavedAt(""); setError("Device backup is unavailable. Keep this page open until the Character is saved to your account."); } }); }
  }, [enabled, ready, prefix, scope, base, draft, dirty, tab]);

  async function restore(entry: StoredCreationAutosave) {
    setRestoring(true); setError("");
    try {
      if (await restoreRef.current(entry, () => alive.current && activePrefix.current === prefix) && alive.current && activePrefix.current === prefix) {
        if (!ownKey.current) throw new Error("Browser draft identity is unavailable.");
        localStorage.setItem(ownKey.current, entry.raw); lastRaw.current = entry.raw;
        retireCreationAutosave(localStorage, entry);
        initialized.current = true; setCandidates([]); setReadyScope(prefix);
      }
    } catch { if (alive.current) { setError("The recovered draft is still retained. Browser backup could not be updated; use Save Character before leaving."); setCandidates([]); setReadyScope(prefix); } }
    finally { if (alive.current) setRestoring(false); }
  }
  function useSaved() {
    try { candidates.forEach(entry => retireCreationAutosave(localStorage, entry)); }
    catch { setError("The browser drafts could not be removed. They remain available for recovery."); }
    initialized.current = true; setCandidates([]); setReadyScope(prefix);
  }
  function clearSaved() {
    if (ownKey.current && lastRaw.current) {
      try { retireCreationAutosave(localStorage, { key: ownKey.current, raw: lastRaw.current }); } catch { /* Existing backup remains recoverable. */ }
    }
    lastRaw.current = null;
  }
  function discard() {
    discarded.current = true;
    clearSaved();
  }
  return { ready: !enabled || ready, restoring, candidates, error, savedAt, restore, useSaved, discard, clearSaved };
}
