import type { ReactNode } from "react";
import type { PaperCharacterData } from "@/features/characters/paper-character";
import { DEFAULT_PRINT_SELECTION, PRINT_BOOKS, PRINT_REFERENCES, printPresentationHeading, type UnifiedPrintSelection, type PrintBack, type PrintTheme, type PrintHeadings, type PrintReference } from "@/features/characters/character-print-options";
import { PaperSheetMasthead } from "./paper-sheet-masthead";
import { PaperSheetFront } from "./paper-sheet-front";
import { Box, Lines, SkillTable, OwnedInventory, SpecialAbilities, DerivedAbilities, RecordedSkill, SpellEntry, Text } from "./paper-sheet-content";

const cssText = (value: string) => JSON.stringify(value.replace(/[\r\n]/g, " ")).replaceAll("<", "\\3c ");
const sectionKey = (value: string) => `sheet-${value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
function Back({data, back}: {data: PaperCharacterData; back: PrintBack}) {
  const ordinary = data.skills.filter(skill => !skill.special && !skill.systems.length);
  const relevant = data.skills.filter(skill => !skill.special && skill.systems.length && (back === "General" || skill.systems.includes(back)));
  const spells = data.spells.filter(spell => (back === "General" || spell.system === back) && !data.skills.some(skill => skill.special && spell.key === `catalog:${skill.id}`));
  const recordedPowers = relevant.filter(skill => skill.depth > 0 && !data.skills.some(child => child.parentId === skill.id) && !spells.some(spell => spell.key === `catalog:${skill.id}`));
  const powersBesideInventory = spells.length + recordedPowers.length <= 4;
  const powers = spells.length || recordedPowers.length ? <Box title={back === "General" ? "Known powers & skill effects" : `${back} — known powers & skill effects`}>
    <div className={powersBesideInventory ? "paper-power-list" : "paper-power-grid"}>{spells.map(spell => <SpellEntry key={spell.key} spell={spell} />)}
    {recordedPowers.map(skill => <RecordedSkill key={skill.id} skill={skill} />)}</div>
    {spells.length ? <p className="paper-caption">Casting: Known Spell · {[...new Set(spells.map(spell => `${spell.system} / ${spell.practitionerLevel ?? "unavailable"}`))].join("; ")}.</p> : null}
  </Box> : null;
  const groups = [{title: "Ordinary skills", skills: ordinary}, ...(relevant.length ? [{title: back === "General" ? "Supernatural skills" : back, skills: relevant}] : [])];
  const columns: typeof groups[] = [[], []];
  let remaining = Math.ceil((ordinary.length + relevant.length) / 2);
  for (const group of groups) {
    const first = group.skills.slice(0, remaining);
    const rest = group.skills.slice(remaining);
    if (first.length || !group.skills.length) columns[0].push({...group, skills: first});
    if (rest.length) columns[1].push({title: first.length ? `${group.title} (continued)` : group.title, skills: rest});
    remaining = Math.max(0, remaining - first.length);
  }
  return <>
    <div className="paper-record-columns paper-back-skills">{columns.map((column, i) => <div key={i}>{column.map(group => <Box key={group.title} title={group.title}>{group.skills.length ? <SkillTable skills={group.skills} /> : <p>None recorded.</p>}</Box>)}</div>)}</div>
    <p className="paper-caption">Pts = allocated points including racial grants (R). %+ = roll target. Continued paths retain their parent names.</p>
    <div className="paper-record-columns"><div><OwnedInventory data={data} /><SpecialAbilities data={data} /></div><div><DerivedAbilities data={data} />{powersBesideInventory ? powers : null}</div></div>
    {powersBesideInventory ? null : powers}
    {!spells.length && !relevant.length && !data.abilities.length && !data.skills.some(skill => skill.special) && ordinary.length < 10 && data.inventory.length < 10 ? <Box title="Session notes"><Lines count={12} /></Box> : null}
  </>;
}
function Reference({data, kind}: {data: PaperCharacterData; kind: PrintReference}) {
  if (kind === "specialAbilities") return <SpecialAbilities data={data} />;
  if (kind === "derivedAbilities") return <DerivedAbilities data={data} detailed />;
  if (kind === "skills") return <>{data.skills.filter(skill => !skill.special).map(skill => <article key={skill.id} className="paper-entry"><h3>{skill.name}</h3><Text>{skill.definition || "No definition recorded."}</Text>{skill.manaCost != null ? <Text>Catalog metadata mana: {skill.manaCost}. For a constructed spell, use its current Known Spell casting value.</Text> : null}</article>)}</>;
  if (kind === "story") return <>{data.story.length ? data.story.map(entry => <article className="paper-entry" key={entry.name}><h3>{entry.name}</h3><Text>{entry.text}</Text></article>) : <p>No story recorded.</p>}</>;
  return <>{kind === "inventory" ? <OwnedInventory data={data} /> : null}{data.gear.filter(gear => kind === "inventory" || gear.equipment).map(gear => <article key={gear.id} className="paper-entry"><h3>{gear.name}</h3>{gear.details.length ? gear.details.map((detail, i) => <Text key={i}>{detail}</Text>) : <Text>No description recorded.</Text>}</article>)}</>;
}

/** Every preset, genre and exported sample uses this saved-record renderer. */
export function PaperCharacterSheet({data, selection = DEFAULT_PRINT_SELECTION, theme = "Universal", headings = "standard"}: {data: PaperCharacterData; selection?: UnifiedPrintSelection; theme?: PrintTheme; headings?: PrintHeadings}) {
  const sections: Array<{key: string; title: string; content: ReactNode}> = [];
  if (selection.front) sections.push({key: "front", title: "Standard front", content: <PaperSheetFront data={data} />});
  for (const back of selection.backs) sections.push({key: `back-${back}`, title: `${back} back`, content: <Back data={data} back={back} />});
  for (const system of selection.books) {
    const spells = data.spells.filter(spell => spell.system === system);
    const skills = data.skills.filter(skill => !skill.special && skill.systems.includes(system) && !spells.some(spell => spell.key === `catalog:${skill.id}`));
    sections.push({key: `book-${system}`, title: `${PRINT_BOOKS[system]} — ${system}`, content: <>
      <p className="paper-caption">Current Known Spell casting values use the saved practitioner level. Saved descriptions and constructed effects retain their own sources; disagreements require review.</p>
      {spells.map(spell => <SpellEntry key={spell.key} spell={spell} detailed />)}
      {skills.length ? <Box title="Recorded skills & powers"><div className="paper-book-skills">{skills.map(skill => <RecordedSkill key={skill.id} skill={skill} />)}</div></Box> : null}
      {!spells.length && !skills.length ? <p>No owned {system} entries recorded.</p> : null}
    </>});
  }
  for (const reference of selection.references) sections.push({key: `reference-${reference}`, title: PRINT_REFERENCES[reference], content: <Reference data={data} kind={reference} />});
  const stamp = data.recordedAt.replace("T", " ").replace(/\.\d+Z$/, " UTC");
  return <div className="paper-character-sheet" data-character-id={data.characterId} data-print-theme={theme} aria-label="Paper Character Sheet">
    <style>{sections.map(section => `@page ${sectionKey(section.key)} { size: letter portrait; margin: .45in .4in .43in; @top-left { content: ${cssText(data.name)}; font: 8pt Arial; color: #333; } @top-right { content: ${cssText(section.title)}; font: 8pt Arial; color: #333; } @bottom-left { content: ${cssText(`Recorded as of ${stamp}`)}; font: 8pt Arial; color: #333; } @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt Arial; color: #333; } }`).join("\n")}</style>
    {sections.map(section => <section key={section.key} data-print-section={section.key} className="paper-page-section" style={{page: sectionKey(section.key)}}>
      <PaperSheetMasthead title={section.key === "front" ? printPresentationHeading(theme, headings) : section.title} theme={theme} />
      {section.content}
    </section>)}
  </div>;
}
