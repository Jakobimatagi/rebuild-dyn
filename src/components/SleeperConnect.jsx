import { useEffect, useRef, useState } from "react";
import {
  requestSleeperCode,
  verifySleeperCode,
  SLEEPER_HCAPTCHA_SITEKEY,
} from "../lib/supabase.js";

// Reusable Sleeper-verified connect form (no modal chrome). The user proves they
// own a Sleeper account by entering the one-time code Sleeper sends to their
// contact, then we exchange it for a Supabase session (inside verifySleeperCode).
//
// Two internal steps:
//   email  — enter Sleeper email, solve hCaptcha, request a code
//   code   — enter the code, verify, sign in
//
// onSuccess(sleeperProfile) fires once the Supabase session is established.
// Wrapped by SleeperLoginModal, which adds the modal chrome.

const HCAPTCHA_SRC = "https://js.hcaptcha.com/1/api.js?render=explicit";

// Load the hCaptcha script once, resolving when window.hcaptcha is ready.
function loadHcaptcha() {
  if (window.hcaptcha) return Promise.resolve(window.hcaptcha);
  return new Promise((resolve, reject) => {
    let s = document.querySelector(`script[src="${HCAPTCHA_SRC}"]`);
    const onReady = () => {
      // hcaptcha attaches asynchronously even after load; poll briefly.
      const start = Date.now();
      (function wait() {
        if (window.hcaptcha) return resolve(window.hcaptcha);
        if (Date.now() - start > 5000) return reject(new Error("hCaptcha failed to load"));
        setTimeout(wait, 50);
      })();
    };
    if (s) { s.addEventListener("load", onReady); onReady(); return; }
    s = document.createElement("script");
    s.src = HCAPTCHA_SRC;
    s.async = true;
    s.defer = true;
    s.addEventListener("load", onReady);
    s.addEventListener("error", () => reject(new Error("hCaptcha failed to load")));
    document.head.appendChild(s);
  });
}

export default function SleeperConnect({ onSuccess }) {
  const captchaRef = useRef(null);
  const widgetId = useRef(null);

  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Render the hCaptcha widget while on the email step.
  useEffect(() => {
    if (step !== "email") return;
    let cancelled = false;
    loadHcaptcha()
      .then((hcaptcha) => {
        if (cancelled || !captchaRef.current || widgetId.current != null) return;
        widgetId.current = hcaptcha.render(captchaRef.current, {
          sitekey: SLEEPER_HCAPTCHA_SITEKEY,
          theme: "dark",
          callback: (token) => setCaptchaToken(token),
          "expired-callback": () => setCaptchaToken(""),
          "error-callback": () => setCaptchaToken(""),
        });
      })
      .catch(() => setError("Couldn't load the captcha. Refresh and try again."));
    return () => { cancelled = true; };
  }, [step]);

  const resetCaptcha = () => {
    setCaptchaToken("");
    try { window.hcaptcha?.reset(widgetId.current ?? undefined); } catch { /* noop */ }
  };

  async function handleSendCode(e) {
    e.preventDefault();
    setError("");
    if (!email.trim()) return setError("Enter the email on your Sleeper account.");
    if (!captchaToken) return setError("Complete the captcha first.");
    setLoading(true);
    try {
      await requestSleeperCode(email.trim(), captchaToken);
      setStep("code");
    } catch (err) {
      setError(err.message || "Couldn't send a code.");
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError("");
    if (!code.trim()) return setError("Enter the code Sleeper sent you.");
    setLoading(true);
    try {
      const sleeper = await verifySleeperCode(email.trim(), code.trim());
      onSuccess?.(sleeper);
    } catch (err) {
      setError(err.message || "Couldn't verify that code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "#aab", marginTop: 8, lineHeight: 1.5 }}>
        {step === "email"
          ? "Enter the email on your Sleeper account. We'll send a one-time code to confirm it's you."
          : `We sent a code to the contact on ${email}. Enter it below.`}
      </p>

      {error && (
        <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 5, background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)", color: "#ff9b9b", fontSize: 13 }}>
          {error}
        </div>
      )}

      {step === "email" ? (
        <form onSubmit={handleSendCode} style={{ marginTop: 18 }}>
          <input
            type="email"
            autoComplete="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
          <div ref={captchaRef} style={{ marginTop: 14, minHeight: 78 }} />
          <button type="submit" disabled={loading} style={btnStyle(loading)}>
            {loading ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} style={{ marginTop: 18 }}>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{ ...inputStyle, letterSpacing: 4, textAlign: "center", fontSize: 20 }}
          />
          <button type="submit" disabled={loading} style={btnStyle(loading)}>
            {loading ? "Verifying…" : "Verify & connect"}
          </button>
          <button
            type="button"
            onClick={() => { setStep("email"); setCode(""); setError(""); resetCaptcha(); }}
            style={{ ...linkBtnStyle, marginTop: 12 }}
          >
            ← Use a different email
          </button>
        </form>
      )}
    </div>
  );
}

export const inputStyle = {
  background: "rgba(0,245,160,0.04)",
  border: "1px solid rgba(0,245,160,0.18)",
  color: "#e8e8f0",
  padding: "13px 16px",
  fontSize: 15,
  width: "100%",
  borderRadius: 4,
  boxSizing: "border-box",
  outline: "none",
};

export const btnStyle = (loading) => ({
  marginTop: 16,
  width: "100%",
  padding: "13px 16px",
  fontSize: 15,
  fontWeight: 600,
  color: "#0b0e14",
  background: loading ? "rgba(0,245,160,0.5)" : "#00f5a0",
  border: "none",
  borderRadius: 4,
  cursor: loading ? "default" : "pointer",
});

export const linkBtnStyle = {
  width: "100%",
  padding: 0,
  background: "none",
  border: "none",
  color: "#7fdcc0",
  fontSize: 13,
  cursor: "pointer",
};
