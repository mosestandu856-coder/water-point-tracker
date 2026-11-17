// frontend/src/pages/ReportsList.jsx
// Main reports dispatch and lifecycle management view.
// Filters reports by status (All, Open, Assigned, Resolved), displays chronological wait times,
// and integrates Assign Technician (Query 2) and Mark Repaired (Query 4 ACID Transaction) workflows.

import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { StatusBadge } from "../components/StatusBadge";
import { AssignTechnicianModal } from "../components/AssignTechnicianModal";
import { MarkRepairedModal } from "../components/MarkRepairedModal";
import { formatDate, formatReportAge, formatUGX } from "../utils/formatters";

export function ReportsList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = searchParams.get("status") || "all";

  const [activeTab, setActiveTab] = useState(initialFilter);
  const [reports, setReports] = useState([]);
  const [waterPointsMap, setWaterPointsMap] = useState({});
  const [techniciansMap, setTechniciansMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);

  // Modals state
  const [assigningReport, setAssigningReport] = useState(null);
  const [resolvingReport, setResolvingReport] = useState(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);

  // Load reports and lookup maps
  const loadReports = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const filter = activeTab === "all" ? {} : { status: activeTab };
      const [reportsData, wpData, techData] = await Promise.all([
        api.getReports(filter),
        api.getWaterPoints(),
        api.getTechnicians()
      ]);

      const wpMap = {};
      wpData.forEach((wp) => {
        wpMap[wp._id] = wp;
      });

      const techMap = {};
      techData.forEach((t) => {
        techMap[t._id] = t;
      });

      setReports(reportsData);
      setWaterPointsMap(wpMap);
      setTechniciansMap(techMap);

      // Check if URL asked to open assign modal for a specific report
      const assignId = searchParams.get("assign");
      if (assignId) {
        const target = reportsData.find((r) => r._id === assignId);
        if (target && target.status === "open") {
          setAssigningReport(target);
        }
      }
    } catch (err) {
      setErrorMessage("Failed to load reports: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [activeTab]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === "all") {
      searchParams.delete("status");
    } else {
      searchParams.set("status", tab);
    }
    setSearchParams(searchParams);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1rem",
          gap: "0.5rem"
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: "800", color: "var(--primary-900)" }}>
            My reports
          </h1>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Reports you have submitted. Oldest waiting jobs are handled first.
          </p>
        </div>

        <button
          onClick={loadReports}
          className="btn btn-outline"
          style={{ minHeight: "36px", padding: "0.35rem 0.75rem", fontSize: "0.85rem" }}
        >
          Refresh
        </button>
      </div>

      {/* Status Filter Tabs */}
      <div className="tab-list">
        {[
          { key: "all",      label: "All reports"             },
          { key: "open",     label: "Waiting for technician"  },
          { key: "assigned", label: "Technician assigned"     },
          { key: "resolved", label: "Fixed"                   }
        ].map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${activeTab === t.key ? "active" : ""}`}
            onClick={() => handleTabChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {errorMessage && (
        <div className="alert alert-error">
          <div>{errorMessage}</div>
        </div>
      )}

      {loading ? (
        <div className="loading-indicator">
          <div className="spinner" />
          <span>Loading reports...</span>
        </div>
      ) : reports.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-text">No reports match the selected status filter.</div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {reports.map((rpt) => {
            const wp = waterPointsMap[rpt.waterPointId];
            const tech = techniciansMap[rpt.assignedTo];
            const hasHistory = Array.isArray(rpt.statusHistory) && rpt.statusHistory.length > 0;
            const isExpanded = expandedHistoryId === rpt._id;

            return (
              <div key={rpt._id} className="card" style={{ margin: 0 }}>
                {/* Header Row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    borderBottom: "1px solid var(--border-light)",
                    paddingBottom: "0.75rem",
                    marginBottom: "0.75rem"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ fontSize: "1rem", fontWeight: 800, color: "#0f172a", textTransform: "capitalize" }}>
                      {wp ? `${wp.type?.replace(/_/g, " ")} — ${wp.landmark}` : "Water point"}
                    </span>
                    <StatusBadge status={rpt.status} />
                    <StatusBadge status={rpt.severity} />
                  </div>

                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Reported: <strong>{formatDate(rpt.reportedAt)}</strong> ({formatReportAge(rpt.reportedAt)})
                  </div>
                </div>

                {/* Problem & Water Point Details */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
                  <div>
                    <h4 style={{ fontSize: "0.82rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem" }}>
                      Problem reported
                    </h4>
                    <p style={{ fontSize: "0.95rem", fontWeight: 600, marginTop: "0.2rem" }}>
                      {rpt.problem}
                    </p>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
                      Reported by <strong>{rpt.reportedBy?.name}</strong> &bull; {rpt.reportedBy?.phone}
                    </div>
                  </div>

                  <div style={{ background: "var(--bg-app)", padding: "0.75rem", borderRadius: "var(--radius-sm)" }}>
                    <h4 style={{ fontSize: "0.82rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem" }}>
                      Water point
                    </h4>
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, marginTop: "0.2rem", textTransform: "capitalize" }}>
                      {wp ? `${wp.type.replace(/_/g, " ")} — ${wp.landmark}` : "Unknown location"}
                    </div>
                    {wp && (
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                        Serves <strong>{wp.householdsServed}</strong> households &bull; <StatusBadge status={wp.status} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Assigned Technician or Resolution Info */}
                {rpt.status === "assigned" && (
                  <div style={{
                      marginTop: "0.75rem", padding: "0.75rem 1rem",
                      background: "#f0f9ff", border: "1px solid #bae6fd",
                      borderRadius: "var(--radius-sm)", fontSize: "0.875rem",
                      display: "flex", alignItems: "center",
                      justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem"
                    }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#0c4a6e", marginBottom: "0.15rem" }}>
                        Technician assigned: {tech ? tech.name : "—"}
                      </div>
                      {tech && (
                        <div style={{ fontSize: "0.8rem", color: "#0369a1" }}>
                          Phone: {tech.phone} &bull; Skills: {tech.skills?.join(", ")}
                        </div>
                      )}
                    </div>
                    <button className="btn btn-primary"
                      onClick={() => setResolvingReport(rpt)}
                      style={{ minHeight: "40px", fontSize: "0.875rem" }}>
                      Mark as fixed
                    </button>
                  </div>
                )}

                {rpt.status === "resolved" && (
                  <div style={{
                      marginTop: "0.75rem", padding: "0.65rem 1rem",
                      background: "#f0fdf4", border: "1px solid #86efac",
                      borderRadius: "var(--radius-sm)", fontSize: "0.875rem", color: "#166534"
                    }}>
                    <div>
                      <strong>Fixed on {formatDate(rpt.resolvedAt)}</strong>
                      {rpt.costUGX != null && (
                        <span style={{ marginLeft: "0.75rem" }}>
                          Cost: <strong>{formatUGX(rpt.costUGX)}</strong>
                        </span>
                      )}
                    </div>
                    {rpt.notes && (
                      <div style={{ marginTop: "0.25rem", color: "#15803d", fontSize: "0.825rem" }}>
                        Notes: {rpt.notes.replace(/\s*\|\s*Payment ref:.*$/, "").trim()}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions Row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: "0.75rem",
                    paddingTop: "0.5rem",
                    borderTop: "1px dashed var(--border-light)"
                  }}
                >
                  <div>
                    {hasHistory && (
                      <button
                        onClick={() => setExpandedHistoryId(isExpanded ? null : rpt._id)}
                        className="btn btn-outline"
                        style={{ minHeight: "36px", padding: "0.3rem 0.75rem", fontSize: "0.8rem" }}
                      >
                        {isExpanded ? "Hide history" : "View history"}
                      </button>
                    )}
                  </div>
                  <div>
                    {rpt.status === "open" && (
                      <button className="btn btn-primary"
                        onClick={() => setAssigningReport(rpt)}
                        style={{ minHeight: "40px", fontSize: "0.875rem" }}>
                        Choose a technician
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable Audit Trail */}
                {isExpanded && hasHistory && (
                  <div
                    style={{
                      marginTop: "0.75rem",
                      padding: "0.75rem",
                      background: "var(--bg-app)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.8rem"
                    }}
                  >
                    <div style={{ fontWeight: "700", marginBottom: "0.4rem" }}>Status History Audit Trail:</div>
                    <ul style={{ paddingLeft: "1.2rem", margin: 0 }}>
                      {rpt.statusHistory.map((h, idx) => (
                        <li key={idx} style={{ marginBottom: "0.25rem" }}>
                          <strong>{h.status?.toUpperCase()}</strong> &mdash; {formatDate(h.at)}: {h.by}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assign Technician Modal */}
      {assigningReport && (
        <AssignTechnicianModal
          report={assigningReport}
          waterPoint={waterPointsMap[assigningReport.waterPointId]}
          onClose={() => setAssigningReport(null)}
          onAssigned={() => {
            setAssigningReport(null);
            loadReports();
          }}
        />
      )}

      {/* Mark Repaired Modal */}
      {resolvingReport && (
        <MarkRepairedModal
          report={resolvingReport}
          onClose={() => setResolvingReport(null)}
          onResolved={() => {
            setResolvingReport(null);
            loadReports();
          }}
        />
      )}
    </div>
  );
}

export default ReportsList;

