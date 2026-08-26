"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createCharacter,
  listCharactersForCampaign,
  type CharacterSummary,
  type PlayerCampaignSummary,
} from "@/app/characters/actions";

export function RealmsDashboard({
  initialCampaigns,
  username,
}: {
  initialCampaigns: PlayerCampaignSummary[];
  username: string;
}) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState("");
  const [characterId, setCharacterId] = useState("");
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [loadingCharacters, setLoadingCharacters] = useState(false);
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState("");

  const selectedCharacter = characters.find((entry) => String(entry.id) === characterId) ?? null;

  useEffect(() => {
    let active = true;
    setCharacterId("");
    setCharacters([]);
    setFeedback("");
    if (!campaignId) return () => { active = false; };
    setLoadingCharacters(true);
    listCharactersForCampaign(Number(campaignId))
      .then((rows) => { if (active) setCharacters(rows); })
      .catch((error) => { if (active) setFeedback(error instanceof Error ? error.message : "Characters could not be loaded."); })
      .finally(() => { if (active) setLoadingCharacters(false); });
    return () => { active = false; };
  }, [campaignId]);

  async function createNewCharacter() {
    if (!campaignId) return;
    setCreating(true);
    setFeedback("");
    try {
      const aggregate = await createCharacter(Number(campaignId));
      router.push(`/realms/characters/${aggregate.character.id}`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "The Character could not be created.");
    } finally {
      setCreating(false);
    }
  }

  const actions = [
    {
      title: "CHARACTER SHEET",
      subtitle: "Identity & Record",
      description: selectedCharacter?.creationCompletedAt
        ? "Open your completed Character sheet."
        : "Continue building the selected Character.",
      href: selectedCharacter ? `/realms/characters/${selectedCharacter.id}` : null,
      enabled: Boolean(selectedCharacter),
    },
    {
      title: "ADVANCE CHARACTER",
      subtitle: "Experience & Quintessence",
      description: "Spend Experience and Quintessence after Character creation is complete.",
      href: selectedCharacter?.creationCompletedAt ? `/realms/characters/${selectedCharacter.id}/advance` : null,
      enabled: Boolean(selectedCharacter?.creationCompletedAt),
    },
    {
      title: "SPELLBOOK",
      subtitle: "Known Magic",
      description: "Review and manage this Character's saved Spells.",
      href: selectedCharacter ? `/realms/characters/${selectedCharacter.id}/spellbook` : null,
      enabled: Boolean(selectedCharacter),
    },
    {
      title: "MAGIC CALCULATOR",
      subtitle: "Spell Construction",
      description: "Build, test, and save magic for the selected Character.",
      href: selectedCharacter ? `/realms/characters/${selectedCharacter.id}/magic` : null,
      enabled: Boolean(selectedCharacter),
    },
  ];

  return (
    <main className="realms-page">
      <div className="realms-shell">
        <header className="realms-header">
          <Link href="/access" className="font-evanescent realms-logo">SERRIAN<br />TIDE</Link>
          <div>
            <p>PLAYER PORTAL</p>
            <h1 className="font-portcullion">The Realms</h1>
            <span>Welcome, {username}</span>
          </div>
        </header>

        <section className="realms-control">
          <div className="realms-section-heading">
            <div><p>ADVENTURING CONTEXT</p><h2 className="font-portcullion">Your Realm</h2></div>
            <span>Select the Campaign and Character whose story you want to continue.</span>
          </div>
          <div className="realms-control-grid">
            <label><span>Campaign</span><select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}><option value="">{initialCampaigns.length ? "No Campaign Selected" : "No Campaign Memberships"}</option>{initialCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
            <label><span>Character</span><select value={characterId} disabled={!campaignId || loadingCharacters} onChange={(event) => setCharacterId(event.target.value)}><option value="">{!campaignId ? "Select a Campaign First" : loadingCharacters ? "Reading Characters…" : "No Character Selected"}</option>{characters.map((character) => <option key={character.id} value={character.id}>{character.name}{character.creationCompletedAt ? "" : " · Creation Incomplete"}</option>)}</select></label>
          </div>
          <div className="realms-character-create">
            <button type="button" disabled={!campaignId || creating} onClick={() => void createNewCharacter()}>{creating ? "Creating…" : "Create New Character"}</button>
            <span>Creates a fresh Character draft using the selected Campaign rules.</span>
          </div>
          {feedback ? <p className="realms-feedback">{feedback}</p> : null}
        </section>

        <section className="realms-actions">
          <div className="realms-section-heading"><div><p>CHARACTER ACTIONS</p><h2 className="font-portcullion">Your Character</h2></div><span>{selectedCharacter ? selectedCharacter.name : "Choose a Character above."}</span></div>
          <div className="realms-action-grid">
            {actions.map((action) => action.enabled && action.href ? (
              <Link key={action.title} href={action.href} className="realms-action-card"><span>{action.subtitle}</span><h3 className="font-portcullion">{action.title}</h3><p>{action.description}</p><strong>Enter →</strong></Link>
            ) : (
              <article key={action.title} className="realms-action-card is-disabled"><span>{action.subtitle}</span><h3 className="font-portcullion">{action.title}</h3><p>{action.description}</p><strong>{action.title === "ADVANCE CHARACTER" && selectedCharacter ? "Complete creation first" : "Select a Character"}</strong></article>
            ))}
          </div>
        </section>

        <footer className="realms-footer"><Link href="/access">← Return to Paths</Link><span>SERRIAN TIDE</span></footer>
      </div>
    </main>
  );
}
