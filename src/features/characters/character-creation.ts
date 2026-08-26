export const CHARACTER_CREATION_TABS = [
  { id: "identity", label: "Identity" },
  { id: "attributes", label: "Attributes" },
  { id: "skills", label: "Skills & Abilities" },
  { id: "story", label: "Story & Personality" },
  { id: "equipment", label: "Equipment" },
  { id: "god", label: "G.O.D. Controls" },
  { id: "sheet", label: "Character Sheet" },
] as const;

export type CharacterCreationTab = (typeof CHARACTER_CREATION_TABS)[number]["id"];

export function getCharacterCreationTabs(godMode: boolean) {
  return CHARACTER_CREATION_TABS.filter((tab) => godMode || tab.id !== "god");
}
