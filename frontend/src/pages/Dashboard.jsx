// frontend/src/pages/Dashboard.jsx
// Main operational dashboard screen for local council chairpersons and water officers.
// Renders key metric cards, the list of broken water points (Query 1), and the oldest-first FIFO dispatch queue (Query 3).

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { StatusBadge } from "../components/StatusBadge";
import { formatReportAge, formatDate } from "../utils/formatters";
import { CommunityDashboard } from "./dashboards/CommunityDashboard";
import { VolunteerDashboard } from "./dashboards/VolunteerDashboard";
import { TechnicianDashboard } from "./dashboards/TechnicianDashboard";
import { OfficerDashboard } from "./dashboards/OfficerDashboard";
import { AdminDashboard } from "./dashboards/AdminDashboard";

export function Dashboard() {
  const { role } = useAuth();

  // Role Router: Render role-specific dashboards
  if (role === "admin") {
    return <AdminDashboard />;
  }
  if (role === "community") {
    return <CommunityDashboard />;
  }
  if (role === "volunteer") {
    return <VolunteerDashboard />;
  }
  if (role === "technician") {
    return <TechnicianDashboard />;
  }
  if (role === "officer") {
    return <OfficerDashboard />;
  }
  const [summary, setSummary] = useState(null);
  const [brokenPoints, setBrokenPoints] = useState([]);
  const [openReports, setOpenReports] = useState([]);
  const [communitiesMap, setCommunitiesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch data concurrently for fast mobile loading
        const [summaryData, brokenData, reportsData, commsData] = await Promise.all([
          api.getSummary(),
          api.getWaterPoints({ status: "broken" }),
          api.getReports({ status: "open" }),
          api.getCommunities()
        ]);

        // Build community lookup dictionary (_id -> name)
        const commMap = {};
        commsData.forEach((c) => {
          commMap[c._id] = c.name;
        });

        setSummary(summaryData);
        setBrokenPoints(brokenData);
        setOpenReports(reportsData);
        setCommunitiesMap(commMap);
      } catch (err) {
        console.error("Dashboard failed to load:", err);
        setError(err.message || "Failed to load dashboard data. Ensure backend is running.");
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="loading-indicator">
        <div className="spinner" />
        <span>Loading operational dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error">
        <div>
          <strong>Dashboard Connection Error:</strong> {error}
          <div style={{ marginTop: "0.5rem" }}>
            <button
              onClick={() => window.location.reload()}
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

  return (
    <div>
      {/* Top Action Banner */}
      <div
        className="card"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          background: "linear-gradient(135deg, var(--primary-50) 0%, #ffffff 100%)",
          borderColor: "var(--primary-100)"
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: "800", color: "var(--primary-900)" }}>
            Kalagala Sub-county Water Infrastructure Desk
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            Community-driven monitoring linking citizen reports directly to qualified mechanics.
          </p>
        </div>
        <Link to="/report" className="btn btn-primary">
          Report a Breakdown
        </Link>
      </div>

      {/* Summary KPI Metrics */}
      <section aria-labelledby="summary-metrics-title">
        <h2 id="summary-metrics-title" className="sr-only" style={{ display: "none" }}>
          Operational Metrics
        </h2>
        <div className="stat-grid">
          <div className="stat-card" style={{ borderTop: "4px solid var(--status-working-text)" }}>
            <div className="stat-value" style={{ color: "var(--status-working-text)" }}>
              {summary?.waterPoints?.working ?? 0}
            </div>
            <div className="stat-label">Working Points</div>
          </div>

          <div className="stat-card" style={{ borderTop: "4px solid var(--status-broken-text)" }}>
            <div className="stat-value" style={{ color: "var(--status-broken-text)" }}>
              {summary?.waterPoints?.broken ?? 0}
            </div>
            <div className="stat-label">Broken Outages</div>
          </div>

          <div className="stat-card" style={{ borderTop: "4px solid var(--status-low-text)" }}>
            <div className="stat-value" style={{ color: "var(--status-low-text)" }}>
              {summary?.waterPoints?.low_yield ?? 0}
            </div>
            <div className="stat-label">Low Yield</div>
          </div>

          <div className="stat-card" style={{ borderTop: "4px solid var(--primary-600)" }}>
            <div className="stat-value" style={{ color: "var(--primary-700)" }}>
              {summary?.reports?.open ?? 0}
            </div>
            <div className="stat-label">Open Reports</div>
          </div>

          <div className="stat-card" style={{ borderTop: "4px solid #6366f1" }}>
            <div className="stat-value" style={{ color: "#4f46e5" }}>
              {summary?.affectedHouseholds ?? 0}
            </div>
            <div className="stat-label">Households Deprived</div>
          </div>
        </div>
      </section>

      {/* Query 1: Broken Water Points */}
      <div className="card">
        <div className="card-title">
          <div>
            <span>Broken Water Points</span>
            <span style={{ fontSize: "0.8rem", fontWeight: "normal", color: "var(--text-muted)", marginLeft: "0.5rem" }}>
              (Query 1 Equality Filter)
            </span>
          </div>
          <Link
            to="/water-points?status=broken"
            style={{ fontSize: "0.85rem", color: "var(--primary-600)", textDecoration: "none", fontWeight: "600" }}
          >
            View All Water Points &rarr;
          </Link>
        </div>

        {brokenPoints.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-text">No water points currently marked broken.</div>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Community</th>
                  <th>Landmark</th>
                  <th>Households</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {brokenPoints.map((wp) => (
                  <tr key={wp._id}>
                    <td>
                      <strong>{wp._id}</strong>
                    </td>
                    <td style={{ textTransform: "capitalize" }}>
                      {wp.type.replace("_", " ")}
                    </td>
                    <td>{communitiesMap[wp.communityId] || wp.communityId}</td>
                    <td>{wp.landmark}</td>
                    <td>{wp.householdsServed}</td>
                    <td>
                      <StatusBadge status={wp.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Query 3: Open Reports FIFO Queue */}
      <div className="card">
        <div className="card-title">
          <div>
            <span>Open Breakdown Reports Queue</span>
            <span style={{ fontSize: "0.8rem", fontWeight: "normal", color: "var(--text-muted)", marginLeft: "0.5rem" }}>
              (Query 3 FIFO Oldest-First)
            </span>
          </div>
          <Link
            to="/reports"
            style={{ fontSize: "0.85rem", color: "var(--primary-600)", textDecoration: "none", fontWeight: "600" }}
          >
            Open Dispatch Queue &rarr;
          </Link>
        </div>

        {openReports.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-text">Zero open reports — all reported faults have been assigned or resolved.</div>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Report ID</th>
                  <th>Water Point</th>
                  <th>Problem Reported</th>
                  <th>Severity</th>
                  <th>Wait Time</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {openReports.map((rpt) => (
                  <tr key={rpt._id}>
                    <td>
                      <strong>{rpt._id}</strong>
                    </td>
                    <td>
                      <code>{rpt.waterPointId}</code>
                    </td>
                    <td>{rpt.problem}</td>
                    <td>
                      <StatusBadge status={rpt.severity} />
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                      {formatReportAge(rpt.reportedAt)}
                    </td>
                    <td>
                      <Link
                        to={`/reports?assign=${rpt._id}`}
                        className="btn btn-outline"
                        style={{ minHeight: "36px", padding: "0.35rem 0.85rem", fontSize: "0.85rem" }}
                      >
                        Assign Technician
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;

