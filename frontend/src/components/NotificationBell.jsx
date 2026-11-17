// frontend/src/components/NotificationBell.jsx
// In-app alert bell — shows unread notifications and, for admin, actionable items.
//
// Improvements:
//   - Admin notifications for PENDING_REGISTRATION and ACCOUNT_LOCKED show an
//     action button that navigates directly to the right tab (Requests / Users).
//   - Notification type drives an icon and colour so the admin can scan quickly.
//   - Header title comes from LABELS (role-aware: "Action items" for admin,
//     "Notifications" for everyone else).
//   - "Mark all as read" clears the badge immediately.
//   - Messages use plain language (no internal IDs on first line).

import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { formatRelativeAge } from "../utils/formatters";

// ── Notification type config ───────────────────────────────────────────────────
// Each type gets: an icon (emoji), a colour pair, and optionally an action
// button label + the URL it navigates to.
function getTypeConfig(type = "", role = "") {
  const t = (type || "").toUpperCase();

  if (t === "PENDING_REGISTRATION") {
    return {
      icon: "New",
      bg:   "#fef3c7",
      border: "#fde68a",
      iconBg: "#fffbeb",
      label: "New account request",
      actionLabel: role === "admin" ? "Review request" : null,
      actionPath:  role === "admin" ? "/admin" : null
    };
  }
  if (t === "ACCOUNT_LOCKED") {
    return {
      icon: "Lock",
      bg:   "#fee2e2",
      border: "#fca5a5",
      iconBg: "#fff1f2",
      label: "Account locked",
      actionLabel: role === "admin" ? "View users" : null,
      actionPath:  role === "admin" ? "/admin/users" : null
    };
  }
  if (t === "REPORT_FILED" || t === "REPORT_ASSIGNED") {
    return {
      icon: "Rep",
      bg:   "#f0f9ff",
      border: "#bae6fd",
      iconBg: "#e0f2fe",
      label: "Report update",
      actionLabel: null,
      actionPath:  null
    };
  }
  if (t === "REPAIR_RESOLVED" || t === "WORK_STARTED") {
    return {
      icon: "Done",
      bg:   "#f0fdf4",
      border: "#86efac",
      iconBg: "#dcfce7",
      label: "Repair update",
      actionLabel: null,
      actionPath:  null
    };
  }
  // Default
  return {
    icon: "Info",
    bg:   "#f8fafc",
    border: "#e2e8f0",
    iconBg: "#f1f5f9",
    label: "Notification",
    actionLabel: null,
    actionPath:  null
  };
}

// ── Clean up server message text ──────────────────────────────────────────────
// Replace internal terms with plain language.
function cleanMessage(msg = "") {
  return msg
    .replace(/Admin\s*[→–-]+\s*Pending Approvals/gi, "the Requests tab")
    .replace(/Pending Approvals/gi, "Requests")
    .replace(/\(rpt_\w+\)/gi, "")          // strip bare report IDs in parentheses
    .replace(/\bAudit Log\b/gi, "Activity log")
    .trim();
}

