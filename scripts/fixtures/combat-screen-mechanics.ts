export function screenFirearmRangeProfile() {
  return { rangeMode: "ranged" as const, distanceUnit: "feet", shortRangeDistance: 10, mediumRangeDistance: 25, longRangeDistance: 50 };
}
