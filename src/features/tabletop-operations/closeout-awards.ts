export type CloseoutAwardTarget = { sessionId: number; sceneId: number | null };
export type CloseoutAward = { characterId: number; experience: number; fame: number; quintessence: number };
export type CloseoutAwardInput = { awards: CloseoutAward[]; note: string };
export type CloseoutAwardView = {
  recipients: Array<{ characterId: number; characterName: string }>;
  decision: null | {
    id: number;
    awardedAt: string;
    awardedBy: string;
    note: string;
    awards: Array<CloseoutAward & { characterName: string }>;
  };
};
export type PlayerCloseoutAward = CloseoutAward & {
  id: number; sessionTitle: string; sceneTitle: string | null; awardedAt: string; note: string;
};

export function normalizeCloseoutAwards(input: CloseoutAwardInput): CloseoutAwardInput {
  if (!input || !Array.isArray(input.awards) || input.awards.length > 1000) throw new Error("Choose a valid closeout award list.");
  if (typeof input.note !== "string" || input.note.trim().length > 2000) throw new Error("Award notes must be at most 2000 characters.");
  const seen = new Set<number>();
  const awards = input.awards.map((award) => {
    if (!award || !Number.isSafeInteger(award.characterId) || award.characterId <= 0 || seen.has(award.characterId)) throw new Error("Each award must name one distinct Character.");
    seen.add(award.characterId);
    const amount = (value: number) => {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw new Error("XP, Fame, and Quintessence awards must be finite, nonnegative amounts.");
      return value === 0 ? 0 : value;
    };
    return { characterId: award.characterId, experience: amount(award.experience), fame: amount(award.fame), quintessence: amount(award.quintessence) };
  }).sort((a, b) => a.characterId - b.characterId);
  return { awards, note: input.note.trim() };
}

export function closeoutAwardTotalIsSafe(balance: number, award: number): boolean {
  return Number.isFinite(balance) && balance >= 0 && balance + award <= Number.MAX_SAFE_INTEGER
    && (award === 0 || balance + award > balance);
}
