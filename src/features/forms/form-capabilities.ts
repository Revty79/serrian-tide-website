export const FORM_MANIPULATION_OPTIONS = { full: "Can use hands, tools and objects normally", limited: "Limited use of hands, tools or objects", none: "Cannot use hands, tools or objects" } as const;
export const FORM_SPEECH_OPTIONS = { normal: "Normal speech", limited: "Limited speech", none: "No normal speech" } as const;
export const FORM_EQUIPMENT_OPTIONS = { retained: "Equipment stays with the body as normal", unusable: "Equipment stays with the body but cannot be used", dropped: "Equipment falls to the ground", merged: "Equipment merges with the body and cannot be reached", custom: "Custom / G.O.D. ruling" } as const;
export type FormCapability<T extends string> = { state: T; notes: string };
