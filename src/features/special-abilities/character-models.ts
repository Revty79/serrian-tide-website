import type { SpecialAbilityMechanicsProjection } from "./resolution";

export type CharacterSpecialAbility = {
  definition: string;
  possession: { purchased: boolean; racial: boolean };
  mechanics: SpecialAbilityMechanicsProjection;
};
export type CharacterSpecialAbilityView = {
  characterId: number;
  context: "saved-normal" | "native-creature-unavailable";
  abilities: CharacterSpecialAbility[];
  runtimeSupported: false;
};
