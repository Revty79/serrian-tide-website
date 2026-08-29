"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EQUIPMENT_GROUPS, type EquipmentCatalogGroup, type ItemCatalogScope } from "@/db/item-schema";

import {
  createItemVariant,
  deleteItem,
  findRelatedCreatures,
  findRelatedItems,
  getItem,
  listItemAuthoringReferences,
  listItemFacets,
  listItems,
  saveItem,
  type ItemAuthoringReferences,
  type ItemDraft,
  type ItemFacets,
  type ItemLibraryFilters,
  type ItemLibraryResult,
  type ItemSummary,
  type RelatedCreatureCandidate,
  type RelatedItemCandidate,
} from "./actions";

type Tab = "overview" | "properties" | "weapon" | "armor" | "tags" | "variants" | "preview";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "properties", label: "Properties" },
  { id: "weapon", label: "Weapon / Ammunition" },
  { id: "armor", label: "Armor" },
  { id: "tags", label: "Tags" },
  { id: "variants", label: "Variants" },
  { id: "preview", label: "Preview" },
];

function titleFor(scope: ItemCatalogScope) {
  return scope === "equipment" ? "Equipment" : "Inventory";
}

function newItemDraft(scope: ItemCatalogScope): ItemDraft {
  return {
    core: {
      canonicalId: "",
      name: "",
      catalogScope: scope,
      equipmentGroup: scope === "equipment" ? "general" : null,
      recordType: scope === "equipment" ? "Equipment" : "Item",
      family: scope === "equipment" ? "General Equipment" : "General Inventory",
      category: "General",
      subtype: "",
      description: "",
      weight: null,
      weightUnit: "",
      size: "",
      durability: null,
      credits: null,
      priceBasis: "per item",
      parentItemId: null,
      parentItemName: null,
      sourceSystem: null,
      sourceExternalId: null,
    },
    properties: [],
    weaponProfile: null,
    armorProfile: null,
    tags: [],
    variants: [],
  };
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "item-field item-field--wide" : "item-field"}><span>{label}</span>{children}</label>;
}

function OptionalNumber({ value, onChange, ...props }: { value: number | null; onChange: (value: number | null) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <input {...props} type="number" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} />;
}

