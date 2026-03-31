import { styles } from "../styles";

export default function Layout({ children }) {
  return (
    <div style={styles.app}>
      <div style={styles.grid} />
      <div className="dyn-content" style={styles.content}>
        {children}
      </div>
    </div>
  );
}
