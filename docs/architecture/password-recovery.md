# Password visibility and account recovery

Sign-in, registration, recovery setup, and password reset share `PasswordInput`. Show and Hide only change the input's visibility; they preserve its value and do not submit a form. Password creation and reset use the same server-enforced 8 to 128 character policy.

This private-server workflow uses saved recovery codes, with no email provider or administrator required for recovery:

1. While signed in, open Profile → Password recovery. Confirm the current account password to generate eight codes.
2. Copy, download, or print the codes immediately. Keep them outside this account. The server stores hashes, so it cannot display the original codes again.
3. From sign-in, open Forgot your password? and enter one saved code. Spaces, hyphens, and letter case do not affect code matching.
4. Choose and confirm a new password within ten minutes. The reset signs out all existing sessions and invalidates the old recovery codes and reset tokens.
5. Sign in with the new password and save a fresh set of codes in Profile.

Generating a replacement set invalidates the previous set and any unfinished recovery token. Redeeming a code consumes it once, including concurrent submissions. A second valid code replaces any unfinished recovery token. If a connection failure loses the reset page, use another saved code. Recovery codes have no time expiry; they remain usable until redeemed, replaced, or invalidated by completed recovery.

Recovery must be set up before a lockout. If an account has no saved codes and cannot sign in anywhere, the server owner must restore access. The application does not grant account access based only on a username or email.

`user_password_recovery_code` stores SHA-256 hashes of cryptographically random 128-bit codes, their owner, and creation time. Generation requires an active owner session and verifies the current credential password inside the replacement transaction. Recovery exchanges a code for a random 256-bit Better Auth reset token. Reset verification identifiers are also hashed. Better Auth's reset endpoint handles password hashing, validation, token expiry, and single consumption; the recovery completion hook removes remaining codes/tokens, revokes sessions, and notifies live connections. Recovery requests use Better Auth's origin checks and a five-attempt, sixty-second rate limit per client IP. Rate counters use the existing process-local storage and reset when the application restarts; multiple app processes maintain separate counters.

The new table is introduced by `drizzle/0097_password_recovery_codes.sql`. Apply that migration to the intended server database before running this version of the application. Existing accounts are not assigned codes automatically. No email settings or external account are needed.

Run `npm run validate:password-recovery` for an isolated PostgreSQL and browser rehearsal. It exercises desktop and 390px interfaces, setup for every role, current-password checks, download and hiding, replacement, concurrent code redemption, expiry, anonymous recovery, password mismatch, session revocation, old-password rejection, origin checks, and rate limits. The test never uses `.env.local`'s database connection.

The design follows [OWASP's password recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) for saved offline codes, secure token storage, single use, and session invalidation, and uses [Better Auth's password reset API](https://better-auth.com/docs/authentication/email-password).
