"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EQUIPMENT_GROUPS, type EquipmentCatalogGroup, type ItemCatalogScope } from "@/db/item-schema";
import {
  DEFAULT_ITEM_RUNTIME_PROFILE,
  formatItemActivatedUse,
  validateItemRuntimeProfile,
  type ItemRuntimeProfile,
  type ItemUseMode,
} from "@/features/items/item-runtime";
import {
  FIREARM_DELIVERY_CADENCES,
  resolveFirearmFiringMode,
  type FirearmFiringModeDraft,
} from "@/features/items/firearm-timing";
import {
  PASSIVE_REQUIRED_EQUIPMENT_STATES,
  passiveLifecycleLabel,
  validatePassiveItemEffect,
  type ItemPassiveEffectDefinition,
  type PassiveRequiredEquipmentState,
} from "@/features/items/equipment-state";
import {
  formatMechanicalEffectSummary,
  MODIFIER_ATTRIBUTE_KEYS,
  TEMPORARY_MODIFIER_CHANNELS,
  validateMechanicalEffect,
  type MechanicalEffect,
} from "@/features/mechanical-effects";

import {
  createItemVariant,
  deleteItem,
  findRelatedCreatures,
  findRelatedItems,
  getItem,
  getWeaponSkillGovernance,
  listItemAuthoringReferences,
  listItemFacets,
  listItems,
  saveItem,
  saveCanonicalWeaponSkillGovernance,
  type ItemAuthoringReferences,
  type ItemDraft,
  type ItemFacets,
  type ItemLibraryFilters,
  type ItemLibraryResult,
  type ItemSummary,
  type RelatedCreatureCandidate,
  type RelatedItemCandidate,
} from "./actions";
import type {
  WeaponSkillGovernanceReadModel,
  WeaponSkillPathMappingDraft,
} from "@/features/items/weapon-skill-governance-service";

type Tab = "overview" | "properties" | "effects" | "weapon" | "armor" | "tags" | "variants" | "preview";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "properties", label: "Properties" },
  { id: "effects", label: "Effects" },
  { id: "weapon", label: "Weapon / Ammunition" },
  { id: "armor", label: "Armor" },
  { id: "tags", label: "Tags" },
  { id: "variants", label: "Variants" },
  { id: "preview", label: "Preview" },
];

function titleFor(scope: ItemCatalogScope) {
  return scope === "equipment" ? "Equipment" : "Inventory";
}

function itemRuntimeIndicators(entry: Pick<ItemSummary, "isMagical" | "useMode">): string[] {
  const indicators: string[] = [];
  if (entry.isMagical) indicators.push("Magical");
  if (entry.useMode === "consume-item") indicators.push("Consumable");
  if (entry.useMode === "charges") indicators.push("Charged");
  if (entry.useMode === "unlimited") indicators.push("Unlimited");
  return indicators;
}

