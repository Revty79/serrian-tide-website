// Authorized exercise overrides; never seed these into an ordinary Campaign.
export const COMBAT_COMPLETION_FIXTURE = {
  rowan: { id: 1, hp: 60, initiative: 26, weapon: "Longsword", damage: 6, cost: 6, attack: 40, block: 40, dodge: 40, soak: 2,
    attributes: { STR: 50, DEX: 50, CON: 50, INT: 35, WIS: 40, CHR: 35 } },
  mira: { id: 2, hp: 40, initiative: 22, weapon: "Staff", damage: 3, cost: 4, attack: 50, block: 50, dodge: 50, soak: 0, mana: 20,
    attributes: { STR: 30, DEX: 40, CON: 40, INT: 60, WIS: 50, CHR: 40 } },
  goblins: [-1, -2, -3].map((id) => ({ id, hp: 30, initiative: 22, weapon: "Shortsword", damage: 4, cost: 4, attack: 50, block: 50, dodge: 40, defeatValue: 3 })),
  bolt: { name: "Arc Bolt", target: 40, manaCost: 3, initiativeCost: 4, damagePerSuccess: 2 },
  rolls: { rowanFirst: 90, goblinOneBlock: 20, goblinTwoFirst: 55, rowanDodge: 74, rowanSecond: 9, goblinTwoBlock: 78, arcBolt: 12 },
  firstHitRuling: { damage: 11, location: "head", locationHp: 3, severed: true, defeated: true, defeatValue: 3, award: null },
  goblinThreeMovement: [{ from: 22, to: 20, feet: 4 }, { from: 20, to: 19, feet: 2 }, { from: 19, to: 18, feet: 2 }],
  expected: { rowanAfterFirst: 20, rowanAfterDodge: 19, rowanSecondEndpoint: 13, goblinTwoAfterBlock: 14, goblinTwoNextEndpoint: 10, miraAfterBolt: 18, miraMana: 17, boltDamage: 0 },
  holdVariant: { defenseRoll: 36, generatedForThisAssignment: true },
} as const;
