import { useState } from "react";
import { styles } from "../styles";
import { useModalBehavior } from "../lib/useModalBehavior";
import PrivacyPolicy from "./Legal";

function PrivacyModal({ onClose }) {
  const modalRef = useModalBehavior(onClose);
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        ref={modalRef}
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Privacy policy"
      >
        <button style={closeStyle} onClick={onClose} aria-label="Close privacy policy">✕</button>
        <PrivacyPolicy onBack={onClose} />
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const [showPrivacy, setShowPrivacy] = useState(false);

  return (
    <div style={styles.app}>
      <div style={styles.grid} />
      <nav style={topBarStyle}>
        <a href="/admin/rookie-prospector" style={adminLinkStyle}>Admin · Rookies</a>
        <a href="/admin/oc-rankings" style={adminLinkStyle}>Admin · OCs</a>
      </nav>
      <div className="dyn-content" style={styles.content}>
        {children}
      </div>
      <footer style={footerStyle}>
        <a href="/rookie-rankings" style={linkStyle}>Rookie Rankings</a>
        <span style={{ color: "rgba(255,255,255,0.15)", margin: "0 10px" }}>·</span>
        <a
          href="https://buymeacoffee.com/batflockff"
          target="_blank"
          rel="noopener noreferrer"
          style={supportLinkStyle}
        >
          ♥ Support Hosting
        </a>
        <span style={{ color: "rgba(255,255,255,0.15)", margin: "0 10px" }}>·</span>
        <a
          href="#privacy"
          style={linkStyle}
          onClick={(e) => { e.preventDefault(); setShowPrivacy(true); }}
        >
          Privacy Policy
        </a>
        <span style={{ color: "rgba(255,255,255,0.15)", margin: "0 10px" }}>·</span>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>© {new Date().getFullYear()} Dynasty Advisor</span>
      </footer>

      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}

const topBarStyle = {
  position: "fixed",
  top: 12,
  right: 16,
  zIndex: 50,
  display: "flex",
  gap: 8,
};

const adminLinkStyle = {
  color: "rgba(0,245,160,0.85)",
  textDecoration: "none",
  letterSpacing: 1,
  textTransform: "uppercase",
  fontSize: 10,
  fontWeight: 600,
  padding: "6px 10px",
  border: "1px solid rgba(0,245,160,0.35)",
  borderRadius: 6,
  background: "rgba(8,12,20,0.7)",
  backdropFilter: "blur(6px)",
};

const footerStyle = {
  position: "relative",
  zIndex: 1,
  textAlign: "center",
  padding: "16px 24px 24px",
  fontSize: 11,
  letterSpacing: 1,
};

const linkStyle = {
  color: "rgba(0,245,160,0.5)",
  textDecoration: "none",
  letterSpacing: 1,
  textTransform: "uppercase",
  fontSize: 10,
};

const supportLinkStyle = {
  ...linkStyle,
  color: "rgba(0,245,160,0.85)",
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const modalStyle = {
  background: "#141722",
  border: "1px solid rgba(0,245,160,0.15)",
  borderRadius: 6,
  maxWidth: 720,
  width: "100%",
  maxHeight: "85vh",
  overflowY: "auto",
  padding: "40px 40px 32px",
  position: "relative",
};

const closeStyle = {
  position: "absolute",
  top: 16,
  right: 16,
  background: "transparent",
  border: "none",
  color: "rgba(255,255,255,0.4)",
  fontSize: 16,
  cursor: "pointer",
  lineHeight: 1,
};
