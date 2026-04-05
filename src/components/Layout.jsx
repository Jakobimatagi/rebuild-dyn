import { styles } from "../styles";

export default function Layout({ children }) {
  return (
    <div style={styles.app}>
      <div style={styles.grid} />
      <div className="dyn-content" style={styles.content}>
        {children}
      </div>
      <footer style={footerStyle}>
        <a href="#privacy" style={linkStyle}>Privacy Policy</a>
        <span style={{ color: "rgba(255,255,255,0.15)", margin: "0 10px" }}>·</span>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>© {new Date().getFullYear()} Dynasty Advisor</span>
      </footer>
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
