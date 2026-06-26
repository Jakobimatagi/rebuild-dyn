// ── Sleeper-verified account login ───────────────────────────────────────────
// Proves a visitor owns a Sleeper account, then issues *our own* Supabase
// session keyed to that account. Sleeper's undocumented GraphQL endpoint does
// the identity proof via a one-time code:
//
//   1. request-code: create_verification_code(email_or_phone, captcha)
//        → Sleeper sends a one-time code to the account's contact. This step
//          REQUIRES an hCaptcha token generated against Sleeper's own sitekey
//          (3bb6d565-5eb0-425f-acf8-64374f8bbc7b) — see SleeperConnect.
//   2. verify-code: login(email_or_phone_or_username, password: <code>)
//        → Sleeper's own apps validate an OTP by signing in with the code AS the
//          password. A non-null User means the visitor controls that contact; we
//          read user_id/username/etc. straight off it (no separate lookup), then
//          mint a Supabase magic-link token the browser exchanges for a session.
//
// We never see the user's Sleeper password and never store the code. The only
// long-lived identity is the Supabase user, with the Sleeper profile mirrored
// into user_metadata so the rest of the app can load their leagues/rosters.
//
// Abuse protection (durable, shared across invocations — see
// docs/migrations/auth_rate_limits_schema.sql):
//   • request-code is throttled per-email (anti email-bombing) and per-IP.
//   • verify-code is attempt-capped per-email and per-IP, then locked out, so
//     the short code can't be brute-forced. A successful verify clears the
//     counters. The limiter fails OPEN if the migration isn't applied yet (logs
//     a warning) so a missing table can't lock everyone out.
//
// Required server env (Vercel):
//   SUPABASE_URL                (falls back to VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY   (service role — server-only, never shipped)

import { createClient } from "@supabase/supabase-js";

const SLEEPER_GQL = "https://sleeper.com/graphql";

// Rate-limit configs: { limit attempts, per windowSec, lockSec once exceeded }.
const LIMITS = {
  requestCodeEmail: { limit: 4, windowSec: 15 * 60, lockSec: 30 * 60 },
  requestCodeIp: { limit: 15, windowSec: 15 * 60, lockSec: 30 * 60 },
  verifyEmail: { limit: 6, windowSec: 10 * 60, lockSec: 15 * 60 },
  verifyIp: { limit: 30, windowSec: 10 * 60, lockSec: 15 * 60 },
};

// Talk to Sleeper's GraphQL. Throws with a useful status on GraphQL errors.
async function sleeperGql(query, variables) {
  const upstream = await fetch(SLEEPER_GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await upstream.json().catch(() => ({}));
  if (json.errors?.length) {
    const e = json.errors[0];
    const err = new Error(e.message || "Sleeper request failed");
    err.code = e.code || null;
    // Captcha rejection / unknown user → client error; everything else 502.
    err.status = e.code === "verification_code_captcha_required" ? 400 : 422;
    throw err;
  }
  return json.data || {};
}

// Lazily build a service-role Supabase client (server-side only). Returns null
// when env isn't configured so the rate limiter can degrade gracefully; the
// verify step, which truly needs it, checks explicitly.
function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Best-effort client IP from the proxy headers Vercel sets.
function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

// Count one attempt against a bucket; throws 429 if the caller is over-limit or
// locked out. Fails open (logs) on infra errors so a missing migration or a DB
// blip can't take auth down.
async function consumeRateLimit(admin, bucket, cfg) {
  if (!admin) return; // env not configured — limiter disabled
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_bucket: bucket,
    p_limit: cfg.limit,
    p_window_seconds: cfg.windowSec,
    p_lock_seconds: cfg.lockSec,
  });
  if (error) {
    console.warn("[sleeper-auth] rate-limit check skipped:", error.message);
    return;
  }
  if (data && data.allowed === false) {
    const mins = Math.ceil((data.retry_after || cfg.lockSec) / 60);
    const err = new Error(
      `Too many attempts. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`,
    );
    err.status = 429;
    throw err;
  }
}

async function resetRateLimit(admin, bucket) {
  if (!admin) return;
  await admin.rpc("reset_rate_limit", { p_bucket: bucket }).catch(() => {});
}

