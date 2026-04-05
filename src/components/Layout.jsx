import { useState } from "react";
import { styles } from "../styles";
import PrivacyPolicy from "./Legal";

export default function Layout({ children }) {
  const [showPrivacy, setShowPrivacy] = useState(false);

  return (
    <div style={styles.app}>
      <div style={styles.grid} />
      <div className="dyn-content" style={styles.content}>
        {children}
      </div>
      <footer style={footerStyle}>
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

      {showPrivacy && (
        <div style={overlayStyle} onClick={() => setShowPrivacy(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <button style={closeStyle} onClick={() => setShowPrivacy(false)}>✕</button>
            <PrivacyPolicy onBack={() => setShowPrivacy(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

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
