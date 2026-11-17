// frontend/src/pages/dashboards/OfficerDashboard.jsx
//
// District Officer dashboard — one job: keep water points working.
//
// Four views (passed as the `view` prop from App.jsx routing):
//   overview      — broken points summary + urgent alerts
//   queue         — repair queue: assign techs, track jobs, approve payment
//   water-points  — all water points with community breakdown
//   reports       — costs, averages, CSV downloads

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { StatusBadge } from "../../components/StatusBadge";
import { AssignTechnicianModal } from "../../components/AssignTechnicianModal";
import { MarkRepairedModal } from "../../components/MarkRepairedModal";
import { WhatsAppIcon } from "../../components/WhatsAppIcon";
import { formatDate, formatReportAge, formatUGX } from "../../utils/formatters";
import { callLink, whatsappLink, formatPhoneDisplay } from "../../utils/phoneUtils";
import { JobChatPanel } from "../../components/JobChatPanel";

// ── Priority helpers ───────────────────────────────────────────────────────────
function severityWeight(s) { return s === "high" ? 3 : s === "medium" ? 2 : 1; }

function calcPriority(report, householdsServed) {
  const ageDays = Math.floor((Date.now() - new Date(report.reportedAt)) / 86_400_000);
  return severityWeight(report.severity) * (householdsServed || 50) + ageDays * 25;
}

// SLA overdue check: high severity > 24 h unassigned; medium > 72 h
function slaStatus(report) {
  if (report.status !== "open") return "normal";
  const hrs = (Date.now() - new Date(report.reportedAt)) / 3_600_000;
  if (report.severity === "high"   && hrs > 24) return "overdue";
  if (report.severity === "medium" && hrs > 72) return "warning";
  return "normal";
}

// ── Status step labels for the 4-step timeline ───────────────────────────────
const STEPS = [
  { key: "open",        label: "Problem reported"       },
  { key: "assigned",    label: "Technician assigned"    },
  { key: "in_progress", label: "Work started"           },
  { key: "resolved",    label: "Repair done — awaiting officer payment" }
];
const STEP_ORDER = ["open", "assigned", "in_progress", "resolved"];

function stepDone(reportStatus, stepKey) {
  return STEP_ORDER.indexOf(reportStatus) >= STEP_ORDER.indexOf(stepKey);
}

