export const CHARACTER_CREATION_TABS = [
  { id: "identity", label: "Identity" },
  { id: "attributes", label: "Attributes" },
  { id: "skills", label: "Skills & Abilities" },
  { id: "story", label: "Story & Personality" },
  { id: "equipment", label: "Equipment" },
  { id: "god", label: "G.O.D." },
] as const;

export type CharacterCreationTab = (typeof CHARACTER_CREATION_TABS)[number]["id"];

export function getCharacterCreationTabs(canAccessPrivateGod: boolean) {
  return CHARACTER_CREATION_TABS.filter((tab) => canAccessPrivateGod || tab.id !== "god");
}
