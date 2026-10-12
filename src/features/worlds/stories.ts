import { z } from "zod";
import { historicalTimeSchema } from "./history";
import { calendarEntryDraftSchema, type CalendarSource } from "./calendar-dates";
import type { SourceDating } from "./chronology";

export const storyKinds = ["myth", "creation story", "legend", "folklore", "prophecy", "vision", "omen", "rumor", "secret history", "oral tradition", "personal account"] as const;
export const storyFields = {
  classification: "Kind of story", story: "The story", origin: "Origin and attribution", authorship: "Known or disputed authorship",
  narrator: "Narrator and perspective", audience: "Intended audience", transmission: "Cultural transmission",
  context: "Historical context and uncertainty", interpretations: "Competing interpretations", sourceContext: "Original source context",
} as const;
export const storyContextSchema = z.object({
  time: historicalTimeSchema.default({ version: 1, scale: "world-year", kind: "undated" }),
  datingSystemId: z.string().uuid().nullable().optional(), datingSystemRevision: z.number().int().positive().optional(),
  calendarDate: calendarEntryDraftSchema.nullable().optional(), protected: z.boolean().default(false),
}).strict();
export type StoryContext = z.infer<typeof storyContextSchema>;
export const storySourceSchema = z.object({
  id: z.string().uuid(), entityId: z.string().uuid(), versionId: z.string().uuid(), revision: z.number().int().positive(),
  relationshipType: z.string().trim().min(1, "Describe how this earlier account relates to the story.").max(160),
  account: z.string().max(50_000).default(""), protected: z.boolean().default(false),
}).strict();
export type StorySource = z.infer<typeof storySourceSchema>;
export type StorySources = {
  context: { sourceDating: SourceDating | null; calendarSource: CalendarSource | null };
  originals: (StorySource & { name: string; sourceTimelineId: string; archived: boolean; unavailable: boolean })[];
};
