import { z } from "zod";
export const YEAR_LIMIT = 1_000_000_000_000;
export const yearSchema = z.number().int().min(-YEAR_LIMIT).max(YEAR_LIMIT);
