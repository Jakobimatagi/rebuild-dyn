// ── Sleeper-verified account login ───────────────────────────────────────────
// Proves a visitor owns a Sleeper account, then issues *our own* Supabase
// session keyed to that account. Sleeper's undocumented GraphQL endpoint does
// the identity proof via a one-time code:
//
//   1. request-code: create_verification_code(email_or_phone, captcha)
//        → Sleeper sends a one-time code to the account's contact. This step
//          REQUIRES an hCaptcha token generated against Sleeper's own sitekey
//          (3bb6d565-5eb0-425f-acf8-64374f8bbc7b) — see SleeperLoginModal.
//   2. verify-code: verify_verification_code(email_or_phone, code)
//        → true means the visitor controls that contact. We then resolve the
//          Sleeper user_id and mint a Supabase magic-link token; the browser
//          exchanges it for a real session via supabase.auth.verifyOtp.
//
// We never see the user's Sleeper password and never store the code. The only
// long-lived identity is the Supabase user, with the Sleeper profile mirrored
// into user_metadata so the rest of the app can load their leagues/rosters.
//
// Required server env (Vercel):
//   SUPABASE_URL                (falls back to VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY   (service role — server-only, never shipped)

import { createClient } from "@supabase/supabase-js";

const SLEEPER_GQL = "https://sleeper.com/graphql";

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

// Lazily build a service-role Supabase client (server-side only).
function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const err = new Error("Supabase service-role env is not configured on the server");
    err.status = 500;
    throw err;
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Step 1 — ask Sleeper to send the one-time code.
async function requestCode({ email, captcha }) {
  if (!email) {
    const err = new Error("email is required"); err.status = 400; throw err;
  }
  if (!captcha) {
    const err = new Error("captcha token is required"); err.status = 400; throw err;
  }
  const query = `
    mutation send($email: String, $captcha: String) {
      create_verification_code(email_or_phone: $email, captcha: $captcha)
    }`;
  await sleeperGql(query, { email, captcha });
  return { ok: true };
}

// Step 2 — verify the code, resolve the Sleeper account, mint a session token.
async function verifyCode({ email, code }) {
  if (!email || !code) {
    const err = new Error("email and code are required"); err.status = 400; throw err;
  }

  // 2a. Confirm the code. The mutation returns true or throws.
  const verifyQ = `
    mutation check($email: String, $code: String) {
      verify_verification_code(email_or_phone: $email, code: $code)
    }`;
  const vData = await sleeperGql(verifyQ, { email, code });
  if (vData.verify_verification_code !== true) {
    const err = new Error("Incorrect or expired code"); err.status = 401; throw err;
  }

  // 2b. Resolve the canonical Sleeper account (id is what we key everything on).
  const lookupQ = `
    query who($email: String) {
      user_by_email_phone_or_username(email_or_phone_or_username: $email) {
        user_id username display_name avatar
      }
    }`;
  const lData = await sleeperGql(lookupQ, { email });
  const sleeper = lData.user_by_email_phone_or_username;
  if (!sleeper?.user_id) {
    const err = new Error("Verified, but could not resolve the Sleeper account");
    err.status = 422; throw err;
  }

  // 2c. Ensure a Supabase user exists for this email and mirror Sleeper info.
  const admin = adminClient();
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

  try {
    let data;
    if (body.action === "request-code") {
      data = await requestCode({ email, captcha: body.captcha });
    } else if (body.action === "verify-code") {
      data = await verifyCode({ email, code: (body.code || "").trim() });
    } else {
      return res.status(400).json({ error: `unknown action: ${body.action}` });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.message || "Sleeper auth failed" });
  }
}
