// frontend/src/components/AssignTechnicianModal.jsx
// Officer modal: choose an available technician and assign them to a repair job.
// Contact options: phone call, WhatsApp chat, or WhatsApp call.

import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import { callLink, whatsappLink, formatPhoneDisplay } from "../utils/phoneUtils";
import { WhatsAppIcon } from "./WhatsAppIcon";

export function AssignTechnicianModal({ report, waterPoint, onClose, onAssigned }) {
  const [technicians,    setTechnicians]    = useState([]);
  const [selectedTechId, setSelectedTechId] = useState("");
  const [loading,        setLoading]        = useState(true);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState(null);
  const [desiredSkills,  setDesiredSkills]  = useState([]);

  // Close on Escape
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Load eligible technicians ranked by skill match
  useEffect(() => {
    if (!waterPoint) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        try {
          const ranked = await api.getRankedTechnicians(report._id);
          if (ranked?.rankedTechnicians?.length) {
            setTechnicians(ranked.rankedTechnicians);
            setDesiredSkills(ranked.desiredSkills || []);
            setSelectedTechId(ranked.rankedTechnicians[0]._id);
            return;
          }
        } catch (_) {}
        // Fallback: available technicians covering this community
        const list = await api.getTechnicians({
          communityId: waterPoint.communityId,
          available:   true
        });
        setTechnicians(list || []);
        if (list?.length) setSelectedTechId(list[0]._id);
      } catch (err) {
        setError("Could not load technicians. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [waterPoint, report]);

  const handleAssign = async () => {
    if (!selectedTechId) {
      setError("Please choose a technician before confirming.");
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const updated = await api.assignTechnician(report._id, selectedTechId);
      onAssigned(updated);
    } catch (err) {
      setError(err.message || "Could not assign the technician. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Build the WhatsApp message body
  const buildMessage = (tech) => {
    const type = waterPoint?.type?.replace(/_/g, " ") || "water point";
    const land = waterPoint?.landmark || "the site";
    return (
      `Hello ${tech.name}, I am the District Water Officer.\n\n` +
      `I would like to assign you a repair job:\n` +
      `Water point type: ${type}\n` +
      `Location: ${land}\n` +
      `Problem: ${report.problem}\n\n` +
      `Please confirm if you can take this job. Thank you.`
    );
  };

  const selectedTech = technicians.find(t => t._id === selectedTechId);
  const wpType  = waterPoint?.type?.replace(/_/g, " ") || "water point";
  const landmark = waterPoint?.landmark || "Unknown location";

  // Button style helpers — text only, no icons
  const contactBtnStyle = (variant) => ({
    display:        "inline-flex",
    alignItems:     "center",
    justifyContent: "center",
    padding:        "0.3rem 0.85rem",
    borderRadius:   "4px",
    fontSize:       "0.8rem",
    fontWeight:     700,
    textDecoration: "none",
    minHeight:      "36px",
    cursor:         "pointer",
    whiteSpace:     "nowrap",
    border:         "1px solid",
    ...(variant === "call"    ? { background: "#dbeafe", color: "#1d4ed8", borderColor: "#93c5fd" } :
        variant === "chat"    ? { background: "#dcfce7", color: "#166534", borderColor: "#86efac" } :
        variant === "wacall"  ? { background: "#f0fdf4", color: "#15803d", borderColor: "#bbf7d0" } : {})
  });

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-title"
    >
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: "580px" }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="modal-header">
          <div>
            <h3 id="assign-title">Choose a technician</h3>
            <div style={{
              fontSize: "0.875rem", color: "var(--text-muted)",
              marginTop: "0.2rem", textTransform: "capitalize"
            }}>
              {wpType} — {landmark}
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="modal-body">

          {/* Job summary */}
          <div style={{
            padding: "0.75rem 1rem",
            background: "var(--bg-app)",
            border: "1px solid var(--border-light)",
            borderLeft: "3px solid var(--primary-600)",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.875rem",
            marginBottom: "1.25rem"
          }}>
            <div><strong>Problem reported:</strong> {report.problem}</div>
            {report.reportedBy?.name && (
              <div style={{ marginTop: "0.25rem", color: "var(--text-muted)" }}>
                Reported by {report.reportedBy.name}
                {report.reportedBy.phone && ` — ${formatPhoneDisplay(report.reportedBy.phone)}`}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="alert alert-error" role="alert" style={{ marginBottom: "1rem" }}>
              {error}
            </div>
          )}

          <h4 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem", color: "var(--primary-900)" }}>
            Available technicians
          </h4>

          {/* List */}
          {loading ? (
            <div className="loading-indicator">
              <div className="spinner" />
              <span>Looking for available technicians…</span>
            </div>
          ) : technicians.length === 0 ? (
            <div className="alert alert-warning" role="alert">
              No available technicians cover this community right now. Check technician availability and try again.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {technicians.map(t => {
                const isSelected = selectedTechId === t._id;
                const message    = buildMessage(t);

                return (
                  <div
                    key={t._id}
                    onClick={() => setSelectedTechId(t._id)}
                    style={{
                      padding:    "1rem",
                      border:     `2px solid ${isSelected ? "var(--primary-600)" : "var(--border-light)"}`,
                      borderRadius: "var(--radius-sm)",
                      background: isSelected ? "var(--primary-50)" : "var(--bg-card)",
                      cursor:     "pointer",
                      transition: "border-color 0.15s ease"
                    }}
                  >
                    {/* Name row */}
                    <div style={{
                      display: "flex", alignItems: "center",
                      gap: "0.6rem", flexWrap: "wrap",
                      marginBottom: "0.5rem"
                    }}>
                      <input
                        type="radio"
                        name="techSelect"
                        checked={isSelected}
                        onChange={() => setSelectedTechId(t._id)}
                        onClick={e => e.stopPropagation()}
                        aria-label={`Select ${t.name}`}
                        style={{ width: 18, height: 18, flexShrink: 0 }}
                      />
                      <strong style={{ fontSize: "0.95rem", color: "var(--text-main)" }}>
                        {t.name}
                      </strong>
                      {t.skillMatch && (
                        <span style={{
                          fontSize: "0.72rem", padding: "0.15rem 0.5rem",
                          background: "#dcfce7", color: "#166534",
                          border: "1px solid #86efac", borderRadius: "4px", fontWeight: 700
                        }}>
                          Best skill match
                        </span>
                      )}
                      {t.activeJobsCount > 0 && (
                        <span style={{
                          fontSize: "0.72rem", padding: "0.15rem 0.5rem",
                          background: "#fef3c7", color: "#92400e",
                          border: "1px solid #fde68a", borderRadius: "4px", fontWeight: 700
                        }}>
                          {t.activeJobsCount} active {t.activeJobsCount === 1 ? "job" : "jobs"}
                        </span>
                      )}
                    </div>

                    {/* Skills */}
                    {t.skills?.length > 0 && (
                      <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                        {t.skills.map(s => (
                          <span key={s} style={{
                            fontSize: "0.75rem", padding: "0.15rem 0.45rem",
                            borderRadius: "3px", fontWeight: 600,
                            background: desiredSkills.some(d => d.toLowerCase() === s.toLowerCase())
                              ? "#dcfce7" : "#f1f5f9",
                            color: desiredSkills.some(d => d.toLowerCase() === s.toLowerCase())
                              ? "#166534" : "var(--text-muted)"
                          }}>
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Phone number + contact buttons */}
                    <div style={{
                      display: "flex", alignItems: "center",
                      gap: "0.5rem", flexWrap: "wrap",
                      paddingTop: "0.5rem",
                      borderTop: "1px solid var(--border-light)"
                    }}>
                      <span style={{
                        fontSize: "0.875rem", fontWeight: 600,
                        color: "var(--text-main)", marginRight: "0.25rem"
                      }}>
                        {formatPhoneDisplay(t.phone)}
                      </span>

                      {/* Phone call — opens phone dialler */}
                      <a
                        href={callLink(t.phone)}
                        onClick={e => e.stopPropagation()}
                        style={contactBtnStyle("call")}
                        aria-label={`Call ${t.name} on phone`}
                      >
                        Call
                      </a>

                      {/* WhatsApp chat — opens chat with pre-written message */}
                      <a
                        href={whatsappLink(t.phone, message)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={contactBtnStyle("chat")}
                        aria-label={`Send WhatsApp message to ${t.name}`}
                      >
                        <WhatsAppIcon size={14} style={{ marginRight: "0.3rem" }} />
                        WhatsApp chat
                      </a>

                      {/* WhatsApp voice call — opens WhatsApp call screen */}
                      <a
                        href={whatsappLink(t.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={contactBtnStyle("wacall")}
                        aria-label={`WhatsApp call ${t.name}`}
                        title="Opens WhatsApp — you can start a voice or video call from there"
                      >
                        <WhatsAppIcon size={14} style={{ marginRight: "0.3rem" }} />
                        WhatsApp call
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Confirmation hint */}
          {selectedTech && !loading && (
            <div style={{
              marginTop: "1rem", padding: "0.65rem 1rem",
              background: "#f0fdf4", border: "1px solid #86efac",
              borderRadius: "var(--radius-sm)", fontSize: "0.875rem", color: "#166534"
            }}>
              <strong>{selectedTech.name}</strong> will be assigned to this repair job.
              Contact them first if needed, then click Confirm.
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="modal-footer">
          <button
            className="btn btn-outline"
            onClick={onClose}
            disabled={submitting}
            style={{ minHeight: "44px" }}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleAssign}
            disabled={submitting || !selectedTechId || technicians.length === 0}
            style={{ minHeight: "44px" }}
          >
            {submitting ? "Assigning…" : "Confirm assignment"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AssignTechnicianModal;
