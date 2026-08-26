import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";

import { db } from "@/db";
import * as schema from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),

  emailAndPassword: {
    enabled: true,
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await db
            .insert(userRole)
            .values({
              userId: user.id,
              role: "player",
            })
            .onConflictDoNothing();
        },
      },
    },
  },

  plugins: [
    username({
      immutableUsername: true,
    }),
  ],
});