// frontend/src/pages/dashboards/VolunteerDashboard.jsx
// Mobile-first dashboard for Bugema University student volunteers and field reporters.
// Features:
//   - Fast field reporting shortcuts.
//   - "My Filed Reports" tracking queue with real-time status and age indicators.
//   - Read-only directory of district water points for field inspection.

import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import StatusBadge from "../../components/StatusBadge";
import { formatDate, formatReportAge } from "../../utils/formatters";

export function VolunteerDashboard() {
  const { user } = useAuth();
  const [myReports, setMyReports] = useState([]);
  const [waterPoints, setWaterPoints] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadVolunteerData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Concurrently fetch volunteer's personal reports, water points, and communities
      const [reportsData, wpData, commsData] = await Promise.all([
        api.getReports(), // Server scopes to reports filed by this volunteer
        api.getWaterPoints(),
        api.getCommunities()
      ]);

      setMyReports(reportsData || []);
      setWaterPoints(wpData || []);
      setCommunities(commsData || []);
    } catch (err) {
      setError(err.message || "Failed to load volunteer dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVolunteerData();
  }, [loadVolunteerData]);

  if (loading) {
    return (
      <div className="loading-indicator" style={{ minHeight: "50vh" }}>
        <div className="spinner" />
        <span>Loading field reporter dashboard...</span>
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
              onClick={loadVolunteerData}
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

  // Lookup maps
  const commMap = Object.fromEntries(communities.map((c) => [c._id, c.name]));
  const wpMap = Object.fromEntries(waterPoints.map((w) => [w._id, w]));

  const openCount = myReports.filter((r) => r.status === "open").length;
  const inProgressCount = myReports.filter((r) => r.status === "assigned" || r.status === "in_progress").length;
  const resolvedCount = myReports.filter((r) => r.status === "resolved").length;

  // Filtered water points for search
  const filteredPoints = waterPoints.filter((wp) => {
    const term = searchTerm.toLowerCase();
    const commName = (commMap[wp.communityId] || "").toLowerCase();
    const landmark = (wp.landmark || "").toLowerCase();
    const type = (wp.type || "").toLowerCase();
    const id = (wp._id || "").toLowerCase();
    return id.includes(term) || commName.includes(term) || landmark.includes(term) || type.includes(term);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* ── Header card ── */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        <div style={{ height: "4px", background: "linear-gradient(90deg,#0369a1,#0284c7)" }} />
        <div style={{ padding: "1.25rem 1.5rem",
          background: "linear-gradient(180deg,#fff 0%,#f0f9ff 100%)",
          display: "flex", flexWrap: "wrap", alignItems: "center",
          justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#0369a1",
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.3rem" }}>
              Student Volunteer & Field Reporter
            </div>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0c4a6e",
              margin: 0, letterSpacing: "-0.02em" }}>
              {user.name}
            </h1>
            <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.35rem", marginBottom: 0 }}>
              Bugema University Community Engagement · Phone:{" "}
              <strong style={{ color: "#0f172a" }}>{user.phone}</strong>
            </p>
          </div>
          <Link to="/report" className="btn btn-primary">Report a Breakdown</Link>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "1rem" }}>
        {[
          { label: "Reports filed",  val: myReports.length, sub: "total submitted",  bg: "linear-gradient(135deg,#0c4a6e,#0369a1)", shadow: "rgba(3,105,161,0.25)"  },
          { label: "Waiting",        val: openCount,         sub: "for a technician", bg: "linear-gradient(135deg,#991b1b,#dc2626)", shadow: "rgba(220,38,38,0.25)"  },
          { label: "In progress",    val: inProgressCount,  sub: "being repaired",   bg: "linear-gradient(135deg,#92400e,#d97706)", shadow: "rgba(217,119,6,0.25)"  },
          { label: "Fixed",          val: resolvedCount,    sub: "repairs completed", bg: "linear-gradient(135deg,#065f46,#059669)", shadow: "rgba(5,150,105,0.25)"  },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: "14px", padding: "1.5rem",
            color: "#fff", boxShadow: `0 4px 20px ${k.shadow}` }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", opacity: 0.75, marginBottom: "0.75rem" }}>{k.label}</div>
            <div style={{ fontSize: "2.75rem", fontWeight: 800, lineHeight: 1 }}>{k.val}</div>
            <div style={{ fontSize: "0.78rem", opacity: 0.7, marginTop: "0.5rem" }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── My filed reports ── */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        <div style={{ padding: "1.1rem 1.25rem", borderBottom: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0c4a6e", letterSpacing: "-0.01em" }}>
              My Filed Reports ({myReports.length})
            </div>
            <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.1rem" }}>
              Track faults you have submitted in the field
            </div>
          </div>
          <Link to="/report" className="btn btn-outline btn-sm">New Report +</Link>
        </div>
        <div style={{ padding: "1.1rem 1.25rem" }}>
          {myReports.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-text">
                No breakdown reports filed yet. Click "Report a Breakdown" above to report an issue.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {myReports.map(rpt => {
                const wp       = wpMap[rpt.waterPointId];
                const commName = wp ? commMap[wp.communityId] : "Luweero Settlement";
                const age      = formatReportAge(rpt.reportedAt);
                const accent   = rpt.status === "resolved"
                  ? "linear-gradient(90deg,#065f46,#15803d)"
                  : rpt.status === "in_progress"
                  ? "linear-gradient(90deg,#4c1d95,#7c3aed)"
                  : rpt.status === "assigned"
                  ? "linear-gradient(90deg,#92400e,#d97706)"
                  : "linear-gradient(90deg,#0369a1,#0284c7)";

                return (
                  <div key={rpt._id} style={{ background: "#fff", border: "1px solid #e2e8f0",
                    borderRadius: "12px", overflow: "hidden",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                    <div style={{ height: "4px", background: accent }} />
                    <div style={{ padding: "0.9rem 1.1rem" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start",
                        justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.5rem" }}>
                        <div>
                          <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0f172a" }}>{commName}</span>
                          <span style={{ margin: "0 0.4rem", color: "#cbd5e1" }}>·</span>
                          <span style={{ color: "#64748b", fontSize: "0.82rem" }}>{wp?.landmark || rpt.waterPointId}</span>
                        </div>
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          <StatusBadge status={rpt.severity} />
                          <StatusBadge status={rpt.status} />
                        </div>
                      </div>

                      <div style={{ fontSize: "0.875rem", color: "#334155", marginBottom: "0.45rem" }}>
                        "{rpt.problem}"
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center",
                        justifyContent: "space-between", gap: "0.5rem",
                        fontSize: "0.78rem", color: "#94a3b8" }}>
                        <span>Filed {age} ({formatDate(rpt.reportedAt)})</span>
                        {rpt.status === "assigned" && (
                          <span style={{ color: "#d97706", fontWeight: 700 }}>
                            Assigned to mechanic: {rpt.assignedTo}
                          </span>
                        )}
                        {rpt.status === "in_progress" && (
                          <span style={{ color: "#7c3aed", fontWeight: 700 }}>
                            Mechanic on-site diagnosing / repairing
                          </span>
                        )}
                        {rpt.status === "resolved" && (
                          <span style={{ color: "#15803d", fontWeight: 700 }}>
                            Confirmed repaired on {formatDate(rpt.resolvedAt)}
                          </span>
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

      {/* ── Water points directory ── */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        <div style={{ padding: "1.1rem 1.25rem", borderBottom: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0c4a6e", letterSpacing: "-0.01em" }}>
              Water Points Field Directory
            </div>
            <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.1rem" }}>
              Read-only overview for site visits
            </div>
          </div>
          <span style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 600 }}>
            {filteredPoints.length} of {waterPoints.length} points
          </span>
        </div>
        <div style={{ padding: "1.1rem 1.25rem 0.5rem" }}>
          <input type="text" className="form-control"
            placeholder="Search by community, landmark, or type…"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="table-responsive">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Community","Type","Landmark","Status","Action"].map(h => (
                  <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left",
                    fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.06em", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPoints.map((wp, idx) => (
                <tr key={wp._id} style={{ borderBottom: idx < filteredPoints.length - 1 ? "1px solid #f8fafc" : "none" }}>
                  <td style={{ padding: "0.875rem 1rem", fontWeight: 700, color: "#0f172a" }}>
                    {commMap[wp.communityId] || wp.communityId}
                  </td>
                  <td style={{ padding: "0.875rem 1rem", textTransform: "capitalize", color: "#475569" }}>
                    {wp.type.replace("_", " ")}
                  </td>
                  <td style={{ padding: "0.875rem 1rem", color: "#475569" }}>{wp.landmark}</td>
                  <td style={{ padding: "0.875rem 1rem" }}><StatusBadge status={wp.status} /></td>
                  <td style={{ padding: "0.875rem 1rem" }}>
                    {wp.status !== "broken" ? (
                      <Link to="/report" state={{ preselectedWp: wp._id }}
                        className="btn btn-outline btn-sm">Report Fault</Link>
                    ) : (
                      <span style={{ fontSize: "0.72rem", color: "#dc2626",
                        fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        Broken
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default VolunteerDashboard;

