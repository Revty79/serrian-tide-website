import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function checkClientIP(render: string | undefined, nodeEnv: "development" | "production", checks: string) {
  // Exercise the actual application config without loading env files or a DB.
  const script = `
    import assert from "node:assert/strict";
    import { getIP } from "@better-auth/core/utils/ip";
    const { auth } = await import("./src/lib/auth.ts");
    const { pool } = await import("./src/db/index.ts");
    pool.connect = pool.query = () => { throw Error("Client-IP tests must not access a database"); };
    try {
      const context = await auth.$context;
      assert.equal(context.rateLimit.enabled, true);
      assert.equal(context.skipOriginCheck, false);
      assert.equal(context.skipCSRFCheck, false);
      assert.equal(auth.options.emailAndPassword.enabled, true);
      assert.ok(context.sessionConfig.expiresIn > 0);
      assert.equal(context.authCookies.sessionToken.attributes.httpOnly, true);
      assert.notEqual(auth.options.advanced?.ipAddress?.disableIpTracking, true);
      assert.equal(auth.options.advanced?.ipAddress?.trustedProxies, undefined);
      assert.notEqual(auth.options.advanced?.trustedProxyHeaders, true);
      let credentialLookups = 0;
      context.internalAdapter.findUserByEmail = async () => { credentialLookups++; return null; };
      async function signIn(headers, expectedStatus) {
        const before = credentialLookups;
        const response = await auth.handler(new Request("https://auth.example.invalid/api/auth/sign-in/email", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://auth.example.invalid", ...headers },
          body: JSON.stringify({ email: "missing@example.invalid", password: "Test-Only-Password!" }),
        }));
        assert.equal(response.status, expectedStatus, JSON.stringify(headers));
        assert.equal(credentialLookups - before, expectedStatus === 401 ? 1 : 0);
        if (expectedStatus === 401) assert.equal((await response.json()).code, "INVALID_EMAIL_OR_PASSWORD");
        if (expectedStatus === 429) assert.ok(Number(response.headers.get("x-retry-after")) > 0);
      }
      ${checks}
    } finally {
      await pool.end();
    }
  `;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: nodeEnv,
    TEST: "false",
    DATABASE_URL: "postgresql://client_ip_test@127.0.0.1:1/no_database",
    BETTER_AUTH_URL: "https://auth.example.invalid/api/auth",
    BETTER_AUTH_SECRET: "client-ip-test-only-secret-at-least-32-characters",
    BETTER_AUTH_TELEMETRY: "0",
  };
  delete env.BETTER_AUTH_TRUSTED_ORIGINS;
  if (render === undefined) delete env.RENDER;
  else env.RENDER = render;
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", script,
  ], { cwd: process.cwd(), env, encoding: "utf8", timeout: 30_000, windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

test("Render uses only the Cloudflare client-IP header and rejects missing or invalid addresses", () => {
  checkClientIP("true", "production", `
    assert.deepEqual(auth.options.advanced.ipAddress.ipAddressHeaders, ["cf-connecting-ip"]);
    const untrusted = { "x-forwarded-for": "192.0.2.1", "x-real-ip": "192.0.2.2", "x-client-ip": "192.0.2.3", forwarded: "for=192.0.2.4" };
    assert.equal(getIP(new Headers({ ...untrusted, "cf-connecting-ip": "203.0.113.10" }), context.options), "203.0.113.10");
    for (const headers of [{}, untrusted, { ...untrusted, "x-forwarded-for": "192.0.2.1, 192.0.2.2" }]) {
      assert.equal(getIP(new Headers(headers), context.options), null);
    }
    for (const value of ["", "not-an-ip", "203.0.113.10, 203.0.113.11"]) {
      assert.equal(getIP(new Headers({ ...untrusted, "cf-connecting-ip": value }), context.options), null);
    }
  `);
});

for (const [label, render, nodeEnv] of [
  ["local development", undefined, "development"],
  ["Ubuntu production", undefined, "production"],
  ["RENDER=false", "false", "production"],
  ["RENDER=TRUE", "TRUE", "production"],
  ["RENDER=1", "1", "production"],
] as const) {
  test(`${label} retains Better Auth's existing default IP configuration`, () => {
    checkClientIP(render, nodeEnv, `
      assert.equal(auth.options.advanced, undefined);
      assert.equal(getIP(new Headers({ "x-forwarded-for": "192.0.2.10" }), context.options), "192.0.2.10");
    `);
  });
}

test("Render authentication rate limits by trusted client IP despite changing forwarded headers", () => {
  checkClientIP("true", "production", `
    for (let n = 1; n <= 3; n++) {
      await signIn({ "cf-connecting-ip": "203.0.113.10", "x-forwarded-for": "192.0.2." + n }, 401);
    }
    await signIn({ "cf-connecting-ip": "203.0.113.10", "x-forwarded-for": "192.0.2.99, 192.0.2.100" }, 429);
    await signIn({ "cf-connecting-ip": "203.0.113.11", "x-forwarded-for": "192.0.2.99" }, 401);
  `);
});

test("missing Render client IP keeps a shared rate limit instead of trusting other headers", () => {
  checkClientIP("true", "production", `
    await signIn({}, 401);
    for (let n = 1; n <= 2; n++) {
      await signIn({ "x-forwarded-for": "192.0.2." + n, "x-real-ip": "192.0.2." + n, "x-client-ip": "192.0.2." + n }, 401);
    }
    await signIn({ "x-forwarded-for": "192.0.2.99" }, 429);
    await signIn({ "cf-connecting-ip": "invalid", "x-forwarded-for": "192.0.2.100" }, 429);
    await signIn({ "cf-connecting-ip": "203.0.113.10" }, 401);
  `);
});
