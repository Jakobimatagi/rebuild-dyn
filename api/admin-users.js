// ── Admin user management ────────────────────────────────────────────────────
// Lets an existing admin invite new admins, list current admins, and revoke
// admin access. "Admin" is the flag `app_metadata.is_admin = true` on a Supabase
// Auth user — set only here (server-side, service role), so it can never be
// self-granted from the browser.
//
// Every action requires the CALLER to prove they're an admin: the client sends
// its Supabase access token as a Bearer header, which we verify and check for
// is_admin before doing anything privileged.
//
//   list   → { admins: [{ id, email, display_name, last_sign_in_at, created_at }] }
//   invite → { email }  emails an invite (new user) or just promotes an existing
//                       one, then sets is_admin=true. Returns { invited, email }.
//   revoke → { userId } sets is_admin=false (can't revoke yourself).
//
// Required server env (Vercel): SUPABASE_URL (or VITE_SUPABASE_URL),
// SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Verify the request comes from a signed-in admin. Returns the caller's user.
async function requireAdmin(admin, req) {
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

// Page through all users (admins are few; users are bounded for this app).
async function listAllUsers(admin) {
  const users = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) { const e = new Error(error.message); e.status = 500; throw e; }
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < 1000) break;
  }
  return users;
}

async function listAdmins(admin) {
  const users = await listAllUsers(admin);
  const admins = users
    .filter((u) => u.app_metadata?.is_admin === true)
    .map((u) => ({
      id: u.id,
      email: u.email,
      display_name: u.user_metadata?.display_name || null,
      last_sign_in_at: u.last_sign_in_at || null,
      created_at: u.created_at,
    }))
    .sort((a, b) => (a.email || "").localeCompare(b.email || ""));
  return { admins };
}

async function inviteAdmin(admin, email) {
  if (!email) { const e = new Error("email is required"); e.status = 400; throw e; }

  // Already a user? Just promote them (no duplicate invite).
  const existing = (await listAllUsers(admin)).find(
    (u) => (u.email || "").toLowerCase() === email,
  );

  if (existing) {
    if (existing.app_metadata?.is_admin === true) {
      return { invited: false, email, message: "That user is already an admin." };
    }
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      app_metadata: { is_admin: true },
    });
    if (error) { const e = new Error(error.message); e.status = 500; throw e; }
    return { invited: false, email, message: "Existing user promoted to admin." };
  }

  // New user → send the Supabase invite email (they click it to set a password),
  // then flag them as admin.
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error) { const e = new Error(error.message); e.status = 400; throw e; }
  const newId = data?.user?.id;
  if (newId) {
    await admin.auth.admin
      .updateUserById(newId, { app_metadata: { is_admin: true } })
      .catch(() => {});
  }
  return { invited: true, email, message: "Invite sent." };
}

async function revokeAdmin(admin, caller, userId) {
  if (!userId) { const e = new Error("userId is required"); e.status = 400; throw e; }
  if (userId === caller.id) {
    const e = new Error("You can't remove your own admin access."); e.status = 400; throw e;
  }
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { is_admin: false },
  });
  if (error) { const e = new Error(error.message); e.status = 500; throw e; }
  return { revoked: true };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const admin = adminClient();
  if (!admin) {
    return res.status(500).json({ error: "Supabase service-role env is not configured on the server" });
  }

  try {
    const caller = await requireAdmin(admin, req);
    let data;
    if (body.action === "list") {
      data = await listAdmins(admin);
    } else if (body.action === "invite") {
      data = await inviteAdmin(admin, (body.email || "").trim().toLowerCase());
    } else if (body.action === "revoke") {
      data = await revokeAdmin(admin, caller, body.userId);
    } else {
      return res.status(400).json({ error: `unknown action: ${body.action}` });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "Admin request failed" });
  }
}
