// frontend/src/pages/PrivacyNotice.jsx
// Short privacy notice page for Community Water Point Tracker
// Explains what data is collected, why it is needed, and compliance under Uganda DPA 2019.

import React from "react";
import { Link } from "react-router-dom";

export function PrivacyNotice() {
  return (
    <div className="login-root">
      <div className="login-card" style={{ maxWidth: "560px" }} role="main">
        <div className="login-brand" aria-label="Community Water Point Tracker">
          <svg aria-hidden="true" width="28" height="28" viewBox="0 0 32 32" fill="none">
            <path d="M16 3C16 3 6 13.5 6 20a10 10 0 0020 0C26 13.5 16 3 16 3z" fill="#0ea5e9" />
          </svg>
          <span className="login-brand-name">Privacy Notice</span>
        </div>

        <p className="login-description" style={{ marginBottom: "1rem" }}>
          Community Water Point Tracker &bull; Data Protection & Privacy Notice
        </p>

        <section style={{ fontSize: "14px", lineHeight: "1.6", color: "#334155", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <h2 style={{ fontSize: "15px", fontWeight: "700", color: "#0c4a6e", marginBottom: "0.25rem" }}>
              1. What Data We Collect
            </h2>
            <p>
              We collect your <strong>telephone number</strong>, <strong>full name</strong>, and optional email address when you register or file an infrastructure report.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: "15px", fontWeight: "700", color: "#0c4a6e", marginBottom: "0.25rem" }}>
              2. Why We Collect It
            </h2>
            <p>
              Your contact details are strictly used to coordinate dispatch with local pump mechanics, notify community chairpersons of repair statuses, and verify legitimate breakdown submissions across Kalagala Sub-county.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: "15px", fontWeight: "700", color: "#0c4a6e", marginBottom: "0.25rem" }}>
              3. Legal Compliance & Security
            </h2>
            <p>
              In compliance with the <em>Uganda Data Protection and Privacy Act (2019)</em>, personal data is encrypted in transit and passwords are cryptographically hashed using bcrypt (cost 12). Records are never sold or shared with commercial entities.
            </p>
          </div>
        </section>

        <div style={{ marginTop: "1.5rem", borderTop: "1px solid #e2e8f0", paddingTop: "1rem", textAlign: "center" }}>
          <Link to="/login" className="login-text-btn" style={{ fontSize: "14px" }}>
            &larr; Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

export default PrivacyNotice;

