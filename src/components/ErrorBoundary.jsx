import { Component } from "react";
import Layout from "./Layout";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Dynasty OS uncaught error:", error, info.componentStack);
  }

  handleReset() {
    localStorage.removeItem("sleeper_league");
    localStorage.removeItem("ff_league");
    window.location.reload();
  }

  render() {
    if (this.state.error) {
      return (
        <Layout>
          <div style={{ textAlign: "center", paddingTop: 100, maxWidth: 480, margin: "0 auto" }}>
            <div style={{ fontSize: 11, letterSpacing: 3, color: "#ff6b35", marginBottom: 16, textTransform: "uppercase" }}>
              Something went wrong
            </div>
            <p style={{ color: "#9aa0b8", fontSize: 12, lineHeight: 1.8, marginBottom: 8 }}>
              An unexpected error occurred while rendering your dashboard.
            </p>
            <p style={{ color: "#6b7390", fontSize: 11, lineHeight: 1.7, marginBottom: 32, fontFamily: "monospace" }}>
              {this.state.error?.message}
            </p>
            <button
              className="dyn-btn"
              style={{
                background: "#00f5a0",
                color: "#141722",
                border: "none",
                padding: "10px 24px",
                fontSize: 11,
                letterSpacing: 1.5,
                fontWeight: 700,
                textTransform: "uppercase",
                borderRadius: 4,
                cursor: "pointer",
              }}
              onClick={this.handleReset}
            >
              Reset & Reload
            </button>
          </div>
        </Layout>
      );
    }

    return this.props.children;
  }
}
