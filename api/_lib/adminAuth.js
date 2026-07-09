// ── Shared admin auth for serverless functions ──────────────────────────────
// "Admin" is the flag `app_metadata.is_admin = true` on a Supabase Auth user —
// set only server-side (service role), so it can never be self-granted from
// the browser. Underscore-prefixed paths inside api/ are NOT deployed as
// functions by Vercel, so this file doesn't count against the function cap.
//
// Required server env (Vercel): SUPABASE_URL (or VITE_SUPABASE_URL),
// SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "@supabase/supabase-js";

export function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Verify the request comes from a signed-in admin. Returns the caller's user.
// Throws an Error with .status set (401/403) on failure.
export async function requireAdmin(admin, req) {
  const authz = req.headers.authorization || req.headers.Authorization || "";
  const token = String(authz).replace(/^Bearer\s+/i, "").trim();
  if (!token) { const e = new Error("Not authenticated"); e.status = 401; throw e; }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) { const e = new Error("Invalid session"); e.status = 401; throw e; }
  if (data.user.app_metadata?.is_admin !== true) {
    const e = new Error("Admin access required"); e.status = 403; throw e;
  }
  return data.user;
}

// One-call guard for handlers: builds the client, verifies the caller, and
// writes the error response itself. Returns the user, or null if a response
// was already sent (caller should just `return`).
export async function guardAdmin(req, res) {
  const admin = adminClient();
  if (!admin) {
    res.status(500).json({ error: "Supabase service-role env is not configured on the server" });
    return null;
  }
  try {
    return await requireAdmin(admin, req);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Auth check failed" });
    return null;
  }
}
