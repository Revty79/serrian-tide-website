import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const passwordRecoveryCode = pgTable("user_password_recovery_code", {
  codeHash: text("code_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("user_password_recovery_code_user_idx").on(table.userId)]);
