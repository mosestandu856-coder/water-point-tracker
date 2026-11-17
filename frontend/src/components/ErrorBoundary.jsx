// frontend/src/components/ErrorBoundary.jsx
// React class component to catch runtime UI render errors and prevent white-screen crashes.

import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[UI Crash Caught by ErrorBoundary]:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="main-content" style={{ maxWidth: "600px", margin: "3rem auto" }}>
          <div className="card" style={{ borderLeft: "4px solid var(--status-broken-text)", padding: "2rem" }}>
            <h2 style={{ fontSize: "1.25rem", color: "var(--status-broken-text)", marginBottom: "0.5rem" }}>
              Application Render Error
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.25rem" }}>
              An unexpected error occurred while rendering this interface. Your data in MongoDB remains completely safe.
            </p>
            <div
              style={{
                background: "var(--bg-app)",
                padding: "0.75rem",
                borderRadius: "var(--radius-sm)",
                fontFamily: "monospace",
                fontSize: "0.8rem",
                color: "var(--text-main)",
                marginBottom: "1.5rem",
                overflowX: "auto"
              }}
            >
              {this.state.error?.message || "Unknown client runtime exception"}
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="btn btn-primary"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
