import Layout from "./Layout";

export default function LoadingScreen({ message = "Loading your league…" }) {
  return (
    <Layout>
      <div style={{ textAlign: "center", paddingTop: 120 }}>
        <div style={{ marginBottom: 20 }}>
          <span
            className="dyn-spinner"
            style={{ width: 22, height: 22, border: "2.5px solid rgba(0,245,160,0.2)", borderTopColor: "#00f5a0" }}
          />
        </div>
        <div style={{ color: "#6b7390", fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase" }}>
          {message}
        </div>
      </div>
    </Layout>
  );
}
