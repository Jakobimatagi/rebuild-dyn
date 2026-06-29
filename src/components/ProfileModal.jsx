import { useEffect, useState } from "react";
import { useModalBehavior } from "../lib/useModalBehavior.js";
import { inputStyle, btnStyle, linkBtnStyle } from "./SleeperConnect.jsx";
import {
  getAccount,
  updateProfileInfo,
  updateEmail,
  updatePassword,
  hasMfaEnabled,
  listTotpFactors,
  enrollTotp,
  verifyEnrollTotp,
  unenrollFactor,
} from "../lib/supabase.js";

// Account / profile page for a signed-in user. Lets them edit their display
// name + Sleeper username, change their email and password, and manage TOTP
// two-factor. Opened as a modal; onClose dismisses it.
export default function ProfileModal({ onClose }) {
  const ref = useModalBehavior(onClose);

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [sleeperUsername, setSleeperUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [mfaOn, setMfaOn] = useState(false);
  const [enroll, setEnroll] = useState(null); // { factorId, qr, secret }
  const [mfaCode, setMfaCode] = useState("");

  const [busy, setBusy] = useState("");   // key of in-flight action
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const user = await getAccount();
    if (!user) { onClose?.(); return; }
    const meta = user.user_metadata || {};
    setEmail(user.email || "");
    setNewEmail(user.email || "");
    setDisplayName(meta.display_name || "");
    setSleeperUsername(meta.sleeper_username || "");
    setMfaOn(await hasMfaEnabled().catch(() => false));
  }

  useEffect(() => {
    let cancelled = false;
    refresh().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(msg) { setError(""); setNotice(msg); }
  function fail(err, fallback) { setNotice(""); setError(err?.message || fallback); }

  async function run(key, fn, okMsg) {
    setBusy(key); setError(""); setNotice("");
    try {
      await fn();
      if (okMsg) flash(okMsg);
    } catch (err) {
      fail(err, "Something went wrong. Try again.");
    } finally {
      setBusy("");
    }
  }

  function saveProfile(e) {
    e.preventDefault();
    run("profile",
      () => updateProfileInfo({ displayName: displayName.trim(), sleeperUsername: sleeperUsername.trim() }),
      "Profile updated.");
  }

  function saveEmail(e) {
    e.preventDefault();
    const next = newEmail.trim();
    if (!next) return setError("Enter an email.");
    if (next === email) return setError("That's already your email.");
    run("email", () => updateEmail(next),
      "Check your new email for a confirmation link to finish the change.");
  }

  function savePassword(e) {
    e.preventDefault();
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    run("password", async () => {
      await updatePassword(password);
      setPassword(""); setConfirm("");
    }, "Password updated.");
  }

  async function startEnroll() {
    setError(""); setNotice(""); setBusy("mfa-start");
    try {
      const d = await enrollTotp();
      setEnroll({ factorId: d.factorId, qr: d.qr, secret: d.secret });
      setMfaCode("");
    } catch (err) {
      fail(err, "Couldn't start 2FA setup.");
    } finally {
      setBusy("");
    }
  }

  function confirmEnroll(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(mfaCode.trim())) return setError("Enter the 6-digit code.");
    run("mfa-verify", async () => {
      await verifyEnrollTotp(enroll.factorId, mfaCode);
      setEnroll(null); setMfaCode("");
      await refresh();
    }, "Two-factor authentication is on.");
  }

  async function cancelEnroll() {
    if (enroll?.factorId) { try { await unenrollFactor(enroll.factorId); } catch { /* ignore */ } }
    setEnroll(null); setMfaCode("");
  }

  function disableMfa() {
    run("mfa-disable", async () => {
      const factors = await listTotpFactors();
      for (const f of factors) await unenrollFactor(f.id);
      await refresh();
    }, "Two-factor authentication is off.");
  }

  return (
    <div style={overlayStyle} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Account settings" style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={eyebrowStyle}>Account settings</div>
          <button type="button" onClick={onClose} aria-label="Close" style={closeStyle}>✕</button>
        </div>

        {loading ? (
          <div style={{ color: "#9aa0b8", fontSize: 13, padding: "20px 0" }}>Loading…</div>
        ) : (
          <>
            {notice && <div style={noticeStyle}>{notice}</div>}
            {error && <div style={errorStyle}>{error}</div>}

            {/* Profile */}
            <form onSubmit={saveProfile} style={sectionStyle}>
              <div style={sectionTitle}>Profile</div>
              <label style={labelStyle}>Display name</label>
              <input style={inputStyle} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" />
              <label style={{ ...labelStyle, marginTop: 12 }}>Sleeper username</label>
              <input style={inputStyle} value={sleeperUsername} onChange={(e) => setSleeperUsername(e.target.value)} placeholder="Sleeper username" />
              <button type="submit" style={btnStyle(busy === "profile")} disabled={busy === "profile"}>
                {busy === "profile" ? "Saving…" : "Save profile"}
              </button>
            </form>

            {/* Email */}
            <form onSubmit={saveEmail} style={sectionStyle}>
              <div style={sectionTitle}>Email</div>
              <input style={inputStyle} type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email" />
              <button type="submit" style={btnStyle(busy === "email")} disabled={busy === "email"}>
                {busy === "email" ? "Saving…" : "Update email"}
              </button>
            </form>

            {/* Password */}
            <form onSubmit={savePassword} style={sectionStyle}>
              <div style={sectionTitle}>Password</div>
              <input style={{ ...inputStyle, marginBottom: 12 }} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password (min 6 characters)" />
              <input style={inputStyle} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" />
              <button type="submit" style={btnStyle(busy === "password")} disabled={busy === "password"}>
                {busy === "password" ? "Updating…" : "Update password"}
              </button>
            </form>

            {/* Two-factor */}
            <div style={{ ...sectionStyle, borderBottom: "none" }}>
              <div style={sectionTitle}>Two-factor authentication</div>
              {mfaOn ? (
                <>
                  <div style={{ fontSize: 13, color: "#7fdcc0", marginBottom: 12 }}>🔒 Enabled — an authenticator code is required at sign-in.</div>
                  <button type="button" onClick={disableMfa} style={dangerBtn} disabled={busy === "mfa-disable"}>
                    {busy === "mfa-disable" ? "Disabling…" : "Disable 2FA"}
                  </button>
                </>
              ) : enroll ? (
                <form onSubmit={confirmEnroll}>
                  <p style={{ fontSize: 13, color: "#9aa0b8", lineHeight: 1.6, marginTop: 0 }}>
                    Scan this QR code with an authenticator app, then enter the 6-digit code.
                  </p>
                  {enroll.qr && (
                    <div style={{ textAlign: "center", marginBottom: 12 }}>
                      <img src={enroll.qr} alt="Two-factor QR code" width={170} height={170} style={{ background: "#fff", borderRadius: 6, padding: 8 }} />
                    </div>
                  )}
                  {enroll.secret && <div style={secretStyle}>Manual key: <code style={{ color: "#00f5a0" }}>{enroll.secret}</code></div>}
                  <input style={codeInputStyle} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))} />
                  <button type="submit" style={btnStyle(busy === "mfa-verify")} disabled={busy === "mfa-verify"}>
                    {busy === "mfa-verify" ? "Verifying…" : "Turn on 2FA"}
                  </button>
                  <div style={{ marginTop: 12, textAlign: "center" }}>
                    <button type="button" style={linkBtnStyle} onClick={cancelEnroll}>Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: "#9aa0b8", marginBottom: 12 }}>Add a second layer of security with an authenticator app.</div>
                  <button type="button" onClick={startEnroll} style={btnStyle(busy === "mfa-start")} disabled={busy === "mfa-start"}>
                    {busy === "mfa-start" ? "Starting…" : "Enable 2FA"}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed", inset: 0, zIndex: 1000,
  background: "rgba(8,10,16,0.78)", backdropFilter: "blur(4px)",
  display: "flex", alignItems: "flex-start", justifyContent: "center",
  padding: 20, overflowY: "auto",
};

const cardStyle = {
  width: "100%", maxWidth: 440, margin: "40px 0",
  background: "#141722",
  border: "1px solid rgba(0,245,160,0.2)",
  borderRadius: 8, padding: "24px 26px",
  boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
};

const eyebrowStyle = { fontSize: 10, letterSpacing: 5, color: "#00f5a0", textTransform: "uppercase", opacity: 0.7 };
const closeStyle = { background: "none", border: "none", color: "#9aa0b8", fontSize: 16, cursor: "pointer", lineHeight: 1, padding: 4 };

const sectionStyle = { padding: "18px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" };
const sectionTitle = { fontSize: 13, fontWeight: 700, color: "#e8e8f0", marginBottom: 12, letterSpacing: 0.3 };
const labelStyle = { display: "block", fontSize: 11, color: "#9aa0b8", marginBottom: 6, letterSpacing: 0.5 };

const noticeStyle = {
  fontSize: 12, color: "#00f5a0", background: "rgba(0,245,160,0.08)",
  border: "1px solid rgba(0,245,160,0.2)", borderRadius: 4, padding: "10px 12px", marginBottom: 8, lineHeight: 1.5,
};
const errorStyle = {
  fontSize: 12, color: "#ff6b35", background: "rgba(255,107,53,0.08)",
  border: "1px solid rgba(255,107,53,0.25)", borderRadius: 4, padding: "10px 12px", marginBottom: 8, lineHeight: 1.5,
};
const secretStyle = { fontSize: 11, color: "#9aa0b8", lineHeight: 1.6, marginBottom: 12, wordBreak: "break-all" };
const codeInputStyle = { ...inputStyle, textAlign: "center", fontSize: 22, letterSpacing: 8, fontFamily: "monospace" };
const dangerBtn = {
  marginTop: 4, width: "100%", padding: "13px 16px", fontSize: 15, fontWeight: 600,
  color: "#ff6b35", background: "transparent", border: "1px solid rgba(255,107,53,0.4)",
  borderRadius: 4, cursor: "pointer",
};