// ── Component ─────────────────────────────────────────────────────────────────
export function OfficerDashboard({ view = "overview" }) {
  const navigate = useNavigate();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [loading,            setLoading]            = useState(true);
  const [error,              setError]              = useState(null);
  const [reports,            setReports]            = useState([]);
  const [waterPoints,        setWaterPoints]        = useState([]);
  const [communities,        setCommunities]        = useState([]);
  const [summary,            setSummary]            = useState(null);
  const [brokenByCommunity,  setBrokenByCommunity]  = useState([]);
  const [timeStats,          setTimeStats]          = useState(null);
  const [costByType,         setCostByType]         = useState([]);
  const [serviceBacklog,     setServiceBacklog]     = useState([]);
  const [techWorkload,       setTechWorkload]       = useState([]);

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [assigningReport,  setAssigningReport]  = useState(null); // report object
  const [resolvingReport,  setResolvingReport]  = useState(null); // report object
  const [historyReport,    setHistoryReport]    = useState(null); // report object

  // ── Queue filters ──────────────────────────────────────────────────────────
  const [queueFilter, setQueueFilter] = useState("active");
  const [queueSearch, setQueueSearch] = useState("");

  // Track which job has the in-system chat panel open (Officer side)
  const [openChatId, setOpenChatId] = useState(null);

  // Track read message counts per job so notifications disappear once opened/read
  const [readCounts, setReadCounts] = useState(() => {
    try {
      const saved = localStorage.getItem("water_tracker_read_chat_officer");
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
        localStorage.setItem("water_tracker_read_chat_officer", JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });

    // Dismiss any pending in-app notifications for this job
    api.getNotifications().then(notifs => {
      (notifs || []).filter(n => n.reportId === reportId && !n.read).forEach(n => {
        api.markNotificationRead(n._id).catch(() => {});
      });
    }).catch(() => {});
  }, []);

  const handleToggleChat = (reportId, totalMessages) => {
    if (openChatId === reportId) {
      setOpenChatId(null);
    } else {
      setOpenChatId(reportId);
      markJobChatRead(reportId, totalMessages);
    }
  };

  // ── Water point filters ────────────────────────────────────────────────────
  const [wpCommunity, setWpCommunity] = useState("");
  const [wpStatus,    setWpStatus]    = useState("");

  // ── Export state ───────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);

  // ── Load all data in parallel ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [
        summaryData, reportsData, wpData, commsData,
        commData, timeData, costData, backlogData, workloadData
      ] = await Promise.all([
        api.getSummary(),
        api.getReports(),
        api.getWaterPoints(),
        api.getCommunities(),
        api.getBrokenByCommunity(),
        api.getStatsMtaMttr(),
        api.getStatsCostByType(),
        api.getServiceBacklog(),
        api.getTechnicianWorkload()
      ]);
      setSummary(summaryData);
      setReports(reportsData || []);
      setWaterPoints(wpData || []);
      setCommunities(commsData || []);
      setBrokenByCommunity(commData || []);
      setTimeStats(timeData);
      setCostByType(costData || []);
      setServiceBacklog(backlogData || []);
      setTechWorkload(workloadData || []);
    } catch (err) {
      setError("Could not load district data. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Escape key closes any open modal ──────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (e.key !== "Escape") return;
      if (assigningReport) setAssigningReport(null);
      if (resolvingReport) setResolvingReport(null);
      if (historyReport)   setHistoryReport(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [assigningReport, resolvingReport, historyReport]);

  // ── Derived lookups ────────────────────────────────────────────────────────
  const wpMap   = useMemo(() => Object.fromEntries(waterPoints.map(w => [w._id, w])), [waterPoints]);
  const commMap = useMemo(() => Object.fromEntries(communities.map(c => [c._id, c.name])), [communities]);

  // Reports enriched with computed fields
  const enriched = useMemo(() => reports.map(r => {
    const wp      = wpMap[r.waterPointId] || {};
    const ageDays = Math.floor((Date.now() - new Date(r.reportedAt)) / 86_400_000);
    return {
      ...r,
      waterPoint:    wp,
      communityName: commMap[wp.communityId] || "Unknown",
      priorityScore: calcPriority(r, wp.householdsServed),
      ageDays,
      sla:           slaStatus(r)
    };
  }), [reports, wpMap, commMap]);

  // Repair queue (non-resolved active jobs + optional all)
  const queueReports = useMemo(() => {
    return enriched
      .filter(r => {
        if (queueFilter === "active")   return r.status !== "resolved";
        if (queueFilter === "open")     return r.status === "open";
        if (queueFilter === "assigned") return r.status === "assigned" || r.status === "in_progress";
        if (queueFilter === "resolved") return r.status === "resolved";
        return true; // "all"
      })
      .filter(r => {
        if (!queueSearch.trim()) return true;
        const q = queueSearch.toLowerCase();
        return (
          (r.communityName || "").toLowerCase().includes(q) ||
          (r.waterPoint?.landmark || "").toLowerCase().includes(q) ||
          (r.problem || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);
  }, [enriched, queueFilter, queueSearch]);

  // Water points with filters
  const filteredWPs = useMemo(() => waterPoints.filter(w => {
    if (wpCommunity && w.communityId !== wpCommunity) return false;
    if (wpStatus    && w.status      !== wpStatus)    return false;
    return true;
  }), [waterPoints, wpCommunity, wpStatus]);

  // Summary counts
  const broken    = summary?.waterPoints?.broken   ?? 0;
  const lowWater  = summary?.waterPoints?.low_yield ?? 0;
  const waiting   = enriched.filter(r => r.status === "open").length;
  const affected  = summary?.affectedHouseholds ?? 0;
  const overdue   = enriched.filter(r => r.sla === "overdue" || r.sla === "warning").length;

  // Highest-priority unassigned report for the alert banner
  const topUrgent = useMemo(() => {
    const unassigned = enriched.filter(r => r.status === "open");
    if (!unassigned.length) return null;
    return unassigned.reduce((best, r) => r.priorityScore > best.priorityScore ? r : best, unassigned[0]);
  }, [enriched]);

  // CSV export
  const handleExport = async (type) => {
    try {
      setExporting(true);
      const endpoint = type === "reports"
        ? "/api/stats/export/reports.csv"
        : "/api/stats/export/water-points.csv";
      const filename = type === "reports" ? "water_repairs.csv" : "water_points.csv";
      const res  = await fetch(endpoint, { credentials: "include" });
      if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Export failed: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  // ── Loading / error ────────────────────────────────────────────────────────
  if (loading) return (
    <div className="loading-indicator">
      <div className="spinner" />
      <span>Loading district data…</span>
    </div>
  );

  if (error) return (
    <div className="alert alert-error" role="alert">
      <strong>Something went wrong:</strong> {error}
      <div style={{ marginTop: "0.75rem" }}>
        <button onClick={loadData} className="btn btn-outline" style={{ minHeight: "44px" }}>
          Try again
        </button>
      </div>
    </div>
  );

  // ── Navigation tab bar — handled by Navbar, no duplicate needed ──────────
  return (
    <div>

      {/* ════════════════════════════════════════════════════════════════════
          VIEW 1 — OVERVIEW
          Four summary cards + urgent alert + top 5 by priority
          ════════════════════════════════════════════════════════════════════ */}
      {view === "overview" && (
        <div>
          {/* ── Summary cards — gradient style matching analytics ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "1rem",
            marginBottom: "1.5rem"
          }}>
            {/* Broken */}
            <div style={{
              background: "linear-gradient(135deg, #991b1b 0%, #dc2626 100%)",
              borderRadius: "14px", padding: "1.5rem",
              color: "#fff", boxShadow: "0 4px 20px rgba(220,38,38,0.25)"
            }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", opacity: 0.75, marginBottom: "0.75rem" }}>
                Broken
              </div>
              <div style={{ fontSize: "2.75rem", fontWeight: 800, lineHeight: 1 }}>{broken}</div>
              <div style={{ fontSize: "0.78rem", opacity: 0.7, marginTop: "0.5rem" }}>water points</div>
            </div>

            {/* Low water */}
            <div style={{
              background: "linear-gradient(135deg, #92400e 0%, #d97706 100%)",
              borderRadius: "14px", padding: "1.5rem",
              color: "#fff", boxShadow: "0 4px 20px rgba(217,119,6,0.25)"
            }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", opacity: 0.75, marginBottom: "0.75rem" }}>
                Low water
              </div>
              <div style={{ fontSize: "2.75rem", fontWeight: 800, lineHeight: 1 }}>{lowWater}</div>
              <div style={{ fontSize: "0.78rem", opacity: 0.7, marginTop: "0.5rem" }}>water points</div>
            </div>

            {/* Pending assignment */}
            <div style={{
              background: "linear-gradient(135deg, #b45309 0%, #f59e0b 100%)",
              borderRadius: "14px", padding: "1.5rem",
              color: "#fff", boxShadow: "0 4px 20px rgba(245,158,11,0.25)"
            }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", opacity: 0.75, marginBottom: "0.75rem" }}>
                Pending assignment
              </div>
              <div style={{ fontSize: "2.75rem", fontWeight: 800, lineHeight: 1 }}>{waiting}</div>
              <div style={{ fontSize: "0.78rem", opacity: 0.7, marginTop: "0.5rem" }}>waiting for a technician</div>
            </div>

            {/* Households affected */}
            <div style={{
              background: "linear-gradient(135deg, #4338ca 0%, #6366f1 100%)",
              borderRadius: "14px", padding: "1.5rem",
              color: "#fff", boxShadow: "0 4px 20px rgba(99,102,241,0.25)"
            }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", opacity: 0.75, marginBottom: "0.75rem" }}>
                Households affected
              </div>
              <div style={{ fontSize: "2.75rem", fontWeight: 800, lineHeight: 1 }}>{affected}</div>
              <div style={{ fontSize: "0.78rem", opacity: 0.7, marginTop: "0.5rem" }}>across all communities</div>
            </div>
          </div>

          {/* Overdue alert banner */}
          {overdue > 0 && (
            <div role="alert" style={{
              padding: "1rem 1.25rem", marginBottom: "1.1rem",
              background: "#fef2f2", border: "1px solid #fecaca",
              borderLeft: "5px solid #dc2626",
              borderRadius: "10px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: "0.75rem"
            }}>
              <div>
                <div style={{ fontWeight: 700, color: "#991b1b", fontSize: "0.95rem" }}>
                  {overdue} {overdue === 1 ? "repair has" : "repairs have"} passed the expected time
                </div>
                <div style={{ fontSize: "0.825rem", color: "#7f1d1d", marginTop: "0.2rem" }}>
                  High-severity jobs should have a technician within 24 hours.
                </div>
              </div>
              <button
                onClick={() => navigate("/officer/queue")}
                style={{
                  minHeight: "44px", padding: "0.5rem 1.25rem",
                  background: "#dc2626", color: "#fff",
                  border: "none", borderRadius: "8px",
                  fontWeight: 700, fontSize: "0.875rem", cursor: "pointer",
                  whiteSpace: "nowrap"
                }}
              >
                Review delayed jobs
              </button>
            </div>
          )}

          {/* Highest-priority unassigned */}
          {topUrgent && (
            <div style={{
              padding: "1rem 1.1rem", marginBottom: "1.1rem",
              background: "#fff7ed", border: "1px solid #fed7aa",
              borderLeft: "5px solid #f97316", borderRadius: "var(--radius-sm)",
              display: "flex", alignItems: "flex-start", justifyContent: "space-between",
              flexWrap: "wrap", gap: "0.75rem"
            }}>
              <div>
                <div style={{ fontWeight: 700, color: "#9a3412", marginBottom: "0.25rem" }}>
                  Needs a technician now
                </div>
                <div style={{ fontSize: "0.875rem", color: "#7c2d12" }}>
                  <strong style={{ textTransform: "capitalize" }}>
                    {topUrgent.waterPoint?.type?.replace(/_/g, " ")}
                  </strong>{" "}
                  — {topUrgent.waterPoint?.landmark}, {topUrgent.communityName}.
                  Waiting {topUrgent.ageDays} {topUrgent.ageDays === 1 ? "day" : "days"}.
                </div>
                <div style={{ fontSize: "0.8rem", color: "#92400e", marginTop: "0.2rem" }}>
                  Problem: {topUrgent.problem}
                </div>
              </div>
              <button
                onClick={() => setAssigningReport(topUrgent)}
                className="btn btn-primary"
                style={{ minHeight: "44px" }}
              >
                Choose a technician
              </button>
            </div>
          )}

          {/* Top 5 priority list */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: "0.75rem" }}>
              Needs attention first
            </div>
            {enriched.filter(r => r.status !== "resolved").length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-text">No open repairs right now.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {[...enriched]
                  .filter(r => r.status !== "resolved")
                  .sort((a, b) => b.priorityScore - a.priorityScore)
                  .slice(0, 5)
                  .map((r, i) => (
                    <div key={r._id} style={{
                      display: "flex", alignItems: "flex-start",
                      justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem",
                      padding: "0.85rem", borderRadius: "var(--radius-sm)",
                      background: "var(--bg-app)", border: "1px solid var(--border-light)",
                      borderLeft: r.sla === "overdue"
                        ? "4px solid var(--status-broken-text)"
                        : r.sla === "warning"
                        ? "4px solid var(--status-low-text)"
                        : "4px solid var(--border-light)"
                    }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", flex: 1, minWidth: 0 }}>
                        <span style={{
                          minWidth: 28, height: 28, lineHeight: "28px", textAlign: "center",
                          borderRadius: "50%", flexShrink: 0,
                          background: i === 0 ? "var(--status-broken-text)" : "var(--primary-600)",
                          color: "#fff", fontWeight: 800, fontSize: "0.875rem"
                        }}>{i + 1}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: "0.95rem", textTransform: "capitalize" }}>
                            {r.waterPoint?.type?.replace(/_/g, " ")} — {r.waterPoint?.landmark}, {r.communityName}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                            {r.problem} · {r.ageDays} {r.ageDays === 1 ? "day" : "days"} ago
                          </div>
                          {r.sla !== "normal" && (
                            <span style={{
                              display: "inline-block", marginTop: "0.3rem",
                              fontSize: "0.75rem", padding: "0.15rem 0.5rem",
                              background: r.sla === "overdue" ? "#fee2e2" : "#fef3c7",
                              color:      r.sla === "overdue" ? "#991b1b" : "#92400e",
                              borderRadius: "20px", fontWeight: 700
                            }}>
                              Waiting too long
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", flexShrink: 0 }}>
                        <StatusBadge status={r.severity} />
                        <StatusBadge status={r.status} />
                        {r.status === "open" && (
                          <button onClick={() => setAssigningReport(r)} className="btn btn-primary"
                            style={{ minHeight: "36px", padding: "0.3rem 0.75rem", fontSize: "0.8rem" }}>
                            Assign
                          </button>
                        )}
                        {(r.status === "assigned" || r.status === "in_progress") && (
                          <button onClick={() => setResolvingReport(r)} className="btn btn-outline"
                            style={{ minHeight: "36px", padding: "0.3rem 0.75rem", fontSize: "0.8rem" }}>
                            Mark fixed
                          </button>
                        )}
                        {r.status === "resolved" && !r.paid && !(r.notes || "").includes("Payment ref:") && (
                          <button onClick={() => setResolvingReport(r)} className="btn btn-warning"
                            style={{ minHeight: "36px", padding: "0.3rem 0.75rem", fontSize: "0.8rem", background: "#d97706", color: "#fff", borderColor: "#d97706" }}>
                            Disburse payment
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          VIEW 2 — REPAIR QUEUE
          Every active repair job with timeline tracking and payment approval
          ════════════════════════════════════════════════════════════════════ */}
      {view === "queue" && (
        <div>
          {/* Filters */}
          <div className="card" style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
              {[
                { key: "active",   label: "Active repairs" },
                { key: "open",     label: "Waiting for technician" },
                { key: "assigned", label: "In progress" },
                { key: "resolved", label: "Completed" },
                { key: "all",      label: "All" }
              ].map(f => (
                <button key={f.key}
                  onClick={() => setQueueFilter(f.key)}
                  style={{
                    minHeight: "38px", padding: "0.35rem 1rem",
                    fontSize: "0.82rem", fontWeight: 700,
                    borderRadius: "20px", border: "none", cursor: "pointer",
                    transition: "all 0.15s ease",
                    background: queueFilter === f.key
                      ? "linear-gradient(135deg,#0369a1 0%,#0284c7 100%)"
                      : "#f1f5f9",
                    color: queueFilter === f.key ? "#fff" : "#475569",
                    boxShadow: queueFilter === f.key
                      ? "0 4px 12px rgba(2,132,199,0.35)" : "none"
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              type="search"
              placeholder="Search by location, community, or problem…"
              value={queueSearch}
              onChange={e => setQueueSearch(e.target.value)}
              className="form-control"
              style={{ fontSize: "0.875rem" }}
              aria-label="Search repair queue"
            />
          </div>

          {queueReports.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-text">No repairs match this filter.</div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {queueReports.map(r => {
                const wp   = r.waterPoint || {};
                const type = wp.type?.replace(/_/g, " ") || "Water point";
                const land = wp.landmark || "Unknown location";
                // Find assigned technician from workload data
                const assignedTech = r.assignedTo
                  ? techWorkload.find(t => t._id === r.assignedTo)
                  : null;

                // Payment disbursement status
                const refMatch = (r.notes || "").match(/Payment ref:\s*([A-Z0-9\-]+)/);
                const payRef   = r.paymentRef || (refMatch ? refMatch[1] : null);
                const isPaid   = Boolean(r.paid || payRef);

                // Accent colour per SLA / status
                const accentColor = r.sla === "overdue"
                  ? "#dc2626"
                  : r.sla === "warning"
                  ? "#d97706"
                  : r.status === "resolved"
                  ? "#15803d"
                  : "#0284c7";

                return (
                  <div key={r._id} style={{
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    overflow: "hidden",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
                    marginBottom: 0
                  }}>
                    {/* ── Coloured top accent bar (replaces left border) ── */}
                    <div style={{
                      height: "4px",
                      background: r.sla === "overdue"
                        ? "linear-gradient(90deg,#991b1b,#dc2626)"
                        : r.sla === "warning"
                        ? "linear-gradient(90deg,#92400e,#d97706)"
                        : r.status === "resolved"
                        ? "linear-gradient(90deg,#065f46,#15803d)"
                        : "linear-gradient(90deg,#0369a1,#0284c7)"
                    }} />

                    <div style={{ padding: "1.1rem 1.25rem" }}>
                      {/* ── Job header ── */}
                      <div style={{
                        display: "flex", alignItems: "flex-start",
                        justifyContent: "space-between", flexWrap: "wrap", gap: "0.6rem",
                        marginBottom: "0.85rem"
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontWeight: 800, fontSize: "1.05rem", textTransform: "capitalize",
                            color: "#0f172a", letterSpacing: "-0.01em"
                          }}>
                            {type} — {land}
                          </div>
                          <div style={{ fontSize: "0.825rem", color: "#64748b", marginTop: "0.2rem" }}>
                            {r.communityName} · Reported {r.ageDays === 0 ? "today" : `${r.ageDays} ${r.ageDays === 1 ? "day" : "days"} ago`}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
                          <StatusBadge status={r.severity} />
                          <StatusBadge status={r.status} />
                          {r.sla !== "normal" && (
                            <span style={{
                              fontSize: "0.72rem", padding: "0.2rem 0.55rem",
                              background: "#fee2e2", color: "#991b1b",
                              borderRadius: "4px", fontWeight: 800,
                              letterSpacing: "0.02em", textTransform: "uppercase"
                            }}>
                              Overdue
                            </span>
                          )}
                        </div>
                      </div>

                      {/* ── Problem description ── */}
                      <div style={{
                        padding: "0.65rem 1rem",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        marginBottom: "1rem",
                        fontSize: "0.875rem",
                        lineHeight: 1.55
                      }}>
                        <strong style={{ color: "#0f172a" }}>Problem:</strong>{" "}
                        <span style={{ color: "#334155" }}>{r.problem}</span>
                        {r.reportedBy?.name && (
                          <span style={{ color: "#94a3b8", marginLeft: "0.5rem" }}>
                            — reported by {r.reportedBy.name}
                          </span>
                        )}
                      </div>

                      {/* ── Assigned technician contact ── */}
                      {assignedTech && (
                        <div style={{
                          padding: "0.85rem 1rem",
                          background: "#f0f9ff",
                          border: "1px solid #bae6fd",
                          borderRadius: "8px",
                          marginBottom: "1rem"
                        }}>
                          <div style={{
                            display: "flex", alignItems: "center",
                            justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem"
                          }}>
                            <div>
                              <div style={{
                                fontSize: "0.68rem", fontWeight: 800, color: "#64748b",
                                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.3rem"
                              }}>
                                Assigned Technician
                              </div>
                              <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0c4a6e" }}>
                                {assignedTech.name}
                              </div>
                              <div style={{ fontSize: "0.85rem", color: "#0369a1", marginTop: "0.1rem", fontWeight: 600 }}>
                                {formatPhoneDisplay(assignedTech.phone)}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                              <a
                                href={callLink(assignedTech.phone)}
                                style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  padding: "0.45rem 1rem", borderRadius: "6px",
                                  background: "#fff", color: "#1d4ed8",
                                  border: "2px solid #93c5fd",
                                  fontSize: "0.8rem", fontWeight: 700, textDecoration: "none",
                                  minHeight: "38px", whiteSpace: "nowrap"
                                }}
                                aria-label={`Call ${assignedTech.name}`}
                              >
                                Call
                              </a>
                              <a
                                href={whatsappLink(
                                  assignedTech.phone,
                                  `Hello ${assignedTech.name}, please give me a progress update on the repair at ${land}, ${r.communityName}.`
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  gap: "0.35rem",
                                  padding: "0.45rem 1rem", borderRadius: "6px",
                                  background: "linear-gradient(135deg,#15803d,#16a34a)",
                                  color: "#fff", border: "none",
                                  fontSize: "0.8rem", fontWeight: 700, textDecoration: "none",
                                  minHeight: "38px", whiteSpace: "nowrap",
                                  boxShadow: "0 2px 6px rgba(22,163,74,0.3)"
                                }}
                                aria-label={`WhatsApp message to ${assignedTech.name}`}
                              >
                                <WhatsAppIcon size={14} />
                                WhatsApp chat
                              </a>
                              <a
                                href={whatsappLink(assignedTech.phone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  gap: "0.35rem",
                                  padding: "0.45rem 1rem", borderRadius: "6px",
                                  background: "linear-gradient(135deg,#065f46,#059669)",
                                  color: "#fff", border: "none",
                                  fontSize: "0.8rem", fontWeight: 700, textDecoration: "none",
                                  minHeight: "38px", whiteSpace: "nowrap",
                                  boxShadow: "0 2px 6px rgba(5,150,105,0.3)"
                                }}
                                aria-label={`WhatsApp call ${assignedTech.name}`}
                                title="Opens WhatsApp — start a voice or video call from there"
                              >
                                <WhatsAppIcon size={14} />
                                WhatsApp call
                              </a>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ── 4-step repair timeline ── */}
                      <div style={{ marginBottom: "1rem" }}>
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, 1fr)",
                          gap: "0",
                          position: "relative"
                        }}>
                          {STEPS.map((step, idx) => {
                            const done = stepDone(r.status, step.key);
                            const hist = r.statusHistory?.find(h => h.status === step.key);
                            return (
                              <div key={step.key} style={{ textAlign: "center", position: "relative" }}>
                                {/* Connector line */}
                                {idx > 0 && (
                                  <div style={{
                                    position: "absolute", top: "17px", right: "50%", left: "-50%",
                                    height: "3px", zIndex: 0,
                                    background: done
                                      ? `linear-gradient(90deg, ${accentColor}, ${accentColor})`
                                      : "#e2e8f0"
                                  }} />
                                )}
                                {/* Step circle */}
                                <div style={{
                                  width: 34, height: 34, borderRadius: "50%", margin: "0 auto 0.4rem",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: done ? "1rem" : "0.8rem",
                                  fontWeight: 800, zIndex: 1, position: "relative",
                                  background: done
                                    ? accentColor
                                    : "#f1f5f9",
                                  color: done ? "#fff" : "#94a3b8",
                                  border: done ? "none" : "2px solid #e2e8f0",
                                  boxShadow: done ? `0 2px 8px ${accentColor}55` : "none"
                                }}>
                                  {done ? "✓" : idx + 1}
                                </div>
                                <div style={{
                                  fontSize: "0.72rem", fontWeight: done ? 700 : 400,
                                  color: done ? "#0f172a" : "#94a3b8",
                                  lineHeight: 1.35
                                }}>
                                  {step.label}
                                </div>
                                {hist?.at && (
                                  <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: "0.15rem" }}>
                                    {formatDate(hist.at)}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* ── In-system Job Chat Panel (Officer side) ── */}
                      {/* Officer uses this to negotiate price with technician before work starts */}
                      <div style={{ marginBottom: "1rem" }}>
                        {(() => {
                          const totalMsgs = r.messages?.length || 0;
                          const readCount = readCounts[r._id] || 0;
                          const isChatOpen = openChatId === r._id;
                          const unreadCount = isChatOpen ? 0 : Math.max(0, totalMsgs - readCount);

                          return (
                            <button
                              onClick={() => handleToggleChat(r._id, totalMsgs)}
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

                              <span>{isChatOpen ? "Close Job Chat" : "Open Job Chat with Technician"}</span>

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

                              {r.quoteApproved ? (
                                <span style={{
                                  padding: "0.15rem 0.55rem", borderRadius: "4px",
                                  background: "#dcfce7", color: "#15803d",
                                  border: "1px solid #86efac", fontSize: "0.7rem", fontWeight: 700
                                }}>
                                  Quote Authorized: UGX {Number(r.quotedCostUGX).toLocaleString()}
                                </span>
                              ) : r.quotedCostUGX ? (
                                <span style={{
                                  padding: "0.15rem 0.55rem", borderRadius: "4px",
                                  background: "#fef3c7", color: "#92400e",
                                  border: "1px solid #fde68a", fontSize: "0.7rem", fontWeight: 700
                                }}>
                                  Review Required: UGX {Number(r.quotedCostUGX).toLocaleString()}
                                </span>
                              ) : (
                                <span style={{
                                  padding: "0.15rem 0.55rem", borderRadius: "4px",
                                  background: "#f8fafc", color: "#64748b",
                                  border: "1px solid #e2e8f0", fontSize: "0.7rem", fontWeight: 600
                                }}>
                                  No quote yet
                                </span>
                              )}
                            </button>
                          );
                        })()}
                        {openChatId === r._id && (
                          <JobChatPanel
                            report={r}
                            onMessagesRead={(count) => markJobChatRead(r._id, count)}
                            onQuoteApproved={(updatedReport) => {
                              setReports(prev => prev.map(rep => rep._id === updatedReport._id ? updatedReport : rep));
                            }}
                          />
                        )}
                      </div>

                      {/* ── Payment status (resolved jobs) ── */}
                      {r.status === "resolved" && (
                        isPaid ? (
                          /* ✅ Officer has already disbursed payment */
                          <div style={{
                            padding: "0.7rem 1rem",
                            background: "linear-gradient(135deg,#f0fdf4,#dcfce7)",
                            border: "1px solid #86efac",
                            borderRadius: "8px", marginBottom: "1rem",
                            fontSize: "0.875rem"
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <span style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  width: 24, height: 24, borderRadius: "50%",
                                  background: "#15803d", color: "#fff", fontSize: "0.75rem", fontWeight: 800
                                }}>✓</span>
                                <span style={{ fontWeight: 800, color: "#15803d" }}>Payment disbursed via Mobile Money</span>
                                {r.costUGX != null && (
                                  <span style={{ fontWeight: 700, color: "#166534" }}>
                                    — {formatUGX(r.costUGX)}
                                  </span>
                                )}
                              </div>
                              {r.resolvedAt && (
                                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                                  Fixed {formatDate(r.resolvedAt)}
                                </span>
                              )}
                            </div>
                            {payRef && (
                              <div style={{ marginTop: "0.3rem", fontSize: "0.78rem", color: "#64748b", fontFamily: "monospace" }}>
                                Ref: {payRef}
                              </div>
                            )}
                          </div>
                        ) : (
                          /* ⏳ Technician finished — payment not yet sent */
                          <div style={{
                            padding: "0.7rem 1rem",
                            background: "linear-gradient(135deg,#fffbeb,#fef3c7)",
                            border: "1px solid #fde68a",
                            borderLeft: "4px solid #d97706",
                            borderRadius: "8px", marginBottom: "1rem",
                            fontSize: "0.875rem"
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <span style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  width: 24, height: 24, borderRadius: "50%",
                                  background: "#d97706", color: "#fff", fontSize: "0.85rem", fontWeight: 800
                                }}>⏳</span>
                                <div>
                                  <div style={{ fontWeight: 800, color: "#92400e" }}>
                                    Repair finished — Payment pending
                                  </div>
                                  {r.costUGX != null && (
                                    <div style={{ fontSize: "0.8rem", color: "#b45309", fontWeight: 600 }}>
                                      Agreed cost: {formatUGX(r.costUGX)}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {r.resolvedAt && (
                                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                                  Fixed {formatDate(r.resolvedAt)}
                                </span>
                              )}
                            </div>
                            <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#78350f" }}>
                              The technician is waiting for you to send payment via Mobile Money.
                            </div>
                          </div>
                        )
                      )}

                      {/* ── Action buttons ── */}
                      <div style={{
                        display: "flex", gap: "0.5rem", flexWrap: "wrap",
                        paddingTop: "0.75rem",
                        borderTop: "1px solid #f1f5f9"
                      }}>
                        {r.status === "open" && (
                          <button onClick={() => setAssigningReport(r)} className="btn btn-primary"
                            style={{ minHeight: "44px" }}>
                            Choose a technician
                          </button>
                        )}
                        {(r.status === "assigned" || r.status === "in_progress") && (
                          <>
                            <button onClick={() => setAssigningReport(r)} className="btn btn-outline"
                              style={{ minHeight: "44px" }}>
                              Reassign technician
                            </button>
                            <button onClick={() => setResolvingReport(r)} className="btn btn-success"
                              style={{ minHeight: "44px", fontWeight: 800 }}>
                              Record repair & set payment amount
                            </button>
                          </>
                        )}
                        {/* Resolved & payment not yet sent — Officer pays technician */}
                        {r.status === "resolved" && !isPaid && (
                          <button
                            onClick={() => setResolvingReport(r)}
                            className="btn btn-primary"
                            style={{ minHeight: "44px", fontWeight: 700, background: "#d97706", borderColor: "#d97706" }}
                          >
                            Pay technician via Mobile Money
                          </button>
                        )}
                        {/* Resolved & paid — nothing more to do */}
                        {r.status === "resolved" && isPaid && (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: "0.4rem",
                            padding: "0.4rem 0.9rem", borderRadius: "8px",
                            background: "#f0fdf4", border: "1px solid #86efac",
                            fontSize: "0.82rem", fontWeight: 700, color: "#15803d"
                          }}>
                            ✓ Payment complete
                          </span>
                        )}
                        <button onClick={() => setHistoryReport(r)} className="btn btn-outline"
                          style={{ minHeight: "44px" }}>
                          Full history
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          VIEW 3 — WATER POINTS
          ════════════════════════════════════════════════════════════════════ */}
      {view === "water-points" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* ── Community breakdown ── */}
          <div style={{
            background: "#fff", borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            overflow: "hidden"
          }}>
            <div style={{
              padding: "1.1rem 1.25rem",
              borderBottom: "1px solid #f1f5f9"
            }}>
              <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0c4a6e", letterSpacing: "-0.01em" }}>
                Water points by community
              </div>
            </div>
            {brokenByCommunity.length === 0 ? (
              <div className="empty-state"><div className="empty-state-text">No community data available.</div></div>
            ) : (
              <div style={{ padding: "0.5rem 0" }}>
                {brokenByCommunity.map((c, idx) => {
                  const pct = c.totalWaterPoints > 0
                    ? Math.round((c.brokenCount / c.totalWaterPoints) * 100) : 0;
                  const barColor = pct > 50 ? "#dc2626" : pct > 0 ? "#d97706" : "#15803d";
                  return (
                    <div key={c.communityId} style={{
                      padding: "0.9rem 1.25rem",
                      borderBottom: idx < brokenByCommunity.length - 1 ? "1px solid #f8fafc" : "none"
                    }}>
                      <div style={{
                        display: "flex", justifyContent: "space-between",
                        alignItems: "center", flexWrap: "wrap", gap: "0.5rem",
                        marginBottom: "0.55rem"
                      }}>
                        <span style={{ fontWeight: 700, fontSize: "0.925rem", color: "#0f172a" }}>
                          {c.communityName}
                        </span>
                        <span style={{ fontSize: "0.825rem", color: "#64748b" }}>
                          <strong style={{ color: barColor }}>
                            {c.brokenCount} of {c.totalWaterPoints}
                          </strong> broken · {c.brokenHouseholds ?? c.affectedHouseholds} households affected
                        </span>
                      </div>
                      <div style={{ height: "6px", background: "#f1f5f9", borderRadius: "99px", overflow: "hidden" }}>
                        <div style={{
                          width: `${Math.max(pct, pct > 0 ? 4 : 0)}%`,
                          height: "100%",
                          background: pct === 0
                            ? "#15803d"
                            : `linear-gradient(90deg, ${barColor}cc, ${barColor})`,
                          borderRadius: "99px",
                          transition: "width 0.5s ease"
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Filter bar ── */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <select value={wpCommunity} onChange={e => setWpCommunity(e.target.value)}
              className="form-control" style={{ width: "auto", minHeight: "44px", fontSize: "0.875rem" }}>
              <option value="">All communities</option>
              {communities.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <select value={wpStatus} onChange={e => setWpStatus(e.target.value)}
              className="form-control" style={{ width: "auto", minHeight: "44px", fontSize: "0.875rem" }}>
              <option value="">All statuses</option>
              <option value="broken">Broken</option>
              <option value="low_yield">Low water</option>
              <option value="working">Working</option>
            </select>
            {(wpCommunity || wpStatus) && (
              <button onClick={() => { setWpCommunity(""); setWpStatus(""); }}
                className="btn btn-outline" style={{ minHeight: "44px", fontSize: "0.875rem" }}>
                Clear
              </button>
            )}
          </div>

          {/* ── Water points table ── */}
          <div style={{
            background: "#fff", borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            overflow: "hidden"
          }}>
            <div style={{ padding: "1.1rem 1.25rem", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0c4a6e", letterSpacing: "-0.01em" }}>
                All water points ({filteredWPs.length})
              </div>
            </div>
            {filteredWPs.length === 0 ? (
              <div className="empty-state"><div className="empty-state-text">No water points match this filter.</div></div>
            ) : (
              <div className="table-responsive">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }} className="officer-stacked-table">
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Location","Community","Type","Status","Households","Last serviced"].map(h => (
                        <th key={h} style={{
                          padding: "0.75rem 1rem", textAlign: "left",
                          fontSize: "0.72rem", fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: "0.06em",
                          color: "#64748b", borderBottom: "1px solid #e2e8f0"
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWPs.map((wp, idx) => (
                      <tr key={wp._id} style={{
                        borderBottom: idx < filteredWPs.length - 1 ? "1px solid #f8fafc" : "none"
                      }}>
                        <td data-label="Location" style={{ padding: "0.875rem 1rem", fontWeight: 700, color: "#0f172a" }}>
                          {wp.landmark}
                        </td>
                        <td data-label="Community" style={{ padding: "0.875rem 1rem", color: "#475569" }}>
                          {commMap[wp.communityId] || "Unknown"}
                        </td>
                        <td data-label="Type" style={{ padding: "0.875rem 1rem", textTransform: "capitalize", color: "#475569" }}>
                          {wp.type?.replace(/_/g, " ")}
                        </td>
                        <td data-label="Status" style={{ padding: "0.875rem 1rem" }}>
                          <StatusBadge status={wp.status} />
                        </td>
                        <td data-label="Households" style={{ padding: "0.875rem 1rem", color: "#475569" }}>
                          {wp.householdsServed}
                        </td>
                        <td data-label="Last serviced" style={{ padding: "0.875rem 1rem", fontSize: "0.825rem", color: "#94a3b8" }}>
                          {wp.lastServiced ? formatDate(wp.lastServiced) : "Never serviced"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Service backlog ── */}
          {serviceBacklog.length > 0 && (
            <div style={{
              background: "#fff", borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              overflow: "hidden"
            }}>
              <div style={{ padding: "1.1rem 1.25rem", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0c4a6e", letterSpacing: "-0.01em" }}>
                  Not serviced in the last 12 months ({serviceBacklog.length})
                </div>
              </div>
              <div className="table-responsive">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }} className="officer-stacked-table">
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Location","Community","Type","Installed","Households","Last serviced"].map(h => (
                        <th key={h} style={{
                          padding: "0.75rem 1rem", textAlign: "left",
                          fontSize: "0.72rem", fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: "0.06em",
                          color: "#64748b", borderBottom: "1px solid #e2e8f0"
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {serviceBacklog.map((wp, idx) => (
                      <tr key={wp._id} style={{
                        borderBottom: idx < serviceBacklog.length - 1 ? "1px solid #f8fafc" : "none"
                      }}>
                        <td data-label="Location" style={{ padding: "0.875rem 1rem", fontWeight: 700, color: "#0f172a" }}>
                          {wp.landmark}
                        </td>
                        <td data-label="Community" style={{ padding: "0.875rem 1rem", color: "#475569" }}>{wp.communityName}</td>
                        <td data-label="Type" style={{ padding: "0.875rem 1rem", textTransform: "capitalize", color: "#475569" }}>
                          {wp.type?.replace(/_/g, " ")}
                        </td>
                        <td data-label="Installed" style={{ padding: "0.875rem 1rem", color: "#475569" }}>{wp.installedYear}</td>
                        <td data-label="Households" style={{ padding: "0.875rem 1rem", color: "#475569" }}>{wp.householdsServed}</td>
                        <td data-label="Last serviced" style={{ padding: "0.875rem 1rem", fontSize: "0.825rem", color: "#94a3b8" }}>
                          {wp.lastServiced ? formatDate(wp.lastServiced) : "Never"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          VIEW 4 — REPORTS  (enterprise analytics)
          ════════════════════════════════════════════════════════════════════ */}
      {view === "reports" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* ── Section header ── */}
          <div style={{ borderBottom: "2px solid #f1f5f9", paddingBottom: "1rem" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0c4a6e", margin: 0 }}>
              District repair analytics
            </h2>
            <p style={{ fontSize: "0.875rem", color: "#64748b", marginTop: "0.25rem" }}>
              Performance summary based on all recorded repair activity in the district.
            </p>
          </div>

          {/* ── KPI metric cards ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem"
          }}>
            {/* Days to assign */}
            <div style={{
              background: "linear-gradient(135deg, #0c4a6e 0%, #0369a1 100%)",
              borderRadius: "14px", padding: "1.5rem",
              color: "#fff", boxShadow: "0 4px 20px rgba(3,105,161,0.25)"
            }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", opacity: 0.75, marginBottom: "0.75rem" }}>
                Avg. days to assign
              </div>
              {(timeStats?.mta?.sampleSize ?? 0) === 0 ? (
                <>
                  <div style={{ fontSize: "1.75rem", fontWeight: 800, opacity: 0.6 }}>—</div>
                  <div style={{ fontSize: "0.75rem", opacity: 0.65, marginTop: "0.4rem" }}>
                    No assignments recorded yet
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
                    <span style={{ fontSize: "2.75rem", fontWeight: 800, lineHeight: 1 }}>
                      {timeStats.mta.days}
                    </span>
                    <span style={{ fontSize: "1rem", opacity: 0.75 }}>days</span>
                  </div>
                  <div style={{ fontSize: "0.75rem", opacity: 0.65, marginTop: "0.5rem" }}>
                    From {timeStats.mta.sampleSize} {timeStats.mta.sampleSize === 1 ? "report" : "reports"}
                  </div>
                </>
              )}
            </div>

            {/* Days to fix */}
            <div style={{
              background: "linear-gradient(135deg, #065f46 0%, #059669 100%)",
              borderRadius: "14px", padding: "1.5rem",
              color: "#fff", boxShadow: "0 4px 20px rgba(5,150,105,0.25)"
            }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", opacity: 0.75, marginBottom: "0.75rem" }}>
                Avg. days to fix
              </div>
              {(timeStats?.mttr?.sampleSize ?? 0) === 0 ? (
                <>
                  <div style={{ fontSize: "1.75rem", fontWeight: 800, opacity: 0.6 }}>—</div>
                  <div style={{ fontSize: "0.75rem", opacity: 0.65, marginTop: "0.4rem" }}>
                    No completed repairs yet
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
                    <span style={{ fontSize: "2.75rem", fontWeight: 800, lineHeight: 1 }}>
                      {timeStats.mttr.days}
                    </span>
                    <span style={{ fontSize: "1rem", opacity: 0.75 }}>days</span>
                  </div>
                  <div style={{ fontSize: "0.75rem", opacity: 0.65, marginTop: "0.5rem" }}>
                    From {timeStats.mttr.sampleSize} {timeStats.mttr.sampleSize === 1 ? "repair" : "repairs"}
                  </div>
                </>
              )}
            </div>

            {/* Total spend */}
            <div style={{
              background: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)",
              borderRadius: "14px", padding: "1.5rem",
              color: "#fff", boxShadow: "0 4px 20px rgba(124,58,237,0.25)"
            }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", opacity: 0.75, marginBottom: "0.75rem" }}>
                Total repair spend
              </div>
              {costByType.length === 0 ? (
                <>
                  <div style={{ fontSize: "1.75rem", fontWeight: 800, opacity: 0.6 }}>—</div>
                  <div style={{ fontSize: "0.75rem", opacity: 0.65, marginTop: "0.4rem" }}>
                    No costs recorded yet
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "1.75rem", fontWeight: 800, lineHeight: 1.1 }}>
                    {formatUGX(costByType.reduce((s, i) => s + (i.totalCostUGX || 0), 0))}
                  </div>
                  <div style={{ fontSize: "0.75rem", opacity: 0.65, marginTop: "0.5rem" }}>
                    Across {costByType.reduce((s, i) => s + (i.completedRepairs || 0), 0)} repairs
                  </div>
                </>
              )}
            </div>

            {/* Active technicians */}
            <div style={{
              background: "linear-gradient(135deg, #92400e 0%, #d97706 100%)",
              borderRadius: "14px", padding: "1.5rem",
              color: "#fff", boxShadow: "0 4px 20px rgba(217,119,6,0.25)"
            }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", opacity: 0.75, marginBottom: "0.75rem" }}>
                Technicians available
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
                <span style={{ fontSize: "2.75rem", fontWeight: 800, lineHeight: 1 }}>
                  {techWorkload.filter(t => t.available).length}
                </span>
                <span style={{ fontSize: "1rem", opacity: 0.75 }}>
                  of {techWorkload.length}
                </span>
              </div>
              <div style={{ fontSize: "0.75rem", opacity: 0.65, marginTop: "0.5rem" }}>
                Ready to take a job right now
              </div>
            </div>
          </div>

          {/* ── Cost breakdown table ── */}
          <div style={{
            background: "#fff", borderRadius: "14px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            overflow: "hidden"
          }}>
            <div style={{
              padding: "1.25rem 1.5rem",
              borderBottom: "1px solid #f1f5f9",
              display: "flex", alignItems: "center", justifyContent: "space-between"
            }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0f172a" }}>
                  Repair cost by water point type
                </div>
                <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.15rem" }}>
                  Cost breakdown from all completed repairs
                </div>
              </div>
            </div>
            {costByType.length === 0 ? (
              <div style={{ padding: "2.5rem", textAlign: "center", color: "#94a3b8", fontSize: "0.875rem" }}>
                No completed repairs with a recorded cost yet.
              </div>
            ) : (
              <div>
                {costByType.map((item, idx) => {
                  const maxCost = Math.max(...costByType.map(i => i.totalCostUGX || 0));
                  const pct = maxCost > 0 ? Math.round((item.totalCostUGX / maxCost) * 100) : 0;
                  return (
                    <div key={item.waterPointType} style={{
                      padding: "1rem 1.5rem",
                      borderBottom: idx < costByType.length - 1 ? "1px solid #f8fafc" : "none",
                      display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap"
                    }}>
                      <div style={{ minWidth: "130px" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "#1e293b", textTransform: "capitalize" }}>
                          {item.waterPointType.replace(/_/g, " ")}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.1rem" }}>
                          {item.completedRepairs} {item.completedRepairs === 1 ? "repair" : "repairs"}
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: "120px" }}>
                        <div style={{
                          height: "8px", background: "#f1f5f9",
                          borderRadius: "99px", overflow: "hidden"
                        }}>
                          <div style={{
                            width: `${pct}%`, height: "100%",
                            background: "linear-gradient(90deg, #0369a1, #0284c7)",
                            borderRadius: "99px",
                            transition: "width 0.6s ease"
                          }} />
                        </div>
                      </div>
                      <div style={{ textAlign: "right", minWidth: "110px" }}>
                        <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0f172a" }}>
                          {formatUGX(item.totalCostUGX)}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                          avg {formatUGX(item.avgCostUGX)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Technician workload ── */}
          {techWorkload.length > 0 && (
            <div style={{
              background: "#fff", borderRadius: "14px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              overflow: "hidden"
            }}>
              <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0f172a" }}>
                  Technician workload
                </div>
                <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.15rem" }}>
                  Jobs and payments per technician
                </div>
              </div>
              <div className="table-responsive">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Technician", "Phone", "Active jobs", "Repairs done", "Total paid", "Status"].map(h => (
                        <th key={h} style={{
                          padding: "0.75rem 1rem", textAlign: "left",
                          fontSize: "0.72rem", fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: "0.06em",
                          color: "#64748b", borderBottom: "1px solid #e2e8f0"
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {techWorkload.map((t, idx) => (
                      <tr key={t._id} style={{
                        borderBottom: idx < techWorkload.length - 1 ? "1px solid #f8fafc" : "none"
                      }}>
                        <td style={{ padding: "0.875rem 1rem", fontWeight: 700, color: "#0f172a" }}>
                          {t.name}
                        </td>
                        <td style={{ padding: "0.875rem 1rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{ color: "#475569", fontSize: "0.82rem" }}>{formatPhoneDisplay(t.phone)}</span>
                            <a href={`tel:${t.phone}`} style={{
                              padding: "0.2rem 0.65rem", borderRadius: "6px",
                              background: "#fff", color: "#1d4ed8",
                              border: "2px solid #93c5fd",
                              fontSize: "0.72rem", fontWeight: 800,
                              textDecoration: "none", whiteSpace: "nowrap"
                            }}>Call</a>
                          </div>
                        </td>
                        <td style={{ padding: "0.875rem 1rem" }}>
                          <span style={{
                            display: "inline-block", minWidth: "28px",
                            padding: "0.2rem 0.6rem", borderRadius: "20px",
                            textAlign: "center", fontWeight: 800,
                            fontSize: "0.82rem",
                            background: t.activeJobs > 0 ? "#dbeafe" : "#f1f5f9",
                            color:      t.activeJobs > 0 ? "#1d4ed8" : "#94a3b8"
                          }}>
                            {t.activeJobs}
                          </span>
                        </td>
                        <td style={{ padding: "0.875rem 1rem", color: "#475569" }}>
                          {t.completedJobs}
                        </td>
                        <td style={{ padding: "0.875rem 1rem", fontWeight: 700, color: "#0f172a" }}>
                          {formatUGX(t.totalRepairsUGX)}
                        </td>
                        <td style={{ padding: "0.875rem 1rem" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: "0.3rem",
                            padding: "0.3rem 0.75rem", borderRadius: "20px",
                            fontSize: "0.78rem", fontWeight: 800,
                            background: t.available
                              ? "linear-gradient(135deg,#f0fdf4,#dcfce7)"
                              : "linear-gradient(135deg,#fff1f2,#fee2e2)",
                            color: t.available ? "#166534" : "#991b1b",
                            border: t.available ? "1px solid #86efac" : "1px solid #fca5a5"
                          }}>
                            <span style={{
                              width: "7px", height: "7px", borderRadius: "50%",
                              background: t.available ? "#16a34a" : "#dc2626",
                              flexShrink: 0, boxShadow: t.available
                                ? "0 0 0 2px #86efac" : "0 0 0 2px #fca5a5"
                            }} />
                            {t.available ? "Available" : "Busy"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Download records ── */}
          <div style={{
            background: "#fff", borderRadius: "14px",
            border: "1px solid #e2e8f0",
            padding: "1.5rem",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
          }}>
            <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0f172a", marginBottom: "0.35rem" }}>
              Download records
            </div>
            <p style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "1.25rem" }}>
              Export the full district data as a spreadsheet for official records or offline use.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                onClick={() => handleExport("reports")}
                disabled={exporting}
                className="btn btn-primary"
                style={{ minHeight: "44px" }}
              >
                {exporting ? "Preparing…" : "Download repairs (CSV)"}
              </button>
              <button
                onClick={() => handleExport("water-points")}
                disabled={exporting}
                className="btn btn-outline"
                style={{ minHeight: "44px" }}
              >
                Download water points (CSV)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALS ──────────────────────────────────────────────────────── */}

      {/* Assign technician */}
      {assigningReport && (
        <AssignTechnicianModal
          report={assigningReport}
          waterPoint={wpMap[assigningReport.waterPointId]}
          onClose={() => setAssigningReport(null)}
          onAssigned={() => { setAssigningReport(null); loadData(); }}
        />
      )}

      {/* Approve payment and close repair */}
      {resolvingReport && (
        <MarkRepairedModal
          report={resolvingReport}
          onClose={() => setResolvingReport(null)}
          onResolved={() => { setResolvingReport(null); loadData(); }}
        />
      )}

      {/* Full status history */}
      {historyReport && (
        <div
          className="modal-backdrop"
          onClick={() => setHistoryReport(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Repair history"
        >
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div className="modal-header">
              <div>
                <h3>Repair history</h3>
                <div style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                  {historyReport.waterPoint?.landmark || historyReport.waterPointId} — {historyReport.communityName}
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setHistoryReport(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
                <strong>Problem:</strong> {historyReport.problem}
              </div>
              {Array.isArray(historyReport.statusHistory) && historyReport.statusHistory.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {[...historyReport.statusHistory]
                    .sort((a, b) => new Date(a.at) - new Date(b.at))
                    .map((h, idx) => (
                      <div key={idx} style={{
                        display: "flex", gap: "0.75rem",
                        padding: "0.65rem 0.85rem", background: "var(--bg-app)",
                        borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)"
                      }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                          background: "var(--primary-600)", color: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "0.75rem", fontWeight: 800
                        }}>{idx + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.3rem" }}>
                            <StatusBadge status={h.status} />
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              {formatDate(h.at)}
                            </span>
                          </div>
                          {h.note && (
                            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
                              {h.note}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-text">No history recorded yet.</div>
                </div>
              )}
              {historyReport.costUGX != null && (
                <div style={{
                  marginTop: "0.85rem", padding: "0.65rem 0.85rem",
                  background: "#f0fdf4", border: "1px solid #86efac",
                  borderRadius: "var(--radius-sm)", fontSize: "0.875rem", fontWeight: 700, color: "#166534"
                }}>
                  Final cost approved: {formatUGX(historyReport.costUGX)}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setHistoryReport(null)} style={{ minHeight: "44px" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OfficerDashboard;