function newItemDraft(scope: ItemCatalogScope): ItemDraft {
  return {
    isMagical: false,
    runtimeProfile: { ...DEFAULT_ITEM_RUNTIME_PROFILE },
    effects: [],
    passiveEffects: [],
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

function moveFiringMode(modes: readonly FirearmFiringModeDraft[], index: number, direction: -1 | 1): FirearmFiringModeDraft[] {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= modes.length) return [...modes];
  const next = modes.map((mode) => ({ ...mode }));
  [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
  return next.map((mode, sortOrder) => ({ ...mode, sortOrder }));
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

  async function openItem(summary: Pick<ItemSummary, "id">) {
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
            <span className="skill-library__row-parents">{entry.canonicalId}{entry.tags.length ? ` · ${entry.tags.join(", ")}` : ""}{itemRuntimeIndicators(entry).length ? ` · ${itemRuntimeIndicators(entry).join(" · ")}` : ""}</span>
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
          {activeTab === "effects" ? <Effects draft={draft} skills={references.skills} onChange={change} /> : null}
          {activeTab === "weapon" ? <Weapon draft={draft} references={references} itemDirty={dirty} onChange={change} /> : null}
          {activeTab === "armor" && scope === "equipment" ? <Armor draft={draft} references={references} onChange={change} /> : null}
          {activeTab === "tags" ? <Tags draft={draft} references={references} onChange={change} /> : null}
          {activeTab === "variants" ? <Variants draft={draft} onOpen={(summary) => void openItem(summary)} onSaved={(saved) => { setDraft(saved); setDirty(false); void loadLibrary(filters); }} /> : null}
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
    <label className="item-magical-toggle item-field--wide"><input type="checkbox" checked={draft.isMagical} onChange={(event) => onChange({ ...draft, isMagical: event.target.checked })} /><span><strong>Magical Item</strong><small>Explicit classification only; this does not add effects or charges.</small></span></label>
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

function runtimeProfileForMode(
  profile: ItemRuntimeProfile,
  useMode: ItemUseMode,
): ItemRuntimeProfile {
  const base = {
    useMode,
    activationLabel: profile.activationLabel,
    useNotes: profile.useNotes,
    rechargeNotes: useMode === "charges" ? profile.rechargeNotes : "",
  };
  if (useMode === "consume-item") {
    return {
      ...base,
      quantityPerUse: profile.quantityPerUse && profile.quantityPerUse > 0
        ? profile.quantityPerUse
        : 1,
      maximumCharges: null,
      chargesPerUse: null,
    };
  }
  if (useMode === "charges") {
    const maximumCharges = profile.maximumCharges && profile.maximumCharges > 0
      ? profile.maximumCharges
      : 1;
    const chargesPerUse = profile.chargesPerUse
      && profile.chargesPerUse > 0
      && profile.chargesPerUse <= maximumCharges
      ? profile.chargesPerUse
      : 1;
    return {
      ...base,
      quantityPerUse: null,
      maximumCharges,
      chargesPerUse,
    };
  }
  return {
    ...base,
    quantityPerUse: null,
    maximumCharges: null,
    chargesPerUse: null,
  };
}

function newMechanicalEffect(kind: MechanicalEffect["kind"]): MechanicalEffect {
  if (kind === "health.heal") return { kind, amount: 1, scope: "full-body" };
  if (kind === "health.damage") return { kind, amount: 1, application: "localized" };
  if (kind === "condition.apply") return { kind, name: "", description: "", duration: { kind: "until-removed", value: null } };
  if (kind === "modifier.apply") return { kind, label: "", channel: "initiative", targetKey: "self", amount: 1, duration: { kind: "until-removed", value: null } };
  return { kind, title: "", description: "" };
}

function Effects({ draft, skills, onChange }: { draft: ItemDraft; skills: ItemAuthoringReferences["skills"]; onChange: (draft: ItemDraft) => void }) {
  const profile = draft.runtimeProfile;
  const profileValidation = validateItemRuntimeProfile(profile);
  const patchProfile = (update: Partial<ItemRuntimeProfile>) => onChange({
    ...draft,
    runtimeProfile: { ...profile, ...update },
  });
  const replaceEffect = (index: number, effect: MechanicalEffect) => onChange({
    ...draft,
    effects: draft.effects.map((entry, effectIndex) => effectIndex === index ? effect : entry),
  });
  const moveEffect = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.effects.length) return;
    const effects = [...draft.effects];
    [effects[index], effects[target]] = [effects[target], effects[index]];
    onChange({ ...draft, effects });
  };

  return <div className="item-section item-effects-editor">
    <SectionHeading eyebrow="ACTIVATION / USE" title="Runtime Use Profile" />
    <div className="item-form-grid">
      <Field label="Use Mode"><select value={profile.useMode} onChange={(event) => onChange({ ...draft, runtimeProfile: runtimeProfileForMode(profile, event.target.value as ItemUseMode) })}><option value="none">No Activated Use</option><option value="consume-item">Consume Item</option><option value="charges">Charges</option><option value="unlimited">Unlimited</option></select></Field>
      <Field label="Activation Label"><input value={profile.activationLabel} placeholder="Use" onChange={(event) => patchProfile({ activationLabel: event.target.value })} /></Field>
      {profile.useMode === "consume-item" ? <Field label="Quantity Consumed Per Use"><OptionalNumber value={profile.quantityPerUse} min={1} step={1} onChange={(quantityPerUse) => patchProfile({ quantityPerUse })} /></Field> : null}
      {profile.useMode === "charges" ? <><Field label="Maximum Charges"><OptionalNumber value={profile.maximumCharges} min={1} step={1} onChange={(maximumCharges) => patchProfile({ maximumCharges })} /></Field><Field label="Charges Per Use"><OptionalNumber value={profile.chargesPerUse} min={1} step={1} onChange={(chargesPerUse) => patchProfile({ chargesPerUse })} /></Field><Field label="Recharge Rule / Notes" wide><textarea rows={4} value={profile.rechargeNotes} placeholder="Example: Regains 1d4 Charges at sunrise." onChange={(event) => patchProfile({ rechargeNotes: event.target.value })} /></Field></> : null}
      <Field label="Use Notes" wide><textarea rows={4} value={profile.useNotes} placeholder="Optional runtime-use guidance" onChange={(event) => patchProfile({ useNotes: event.target.value })} /></Field>
    </div>
    {profile.useMode === "charges" ? <p className="item-runtime-note">Recharge rules are descriptive. The program does not roll, schedule, or detect when recharge occurs; authorized users update each owned copy manually.</p> : null}
    {profile.useMode === "unlimited" ? <p className="item-runtime-note">Activating this Item does not consume Item quantity or charges.</p> : null}
    {!profileValidation.valid ? <ul className="item-validation-list">{profileValidation.issues.map((issue) => <li key={`${issue.path}-${issue.message}`}>{issue.message}</li>)}</ul> : null}

    <SectionHeading eyebrow="ACTIVATED MECHANICAL EFFECTS" title="Ordered Effects" action="Add Effect" onAction={() => onChange({ ...draft, effects: [...draft.effects, newMechanicalEffect("health.heal")] })} />
    {!draft.effects.length ? <div className="item-empty-profile"><p>NO EFFECTS DEFINED</p><h3>This Item may still retain a descriptive use profile for future behavior.</h3></div> : null}
    <div className="item-card-list">{draft.effects.map((effect, index) => {
      const validation = validateMechanicalEffect(effect);
      return <article className="item-edit-card item-effect-card" key={index}>
        <header><div><strong>{validation.valid ? formatMechanicalEffectSummary(validation.effect) : `Effect ${index + 1}`}</strong><span>Effect {index + 1}</span></div><div className="item-effect-card__actions"><button type="button" disabled={index === 0} onClick={() => moveEffect(index, -1)}>Up</button><button type="button" disabled={index === draft.effects.length - 1} onClick={() => moveEffect(index, 1)}>Down</button><button className="is-danger" type="button" onClick={() => onChange({ ...draft, effects: draft.effects.filter((_, effectIndex) => effectIndex !== index) })}>Remove</button></div></header>
        <div className="item-form-grid">
          <Field label="Effect"><select value={effect.kind} onChange={(event) => replaceEffect(index, newMechanicalEffect(event.target.value as MechanicalEffect["kind"]))}><option value="health.heal">Health Healing</option><option value="health.damage">Health Damage</option><option value="condition.apply">Apply Condition</option><option value="modifier.apply">Apply Temporary Modifier</option><option value="manual">Manual / G.O.D. Resolution</option></select></Field>
          {effect.kind === "health.heal" ? <><Field label="Amount"><input type="number" min={0} step="any" value={effect.amount} onChange={(event) => replaceEffect(index, { ...effect, amount: Number(event.target.value) })} /></Field><Field label="Application"><select value={effect.scope} onChange={(event) => replaceEffect(index, { ...effect, scope: event.target.value as "full-body" | "area" })}><option value="full-body">Full Body</option><option value="area">Area Applied</option></select></Field></> : null}
          {effect.kind === "health.damage" ? <><Field label="Amount"><input type="number" min={0} step="any" value={effect.amount} onChange={(event) => replaceEffect(index, { ...effect, amount: Number(event.target.value) })} /></Field><Field label="Application"><select value={effect.application} disabled><option value="localized">Localized</option></select></Field></> : null}
          {effect.kind === "condition.apply" ? <><Field label="Condition Name"><input value={effect.name} onChange={(event) => replaceEffect(index, { ...effect, name: event.target.value })} /></Field><Field label="Duration"><select value={effect.duration.kind} onChange={(event) => { const kind = event.target.value as "until-removed" | "scene" | "combat-steps" | "combat-rounds"; replaceEffect(index, { ...effect, duration: kind === "combat-steps" || kind === "combat-rounds" ? { kind, value: 1 } : { kind, value: null } }); }}><option value="until-removed">Until Removed</option><option value="scene">Scene</option><option value="combat-steps">Combat Steps</option><option value="combat-rounds">Combat Rounds</option></select></Field>{effect.duration.kind === "combat-steps" || effect.duration.kind === "combat-rounds" ? <Field label="Duration Count"><input type="number" min={1} step={1} value={effect.duration.value ?? 1} onChange={(event) => replaceEffect(index, { ...effect, duration: { ...effect.duration, value: Number(event.target.value) } })} /></Field> : null}<Field label="Description" wide><textarea rows={4} value={effect.description} onChange={(event) => replaceEffect(index, { ...effect, description: event.target.value })} /></Field></> : null}
          {effect.kind === "modifier.apply" ? <>
            <Field label="Label"><input value={effect.label} onChange={(event) => replaceEffect(index, { ...effect, label: event.target.value })} /></Field>
            <Field label="Channel"><select value={effect.channel} onChange={(event) => {
              const channel = event.target.value as typeof effect.channel;
              const targetKey = channel === "attribute" ? "STR" : channel === "skill" ? `skill:${skills[0]?.id ?? ""}` : channel === "movement" ? "movement:Land" : "self";
              replaceEffect(index, { ...effect, channel, targetKey });
            }}>{TEMPORARY_MODIFIER_CHANNELS.map((channel) => <option key={channel} value={channel}>{channel}</option>)}</select></Field>
            {effect.channel === "attribute" ? <Field label="Attribute"><select value={effect.targetKey} onChange={(event) => replaceEffect(index, { ...effect, targetKey: event.target.value })}>{MODIFIER_ATTRIBUTE_KEYS.map((key) => <option key={key}>{key}</option>)}</select></Field> : null}
            {effect.channel === "skill" ? <Field label="Skill"><select value={effect.targetKey} onChange={(event) => replaceEffect(index, { ...effect, targetKey: event.target.value })}><option value="">Choose Skill</option>{skills.map((entry) => <option key={entry.id} value={`skill:${entry.id}`}>{entry.name} · #{entry.id}</option>)}</select></Field> : null}
            {effect.channel === "movement" ? <Field label="Movement Mode"><input value={effect.targetKey.replace("movement:", "")} onChange={(event) => replaceEffect(index, { ...effect, targetKey: `movement:${event.target.value}` })} /></Field> : null}
            <Field label="Amount"><input type="number" step={1} value={effect.amount} onChange={(event) => replaceEffect(index, { ...effect, amount: Number(event.target.value) })} /></Field>
            <Field label="Duration"><select value={effect.duration.kind} onChange={(event) => {
              const kind = event.target.value as "until-removed" | "scene" | "combat-steps" | "combat-rounds";
              replaceEffect(index, { ...effect, duration: kind === "combat-steps" || kind === "combat-rounds" ? { kind, value: 1 } : { kind, value: null } });
            }}><option value="until-removed">Until Removed</option><option value="scene">Scene</option><option value="combat-steps">Combat Steps</option><option value="combat-rounds">Combat Rounds</option></select></Field>
            {effect.duration.kind === "combat-steps" || effect.duration.kind === "combat-rounds" ? <Field label="Duration Count"><input type="number" min={1} step={1} value={effect.duration.value ?? 1} onChange={(event) => replaceEffect(index, { ...effect, duration: { ...effect.duration, value: Number(event.target.value) } })} /></Field> : null}
          </> : null}
          {effect.kind === "manual" ? <><Field label="Title"><input value={effect.title} onChange={(event) => replaceEffect(index, { ...effect, title: event.target.value })} /></Field><Field label="Description" wide><textarea rows={5} value={effect.description} onChange={(event) => replaceEffect(index, { ...effect, description: event.target.value })} /></Field><p className="item-runtime-note item-field--wide">Manual effects are shown during runtime but are resolved by the G.O.D. rather than automatically applied by the software.</p></> : null}
        </div>
        {!validation.valid ? <ul className="item-validation-list">{validation.issues.map((issue) => <li key={`${issue.path}-${issue.message}`}>{issue.message}</li>)}</ul> : null}
      </article>;
    })}</div>
    <PassiveEffectsEditor draft={draft} skills={skills} onChange={onChange} />
  </div>;
}

type PassiveEffectKind = "condition.apply" | "modifier.apply" | "manual";

function newPassiveMechanicalEffect(
  kind: PassiveEffectKind,
  requiredEquipmentState: PassiveRequiredEquipmentState,
): MechanicalEffect {
  const lifecycle = { kind: "until-removed" as const, value: null, label: passiveLifecycleLabel(requiredEquipmentState) };
  if (kind === "condition.apply") return { kind, name: "", description: "", duration: lifecycle };
  if (kind === "modifier.apply") return { kind, label: "", channel: "attribute", targetKey: "STR", amount: 1, duration: lifecycle };
  return { kind, title: "", description: "" };
}

function withPassiveLifecycle(
  effect: MechanicalEffect,
  requiredEquipmentState: PassiveRequiredEquipmentState,
): MechanicalEffect {
  return effect.kind === "condition.apply" || effect.kind === "modifier.apply"
    ? { ...effect, duration: { kind: "until-removed", value: null, label: passiveLifecycleLabel(requiredEquipmentState) } }
    : effect;
}

function PassiveEffectsEditor({
  draft,
  skills,
  onChange,
}: {
  draft: ItemDraft;
  skills: ItemAuthoringReferences["skills"];
  onChange: (draft: ItemDraft) => void;
}) {
  if (draft.core.catalogScope !== "equipment") {
    return <section className="item-passive-effects"><SectionHeading eyebrow="PASSIVE EFFECTS" title="Equipment State Passives" /><p className="item-runtime-note">Inventory-only Items cannot define Equipment State passives.</p></section>;
  }
  const replace = (index: number, entry: ItemPassiveEffectDefinition) => onChange({
    ...draft,
    passiveEffects: draft.passiveEffects.map((current, entryIndex) => entryIndex === index ? entry : current),
  });
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.passiveEffects.length) return;
    const passiveEffects = [...draft.passiveEffects];
    [passiveEffects[index], passiveEffects[target]] = [passiveEffects[target], passiveEffects[index]];
    onChange({ ...draft, passiveEffects });
  };
  return <section className="item-passive-effects">
    <SectionHeading eyebrow="PASSIVE EFFECTS" title="Equipment State Passives" action="Add Passive" onAction={() => onChange({
      ...draft,
      passiveEffects: [...draft.passiveEffects, {
        id: null,
        requiredEquipmentState: "equipped",
        effect: newPassiveMechanicalEffect("modifier.apply", "equipped"),
      }],
    })} />
    <p className="item-runtime-note">Passive Conditions and Modifiers remain active only while at least one owned copy satisfies the selected Equipment State. Identical copies do not multiply the same passive definition.</p>
    {!draft.passiveEffects.length ? <div className="item-empty-profile"><p>NO PASSIVE EFFECTS</p><h3>This Equipment creates no automatic state merely because it is equipped.</h3></div> : null}
    <div className="item-card-list">{draft.passiveEffects.map((entry, index) => {
      let validationMessage: string | null = null;
      try { validatePassiveItemEffect(entry); } catch (error) { validationMessage = error instanceof Error ? error.message : "Passive Effect is invalid."; }
      const effect = entry.effect;
      return <article className="item-edit-card item-effect-card" key={entry.id ?? `new-${index}`}>
        <header><div><strong>{effect.kind === "manual" ? effect.title || `Passive ${index + 1}` : formatMechanicalEffectSummary(effect)}</strong><span>{passiveLifecycleLabel(entry.requiredEquipmentState)} · {entry.id ? `Stable effect #${entry.id}` : "New definition"}</span></div><div className="item-effect-card__actions"><button type="button" disabled={index === 0} onClick={() => move(index, -1)}>Up</button><button type="button" disabled={index === draft.passiveEffects.length - 1} onClick={() => move(index, 1)}>Down</button><button className="is-danger" type="button" onClick={() => onChange({ ...draft, passiveEffects: draft.passiveEffects.filter((_, effectIndex) => effectIndex !== index) })}>Remove</button></div></header>
        <div className="item-form-grid">
          <Field label="Required Equipment State"><select value={entry.requiredEquipmentState} onChange={(event) => {
            const requiredEquipmentState = event.target.value as PassiveRequiredEquipmentState;
            replace(index, { ...entry, requiredEquipmentState, effect: withPassiveLifecycle(entry.effect, requiredEquipmentState) });
          }}>{PASSIVE_REQUIRED_EQUIPMENT_STATES.map((state) => <option key={state} value={state}>{state[0].toUpperCase() + state.slice(1)}</option>)}</select></Field>
          <Field label="Passive Effect"><select value={effect.kind} onChange={(event) => replace(index, { ...entry, effect: newPassiveMechanicalEffect(event.target.value as PassiveEffectKind, entry.requiredEquipmentState) })}><option value="condition.apply">Apply Condition</option><option value="modifier.apply">Apply Temporary Modifier</option><option value="manual">Manual / G.O.D. Resolution</option></select></Field>
          {effect.kind === "condition.apply" ? <><Field label="Condition Name"><input value={effect.name} onChange={(event) => replace(index, { ...entry, effect: { ...effect, name: event.target.value } })} /></Field><Field label="Lifecycle"><input disabled value={passiveLifecycleLabel(entry.requiredEquipmentState)} /></Field><Field label="Description" wide><textarea rows={4} value={effect.description} onChange={(event) => replace(index, { ...entry, effect: { ...effect, description: event.target.value } })} /></Field></> : null}
          {effect.kind === "modifier.apply" ? <>
            <Field label="Label"><input value={effect.label} onChange={(event) => replace(index, { ...entry, effect: { ...effect, label: event.target.value } })} /></Field>
            <Field label="Channel"><select value={effect.channel} onChange={(event) => {
              const channel = event.target.value as typeof effect.channel;
              const targetKey = channel === "attribute" ? "STR" : channel === "skill" ? `skill:${skills[0]?.id ?? ""}` : channel === "movement" ? "movement:Land" : "self";
              replace(index, { ...entry, effect: { ...effect, channel, targetKey } });
            }}>{TEMPORARY_MODIFIER_CHANNELS.map((channel) => <option key={channel} value={channel}>{channel}</option>)}</select></Field>
            {effect.channel === "attribute" ? <Field label="Attribute"><select value={effect.targetKey} onChange={(event) => replace(index, { ...entry, effect: { ...effect, targetKey: event.target.value } })}>{MODIFIER_ATTRIBUTE_KEYS.map((key) => <option key={key}>{key}</option>)}</select></Field> : null}
            {effect.channel === "skill" ? <Field label="Skill"><select value={effect.targetKey} onChange={(event) => replace(index, { ...entry, effect: { ...effect, targetKey: event.target.value } })}><option value="">Choose Skill</option>{skills.map((skill) => <option key={skill.id} value={`skill:${skill.id}`}>{skill.name} · #{skill.id}</option>)}</select></Field> : null}
            {effect.channel === "movement" ? <Field label="Movement Mode"><input value={effect.targetKey.replace("movement:", "")} onChange={(event) => replace(index, { ...entry, effect: { ...effect, targetKey: `movement:${event.target.value}` } })} /></Field> : null}
            <Field label="Amount"><input type="number" step={1} value={effect.amount} onChange={(event) => replace(index, { ...entry, effect: { ...effect, amount: Number(event.target.value) } })} /></Field>
            <Field label="Lifecycle"><input disabled value={passiveLifecycleLabel(entry.requiredEquipmentState)} /></Field>
          </> : null}
          {effect.kind === "manual" ? <><Field label="Title"><input value={effect.title} onChange={(event) => replace(index, { ...entry, effect: { ...effect, title: event.target.value } })} /></Field><Field label="Lifecycle"><input disabled value={passiveLifecycleLabel(entry.requiredEquipmentState)} /></Field><Field label="Instructions" wide><textarea rows={4} value={effect.description} onChange={(event) => replace(index, { ...entry, effect: { ...effect, description: event.target.value } })} /></Field></> : null}
        </div>
        {validationMessage ? <ul className="item-validation-list"><li>{validationMessage}</li></ul> : null}
      </article>;
    })}</div>
  </section>;
}

function skillPathSummary(path: ItemAuthoringReferences["skills"][number]["canonicalPath"]): string {
  if (!path.rootToEndpoint.length) return "No canonical path available.";
  const chain = path.rootToEndpoint.map(({ id, name }) => `${name} (#${id})`).join(" → ");
  return `${chain}${path.fallbackAttribute ? ` → fallback Attribute: ${path.fallbackAttribute}` : ""}`;
}

function WeaponGovernanceEditor({
  itemId,
  references,
  itemDirty,
  modeIdentitySignature,
}: {
  itemId: number | undefined;
  references: ItemAuthoringReferences;
  itemDirty: boolean;
  modeIdentitySignature: string;
}) {
  const [governance, setGovernance] = useState<WeaponSkillGovernanceReadModel | null>(null);
  const [mappings, setMappings] = useState<WeaponSkillPathMappingDraft[]>([]);
  const [scope, setScope] = useState<string>("weapon");
  const [skillSearch, setSkillSearch] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const replaceFromReadModel = useCallback((model: WeaponSkillGovernanceReadModel) => {
    setGovernance(model);
    setScope((current) => current === "weapon" || model.modes.some(({ id }) => current === `mode:${id}`)
      ? current
      : "weapon");
    setMappings([
      ...model.weaponDefault.options,
      ...model.modes.flatMap(({ scope: modeScope }) => modeScope.options),
    ].map(({ id, firingModeId, endpointSkillId, reviewState, notes }) => ({
      id,
      firingModeId,
      endpointSkillId,
      reviewState,
      notes,
    })));
  }, []);

  useEffect(() => {
    let active = true;
    if (!itemId) {
      return () => { active = false; };
    }
    void getWeaponSkillGovernance(itemId).then((model) => {
      if (!active) return;
      if (model) {
        replaceFromReadModel(model);
        setFeedback(null);
      }
      else {
        setGovernance(null);
        setMappings([]);
        setFeedback({ kind: "error", message: "Save the Weapon Profile before authoring canonical Skill eligibility." });
      }
    }).catch((error) => {
      if (active) setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Weapon governance could not be loaded." });
    });
    return () => { active = false; };
  }, [itemId, modeIdentitySignature, replaceFromReadModel]);

  if (!itemId) {
    return <section className="item-weapon-governance item-field--wide">
      <SectionHeading eyebrow="CANONICAL ELIGIBILITY" title="Governing Skill Paths" />
      <p>Save this Weapon Profile first. New profiles begin Unreviewed with a missing path; no Skill is guessed from the weapon or firing-mode name.</p>
    </section>;
  }
  if (!governance) return <section className="item-weapon-governance item-field--wide"><p>{feedback?.message ?? "Loading Governing Skill Paths…"}</p></section>;
  const persistedItemId = itemId;

  const firingModeId = scope === "weapon" ? null : Number(scope.slice(5));
  const scopedMappings = mappings.filter((mapping) => mapping.firingModeId === firingModeId);
  const scopedValidation = scopedMappings.map((mapping) => ({
    mapping,
    skill: references.skills.find(({ id }) => id === mapping.endpointSkillId) ?? null,
  }));
  const scopeStatus = !scopedMappings.length
    ? "missing"
    : scopedValidation.some(({ skill }) => !skill?.canonicalPath.valid)
      ? "invalid"
      : scopedMappings.every(({ reviewState }) => reviewState === "approved")
        ? "approved"
        : "review-required";
  const approvedModeOptions = firingModeId === null
    ? 0
    : scopedValidation.filter(({ mapping, skill }) => mapping.reviewState === "approved" && skill?.canonicalPath.valid).length;
  const filteredSkills = references.skills.filter(({ id, name }) => {
    const needle = skillSearch.trim().toLocaleLowerCase("en-US");
    return !needle || name.toLocaleLowerCase("en-US").includes(needle) || String(id).includes(needle);
  }).slice(0, 100);

  function addPath() {
    const endpointSkillId = Number(selectedSkillId);
    if (!Number.isSafeInteger(endpointSkillId) || endpointSkillId <= 0) {
      setFeedback({ kind: "error", message: "Select an exact canonical Skill before adding a path." });
      return;
    }
    if (scopedMappings.some((mapping) => mapping.endpointSkillId === endpointSkillId)) {
      setFeedback({ kind: "error", message: `Skill #${endpointSkillId} is already present in this scope.` });
      return;
    }
    setMappings((current) => [...current, {
      id: null,
      firingModeId,
      endpointSkillId,
      reviewState: "review-required",
      notes: "",
    }]);
    setSelectedSkillId("");
    setFeedback(null);
  }

  function patchMapping(target: WeaponSkillPathMappingDraft, update: Partial<WeaponSkillPathMappingDraft>) {
    setMappings((current) => current.map((mapping) => mapping === target ? { ...mapping, ...update } : mapping));
    setFeedback(null);
  }

  function removeMapping(target: WeaponSkillPathMappingDraft) {
    setMappings((current) => current.filter((mapping) => mapping !== target));
    setFeedback(null);
  }

  function moveMapping(target: WeaponSkillPathMappingDraft, direction: -1 | 1) {
    setMappings((current) => {
      const indexes = current.flatMap((mapping, index) => mapping.firingModeId === firingModeId ? [index] : []);
      const scopedIndex = indexes.findIndex((index) => current[index] === target);
      const destination = scopedIndex + direction;
      if (scopedIndex < 0 || destination < 0 || destination >= indexes.length) return current;
      const next = [...current];
      const left = indexes[scopedIndex]!;
      const right = indexes[destination]!;
      [next[left], next[right]] = [next[right]!, next[left]!];
      return next;
    });
  }

  async function saveGovernance() {
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await saveCanonicalWeaponSkillGovernance(persistedItemId, mappings);
      replaceFromReadModel(saved);
      setFeedback({ kind: "success", message: "Canonical Governing Skill Paths were saved." });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Weapon governance could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  return <section className="item-weapon-governance item-field--wide">
    <SectionHeading eyebrow="CANONICAL ELIGIBILITY" title="Governing Skill Paths" />
    <p>The endpoint identifies one exact authored branch. Parent Skills and the root Attribute are read from the canonical Skill hierarchy; Character ownership and percentages are not evaluated here.</p>
    <div className="item-governance-toolbar">
      <Field label="Authoring Scope"><select value={scope} onChange={(event) => setScope(event.target.value)}><option value="weapon">Weapon Profile Default</option>{governance.modes.map((mode) => <option key={mode.id} value={`mode:${mode.id}`}>{mode.name} · Mode #{mode.id}</option>)}</select></Field>
      <div className={`item-governance-status is-${scopeStatus}`}><span>Review state</span><strong>{scopeStatus}</strong>{firingModeId !== null ? <small>{approvedModeOptions ? "Own approved paths override the weapon default." : "No approved mode path; inherits the weapon default."}</small> : null}</div>
    </div>
    <div className="item-governance-add">
      <Field label="Search canonical Skills"><input type="search" value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} placeholder="Skill name or exact ID" /></Field>
      <Field label="Exact endpoint Skill"><select value={selectedSkillId} onChange={(event) => setSelectedSkillId(event.target.value)}><option value="">Select a Skill</option>{filteredSkills.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · #{candidate.id} · Tier {candidate.tier ?? "N/A"}</option>)}</select></Field>
      <button type="button" onClick={addPath}>Add Path</button>
    </div>
    <div className="item-card-list">{scopedValidation.map(({ mapping, skill }, index) => {
      const path = skill?.canonicalPath;
      const stored = mapping.id === null ? null : [governance.weaponDefault, ...governance.modes.map(({ scope: modeScope }) => modeScope)]
        .flatMap(({ options }) => options).find(({ id }) => id === mapping.id) ?? null;
      return <article className={`item-edit-card item-governance-path${path?.valid ? "" : " is-review-required"}`} key={mapping.id ?? `new-${firingModeId ?? "weapon"}-${mapping.endpointSkillId}`}>
        <header><div><strong>{skill ? `${skill.name} · Skill #${skill.id}` : `Missing Skill #${mapping.endpointSkillId}`}</strong><span>{mapping.reviewState}</span></div><button className="is-danger" type="button" onClick={() => removeMapping(mapping)}>Remove</button></header>
        <p>{path ? skillPathSummary(path) : "The endpoint Skill is missing."}</p>
        {path && !path.valid ? <ul>{path.problems.map((problem) => <li key={`${problem.code}-${problem.skillId}`}>{problem.message}</li>)}</ul> : null}
        <Field label="Authoring Notes" wide><textarea maxLength={1000} rows={3} value={mapping.notes} onChange={(event) => patchMapping(mapping, { notes: event.target.value })} /></Field>
        {stored ? <small>Last authored by {stored.updatedByName} · {new Date(stored.updatedAt).toLocaleString()}</small> : <small>New unsaved path.</small>}
        <footer><div><button type="button" disabled={index === 0} onClick={() => moveMapping(mapping, -1)}>Move Up</button><button type="button" disabled={index === scopedMappings.length - 1} onClick={() => moveMapping(mapping, 1)}>Move Down</button></div><button type="button" disabled={!path?.valid || mapping.reviewState === "approved"} onClick={() => patchMapping(mapping, { reviewState: "approved" })}>Approve Valid Path</button><button type="button" disabled={mapping.reviewState === "review-required"} onClick={() => patchMapping(mapping, { reviewState: "review-required" })}>Return to Review</button></footer>
      </article>;
    })}{!scopedMappings.length ? <p className="item-governance-empty">Unreviewed · Missing path · Requires G.O.D. review. No mapping has been inferred.</p> : null}</div>
    {feedback ? <p className={`skill-editor__feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
    <footer className="item-governance-save"><button className="skills-primary-button" type="button" disabled={saving || itemDirty} onClick={() => void saveGovernance()}>{saving ? "Saving…" : "Save Governing Skill Paths"}</button>{itemDirty ? <small>Save pending Item and Firing Mode changes first.</small> : null}</footer>
  </section>;
}

function Weapon({ draft, references, itemDirty, onChange }: { draft: ItemDraft; references: ItemAuthoringReferences; itemDirty: boolean; onChange: (draft: ItemDraft) => void }) {
  const [ammoSearch, setAmmoSearch] = useState("");
  const [ammoCandidates, setAmmoCandidates] = useState<RelatedItemCandidate[]>([]);
  const profile = draft.weaponProfile;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (ammoSearch.trim()) void findRelatedItems(ammoSearch, draft.id).then(setAmmoCandidates);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [ammoSearch, draft.id]);
  if (!profile) return <div className="item-section item-empty-profile"><p>WEAPON / AMMUNITION PROFILE</p><h3>This Item has no weapon or ammunition mechanics yet.</h3><button className="skills-primary-button" type="button" onClick={() => onChange({ ...draft, weaponProfile: { profileRecordType: draft.core.recordType, weaponType: "", handedness: "", damageSource: "", damage: "", initiativeCost: null, damageType: "", range: "", reach: "", ammunitionItemId: null, ammunitionItemName: null, compatibility: "", capacity: "", firingModes: [], resolvedFiringModes: [], rateOfFire: "", reloadInitiative: "", ammunitionCyclingInitiativeModifier: 0, ammunitionRecoilResetInitiativeModifier: 0, referencedAmmunition: null, rulesText: "" } })}>Add Weapon / Ammunition Profile</button></div>;
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
    {ammunitionProfile ? <section className="item-firearm-timing item-field--wide">
      <SectionHeading eyebrow="AMMUNITION TIMING" title="Firearm Timing Modifiers" />
      <p className="item-firearm-help">These signed whole numbers modify the firing mode authored on the weapon. Zero leaves that part of the weapon unchanged; for example, +1 increases its cost and -1 reduces it. Each effective component is clamped at zero.</p>
      <div className="item-form-grid">
        <Field label="Cycling Initiative Modifier"><input type="number" step={1} value={profile.ammunitionCyclingInitiativeModifier} onChange={(e) => patch({ ammunitionCyclingInitiativeModifier: Number(e.target.value) })} /></Field>
        <Field label="Recoil Reset Initiative Modifier"><input type="number" step={1} value={profile.ammunitionRecoilResetInitiativeModifier} onChange={(e) => patch({ ammunitionRecoilResetInitiativeModifier: Number(e.target.value) })} /></Field>
      </div>
    </section> : <>
      <Field label="Find Ammunition"><input value={ammoSearch} onChange={(e) => setAmmoSearch(e.target.value)} /></Field><Field label="Ammunition Item"><select value={profile.ammunitionItemId ?? ""} onChange={(e) => { const id = Number(e.target.value); const candidate = ammoCandidates.find((row) => row.id === id); patch({ ammunitionItemId: id || null, ammunitionItemName: candidate?.name ?? null, referencedAmmunition: candidate ? { itemId: candidate.id, name: candidate.name, cyclingInitiativeModifier: candidate.ammunitionCyclingInitiativeModifier, recoilResetInitiativeModifier: candidate.ammunitionRecoilResetInitiativeModifier } : null }); }}><option value="">None</option>{profile.ammunitionItemId && profile.ammunitionItemName ? <option value={profile.ammunitionItemId}>{profile.ammunitionItemName}</option> : null}{ammoCandidates.filter((row) => row.id !== profile.ammunitionItemId).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
      <section className="item-firearm-timing item-field--wide">
        <SectionHeading eyebrow="FOLLOW-UP PREPARATION" title="Structured Firing Modes" action="Add Mode" onAction={() => patch({ firingModes: [...profile.firingModes, { id: null, name: "", sortOrder: profile.firingModes.length, baseCyclingInitiativeCost: null, baseRecoilResetInitiativeCost: null, deliveryCadence: null, roundsPerCadence: null, mechanicsReviewRequired: false }] })} />
        <p className="item-firearm-help">Cycling is the time required for the weapon to prepare, chamber, or reset its firing mechanism. Recoil reset is the time required for the wielder to recover control. These values are added before another trigger pull. Delivery cadence records either rounds per trigger pull or rounds per Initiative spent holding the trigger. Examples: Semiautomatic can deliver 1 round per trigger, a three-round burst 3 rounds per trigger, and fully automatic fire 5 rounds per Initiative. Trigger pull (normally 1 Initiative), Aim, Reload, and live ammunition use are handled separately.</p>
        <div className="item-card-list">{profile.firingModes.map((mode, index) => {
          const ready = mode.baseCyclingInitiativeCost !== null && mode.baseRecoilResetInitiativeCost !== null && mode.deliveryCadence !== null && mode.roundsPerCadence !== null;
          const baseTiming = ready ? resolveFirearmFiringMode(mode).timing : null;
          const replace = (update: Partial<FirearmFiringModeDraft>) => patch({ firingModes: profile.firingModes.map((entry, i) => i === index ? { ...entry, ...update } : entry) });
          return <article className={mode.mechanicsReviewRequired && !ready ? "item-edit-card item-firearm-mode is-review-required" : "item-edit-card item-firearm-mode"} key={mode.id ?? `new-${index}`}>
            <header><div><strong>Mode {index + 1}</strong>{mode.mechanicsReviewRequired && !ready ? <span>Mechanical review required</span> : null}</div><button className="is-danger" type="button" onClick={() => patch({ firingModes: profile.firingModes.filter((_, i) => i !== index).map((entry, sortOrder) => ({ ...entry, sortOrder })) })}>Remove</button></header>
            <div className="item-form-grid"><Field label="Mode Name" wide><input value={mode.name} placeholder="Single, Burst, or another authored mode" onChange={(e) => replace({ name: e.target.value })} /></Field><Field label="Cycling Initiative Cost"><OptionalNumber value={mode.baseCyclingInitiativeCost} min={0} step={1} onChange={(baseCyclingInitiativeCost) => replace({ baseCyclingInitiativeCost })} /></Field><Field label="Recoil Reset Initiative Cost"><OptionalNumber value={mode.baseRecoilResetInitiativeCost} min={0} step={1} onChange={(baseRecoilResetInitiativeCost) => replace({ baseRecoilResetInitiativeCost })} /></Field><Field label="Delivery Cadence"><select value={mode.deliveryCadence ?? ""} onChange={(e) => replace({ deliveryCadence: e.target.value ? e.target.value as FirearmFiringModeDraft["deliveryCadence"] : null })}><option value="">Choose cadence</option>{FIREARM_DELIVERY_CADENCES.map((cadence) => <option key={cadence} value={cadence}>{cadence === "per-trigger" ? "Per trigger" : "Sustained per Initiative"}</option>)}</select></Field><Field label="Rounds Per Cadence"><OptionalNumber value={mode.roundsPerCadence} min={1} step={1} onChange={(roundsPerCadence) => replace({ roundsPerCadence })} /></Field></div>
            <footer><span>Base follow-up preparation: <strong>{baseTiming?.followUpPreparationInitiativeCost ?? "Review required"}</strong>{ready ? <> · Delivery: <strong>{mode.roundsPerCadence} {mode.roundsPerCadence === 1 ? "round" : "rounds"} {mode.deliveryCadence === "per-trigger" ? "per trigger" : "per Initiative"}</strong></> : null}</span><div><button type="button" disabled={index === 0} onClick={() => patch({ firingModes: moveFiringMode(profile.firingModes, index, -1) })}>Move Up</button><button type="button" disabled={index === profile.firingModes.length - 1} onClick={() => patch({ firingModes: moveFiringMode(profile.firingModes, index, 1) })}>Move Down</button></div></footer>
          </article>;
        })}</div>
      </section>
    </>}
    {!ammunitionProfile ? <WeaponGovernanceEditor key={`${draft.id ?? "new"}:${profile.firingModes.map(({ id }) => id ?? "new").join(",")}`} itemId={draft.id} references={references} itemDirty={itemDirty} modeIdentitySignature={profile.firingModes.map(({ id }) => id ?? "new").join(",")} /> : null}
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
  return <article className="item-preview">
    <header><p>{draft.core.catalogScope}{draft.core.equipmentGroup ? ` / ${draft.core.equipmentGroup}` : ""}</p><h3>{draft.core.name || "Untitled Item"}</h3><span>{draft.core.canonicalId || "Canonical ID assigned on save"} · {draft.core.recordType} · {draft.core.category}</span><div className="item-preview__classification"><span>{draft.isMagical ? "Magical Item" : "Mundane Item"}</span>{draft.runtimeProfile.useMode !== "none" ? <span>{draft.runtimeProfile.useMode === "consume-item" ? "Consumable" : draft.runtimeProfile.useMode === "charges" ? "Charged" : "Unlimited"}</span> : null}</div></header>
    <div className="item-preview__facts"><div><dt>Credits</dt><dd>{draft.core.credits ?? "—"}</dd></div><div><dt>Price Basis</dt><dd>{draft.core.priceBasis || "—"}</dd></div><div><dt>Weight</dt><dd>{draft.core.weight === null ? "—" : `${draft.core.weight} ${draft.core.weightUnit}`}</dd></div><div><dt>Size</dt><dd>{draft.core.size || "—"}</dd></div><div><dt>Durability</dt><dd>{draft.core.durability ?? "—"}</dd></div></div>
    <section><h4>Description</h4><p>{draft.core.description || "No description."}</p></section>
    <section><h4>Runtime Use</h4><p><strong>Activated Use:</strong> {formatItemActivatedUse(draft.runtimeProfile)}</p><p><strong>Activation:</strong> {draft.runtimeProfile.activationLabel || "Use"}</p>{draft.runtimeProfile.useNotes ? <p>{draft.runtimeProfile.useNotes}</p> : null}</section>
    <section><h4>Activated Mechanical Effects</h4>{draft.effects.length ? <ul>{draft.effects.map((effect, index) => <li key={index}><strong>{formatMechanicalEffectSummary(effect)}</strong>{effect.kind === "manual" ? <span> — {effect.description}</span> : null}</li>)}</ul> : <p>No activated Mechanical Effects.</p>}</section>
    <section><h4>Passive Equipment Effects</h4>{draft.passiveEffects.length ? <ul>{draft.passiveEffects.map((entry, index) => <li key={entry.id ?? index}><strong>{passiveLifecycleLabel(entry.requiredEquipmentState)} · {formatMechanicalEffectSummary(entry.effect)}</strong>{entry.effect.kind === "manual" ? <span> — {entry.effect.description}</span> : null}</li>)}</ul> : <p>No passive Equipment Effects.</p>}</section>
    {draft.weaponProfile ? <section><h4>Weapon Profile</h4><p>{draft.weaponProfile.weaponType || "Weapon"} · {draft.weaponProfile.damage || "—"} {draft.weaponProfile.damageType} · Range {draft.weaponProfile.range || "—"}</p>{draft.weaponProfile.profileRecordType.trim().toLowerCase() === "ammunition" || draft.core.recordType.trim().toLowerCase() === "ammunition" ? <p><strong>Ammunition timing:</strong> Cycling {draft.weaponProfile.ammunitionCyclingInitiativeModifier >= 0 ? "+" : ""}{draft.weaponProfile.ammunitionCyclingInitiativeModifier}; Recoil reset {draft.weaponProfile.ammunitionRecoilResetInitiativeModifier >= 0 ? "+" : ""}{draft.weaponProfile.ammunitionRecoilResetInitiativeModifier} Initiative.</p> : <>{draft.weaponProfile.firingModes.length ? <ul>{draft.weaponProfile.firingModes.map((mode, index) => {
        const ammunition = draft.weaponProfile?.referencedAmmunition;
        const resolved = resolveFirearmFiringMode(mode, ammunition?.cyclingInitiativeModifier ?? 0, ammunition?.recoilResetInitiativeModifier ?? 0);
        return <li key={mode.id ?? index}><strong>{mode.name || `Mode ${index + 1}`}</strong>: {resolved.timing && mode.deliveryCadence && mode.roundsPerCadence ? <>base {mode.baseCyclingInitiativeCost} cycling + {mode.baseRecoilResetInitiativeCost} recoil = {mode.baseCyclingInitiativeCost! + mode.baseRecoilResetInitiativeCost!} follow-up; delivers {mode.roundsPerCadence} {mode.roundsPerCadence === 1 ? "round" : "rounds"} {mode.deliveryCadence === "per-trigger" ? "per trigger" : "per Initiative"}{ammunition ? <>; with {ammunition.name}, {resolved.timing.effectiveCyclingInitiativeCost} + {resolved.timing.effectiveRecoilResetInitiativeCost} = {resolved.timing.followUpPreparationInitiativeCost} follow-up, {resolved.timing.totalThroughNextTriggerPullInitiativeCost} through the next trigger pull</> : <>; {resolved.timing.totalThroughNextTriggerPullInitiativeCost} through the next trigger pull</>}</> : "mechanical review required"}</li>;
      })}</ul> : <p>No firing modes authored.</p>}</>}<p><strong>Rate of Fire:</strong> {draft.weaponProfile.rateOfFire || "Not recorded"} · <strong>Reload Initiative:</strong> {draft.weaponProfile.reloadInitiative || "Not recorded"}</p><p>{draft.weaponProfile.rulesText || "No additional weapon rules."}</p></section> : null}
    {draft.armorProfile ? <section><h4>Armor Profile</h4><p>{draft.armorProfile.armorType || "Armor"} · Soak {draft.armorProfile.baseSoak ?? "—"} · {draft.armorProfile.coverage || "Coverage not specified"}</p><p>{draft.armorProfile.rulesText || "No additional armor rules."}</p></section> : null}
    <section><h4>Properties</h4>{draft.properties.length ? <ul>{draft.properties.map((property, index) => <li key={index}><strong>{property.propertyName}</strong>: {property.value || "—"}{property.unit ? ` ${property.unit}` : ""}{property.quantity ? ` ×${property.quantity}` : ""}</li>)}</ul> : <p>No properties.</p>}</section>
    <section><h4>Tags</h4><div className="item-preview__chips">{draft.tags.length ? draft.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>None</span>}</div></section>
  </article>;
}

function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="item-subheading"><div><p>{eyebrow}</p><h3>{title}</h3></div>{action && onAction ? <button type="button" onClick={onAction}>{action}</button> : null}</div>;
}

function patchProperty(draft: ItemDraft, onChange: (draft: ItemDraft) => void, index: number, update: Partial<ItemDraft["properties"][number]>) {
  onChange({ ...draft, properties: draft.properties.map((entry, i) => i === index ? { ...entry, ...update } : entry) });
}