export function ItemWorkspace({
  scope,
  initialLibrary,
  initialFacets,
  initialReferences,
  username,
}: {
  scope: ItemCatalogScope;
  initialLibrary: ItemLibraryResult;
  initialFacets: ItemFacets;
  initialReferences: ItemAuthoringReferences;
  username: string;
}) {
  const label = titleFor(scope);
  const [filters, setFilters] = useState<ItemLibraryFilters>({ catalogScope: scope, page: 1, pageSize: 40 });
  const [library, setLibrary] = useState(initialLibrary);
  const [facets, setFacets] = useState(initialFacets);
  const [references, setReferences] = useState(initialReferences);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [dirty, setDirty] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pending, setPending] = useState<{ kind: "open"; item: ItemSummary } | { kind: "new" } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadLibrary = useCallback(async (next: ItemLibraryFilters) => {
    setLoadingLibrary(true);
    try {
      setLibrary(await listItems(next));
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : `The ${label} Library could not be loaded.` });
    } finally {
      setLoadingLibrary(false);
    }
  }, [label]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLibrary(filters), 180);
    return () => window.clearTimeout(timer);
  }, [filters, loadLibrary]);

  async function refreshReferences() {
    const [nextFacets, nextReferences] = await Promise.all([
      listItemFacets(scope),
      listItemAuthoringReferences(),
    ]);
    setFacets(nextFacets);
    setReferences(nextReferences);
  }

  async function openItem(summary: ItemSummary) {
    setLoadingEditor(true);
    setFeedback(null);
    try {
      const aggregate = await getItem(summary.id);
      if (!aggregate) throw new Error("Item not found.");
      setDraft(aggregate);
      setDirty(false);
      setActiveTab("overview");
      setConfirmDelete(false);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "That Item could not be loaded." });
    } finally {
      setLoadingEditor(false);
    }
  }

  function chooseItem(summary: ItemSummary) {
    if (dirty) setPending({ kind: "open", item: summary });
    else void openItem(summary);
  }

  function createNew() {
    setDraft(newItemDraft(scope));
    setDirty(false);
    setFeedback(null);
    setConfirmDelete(false);
    setActiveTab("overview");
  }

  function beginNew() {
    if (dirty) setPending({ kind: "new" });
    else createNew();
  }

  function discardAndContinue() {
    const next = pending;
    setPending(null);
    if (!next) return;
    if (next.kind === "new") createNew();
    else void openItem(next.item);
  }

  function change(next: ItemDraft) {
    setDraft(next);
    setDirty(true);
    setFeedback(null);
  }

  async function persist() {
    if (!draft) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await saveItem(draft);
      setDraft(saved);
      setDirty(false);
      setFeedback({ kind: "success", message: `${saved.core.name} was saved.` });
      await Promise.all([loadLibrary(filters), refreshReferences()]);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Item could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  async function removeItem() {
    if (!draft?.id) return;
    setSaving(true);
    try {
      const name = draft.core.name;
      await deleteItem(draft.id);
      setDraft(null);
      setDirty(false);
      setConfirmDelete(false);
      setFeedback({ kind: "success", message: `${name} was deleted.` });
      await loadLibrary(filters);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Item could not be deleted." });
    } finally {
      setSaving(false);
    }
  }

  const visibleTabs = TABS.filter((tab) => {
    if (scope === "inventory" && tab.id === "armor") return false;
    return true;
  });

  return <main className="skills-page items-page">
    <header className="skills-page__header">
      <div className="skills-page__brand"><Link href="/heavens" className="font-evanescent item-brand">SERRIAN<br />TIDE</Link></div>
      <div className="skills-page__title"><p>THE HEAVENS / {label.toUpperCase()}</p><h1>{label}</h1><span>G.O.D. archive · {username}</span></div>
      <div className="skills-page__navigation"><Link href="/heavens">Back to The Heavens</Link></div>
    </header>

    <div className="skills-workspace items-workspace">
      <aside className="skill-library">
        <div className="skill-library__heading"><div><p>MASTER CONTENT</p><h2>{label} Library</h2></div><button className="skills-primary-button" type="button" onClick={beginNew}>New {scope === "equipment" ? "Equipment" : "Item"}</button></div>
        <div className="skill-library__search"><label htmlFor="item-search">Search</label><input id="item-search" type="search" value={filters.search ?? ""} placeholder="Name or canonical ID" onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })} /></div>
        <div className="skill-library__filters item-library-filters">
          {scope === "equipment" ? <label><span>Group</span><select value={filters.equipmentGroup ?? ""} onChange={(e) => setFilters({ ...filters, equipmentGroup: e.target.value as EquipmentCatalogGroup | "", page: 1 })}><option value="">All</option>{EQUIPMENT_GROUPS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label> : null}
          <label><span>Record Type</span><select value={filters.recordType ?? ""} onChange={(e) => setFilters({ ...filters, recordType: e.target.value || undefined, page: 1 })}><option value="">All</option>{facets.recordTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Category</span><select value={filters.category ?? ""} onChange={(e) => setFilters({ ...filters, category: e.target.value || undefined, page: 1 })}><option value="">All</option>{facets.categories.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Tag</span><select value={filters.tag ?? ""} onChange={(e) => setFilters({ ...filters, tag: e.target.value || undefined, page: 1 })}><option value="">All</option>{facets.tags.map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>
        <div className="skill-library__toolbar"><span>{library.total.toLocaleString()} records</span></div>
        <div className={`skill-library__results${loadingLibrary ? " is-loading" : ""}`}>
          {library.items.map((entry) => <button key={entry.id} type="button" className={`skill-library__row${draft?.id === entry.id ? " is-selected" : ""}`} onClick={() => chooseItem(entry)}>
            <span className="skill-library__row-name">{entry.name}</span>
            <span className="skill-library__row-meta">{entry.recordType} · {entry.category}{entry.equipmentGroup ? ` · ${entry.equipmentGroup}` : ""}</span>
            <span className="skill-library__row-parents">{entry.canonicalId}{entry.tags.length ? ` · ${entry.tags.join(", ")}` : ""}</span>
          </button>)}
          {!library.items.length && !loadingLibrary ? <p className="skill-library__empty">No records match this view.</p> : null}
        </div>
        <nav className="skill-library__pagination"><button type="button" disabled={library.page <= 1 || loadingLibrary} onClick={() => setFilters({ ...filters, page: library.page - 1 })}>Previous</button><span>Page {library.page} of {library.pageCount}</span><button type="button" disabled={library.page >= library.pageCount || loadingLibrary} onClick={() => setFilters({ ...filters, page: library.page + 1 })}>Next</button></nav>
      </aside>

      {loadingEditor ? <section className="skill-editor skill-editor--empty"><p>LOADING ITEM</p></section> : draft ? <section className="skill-editor item-editor">
        <header className="skill-editor__header"><div><p>{draft.id ? `${label.toUpperCase()} ${draft.id}` : `NEW ${label.toUpperCase()} DRAFT`}</p><h2>{draft.core.name || `Untitled ${label}`}</h2><span>{dirty ? "Unsaved changes" : draft.id ? "Saved" : "Not yet persisted"}</span></div><div className="skill-editor__actions">{draft.id && !confirmDelete ? <button className="skills-danger-button" type="button" onClick={() => setConfirmDelete(true)}>Delete</button> : null}<button className="skills-primary-button" type="button" disabled={saving} onClick={() => void persist()}>{saving ? "Saving…" : "Save Item"}</button></div></header>
        {confirmDelete ? <div className="skill-editor__delete-confirm"><div><strong>Delete {draft.core.name || "this Item"}?</strong><span>Variants and references must be removed first.</span></div><button className="skills-danger-button" type="button" onClick={() => void removeItem()}>Confirm Delete</button><button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button></div> : null}
        {feedback ? <p className={`skill-editor__feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
        <nav className="skill-editor__tabs">{visibleTabs.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : ""} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</nav>
        <div className="skill-editor__content item-editor__content">
          {activeTab === "overview" ? <Overview draft={draft} onChange={change} /> : null}
          {activeTab === "properties" ? <Properties draft={draft} onChange={change} /> : null}
          {activeTab === "weapon" ? <Weapon draft={draft} onChange={change} /> : null}
          {activeTab === "armor" && scope === "equipment" ? <Armor draft={draft} references={references} onChange={change} /> : null}
          {activeTab === "tags" ? <Tags draft={draft} references={references} onChange={change} /> : null}
          {activeTab === "variants" ? <Variants draft={draft} onOpen={(summary) => void openItem({ ...summary, equipmentGroup: null, recordType: "", family: "", category: "", tags: [], hasWeaponProfile: false, hasArmorProfile: false })} onSaved={(saved) => { setDraft(saved); setDirty(false); void loadLibrary(filters); }} /> : null}
          {activeTab === "preview" ? <Preview draft={draft} /> : null}
        </div>
      </section> : <section className="skill-editor skill-editor--empty"><p>{label.toUpperCase()} EDITOR</p><h2>Select a record or begin a new one.</h2><span>The shared Item engine powers both authoring libraries.</span></section>}
    </div>

    {pending ? <div className="skills-page__discard-confirm"><div><p>Unsaved changes</p><span>Leave this Item draft and discard the unsaved changes?</span></div><div className="skills-page__discard-actions"><button type="button" onClick={() => setPending(null)}>Keep Editing</button><button className="skills-danger-button" type="button" onClick={discardAndContinue}>Discard Changes</button></div></div> : null}
  </main>;
}

function Overview({ draft, onChange }: { draft: ItemDraft; onChange: (draft: ItemDraft) => void }) {
  const core = draft.core;
  const setCore = (update: Partial<ItemDraft["core"]>) => onChange({ ...draft, core: { ...core, ...update } });
  return <div className="item-section item-form-grid">
    <Field label="Name" wide><input value={core.name} onChange={(e) => setCore({ name: e.target.value })} /></Field>
    <Field label="Canonical ID"><input value={core.canonicalId} disabled placeholder={draft.id ? "" : "Assigned on first save"} /></Field>
    {core.catalogScope === "equipment" ? <Field label="Equipment Group"><select value={core.equipmentGroup ?? "general"} onChange={(e) => setCore({ equipmentGroup: e.target.value as EquipmentCatalogGroup })}>{EQUIPMENT_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}</select></Field> : null}
    <Field label="Record Type"><input value={core.recordType} onChange={(e) => setCore({ recordType: e.target.value })} /></Field>
    <Field label="Family"><input value={core.family} onChange={(e) => setCore({ family: e.target.value })} /></Field>
    <Field label="Category"><input value={core.category} onChange={(e) => setCore({ category: e.target.value })} /></Field>
    <Field label="Subtype"><input value={core.subtype} onChange={(e) => setCore({ subtype: e.target.value })} /></Field>
    <Field label="Credits"><OptionalNumber value={core.credits} min={0} onChange={(credits) => setCore({ credits })} /></Field>
    <Field label="Price Basis"><input value={core.priceBasis} onChange={(e) => setCore({ priceBasis: e.target.value })} /></Field>
    <Field label="Weight"><OptionalNumber value={core.weight} min={0} onChange={(weight) => setCore({ weight })} /></Field>
    <Field label="Weight Unit"><input value={core.weightUnit} onChange={(e) => setCore({ weightUnit: e.target.value })} /></Field>
    <Field label="Size"><input value={core.size} onChange={(e) => setCore({ size: e.target.value })} /></Field>
    <Field label="Durability"><OptionalNumber value={core.durability} min={0} onChange={(durability) => setCore({ durability })} /></Field>
    {core.parentItemId ? <Field label="Variant Of" wide><input disabled value={core.parentItemName ?? `Item ${core.parentItemId}`} /></Field> : null}
    <Field label="Description" wide><textarea rows={8} value={core.description} onChange={(e) => setCore({ description: e.target.value })} /></Field>
  </div>;
}

function Properties({ draft, onChange }: { draft: ItemDraft; onChange: (draft: ItemDraft) => void }) {
  const [relationSearch, setRelationSearch] = useState<Record<number, string>>({});
  const [itemCandidates, setItemCandidates] = useState<Record<number, RelatedItemCandidate[]>>({});
  const [creatureCandidates, setCreatureCandidates] = useState<Record<number, RelatedCreatureCandidate[]>>({});

  useEffect(() => {
    const timers = draft.properties.map((property, index) => window.setTimeout(() => {
      const search = relationSearch[index] ?? "";
      if (!search.trim()) return;
      if (property.relationKind === "item") {
        void findRelatedItems(search, draft.id).then((rows) => setItemCandidates((current) => ({ ...current, [index]: rows })));
      }
      if (property.relationKind === "creature") {
        void findRelatedCreatures(search).then((rows) => setCreatureCandidates((current) => ({ ...current, [index]: rows })));
      }
    }, 180));
    return () => timers.forEach(window.clearTimeout);
  }, [relationSearch, draft.id, draft.properties]);

  return <div className="item-section">
    <SectionHeading eyebrow="STRUCTURED DETAILS" title="Properties" action="Add Property" onAction={() => onChange({ ...draft, properties: [...draft.properties, { propertyName: "", value: "", unit: "", quantity: null, relationKind: "none", relatedItemId: null, relatedItemName: null, relatedCreatureCanonicalId: null, relatedCreatureName: null, notes: "", sortOrder: draft.properties.length }] })} />
    <div className="item-card-list">{draft.properties.map((property, index) => <article className="item-edit-card" key={index}>
      <header><strong>{property.propertyName || `Property ${index + 1}`}</strong><button className="is-danger" type="button" onClick={() => onChange({ ...draft, properties: draft.properties.filter((_, i) => i !== index) })}>Remove</button></header>
      <div className="item-form-grid">
        <Field label="Property Name"><input value={property.propertyName} onChange={(e) => patchProperty(draft, onChange, index, { propertyName: e.target.value })} /></Field>
        <Field label="Value"><input value={property.value} onChange={(e) => patchProperty(draft, onChange, index, { value: e.target.value })} /></Field>
        <Field label="Unit"><input value={property.unit} onChange={(e) => patchProperty(draft, onChange, index, { unit: e.target.value })} /></Field>
        <Field label="Quantity"><OptionalNumber value={property.quantity} min={0} onChange={(quantity) => patchProperty(draft, onChange, index, { quantity })} /></Field>
        <Field label="Relation"><select value={property.relationKind} onChange={(e) => patchProperty(draft, onChange, index, { relationKind: e.target.value as "none" | "item" | "creature", relatedItemId: null, relatedItemName: null, relatedCreatureCanonicalId: null, relatedCreatureName: null })}><option value="none">None</option><option value="item">Related Item</option><option value="creature">Related Creature</option></select></Field>
        {property.relationKind !== "none" ? <Field label="Find Relation"><input value={relationSearch[index] ?? ""} placeholder={property.relationKind === "item" ? "Search Items" : "Search Creatures"} onChange={(e) => setRelationSearch((current) => ({ ...current, [index]: e.target.value }))} /></Field> : null}
        {property.relationKind === "item" ? <Field label="Related Item" wide><select value={property.relatedItemId ?? ""} onChange={(e) => { const id = Number(e.target.value); const candidate = (itemCandidates[index] ?? []).find((row) => row.id === id); patchProperty(draft, onChange, index, { relatedItemId: id || null, relatedItemName: candidate?.name ?? null }); }}><option value="">None selected</option>{property.relatedItemId && property.relatedItemName ? <option value={property.relatedItemId}>{property.relatedItemName}</option> : null}{(itemCandidates[index] ?? []).filter((row) => row.id !== property.relatedItemId).map((row) => <option key={row.id} value={row.id}>{row.name} · {row.canonicalId}</option>)}</select></Field> : null}
        {property.relationKind === "creature" ? <Field label="Related Creature" wide><select value={property.relatedCreatureCanonicalId ?? ""} onChange={(e) => { const candidate = (creatureCandidates[index] ?? []).find((row) => row.canonicalId === e.target.value); patchProperty(draft, onChange, index, { relatedCreatureCanonicalId: e.target.value || null, relatedCreatureName: candidate?.name ?? null }); }}><option value="">None selected</option>{property.relatedCreatureCanonicalId && property.relatedCreatureName ? <option value={property.relatedCreatureCanonicalId}>{property.relatedCreatureName}</option> : null}{(creatureCandidates[index] ?? []).filter((row) => row.canonicalId !== property.relatedCreatureCanonicalId).map((row) => <option key={row.canonicalId} value={row.canonicalId}>{row.name} · {row.family || row.creatureType}</option>)}</select></Field> : null}
        <Field label="Notes" wide><textarea rows={3} value={property.notes} onChange={(e) => patchProperty(draft, onChange, index, { notes: e.target.value })} /></Field>
      </div>
    </article>)}</div>
  </div>;
}

function Weapon({ draft, onChange }: { draft: ItemDraft; onChange: (draft: ItemDraft) => void }) {
  const [ammoSearch, setAmmoSearch] = useState("");
  const [ammoCandidates, setAmmoCandidates] = useState<RelatedItemCandidate[]>([]);
  const profile = draft.weaponProfile;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (ammoSearch.trim()) void findRelatedItems(ammoSearch, draft.id).then(setAmmoCandidates);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [ammoSearch, draft.id]);
  if (!profile) return <div className="item-section item-empty-profile"><p>WEAPON / AMMUNITION PROFILE</p><h3>This Item has no weapon or ammunition mechanics yet.</h3><button className="skills-primary-button" type="button" onClick={() => onChange({ ...draft, weaponProfile: { profileRecordType: draft.core.recordType, weaponType: "", handedness: "", damageSource: "", damage: "", initiativeCost: null, damageType: "", range: "", reach: "", ammunitionItemId: null, ammunitionItemName: null, compatibility: "", capacity: "", fireModes: [], rateOfFire: "", reloadInitiative: "", rulesText: "" } })}>Add Weapon / Ammunition Profile</button></div>;
  const patch = (update: Partial<NonNullable<ItemDraft["weaponProfile"]>>) => onChange({ ...draft, weaponProfile: { ...profile, ...update } });
  const ammunitionProfile = profile.profileRecordType.trim().toLowerCase() === "ammunition" || draft.core.recordType.trim().toLowerCase() === "ammunition";
  return <div className="item-section item-form-grid">
    <div className="item-profile-banner item-field--wide"><div><p>WEAPON / AMMUNITION PROFILE</p><h3>{ammunitionProfile ? "Ammunition Damage & Mechanics" : "Combat Equipment"}</h3></div><button className="skills-danger-button" type="button" onClick={() => onChange({ ...draft, weaponProfile: null })}>Remove Profile</button></div>
    <Field label="Profile Record Type"><input value={profile.profileRecordType} onChange={(e) => patch({ profileRecordType: e.target.value })} /></Field>
    <Field label="Weapon Type"><input value={profile.weaponType} onChange={(e) => patch({ weaponType: e.target.value })} /></Field><Field label="Handedness"><input value={profile.handedness} onChange={(e) => patch({ handedness: e.target.value })} /></Field>
    <Field label="Damage Source"><input value={profile.damageSource} onChange={(e) => patch({ damageSource: e.target.value })} /></Field><Field label="Damage"><input value={profile.damage} onChange={(e) => patch({ damage: e.target.value })} /></Field>
    <Field label="Damage Type"><input value={profile.damageType} onChange={(e) => patch({ damageType: e.target.value })} /></Field><Field label="Initiative Cost"><OptionalNumber value={profile.initiativeCost} min={1} step={1} onChange={(initiativeCost) => patch({ initiativeCost })} /></Field>
    <Field label="Range"><input value={profile.range} onChange={(e) => patch({ range: e.target.value })} /></Field>
    <Field label="Reach"><input value={profile.reach} onChange={(e) => patch({ reach: e.target.value })} /></Field><Field label="Capacity"><input value={profile.capacity} onChange={(e) => patch({ capacity: e.target.value })} /></Field>
    <Field label="Rate of Fire"><input value={profile.rateOfFire} onChange={(e) => patch({ rateOfFire: e.target.value })} /></Field><Field label="Reload Initiative"><input value={profile.reloadInitiative} onChange={(e) => patch({ reloadInitiative: e.target.value })} /></Field>
    <Field label="Find Ammunition"><input value={ammoSearch} onChange={(e) => setAmmoSearch(e.target.value)} /></Field><Field label="Ammunition Item"><select value={profile.ammunitionItemId ?? ""} onChange={(e) => { const id = Number(e.target.value); const candidate = ammoCandidates.find((row) => row.id === id); patch({ ammunitionItemId: id || null, ammunitionItemName: candidate?.name ?? null }); }}><option value="">None</option>{profile.ammunitionItemId && profile.ammunitionItemName ? <option value={profile.ammunitionItemId}>{profile.ammunitionItemName}</option> : null}{ammoCandidates.filter((row) => row.id !== profile.ammunitionItemId).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
    <Field label="Fire Modes" wide><input value={profile.fireModes.join(", ")} placeholder="Single, Burst, Automatic" onChange={(e) => patch({ fireModes: e.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></Field>
    <Field label="Compatibility" wide><textarea rows={3} value={profile.compatibility} onChange={(e) => patch({ compatibility: e.target.value })} /></Field>
    <Field label="Weapon Rules" wide><textarea rows={6} value={profile.rulesText} onChange={(e) => patch({ rulesText: e.target.value })} /></Field>
  </div>;
}

function Armor({ draft, references, onChange }: { draft: ItemDraft; references: ItemAuthoringReferences; onChange: (draft: ItemDraft) => void }) {
  const profile = draft.armorProfile;
  if (!profile) return <div className="item-section item-empty-profile"><p>ARMOR PROFILE</p><h3>This Item is not configured as armor.</h3><button className="skills-primary-button" type="button" onClick={() => onChange({ ...draft, core: { ...draft.core, equipmentGroup: "armor" }, armorProfile: { armorType: "", coverage: "", baseSoak: null, damageModifiersSourceText: "", damageModifiers: [], coveredBodyLocationKeys: [], rulesText: "" } })}>Add Armor Profile</button></div>;
  const patch = (update: Partial<NonNullable<ItemDraft["armorProfile"]>>) => onChange({ ...draft, core: { ...draft.core, equipmentGroup: "armor" }, armorProfile: { ...profile, ...update } });
  return <div className="item-section">
    <div className="item-profile-banner"><div><p>ARMOR PROFILE</p><h3>Protection & Coverage</h3></div><button className="skills-danger-button" type="button" onClick={() => onChange({ ...draft, armorProfile: null })}>Remove Profile</button></div>
    <div className="item-form-grid"><Field label="Armor Type"><input value={profile.armorType} onChange={(e) => patch({ armorType: e.target.value })} /></Field><Field label="Base Soak"><OptionalNumber value={profile.baseSoak} min={0} onChange={(baseSoak) => patch({ baseSoak })} /></Field><Field label="Coverage" wide><input value={profile.coverage} onChange={(e) => patch({ coverage: e.target.value })} /></Field></div>
    <SectionHeading eyebrow="HIT LOCATION COVERAGE" title="Covered Body Locations" />
    <div className="item-location-grid">{references.armorBodyLocations.map((location) => <label key={location.key} className={profile.coveredBodyLocationKeys.includes(location.key) ? "is-selected" : ""}><input type="checkbox" checked={profile.coveredBodyLocationKeys.includes(location.key)} onChange={(e) => patch({ coveredBodyLocationKeys: e.target.checked ? [...profile.coveredBodyLocationKeys, location.key] : profile.coveredBodyLocationKeys.filter((key) => key !== location.key) })} /><span>{location.key}</span><strong>{location.label}</strong></label>)}</div>
    <SectionHeading eyebrow="DAMAGE INTERACTIONS" title="Damage Modifiers" action="Add Modifier" onAction={() => patch({ damageModifiers: [...profile.damageModifiers, { modifierText: "", damageType: "", modifier: "", notes: "", sortOrder: profile.damageModifiers.length }] })} />
    <div className="item-row-list">{profile.damageModifiers.map((row, index) => <div className="item-repeat-row item-modifier-row" key={index}><input placeholder="Damage Type" value={row.damageType} onChange={(e) => patch({ damageModifiers: profile.damageModifiers.map((entry, i) => i === index ? { ...entry, damageType: e.target.value } : entry) })} /><input placeholder="Modifier" value={row.modifier} onChange={(e) => patch({ damageModifiers: profile.damageModifiers.map((entry, i) => i === index ? { ...entry, modifier: e.target.value } : entry) })} /><input placeholder="Source Text" value={row.modifierText} onChange={(e) => patch({ damageModifiers: profile.damageModifiers.map((entry, i) => i === index ? { ...entry, modifierText: e.target.value } : entry) })} /><input placeholder="Notes" value={row.notes} onChange={(e) => patch({ damageModifiers: profile.damageModifiers.map((entry, i) => i === index ? { ...entry, notes: e.target.value } : entry) })} /><button className="is-danger" type="button" onClick={() => patch({ damageModifiers: profile.damageModifiers.filter((_, i) => i !== index) })}>Remove</button></div>)}</div>
    <div className="item-form-grid"><Field label="Damage Modifier Source" wide><textarea rows={4} value={profile.damageModifiersSourceText} onChange={(e) => patch({ damageModifiersSourceText: e.target.value })} /></Field><Field label="Armor Rules" wide><textarea rows={6} value={profile.rulesText} onChange={(e) => patch({ rulesText: e.target.value })} /></Field></div>
  </div>;
}

function Tags({ draft, references, onChange }: { draft: ItemDraft; references: ItemAuthoringReferences; onChange: (draft: ItemDraft) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, ItemAuthoringReferences["tags"]>();
    for (const tag of references.tags) map.set(tag.tagGroup, [...(map.get(tag.tagGroup) ?? []), tag]);
    return [...map.entries()];
  }, [references]);
  return <div className="item-section"><div className="skill-editor__intro"><p>Tags are shared canonical metadata used for searching and campaign authorization.</p></div>{groups.length ? groups.map(([group, tags]) => <section className="item-tag-group" key={group}><h3>{group || "General"}</h3><div>{tags.map((tag) => <label key={tag.name} className={draft.tags.includes(tag.name) ? "is-selected" : ""} title={tag.description}><input type="checkbox" checked={draft.tags.includes(tag.name)} onChange={(e) => onChange({ ...draft, tags: e.target.checked ? [...draft.tags, tag.name] : draft.tags.filter((name) => name !== tag.name) })} /><strong>{tag.name}</strong><span>{tag.description}</span></label>)}</div></section>) : <p className="skill-library__empty">Tag references will appear after the canon import.</p>}</div>;
}

function Variants({ draft, onOpen, onSaved }: { draft: ItemDraft; onOpen: (summary: ItemDraft["variants"][number]) => void; onSaved: (saved: ItemDraft) => void }) {
  const [variantName, setVariantName] = useState("");
  const [cloning, setCloning] = useState(false);
  async function clone() {
    if (!draft.id || !variantName.trim()) return;
    setCloning(true);
    try { const saved = await createItemVariant(draft.id, variantName); onSaved(saved); setVariantName(""); } finally { setCloning(false); }
  }
  return <div className="item-section"><SectionHeading eyebrow="INHERITANCE" title="Item Variants" />{draft.id ? <div className="item-variant-create"><input placeholder="Variant name" value={variantName} onChange={(e) => setVariantName(e.target.value)} /><button className="skills-primary-button" type="button" disabled={!variantName.trim() || cloning} onClick={() => void clone()}>{cloning ? "Cloning…" : "Clone as Variant"}</button></div> : <p className="skill-library__empty">Save this Item before creating variants.</p>}<div className="item-variant-list">{draft.variants.map((variant) => <button key={variant.id} type="button" onClick={() => onOpen(variant)}><strong>{variant.name}</strong><span>{variant.canonicalId} · {variant.catalogScope}</span></button>)}</div></div>;
}

function Preview({ draft }: { draft: ItemDraft }) {
  return <article className="item-preview"><header><p>{draft.core.catalogScope}{draft.core.equipmentGroup ? ` / ${draft.core.equipmentGroup}` : ""}</p><h3>{draft.core.name || "Untitled Item"}</h3><span>{draft.core.canonicalId || "Canonical ID assigned on save"} · {draft.core.recordType} · {draft.core.category}</span></header><div className="item-preview__facts"><div><dt>Credits</dt><dd>{draft.core.credits ?? "—"}</dd></div><div><dt>Price Basis</dt><dd>{draft.core.priceBasis || "—"}</dd></div><div><dt>Weight</dt><dd>{draft.core.weight === null ? "—" : `${draft.core.weight} ${draft.core.weightUnit}`}</dd></div><div><dt>Size</dt><dd>{draft.core.size || "—"}</dd></div><div><dt>Durability</dt><dd>{draft.core.durability ?? "—"}</dd></div></div><section><h4>Description</h4><p>{draft.core.description || "No description."}</p></section>{draft.weaponProfile ? <section><h4>Weapon Profile</h4><p>{draft.weaponProfile.weaponType || "Weapon"} · {draft.weaponProfile.damage || "—"} {draft.weaponProfile.damageType} · Range {draft.weaponProfile.range || "—"}</p><p>{draft.weaponProfile.rulesText || "No additional weapon rules."}</p></section> : null}{draft.armorProfile ? <section><h4>Armor Profile</h4><p>{draft.armorProfile.armorType || "Armor"} · Soak {draft.armorProfile.baseSoak ?? "—"} · {draft.armorProfile.coverage || "Coverage not specified"}</p><p>{draft.armorProfile.rulesText || "No additional armor rules."}</p></section> : null}<section><h4>Properties</h4>{draft.properties.length ? <ul>{draft.properties.map((property, index) => <li key={index}><strong>{property.propertyName}</strong>: {property.value || "—"}{property.unit ? ` ${property.unit}` : ""}{property.quantity ? ` ×${property.quantity}` : ""}</li>)}</ul> : <p>No properties.</p>}</section><section><h4>Tags</h4><div className="item-preview__chips">{draft.tags.length ? draft.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>None</span>}</div></section></article>;
}

function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="item-subheading"><div><p>{eyebrow}</p><h3>{title}</h3></div>{action && onAction ? <button type="button" onClick={onAction}>{action}</button> : null}</div>;
}

function patchProperty(draft: ItemDraft, onChange: (draft: ItemDraft) => void, index: number, update: Partial<ItemDraft["properties"][number]>) {
  onChange({ ...draft, properties: draft.properties.map((entry, i) => i === index ? { ...entry, ...update } : entry) });
}
