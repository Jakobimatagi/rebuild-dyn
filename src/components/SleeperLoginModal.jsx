import { useModalBehavior } from "../lib/useModalBehavior.js";
import SleeperConnect from "./SleeperConnect.jsx";

// Standalone "Sign in with Sleeper" modal — a thin overlay around the reusable
// SleeperConnect form. The full create-account flow lives in AuthModal, which
// reuses the same SleeperConnect form as its second step.
//
// onSuccess(sleeperProfile) fires once the Supabase session is established.
export default function SleeperLoginModal({ onClose, onSuccess }) {
  const ref = useModalBehavior(onClose);

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
        aria-label="Sign in with Sleeper"
        style={{
          width: "100%", maxWidth: 420,
          background: "#141722",
          border: "1px solid rgba(0,245,160,0.2)",
          borderRadius: 8, padding: "28px 26px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ fontSize: 10, letterSpacing: 5, color: "#00f5a0", textTransform: "uppercase", opacity: 0.7, marginBottom: 8 }}>
          Sleeper Verification
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>
          Sign in with Sleeper
        </h2>
        <SleeperConnect onSuccess={onSuccess} />
      </div>
    </div>
  );
}
