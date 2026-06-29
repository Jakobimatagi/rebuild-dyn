import { useEffect, useState } from "react";
import { useModalBehavior } from "../lib/useModalBehavior.js";
import { inputStyle, btnStyle, linkBtnStyle } from "./SleeperConnect.jsx";
import {
  signUpEmail,
  signInEmail,
  getAccount,
  getAal,
  listTotpFactors,
  challengeTotp,
  enrollTotp,
  verifyEnrollTotp,
  unenrollFactor,
  requestPasswordReset,
  updatePassword,
  setSleeperUsername,
} from "../lib/supabase.js";

// Email + password account modal with optional TOTP two-factor.
//
// Stages:
//   signin  — email + password. If the account has 2FA, steps to `mfa`.
//   signup  — create an account. If email confirmation is on, shows a notice.
//   mfa     — login-time TOTP challenge (step AAL1 → AAL2).
//   enroll  — turn on 2FA: scan QR / enter secret, then verify a code.
//   forgot  — request a password-reset email.
//   reset   — set a new password (reached via the reset email's recovery link).
//   linkSleeper — signed-in user with no linked Sleeper username sets one so
//                 the app can load their teams.
//
// `initialStage` lets the account bar open it straight to "enroll" / "reset" /
// "linkSleeper".
// onSuccess(user) fires once the user is fully authenticated (AAL2 when MFA is
// on), or once enrollment completes when opened in "enroll".
// onSleeperLinked(username) fires when the linkSleeper stage saves a username.
export default function AuthModal({ onClose, onSuccess, onSleeperLinked, initialStage = "signin" }) {
  const ref = useModalBehavior(onClose);

  const [stage, setStage] = useState(initialStage);
  const [sleeper, setSleeper] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState(null);
  const [enrollData, setEnrollData] = useState(null); // { qr, secret, uri }
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function goTo(next) {
    setError("");
    setNotice("");
    setCode("");
    setPassword("");
    setConfirm("");
    setStage(next);
  }

  // Kick off TOTP enrollment whenever we enter the enroll stage.
  useEffect(() => {
    if (stage !== "enroll" || enrollData) return;
    let cancelled = false;
    setLoading(true);
    enrollTotp()
      .then((d) => {
        if (cancelled) return;
        setFactorId(d.factorId);
        setEnrollData({ qr: d.qr, secret: d.secret, uri: d.uri });
      })
      .catch((err) => !cancelled && setError(err.message || "Couldn't start 2FA setup."))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [stage, enrollData]);

  // After a password sign-in, route to the 2FA challenge if one is required.
  async function resolvePostSignIn(user) {
    const aal = await getAal();
    if (aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const factors = await listTotpFactors();
      const verified = factors.find((f) => f.status === "verified");
      if (verified) {
        setFactorId(verified.id);
        goTo("mfa");
        return;
      }
    }
    onSuccess?.(user);
  }

  async function handleSignIn(e) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setLoading(true);
    try {
      const user = await signInEmail(email.trim(), password);
      await resolvePostSignIn(user);
    } catch (err) {
      setError(err.message || "Couldn't sign in. Check your email and password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setError("");
    if (!email.trim()) return setError("Enter your email.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setLoading(true);
    try {
      const { user, session } = await signUpEmail(email.trim(), password);
      if (session) {
        onSuccess?.(user); // confirmation off — signed in immediately
      } else {
        goTo("signin");
        setNotice("Check your email to confirm your account, then sign in.");
      }
    } catch (err) {
      setError(err.message || "Couldn't create the account.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e) {
    e.preventDefault();
    setError("");
    if (!email.trim()) return setError("Enter your email.");
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      goTo("signin");
      setNotice("Check your email for a link to reset your password.");
    } catch (err) {
      setError(err.message || "Couldn't send the reset email.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setLoading(true);
    try {
      await updatePassword(password);
      onSuccess?.(await getAccount());
    } catch (err) {
      setError(err.message || "Couldn't update the password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLinkSleeper(e) {
    e.preventDefault();
    setError("");
    const name = sleeper.trim();
    if (!name) return setError("Enter your Sleeper username.");
    setLoading(true);
    try {
      await setSleeperUsername(name);
      onSleeperLinked?.(name);
    } catch (err) {
      setError(err.message || "Couldn't save your Sleeper username.");
    } finally {
      setLoading(false);
    }
  }

  async function handleChallenge(e) {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code.");
    setLoading(true);
    try {
      await challengeTotp(factorId, code);
      onSuccess?.(await getAccount());
    } catch (err) {
      setError(err.message || "Invalid code. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnrollVerify(e) {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code.");
    setLoading(true);
    try {
      await verifyEnrollTotp(factorId, code);
      onSuccess?.(null);
    } catch (err) {
      setError(err.message || "Invalid code. Try again.");
    } finally {
      setLoading(false);
    }
  }

  // Abandon a half-finished enrollment so it doesn't linger as an unverified
  // factor that would block future sign-ins.
  async function cancelEnroll() {
    if (factorId) { try { await unenrollFactor(factorId); } catch { /* ignore */ } }
    onClose?.();
  }

  const heading = {
    signin: "Sign in",
    signup: "Create account",
    mfa: "Two-factor verification",
    enroll: "Set up two-factor",
    forgot: "Reset password",
    reset: "Choose a new password",
    linkSleeper: "Link your Sleeper",
  }[stage];

  return (
    <div
      style={overlayStyle}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-label={heading} style={cardStyle}>
        <div style={eyebrowStyle}>{heading}</div>

        {notice && <div style={noticeStyle}>{notice}</div>}
        {error && <div style={errorStyle}>{error}</div>}

        {stage === "signin" && (
          <form onSubmit={handleSignIn}>
            <input
              style={{ ...inputStyle, marginBottom: 12 }}
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              style={inputStyle}
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit" style={btnStyle(loading)} disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <div style={{ marginTop: 16, textAlign: "center", display: "flex", flexDirection: "column", gap: 10 }}>
              <button type="button" style={linkBtnStyle} onClick={() => goTo("signup")}>
                New here? Create an account →
              </button>
              <button type="button" style={linkBtnStyle} onClick={() => goTo("forgot")}>
                Forgot your password?
              </button>
            </div>
          </form>
        )}

        {stage === "signup" && (
          <form onSubmit={handleSignUp}>
            <input
              style={{ ...inputStyle, marginBottom: 12 }}
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              style={{ ...inputStyle, marginBottom: 12 }}
              type="password"
              autoComplete="new-password"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              style={inputStyle}
              type="password"
              autoComplete="new-password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <button type="submit" style={btnStyle(loading)} disabled={loading}>
              {loading ? "Creating…" : "Create account"}
            </button>
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button type="button" style={linkBtnStyle} onClick={() => goTo("signin")}>
                Already have an account? Sign in →
              </button>
            </div>
          </form>
        )}

        {stage === "linkSleeper" && (
          <form onSubmit={handleLinkSleeper}>
            <p style={bodyStyle}>
              Enter your Sleeper username so we can load your dynasty teams. You
              can change this later.
            </p>
            <input
              style={inputStyle}
              autoComplete="username"
              placeholder="Sleeper username"
              value={sleeper}
              onChange={(e) => setSleeper(e.target.value)}
            />
            <button type="submit" style={btnStyle(loading)} disabled={loading}>
              {loading ? "Loading your teams…" : "View my teams →"}
            </button>
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button type="button" style={linkBtnStyle} onClick={() => onClose?.()}>
                Maybe later
              </button>
            </div>
          </form>
        )}

        {stage === "forgot" && (
          <form onSubmit={handleForgot}>
            <p style={bodyStyle}>
              Enter your account email and we'll send you a link to reset your
              password.
            </p>
            <input
              style={inputStyle}
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" style={btnStyle(loading)} disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button type="button" style={linkBtnStyle} onClick={() => goTo("signin")}>
                ← Back to sign in
              </button>
            </div>
          </form>
        )}

        {stage === "reset" && (
          <form onSubmit={handleReset}>
            <p style={bodyStyle}>Enter a new password for your account.</p>
            <input
              style={{ ...inputStyle, marginBottom: 12 }}
              type="password"
              autoComplete="new-password"
              placeholder="New password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              style={inputStyle}
              type="password"
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <button type="submit" style={btnStyle(loading)} disabled={loading}>
              {loading ? "Updating…" : "Update password"}
            </button>
          </form>
        )}

        {stage === "mfa" && (
          <form onSubmit={handleChallenge}>
            <p style={bodyStyle}>
              Enter the 6-digit code from your authenticator app.
            </p>
            <input
              style={codeInputStyle}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <button type="submit" style={btnStyle(loading)} disabled={loading}>
              {loading ? "Verifying…" : "Verify"}
            </button>
          </form>
        )}

        {stage === "enroll" && (
          <form onSubmit={handleEnrollVerify}>
            <p style={bodyStyle}>
              Scan this QR code with an authenticator app (Google Authenticator,
              Authy, 1Password…), then enter the 6-digit code it shows.
            </p>
            {enrollData?.qr && (
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <img
                  src={enrollData.qr}
                  alt="Two-factor QR code"
                  width={180}
                  height={180}
                  style={{ background: "#fff", borderRadius: 6, padding: 8 }}
                />
              </div>
            )}
            {enrollData?.secret && (
              <div style={secretStyle}>
                Can't scan? Enter this key manually:
                <br />
                <code style={{ color: "#00f5a0", letterSpacing: 1 }}>{enrollData.secret}</code>
              </div>
            )}
            <input
              style={codeInputStyle}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <button type="submit" style={btnStyle(loading)} disabled={loading || !enrollData}>
              {loading ? "Verifying…" : "Turn on 2FA"}
            </button>
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button type="button" style={linkBtnStyle} onClick={cancelEnroll}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed", inset: 0, zIndex: 1000,
  background: "rgba(8,10,16,0.78)", backdropFilter: "blur(4px)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
};

const cardStyle = {
  width: "100%", maxWidth: 420,
  background: "#141722",
  border: "1px solid rgba(0,245,160,0.2)",
  borderRadius: 8, padding: "28px 26px",
  boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
};

const eyebrowStyle = {
  fontSize: 10, letterSpacing: 5, color: "#00f5a0",
  textTransform: "uppercase", opacity: 0.7, marginBottom: 18,
};

const bodyStyle = { fontSize: 13, color: "#9aa0b8", lineHeight: 1.6, marginBottom: 16, marginTop: 0 };

const noticeStyle = {
  fontSize: 12, color: "#00f5a0", background: "rgba(0,245,160,0.08)",
  border: "1px solid rgba(0,245,160,0.2)", borderRadius: 4,
  padding: "10px 12px", marginBottom: 14, lineHeight: 1.5,
};

const errorStyle = {
  fontSize: 12, color: "#ff6b35", background: "rgba(255,107,53,0.08)",
  border: "1px solid rgba(255,107,53,0.25)", borderRadius: 4,
  padding: "10px 12px", marginBottom: 14, lineHeight: 1.5,
};

const codeInputStyle = {
  ...inputStyle,
  textAlign: "center",
  fontSize: 24,
  letterSpacing: 8,
  fontFamily: "monospace",
};

const secretStyle = {
  fontSize: 11, color: "#9aa0b8", lineHeight: 1.7,
  background: "rgba(0,245,160,0.04)", border: "1px solid rgba(0,245,160,0.12)",
  borderRadius: 4, padding: "10px 12px", marginBottom: 14, wordBreak: "break-all",
};
