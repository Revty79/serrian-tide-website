/** No reviewed definition-level slots exist yet. Runtime G.O.D. rulings in
 * weapon governance/defense are actor-authorized actions, not shared Skill slots.
 * A future entry must specify its owner, typed parameter decoder, precedence,
 * conflicts and authoring-only status before the codec/UI can accept it.
 */
export type OverrideSlot = {
  ownerSubsystem: string; key: string; parameterSchemaVersion: number;
  parseParameters: (value: unknown) => unknown; conflictPolicy: string;
  runtimeSupported: false;
};
export const SPECIAL_ABILITY_OVERRIDE_SLOTS: Readonly<Record<string, OverrideSlot>> = Object.freeze({});
export function requireRegisteredOverrideSlot(key: string): OverrideSlot {
  if (!Object.hasOwn(SPECIAL_ABILITY_OVERRIDE_SLOTS, key)) throw new Error("This override slot is not registered. Describe the proposed change for G.O.D. determination instead.");
  return SPECIAL_ABILITY_OVERRIDE_SLOTS[key];
}
