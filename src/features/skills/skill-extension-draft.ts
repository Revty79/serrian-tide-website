export type SkillExtensionDraft = {
  extensionType: string;
  schemaVersion: number;
  data: unknown;
  readStatus?: "ready" | "invalid" | "unsupported";
  diagnostics?: string[];
};
export type SkillExtensionMutation =
  | { operation: "upsert"; extensionType: string; schemaVersion: number; data: unknown }
  | { operation: "remove"; extensionType: string };

/** Explicit pending family intent. Loaded extension arrays are views, never replacement lists. */
export function changeSkillExtension<T extends { extensions: SkillExtensionDraft[]; extensionMutations?: SkillExtensionMutation[] }>(draft: T, mutation: SkillExtensionMutation): T & { extensionMutations: SkillExtensionMutation[] } {
  const others = draft.extensions.filter(row => row.extensionType !== mutation.extensionType);
  return { ...draft, extensions: mutation.operation === "remove" ? others : [...others, { extensionType: mutation.extensionType, schemaVersion: mutation.schemaVersion, data: mutation.data, readStatus: "ready" }],
    extensionMutations: [...(draft.extensionMutations ?? []).filter(row => row.extensionType !== mutation.extensionType), mutation] };
}
