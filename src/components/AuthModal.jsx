import { useState } from "react";
import { useModalBehavior } from "../lib/useModalBehavior.js";
import { signInWithEmail, setAccountPassword } from "../lib/supabase.js";
import SleeperConnect, { inputStyle, btnStyle, linkBtnStyle } from "./SleeperConnect.jsx";

// Sleeper-first account flow. Verifying your Sleeper account IS the auth: it
// signs you in and creates a single Supabase user keyed on your Sleeper email.
// A password is an optional convenience added *after* ownership is proven, so
// the email can never mismatch and there's no pre-registration squatting.
//
//   sleeper   — verify Sleeper (email → OTP). Mints the session.
//   password  — optional: set a password for faster future sign-in. Skippable.
//   signin    — returning users who set a password can sign in with it instead.
//
// onSuccess({ account, sleeper }) fires once the flow completes.
export default function AuthModal({ onClose, onSuccess }) {
  const ref = useModalBehavior(onClose);

  const [stage, setStage] = useState("sleeper"); // sleeper | password | signin
  const [sleeper, setSleeper] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function goTo(next) {
    setError("");
    setPassword("");
    setStage(next);
  }

  function handleSleeperSuccess(profile) {
    setSleeper(profile);
    goTo("password");
  }

  async function handleSetPassword(e) {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    setLoading(true);
    try {
      await setAccountPassword(password);
      onSuccess?.({ account: null, sleeper });
    } catch (err) {
      setError(err.message || "Couldn't set the password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn(e) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setLoading(true);
    try {
      const user = await signInWithEmail(email.trim(), password);
      const meta = user?.user_metadata || {};
      // The Sleeper profile was mirrored into user_metadata at verify time, so a
      // password sign-in can still drive league loading without another OTP.
      const profile = meta.sleeper_user_id
        ? {
            user_id: meta.sleeper_user_id,
            username: meta.sleeper_username,
            display_name: meta.display_name,
            avatar: meta.avatar,
          }
        : null;
      onSuccess?.({ account: user, sleeper: profile });
    } catch (err) {
      setError(err.message || "Couldn't sign in. Check your email and password.");
    } finally {
      setLoading(false);
    }
  }

  const showSteps = stage === "sleeper" || stage === "password";
  const heading = {
    sleeper: "Connect your Sleeper",
    password: "Add a password",
    signin: "Welcome back",
  }[stage];
  const eyebrow = {
    sleeper: "Step 1 · Verify",
    password: "Step 2 · Password (optional)",
    signin: "Sign in",
  }[stage];

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(8,10,16,0.78)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        style={{
          width: "100%", maxWidth: 420,
          background: "#141722",
          border: "1px solid rgba(0,245,160,0.2)",
          borderRadius: 8, padding: "28px 26px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}
      >
        {showSteps && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <span style={stepDotStyle(stage === "sleeper")} />
            <span style={stepDotStyle(stage === "password")} />
          </div>
        )}

        <div style={{ fontSize: 10, letterSpacing: 5, color: "#00f5a0", textTransform: "uppercase", opacity: 0.7, marginBottom: 8 }}>
          {eyebrow}
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>
          {heading}
        </h2>

        {/* Step 1 — Sleeper verification IS the sign-in. */}
        {stage === "sleeper" && (
          <>
            <SleeperConnect onSuccess={handleSleeperSuccess} />
            <button
              type="button"
              onClick={() => goTo("signin")}
              style={{ ...linkBtnStyle, marginTop: 18 }}
            >
              Already set a password? Sign in
            </button>
          </>
        )}

        {/* Step 2 — optional password on the now-authenticated account. */}
        {stage === "password" && (
          <>
            <p style={{ fontSize: 13, color: "#aab", marginTop: 8, lineHeight: 1.5 }}>
              You're signed in
              {sleeper?.display_name || sleeper?.username
                ? ` as ${sleeper.display_name || sleeper.username}`
                : ""}. Set a password to sign in faster next time, or skip — you
              can always verify with Sleeper again.
            </p>

            {error && (
              <div style={errorBoxStyle}>{error}</div>
            )}

            <form onSubmit={handleSetPassword} style={{ marginTop: 16 }}>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Choose a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
              <button type="submit" disabled={loading} style={btnStyle(loading)}>
                {loading ? "Saving…" : "Save & continue"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => onSuccess?.({ account: null, sleeper })}
              style={{ ...linkBtnStyle, marginTop: 14 }}
            >
              Skip for now →
            </button>
          </>
        )}

        {/* Returning users with a password. */}
        {stage === "signin" && (
          <>
            <p style={{ fontSize: 13, color: "#aab", marginTop: 8, lineHeight: 1.5 }}>
              Sign in with the email and password on your account.
            </p>

            {error && (
              <div style={errorBoxStyle}>{error}</div>
            )}

            <form onSubmit={handleSignIn} style={{ marginTop: 16 }}>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ ...inputStyle, marginTop: 12 }}
              />
              <button type="submit" disabled={loading} style={btnStyle(loading)}>
                {loading ? "Signing in…" : "Sign in →"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => goTo("sleeper")}
              style={{ ...linkBtnStyle, marginTop: 14 }}
            >
              ← Verify with Sleeper instead
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const errorBoxStyle = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 5,
  background: "rgba(255,80,80,0.1)",
  border: "1px solid rgba(255,80,80,0.3)",
  color: "#ff9b9b",
  fontSize: 13,
};

const stepDotStyle = (active) => ({
  flex: 1,
  height: 3,
  borderRadius: 2,
  background: active ? "#00f5a0" : "rgba(0,245,160,0.2)",
});
