// frontend/src/pages/dashboards/TechnicianDashboard.jsx
// Mobile-first dashboard for local artisans and hand pump mechanics.
// Scoped strictly to the authenticated technician's assigned jobs (user.linkedId).
// Features:
//   - "My Jobs" queue sorted by severity (high -> medium -> low) then age.
//   - Deep job details: hardware specs, physical landmark, and direct phone link to community contact.
//   - In-system Job Chat with District Officer (price negotiation before work starts).
//   - Price Quote step: technician submits agreed cost BEFORE starting work.
//   - After repair is marked complete, system notifies Officer to approve & disburse payment.
//   - Self-service Availability toggle.
//   - History of completed repairs with payment status.

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { api } from "../../services/api";
import StatusBadge from "../../components/StatusBadge";
import MarkRepairedModal from "../../components/MarkRepairedModal";
import { JobChatPanel } from "../../components/JobChatPanel";
import { formatDate, formatReportAge, formatUGX } from "../../utils/formatters";

export function TechnicianDashboard() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [technician, setTechnician] = useState(null);
  const [reports, setReports] = useState([]);
  const [waterPointsMap, setWaterPointsMap] = useState({});
  const [communitiesMap, setCommunitiesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [togglingAvailability, setTogglingAvailability] = useState(false);
  const [resolvingReport, setResolvingReport] = useState(null);
  // Track which job has the chat panel open
  const [openChatId, setOpenChatId] = useState(null);

  // Track read message counts per job so notifications disappear once opened/read
  const [readCounts, setReadCounts] = useState(() => {
    try {
      const saved = localStorage.getItem(`water_tracker_read_chat_${user?._id || "tech"}`);
      return saved ? JSON.parse(saved) : {};
    } catch (_) {
      return {};
    }
  });

  const markJobChatRead = useCallback((reportId, count) => {
    setReadCounts(prev => {
      if (prev[reportId] === count) return prev;
      const updated = { ...prev, [reportId]: count };
      try {
        localStorage.setItem(`water_tracker_read_chat_${user?._id || "tech"}`, JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });

    // Dismiss any pending in-app notifications for this job
    api.getNotifications().then(notifs => {
      (notifs || []).filter(n => n.reportId === reportId && !n.read).forEach(n => {
        api.markNotificationRead(n._id).catch(() => {});
      });
    }).catch(() => {});
  }, [user?._id]);

  const handleToggleChat = (reportId, totalMessages) => {
    if (openChatId === reportId) {
      setOpenChatId(null);
    } else {
      setOpenChatId(reportId);
      markJobChatRead(reportId, totalMessages);
    }
  };

  const loadTechnicianData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Concurrently load technician profile, assigned reports, water points, and communities
      const [techData, reportsData, wpData, commsData] = await Promise.all([
        api.getTechnicianById(user.linkedId),
        api.getReports(), // Server scopes to reports where assignedTo === user.linkedId
        api.getWaterPoints(),
        api.getCommunities()
      ]);

      setTechnician(techData);
      setReports(reportsData || []);

      const wpDict = Object.fromEntries((wpData || []).map((w) => [w._id, w]));
      const commDict = Object.fromEntries((commsData || []).map((c) => [c._id, c]));

      setWaterPointsMap(wpDict);
      setCommunitiesMap(commDict);
    } catch (err) {
      setError(err.message || "Failed to load technician dashboard.");
    } finally {
      setLoading(false);
    }
  }, [user.linkedId]);

  useEffect(() => {
    loadTechnicianData();
  }, [loadTechnicianData]);

  // Toggle availability
  const handleToggleAvailability = async () => {
    if (!technician || togglingAvailability) return;
    const newStatus = !technician.available;

    try {
      setTogglingAvailability(true);
      await api.updateTechnicianAvailability(technician._id, newStatus);
      setTechnician((prev) => ({ ...prev, available: newStatus }));
      addToast(
        `Availability updated: You are now marked as ${newStatus ? "AVAILABLE" : "UNAVAILABLE"}.`,
        newStatus ? "success" : "info"
      );
    } catch (err) {
      addToast(`Failed to update availability: ${err.message}`, "error");
    } finally {
      setTogglingAvailability(false);
    }
  };

  // Start work on an assigned job (transition to in_progress)
  const handleStartWork = async (reportId) => {
    try {
      await api.startWork(reportId);
      addToast(`Work started on report ${reportId}. Status updated to In Progress.`, "success");
      loadTechnicianData();
    } catch (err) {
      addToast(`Failed to start work: ${err.message}`, "error");
    }
  };

  if (loading) {
    return (
      <div className="loading-indicator" style={{ minHeight: "50vh" }}>
        <div className="spinner" />
        <span>Loading assigned repair queue for {user.name}...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error">
        <div>
          <strong>Dashboard Error:</strong> {error}
          <div style={{ marginTop: "0.5rem" }}>
            <button
              onClick={loadTechnicianData}
              className="btn btn-outline"
              style={{ minHeight: "36px", padding: "0.3rem 0.75rem", fontSize: "0.85rem" }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Split reports into active jobs and completed repairs
  const severityWeight = { high: 3, medium: 2, low: 1 };
  const activeJobs = reports
    .filter((r) => r.status === "assigned" || r.status === "in_progress")
    .sort((a, b) => {
      // 1. Severity weight descending (high first)
      const diff = (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0);
      if (diff !== 0) return diff;
      // 2. Oldest reportedAt first (FIFO within severity tier)
      return new Date(a.reportedAt) - new Date(b.reportedAt);
    });

  const completedJobs = reports
    .filter((r) => r.status === "resolved")
    .sort((a, b) => new Date(b.resolvedAt || 0) - new Date(a.resolvedAt || 0));

  const isJobPaid = (r) => Boolean(r.paid || (r.notes || "").includes("Payment ref:") || r.paymentRef);
  const paidJobs = completedJobs.filter(isJobPaid);
  const pendingPaymentJobs = completedJobs.filter((r) => !isJobPaid(r));
  const totalPaidUGX = paidJobs.reduce((sum, r) => sum + (Number(r.costUGX) || 0), 0);
  const totalPendingUGX = pendingPaymentJobs.reduce((sum, r) => sum + (Number(r.costUGX) || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* ── Profile header ── */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        <div style={{ height: "4px", background: "linear-gradient(90deg,#0369a1,#0284c7)" }} />
        <div style={{ padding: "1.25rem 1.5rem", background: "linear-gradient(180deg,#fff 0%,#f0f9ff 100%)",
          display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#0369a1",
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.3rem" }}>
              Certified Field Technician · {technician?._id}
            </div>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0c4a6e",
              margin: 0, letterSpacing: "-0.02em" }}>
              {technician?.name || user.name}
            </h1>
            <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.35rem", marginBottom: "0.5rem" }}>
              Phone: <strong style={{ color: "#0f172a" }}>{technician?.phone}</strong> · Covered:{" "}
              <strong style={{ color: "#0f172a" }}>
                {technician?.coversCommunities?.map(id => communitiesMap[id]?.name || id).join(", ")}
              </strong>
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
              {technician?.skills?.map((skill, idx) => (
                <span key={idx} style={{
                  background: "#f1f5f9", border: "1px solid #e2e8f0",
                  fontSize: "0.68rem", fontWeight: 800, padding: "0.2rem 0.55rem",
                  borderRadius: "4px", textTransform: "uppercase", color: "#475569",
                  letterSpacing: "0.04em"
                }}>{skill}</span>
              ))}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#64748b",
              textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.4rem" }}>
              Dispatch Availability
            </div>
            <button onClick={handleToggleAvailability} disabled={togglingAvailability}
              className={technician?.available ? "btn btn-success" : "btn btn-outline"}
              style={{ minHeight: "44px", fontWeight: 800 }}>
              {togglingAvailability ? "Updating…"
                : technician?.available ? "Available for dispatch"
                : "Unavailable / on break"}
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "1rem" }}>
        <div style={{ background: "linear-gradient(135deg, #991b1b 0%, #dc2626 100%)", borderRadius: "14px", padding: "1.5rem", color: "#fff", boxShadow: "0 4px 20px rgba(220,38,38,0.25)" }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.75, marginBottom: "0.75rem" }}>Active jobs</div>
          <div style={{ fontSize: "2.75rem", fontWeight: 800, lineHeight: 1 }}>{activeJobs.length}</div>
          <div style={{ fontSize: "0.78rem", opacity: 0.7, marginTop: "0.5rem" }}>assigned to you</div>
        </div>
        <div style={{ background: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)", borderRadius: "14px", padding: "1.5rem", color: "#fff", boxShadow: "0 4px 20px rgba(124,58,237,0.25)" }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.75, marginBottom: "0.75rem" }}>Work started</div>
          <div style={{ fontSize: "2.75rem", fontWeight: 800, lineHeight: 1 }}>{activeJobs.filter((j) => j.status === "in_progress").length}</div>
          <div style={{ fontSize: "0.78rem", opacity: 0.7, marginTop: "0.5rem" }}>on-site now</div>
        </div>
        <div style={{ background: "linear-gradient(135deg, #065f46 0%, #059669 100%)", borderRadius: "14px", padding: "1.5rem", color: "#fff", boxShadow: "0 4px 20px rgba(5,150,105,0.25)" }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.75, marginBottom: "0.75rem" }}>Completed</div>
          <div style={{ fontSize: "2.75rem", fontWeight: 800, lineHeight: 1 }}>{completedJobs.length}</div>
          <div style={{ fontSize: "0.78rem", opacity: 0.7, marginTop: "0.5rem" }}>repairs done</div>
        </div>
        <div style={{ background: "linear-gradient(135deg, #0c4a6e 0%, #0369a1 100%)", borderRadius: "14px", padding: "1.5rem", color: "#fff", boxShadow: "0 4px 20px rgba(3,105,161,0.25)" }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.75, marginBottom: "0.75rem" }}>Paid earnings</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, lineHeight: 1.1 }}>{formatUGX(totalPaidUGX)}</div>
          <div style={{ fontSize: "0.78rem", opacity: 0.85, marginTop: "0.5rem" }}>
            {paidJobs.length} paid · {pendingPaymentJobs.length} awaiting payment
          </div>
        </div>
      </div>

      {/* ── Active jobs ── */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        <div style={{ padding: "1.1rem 1.25rem", borderBottom: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0c4a6e", letterSpacing: "-0.01em" }}>
              My Assigned Jobs ({activeJobs.length})
            </div>
            <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.1rem" }}>
              Sorted by priority: high severity → oldest age
            </div>
          </div>
          <button onClick={loadTechnicianData} className="btn btn-outline btn-sm">Refresh</button>
        </div>
        <div style={{ padding: "1.1rem 1.25rem" }}>
          {activeJobs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-text">No pending jobs assigned right now — you are all caught up.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {activeJobs.map(rpt => {
                const wp   = waterPointsMap[rpt.waterPointId];
                const comm = wp ? communitiesMap[wp.communityId] : null;
                const age  = formatReportAge(rpt.reportedAt);
                const accent = rpt.severity === "high"
                  ? "linear-gradient(90deg,#991b1b,#dc2626)"
                  : rpt.status === "in_progress"
                  ? "linear-gradient(90deg,#4c1d95,#7c3aed)"
                  : "linear-gradient(90deg,#0369a1,#0284c7)";

                return (
                  <div key={rpt._id} style={{ background: "#fff", border: "1px solid #e2e8f0",
                    borderRadius: "12px", overflow: "hidden",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                    <div style={{ height: "4px", background: accent }} />
                    <div style={{ padding: "1rem 1.25rem" }}>
                      {/* Header */}
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start",
                        justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.65rem" }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0f172a" }}>
                            {comm?.name || "Luweero Settlement"} ·{" "}
                            <span style={{ textTransform: "capitalize" }}>{wp?.type?.replace("_", " ")}</span>
                          </div>
                          <div style={{ fontSize: "0.825rem", color: "#64748b", marginTop: "0.1rem" }}>
                            Reported {age}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          <StatusBadge status={rpt.severity} />
                          <StatusBadge status={rpt.status} />
                        </div>
                      </div>

                      {/* Problem */}
                      <div style={{ padding: "0.65rem 1rem", background: "#f8fafc",
                        border: "1px solid #e2e8f0", borderRadius: "8px",
                        fontSize: "0.875rem", fontWeight: 600, color: "#334155",
                        marginBottom: "0.85rem" }}>
                        "{rpt.problem}"
                      </div>

                      {/* Site info */}
                      <div style={{
                        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
                        gap: "0.65rem", background: "#f0f9ff", border: "1px solid #bae6fd",
                        borderRadius: "8px", padding: "0.85rem 1rem",
                        fontSize: "0.825rem", marginBottom: "1rem"
                      }}>
                        <div><span style={{ color: "#64748b" }}>Physical landmark: </span>
                          <strong style={{ color: "#0c4a6e" }}>{wp?.landmark || "Near central junction"}</strong></div>
                        <div><span style={{ color: "#64748b" }}>Households served: </span>
                          <strong style={{ color: "#0c4a6e" }}>{wp?.householdsServed || "N/A"}</strong></div>
                        <div><span style={{ color: "#64748b" }}>Filed: </span>
                          <strong style={{ color: "#0c4a6e" }}>{formatDate(rpt.reportedAt)}</strong> ({age})</div>
                        <div>
                          <span style={{ color: "#64748b" }}>Chairperson: </span>
                          {comm?.contact?.phone ? (
                            <a href={`tel:${comm.contact.phone.replace(/\s+/g, "")}`}
                              style={{ color: "#0369a1", fontWeight: 800, textDecoration: "underline" }}>
                              {comm.contact.name} ({comm.contact.phone})
                            </a>
                          ) : (
                            <span style={{ color: "#0f172a", fontWeight: 700 }}>
                              {rpt.reportedBy?.name} ({rpt.reportedBy?.phone})
                            </span>
                          )}
                        </div>
                        <div>
                          <span style={{ color: "#64748b" }}>District Officer: </span>
                          <span style={{ color: "#0f172a", fontWeight: 700 }}>
                            Mohamed Abdi (0765 924 113)
                          </span>
                          {" · "}
                          <a
                            href={`https://wa.me/256765924113?text=${encodeURIComponent(
                              `Hello Officer Mohamed Abdi, regarding job ${rpt._id} (${wp?.type?.replace(/_/g, " ") || "water point"} at ${wp?.landmark || ""}): I am on site assessing the repair.`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#16a34a", fontWeight: 700, fontSize: "0.78rem", textDecoration: "none" }}
                          >
                            WhatsApp
                          </a>
                          {" · "}
                          <a
                            href="tel:+256765924113"
                            style={{ color: "#0369a1", fontWeight: 700, fontSize: "0.78rem", textDecoration: "none" }}
                          >
                            Call
                          </a>
                        </div>
                      </div>

                      {/* ── In-system Job Chat Panel ── */}
                      {/* Officer and technician negotiate the repair price here before work starts */}
                      <div style={{ marginBottom: "1rem" }}>
                        {(() => {
                          const totalMsgs = rpt.messages?.length || 0;
                          const readCount = readCounts[rpt._id] || 0;
                          const isChatOpen = openChatId === rpt._id;
                          const unreadCount = isChatOpen ? 0 : Math.max(0, totalMsgs - readCount);

                          return (
                            <button
                              onClick={() => handleToggleChat(rpt._id, totalMsgs)}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: "0.5rem",
                                padding: "0.45rem 1rem", borderRadius: "6px",
                                border: isChatOpen ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                                background: isChatOpen ? "#f0f9ff" : "#ffffff",
                                cursor: "pointer", fontSize: "0.82rem", fontWeight: 700, color: "#0f172a",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                                marginBottom: isChatOpen ? "0.75rem" : 0
                              }}
                            >
                              {/* Clean SVG Chat Icon */}
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                              </svg>

                              <span>{isChatOpen ? "Close Job Chat" : "Open Job Chat with Officer"}</span>

                              {/* Notification badge only shows if there are UNREAD messages. Disappears immediately once read! */}
                              {unreadCount > 0 && (
                                <span style={{
                                  padding: "0.15rem 0.55rem", borderRadius: "10px",
                                  background: "#ef4444", color: "#ffffff",
                                  fontSize: "0.7rem", fontWeight: 800,
                                  boxShadow: "0 1px 4px rgba(239,68,68,0.35)"
                                }}>
                                  {unreadCount} {unreadCount === 1 ? "new message" : "new messages"}
                                </span>
                              )}

                              {rpt.quoteApproved ? (
                                <span style={{
                                  padding: "0.15rem 0.55rem", borderRadius: "4px",
                                  background: "#dcfce7", color: "#15803d",
                                  border: "1px solid #86efac", fontSize: "0.7rem", fontWeight: 700
                                }}>
                                  Quote Authorized: UGX {Number(rpt.quotedCostUGX).toLocaleString()}
                                </span>
                              ) : rpt.quotedCostUGX ? (
                                <span style={{
                                  padding: "0.15rem 0.55rem", borderRadius: "4px",
                                  background: "#fef3c7", color: "#92400e",
                                  border: "1px solid #fde68a", fontSize: "0.7rem", fontWeight: 700
                                }}>
                                  Quote Awaiting Review: UGX {Number(rpt.quotedCostUGX).toLocaleString()}
                                </span>
                              ) : (
                                <span style={{
                                  padding: "0.15rem 0.55rem", borderRadius: "4px",
                                  background: "#fffbeb", color: "#b45309",
                                  border: "1px solid #fde68a", fontSize: "0.7rem", fontWeight: 700
                                }}>
                                  Negotiation Required
                                </span>
                              )}
                            </button>
                          );
                        })()}
                        {openChatId === rpt._id && (
                          <JobChatPanel
                            report={rpt}
                            onMessagesRead={(count) => markJobChatRead(rpt._id, count)}
                            onQuoteSubmitted={(updatedReport) => {
                              // Refresh this job card so the quote badge and Start Work button appear immediately
                              setReports(prev => prev.map(r => r._id === updatedReport._id ? updatedReport : r));
                            }}
                            onQuoteApproved={(updatedReport) => {
                              setReports(prev => prev.map(r => r._id === updatedReport._id ? updatedReport : r));
                            }}
                          />
                        )}
                      </div>

                      {/* Actions — Start Work is locked until a price quote is submitted */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem",
                        paddingTop: "0.75rem", borderTop: "1px solid #f1f5f9",
                        justifyContent: "flex-end" }}>

                        {/* No quote yet: show formal notice instead of the Start Work button */}
                        {rpt.status === "assigned" && !rpt.quotedCostUGX && (
                          <div style={{
                            fontSize: "0.78rem", color: "#92400e", fontWeight: 600,
                            alignSelf: "center", padding: "0.4rem 0.75rem",
                            background: "#fffbeb", borderRadius: "4px", border: "1px solid #fde68a"
                          }}>
                            Notice: Open the Job Chat above to agree on the price quote with the District Officer and unlock Start Work.
                          </div>
                        )}

                        {/* Quote submitted: unlock Start Work button */}
                        {rpt.status === "assigned" && rpt.quotedCostUGX && (
                          <button onClick={() => handleStartWork(rpt._id)}
                            className="btn btn-outline"
                            style={{ minHeight: "44px", fontWeight: 700, borderColor: "#059669", color: "#059669" }}>
                            Start Work — UGX {Number(rpt.quotedCostUGX).toLocaleString()} Agreed
                          </button>
                        )}

                        {/* In-progress: show Mark Repaired */}
                        {rpt.status === "in_progress" && (
                          <button onClick={() => setResolvingReport(rpt)}
                            className="btn btn-success" style={{ minHeight: "44px", fontWeight: 800 }}>
                            Mark repaired &amp; notify officer
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Completed repairs ── */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        <div style={{ padding: "1.1rem 1.25rem", borderBottom: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0c4a6e", letterSpacing: "-0.01em" }}>
              Finished jobs ({completedJobs.length})
            </div>
            <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "0.15rem" }}>
              A job is marked paid once the officer approves payment and closes the repair.
            </div>
          </div>
          {/* Payment summary pills */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "0.35rem",
              padding: "0.3rem 0.8rem", borderRadius: "20px",
              background: "#f0fdf4", border: "1px solid #86efac",
              fontSize: "0.78rem", fontWeight: 700, color: "#166534"
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a", flexShrink: 0 }} />
              Paid: {formatUGX(totalPaidUGX)} ({paidJobs.length} jobs)
            </span>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "0.35rem",
              padding: "0.3rem 0.8rem", borderRadius: "20px",
              background: "#fef3c7", border: "1px solid #fde68a",
              fontSize: "0.78rem", fontWeight: 700, color: "#92400e"
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
              Awaiting payment: {pendingPaymentJobs.length} jobs ({formatUGX(totalPendingUGX)})
            </span>
          </div>
        </div>

        {completedJobs.length === 0 ? (
          <div className="empty-state"><div className="empty-state-text">No completed repairs recorded yet.</div></div>
        ) : (
          <div className="table-responsive">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", minWidth: "600px" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Location", "Community", "Date fixed", "Agreed amount", "Payment status", "Notes"].map(h => (
                    <th key={h} style={{ padding: "0.8rem 1rem", textAlign: "left",
                      fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase",
                      letterSpacing: "0.07em", color: "#64748b", borderBottom: "2px solid #e2e8f0",
                      whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {completedJobs.map((rpt, idx) => {
                  const wp   = waterPointsMap[rpt.waterPointId];
                  const comm = wp ? communitiesMap[wp.communityId] : null;
                  const refMatch = (rpt.notes || "").match(/Payment ref:\s*([A-Z0-9\-]+)/);
                  const payRef   = rpt.paymentRef || (refMatch ? refMatch[1] : null);
                  const isPaid   = Boolean(rpt.paid || payRef);

                  return (
                    <tr key={rpt._id} style={{
                      borderBottom: idx < completedJobs.length - 1 ? "1px solid #f8fafc" : "none",
                      background: isPaid ? "rgba(240,253,244,0.4)" : "rgba(254,243,199,0.15)"
                    }}>
                      {/* Location */}
                      <td style={{ padding: "0.9rem 1rem" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a", textTransform: "capitalize" }}>
                          {wp?.type?.replace(/_/g, " ") || "Water point"}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "0.1rem" }}>
                          {wp?.landmark || "—"}
                        </div>
                      </td>
                      {/* Community */}
                      <td style={{ padding: "0.9rem 1rem", color: "#475569", fontSize: "0.85rem" }}>
                        {comm?.name || wp?.communityId || "—"}
                      </td>
                      {/* Date */}
                      <td style={{ padding: "0.9rem 1rem", color: "#475569", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                        {formatDate(rpt.resolvedAt)}
                      </td>
                      {/* Amount */}
                      <td style={{ padding: "0.9rem 1rem", fontSize: "0.925rem" }}>
                        {isPaid ? (
                          <span style={{ fontWeight: 800, color: "#166534" }}>{formatUGX(rpt.costUGX)}</span>
                        ) : (
                          <div>
                            <div style={{ fontWeight: 800, color: "#b45309" }}>{formatUGX(rpt.costUGX)}</div>
                            <div style={{ fontSize: "0.72rem", color: "#d97706", fontWeight: 600 }}>Awaiting disbursement</div>
                          </div>
                        )}
                      </td>
                      {/* Payment status */}
                      <td style={{ padding: "0.9rem 1rem" }}>
                        {isPaid ? (
                          <div>
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: "0.3rem",
                              padding: "0.25rem 0.65rem", borderRadius: "20px",
                              background: "#dcfce7", border: "1px solid #86efac",
                              fontSize: "0.75rem", fontWeight: 700, color: "#166534"
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%",
                                background: "#16a34a", flexShrink: 0 }} />
                              Paid via Mobile Money
                            </span>
                            {payRef && (
                              <div style={{ fontSize: "0.7rem", color: "#64748b",
                                marginTop: "0.2rem", fontFamily: "monospace" }}>
                                Ref: {payRef}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: "0.3rem",
                              padding: "0.25rem 0.65rem", borderRadius: "20px",
                              background: "#fef3c7", border: "1px solid #fde68a",
                              fontSize: "0.75rem", fontWeight: 700, color: "#92400e"
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%",
                                background: "#f59e0b", flexShrink: 0 }} />
                              Awaiting officer payment
                            </span>
                            <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
                              <a
                                href={`https://wa.me/256765924113?text=${encodeURIComponent(
                                  `Hello Officer Mohamed Abdi, repair job ${rpt._id} (${wp?.type?.replace(/_/g, " ") || "water point"}) is complete. The agreed cost is ${formatUGX(rpt.costUGX)}. Please send payment to my phone.`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: "0.2rem",
                                  padding: "0.2rem 0.5rem", borderRadius: "4px",
                                  background: "#16a34a", color: "#fff",
                                  fontSize: "0.72rem", fontWeight: 700, textDecoration: "none"
                                }}
                              >
                                WhatsApp Officer to Pay
                              </a>
                              <a
                                href="tel:+256765924113"
                                style={{
                                  display: "inline-flex", alignItems: "center",
                                  padding: "0.2rem 0.5rem", borderRadius: "4px",
                                  background: "#0284c7", color: "#fff",
                                  fontSize: "0.72rem", fontWeight: 700, textDecoration: "none"
                                }}
                              >
                                Call
                              </a>
                            </div>
                          </div>
                        )}
                      </td>
                      {/* Notes */}
                      <td style={{ padding: "0.9rem 1rem", fontSize: "0.8rem",
                        color: "#94a3b8", fontStyle: "italic", maxWidth: "180px" }}>
                        {rpt.notes
                          ? rpt.notes.replace(/\s*\|\s*Payment ref:.*$/, "").trim() || "—"
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Payment guide for technician ── */}
        <div style={{
          padding: "1rem 1.25rem",
          borderTop: "1px solid #f1f5f9",
          background: "#f8fafc",
          fontSize: "0.8rem", color: "#64748b", lineHeight: 1.6
        }}>
          <strong style={{ color: "#0c4a6e" }}>How payment works (3 steps):</strong>
          <ol style={{ marginTop: "0.4rem", paddingLeft: "1.2rem" }}>
            <li>
              <strong style={{ color: "#0c4a6e" }}>Agree a price first.</strong>{" "}
              Open the <em>Job Chat</em> on your assigned job and discuss the repair cost with the
              District Officer. Once you both agree, submit a formal <strong>Price Quote</strong>
              from the chat panel — this unlocks the <em>Start Work</em> button.
            </li>
            <li style={{ marginTop: "0.3rem" }}>
              <strong style={{ color: "#0c4a6e" }}>Do the repair.</strong>{" "}
              Click <em>Start Work</em>, complete the repair, then click{" "}
              <em>Mark repaired &amp; notify officer</em>. The system automatically sends the
              District Officer a notification with your name and the agreed cost.
            </li>
            <li style={{ marginTop: "0.3rem" }}>
              <strong style={{ color: "#0c4a6e" }}>Receive Mobile Money payment.</strong>{" "}
              The officer reviews the notification, then disburses payment via{" "}
              <strong>MTN Mobile Money</strong> or <strong>Airtel Money</strong> to your registered
              phone number. Once paid, the job shows{" "}
              <strong style={{ color: "#166534" }}>Paid via Mobile Money</strong>. Contact the
              officer if a completed job still shows{" "}
              <strong style={{ color: "#92400e" }}>Awaiting payment</strong>.
            </li>
          </ol>
        </div>
      </div>

      {resolvingReport && (
        <MarkRepairedModal
          report={resolvingReport}
          onClose={() => setResolvingReport(null)}
          onResolved={(result) => {
            addToast(`Report ${resolvingReport._id} resolved! Water point ${result.waterPoint._id} restored to working.`, "success");
            setResolvingReport(null);
            loadTechnicianData();
          }}
        />
      )}
    </div>
  );
}

export default TechnicianDashboard;

