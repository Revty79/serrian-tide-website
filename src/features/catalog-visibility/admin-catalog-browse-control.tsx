"use client";

import { useRef, useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { updateCurrentCatalogPreference } from "./actions";
import { CatalogVisibilityControl } from "./catalog-visibility-control";
import type { CatalogBrowseState } from "./catalog-query";
import type { CatalogKey } from "./catalog-visibility";
import type { AdminCatalogBrowse, CatalogBrowseMode } from "./admin-catalog-browse";
import styles from "./catalog-visibility-control.module.css";

export function AdminCatalogBrowseControl({ catalog, visibility, options, onChange }: {
  catalog: CatalogKey; visibility: CatalogBrowseState; options: AdminCatalogBrowse;
  onChange: (options: AdminCatalogBrowse) => Promise<void> | void;
}) {
  const effectiveMode = options.all ? "all" : visibility.mode;
  const [selectedMode, setSelectedMode] = useState<CatalogBrowseMode>(effectiveMode);
  const [lastEffectiveMode, setLastEffectiveMode] = useState(effectiveMode);
  if (lastEffectiveMode !== effectiveMode) {
    setLastEffectiveMode(effectiveMode);
    setSelectedMode(effectiveMode);
  }
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("");
  const saving = useRef(false);
  async function change(next: AdminCatalogBrowse, mode?: CatalogBrowseMode) {
    if (saving.current) return;
    const previousMode = selectedMode;
    let preferenceSaved = false;
    saving.current = true; setPending(true); setError(""); setStatus("");
    if (mode) setSelectedMode(mode);
    try {
      if (mode && mode !== "all") {
        await updateCurrentCatalogPreference({ catalog, mode });
        preferenceSaved = true;
      }
      await onChange(next);
      setStatus(mode && mode !== "all" ? "Saved." : "View updated.");
    } catch (error) {
      if (!preferenceSaved) setSelectedMode(previousMode);
      setError(preferenceSaved ? "Your choice was saved, but the catalog could not refresh. Please reload the page." : error instanceof Error ? error.message : "The catalog view could not be updated. Please try again.");
    }
    finally { saving.current = false; setPending(false); }
  }
  return <>
    <CatalogVisibilityControl catalog={catalog} label="Administrator view" allowAll mode={selectedMode}
      description="Canon is official content. Mine is content you created. All includes every user's content. Your administrator view works even when catalog filtering is inactive."
      onChange={(mode) => void change({ ...options, all: mode === "all" }, mode)} pending={pending} error={error} status={status || "The three personal choices save to Profile. All and user controls apply to this page visit."} />
    <fieldset className={styles.adminFilters} disabled={pending}>
      <legend className="sr-only">Administrator user controls</legend>
      <GuidedField label="Created by" className="st-field" help="Filter this view to one original creator. Canon promotion does not change the creator. No recorded creator includes imported or older records without attribution. Required ancestors may still appear as Context.">
        <select className="st-control" value={options.creatorId ?? ""} onChange={(event) => void change({ ...options, creatorId: event.target.value || undefined })}>
          <option value="">All users</option>
          {visibility.admin?.creators.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select>
      </GuidedField>
      <GuidedField label="Sort by" className="st-field" help="Sort matching records before pagination. User sorts by the creator's displayed username or name, then by record name. Required ancestors stay ahead of their descendants. Skills use the list view for user sorting.">
        <select className="st-control" value={options.sortBy ?? "name"} onChange={(event) => void change({ ...options, sortBy: event.target.value as "name" | "user" })}>
          <option value="name">Name</option><option value="user">User</option>
        </select>
      </GuidedField>
    </fieldset>
  </>;
}
