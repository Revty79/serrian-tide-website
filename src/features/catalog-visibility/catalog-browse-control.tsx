"use client";
import { CatalogPreferenceRow } from "./catalog-preferences-editor";
import type { CatalogBrowseState } from "./catalog-query";
import type { CatalogKey } from "./catalog-visibility";

export function CatalogBrowseControl({ catalog, visibility, onSaved }: {
  catalog: CatalogKey; visibility: CatalogBrowseState; onSaved: () => Promise<void> | void;
}) {
  return <CatalogPreferenceRow catalog={catalog} initialMode={visibility.mode} onSaved={onSaved}
    description={visibility.enabled
      ? "Choose the content to browse. Context keeps necessary ancestors visible; it adds no siblings or editing permissions. Existing game references stay usable."
      : "Your choice is saved. Browsing keeps the full catalog until an Administrator completes canon classification for this environment."} />;
}
