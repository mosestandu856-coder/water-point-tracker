// frontend/src/components/ProtectedRoute.jsx
// Client-side route protection verifying authentication state and role permissions.
// Also intercepts "pending" accounts and shows a waiting-room screen instead of
// redirecting them to the dashboard — they have a valid cookie but no access yet.

import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// ── Pending Approval Screen ──────────────────────────────────────────────────
// Shown to any self-registered user whose status is still "pending".
// No navigation links are visible — they simply wait for an officer to approve.
function PendingApprovalScreen({ user, logout }) {
  const HELP_PHONE = import.meta.env.VITE_HELP_PHONE_DISPLAY || "0800 000 000";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
        padding: "1.5rem"
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "1rem",
          padding: "2.5rem 2rem",
          maxWidth: "440px",
          width: "100%",
          boxShadow: "0 8px 32px rgba(3,105,161,0.10)",
          textAlign: "center",
          border: "1px solid #e0f2fe"
        }}
      >
        {/* Hourglass icon */}
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: "#eff6ff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.25rem",
            fontSize: "1.75rem"
          }}
          aria-hidden="true"
        >
          ⏳
        </div>

        <h1 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0c4a6e", marginBottom: "0.5rem" }}>
          Account Pending Approval
        </h1>

        <p style={{ fontSize: "0.9rem", color: "#475569", marginBottom: "1.25rem", lineHeight: 1.6 }}>
          Hi <strong>{user?.name}</strong>, your account request has been received.
          A District Officer will review and approve your registration before you can access the system.
        </p>

        {/* Status chip */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            background: "#fef3c7",
            color: "#92400e",
            border: "1px solid #fde68a",
            borderRadius: "9999px",
            padding: "0.35rem 0.85rem",
            fontSize: "0.78rem",
            fontWeight: 700,
            marginBottom: "1.5rem"
          }}
        >
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
          Awaiting officer approval
        </div>

        <p style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "1.5rem" }}>
          Need help? Call the district water desk at{" "}
          <a href={`tel:${HELP_PHONE.replace(/\s/g, "")}`} style={{ color: "#0369a1", fontWeight: 600 }}>
            {HELP_PHONE}
          </a>
        </p>

        {/* Sign out button */}
        <button
          onClick={logout}
          style={{
            background: "transparent",
            border: "2px solid #e2e8f0",
            borderRadius: "0.5rem",
            padding: "0.6rem 1.5rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "#64748b",
            cursor: "pointer",
            minHeight: "44px"
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

// ── ProtectedRoute ───────────────────────────────────────────────────────────
export function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-indicator" style={{ minHeight: "50vh" }}>
        <div className="spinner" />
        <span>Verifying authentication...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Pending users have a valid session cookie but no access to the app yet.
  // Show the waiting screen on every protected route until an officer approves them.
  if (user.status === "pending") {
    return <PendingApprovalScreen user={user} logout={logout} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // If user's role is not allowed on this specific page, redirect them to dashboard
    return <Navigate to="/" replace />;
  }

  return children;
}

export default ProtectedRoute;

