export const FORM_MANIPULATION_OPTIONS = { full: "Full manipulation", limited: "Limited manipulation", none: "No functional manipulation" } as const;
export const FORM_SPEECH_OPTIONS = { normal: "Normal speech", limited: "Limited speech", none: "No normal speech" } as const;
export const FORM_EQUIPMENT_OPTIONS = { retained: "Retained normally", unusable: "Retained but unusable", dropped: "Dropped", merged: "Merges / becomes inaccessible", custom: "Custom / G.O.D. ruling" } as const;
export type FormCapability<T extends string> = { state: T; notes: string };
