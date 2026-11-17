// frontend/src/pages/ReportBreakdown.jsx
// Form allowing local council chairpersons, health volunteers, and students to report water point faults.
// Automatically filters water points by the chosen community and triggers POST /api/reports.

import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { StatusBadge } from "../components/StatusBadge";

export function ReportBreakdown() {
  const navigate = useNavigate();

  const [communities, setCommunities] = useState([]);
  const [waterPoints, setWaterPoints] = useState([]);
  const [selectedCommunity, setSelectedCommunity] = useState("");
  const [selectedWaterPoint, setSelectedWaterPoint] = useState("");

  const [formData, setFormData] = useState({
    reporterName: "",
    reporterPhone: "",
    reporterRole: "",
    problem: "",
    severity: "medium"
  });

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successReport, setSuccessReport] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Load communities list on mount
  useEffect(() => {
    async function loadCommunities() {
      try {
        setLoadingInitial(true);
        const data = await api.getCommunities();
        setCommunities(data);
        if (data.length > 0) {
          setSelectedCommunity(data[0]._id);
        }
      } catch (err) {
        setErrorMessage("Failed to load communities: " + err.message);
      } finally {
        setLoadingInitial(false);
      }
    }
    loadCommunities();
  }, []);

  // When community changes, fetch only water points for that community
  useEffect(() => {
    if (!selectedCommunity) return;

    async function loadPointsForCommunity() {
      try {
        setLoadingPoints(true);
        setSelectedWaterPoint("");
        const data = await api.getWaterPoints({ communityId: selectedCommunity });
        setWaterPoints(data);
        if (data.length > 0) {
          setSelectedWaterPoint(data[0]._id);
        }
      } catch (err) {
        setErrorMessage("Failed to load water points: " + err.message);
      } finally {
        setLoadingPoints(false);
      }
    }

    loadPointsForCommunity();
  }, [selectedCommunity]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessReport(null);

    // Front-end validation
    if (!selectedWaterPoint) {
      setErrorMessage("Please select a valid water point.");
      return;
    }
    if (!formData.reporterName.trim()) {
      setErrorMessage("Please enter the reporter's full name.");
      return;
    }
    if (!formData.reporterPhone.trim()) {
      setErrorMessage("Please enter a valid telephone contact.");
      return;
    }
    if (!formData.problem.trim()) {
      setErrorMessage("Please describe the mechanical or water quality problem.");
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        waterPointId: selectedWaterPoint,
        reportedBy: {
          name: formData.reporterName.trim(),
          phone: formData.reporterPhone.trim(),
          ...(formData.reporterRole.trim() ? { role: formData.reporterRole.trim() } : {})
        },
        problem: formData.problem.trim(),
        severity: formData.severity
      };

      const result = await api.createReport(payload);
      setSuccessReport(result);

      // Reset form text fields
      setFormData({
        reporterName: "",
        reporterPhone: "",
        reporterRole: "",
        problem: "",
        severity: "medium"
      });
    } catch (err) {
      setErrorMessage(err.message || "Failed to submit report. Please check server connection.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInitial) {
    return (
      <div className="loading-indicator">
        <div className="spinner" />
        <span>Loading reporting form...</span>
      </div>
    );
  }

  const currentWp = waterPoints.find((wp) => wp._id === selectedWaterPoint);

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto" }}>
      <div className="card">
        <div className="card-title">
          <span>Report a Water Point Breakdown</span>
          <span className="badge badge-open">Step 1: File Fault</span>
        </div>

        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.25rem" }}>
          Filing a breakdown enters the issue into the FIFO dispatch queue and automatically marks the physical water point as <strong>Broken</strong>.
        </p>

        {errorMessage && (
          <div className="alert alert-error">
            <div>
              <strong>Error:</strong> {errorMessage}
            </div>
          </div>
        )}

        {successReport && (
          <div className="alert alert-success">
            <div>
              <strong>Breakdown Report Successfully Registered!</strong>
              <div style={{ marginTop: "0.25rem" }}>
                Assigned ID: <strong>{successReport._id}</strong> for water point <code>{successReport.waterPointId}</code>.
              </div>
              <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
                <Link
                  to="/reports"
                  className="btn btn-outline"
                  style={{ minHeight: "36px", padding: "0.35rem 0.75rem", fontSize: "0.85rem" }}
                >
                  View in Dispatch Queue &rarr;
                </Link>
                <button
                  type="button"
                  onClick={() => setSuccessReport(null)}
                  className="btn btn-outline"
                  style={{ minHeight: "36px", padding: "0.35rem 0.75rem", fontSize: "0.85rem" }}
                >
                  File Another Report
                </button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* 1. Community Selection */}
          <div className="form-group">
            <label htmlFor="communitySelect" className="form-label">
              1. Community (Settlement)
            </label>
            <select
              id="communitySelect"
              className="form-control"
              value={selectedCommunity}
              onChange={(e) => setSelectedCommunity(e.target.value)}
              disabled={submitting}
            >
              {communities.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} ({c.district} District)
                </option>
              ))}
            </select>
          </div>

          {/* 2. Water Point Selection (filtered by chosen community) */}
          <div className="form-group">
            <label htmlFor="waterPointSelect" className="form-label">
              2. Water Point
            </label>
            {loadingPoints ? (
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Loading water points for selected community...
              </div>
            ) : waterPoints.length === 0 ? (
              <div className="alert alert-error">
                No water points registered in this community.
              </div>
            ) : (
              <select
                id="waterPointSelect"
                className="form-control"
                value={selectedWaterPoint}
                onChange={(e) => setSelectedWaterPoint(e.target.value)}
                disabled={submitting}
              >
                {waterPoints.map((wp) => (
                  <option key={wp._id} value={wp._id}>
                    {wp._id}: {wp.type.replace("_", " ")} &mdash; {wp.landmark} ({wp.householdsServed} households)
                  </option>
                ))}
              </select>
            )}

            {currentWp && (
              <div
                style={{
                  marginTop: "0.5rem",
                  padding: "0.5rem 0.75rem",
                  background: "var(--bg-app)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.85rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}
              >
                <span>Current Operational Status:</span>
                <StatusBadge status={currentWp.status} />
              </div>
            )}
          </div>

          {/* 3. Reporter Information */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div className="form-group">
              <label htmlFor="reporterName" className="form-label">
                Reporter's Full Name *
              </label>
              <input
                id="reporterName"
                name="reporterName"
                type="text"
                className="form-control"
                placeholder="e.g. Esther Nakato"
                value={formData.reporterName}
                onChange={handleChange}
                disabled={submitting}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="reporterPhone" className="form-label">
                Contact Phone *
              </label>
              <input
                id="reporterPhone"
                name="reporterPhone"
                type="text"
                className="form-control"
                placeholder="e.g. 07XX XXX XXX"
                value={formData.reporterPhone}
                onChange={handleChange}
                disabled={submitting}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="reporterRole" className="form-label">
              Reporter's Community Role (Optional)
            </label>
            <input
              id="reporterRole"
              name="reporterRole"
              type="text"
              className="form-control"
              placeholder="e.g. Chairperson, Health Volunteer, Student Volunteer"
              value={formData.reporterRole}
              onChange={handleChange}
              disabled={submitting}
            />
          </div>

          {/* 4. Problem Description */}
          <div className="form-group">
            <label htmlFor="problem" className="form-label">
              Problem Description *
            </label>
            <textarea
              id="problem"
              name="problem"
              className="form-control"
              rows={3}
              placeholder="Describe the failure (e.g. Pump handle snapped, water is discolored, zero pressure)..."
              value={formData.problem}
              onChange={handleChange}
              disabled={submitting}
              required
            />
          </div>

          {/* 5. Severity Selection */}
          <div className="form-group">
            <label className="form-label">Severity Level *</label>
            <div className="radio-card-grid">
              {[
                { val: "low", label: "Low", desc: "Minor leak, water still flowing" },
                { val: "medium", label: "Medium", desc: "Low yield or muddy water" },
                { val: "high", label: "High", desc: "Complete outage, immediate danger" }
              ].map((s) => (
                <div
                  key={s.val}
                  className={`radio-card ${formData.severity === s.val ? "selected" : ""}`}
                  onClick={() => setFormData((prev) => ({ ...prev, severity: s.val }))}
                >
                  <StatusBadge status={s.val} />
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
                    {s.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <div style={{ marginTop: "1.75rem", display: "flex", gap: "1rem" }}>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={submitting || waterPoints.length === 0}
            >
              {submitting ? "Registering in MongoDB..." : "Submit Breakdown Report"}
            </button>
            <Link to="/" className="btn btn-outline">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ReportBreakdown;

