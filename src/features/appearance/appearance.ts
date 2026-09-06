export const APPEARANCE_PRESET_IDS = ["serrian-tide", "classic"] as const;

export type AppearancePresetId = (typeof APPEARANCE_PRESET_IDS)[number];

export type AppearanceColors = {
  pageBackground: string;
  surfaceBackground: string;
  primaryAccent: string;
  secondaryAccent: string;
  mainText: string;
  mutedText: string;
};

export type SiteAppearance = AppearanceColors & {
  presetId: AppearancePresetId;
};

export const APPEARANCE_PRESETS: Record<AppearancePresetId, SiteAppearance> = {
  "serrian-tide": {
    presetId: "serrian-tide",
    pageBackground: "#04030C",
    surfaceBackground: "#0B1018",
    primaryAccent: "#4DA97D",
    secondaryAccent: "#F9D34E",
    mainText: "#E7EAD9",
    mutedText: "#9EADA4",
  },
  classic: {
    presetId: "classic",
    pageBackground: "#06080F",
    surfaceBackground: "#0A0F1E",
    primaryAccent: "#8B5CF6",
    secondaryAccent: "#F5CA73",
    mainText: "#E2E8F0",
    mutedText: "#9DA9B7",
  },
};

export const DEFAULT_APPEARANCE = APPEARANCE_PRESETS["serrian-tide"];

export const APPEARANCE_COLOR_FIELDS = [
  "pageBackground",
  "surfaceBackground",
  "primaryAccent",
  "secondaryAccent",
  "mainText",
  "mutedText",
] as const satisfies ReadonlyArray<keyof AppearanceColors>;

const HEX_COLOR = /^#[0-9A-F]{6}$/;

function normalizeHexColor(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a six-digit hexadecimal color.`);
  }
  const normalized = value.trim().toUpperCase();
  if (!HEX_COLOR.test(normalized)) {
    throw new Error(`${label} must use the format #RRGGBB.`);
  }
  return normalized;
}

function parsePresetId(value: unknown): AppearancePresetId {
  if (typeof value !== "string" || !APPEARANCE_PRESET_IDS.includes(value as AppearancePresetId)) {
    throw new Error("Choose a supported appearance preset.");
  }
  return value as AppearancePresetId;
}

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const normalized = normalizeHexColor(hex, "Color");
  const channels = [1, 3, 5].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
  return (
    0.2126 * channelToLinear(channels[0]!)
    + 0.7152 * channelToLinear(channels[1]!)
    + 0.0722 * channelToLinear(channels[2]!)
  );
}

export function contrastRatio(first: string, second: string): number {
  const brighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (brighter + 0.05) / (darker + 0.05);
}

export function getAppearanceContrastIssues(appearance: SiteAppearance): string[] {
  const issues: string[] = [];
  const textPairs: Array<[string, string, string]> = [
    [appearance.mainText, appearance.pageBackground, "Main text against the page background"],
    [appearance.mainText, appearance.surfaceBackground, "Main text against panels"],
    [appearance.mutedText, appearance.pageBackground, "Muted text against the page background"],
    [appearance.mutedText, appearance.surfaceBackground, "Muted text against panels"],
  ];
  for (const [foreground, background, label] of textPairs) {
    if (contrastRatio(foreground, background) < 4.5) {
      issues.push(`${label} needs at least 4.5:1 contrast.`);
    }
  }
  if (contrastRatio(appearance.primaryAccent, appearance.surfaceBackground) < 3) {
    issues.push("The primary accent needs at least 3:1 contrast against panels.");
  }
  if (contrastRatio(appearance.secondaryAccent, appearance.pageBackground) < 3) {
    issues.push("The secondary accent needs at least 3:1 contrast against the page background.");
  }
  return issues;
}

export function parseSiteAppearance(input: Record<string, unknown>): SiteAppearance {
  const appearance: SiteAppearance = {
    presetId: parsePresetId(input.presetId),
    pageBackground: normalizeHexColor(input.pageBackground, "Page background"),
    surfaceBackground: normalizeHexColor(input.surfaceBackground, "Panel background"),
    primaryAccent: normalizeHexColor(input.primaryAccent, "Primary accent"),
    secondaryAccent: normalizeHexColor(input.secondaryAccent, "Secondary accent"),
    mainText: normalizeHexColor(input.mainText, "Main text"),
    mutedText: normalizeHexColor(input.mutedText, "Muted text"),
  };
  const contrastIssues = getAppearanceContrastIssues(appearance);
  if (contrastIssues.length > 0) {
    throw new Error(contrastIssues.join(" "));
  }
  return appearance;
}

export function appearanceFromFormData(formData: FormData): SiteAppearance {
  return parseSiteAppearance(Object.fromEntries(
    ["presetId", ...APPEARANCE_COLOR_FIELDS].map((field) => [field, formData.get(field)]),
  ));
}

export function getAppearanceCssVariables(appearance: SiteAppearance): Record<string, string> {
  const onPrimary = contrastRatio("#04030C", appearance.primaryAccent) >= contrastRatio("#FFFFFF", appearance.primaryAccent)
    ? "#04030C"
    : "#FFFFFF";
  const onSecondary = contrastRatio("#04030C", appearance.secondaryAccent) >= contrastRatio("#FFFFFF", appearance.secondaryAccent)
    ? "#04030C"
    : "#FFFFFF";
  return {
    "--st-page": appearance.pageBackground,
    "--st-surface": appearance.surfaceBackground,
    "--st-primary": appearance.primaryAccent,
    "--st-secondary": appearance.secondaryAccent,
    "--st-text": appearance.mainText,
    "--st-muted": appearance.mutedText,
    "--st-on-primary": onPrimary,
    "--st-on-secondary": onSecondary,
  };
}
