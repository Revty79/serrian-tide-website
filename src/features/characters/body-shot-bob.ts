/** The same vector artwork is used by the live Character sheet and the PDF. */
export const BODY_SHOT_BOB_PATHS = [
  "M188 103h44l9 31h-62z",
  "M150 126Q210 108 270 126l15 75-14 76-31 63h-60l-31-63-14-76z",
  "M148 136Q116 143 103 178L66 307q-6 25 18 33 23 7 32-17l45-123z",
  "M272 136q32 7 45 42l37 129q6 25-18 33-23 7-32-17l-45-123z",
  "M180 326h30v263h-50l5-137z",
  "M210 326h30l15 126 5 137h-50z",
  "M145 589h66v14h-77q-8-8 11-14z",
  "M209 589h66q19 6 11 14h-77z",
] as const;
export const BODY_SHOT_BOB_TARGETS: Record<number, { x: number; y: number }> = {
  0: { x: 210, y: 62 }, 1: { x: 91, y: 226 }, 2: { x: 329, y: 226 },
  3: { x: 166, y: 505 }, 4: { x: 180, y: 389 }, 5: { x: 254, y: 505 },
  6: { x: 240, y: 389 }, 7: { x: 210, y: 304 }, 8: { x: 210, y: 234 }, 9: { x: 210, y: 158 },
};
