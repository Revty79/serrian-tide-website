type PaperWeaponRangeInput = {
  rangeMode?: string | null;
  distanceUnit?: string | null;
  reachDistance?: number | null;
  shortRangeDistance?: number | null;
  mediumRangeDistance?: number | null;
  longRangeDistance?: number | null;
  reachText?: string | null;
  rangeText?: string | null;
};

/** Display the authored limits; never infer distances, units or combat eligibility. */
export function describePaperWeaponRange(profile: PaperWeaponRangeInput) {
  const distance = (value: number | null | undefined) => value != null && Number.isFinite(value) ? String(value) : "—";
  const unit = profile.distanceUnit?.trim();
  const full: string[] = [], compact: string[] = [];
  if (profile.rangeMode !== "ranged") {
    if (profile.reachDistance != null) {
      full.push(`Reach ${distance(profile.reachDistance)} ${unit || "(unit not recorded)"}`);
      compact.push(`Reach ${distance(profile.reachDistance)} ${unit || "[unit?]"}`);
    } else if (profile.reachText?.trim()) {
      full.push(`Reach ${profile.reachText.trim()}`); compact.push(`Reach ${profile.reachText.trim()}`);
    }
  }
  if (profile.rangeMode !== "melee") {
    const values = [profile.shortRangeDistance, profile.mediumRangeDistance, profile.longRangeDistance];
    if (values.some(value => value != null)) {
      full.push(`Short ${distance(values[0])}; Medium ${distance(values[1])}; Long ${distance(values[2])} ${unit || "(unit not recorded)"}`);
      compact.push(`S/M/L ${values.map(distance).join("/")} ${unit || "[unit?]"}`);
    } else if (profile.rangeText?.trim()) {
      full.push(`Range ${profile.rangeText.trim()}`); compact.push(profile.rangeText.trim());
    }
  }
  return { full: full.join("; ") || "Range/reach not recorded", compact: compact.join("; ") || "—" };
}
