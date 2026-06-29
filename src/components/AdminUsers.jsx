import { useEffect, useState } from "react";
import {
  adminSignIn,
  restoreAdmin,
  signOutAccount,
  listAdmins,
  inviteAdmin,
  revokeAdmin,
} from "../lib/supabase.js";

// Admin management page (/admin/users): invite new admins by email, see who's
// an admin, and revoke access. Admin = app_metadata.is_admin, flipped only by
// the service-role api/admin-users endpoint.
export default function AdminUsers() {
  const [initLoading, setInitLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [user, setUser] = useState(null);

  const [emailInput, setEmailInput] = useState("");
  const [passInput, setPassInput] = useState("");
  const [gateError, setGateError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  const [admins, setAdmins] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState(null); // id in flight

  useEffect(() => {
    let cancelled = false;
    restoreAdmin()
      .then((u) => { if (!cancelled && u) { setUser(u); setUnlocked(true); } })
      .finally(() => { if (!cancelled) setInitLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function loadAdmins() {
    setListLoading(true); setListError("");
    try {
      setAdmins(await listAdmins());
    } catch (err) {
      setListError(err.message || "Couldn't load admins.");
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => { if (unlocked) loadAdmins(); }, [unlocked]);

  async function handleUnlock(e) {
    e.preventDefault();
    if (!emailInput.trim()) { setGateError("Enter your email."); return; }
    setSigningIn(true); setGateError("");
    try {
      const u = await adminSignIn(emailInput.trim(), passInput);
      setUser(u);
      setUnlocked(true);
    } catch (err) {
      setGateError(err.message || "Couldn't sign in. Check your email and password.");
    } finally {
      setSigningIn(false);
    }
  }

  async function handleInvite(e) {
    e.preventDefault();
    setNotice(""); setError("");
    const email = inviteEmail.trim();
    if (!email) { setError("Enter an email to invite."); return; }
    setInviting(true);
    try {
      const res = await inviteAdmin(email);
      setNotice(res.message || "Invite sent.");
      setInviteEmail("");
      await loadAdmins();
    } catch (err) {
      setError(err.message || "Couldn't send the invite.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRevoke(target) {
    setNotice(""); setError("");
    if (!window.confirm(`Remove admin access for ${target.email}?`)) return;
    setRevoking(target.id);
    try {
      await revokeAdmin(target.id);
      setNotice(`Removed admin access for ${target.email}.`);
      await loadAdmins();
    } catch (err) {
      setError(err.message || "Couldn't revoke access.");
    } finally {
      setRevoking(null);
    }
  }

  async function handleLogout() {
    await signOutAccount().catch(() => {});
    setUnlocked(false); setUser(null); setEmailInput(""); setPassInput(""); setAdmins([]);
  }

  if (initLoading) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-6">
        <form onSubmit={handleUnlock} className="w-full max-w-sm bg-slate-900/80 border border-white/10 rounded-2xl p-8">
          <div className="text-emerald-400 text-xs uppercase tracking-widest mb-2">Admin · Manage Admins</div>
          <h1 className="text-slate-100 text-2xl font-bold mb-6">Sign In</h1>
          <input type="email" autoFocus autoComplete="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)}
            className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-3 text-slate-100 focus:border-emerald-400 outline-none mb-3" placeholder="Email" />
          <input type="password" autoComplete="current-password" value={passInput} onChange={(e) => setPassInput(e.target.value)}
            className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-3 text-slate-100 focus:border-emerald-400 outline-none" placeholder="Password" />
          {gateError && <div className="text-rose-400 text-sm mt-3">{gateError}</div>}
          <button type="submit" disabled={signingIn}
            className="mt-6 w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-emerald-950 font-semibold py-3 rounded-lg">
            {signingIn ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="border-b border-white/10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-emerald-400 uppercase tracking-widest mr-2">Admin</span>
            <a href="/admin/rookie-prospector" className="font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 px-3 py-1.5 rounded-md">Rookies</a>
            <a href="/admin/oc-rankings" className="font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 px-3 py-1.5 rounded-md">OC Rankings</a>
            <a href="/admin/top-players" className="font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 px-3 py-1.5 rounded-md">Top Players</a>
            <a href="/admin/hot-streaks" className="font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 px-3 py-1.5 rounded-md">Hot &amp; Cold</a>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-md">
                {user.username} <span className="text-slate-600">·</span> <span className="text-slate-500">{user.role}</span>
              </span>
            )}
            <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-slate-100 border border-white/10 px-3 py-1.5 rounded-md">Logout</button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-1">Manage Admins</h1>
        <p className="text-slate-400 text-sm mb-8">Invite people by email — they'll get a link to set a password and accept admin access.</p>

        {notice && <div className="mb-4 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3">{notice}</div>}
        {error && <div className="mb-4 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-3">{error}</div>}

        {/* Invite */}
        <form onSubmit={handleInvite} className="flex gap-3 mb-10 flex-wrap">
          <input
            type="email" autoComplete="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="new-admin@email.com"
            className="flex-1 min-w-[220px] bg-slate-900 border border-white/10 rounded-lg px-4 py-3 text-slate-100 focus:border-emerald-400 outline-none"
          />
          <button type="submit" disabled={inviting}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-emerald-950 font-semibold px-6 py-3 rounded-lg whitespace-nowrap">
            {inviting ? "Sending…" : "Send invite"}
          </button>
        </form>

        {/* Admin list */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Current admins</h2>
          <button onClick={loadAdmins} className="text-xs text-slate-400 hover:text-slate-100">Refresh</button>
        </div>
        {listError && <div className="text-sm text-rose-400 mb-3">{listError}</div>}
        {listLoading ? (
          <div className="text-slate-500 text-sm py-6">Loading admins…</div>
        ) : admins.length === 0 ? (
          <div className="text-slate-500 text-sm py-6">No admins found.</div>
        ) : (
          <div className="border border-white/10 rounded-lg overflow-hidden">
            {admins.map((a, i) => (
              <div key={a.id} className={`flex items-center justify-between gap-4 px-4 py-3 ${i > 0 ? "border-t border-white/5" : ""}`}>
                <div className="min-w-0">
                  <div className="text-slate-100 text-sm truncate">{a.email}</div>
                  <div className="text-slate-500 text-xs truncate">
                    {a.display_name ? `${a.display_name} · ` : ""}
                    {a.last_sign_in_at ? `last seen ${new Date(a.last_sign_in_at).toLocaleDateString()}` : "never signed in"}
                  </div>
                </div>
                {a.id === user?.id ? (
                  <span className="text-xs text-slate-500 whitespace-nowrap">you</span>
                ) : (
                  <button
                    onClick={() => handleRevoke(a)}
                    disabled={revoking === a.id}
                    className="text-xs text-rose-300 hover:text-rose-200 border border-rose-500/30 hover:border-rose-500/50 px-3 py-1.5 rounded-md disabled:opacity-50 whitespace-nowrap"
                  >
                    {revoking === a.id ? "Removing…" : "Revoke"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
