// frontend/src/pages/WaterPoints.jsx
// Water points inventory — shown to all roles that can navigate here.
// Technicians see it as a reference; community/volunteer contacts can
// report a breakdown from here. The "Report a breakdown" button is
// hidden for technician and officer roles.

import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { StatusBadge } from "../components/StatusBadge";
import { formatDate } from "../utils/formatters";

export function WaterPoints() {
  const { role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [waterPoints,    setWaterPoints]    = useState([]);
  const [communities,    setCommunities]    = useState([]);
  const [commMap,        setCommMap]        = useState({});
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);

  // Filters
  const [filterCommunity, setFilterCommunity] = useState("all");
  const [filterType,      setFilterType]      = useState("all");
  const [filterStatus,    setFilterStatus]    = useState(searchParams.get("status") || "all");

  // Inspect modal
  const [inspecting,        setInspecting]        = useState(null); // full detail object
  const [loadingInspection, setLoadingInspection] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [comms, points] = await Promise.all([
          api.getCommunities(),
          api.getWaterPoints()
        ]);
        const map = Object.fromEntries(comms.map(c => [c._id, c]));
        setCommunities(comms);
        setCommMap(map);
        setWaterPoints(points);
      } catch (err) {
        setError("Could not load water points. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleInspect = async (id) => {
    try {
      setLoadingInspection(true);
      const data = await api.getWaterPointById(id);
      setInspecting(data);
    } catch (_) {}
    finally { setLoadingInspection(false); }
  };

  // Filtered list
  const filtered = waterPoints.filter(wp => {
    if (filterCommunity !== "all" && wp.communityId !== filterCommunity) return false;
    if (filterType      !== "all" && wp.type        !== filterType)      return false;
    if (filterStatus    !== "all" && wp.status      !== filterStatus)    return false;
    return true;
  });

  // Status dot colour
  const statusDot = (s) =>
    s === "working" ? "#16a34a" : s === "broken" ? "#dc2626" : "#d97706";

  // Roles that can report a breakdown
  const canReport = role === "community" || role === "volunteer";

  return (
    <div>
      {/* ── Page header ── */}
      <div style={{
        display: "flex", alignItems: "flex-start",
        justifyContent: "space-between", flexWrap: "wrap",
        gap: "1rem", marginBottom: "1.5rem"
      }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0c4a6e",
            margin: 0, letterSpacing: "-0.02em" }}>
            Water points
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#64748b", marginTop: "0.3rem" }}>
            Bugema University area, Luweero District
          </p>
        </div>
        {canReport && (
          <Link to="/report" className="btn btn-primary">
            Report a problem
          </Link>
        )}
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{
        background: "#fff", borderRadius: "12px",
        border: "1px solid #e2e8f0",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        padding: "1.1rem 1.25rem",
        marginBottom: "1.25rem",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "1rem"
      }}>
        {/* Community */}
        <div>
          <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 800,
            textTransform: "uppercase", letterSpacing: "0.07em", color: "#64748b",
            marginBottom: "0.4rem" }}>
            Community
          </label>
          <select value={filterCommunity}
            onChange={e => setFilterCommunity(e.target.value)}
            className="form-control" style={{ fontSize: "0.875rem", minHeight: "40px" }}>
            <option value="all">All communities</option>
            {communities.map(c => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Type */}
        <div>
          <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 800,
            textTransform: "uppercase", letterSpacing: "0.07em", color: "#64748b",
            marginBottom: "0.4rem" }}>
            Water point type
          </label>
          <select value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="form-control" style={{ fontSize: "0.875rem", minHeight: "40px" }}>
            <option value="all">All types</option>
            <option value="borehole">Borehole</option>
            <option value="protected_spring">Protected spring</option>
            <option value="shallow_well">Shallow well</option>
            <option value="tap_stand">Tap stand</option>
          </select>
        </div>

        {/* Status */}
        <div>
          <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 800,
            textTransform: "uppercase", letterSpacing: "0.07em", color: "#64748b",
            marginBottom: "0.4rem" }}>
            Status
          </label>
          <select value={filterStatus}
            onChange={e => {
              setFilterStatus(e.target.value);
              if (e.target.value === "all") searchParams.delete("status");
              else searchParams.set("status", e.target.value);
              setSearchParams(searchParams);
            }}
            className="form-control" style={{ fontSize: "0.875rem", minHeight: "40px" }}>
            <option value="all">All statuses</option>
            <option value="working">Working</option>
            <option value="broken">Broken</option>
            <option value="low_yield">Low water</option>
          </select>
        </div>
      </div>

      {/* ── Water points table ── */}
      <div style={{
        background: "#fff", borderRadius: "12px",
        border: "1px solid #e2e8f0",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        overflow: "hidden"
      }}>
        {/* Table header row */}
        <div style={{
          padding: "1.1rem 1.5rem",
          borderBottom: "1px solid #f1f5f9",
          display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap"
        }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0c4a6e" }}>
            All water points
          </div>
          <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
            {filtered.length} of {waterPoints.length} shown
          </div>
        </div>

        {loading ? (
          <div className="loading-indicator" style={{ padding: "3rem" }}>
            <div className="spinner" />
            <span>Loading water points…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: "3rem" }}>
            <div className="empty-state-text">No water points match this filter.</div>
          </div>
        ) : (
          <div className="table-responsive">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", minWidth: "640px" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Location", "Community", "Type", "Status", "Households", "Last serviced", ""].map(h => (
                    <th key={h} style={{
                      padding: "0.8rem 1rem", textAlign: "left",
                      fontSize: "0.7rem", fontWeight: 800,
                      textTransform: "uppercase", letterSpacing: "0.07em",
                      color: "#64748b", borderBottom: "2px solid #e2e8f0",
                      whiteSpace: "nowrap"
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((wp, idx) => {
                  const comm = commMap[wp.communityId];
                  return (
                    <tr key={wp._id} style={{
                      borderBottom: idx < filtered.length - 1 ? "1px solid #f8fafc" : "none",
                      transition: "background 0.12s ease"
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      {/* Location */}
                      <td style={{ padding: "0.9rem 1rem" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.875rem" }}>
                          {wp.landmark}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "0.1rem" }}>
                          Installed {wp.installedYear}
                        </div>
                      </td>
                      {/* Community */}
                      <td style={{ padding: "0.9rem 1rem", color: "#475569", fontSize: "0.85rem" }}>
                        {comm?.name || "Unknown"}
                      </td>
                      {/* Type */}
                      <td style={{ padding: "0.9rem 1rem", textTransform: "capitalize", color: "#475569" }}>
                        {wp.type?.replace(/_/g, " ")}
                      </td>
                      {/* Status */}
                      <td style={{ padding: "0.9rem 1rem" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: "0.35rem",
                          padding: "0.25rem 0.7rem", borderRadius: "20px",
                          fontSize: "0.75rem", fontWeight: 700
                        }}>
                          <span style={{
                            width: 7, height: 7, borderRadius: "50%",
                            background: statusDot(wp.status), flexShrink: 0
                          }} />
                          <StatusBadge status={wp.status} />
                        </span>
                      </td>
                      {/* Households */}
                      <td style={{ padding: "0.9rem 1rem", fontWeight: 700, color: "#0f172a" }}>
                        {wp.householdsServed}
                      </td>
                      {/* Last serviced */}
                      <td style={{ padding: "0.9rem 1rem", fontSize: "0.825rem",
                        color: wp.lastServiced ? "#64748b" : "#ef4444",
                        fontWeight: wp.lastServiced ? 400 : 700 }}>
                        {wp.lastServiced ? formatDate(wp.lastServiced) : "Never serviced"}
                      </td>
                      {/* Action */}
                      <td style={{ padding: "0.9rem 1rem" }}>
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "nowrap" }}>
                          <button onClick={() => handleInspect(wp._id)}
                            className="btn btn-outline btn-sm">
                            View details
                          </button>
                          {canReport && wp.status !== "broken" && (
                            <Link to="/report" state={{ preselectedWp: wp._id }}
                              className="btn btn-sm"
                              style={{
                                background: "linear-gradient(135deg,#991b1b,#dc2626)",
                                color: "#fff", border: "none", borderRadius: "6px",
                                padding: "0.35rem 0.75rem", fontWeight: 700,
                                fontSize: "0.78rem", textDecoration: "none",
                                display: "inline-flex", alignItems: "center",
                                minHeight: "36px"
                              }}>
                              Report problem
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Detail modal ── */}
      {(loadingInspection || inspecting) && (
        <div className="modal-backdrop" onClick={() => setInspecting(null)}
          role="dialog" aria-modal="true" aria-label="Water point details">
          <div className="modal-content" onClick={e => e.stopPropagation()}
            style={{ maxWidth: "580px" }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontWeight: 800 }}>Water point details</h3>
                {inspecting && (
                  <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.2rem" }}>
                    {inspecting.landmark} — {commMap[inspecting.communityId]?.name}
                  </div>
                )}
              </div>
              <button className="modal-close-btn" onClick={() => setInspecting(null)}
                aria-label="Close">&times;</button>
            </div>

            <div className="modal-body">
              {loadingInspection ? (
                <div className="loading-indicator"><div className="spinner" /><span>Loading…</span></div>
              ) : inspecting && (
                <>
                  {/* Key attributes grid */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem", marginBottom: "1.25rem"
                  }}>
                    {[
                      ["Type", (inspecting.type || "").replace(/_/g, " ")],
                      ["Status", null],
                      ["Community", commMap[inspecting.communityId]?.name || "—"],
                      ["Households served", inspecting.householdsServed],
                      ["Installed", inspecting.installedYear],
                      ["Last serviced", inspecting.lastServiced ? formatDate(inspecting.lastServiced) : "Never serviced"]
                    ].map(([label, val], i) => (
                      <div key={i} style={{
                        background: "#f8fafc", borderRadius: "8px",
                        padding: "0.75rem 0.875rem"
                      }}>
                        <div style={{ fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase",
                          letterSpacing: "0.06em", color: "#94a3b8", marginBottom: "0.3rem" }}>
                          {label}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "#0f172a",
                          textTransform: label === "Type" ? "capitalize" : "none" }}>
                          {label === "Status" ? <StatusBadge status={inspecting.status} /> : val}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Community contact */}
                  {inspecting.community?.contact && (
                    <div style={{
                      padding: "0.75rem 1rem", background: "#f0fdf4",
                      border: "1px solid #86efac", borderRadius: "8px",
                      marginBottom: "1.25rem", fontSize: "0.875rem"
                    }}>
                      <div style={{ fontWeight: 700, color: "#166534", marginBottom: "0.2rem" }}>
                        Community contact
                      </div>
                      <div style={{ color: "#15803d" }}>
                        {inspecting.community.contact.name} · {inspecting.community.contact.phone}
                      </div>
                    </div>
                  )}

                  {/* Repair history */}
                  <div style={{ fontWeight: 800, fontSize: "0.9rem", color: "#0c4a6e",
                    marginBottom: "0.75rem" }}>
                    Repair history ({inspecting.reports?.length || 0})
                  </div>
                  {!inspecting.reports?.length ? (
                    <div style={{ fontSize: "0.875rem", color: "#94a3b8", fontStyle: "italic" }}>
                      No breakdowns recorded for this water point.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                      {inspecting.reports.map((r, i) => (
                        <div key={r._id || i} style={{
                          padding: "0.75rem 1rem",
                          background: "#f8fafc", borderRadius: "8px",
                          border: "1px solid #e2e8f0", fontSize: "0.85rem"
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between",
                            flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.3rem" }}>
                            <span style={{ fontWeight: 700, color: "#0f172a" }}>{r.problem}</span>
                            <StatusBadge status={r.status} />
                          </div>
                          <div style={{ color: "#64748b", fontSize: "0.8rem" }}>
                            Reported by {r.reportedBy?.name} ·{" "}
                            {r.reportedAt ? new Date(r.reportedAt).toLocaleDateString("en-UG",
                              { day: "numeric", month: "short", year: "numeric" }) : "—"}
                            {r.costUGX != null && (
                              <span style={{ marginLeft: "0.75rem", fontWeight: 700, color: "#0369a1" }}>
                                UGX {r.costUGX.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setInspecting(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WaterPoints;
