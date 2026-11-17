// frontend/src/pages/dashboards/CommunityDashboard.jsx
import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import StatusBadge from "../../components/StatusBadge";
import { formatDate, formatReportAge } from "../../utils/formatters";

const STEPS = [
  { key: "open",        label: "Problem reported"    },
  { key: "assigned",    label: "Technician assigned"  },
  { key: "in_progress", label: "Work started"         },
  { key: "resolved",    label: "Fixed & closed"       },
];
const STEP_ORDER = ["open", "assigned", "in_progress", "resolved"];
function stepDone(reportStatus, stepKey) {
  return STEP_ORDER.indexOf(reportStatus) >= STEP_ORDER.indexOf(stepKey);
}

const accentFor = (status) =>
  status === "resolved" ? "linear-gradient(90deg,#065f46,#15803d)"
  : status === "in_progress" ? "linear-gradient(90deg,#4c1d95,#7c3aed)"
  : status === "assigned"    ? "linear-gradient(90deg,#92400e,#d97706)"
  : "linear-gradient(90deg,#0369a1,#0284c7)";

const dotFor = (status) =>
  status === "resolved" ? "#15803d"
  : status === "in_progress" ? "#7c3aed"
  : status === "assigned" ? "#d97706"
  : "#0284c7";

export function CommunityDashboard() {
  const { user } = useAuth();
  const [community,   setCommunity]   = useState(null);
  const [waterPoints, setWaterPoints] = useState([]);
  const [reports,     setReports]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);

  const loadCommunityData = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const commData = await api.getCommunityById(user.linkedId);
      setCommunity(commData);
      const [wpData, rptData] = await Promise.all([
        api.getWaterPoints({ communityId: user.linkedId }),
        api.getReports(),
      ]);
      setWaterPoints(wpData || []);
      setReports(rptData || []);
    } catch (err) {
      setError(err.message || "Failed to load community dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [user.linkedId]);

  useEffect(() => { loadCommunityData(); }, [loadCommunityData]);

  if (loading) return (
    <div className="loading-indicator" style={{ minHeight: "50vh" }}>
      <div className="spinner" /><span>Loading settlement data for {user.name}…</span>
    </div>
  );

  if (error) return (
    <div className="alert alert-error">
      <strong>Dashboard Error:</strong> {error}
      <div style={{ marginTop: "0.5rem" }}>
        <button onClick={loadCommunityData} className="btn btn-outline btn-sm">Retry</button>
      </div>
    </div>
  );

  const workingCount  = waterPoints.filter(w => w.status === "working").length;
  const brokenCount   = waterPoints.filter(w => w.status === "broken").length;
  const lowYieldCount = waterPoints.filter(w => w.status === "low_yield").length;
  const activeReports = reports.filter(r => r.status !== "resolved");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* ── Header card ── */}
      <div style={{
        background: "#fff", borderRadius: "12px",
        border: "1px solid #e2e8f0", overflow: "hidden",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
      }}>
        <div style={{ height: "4px", background: "linear-gradient(90deg,#0369a1,#0284c7)" }} />
        <div style={{
          padding: "1.25rem 1.5rem",
          background: "linear-gradient(180deg,#fff 0%,#f0f9ff 100%)",
          display: "flex", flexWrap: "wrap",
          alignItems: "center", justifyContent: "space-between", gap: "1rem"
        }}>
          <div>
            <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#0369a1",
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.3rem" }}>
              Community Settlement Desk
            </div>
            <h1 style={{ fontSize: "1.45rem", fontWeight: 800, color: "#0c4a6e",
              margin: 0, letterSpacing: "-0.02em" }}>
              {community?.name || "Local Community"} · Luweero District
            </h1>
            <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.35rem", marginBottom: 0 }}>
              Signed in as <strong style={{ color: "#0f172a" }}>{user.name}</strong>{" "}
              ({community?.contact?.role || "Community Contact"}) ·{" "}
              Population: <strong style={{ color: "#0f172a" }}>{community?.population?.toLocaleString() || "N/A"}</strong> residents
              across <strong style={{ color: "#0f172a" }}>{community?.households?.toLocaleString() || "N/A"}</strong> households
            </p>
          </div>
          <Link to="/report" className="btn btn-primary">Report a Breakdown</Link>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "1rem" }}>
        {[
          { label: "Working",      val: workingCount,          bg: "linear-gradient(135deg,#065f46,#059669)",   shadow: "rgba(5,150,105,0.25)"  },
          { label: "Broken",       val: brokenCount,           bg: "linear-gradient(135deg,#991b1b,#dc2626)",   shadow: "rgba(220,38,38,0.25)"  },
          { label: "Low water",    val: lowYieldCount,         bg: "linear-gradient(135deg,#92400e,#d97706)",   shadow: "rgba(217,119,6,0.25)"  },
          { label: "Open reports", val: activeReports.length,  bg: "linear-gradient(135deg,#1e40af,#3b82f6)",   shadow: "rgba(59,130,246,0.25)" },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: "14px", padding: "1.5rem",
            color: "#fff", boxShadow: `0 4px 20px ${k.shadow}` }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", opacity: 0.75, marginBottom: "0.75rem" }}>{k.label}</div>
            <div style={{ fontSize: "2.75rem", fontWeight: 800, lineHeight: 1 }}>{k.val}</div>
            <div style={{ fontSize: "0.78rem", opacity: 0.7, marginTop: "0.5rem" }}>water points</div>
          </div>
        ))}
      </div>

      {/* ── Water points table ── */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        <div style={{ padding: "1.1rem 1.25rem", borderBottom: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0c4a6e", letterSpacing: "-0.01em" }}>
            Community Water Points ({waterPoints.length})
          </div>
          <Link to="/water-points" style={{ fontSize: "0.82rem", color: "#0369a1",
            textDecoration: "none", fontWeight: 700 }}>
            View Full Specs →
          </Link>
        </div>
        {waterPoints.length === 0 ? (
          <div className="empty-state"><div className="empty-state-text">No water points found.</div></div>
        ) : (
          <div className="table-responsive">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Type","Landmark / Location","Households","Status","Action"].map(h => (
                    <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left",
                      fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: "0.06em", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {waterPoints.map((wp, idx) => (
                  <tr key={wp._id} style={{ borderBottom: idx < waterPoints.length - 1 ? "1px solid #f8fafc" : "none" }}>
                    <td style={{ padding: "0.875rem 1rem", textTransform: "capitalize", color: "#475569" }}>
                      {wp.type.replace("_", " ")}
                    </td>
                    <td style={{ padding: "0.875rem 1rem", fontWeight: 700, color: "#0f172a" }}>{wp.landmark}</td>
                    <td style={{ padding: "0.875rem 1rem", color: "#475569" }}>{wp.householdsServed}</td>
                    <td style={{ padding: "0.875rem 1rem" }}><StatusBadge status={wp.status} /></td>
                    <td style={{ padding: "0.875rem 1rem" }}>
                      {wp.status !== "broken" ? (
                        <Link to="/report" state={{ preselectedWp: wp._id }}
                          className="btn btn-outline btn-sm">Report Fault</Link>
                      ) : (
                        <span style={{ fontSize: "0.72rem", color: "#dc2626", fontWeight: 800,
                          letterSpacing: "0.04em", textTransform: "uppercase" }}>Report active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Reports & timeline ── */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        <div style={{ padding: "1.1rem 1.25rem", borderBottom: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0c4a6e", letterSpacing: "-0.01em" }}>
              Breakdown Reports & Repair Progress
            </div>
            <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.15rem" }}>
              Real-time status updates for {community?.name}
            </div>
          </div>
          <button onClick={loadCommunityData} className="btn btn-outline btn-sm">Refresh</button>
        </div>

        <div style={{ padding: "1.1rem 1.25rem" }}>
          {reports.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-text">
                No faults registered — all water points in {community?.name} are currently operational.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {reports.map(rpt => {
                const wp  = waterPoints.find(w => w._id === rpt.waterPointId);
                const age = formatReportAge(rpt.reportedAt);
                const accent = accentFor(rpt.status);
                const dot    = dotFor(rpt.status);

                let progressMsg = "";
                if (rpt.status === "open")        progressMsg = "Registered in the dispatch queue — awaiting technician assignment by the District Water Office.";
                else if (rpt.status === "assigned")   progressMsg = `A qualified artisan (${rpt.assignedTo || "mechanic"}) has been assigned and scheduled for dispatch.`;
                else if (rpt.status === "in_progress") progressMsg = "Technician is currently on-site diagnosing and repairing the fault.";
                else if (rpt.status === "resolved")    progressMsg = `Repair completed and verified on ${formatDate(rpt.resolvedAt)}. Water point restored to working condition.`;

                return (
                  <div key={rpt._id} style={{ background: "#fff", border: "1px solid #e2e8f0",
                    borderRadius: "12px", overflow: "hidden",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                    <div style={{ height: "4px", background: accent }} />
                    <div style={{ padding: "1rem 1.25rem" }}>

                      {/* Header row */}
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center",
                        justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.65rem" }}>
                        <div>
                          <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a" }}>{rpt._id}</span>
                          <span style={{ margin: "0 0.45rem", color: "#cbd5e1" }}>·</span>
                          <strong style={{ textTransform: "capitalize", color: "#334155" }}>
                            {wp?.type?.replace("_", " ") || "Water Point"}
                          </strong>
                          <span style={{ margin: "0 0.45rem", color: "#cbd5e1" }}>·</span>
                          <span style={{ fontSize: "0.82rem", color: "#64748b" }}>{wp?.landmark}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <StatusBadge status={rpt.severity} />
                          <StatusBadge status={rpt.status} />
                        </div>
                      </div>

                      {/* Problem */}
                      <div style={{ padding: "0.65rem 1rem", background: "#f8fafc",
                        border: "1px solid #e2e8f0", borderRadius: "8px",
                        fontSize: "0.875rem", marginBottom: "0.85rem" }}>
                        <strong style={{ color: "#0f172a" }}>Problem:</strong>{" "}
                        <span style={{ color: "#334155" }}>"{rpt.problem}"</span>
                        <span style={{ fontSize: "0.78rem", color: "#94a3b8", marginLeft: "0.5rem" }}>
                          — reported by {rpt.reportedBy?.name} · {age}
                        </span>
                      </div>

                      {/* Progress message */}
                      <div style={{
                        background: rpt.status === "resolved" ? "linear-gradient(135deg,#f0fdf4,#dcfce7)" : "#f8fafc",
                        border: `1px solid ${rpt.status === "resolved" ? "#86efac" : "#e2e8f0"}`,
                        borderRadius: "8px", padding: "0.65rem 1rem",
                        fontSize: "0.825rem",
                        color: rpt.status === "resolved" ? "#166534" : "#64748b",
                        marginBottom: "1rem"
                      }}>
                        <strong>Current progress:</strong> {progressMsg}
                      </div>

                      {/* 4-step timeline */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0 }}>
                        {STEPS.map((step, idx) => {
                          const done = stepDone(rpt.status, step.key);
                          const hist = rpt.statusHistory?.find(h => h.status === step.key);
                          return (
                            <div key={step.key} style={{ textAlign: "center", position: "relative" }}>
                              {idx > 0 && (
                                <div style={{
                                  position: "absolute", top: "17px", right: "50%", left: "-50%",
                                  height: "3px", zIndex: 0,
                                  background: done ? dot : "#e2e8f0"
                                }} />
                              )}
                              <div style={{
                                width: 34, height: 34, borderRadius: "50%",
                                margin: "0 auto 0.4rem",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: done ? "1rem" : "0.8rem", fontWeight: 800,
                                zIndex: 1, position: "relative",
                                background: done ? dot : "#f1f5f9",
                                color: done ? "#fff" : "#94a3b8",
                                border: done ? "none" : "2px solid #e2e8f0",
                                boxShadow: done ? `0 2px 8px ${dot}55` : "none"
                              }}>
                                {done ? "✓" : idx + 1}
                              </div>
                              <div style={{ fontSize: "0.72rem", fontWeight: done ? 700 : 400,
                                color: done ? "#0f172a" : "#94a3b8", lineHeight: 1.35 }}>
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CommunityDashboard;
