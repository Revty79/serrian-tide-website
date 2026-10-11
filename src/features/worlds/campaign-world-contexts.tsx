"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { worldApi } from "./client-api";
import { contextUnavailableReason, type AssociationBundle } from "./campaign-associations";
import styles from "./worlds.module.css";
export function CampaignWorldContexts({ campaignId, owner }: { campaignId: number; owner: boolean }) {
  const [bundle, setBundle] = useState<AssociationBundle | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (!owner) return;let alive = true;worldApi<AssociationBundle>(`/api/worlds/campaign-contexts?campaignId=${campaignId}`).then(data => { if (alive) setBundle(data); }).catch(failure => { if (alive) setError(failure.message); });return () => { alive = false; }; }, [campaignId, owner]);
  return <section className={styles.campaignSettingsContexts} aria-label="World contexts"><h3>World contexts</h3><p>Worlds associations are private authoring metadata. They do not change Campaign rules, move Characters or advance session time.</p>
    {!owner ? <p>Only this Campaign’s creator can manage its private World associations. Administrator access to Campaign settings grants no World sharing or association permissions.</p> : <>
      {error && <p role="alert">{error}</p>}{!bundle && !error && <p>Loading associated contexts…</p>}
      {bundle && !bundle.contexts.length && <p>No World context is required. <Link href="/worlds">Create or open a World</Link> to associate this Campaign.</p>}
      {bundle?.contexts.map(item => <p key={item.id}>{item.ownershipAvailable ? <Link href={`/worlds/${item.worldId}?tab=campaigns&timeline=${item.timelineId}&campaign=${campaignId}`}>{item.worldName} · {item.timelineName}</Link> : "Retained World context unavailable"}{item.home ? " · Home context" : ""}{bundle.selection.contextId === item.id ? " · Selected for your Worlds authoring" : ""}{item.startingYear !== null ? ` · Historical starting canonical Year ${item.startingYear}` : " · Starting year not authored"}{!item.available ? ` · ${contextUnavailableReason(item)}` : ""}</p>)}
      {!!bundle?.contexts.length && <p>Open a context above to manage its associations, home designation and your separate authoring viewing year in Worlds.</p>}
    </>}
  </section>;
}
