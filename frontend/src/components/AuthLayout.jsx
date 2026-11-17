// frontend/src/components/AuthLayout.jsx
// Shared left-panel shell for Login and SignUp pages.
// Keeps all brand, personas, and academic metadata in ONE place.

import React from "react";

const PERSONAS = [
  { key: "1", role: "Officer",    name: "Eng. Charles Kibalama", phone: "0700 000 100", color: "#1d4ed8", bg: "#dbeafe" },
  { key: "2", role: "Community",  name: "Esther Nakato",         phone: "0700 000 101", color: "#15803d", bg: "#dcfce7" },
  { key: "3", role: "Technician", name: "John Mugisha",          phone: "0772 100 201", color: "#b45309", bg: "#fef3c7" },
  { key: "4", role: "Volunteer",  name: "Brian Mugabi",          phone: "0700 000 106", color: "#7c3aed", bg: "#f3e8ff" },
  { key: "5", role: "Admin",      name: "System Administrator",  phone: "0700 000 000", color: "#4f46e5", bg: "#e0e7ff" },
];

export { PERSONAS };

export function AuthLayout({ children, onPersonaLogin, submitting, activeKey }) {
  return (
    <div className="al-root">
      {/* ── LEFT ── */}
      <aside className="al-left">
        {/* Brand */}
        <div className="al-brand">
          <span className="al-logo">W</span>
          <div>
            <div className="al-brand-name">Water Tracker</div>
            <div className="al-brand-sub">Bugema University · Luweero District</div>
          </div>
        </div>

        {/* Viva switcher */}
        <p className="al-section-cap">DEMO — CLICK TO SIGN IN</p>
        <div className="al-personas">
          {PERSONAS.map((p) => (
            <button
              key={p.key}
              className={`al-persona${activeKey === p.key ? " al-persona--active" : ""}`}
              onClick={() => onPersonaLogin?.(p)}
              disabled={submitting}
              title={`Alt + ${p.key}`}
            >
              <span className="al-role-dot" style={{ background: p.bg, color: p.color }}>
                {p.role[0]}
              </span>
              <span className="al-persona-info">
                <span className="al-persona-name">{p.name}</span>
                <span className="al-persona-phone">{p.phone}</span>
              </span>
              <kbd className="al-hotkey">Alt+{p.key}</kbd>
            </button>
          ))}
        </div>

        {/* Academic footer */}
        <footer className="al-footer">
          <div className="al-footer-title">Community Water Point Tracker · Bugema University</div>
          <div className="al-footer-student">
            Student: <strong>Moses Tandu Zachariah Hissen</strong>
            <span className="al-sep">·</span>Reg. No. 24/BCC/BU/R/0016
          </div>
          <div className="al-footer-note">
            Kalagala Sub-county, Luweero District · Academic Project
          </div>
          <div className="al-footer-legal">
            Uganda Data Protection and Privacy Act (2019) — seed data uses fictional contact records.
          </div>
        </footer>
      </aside>

      {/* ── RIGHT ── */}
      <main className="al-right">
        <div className="al-card">{children}</div>
      </main>
    </div>
  );
}
