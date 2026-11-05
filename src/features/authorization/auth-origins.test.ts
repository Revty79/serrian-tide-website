import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const baseOrigin = "https://auth.example.invalid";
const localOrigin = "http://192.0.2.10:3000";
const tunnelOrigin = "https://serrian-test-tunnel.trycloudflare.com";

function checkOrigins(additionalOrigins: string | undefined, expectedOrigins: string[]) {
  // Load the real application config in a fresh server-only process. No env files
  // are loaded; database access is fenced off and credential lookup is a stub.
  const script = `
    import assert from "node:assert/strict";
    const { auth } = await import("./src/lib/auth.ts");
    const { pool } = await import("./src/db/index.ts");
    pool.connect = pool.query = () => { throw Error("Origin tests must not access a database"); };
    try {
      const context = await auth.$context;
      assert.equal(context.skipOriginCheck, false);
      assert.equal(context.skipCSRFCheck, false);
      assert.equal(context.rateLimit.enabled, true);
      assert.deepEqual(await auth.options.trustedOrigins(), ${JSON.stringify(expectedOrigins)});
      let credentialLookups = 0;
      let clientNumber = 0;
      const clientHeaders = () => ({ "X-Forwarded-For": "192.0.2." + ++clientNumber });
      context.internalAdapter.findUserByEmail = async () => { credentialLookups++; return null; };
      const allowed = [${JSON.stringify(baseOrigin)}, ...${JSON.stringify(expectedOrigins)}];
      const denied = [
        "https://unapproved.example.invalid",
        "https://another-tunnel.trycloudflare.com",
        "http://192.0.2.11:3000",
        "http://192.0.2.10:3001",
        "https://serrian-test-tunnel.trycloudflare.com.evil.invalid",
        ...[${JSON.stringify(localOrigin)}, ${JSON.stringify(tunnelOrigin)}].filter(origin => !allowed.includes(origin)),
      ];
      for (const cookie of [false, true]) {
        for (const [origins, status, code, lookups] of [
          [allowed, 401, "INVALID_EMAIL_OR_PASSWORD", 1],
          [denied, 403, "INVALID_ORIGIN", 0],
        ]) {
          for (const origin of origins) {
            const before = credentialLookups;
            const response = await auth.handler(new Request(origin + "/api/auth/sign-in/email", {
              method: "POST",
              headers: {
                "Content-Type": "application/json", Origin: origin, ...clientHeaders(),
                ...(cookie ? { Cookie: "better-auth.session_token=test-only-invalid-cookie" } : {}),
              },
              body: JSON.stringify({ email: "missing@example.invalid", password: "Test-Only-Password!" }),
            }));
            assert.equal(response.status, status, origin + " cookie=" + cookie);
            assert.equal((await response.json()).code, code, origin);
            assert.equal(credentialLookups - before, lookups, origin + " credential lookup");
          }
        }
      }
      // Trusted origin does not authorize an external callback or bypass login CSRF.
      const callback = await auth.handler(new Request(${JSON.stringify(baseOrigin + "/api/auth/sign-in/email")}, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ${JSON.stringify(baseOrigin)}, ...clientHeaders() },
        body: JSON.stringify({ email: "missing@example.invalid", password: "Test-Only-Password!", callbackURL: "https://unapproved.example.invalid/return" }),
      }));
      assert.equal(callback.status, 403);
      assert.equal((await callback.json()).code, "INVALID_CALLBACK_URL");
      const csrf = await auth.handler(new Request(${JSON.stringify(baseOrigin + "/api/auth/sign-in/email")}, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ${JSON.stringify(baseOrigin)}, ...clientHeaders(), "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" },
        body: JSON.stringify({ email: "missing@example.invalid", password: "Test-Only-Password!" }),
      }));
      assert.equal(csrf.status, 403);
      assert.equal((await csrf.json()).code, "CROSS_SITE_NAVIGATION_LOGIN_BLOCKED");
    } finally {
      await pool.end();
    }
  `;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    TEST: "false",
    DATABASE_URL: "postgresql://origin_test@127.0.0.1:1/origin_test_no_connection",
    BETTER_AUTH_URL: baseOrigin + "/api/auth",
    BETTER_AUTH_SECRET: "authentication-origin-test-only-secret-at-least-32-characters",
    BETTER_AUTH_TELEMETRY: "0",
  };
  if (additionalOrigins === undefined) delete env.BETTER_AUTH_TRUSTED_ORIGINS;
  else env.BETTER_AUTH_TRUSTED_ORIGINS = additionalOrigins;
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", script,
  ], { cwd: process.cwd(), env, encoding: "utf8", timeout: 30_000, windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

test("configured local-IP and exact tunnel origins reach authentication; all others are rejected", () => {
  checkOrigins(` , ${localOrigin},,  ${tunnelOrigin} , \t,`, [localOrigin, tunnelOrigin]);
});

test("unset additional origins preserve base-URL authentication and reject extra origins", () => {
  checkOrigins(undefined, []);
});

test("empty and whitespace-only entries do not add trusted origins", () => {
  checkOrigins(" , \t, ,", []);
});
