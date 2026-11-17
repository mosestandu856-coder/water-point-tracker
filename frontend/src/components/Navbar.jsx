// frontend/src/components/Navbar.jsx
// Role-aware navigation header featuring user identity, unread notification bell, and session logout.

import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import NotificationBell from "./NotificationBell";

export function Navbar() {
  const { user, role, logout, isAuthenticated } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    addToast("You have been signed out.", "info");
    navigate("/login");
  };

  return (
    <header className="app-header">
      <div className="brand-wrapper">
        <div>
          <Link to="/" className="brand-title">
            Community Water Point Tracker
          </Link>
          <div className="brand-subtitle">
            Bugema University area, Luweero District
          </div>
        </div>

        {/* User Identity & Alert Bell — only when authenticated */}
        {isAuthenticated ? (
          <div className="user-nav-actions">
            <NotificationBell />
            <div className="user-badge-container">
              <span className={`role-pill role-pill-${role}`}>{role?.toUpperCase()}</span>
              <span className="user-name-display">{user.name}</span>
            </div>
            <button onClick={handleLogout} className="btn-logout" aria-label="Sign out">
              Sign Out
            </button>
          </div>
        ) : null}
      </div>

      {/* Role-Specific Navigation Menu */}
      {isAuthenticated && role !== "admin" && (
        <nav className="app-nav" aria-label="Main Navigation">
          {role === "officer" && (
            <>
              <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                Overview
              </NavLink>
              <NavLink to="/officer/queue" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                Active repairs
              </NavLink>
              <NavLink to="/officer/water-points" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                Water points
              </NavLink>
              <NavLink to="/officer/reports" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                Reports
              </NavLink>
            </>
          )}

          {role === "community" && (
            <>
              <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                My Settlement
              </NavLink>
              <NavLink to="/report" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                Report Breakdown
              </NavLink>
              <NavLink to="/reports" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                Community Reports
              </NavLink>
              <NavLink to="/water-points" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                Local Water Points
              </NavLink>
            </>
          )}

          {role === "technician" && (
            <>
              <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                My Jobs
              </NavLink>
              <NavLink to="/water-points" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                Water Points
              </NavLink>
            </>
          )}

          {role === "volunteer" && (
            <>
              <NavLink to="/report" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                Report Breakdown
              </NavLink>
              <NavLink to="/reports" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                My Filed Reports
              </NavLink>
            </>
          )}
        </nav>
      )}
    </header>
  );
}

export default Navbar;
