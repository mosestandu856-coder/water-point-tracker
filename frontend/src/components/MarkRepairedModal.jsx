// frontend/src/components/MarkRepairedModal.jsx
// Repair resolution and payment modal:
//   - When used by a Technician: A 1-step completion form to record repair work done
//     and the agreed labor/parts cost to be reimbursed by the District Officer.
//     Includes quick WhatsApp & Call buttons to District Officer Mohamed Abdi (0726 927 445).
//   - When used by an Officer: A 2-step flow to verify the cost and disburse payment
//     to the technician via MTN Mobile Money (*165#) or Airtel Money (*185#).

import React, { useState, useEffect, useMemo } from "react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { formatUGX } from "../utils/formatters";

// Unique payment reference for this transaction
function generateRef() {
  const d   = new Date();
  const ymd = `${d.getFullYear().toString().slice(2)}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `WPT-${ymd}-${rnd}`;
}

// MTN MoMo USSD deep link — dials *165# with amount pre-filled where supported
function mtnLink(amount) {
  return `tel:*165*1*${amount}%23`;
}

// Airtel Money USSD deep link — dials *185# with amount pre-filled
function airtelLink(amount) {
  return `tel:*185*1*${amount}%23`;
}

export function MarkRepairedModal({ report, onClose, onResolved }) {
  const { user } = useAuth();
  const isTechnician = user?.role === "technician";
  const isDisbursing = !isTechnician && report.status === "resolved";

  const [costUGX,    setCostUGX]    = useState(report.costUGX ? String(report.costUGX) : "");
  const [notes,      setNotes]      = useState(report.notes   || "");
  const [confirmed,  setConfirmed]  = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);
  const [step,       setStep]       = useState(1);

  const paymentRef = useMemo(() => generateRef(), []);

  // Close on Escape
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const parsedCost = Number(costUGX) || 0;

  // Handlers for Officer multi-step
  const handleNext = (e) => {
    e.preventDefault();
    setError(null);
    if (!parsedCost || parsedCost <= 0) {
      setError("Please enter the agreed repair cost before continuing.");
      return;
    }
    setStep(2);
  };

  // Submission handler for Technician (1 step) or Officer (after Step 2 confirmation)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!isTechnician && !confirmed) {
      setError("Please confirm that the payment was sent before closing this job.");
      return;
    }

    try {
      setSubmitting(true);

      if (isDisbursing) {
        // District Officer records Mobile Money disbursement for an already resolved job
        const result = await api.disbursePayment(report._id, {
          paymentRef,
          costUGX: parsedCost
        });
        onResolved(result.report || result);
      } else {
        // Technician resolves repair or Officer closes unassigned/open job directly
        const repairNote = isTechnician
          ? (notes.trim() ? `${notes.trim()} | Repaired by technician ${user?.name || ""}` : `Repaired by technician ${user?.name || ""}`)
          : (notes.trim() ? `${notes.trim()} | Payment ref: ${paymentRef}` : `Payment ref: ${paymentRef}`);

        const result = await api.resolveReport(report._id, {
          costUGX: parsedCost,
          notes: repairNote
        });
        onResolved(result);
      }
    } catch (err) {
      setError(err.message || "Could not save this repair. Nothing was changed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pay-title"
    >
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: "520px" }}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <h3 id="pay-title" style={{ fontSize: "1rem", fontWeight: 800 }}>
              {isTechnician
                ? "Complete repair report"
                : isDisbursing
                ? (step === 1 ? "Review repair & pay technician" : "Pay technician via Mobile Money")
                : (step === 1 ? "Enter repair cost to pay technician" : "Send payment via Mobile Money")}
            </h3>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
              {report.problem}
            </div>
          </div>

          {/* Step dots (Officers only) */}
          {!isTechnician && (
            <div style={{ display: "flex", gap: "0.4rem", marginRight: "0.5rem" }}>
              {[1, 2].map(s => (
                <div key={s} style={{
                  width: 26, height: 26, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.75rem", fontWeight: 800,
                  background: step >= s ? "#0284c7" : "#e2e8f0",
                  color:      step >= s ? "#fff"    : "#94a3b8"
                }}>{s}</div>
              ))}
            </div>
          )}

          <button className="modal-close-btn" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        {/* ── TECHNICIAN VIEW: 1-Step Completion Form (Technician does NOT pay) ── */}
        {isTechnician && (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {/* Guidance on agreeing cost with Officer */}
              <div style={{
                padding: "0.85rem 1rem",
                background: "#f0fdf4", border: "1px solid #bbf7d0",
                borderLeft: "4px solid #16a34a", borderRadius: "8px",
                marginBottom: "1.25rem", fontSize: "0.85rem", color: "#166534"
              }}>
                <div style={{ fontWeight: 800, marginBottom: "0.3rem" }}>
                  Price agreement with District Officer:
                </div>
                <div>
                  Agree on the repair and parts cost with District Water Officer <strong>Mohamed Abdi (0765 924 113)</strong> before submitting.
                  Once you confirm, the water point will be marked <strong>working</strong>, and the Officer will send your payment to your registered phone.
                </div>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
                  <a
                    href={`https://wa.me/256765924113?text=${encodeURIComponent(
                      `Hello Officer Mohamed Abdi, regarding repair job ${report._id} (${report.problem}): I have completed the repair. The agreed repair cost is UGX ${costUGX || "[enter amount]"}. Please approve and send payment.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "0.3rem",
                      padding: "0.3rem 0.75rem", borderRadius: "6px",
                      background: "#16a34a", color: "#fff", fontWeight: 700,
                      fontSize: "0.8rem", textDecoration: "none"
                    }}
                  >
                    WhatsApp Officer Mohamed Abdi
                  </a>
                  <a
                    href="tel:+256765924113"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "0.3rem",
                      padding: "0.3rem 0.75rem", borderRadius: "6px",
                      background: "#0284c7", color: "#fff", fontWeight: 700,
                      fontSize: "0.8rem", textDecoration: "none"
                    }}
                  >
                    Call 0765 924 113
                  </a>
                </div>
              </div>

              {error && (
                <div className="alert alert-error" role="alert" style={{ marginBottom: "1rem" }}>
                  {error}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                <label htmlFor="cost" className="form-label">
                  Agreed repair & labor cost (UGX) <span style={{ color: "var(--status-broken-text)" }}>*</span>
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontWeight: 700, color: "var(--text-muted)", whiteSpace: "nowrap" }}>UGX</span>
                  <input
                    id="cost"
                    type="number" min="0" step="1000"
                    className="form-control"
                    placeholder="e.g. 60000"
                    value={costUGX}
                    onChange={e => setCostUGX(e.target.value)}
                    disabled={submitting}
                    required
                    autoFocus
                    style={{ minHeight: "44px" }}
                  />
                </div>
                {parsedCost > 0 && (
                  <div style={{ fontSize: "0.95rem", color: "#15803d", fontWeight: 800, marginTop: "0.4rem" }}>
                    Payment to be claimed: {formatUGX(parsedCost)}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="notes" className="form-label">
                  What was repaired & parts replaced (optional)
                </label>
                <textarea
                  id="notes"
                  className="form-control" rows={3}
                  placeholder="e.g. Replaced pump handle and rod, sealed pipe joints, verified clean water flow"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  disabled={submitting}
                  style={{ fontSize: "0.875rem" }}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={onClose}
                disabled={submitting}
                style={{ minHeight: "44px" }}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary"
                disabled={submitting || !parsedCost}
                style={{ minHeight: "44px", background: "#16a34a", borderColor: "#16a34a", fontWeight: 800 }}>
                {submitting ? "Submitting repair…" : "Confirm repair & submit for officer payment"}
              </button>
            </div>
          </form>
        )}

        {/* ── OFFICER VIEW: Step 1 Cost review & verification ── */}
        {!isTechnician && step === 1 && (
          <form onSubmit={handleNext}>
            <div className="modal-body">
              <div style={{
                padding: "0.75rem 1rem",
                background: "#f0f9ff", border: "1px solid #bae6fd",
                borderLeft: "3px solid #0284c7", borderRadius: "8px",
                marginBottom: "1.25rem", fontSize: "0.875rem", color: "#0c4a6e"
              }}>
                {isDisbursing ? (
                  <>
                    The technician has finished repairing this water point. Review the agreed repair
                    amount below, then proceed to disburse Mobile Money payment directly to the technician.
                  </>
                ) : (
                  <>
                    Enter the amount agreed with the technician. On the next step you
                    can disburse payment directly to the technician via Mobile Money.
                  </>
                )}
              </div>

              {report.assignedTo && (
                <div style={{
                  padding: "0.6rem 0.85rem", background: "#f8fafc",
                  border: "1px solid #e2e8f0", borderRadius: "8px",
                  marginBottom: "1rem", fontSize: "0.85rem"
                }}>
                  <span style={{ color: "#64748b" }}>Assigned technician: </span>
                  <strong style={{ color: "#0f172a" }}>{report.assignedTo}</strong>
                </div>
              )}

              {error && (
                <div className="alert alert-error" role="alert" style={{ marginBottom: "1rem" }}>
                  {error}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                <label htmlFor="cost" className="form-label">
                  Agreed technician payment (UGX) <span style={{ color: "var(--status-broken-text)" }}>*</span>
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontWeight: 700, color: "var(--text-muted)", whiteSpace: "nowrap" }}>UGX</span>
                  <input
                    id="cost"
                    type="number" min="0" step="1000"
                    className="form-control"
                    placeholder="e.g. 60000"
                    value={costUGX}
                    onChange={e => setCostUGX(e.target.value)}
                    disabled={submitting}
                    required
                    autoFocus
                    style={{ minHeight: "44px" }}
                  />
                </div>
                {parsedCost > 0 && (
                  <div style={{ fontSize: "0.95rem", color: "#0369a1", fontWeight: 800, marginTop: "0.4rem" }}>
                    {formatUGX(parsedCost)}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="notes" className="form-label">
                  Repair notes & verification (optional)
                </label>
                <textarea
                  id="notes"
                  className="form-control" rows={3}
                  placeholder="e.g. Verified functional flow on site, pump handle replaced"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  disabled={submitting}
                  style={{ fontSize: "0.875rem" }}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={onClose}
                style={{ minHeight: "44px" }}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary"
                disabled={!parsedCost}
                style={{ minHeight: "44px" }}>
                Next — pay technician
              </button>
            </div>
          </form>
        )}

        {/* ── OFFICER VIEW: Step 2 Mobile Money payment ── */}
        {!isTechnician && step === 2 && (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {/* Amount summary */}
              <div style={{
                background: "linear-gradient(135deg, #0c4a6e 0%, #0369a1 100%)",
                borderRadius: "12px", padding: "1.25rem",
                color: "#fff", marginBottom: "1.25rem",
                display: "flex", justifyContent: "space-between",
                alignItems: "center", flexWrap: "wrap", gap: "0.5rem"
              }}>
                <div>
                  <div style={{ fontSize: "0.7rem", opacity: 0.75, textTransform: "uppercase",
                    letterSpacing: "0.08em", marginBottom: "0.35rem" }}>
                    Amount to pay technician
                  </div>
                  <div style={{ fontSize: "1.75rem", fontWeight: 800, lineHeight: 1 }}>
                    {formatUGX(parsedCost)}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.7rem", opacity: 0.75, marginBottom: "0.2rem" }}>
                    Payment reference
                  </div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 700, fontFamily: "monospace" }}>
                    {paymentRef}
                  </div>
                </div>
              </div>

              {/* MTN MoMo button */}
              <a
                href={mtnLink(parsedCost)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "1rem 1.25rem", borderRadius: "10px", marginBottom: "0.75rem",
                  background: "#fef3c7", border: "2px solid #f59e0b",
                  textDecoration: "none", cursor: "pointer"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: "#f59e0b", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 900, fontSize: "0.75rem", flexShrink: 0
                  }}>MTN</div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#78350f" }}>
                      Pay via MTN Mobile Money
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "#92400e", marginTop: "0.1rem" }}>
                      Opens dialler (*165#) to pay technician
                    </div>
                  </div>
                </div>
                <div style={{
                  fontWeight: 800, fontSize: "0.875rem", color: "#78350f",
                  background: "#fde68a", padding: "0.4rem 0.85rem",
                  borderRadius: "6px", whiteSpace: "nowrap"
                }}>
                  {formatUGX(parsedCost)}
                </div>
              </a>

              {/* Airtel Money button */}
              <a
                href={airtelLink(parsedCost)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "1rem 1.25rem", borderRadius: "10px", marginBottom: "1.25rem",
                  background: "#fee2e2", border: "2px solid #ef4444",
                  textDecoration: "none", cursor: "pointer"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: "#dc2626", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 900, fontSize: "0.7rem", flexShrink: 0
                  }}>AIR</div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#7f1d1d" }}>
                      Pay via Airtel Money
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "#991b1b", marginTop: "0.1rem" }}>
                      Opens dialler (*185#) to pay technician
                    </div>
                  </div>
                </div>
                <div style={{
                  fontWeight: 800, fontSize: "0.875rem", color: "#7f1d1d",
                  background: "#fecaca", padding: "0.4rem 0.85rem",
                  borderRadius: "6px", whiteSpace: "nowrap"
                }}>
                  {formatUGX(parsedCost)}
                </div>
              </a>

              {error && (
                <div className="alert alert-error" role="alert" style={{ marginBottom: "1rem" }}>
                  {error}
                </div>
              )}

              {/* Confirmation tick */}
              <div style={{
                padding: "0.875rem 1rem",
                background: confirmed ? "#f0fdf4" : "#f8fafc",
                border: `1px solid ${confirmed ? "#86efac" : "#e2e8f0"}`,
                borderRadius: "8px", transition: "all 0.2s ease"
              }}>
                <label htmlFor="confirm" style={{
                  display: "flex", alignItems: "flex-start", gap: "0.75rem",
                  cursor: "pointer", fontSize: "0.875rem",
                  color: confirmed ? "#166534" : "var(--text-main)",
                  fontWeight: confirmed ? 700 : 400
                }}>
                  <input
                    id="confirm"
                    type="checkbox"
                    checked={confirmed}
                    onChange={e => setConfirmed(e.target.checked)}
                    disabled={submitting}
                    style={{ width: 20, height: 20, marginTop: "2px", flexShrink: 0 }}
                  />
                  <span>
                    I confirm that <strong>{formatUGX(parsedCost)}</strong> has been
                    sent to the technician via Mobile Money.
                    Reference: <strong style={{ fontFamily: "monospace" }}>{paymentRef}</strong>.
                  </span>
                </label>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline"
                onClick={() => setStep(1)} disabled={submitting}
                style={{ minHeight: "44px" }}>
                Back
              </button>
              <button type="submit" className="btn btn-primary"
                disabled={submitting || !confirmed}
                style={{ minHeight: "44px", background: "#16a34a", borderColor: "#16a34a" }}>
                {submitting ? "Recording payment…" : isDisbursing ? "Confirm payment sent" : "Confirm payment and close job"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default MarkRepairedModal;
