import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";

import { db } from "@/db";
import * as schema from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { finishPasswordRecovery, passwordResetIdentifier, PASSWORD_RESET_LIFETIME_SECONDS } from "@/features/authorization/password-recovery-service";
import { passwordRecovery } from "@/features/authorization/password-recovery-plugin";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: PASSWORD_RESET_LIFETIME_SECONDS,
    revokeSessionsOnPasswordReset: true,
    onPasswordReset: async ({ user }) => finishPasswordRecovery(user.id),
  },

  verification: {
    storeIdentifier: {
      default: "plain",
      overrides: {
        "reset-password:": { hash: async (identifier) => passwordResetIdentifier(identifier) },
      },
    },
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
    passwordRecovery(),
    username({
      immutableUsername: true,
    }),
  ],
  rateLimit: { enabled: true },
});