// Step 1 — ask Sleeper to send the one-time code.
async function requestCode(admin, ip, { email, captcha }) {
  if (!email) {
    const err = new Error("email is required"); err.status = 400; throw err;
  }
  if (!captcha) {
    const err = new Error("captcha token is required"); err.status = 400; throw err;
  }

  // Throttle the targeted email first (protects a victim's inbox), then the IP.
  await consumeRateLimit(admin, `rc:email:${email}`, LIMITS.requestCodeEmail);
  await consumeRateLimit(admin, `rc:ip:${ip}`, LIMITS.requestCodeIp);

  const query = `
    mutation send($email: String, $captcha: String) {
      create_verification_code(email_or_phone: $email, captcha: $captcha)
    }`;
  await sleeperGql(query, { email, captcha });
  return { ok: true };
}

// Step 2 — verify the code, resolve the Sleeper account, mint a session token.
async function verifyCode(admin, ip, { email, code }) {
  if (!email || !code) {
    const err = new Error("email and code are required"); err.status = 400; throw err;
  }
  if (!admin) {
    const err = new Error("Supabase service-role env is not configured on the server");
    err.status = 500; throw err;
  }

  // Attempt-cap + lockout BEFORE hitting Sleeper, so a brute-forcer can't spray
  // codes. Counts this attempt; a wrong code leaves the count standing, a right
  // one clears it below.
  await consumeRateLimit(admin, `vc:email:${email}`, LIMITS.verifyEmail);
  await consumeRateLimit(admin, `vc:ip:${ip}`, LIMITS.verifyIp);

  // 2a. Verify by signing in with the code as the password — exactly what
  // Sleeper's app does. A non-null User both confirms the code and gives us the
  // account in one call.
  const loginQ = `
    mutation login($id: String, $pw: String) {
      login(email_or_phone_or_username: $id, password: $pw) {
        user_id username display_name avatar
      }
    }`;
  let sleeper;
  try {
    const data = await sleeperGql(loginQ, { id: email, pw: code });
    sleeper = data.login;
  } catch (e) {
    // Surface real outages (5xx) but treat Sleeper's rejection of a bad/expired
    // code as a clean 401.
    if (e.status && e.status >= 500) throw e;
    const err = new Error("Incorrect or expired code"); err.status = 401; throw err;
  }
  if (!sleeper?.user_id) {
    const err = new Error("Incorrect or expired code"); err.status = 401; throw err;
  }

  // Code was good → clear the failure counters for this email/IP.
  await resetRateLimit(admin, `vc:email:${email}`);
  await resetRateLimit(admin, `vc:ip:${ip}`);

  // 2b. Ensure a Supabase user exists for this email and mirror Sleeper info.
  const metadata = {
    sleeper_user_id: sleeper.user_id,
    sleeper_username: sleeper.username || null,
    display_name: sleeper.display_name || null,
    avatar: sleeper.avatar || null,
  };

  // createUser is idempotent enough for us: ignore "already registered".
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (created.error && !/already.*regist|exists/i.test(created.error.message)) {
    const err = new Error(created.error.message); err.status = 500; throw err;
  }

  // Generate a magic-link token the browser can exchange for a session.
  const linkRes = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkRes.error || !linkRes.data?.properties?.hashed_token) {
    const err = new Error(linkRes.error?.message || "Could not mint a session");
    err.status = 500; throw err;
  }

  // Best-effort: keep Sleeper metadata fresh on returning users.
  const userId = linkRes.data.user?.id;
  if (userId) {
    await admin.auth.admin.updateUserById(userId, { user_metadata: metadata }).catch(() => {});
  }

  return {
    token_hash: linkRes.data.properties.hashed_token,
    email,
    sleeper,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  // Normalize the email/contact the user typed.
  const email = (body.email || "").trim().toLowerCase();
  const ip = clientIp(req);
  const admin = adminClient();

  try {
    let data;
    if (body.action === "request-code") {
      data = await requestCode(admin, ip, { email, captcha: body.captcha });
    } else if (body.action === "verify-code") {
      data = await verifyCode(admin, ip, { email, code: (body.code || "").trim() });
    } else {
      return res.status(400).json({ error: `unknown action: ${body.action}` });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.message || "Sleeper auth failed" });
  }
}
