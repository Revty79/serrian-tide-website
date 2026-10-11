import { z } from "zod";
import { HISTORY_LIMIT } from "./branching-history";
import type { EntryRecord } from "./history";

export const CALENDAR_HISTORY_PAGE_SIZE = 50;
export const calendarHistoryQuerySchema = z.object({
  versionId: z.string().uuid(),
  offset: z.number().int().min(0).max(HISTORY_LIMIT).default(0),
  includeArchived: z.boolean().default(false),
}).strict();
export type CalendarHistoryPage = { entries: EntryRecord[]; nextOffset: number | null };
