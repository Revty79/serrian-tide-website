"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  listCharactersForCampaign,
  type CharacterSummary,
  type PlayerCampaignSummary,
} from "@/app/characters/actions";
import { generateCompleteRandomCharacter } from "@/app/realms/characters/random-actions";

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
  const [randomizing, setRandomizing] = useState(false);
  const [randomChoiceOpen, setRandomChoiceOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  const selectedCharacter = characters.find((entry) => String(entry.id) === characterId) ?? null;

  useEffect(() => {
    let active = true;
    if (!campaignId) return () => { active = false; };
    listCharactersForCampaign(Number(campaignId))
      .then((rows) => { if (active) setCharacters(rows); })
      .catch((error) => { if (active) setFeedback(error instanceof Error ? error.message : "Characters could not be loaded."); })
      .finally(() => { if (active) setLoadingCharacters(false); });
    return () => { active = false; };
  }, [campaignId]);

  function changeCampaign(nextCampaignId: string) {
    setCampaignId(nextCampaignId);
    setCharacterId("");
    setCharacters([]);
    setFeedback("");
    setRandomChoiceOpen(false);
    setLoadingCharacters(Boolean(nextCampaignId));
  }

  function openSelectedCharacter() {
    if (!selectedCharacter) return;
    router.push(`/realms/characters/${selectedCharacter.id}`);
  }

  async function createCompletelyRandomCharacter() {
    if (!selectedCharacter || selectedCharacter.creationCompletedAt || randomizing) return;
    setRandomizing(true);
    setFeedback("");
    try {
      const result = await generateCompleteRandomCharacter(selectedCharacter.id);
      if (result.warnings.length) {
        setFeedback(`Random draft created with ${result.warnings.length} review ${result.warnings.length === 1 ? "note" : "notes"}.`);
      }
      setRandomChoiceOpen(false);
      router.push(`/realms/characters/${result.characterId}`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "The random Character could not be generated.");
      setRandomChoiceOpen(false);
    } finally {
      setRandomizing(false);
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
            <h1 className="font-sans">The Realms</h1>
            <span>Welcome, {username}</span>
          </div>
        </header>

        <section className="realms-control">
          <div className="realms-section-heading">
            <div><p>ADVENTURING CONTEXT</p><h2 className="font-sans">Your Realm</h2></div>
            <span>Select the Campaign and Character whose story you want to continue.</span>
          </div>
          <div className="realms-control-grid">
            <label><span>Campaign</span><select value={campaignId} onChange={(event) => changeCampaign(event.target.value)}><option value="">{initialCampaigns.length ? "No Campaign Selected" : "No Campaign Memberships"}</option>{initialCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
            <label><span>Character</span><select value={characterId} disabled={!campaignId || loadingCharacters} onChange={(event) => { setCharacterId(event.target.value); setRandomChoiceOpen(false); }}><option value="">{!campaignId ? "Select a Campaign First" : loadingCharacters ? "Reading Characters…" : "No Character Selected"}</option>{characters.map((character) => <option key={character.id} value={character.id}>{character.name}{character.creationCompletedAt ? "" : " · Creation Incomplete"}</option>)}</select></label>
          </div>
          <div className="realms-character-create">
            <div className="realms-character-create__buttons">
              <button type="button" disabled={!selectedCharacter} onClick={openSelectedCharacter}>Open Character Editor</button>
              <button
                type="button"
                disabled={!selectedCharacter || Boolean(selectedCharacter.creationCompletedAt) || randomizing}
                onClick={() => setRandomChoiceOpen(true)}
              >
                Random Character
              </button>
            </div>
            <span>Select a Character assigned to you, then open its editor or let the generator build an unfinished draft.</span>
          </div>
          {feedback ? <p className="realms-feedback">{feedback}</p> : null}
        </section>

        <section className="realms-actions">
          <div className="realms-section-heading"><div><p>CHARACTER ACTIONS</p><h2 className="font-sans">Your Character</h2></div><span>{selectedCharacter ? selectedCharacter.name : "Choose a Character above."}</span></div>
          <div className="realms-action-grid">
            {actions.map((action) => action.enabled && action.href ? (
              <Link key={action.title} href={action.href} className="realms-action-card"><span>{action.subtitle}</span><h3 className="font-sans">{action.title}</h3><p>{action.description}</p><strong>Enter →</strong></Link>
            ) : (
              <article key={action.title} className="realms-action-card is-disabled"><span>{action.subtitle}</span><h3 className="font-sans">{action.title}</h3><p>{action.description}</p><strong>{action.title === "ADVANCE CHARACTER" && selectedCharacter ? "Complete creation first" : "Select a Character"}</strong></article>
            ))}
          </div>
        </section>

        <footer className="realms-footer"><Link href="/access">← Return to Paths</Link><span>SERRIAN TIDE</span></footer>
      </div>

      {randomChoiceOpen && selectedCharacter ? (
        <div className="realms-random-modal" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="random-character-title">
            <p>RANDOM CHARACTER</p>
            <h2 id="random-character-title" className="font-sans">How should {selectedCharacter.name} be created?</h2>
            <span>Both paths overwrite this unfinished Character&apos;s creation draft and leave the permanent completion lock untouched so you can review the result.</span>
            <div className="realms-random-modal__choices">
              <button type="button" onClick={() => router.push(`/realms/characters/${selectedCharacter.id}/random/guided`)}>
                <strong>Guided Random</strong>
                <small>Choose Race, focus, magic preference, equipment style, and temperament. The engine handles the legal point spending.</small>
              </button>
              <button type="button" disabled={randomizing} onClick={() => void createCompletelyRandomCharacter()}>
                <strong>{randomizing ? "Generating…" : "Completely Random"}</strong>
                <small>Let Serrian Tide choose every safe option and open the resulting draft for review.</small>
              </button>
            </div>
            <button className="realms-random-modal__cancel" type="button" disabled={randomizing} onClick={() => setRandomChoiceOpen(false)}>Cancel</button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
