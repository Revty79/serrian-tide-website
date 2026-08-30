import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  calculateCreatureChallengeRating,
  getCreatureKillXpForChallengeRating,
  type ChallengeRatingCreatureLike,
  type ChallengeRatingReferenceLike,
} from "./challenge-rating";

type RewardCanon = {
  title: string;
  version: number;
  rewards: Array<{ challengeRating: number; killXp: number }>;
};

const expectedKillXp = [
  2, 3, 4, 5, 7, 9, 11, 13, 15, 18,
  21, 24, 27, 30, 34, 38, 42, 46, 50, 55,
  60, 65, 70, 75, 81, 87, 93, 100, 107, 115,
  123, 131, 139, 147, 156, 165, 174, 183, 192, 201,
  211, 221, 231, 241, 252, 263, 274, 286, 298, 310,
] as const;

const canon = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), "data", "canon", "serrian-tide-cr-xp-canon.json"),
    "utf8",
  ),
) as RewardCanon;

const references: ChallengeRatingReferenceLike[] = canon.rewards.map((reward) => ({
  ...reward,
  attackTargetGuidance: String(reward.challengeRating),
  damageGuidance: String(reward.challengeRating),
  initiativeGuidance: String(reward.challengeRating),
  soakGuidance: String(reward.challengeRating),
}));

function creatureWithAdjustment(
  challengeRatingAdjustment: number,
  submittedKillXp = 999_999,
): ChallengeRatingCreatureLike & { core: { killXp: number } } {
  return {
    core: { challengeRatingAdjustment, killXp: submittedKillXp },
    attacks: [],
    movement: [],
    hitLocations: [],
    abilities: [],
    defenses: [],
  };
}

test("checked-in Creature CR XP canon contains the exact locked CR 1-50 table", () => {
  assert.equal(canon.title, "Serrian Tide CR XP Canon");
  assert.equal(canon.version, 1);
  assert.equal(canon.rewards.length, 50);
  assert.deepEqual(
    canon.rewards.map(({ challengeRating }) => challengeRating),
    Array.from({ length: 50 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    canon.rewards.map(({ killXp }) => killXp),
    [...expectedKillXp],
  );
  assert.equal(new Set(canon.rewards.map(({ challengeRating }) => challengeRating)).size, 50);

  for (const reward of canon.rewards) {
    assert.equal(
      getCreatureKillXpForChallengeRating(reward.challengeRating, canon.rewards),
      reward.killXp,
    );
  }
});

test("the consolidated baseline seeds every locked CR XP value", () => {
  const migration = readFileSync(
    path.resolve(process.cwd(), "drizzle", "0000_serrian_tide_baseline.sql"),
    "utf8",
  );
  for (const { challengeRating, killXp } of canon.rewards) {
    assert.ok(
      migration.includes(`(${challengeRating}, ${killXp})`),
      `Baseline migration is missing CR ${challengeRating} XP ${killXp}.`,
    );
  }
});

test("final CR determines XP and ignores a submitted Creature XP value", () => {
  const cr1 = calculateCreatureChallengeRating(creatureWithAdjustment(0), references);
  assert.equal(cr1.calculatedRating, 1);
  assert.equal(cr1.finalRating, 1);
  assert.equal(cr1.killXp, 2);

  const cr20 = calculateCreatureChallengeRating(creatureWithAdjustment(19, 1), references);
  assert.equal(cr20.finalRating, 20);
  assert.equal(cr20.killXp, 55);

  const cr50 = calculateCreatureChallengeRating(creatureWithAdjustment(49, 0), references);
  assert.equal(cr50.finalRating, 50);
  assert.equal(cr50.killXp, 310);
});

test("CR adjustment is applied before XP lookup and final CR remains clamped to 1-50", () => {
  const lower = calculateCreatureChallengeRating(creatureWithAdjustment(-49), references);
  assert.equal(lower.finalRating, 1);
  assert.equal(lower.killXp, 2);

  const upper = calculateCreatureChallengeRating(creatureWithAdjustment(999), references);
  assert.equal(upper.adjustment, 49);
  assert.equal(upper.finalRating, 50);
  assert.equal(upper.killXp, 310);
});

test("a missing or invalid final-CR reward is explicit instead of falling back", () => {
  assert.throws(
    () => getCreatureKillXpForChallengeRating(20, references.filter(({ challengeRating }) => challengeRating !== 20)),
    /Missing canonical Kill XP reference for Creature CR 20/,
  );
  assert.throws(
    () => getCreatureKillXpForChallengeRating(0, references),
    /outside the supported 1-50 range/,
  );
});
