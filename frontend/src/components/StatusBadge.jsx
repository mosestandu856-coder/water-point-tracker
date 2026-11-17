// frontend/src/components/StatusBadge.jsx
// Accessible status and severity badge.
// No emoji — uses uppercase text labels only so colour + text always convey meaning together.

import React from "react";

export function StatusBadge({ status, type = "status" }) {
  if (!status) return null;

  const key = String(status).toLowerCase();

  // Solid-colour badge config — label + inline style for bold visual weight
  const statusConfig = {
    // Water point statuses
    working:     { label: "Working",     bg: "#15803d", color: "#fff" },
    broken:      { label: "Broken",      bg: "#dc2626", color: "#fff" },
    low_yield:   { label: "Low Yield",   bg: "#d97706", color: "#fff" },

    // Report statuses
    open:        { label: "Open",        bg: "#dc2626", color: "#fff" },
    assigned:    { label: "Assigned",    bg: "#d97706", color: "#fff" },
    in_progress: { label: "In Progress", bg: "#7c3aed", color: "#fff" },
    resolved:    { label: "Resolved",    bg: "#15803d", color: "#fff" },

    // Severity levels
    high:             { label: "High",            bg: "#dc2626", color: "#fff" },
    medium:           { label: "Medium",          bg: "#d97706", color: "#fff" },
    low:              { label: "Low",             bg: "#0284c7", color: "#fff" },
    overdue_critical: { label: "SLA Overdue",     bg: "#dc2626", color: "#fff" },
    overdue_warning:  { label: "SLA Approaching", bg: "#d97706", color: "#fff" },
  };

  const config = statusConfig[key];

  if (!config) {
    return (
      <span style={{
        display: "inline-block", padding: "0.2rem 0.55rem",
        borderRadius: "4px", fontSize: "0.72rem", fontWeight: 800,
        letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap",
        background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0"
      }}>
        {status}
      </span>
    );
  }

  return (
    <span style={{
      display: "inline-block", padding: "0.2rem 0.55rem",
      borderRadius: "4px", fontSize: "0.72rem", fontWeight: 800,
      letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap",
      background: config.bg, color: config.color
    }}>
      {config.label}
    </span>
  );
}

export default StatusBadge;
