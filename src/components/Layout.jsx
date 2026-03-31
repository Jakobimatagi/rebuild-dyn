import { styles } from "../styles";

export default function Layout({ children }) {
  return (
    <div style={styles.app}>
      <div style={styles.grid} />
      <div style={styles.content}>{children}</div>
    </div>
  );
}
