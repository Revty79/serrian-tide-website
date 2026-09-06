"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { ShopVisitView } from "@/features/tabletop-operations/shop-visit-service";

import { leaveShopVisit } from "./shop-visit-actions";
import styles from "./player-tabletop.module.css";

function credits(value: number | null): string {
  return value === null ? "Price not listed" : `${value.toLocaleString("en-US")} Credits`;
}

export function PlayerShopVisit({ characterId, visit }: { characterId: number; visit: ShopVisitView }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categories = useMemo(() => [...new Set(visit.shop.offerings.map((entry) => entry.category))], [visit.shop.offerings]);
  const needle = search.trim().toLocaleLowerCase();
  const offerings = visit.shop.offerings.filter((entry) => (
    (category === "all" || entry.category === category)
    && (!needle || [entry.name, entry.category, entry.family, entry.description, entry.canonicalId]
      .some((value) => value.toLocaleLowerCase().includes(needle)))
  ));

  async function leave(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await leaveShopVisit(characterId);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Shop visit could not be left.");
    } finally {
      setBusy(false);
    }
  }

  return <section className={styles.shopVisit} aria-labelledby="player-shop-visit-title">
    <header className={styles.shopVisitHero}>
      <div><p className={styles.eyebrow}>CURRENT SHOP VISIT · {visit.mode === "roleplay" ? "ROLEPLAY" : "SHOPPING"}</p><h2 id="player-shop-visit-title">{visit.shop.name}</h2><p>{visit.shop.category} · {visit.shop.storefrontState}{visit.placement.kind === "town" ? " · Town placement" : " · Independent placement"}</p></div>
      <button type="button" className="st-button is-secondary" disabled={busy} onClick={() => void leave()}>{busy ? "Leaving…" : "Leave Shop"}</button>
    </header>
    {error ? <p className={styles.shopVisitError} role="alert">{error}</p> : null}
    {visit.shop.description ? <p className={styles.shopVisitDescription}>{visit.shop.description}</p> : null}
    <div className={styles.shopVisitRoster}>
      <section><h3>Visiting party</h3><ul>{visit.visitors.map((visitor) => <li key={visitor.characterId}><strong>{visitor.name}</strong><span>{visitor.characterId === characterId ? "You" : visitor.playerName}</span></li>)}</ul></section>
      <section><h3>Staff</h3>{visit.shop.staff.length ? <ul>{visit.shop.staff.map((member) => <li key={member.npcCharacterId}><strong>{member.name}</strong><span>{[member.roleLabel, member.responsibilityLabel, member.isPrimaryContact ? "Primary contact" : null].filter(Boolean).join(" · ")}</span></li>)}</ul> : <p>No staff are publicly revealed for this placement.</p>}</section>
    </div>
    <section className={styles.shopVisitCatalog}>
      <header><div><p className={styles.eyebrow}>PUBLIC CATALOG</p><h3>Offerings</h3></div><div className={styles.shopVisitFilters}><label className="st-field"><span>Search</span><input className="st-control" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, family, or category" /></label><label className="st-field"><span>Category</span><select className="st-control" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div></header>
      {offerings.length ? <div className={styles.shopVisitOfferings}>{offerings.map((offering) => <article key={offering.id}><header><div><span>{offering.category} · {offering.canonicalId}</span><h4>{offering.name}</h4></div><strong>{credits(offering.sellingPriceCredits)}</strong></header>{offering.description ? <p>{offering.description}</p> : null}<footer><span>{offering.fulfillmentKind === "service-narrative" ? "Service / narrative" : "Inventory item"}</span><span>{offering.unlimitedStock ? "Unlimited" : `${offering.limitedQuantity ?? 0} available`}</span>{offering.buyingPriceCredits !== offering.sellingPriceCredits ? <span>Shop buys for {credits(offering.buyingPriceCredits)}</span> : null}</footer></article>)}</div> : <p className={styles.emptyCopy}>No enabled offerings match these filters.</p>}
    </section>
    <p className={styles.boundaryNotice}>This visit is an additional live context. It does not change the active Scene, Encounter, Initiative, Character state, or the Shop&apos;s saved transaction policies.</p>
  </section>;
}