// ── Component ─────────────────────────────────────────────────────────────────
export function NotificationBell() {
  const { role } = useAuth();
  const navigate  = useNavigate();

  const [unreadCount,    setUnreadCount]    = useState(0);
  const [notifications,  setNotifications]  = useState([]);
  const [isOpen,         setIsOpen]         = useState(false);
  const [loading,        setLoading]        = useState(false);

  const dropdownRef = useRef(null);
  const triggerRef  = useRef(null);

  const isAdmin = role === "admin";
  const headerLabel = isAdmin ? "Action items" : "Notifications";

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await api.getNotifications();
      const list = data.notifications || [];
      setNotifications(list);

      if (isAdmin) {
        // Admin badge only counts items that need action
        const actionable = list.filter(
          n => !n.read && (n.type === "PENDING_REGISTRATION" || n.type === "ACCOUNT_LOCKED")
        ).length;
        setUnreadCount(actionable);
      } else {
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (_) {
      // Non-blocking — bell failing should not break the page
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (_) {}
  };

  const handleMarkOneRead = async (id) => {
    try {
      await api.markNotificationRead(id);
      setUnreadCount(prev => Math.max(0, prev - 1));
      setNotifications(prev =>
        prev.map(n => n._id === id ? { ...n, read: true } : n)
      );
    } catch (_) {}
  };

  const handleAction = (notif, path) => {
    // Mark as read then navigate
    if (!notif.read) handleMarkOneRead(notif._id);
    setIsOpen(false);
    navigate(path);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="notif-wrapper" ref={dropdownRef}>
      {/* Bell trigger */}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(v => !v)}
        className="notif-trigger-btn"
        aria-label={`${headerLabel}, ${unreadCount} unread`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className="notif-label">{headerLabel}</span>
        {unreadCount > 0 && (
          <span
            className="notif-badge"
            aria-label={`${unreadCount} unread`}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          className="notif-dropdown"
          role="dialog"
          aria-label={headerLabel}
        >
          {/* Header */}
          <div className="notif-header">
            <h4 style={{ margin: 0, fontSize: "0.875rem", fontWeight: 700, color: "#0c4a6e" }}>
              {headerLabel}
            </h4>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="notif-clear-btn"
                  style={{ color: "#0284c7", fontWeight: 700, fontSize: "0.75rem" }}
                >
                  Mark all as read
                </button>
              )}
              {/* Close button — especially useful on phones where the panel is full-width */}
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close notifications"
                style={{
                  background: "none",
                  border: "1px solid #e2e8f0",
                  borderRadius: "4px",
                  padding: "0 0.5rem",
                  minWidth: "40px",
                  height: "32px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "#64748b",
                  flexShrink: 0
                }}
              >
                Close
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="notif-list">
            {loading && notifications.length === 0 ? (
              <div className="notif-empty">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="notif-empty">No notifications yet.</div>
            ) : (
              notifications.map(n => {
                const cfg = getTypeConfig(n.type, role);
                const isUnread = !n.read;

                return (
                  <div
                    key={n._id}
                    style={{
                      padding: "0.75rem 1rem",
                      borderBottom: "1px solid #f1f5f9",
                      background: isUnread ? cfg.bg : "#ffffff",
                      borderLeft: isUnread ? `3px solid ${cfg.border}` : "3px solid transparent",
                      cursor: "default"
                    }}
                  >
                    {/* Top row: icon + type label + timestamp */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.3rem", gap: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            width: "24px", height: "24px", borderRadius: "50%",
                            background: cfg.iconBg, display: "inline-flex",
                            alignItems: "center", justifyContent: "center",
                            fontSize: "0.75rem", flexShrink: 0
                          }}
                          aria-hidden="true"
                        >
                          {cfg.icon}
                        </span>
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          {cfg.label}
                        </span>
                        {isUnread && (
                          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#0284c7", flexShrink: 0 }} aria-label="Unread" />
                        )}
                      </div>
                      <span style={{ fontSize: "0.7rem", color: "#94a3b8", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {formatRelativeAge(n.createdAt)}
                      </span>
                    </div>

                    {/* Message */}
                    <p style={{ fontSize: "0.825rem", color: "#1e293b", lineHeight: 1.5, margin: "0 0 0.5rem 0", fontWeight: isUnread ? 600 : 400, wordBreak: "break-word" }}>
                      {cleanMessage(n.message)}
                    </p>

                    {/* Action button (admin only, for actionable types) */}
                    {cfg.actionLabel && cfg.actionPath ? (
                      <button
                        onClick={() => handleAction(n, cfg.actionPath)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          padding: "0.35rem 0.85rem",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          background: "#0284c7",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "20px",
                          cursor: "pointer",
                          minHeight: "36px",
                          width: "100%",
                          justifyContent: "center"
                        }}
                      >
                        {cfg.actionLabel} →
                      </button>
                    ) : (
                      /* Mark read on click for informational notifications */
                      isUnread && (
                        <button
                          onClick={() => handleMarkOneRead(n._id)}
                          style={{
                            background: "none",
                            border: "none",
                            fontSize: "0.7rem",
                            color: "#94a3b8",
                            cursor: "pointer",
                            padding: 0,
                            textDecoration: "underline"
                          }}
                        >
                          Mark as read
                        </button>
                      )
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer: view all link for admin */}
          {isAdmin && notifications.length > 0 && (
            <div style={{ padding: "0.6rem 1rem", borderTop: "1px solid #f1f5f9", textAlign: "center" }}>
              <button
                onClick={() => { setIsOpen(false); navigate("/admin"); }}
                style={{ background: "none", border: "none", fontSize: "0.75rem", color: "#0284c7", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
              >
                Go to Requests tab
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
