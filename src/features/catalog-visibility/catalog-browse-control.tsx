"use client";
import { CatalogPreferenceRow } from "./catalog-preferences-editor";
import type { CatalogBrowseState } from "./catalog-query";
import type { CatalogKey } from "./catalog-visibility";
import { useRef, useState } from "react";
import { setCatalogActivation } from "./actions";
import styles from "./catalog-visibility-control.module.css";
import { AdminCatalogBrowseControl } from "./admin-catalog-browse-control";
import type { AdminCatalogBrowse } from "./admin-catalog-browse";

export function CatalogBrowseControl({ catalog, visibility, onSaved, canManageActivation = false, adminBrowse, onAdminBrowseChange }: {
  catalog: CatalogKey; visibility: CatalogBrowseState; onSaved: () => Promise<void> | void; canManageActivation?: boolean;
  adminBrowse?: AdminCatalogBrowse; onAdminBrowseChange?: (options: AdminCatalogBrowse) => Promise<void> | void;
}) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const saving = useRef(false);
  async function toggleActivation() {
    if (saving.current) return;
    saving.current = true; setPending(true); setError("");
    try {
      await setCatalogActivation({ catalog, enabled: !visibility.enabled });
      await onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "Filtering could not be updated."); }
    finally { saving.current = false; setPending(false); }
  }
  return <div className={styles.browseControl}>
    {visibility.admin && onAdminBrowseChange ? <AdminCatalogBrowseControl catalog={catalog} visibility={visibility} options={adminBrowse ?? {}} onChange={onAdminBrowseChange} /> : <CatalogPreferenceRow catalog={catalog} initialMode={visibility.mode} onSaved={onSaved}
    description={visibility.enabled
      ? "Choose the content to browse. Context shows required ancestors. Existing game references stay usable."
      : "Your choice is saved. Browsing shows System Canon and content you created until an Administrator enables your saved filter. Other users' non-canon content stays private."} />}
    {canManageActivation ? <div className={styles.canonControl}>
      <span>Catalog filtering: {visibility.enabled ? "Active" : "Inactive"}</span>
      <details><summary>About catalog filtering</summary><p>Enable personal Canon Only, Canon + Mine and Mine Only choices for this catalog. When disabled, users see Canon + Mine. Non-canon content stays private to its creator; Administrators can review All. Campaign members retain access to content already assigned to their Campaign.</p></details>
      <button className="st-button is-secondary" type="button" disabled={pending} onClick={() => void toggleActivation()}>{pending ? "Updating filtering…" : visibility.enabled ? "Disable filtering" : "Enable visibility filtering"}</button>
      {error ? <span role="alert" className={styles.canonError}>{error}</span> : null}
    </div> : null}
  </div>;
}
