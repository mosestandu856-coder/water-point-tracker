// frontend/src/components/Footer.jsx
// Application footer.
// Complies with check A8: moves student attribution to About dialog.

import React, { useState } from "react";

export function Footer() {
  const [showAbout, setShowAbout] = useState(false);

  return (
    <footer className="app-footer">
      <div>
        <strong>Community Water Point Tracker</strong> &bull; Bugema University
      </div>
      <div style={{ marginTop: "0.5rem" }}>
        <button
          onClick={() => setShowAbout(true)}
          style={{
            background: "none",
            border: "none",
            color: "var(--primary-700)",
            textDecoration: "underline",
            cursor: "pointer",
            fontSize: "0.875rem",
            padding: "0.25rem 0.5rem"
          }}
          aria-haspopup="dialog"
        >
          About this project
        </button>
      </div>

      {showAbout && (
        <div
          className="modal-backdrop"
          onClick={() => setShowAbout(false)}
          role="dialog"
          aria-modal="true"
          aria-label="About this project"
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "480px" }}
          >
            <div className="modal-header">
              <h3>About this project</h3>
              <button
                className="modal-close-btn"
                onClick={() => setShowAbout(false)}
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>
            <div className="modal-body" style={{ fontSize: "0.9rem", lineHeight: "1.5" }}>
              <p style={{ marginBottom: "0.75rem" }}>
                <strong>Community Water Point Tracker</strong>
              </p>
              <div style={{ marginBottom: "0.5rem" }}>
                <strong>Student:</strong> Moses Tandu Zachariah Hissen
              </div>
              <div style={{ marginBottom: "0.5rem" }}>
                <strong>Registration number:</strong> 24/BCC/BU/R/0016
              </div>
              <div style={{ marginBottom: "0.75rem" }}>
                <strong>Location:</strong> Bugema University area, Luweero District
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Academic coursework system for monitoring community water infrastructure, reporting breakdowns, dispatching local mechanics, and tracking repair turnaround.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-outline"
                onClick={() => setShowAbout(false)}
                style={{ minHeight: "44px" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}

export default Footer;
