// frontend/src/pages/dashboards/AdminDashboard.jsx
// Dedicated system administration dashboard for users with the 'admin' role.
// Capabilities:
//   - Review, approve, and reject self-registration account requests
//   - Manage system user accounts (create, activate/deactivate, role changes, password resets)
//   - Inspect the append-only activity log
//   - Safeguards: prevents disabling or demoting own account or the last active admin

import React, { useState, useEffect, useRef } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { formatDate, formatRelativeAge } from "../../utils/formatters";
import { LABELS } from "../../constants/labels";

export function AdminDashboard() {
  const { user: currentUser } = useAuth();

  // Navigation tabs within Admin Dashboard (A1: Requests, Users, Activity log)
  const [activeTab, setActiveTab] = useState("requests");

  // Core administrative data
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Users Tab: Search, Filtering & Pagination (C4)
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("");
  const [userPage, setUserPage] = useState(1);
  const userPageSize = 8;

  // Add User Modal state (C7)
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    phone: "",
    role: "volunteer",
    linkedId: "",
    email: ""
  });
  const [userFormError, setUserFormError] = useState(null);
  const [userFormSubmitting, setUserFormSubmitting] = useState(false);

  // Change Role Modal state (C8)
  const [changeRoleModal, setChangeRoleModal] = useState({
    open: false,
    user: null,
    newRole: "volunteer",
    linkedId: "",
    reason: "",
    error: null,
    submitting: false
  });

  // Disable / Enable Confirmation Modal state (D3)
  const [statusConfirmModal, setStatusConfirmModal] = useState({
    open: false,
    user: null,
    targetActive: false,
    reason: "",
    error: null,
    submitting: false
  });

  // Password Reset Confirmation Modal state (D4)
  const [resetConfirmModal, setResetConfirmModal] = useState({
    open: false,
    user: null,
    reason: "",
    error: null,
    submitting: false
  });

  // One-Time Temporary Password Display Modal (D4)
  const [oneTimePasswordModal, setOneTimePasswordModal] = useState({
    open: false,
    userName: "",
    temporaryPassword: "",
    copied: false
  });

  // User Details Modal (C1: Internal IDs shown only in details view)
  const [detailsModalUser, setDetailsModalUser] = useState(null);

  // Approve Request Confirmation Modal state (E1)
  const [approveModal, setApproveModal] = useState({
    open: false,
    user: null,
    role: "volunteer",
    linkedId: "",
    error: null,
    submitting: false
  });

  // Reject Request Confirmation Modal state (E1)
  const [rejectModal, setRejectModal] = useState({
    open: false,
    user: null,
    note: "",
    error: null,
    submitting: false
  });

  // Activity Log Search, Filters & Pagination state (E2)
  const [activitySearch, setActivitySearch] = useState("");
  const [activityActionFilter, setActivityActionFilter] = useState("");
  const [activityDateFilter, setActivityDateFilter] = useState("all"); // "all", "today", "7days", "30days"
  const [activityPage, setActivityPage] = useState(1);
  const activityPageSize = 10;
  const [activityDetailsModal, setActivityDetailsModal] = useState(null);

  // Load users, audit logs, communities, and technicians
  const loadAdminData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [usersData, auditData, commsData, techsData] = await Promise.all([
        api.getUsers(),
        api.getAuditLogs({ limit: 200 }),
        api.getCommunities().catch(() => []),
        api.getTechnicians().catch(() => [])
      ]);
      setUsers(usersData || []);
      setAuditLogs(auditData.logs || []);
      setCommunities(commsData || []);
      setTechnicians(techsData || []);
    } catch (err) {
      console.error("Admin data load error:", err);
      setError(err.message || "Failed to load admin data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const pendingUsers = users.filter((u) => u.status === "pending");

  // Resolved community or technician name (C2)
  const getLinkedName = (u) => {
    if (!u) return LABELS.STATUS.NONE;
    if (u.role === "officer" || u.role === "admin" || u.role === "volunteer") return LABELS.STATUS.NONE;
    if (!u.linkedId) return LABELS.STATUS.NONE;
    if (u.role === "community") {
      const comm = communities.find((c) => c._id === u.linkedId);
      return comm ? comm.name : u.linkedId;
    }
    if (u.role === "technician") {
      const tech = technicians.find((t) => t._id === u.linkedId);
      return tech ? tech.name : u.linkedId;
    }
    return LABELS.STATUS.NONE;
  };

  // Find unlinked communities and technicians for assignment (C7, C8)
  const linkedCommIds = new Set(
    users.filter((u) => u.role === "community" && u.active && u.linkedId).map((u) => u.linkedId)
  );
  const linkedTechIds = new Set(
    users.filter((u) => u.role === "technician" && u.active && u.linkedId).map((u) => u.linkedId)
  );

  // Search & Filtered Users list (C4)
  const filteredUsers = users.filter((u) => {
    if (userSearch) {
      const q = userSearch.toLowerCase().trim();
      const nameMatch = (u.name || "").toLowerCase().includes(q);
      const phoneMatch = (u.phone || "").replace(/\s/g, "").includes(q.replace(/\s/g, ""));
      if (!nameMatch && !phoneMatch) return false;
    }
    if (userRoleFilter && u.role !== userRoleFilter) return false;
    if (userStatusFilter) {
      if (userStatusFilter === "active" && (!u.active || u.status === "pending")) return false;
      if (userStatusFilter === "disabled" && (u.active || u.status === "pending")) return false;
      if (userStatusFilter === "pending" && u.status !== "pending") return false;
    }
    return true;
  });

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / userPageSize));
  const paginatedUsers = filteredUsers.slice((userPage - 1) * userPageSize, userPage * userPageSize);

  // Open Disable / Enable confirmation dialog (D3)
  const openStatusConfirm = (targetUser, targetActive) => {
    setStatusConfirmModal({
      open: true,
      user: targetUser,
      targetActive,
      reason: "",
      error: null,
      submitting: false
    });
  };

  const handleConfirmStatus = async (e) => {
    e.preventDefault();
    const { user, targetActive, reason } = statusConfirmModal;
    if (!user) return;
    try {
      setStatusConfirmModal((prev) => ({ ...prev, submitting: true, error: null }));
      await api.toggleUserStatus(user._id, targetActive, reason);
      setStatusConfirmModal({ open: false, user: null, targetActive: false, reason: "", error: null, submitting: false });
      await loadAdminData();
    } catch (err) {
      setStatusConfirmModal((prev) => ({ ...prev, error: err.message || "Failed to update user status.", submitting: false }));
    }
  };

  // Open Change Role confirmation dialog (C8)
  const openChangeRole = (targetUser) => {
    setChangeRoleModal({
      open: true,
      user: targetUser,
      newRole: targetUser.role,
      linkedId: targetUser.linkedId || "",
      reason: "",
      error: null,
      submitting: false
    });
  };

  const handleConfirmRoleChange = async (e) => {
    e.preventDefault();
    const { user, newRole, linkedId, reason } = changeRoleModal;
    if (!user) return;
    try {
      setChangeRoleModal((prev) => ({ ...prev, submitting: true, error: null }));
      await api.updateUserRole(user._id, newRole, linkedId, reason);
      setChangeRoleModal({ open: false, user: null, newRole: "volunteer", linkedId: "", reason: "", error: null, submitting: false });
      await loadAdminData();
    } catch (err) {
      setChangeRoleModal((prev) => ({ ...prev, error: err.message || "Failed to change user role.", submitting: false }));
    }
  };

  // Open Reset Password confirmation dialog (D4)
  const openResetPassword = (targetUser) => {
    setResetConfirmModal({
      open: true,
      user: targetUser,
      reason: "",
      error: null,
      submitting: false
    });
  };

  const handleConfirmResetPassword = async (e) => {
    e.preventDefault();
    const { user, reason } = resetConfirmModal;
    if (!user) return;
    try {
      setResetConfirmModal((prev) => ({ ...prev, submitting: true, error: null }));
      const result = await api.resetUserPassword(user._id, null, reason);
      setResetConfirmModal({ open: false, user: null, reason: "", error: null, submitting: false });
      // Display the one-time temporary password in a focused modal (D4)
      setOneTimePasswordModal({
        open: true,
        userName: user.name,
        temporaryPassword: result.temporaryPassword,
        copied: false
      });
      await loadAdminData();
    } catch (err) {
      setResetConfirmModal((prev) => ({ ...prev, error: err.message || "Failed to reset password.", submitting: false }));
    }
  };

  // Open Approve Confirmation Modal (E1)
  const handleOpenApprove = (u) => {
    setApproveModal({
      open: true,
      user: u,
      role: u.role || "volunteer",
      linkedId: u.linkedId || "",
      error: null,
      submitting: false
    });
  };

  // Submit Approval (E1)
  const handleSubmitApprove = async (e) => {
    e.preventDefault();
    if (!approveModal.user) return;
    try {
      setApproveModal((prev) => ({ ...prev, submitting: true, error: null }));
      await api.approveUser(approveModal.user._id, {
        role: approveModal.role,
        linkedId:
          approveModal.role === "community" || approveModal.role === "technician"
            ? approveModal.linkedId
            : null
      });
      setApproveModal({ open: false, user: null, role: "volunteer", linkedId: "", error: null, submitting: false });
      await loadAdminData();
    } catch (err) {
      setApproveModal((prev) => ({ ...prev, error: err.message || "Failed to approve user.", submitting: false }));
    }
  };

  // Open Reject Confirmation Modal (E1)
  const handleOpenReject = (u) => {
    setRejectModal({
      open: true,
      user: u,
      note: "",
      error: null,
      submitting: false
    });
  };

  // Submit Rejection (E1)
  const handleSubmitReject = async (e) => {
    e.preventDefault();
    if (!rejectModal.user) return;
    try {
      setRejectModal((prev) => ({ ...prev, submitting: true, error: null }));
      await api.rejectUser(rejectModal.user._id, { note: rejectModal.note });
      setRejectModal({ open: false, user: null, note: "", error: null, submitting: false });
      await loadAdminData();
    } catch (err) {
      setRejectModal((prev) => ({ ...prev, error: err.message || "Failed to reject user.", submitting: false }));
    }
  };

  // Create a new user (C7)
  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      setUserFormSubmitting(true);
      setUserFormError(null);
      const res = await api.createUser(newUser);
      setUserModalOpen(false);
      setNewUser({
        name: "",
        phone: "",
        role: "volunteer",
        linkedId: "",
        email: ""
      });
      // Show generated one-time temporary password (C7, D4)
      if (res.temporaryPassword) {
        setOneTimePasswordModal({
          open: true,
          userName: res.user?.name || newUser.name,
          temporaryPassword: res.temporaryPassword,
          copied: false
        });
      }
      await loadAdminData();
    } catch (err) {
      setUserFormError(err.message || "Failed to create user account.");
    } finally {
      setUserFormSubmitting(false);
    }
  };

  // Resolve user name from ID (E2)
  const getUserNameById = (id) => {
    if (!id || id === "anonymous" || id === "system") return "System";
    const found = users.find((u) => u._id === id);
    return found ? found.name : id;
  };

  // Human-readable sentence generator for audit log without raw JSON (E2)
  const renderAuditSentence = (log) => {
    const actor = getUserNameById(log.userId);
    const d = log.details || {};
    const entity = log.entity;
    const entityId = log.entityId;

    switch (log.action) {
      case "USER_APPROVED": {
        const target = d.approvedName || getUserNameById(entityId);
        const role = d.role || "volunteer";
        return `${actor} approved ${target} as a ${role}.`;
      }
      case "USER_REJECTED": {
        const target = d.rejectedName || entityId;
        const note = d.note ? ` (Note: ${d.note})` : "";
        return `${actor} rejected the registration request for ${target}${note}.`;
      }
      case "USER_CREATED": {
        const target = d.name || entityId;
        const role = d.role || "user";
        return `${actor} created a new ${role} account for ${target}.`;
      }
      case "USER_DISABLED": {
        const target = getUserNameById(entityId);
        const reason = d.reason ? ` (Reason: ${d.reason})` : "";
        return `${actor} disabled the account for ${target}${reason}.`;
      }
      case "USER_ENABLED": {
        const target = getUserNameById(entityId);
        const reason = d.reason ? ` (Reason: ${d.reason})` : "";
        return `${actor} enabled the account for ${target}${reason}.`;
      }
      case "USER_ROLE_CHANGED": {
        const target = getUserNameById(entityId);
        const newRole = d.newRole || "new role";
        const reason = d.reason ? ` (Reason: ${d.reason})` : "";
        return `${actor} changed the role for ${target} to ${newRole}${reason}.`;
      }
      case "PASSWORD_RESET_BY_ADMIN": {
        const target = getUserNameById(entityId);
        const reason = d.reason ? ` (Reason: ${d.reason})` : "";
        return `${actor} reset the password for ${target}${reason}.`;
      }
      case "ACCOUNT_LOCKED": {
        const phone = d.phone || entityId;
        return `Account for ${phone} was locked due to repeated failed logins.`;
      }
      case "LOGIN": {
        const target = getUserNameById(entityId);
        return `${target} signed in.`;
      }
      case "REPORT_FILED": {
        return `${actor} filed a new incident report (${entityId}).`;
      }
      case "REPORT_ASSIGNED": {
        const techName = d.technicianName || d.technicianId || "technician";
        return `${actor} assigned ${techName} to report ${entityId}.`;
      }
      case "REPORT_RESOLVED": {
        return `${actor} resolved incident report ${entityId}.`;
      }
      case "USER_REGISTERED": {
        const name = d.name || entityId;
        return `${name} submitted a registration request for approval.`;
      }
      default: {
        return `${actor} performed ${log.action} on ${entity} ${entityId}.`;
      }
    }
  };

  // Filtered Activity Logs with search and date range (E2)
  const filteredAuditLogs = auditLogs.filter((log) => {
    if (activityActionFilter && log.action !== activityActionFilter) {
      return false;
    }
    if (activityDateFilter !== "all") {
      const logDate = new Date(log.at);
      const now = new Date();
      if (activityDateFilter === "today") {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (logDate < startOfDay) return false;
      } else if (activityDateFilter === "7days") {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (logDate < sevenDaysAgo) return false;
      } else if (activityDateFilter === "30days") {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (logDate < thirtyDaysAgo) return false;
      }
    }
    if (activitySearch) {
      const q = activitySearch.toLowerCase().trim();
      const sentence = renderAuditSentence(log).toLowerCase();
      const action = (log.action || "").toLowerCase();
      const actor = getUserNameById(log.userId).toLowerCase();
      const entityId = (log.entityId || "").toLowerCase();
      if (!sentence.includes(q) && !action.includes(q) && !actor.includes(q) && !entityId.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const totalAuditPages = Math.ceil(filteredAuditLogs.length / activityPageSize) || 1;
  const paginatedAuditLogs = filteredAuditLogs.slice(
    (activityPage - 1) * activityPageSize,
    activityPage * activityPageSize
  );

  const uniqueAuditActions = Array.from(new Set(auditLogs.map((l) => l.action))).filter(Boolean);

  // Track any open modal (F3)
  const isAnyModalOpen =
    approveModal.open ||
    rejectModal.open ||
    userModalOpen ||
    changeRoleModal.open ||
    statusConfirmModal.open ||
    resetConfirmModal.open ||
    oneTimePasswordModal.open ||
    Boolean(detailsModalUser) ||
    Boolean(activityDetailsModal);

  // Reference to return focus after modal closes (F3)
  const lastActiveElementRef = useRef(null);

  // Focus trap: set initial focus and return focus on close (F3)
  useEffect(() => {
    if (isAnyModalOpen) {
      lastActiveElementRef.current = document.activeElement;
      const timer = setTimeout(() => {
        const modalEl = document.querySelector(".modal-content");
        if (modalEl) {
          const focusable = modalEl.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (focusable.length > 0) {
            focusable[0].focus();
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    } else {
      if (lastActiveElementRef.current && typeof lastActiveElementRef.current.focus === "function") {
        lastActiveElementRef.current.focus();
      }
    }
  }, [isAnyModalOpen]);

  // Trap Tab key navigation strictly inside open modal (F3)
  useEffect(() => {
    const handleTabTrap = (e) => {
      if (!isAnyModalOpen || e.key !== "Tab") return;
      const modalEl = document.querySelector(".modal-content");
      if (!modalEl) return;

      const focusable = Array.from(
        modalEl.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;

      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl || !modalEl.contains(document.activeElement)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl || !modalEl.contains(document.activeElement)) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    window.addEventListener("keydown", handleTabTrap);
    return () => window.removeEventListener("keydown", handleTabTrap);
  }, [isAnyModalOpen]);

  // Escape key closes modals (F3)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (approveModal.open) setApproveModal((prev) => ({ ...prev, open: false }));
        if (rejectModal.open) setRejectModal((prev) => ({ ...prev, open: false }));
        if (userModalOpen) setUserModalOpen(false);
        if (changeRoleModal.open) setChangeRoleModal((prev) => ({ ...prev, open: false }));
        if (statusConfirmModal.open) setStatusConfirmModal((prev) => ({ ...prev, open: false }));
        if (resetConfirmModal.open) setResetConfirmModal((prev) => ({ ...prev, open: false }));
        if (oneTimePasswordModal.open) setOneTimePasswordModal((prev) => ({ ...prev, open: false }));
        if (detailsModalUser) setDetailsModalUser(null);
        if (activityDetailsModal) setActivityDetailsModal(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    approveModal.open,
    rejectModal.open,
    userModalOpen,
    changeRoleModal.open,
    statusConfirmModal.open,
    resetConfirmModal.open,
    oneTimePasswordModal.open,
    detailsModalUser,
    activityDetailsModal
  ]);

  // ── Action badge colour helper ──────────────────────────────────────────────
  // Returns an inline style object that colour-codes each audit action type,
  // matching the login page's blue/green/amber/red palette.
  function actionBadgeStyle(action = "") {
    const a = action.toUpperCase();
    // Sign-in / auth events → primary blue (matches login page button)
    if (a === "LOGIN" || a === "LOGOUT" || a.includes("PASSWORD") || a.includes("AUTH")) {
      return { padding: "0.15rem 0.55rem", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.03em", background: "#dbeafe", color: "#1d4ed8", border: "1px solid #93c5fd" };
    }
    // Approve / enable / create → green
    if (a.includes("APPROVED") || a.includes("ENABLED") || a.includes("CREATED") || a.includes("REGISTERED") || a.includes("RESOLVED") || a.includes("STARTED")) {
      return { padding: "0.15rem 0.55rem", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.03em", background: "#dcfce7", color: "#166534", border: "1px solid #86efac" };
    }
    // Reject / disable / lock → red
    if (a.includes("REJECTED") || a.includes("DISABLED") || a.includes("LOCKED") || a.includes("FAILED")) {
      return { padding: "0.15rem 0.55rem", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.03em", background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" };
    }
    // Assign / dispatch / change → amber (matches officer role colour)
    if (a.includes("ASSIGNED") || a.includes("ROLE") || a.includes("DISPATCH") || a.includes("FILED")) {
      return { padding: "0.15rem 0.55rem", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.03em", background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
    }
    // Default → neutral slate
    return { padding: "0.15rem 0.55rem", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.03em", background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" };
  }

  if (loading && users.length === 0) {
    return (
      <div className="loading-indicator">
        <div className="spinner" />
        <span>Loading {LABELS.PAGES.MANAGE_USERS.toLowerCase()}...</span>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="alert alert-error" style={{ marginBottom: "1rem" }} role="alert">
          <div>{error}</div>
        </div>
      )}

      {/* ── Admin Navigation Tabs (A1, A5: Requests, Users, Activity log; 360px fit, thick underline) ── */}
      <div className="admin-tab-list" role="tablist" aria-label="Admin Navigation Tabs" style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "requests"}
          onClick={() => setActiveTab("requests")}
          style={{
            padding: "0.5rem 1.1rem", minHeight: "44px",
            background: activeTab === "requests" ? "linear-gradient(135deg,#0369a1,#0284c7)" : "transparent",
            color: activeTab === "requests" ? "#fff" : "#0369a1",
            border: "none", borderRadius: "8px", cursor: "pointer",
            fontWeight: 700, fontSize: "0.875rem",
            boxShadow: activeTab === "requests" ? "0 4px 14px rgba(2,132,199,0.3)" : "none",
            transition: "all 0.18s ease"
          }}
        >
          {LABELS.TABS.REQUESTS}
          {pendingUsers.length > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginLeft: "0.35rem",
                minWidth: "20px",
                height: "20px",
                borderRadius: "9999px",
                background: "#dc2626",
                color: "#fff",
                fontSize: "0.7rem",
                fontWeight: 800,
                padding: "0 4px"
              }}
            >
              {pendingUsers.length}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "users"}
          onClick={() => setActiveTab("users")}
          style={{
            padding: "0.5rem 1.1rem", minHeight: "44px",
            background: activeTab === "users" ? "linear-gradient(135deg,#0369a1,#0284c7)" : "transparent",
            color: activeTab === "users" ? "#fff" : "#0369a1",
            border: "none", borderRadius: "8px", cursor: "pointer",
            fontWeight: 700, fontSize: "0.875rem",
            boxShadow: activeTab === "users" ? "0 4px 14px rgba(2,132,199,0.3)" : "none",
            transition: "all 0.18s ease"
          }}
        >
          {LABELS.TABS.USERS}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "activity"}
          onClick={() => setActiveTab("activity")}
          style={{
            padding: "0.5rem 1.1rem", minHeight: "44px",
            background: activeTab === "activity" ? "linear-gradient(135deg,#0369a1,#0284c7)" : "transparent",
            color: activeTab === "activity" ? "#fff" : "#0369a1",
            border: "none", borderRadius: "8px", cursor: "pointer",
            fontWeight: 700, fontSize: "0.875rem",
            boxShadow: activeTab === "activity" ? "0 4px 14px rgba(2,132,199,0.3)" : "none",
            transition: "all 0.18s ease"
          }}
        >
          {LABELS.TABS.ACTIVITY_LOG}
        </button>
      </div>

      {/* ── TAB 1: REQUESTS (A1, A3, B1, B4) ─────────────────────────────────── */}
      {activeTab === "requests" && (
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflow: "hidden" }}>
          <div style={{ padding: "1.1rem 1.25rem", borderBottom: "1px solid #f1f5f9" }}>
            <h1 style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0c4a6e", letterSpacing: "-0.01em", margin: 0 }}>
              {LABELS.TABS.REQUESTS}
            </h1>
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.25rem", marginBottom: 0 }}>
              {LABELS.PAGES.REQUESTS_HELP}
            </p>
          </div>
          <div style={{ padding: "1.1rem 1.25rem" }}>

          {pendingUsers.length === 0 ? (
            <div className="empty-state" style={{ padding: "3rem 1rem" }}>
              <div className="empty-state-text" style={{ fontSize: "1rem", fontWeight: 700 }}>
                {LABELS.EMPTY_STATES.NO_REQUESTS}
              </div>
            </div>
          ) : (
            <>
              {/* Desktop Table (C1, C3, E1) */}
              <div className="table-responsive requests-desktop-table">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{LABELS.COLUMNS.NAME}</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{LABELS.COLUMNS.PHONE}</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{LABELS.COLUMNS.ROLE}</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{LABELS.COLUMNS.COMMUNITY_OR_TECH}</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{LABELS.COLUMNS.DATE}</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{LABELS.COLUMNS.ACTIONS}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingUsers.map((u, idx) => (
                      <tr key={u._id} style={{ borderBottom: idx < pendingUsers.length - 1 ? "1px solid #f8fafc" : "none" }}>
                        <td style={{ padding: "0.875rem 1rem", fontWeight: 600, color: "#0f172a" }}>{u.name}</td>
                        <td style={{ padding: "0.875rem 1rem", color: "#475569" }}>
                          <span style={{ whiteSpace: "nowrap" }}>{u.phone}</span>
                        </td>
                        <td style={{ padding: "0.875rem 1rem" }}>
                          <span
                            style={{
                              background: "#d97706", color: "#fff",
                              padding: "0.2rem 0.55rem", borderRadius: "4px",
                              fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase"
                            }}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td style={{ padding: "0.875rem 1rem", color: "#475569" }}>{getLinkedName(u)}</td>
                        <td style={{ padding: "0.875rem 1rem", fontSize: "0.875rem", color: "#64748b", whiteSpace: "nowrap" }}>
                          {u.createdAt ? formatDate(u.createdAt) : "None"}
                        </td>
                        <td style={{ padding: "0.875rem 1rem" }}>
                          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "nowrap" }}>
                            <button
                              onClick={() => handleOpenApprove(u)}
                              className="btn btn-success"
                              style={{ minHeight: "44px", padding: "0.25rem 0.75rem", fontSize: "0.875rem" }}
                            >
                              {LABELS.BUTTONS.APPROVE}
                            </button>
                            <button
                              onClick={() => handleOpenReject(u)}
                              className="btn btn-danger"
                              style={{ minHeight: "44px", padding: "0.25rem 0.75rem", fontSize: "0.875rem" }}
                            >
                              {LABELS.BUTTONS.REJECT}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Stacked Cards (E1, F4: < 768px) */}
              <div className="requests-mobile-cards">
                {pendingUsers.map((u) => (
                  <div key={u._id} className="user-card">
                    <div className="user-card-header">
                      <div>
                        <div className="user-card-name">{u.name}</div>
                        <div style={{ fontSize: "0.875rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                          {u.phone}
                        </div>
                      </div>
                      <span
                        style={{
                          background: "#d97706", color: "#fff",
                          padding: "0.2rem 0.55rem", borderRadius: "4px",
                          fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase"
                        }}
                      >
                        {u.role}
                      </span>
                    </div>

                    <div style={{ fontSize: "0.875rem", margin: "0.5rem 0", color: "var(--text-muted)" }}>
                      <div>
                        <strong>{LABELS.COLUMNS.COMMUNITY_OR_TECH}:</strong> {getLinkedName(u)}
                      </div>
                      <div>
                        <strong>{LABELS.COLUMNS.DATE}:</strong> {u.createdAt ? formatDate(u.createdAt) : "None"}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", paddingTop: "0.75rem", borderTop: "1px solid #f1f5f9" }}>
                      <button
                        onClick={() => handleOpenApprove(u)}
                        className="btn btn-success"
                        style={{ flex: 1, minHeight: "44px" }}
                      >
                        {LABELS.BUTTONS.APPROVE}
                      </button>
                      <button
                        onClick={() => handleOpenReject(u)}
                        className="btn btn-danger"
                        style={{ flex: 1, minHeight: "44px" }}
                      >
                        {LABELS.BUTTONS.REJECT}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          </div>
        </div>
      )}

      {/* ── TAB 2: USERS (A1, A3, B1) ───────────────────────────────────────── */}
      {activeTab === "users" && (
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflow: "hidden" }}>
          <div style={{ padding: "1.1rem 1.25rem", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
            <div>
              <h1 style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0c4a6e", letterSpacing: "-0.01em", margin: 0 }}>
                {LABELS.TABS.USERS}
              </h1>
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.25rem", marginBottom: 0 }}>
                {LABELS.PAGES.BANNER_HELP}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setUserModalOpen(true)}
              className="btn btn-primary"
              style={{ minHeight: "44px", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
            >
              + {LABELS.BUTTONS.ADD_USER}
            </button>
          </div>
          <div style={{ padding: "1.1rem 1.25rem" }}>

          {/* Search, Filter & Pagination Bar (C4) */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1rem",
              background: "var(--bg-muted, #f8fafc)",
              padding: "0.75rem",
              borderRadius: "var(--radius-sm, 6px)"
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", flex: 1, minWidth: "260px" }}>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  setUserPage(1);
                }}
                placeholder="Search by name or phone..."
                className="form-control"
                style={{ flex: 1, minWidth: "180px", minHeight: "44px", fontSize: "0.875rem" }}
              />
              <select
                value={userRoleFilter}
                onChange={(e) => {
                  setUserRoleFilter(e.target.value);
                  setUserPage(1);
                }}
                className="form-control"
                style={{ width: "auto", minHeight: "44px", fontSize: "0.875rem" }}
              >
                <option value="">All roles</option>
                <option value="admin">Admin</option>
                <option value="officer">Officer</option>
                <option value="community">Community contact</option>
                <option value="technician">Technician</option>
                <option value="volunteer">Volunteer</option>
              </select>
              <select
                value={userStatusFilter}
                onChange={(e) => {
                  setUserStatusFilter(e.target.value);
                  setUserPage(1);
                }}
                className="form-control"
                style={{ width: "auto", minHeight: "44px", fontSize: "0.875rem" }}
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
                <option value="pending">Pending</option>
              </select>
              {(userSearch || userRoleFilter || userStatusFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setUserSearch("");
                    setUserRoleFilter("");
                    setUserStatusFilter("");
                    setUserPage(1);
                  }}
                  className="btn btn-outline"
                  style={{ minHeight: "44px", padding: "0.3rem 0.75rem", fontSize: "0.875rem" }}
                >
                  {LABELS.BUTTONS.CLEAR_FILTERS}
                </button>
              )}
            </div>

            <div style={{ fontSize: "0.875rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              Showing {filteredUsers.length === 0 ? 0 : (userPage - 1) * userPageSize + 1}–
              {Math.min(userPage * userPageSize, filteredUsers.length)} of {filteredUsers.length} users
            </div>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="empty-state" style={{ padding: "3rem 1rem" }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🔍</div>
              <div className="empty-state-text" style={{ fontSize: "1rem", fontWeight: 700 }}>
                {LABELS.EMPTY_STATES.NO_USERS_FOUND}
              </div>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="table-responsive users-desktop-table" style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", minWidth: "780px" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {[
                        { label: "Name", width: "22%" },
                        { label: "Phone number", width: "14%" },
                        { label: "Role", width: "11%" },
                        { label: "Community or technician", width: "14%" },
                        { label: "Status", width: "9%" },
                        { label: "Last sign-in", width: "11%" },
                        { label: "Actions", width: "19%" }
                      ].map(h => (
                        <th key={h.label} style={{
                          padding: "0.85rem 1rem", textAlign: "left",
                          fontSize: "0.7rem", fontWeight: 800,
                          textTransform: "uppercase", letterSpacing: "0.07em",
                          color: "#64748b", borderBottom: "2px solid #e2e8f0",
                          width: h.width, whiteSpace: "nowrap"
                        }}>{h.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedUsers.map((u, idx) => {
                      const isCurrent = u._id === currentUser?._id;
                      // Avatar initials from name
                      const initials = (u.name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
                      const avatarColors = {
                        admin: { bg: "#dbeafe", color: "#1d4ed8" },
                        officer: { bg: "#fef3c7", color: "#92400e" },
                        technician: { bg: "#dcfce7", color: "#166534" },
                        community: { bg: "#e0f2fe", color: "#0369a1" },
                        volunteer: { bg: "#f3e8ff", color: "#6b21a8" }
                      };
                      const av = avatarColors[u.role] || { bg: "#f1f5f9", color: "#475569" };
                      return (
                        <tr key={u._id} style={{
                          borderBottom: idx < paginatedUsers.length - 1 ? "1px solid #f8fafc" : "none",
                          background: isCurrent ? "#f0f9ff" : "transparent",
                          transition: "background 0.15s ease"
                        }}
                          onMouseEnter={e => !isCurrent && (e.currentTarget.style.background = "#fafafa")}
                          onMouseLeave={e => !isCurrent && (e.currentTarget.style.background = "transparent")}
                        >
                          {/* Name with avatar */}
                          <td style={{ padding: "0.85rem 1rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                              <div style={{
                                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                                background: av.bg, color: av.color,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: "0.75rem", fontWeight: 800
                              }}>{initials}</div>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "#0f172a", lineHeight: 1.2 }}>
                                  {u.name}
                                  {isCurrent && (
                                    <span style={{
                                      marginLeft: "0.4rem", fontSize: "0.65rem",
                                      background: "#dbeafe", color: "#1d4ed8",
                                      padding: "0.1rem 0.4rem", borderRadius: "4px", fontWeight: 800,
                                      verticalAlign: "middle"
                                    }}>YOU</span>
                                  )}
                                </div>
                                <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.1rem" }}>
                                  {u.email || u._id}
                                </div>
                              </div>
                            </div>
                          </td>
                          {/* Phone */}
                          <td style={{ padding: "0.85rem 1rem" }}>
                            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#334155", fontFamily: "monospace", letterSpacing: "0.02em" }}>
                              {u.phone}
                            </span>
                          </td>
                          {/* Role badge */}
                          <td style={{ padding: "0.85rem 1rem" }}>
                            <span style={{
                              display: "inline-block",
                              padding: "0.2rem 0.6rem",
                              borderRadius: "20px",
                              fontSize: "0.72rem", fontWeight: 800,
                              letterSpacing: "0.05em",
                              textTransform: "uppercase",
                              background: av.bg, color: av.color
                            }}>
                              {u.role || "volunteer"}
                            </span>
                          </td>
                          {/* Community/tech */}
                          <td style={{ padding: "0.85rem 1rem", fontSize: "0.82rem", color: "#475569" }}>
                            {getLinkedName(u)}
                          </td>
                          {/* Status */}
                          <td style={{ padding: "0.85rem 1rem" }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: "0.3rem",
                              padding: "0.2rem 0.6rem", borderRadius: "20px",
                              fontSize: "0.72rem", fontWeight: 700,
                              background: u.status === "pending" ? "#fef3c7" : u.active ? "#dcfce7" : "#fee2e2",
                              color: u.status === "pending" ? "#92400e" : u.active ? "#166534" : "#991b1b",
                              border: `1px solid ${u.status === "pending" ? "#fde68a" : u.active ? "#86efac" : "#fca5a5"}`
                            }}>
                              <span style={{
                                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                                background: u.status === "pending" ? "#f59e0b" : u.active ? "#16a34a" : "#dc2626"
                              }} />
                              {u.status === "pending" ? "Pending" : u.active ? "Active" : "Disabled"}
                            </span>
                          </td>
                          {/* Last sign-in */}
                          <td style={{ padding: "0.85rem 1rem", fontSize: "0.8rem", color: "#64748b" }}>
                            {u.lastLoginAt ? formatRelativeAge(u.lastLoginAt) : (
                              <span style={{ color: "#cbd5e1", fontStyle: "italic" }}>Never</span>
                            )}
                          </td>
                          {/* Actions */}
                          <td style={{ padding: "0.85rem 1rem" }}>
                            {isCurrent ? (
                              <span style={{ fontSize: "0.775rem", color: "#94a3b8", fontStyle: "italic" }}>Current session</span>
                            ) : (
                              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "nowrap" }}>
                                <button type="button" onClick={() => openChangeRole(u)}
                                  className="btn btn-primary btn-sm">
                                  {LABELS.BUTTONS.CHANGE_ROLE}
                                </button>
                                <button type="button" onClick={() => openStatusConfirm(u, !u.active)}
                                  className={`btn btn-sm ${u.active ? "btn-danger" : "btn-success"}`}>
                                  {u.active ? LABELS.BUTTONS.DISABLE : LABELS.BUTTONS.ENABLE}
                                </button>
                                <button type="button" onClick={() => openResetPassword(u)}
                                  className="btn btn-outline btn-sm">
                                  {LABELS.BUTTONS.RESET_PASSWORD}
                                </button>
                                <button type="button" onClick={() => setDetailsModalUser(u)}
                                  className="btn btn-outline btn-sm">
                                  Details
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Stacked Cards (max-width: 767px) (C5, C6) */}
              <div className="users-mobile-cards">
                {paginatedUsers.map((u) => {
                  const isCurrent = u._id === currentUser?._id;
                  return (
                    <div key={u._id} className="user-card">
                      <div className="user-card-header">
                        <div>
                          <div className="user-card-name">{u.name}</div>
                          <div style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "2px" }}>
                            <span style={{ whiteSpace: "nowrap" }}>{u.phone}</span>
                            {isCurrent && (
                              <span
                                style={{
                                  marginLeft: "0.4rem",
                                  fontSize: "0.875rem",
                                  background: "#e0e7ff",
                                  color: "#4338ca",
                                  padding: "0.1rem 0.35rem",
                                  borderRadius: "4px",
                                  fontWeight: 800
                                }}
                              >
                                YOU
                              </span>
                            )}
                          </div>
                        </div>
                        <span
                          style={{
                            padding: "0.15rem 0.55rem",
                            borderRadius: "20px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            background: u.status === "pending" ? "#fef3c7" : u.active ? "#dcfce7" : "#fee2e2",
                            color:      u.status === "pending" ? "#92400e" : u.active ? "#166534" : "#991b1b",
                            border: `1px solid ${u.status === "pending" ? "#fde68a" : u.active ? "#86efac" : "#fca5a5"}`
                          }}
                        >
                          {u.status === "pending" ? "Pending" : u.active ? "Active" : "Disabled"}
                        </span>
                      </div>

                      <div className="user-card-grid">
                        <div>
                          <span style={{ display: "block", fontSize: "0.875rem", color: "var(--text-muted)" }}>Role</span>
                          <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{u.role}</span>
                        </div>
                        <div>
                          <span style={{ display: "block", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                            Community or technician
                          </span>
                          <span>{getLinkedName(u)}</span>
                        </div>
                        <div>
                          <span style={{ display: "block", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                            Last sign-in
                          </span>
                          <span>{u.lastLoginAt ? formatRelativeAge(u.lastLoginAt) : "Never"}</span>
                        </div>
                      </div>

                      {isCurrent ? (
                        <div style={{ fontSize: "0.875rem", color: "var(--text-muted)", fontStyle: "italic", marginTop: "0.5rem" }}>
                          Current active session (modifications disabled)
                        </div>
                      ) : (
                        <div className="user-card-actions">
                          <button type="button" onClick={() => openChangeRole(u)}
                            className="btn btn-primary" style={{ flex: 1, minHeight: "44px" }}>
                            {LABELS.BUTTONS.CHANGE_ROLE}
                          </button>
                          <button type="button" onClick={() => openStatusConfirm(u, !u.active)}
                            className={`btn ${u.active ? "btn-danger" : "btn-success"}`}
                            style={{ flex: 1, minHeight: "44px" }}>
                            {u.active ? LABELS.BUTTONS.DISABLE : LABELS.BUTTONS.ENABLE}
                          </button>
                          <button type="button" onClick={() => openResetPassword(u)}
                            className="btn btn-outline" style={{ flex: 1, minHeight: "44px" }}>
                            {LABELS.BUTTONS.RESET_PASSWORD}
                          </button>
                          <button type="button" onClick={() => setDetailsModalUser(u)}
                            className="btn btn-outline" style={{ flex: 1, minHeight: "44px" }}>
                            Details
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Pagination Controls (C4) */}
              {totalUserPages > 1 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "1.25rem",
                    paddingTop: "0.75rem",
                    borderTop: "1px solid var(--border-light, #f1f5f9)"
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                    disabled={userPage <= 1}
                    className="btn btn-outline"
                    style={{ minHeight: "44px", padding: "0.35rem 0.85rem", fontSize: "0.875rem" }}
                  >
                    Previous
                  </button>

                  <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                    Page {userPage} of {totalUserPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setUserPage((p) => Math.min(totalUserPages, p + 1))}
                    disabled={userPage >= totalUserPages}
                    className="btn btn-outline"
                    style={{ minHeight: "44px", padding: "0.35rem 0.85rem", fontSize: "0.875rem" }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
          </div>
        </div>
      )}

      {/* ── TAB 3: ACTIVITY LOG (A1, A3, B1, E2, E3) ───────────────────────── */}
      {activeTab === "activity" && (
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflow: "hidden" }}>
          <div style={{ padding: "1.1rem 1.25rem", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0c4a6e", letterSpacing: "-0.01em" }}>
              {LABELS.TABS.ACTIVITY_LOG}
            </div>
            <div style={{ fontSize: "0.875rem", color: "#64748b", marginTop: "0.25rem" }}>
              {LABELS.PAGES.ACTIVITY_LOG_HELP}
            </div>
          </div>
          <div style={{ padding: "1.1rem 1.25rem" }}>
          {/* Controls: Search, Action Filter, Date Filter (E2) */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              alignItems: "center",
              marginBottom: "1.25rem",
              background: "var(--bg-muted, #f8fafc)",
              padding: "0.75rem",
              borderRadius: "var(--radius-md, 8px)"
            }}
          >
            {/* Search Input */}
            <div style={{ flex: "1 1 200px" }}>
              <input
                type="text"
                placeholder="Search activity log..."
                value={activitySearch}
                onChange={(e) => {
                  setActivitySearch(e.target.value);
                  setActivityPage(1);
                }}
                style={{
                  width: "100%",
                  padding: "0.45rem 0.75rem",
                  fontSize: "0.875rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-color)",
                  minHeight: "44px"
                }}
              />
            </div>

            {/* Filter by Action */}
            <div style={{ flex: "0 1 180px" }}>
              <select
                value={activityActionFilter}
                onChange={(e) => {
                  setActivityActionFilter(e.target.value);
                  setActivityPage(1);
                }}
                style={{
                  width: "100%",
                  padding: "0.45rem 0.75rem",
                  fontSize: "0.875rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-color)",
                  minHeight: "44px"
                }}
              >
                <option value="">All actions ({auditLogs.length})</option>
                {uniqueAuditActions.map((act) => (
                  <option key={act} value={act}>
                    {act}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter by Date */}
            <div style={{ flex: "0 1 150px" }}>
              <select
                value={activityDateFilter}
                onChange={(e) => {
                  setActivityDateFilter(e.target.value);
                  setActivityPage(1);
                }}
                style={{
                  width: "100%",
                  padding: "0.45rem 0.75rem",
                  fontSize: "0.875rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-color)",
                  minHeight: "44px"
                }}
              >
                <option value="all">All time</option>
                <option value="today">Today</option>
                <option value="7days">Last 7 days</option>
                <option value="30days">Last 30 days</option>
              </select>
            </div>

            {/* Clear filters button if active */}
            {(activitySearch || activityActionFilter || activityDateFilter !== "all") && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setActivitySearch("");
                  setActivityActionFilter("");
                  setActivityDateFilter("all");
                  setActivityPage(1);
                }}
                style={{ minHeight: "44px", fontSize: "0.875rem", padding: "0.45rem 0.75rem" }}
              >
                {LABELS.BUTTONS.CLEAR_FILTERS}
              </button>
            )}
          </div>

          {filteredAuditLogs.length === 0 ? (
            <div className="empty-state" style={{ padding: "3rem 1rem" }}>
              <div className="empty-state-text" style={{ fontSize: "1rem", fontWeight: 700 }}>
                {auditLogs.length === 0 ? LABELS.EMPTY_STATES.NO_ACTIVITY : "No activity matches your filters."}
              </div>
            </div>
          ) : (
            <>
              {/* Desktop Table (E2) */}
              <div className="table-responsive activity-desktop-table" style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", minWidth: "640px" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {[
                        { label: "Date", width: "15%" },
                        { label: "Activity description", width: "50%" },
                        { label: "Action taken", width: "22%" },
                        { label: "Details", width: "13%" }
                      ].map(h => (
                        <th key={h.label} style={{
                          padding: "0.85rem 1rem", textAlign: "left",
                          fontSize: "0.7rem", fontWeight: 800,
                          textTransform: "uppercase", letterSpacing: "0.07em",
                          color: "#64748b", borderBottom: "2px solid #e2e8f0",
                          width: h.width, whiteSpace: "nowrap"
                        }}>{h.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedAuditLogs.map((log, idx) => (
                      <tr key={log._id || idx} style={{
                        borderBottom: idx < paginatedAuditLogs.length - 1 ? "1px solid #f8fafc" : "none",
                        transition: "background 0.12s ease"
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        {/* Date column — two-line: date + relative */}
                        <td style={{ padding: "0.9rem 1rem", whiteSpace: "nowrap", verticalAlign: "top" }}>
                          <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#0f172a" }}>
                            {formatDate(log.at)}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.15rem" }}>
                            {formatRelativeAge(log.at)}
                          </div>
                        </td>
                        {/* Activity sentence — main content */}
                        <td style={{ padding: "0.9rem 1rem", fontSize: "0.875rem", color: "#334155", lineHeight: 1.5, verticalAlign: "top" }}>
                          {renderAuditSentence(log)}
                        </td>
                        {/* Action badge */}
                        <td style={{ padding: "0.9rem 1rem", verticalAlign: "top" }}>
                          <span style={actionBadgeStyle(log.action)}>
                            {log.action}
                          </span>
                        </td>
                        {/* Details button */}
                        <td style={{ padding: "0.9rem 1rem", verticalAlign: "top" }}>
                          <button type="button" onClick={() => setActivityDetailsModal(log)}
                            className="btn btn-outline btn-sm">Details</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Stacked Cards (< 768px) */}
              <div className="activity-mobile-cards">
                {paginatedAuditLogs.map((log, idx) => (
                  <div key={log._id || idx} className="user-card">
                    <div className="user-card-header">
                      <span style={actionBadgeStyle(log.action)}>
                        {log.action}
                      </span>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        {formatRelativeAge(log.at)}
                      </div>
                    </div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 500, margin: "0.5rem 0", color: "var(--text-main)" }}>
                      {renderAuditSentence(log)}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: "0.5rem",
                        paddingTop: "0.5rem",
                        borderTop: "1px solid var(--border-light)",
                        fontSize: "0.875rem",
                        color: "var(--text-muted)"
                      }}
                    >
                      <span style={{ fontWeight: 600, color: "var(--text-main)" }}>{formatDate(log.at)}</span>
                      <button type="button" onClick={() => setActivityDetailsModal(log)}
                        className="btn btn-outline btn-sm">Details</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination Controls */}
              {totalAuditPages > 1 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "1.25rem",
                    paddingTop: "0.75rem",
                    borderTop: "1px solid var(--border-color)",
                    flexWrap: "wrap",
                    gap: "0.5rem"
                  }}
                >
                  <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                    Showing {(activityPage - 1) * activityPageSize + 1}–
                    {Math.min(activityPage * activityPageSize, filteredAuditLogs.length)} of {filteredAuditLogs.length} entries
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                      disabled={activityPage === 1}
                      style={{ minHeight: "44px", padding: "0.25rem 0.75rem", fontSize: "0.875rem" }}
                    >
                      Previous
                    </button>
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "0 0.5rem",
                        fontSize: "0.875rem",
                        color: "var(--text-muted)"
                      }}
                    >
                      Page {activityPage} of {totalAuditPages}
                    </span>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setActivityPage((p) => Math.min(totalAuditPages, p + 1))}
                      disabled={activityPage >= totalAuditPages}
                      style={{ minHeight: "44px", padding: "0.25rem 0.75rem", fontSize: "0.875rem" }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          </div>
        </div>
      )}

      {/* ── MODAL 1: ADD USER (C7) ── */}
      {userModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setUserModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-user-modal-title"
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div className="modal-header">
              <h3 id="add-user-modal-title">{LABELS.BUTTONS.ADD_USER}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setUserModalOpen(false)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateUser}>
              <div className="modal-body">
                {userFormError && (
                  <div className="alert alert-error" style={{ marginBottom: "1rem" }} role="alert">
                    <div>{userFormError}</div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">{LABELS.COLUMNS.NAME} *</label>
                  <input
                    type="text"
                    required
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    className="form-control"
                    placeholder="e.g. Grace Nakalema"
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{LABELS.COLUMNS.PHONE} *</label>
                  <input
                    type="tel"
                    required
                    value={newUser.phone}
                    onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                    className="form-control"
                    placeholder="07XX XXX XXX"
                  />
                  <span style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                    Example: 0700 000 000 or +256 700 000 000
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label">{LABELS.COLUMNS.ROLE} *</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value, linkedId: "" })}
                    className="form-control"
                  >
                    <option value="volunteer">Volunteer (Citizen Reporter)</option>
                    <option value="community">Community Contact (Chairperson)</option>
                    <option value="technician">Water Point Technician</option>
                    <option value="officer">District Water Officer</option>
                    <option value="admin">System Administrator</option>
                  </select>
                </div>

                {newUser.role === "community" && (
                  <div className="form-group">
                    <label className="form-label">Linked Settlement *</label>
                    <select
                      value={newUser.linkedId}
                      onChange={(e) => setNewUser({ ...newUser, linkedId: e.target.value })}
                      className="form-control"
                      required
                    >
                      <option value="">Select settlement...</option>
                      {communities.map((c) => {
                        const isTaken = linkedCommIds.has(c._id);
                        return (
                          <option key={c._id} value={c._id} disabled={isTaken}>
                            {c.name} {isTaken ? "(already assigned)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {newUser.role === "technician" && (
                  <div className="form-group">
                    <label className="form-label">Linked Technician Profile *</label>
                    <select
                      value={newUser.linkedId}
                      onChange={(e) => setNewUser({ ...newUser, linkedId: e.target.value })}
                      className="form-control"
                      required
                    >
                      <option value="">Select technician...</option>
                      {technicians.map((t) => {
                        const isTaken = linkedTechIds.has(t._id);
                        return (
                          <option key={t._id} value={t._id} disabled={isTaken}>
                            {t.name} {isTaken ? "(already assigned)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                <div
                  style={{
                    background: "var(--bg-muted, #f8fafc)",
                    padding: "0.75rem",
                    borderRadius: "var(--radius-sm, 6px)",
                    fontSize: "0.875rem",
                    color: "var(--text-muted)",
                    marginTop: "0.5rem"
                  }}
                >
                  ℹ A secure temporary password will be automatically generated and displayed once. The user must change their password when they first sign in.
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setUserModalOpen(false)}
                  disabled={userFormSubmitting}
                >
                  {LABELS.BUTTONS.CANCEL}
                </button>
                <button type="submit" className="btn btn-primary" disabled={userFormSubmitting}>
                  {userFormSubmitting ? "Creating..." : LABELS.BUTTONS.ADD_USER}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: CHANGE ROLE (C8) ── */}
      {changeRoleModal.open && changeRoleModal.user && (
        <div
          className="modal-backdrop"
          onClick={() => setChangeRoleModal({ ...changeRoleModal, open: false })}
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-role-modal-title"
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
            <div className="modal-header">
              <h3 id="change-role-modal-title">{LABELS.BUTTONS.CHANGE_ROLE}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setChangeRoleModal({ ...changeRoleModal, open: false })}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleConfirmRoleChange}>
              <div className="modal-body">
                <p style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
                  Change role for <strong>{changeRoleModal.user.name}</strong> ({changeRoleModal.user.phone}):
                </p>

                {changeRoleModal.error && (
                  <div className="alert alert-error" style={{ marginBottom: "1rem" }} role="alert">
                    <div>{changeRoleModal.error}</div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">New Role *</label>
                  <select
                    value={changeRoleModal.newRole}
                    onChange={(e) => setChangeRoleModal({ ...changeRoleModal, newRole: e.target.value, linkedId: "" })}
                    className="form-control"
                  >
                    <option value="volunteer">Volunteer</option>
                    <option value="community">Community contact</option>
                    <option value="technician">Technician</option>
                    <option value="officer">Officer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                {changeRoleModal.newRole === "community" && (
                  <div className="form-group">
                    <label className="form-label">Select Settlement *</label>
                    <select
                      value={changeRoleModal.linkedId}
                      onChange={(e) => setChangeRoleModal({ ...changeRoleModal, linkedId: e.target.value })}
                      className="form-control"
                      required
                    >
                      <option value="">Choose settlement...</option>
                      {communities.map((c) => {
                        const isTaken = linkedCommIds.has(c._id) && c._id !== changeRoleModal.user.linkedId;
                        return (
                          <option key={c._id} value={c._id} disabled={isTaken}>
                            {c.name} {isTaken ? "(already assigned)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {changeRoleModal.newRole === "technician" && (
                  <div className="form-group">
                    <label className="form-label">Select Technician Profile *</label>
                    <select
                      value={changeRoleModal.linkedId}
                      onChange={(e) => setChangeRoleModal({ ...changeRoleModal, linkedId: e.target.value })}
                      className="form-control"
                      required
                    >
                      <option value="">Choose technician...</option>
                      {technicians.map((t) => {
                        const isTaken = linkedTechIds.has(t._id) && t._id !== changeRoleModal.user.linkedId;
                        return (
                          <option key={t._id} value={t._id} disabled={isTaken}>
                            {t.name} {isTaken ? "(already assigned)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Reason for role change</label>
                  <input
                    type="text"
                    value={changeRoleModal.reason}
                    onChange={(e) => setChangeRoleModal({ ...changeRoleModal, reason: e.target.value })}
                    className="form-control"
                    placeholder="e.g. Elected new chairperson"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setChangeRoleModal({ ...changeRoleModal, open: false })}
                  disabled={changeRoleModal.submitting}
                >
                  {LABELS.BUTTONS.CANCEL}
                </button>
                <button type="submit" className="btn btn-primary" disabled={changeRoleModal.submitting}>
                  {changeRoleModal.submitting ? "Updating..." : "Confirm change"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 3: DISABLE / ENABLE CONFIRMATION (D3) ── */}
      {statusConfirmModal.open && statusConfirmModal.user && (
        <div
          className="modal-backdrop"
          onClick={() => setStatusConfirmModal({ ...statusConfirmModal, open: false })}
          role="dialog"
          aria-modal="true"
          aria-labelledby="status-confirm-modal-title"
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "460px" }}>
            <div className="modal-header">
              <h3 id="status-confirm-modal-title">
                {statusConfirmModal.targetActive ? "Enable account" : "Disable account"}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setStatusConfirmModal({ ...statusConfirmModal, open: false })}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleConfirmStatus}>
              <div className="modal-body">
                <p style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>
                  {statusConfirmModal.targetActive
                    ? `Are you sure you want to enable access for ${statusConfirmModal.user.name} (${statusConfirmModal.user.phone})?`
                    : `Are you sure you want to disable access for ${statusConfirmModal.user.name} (${statusConfirmModal.user.phone})? They will no longer be able to sign in.`}
                </p>

                {statusConfirmModal.error && (
                  <div className="alert alert-error" style={{ marginTop: "1rem" }} role="alert">
                    <div>{statusConfirmModal.error}</div>
                  </div>
                )}

                <div className="form-group" style={{ marginTop: "1rem" }}>
                  <label className="form-label">Reason (optional)</label>
                  <input
                    type="text"
                    value={statusConfirmModal.reason}
                    onChange={(e) => setStatusConfirmModal({ ...statusConfirmModal, reason: e.target.value })}
                    className="form-control"
                    placeholder="e.g. Account suspended per district policy"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setStatusConfirmModal({ ...statusConfirmModal, open: false })}
                  disabled={statusConfirmModal.submitting}
                >
                  {LABELS.BUTTONS.CANCEL}
                </button>
                <button
                  type="submit"
                  className={`btn ${statusConfirmModal.targetActive ? "btn-primary" : "btn-danger"}`}
                  style={{
                    backgroundColor: statusConfirmModal.targetActive ? "var(--primary-700)" : "#dc2626",
                    color: "#fff"
                  }}
                  disabled={statusConfirmModal.submitting}
                >
                  {statusConfirmModal.submitting
                    ? "Updating..."
                    : statusConfirmModal.targetActive
                    ? "Enable account"
                    : "Disable account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 4: RESET PASSWORD CONFIRMATION (D4) ── */}
      {resetConfirmModal.open && resetConfirmModal.user && (
        <div
          className="modal-backdrop"
          onClick={() => setResetConfirmModal({ ...resetConfirmModal, open: false })}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "460px" }}>
            <div className="modal-header">
              <h3 id="reset-modal-title">{LABELS.BUTTONS.RESET_PASSWORD}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setResetConfirmModal({ ...resetConfirmModal, open: false })}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleConfirmResetPassword}>
              <div className="modal-body">
                <p style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>
                  Reset password for <strong>{resetConfirmModal.user.name}</strong> ({resetConfirmModal.user.phone})?
                </p>
                <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
                  A one-time temporary password will be generated. The user will be required to set a new password upon sign-in.
                </p>

                {resetConfirmModal.error && (
                  <div className="alert alert-error" style={{ marginTop: "1rem" }} role="alert">
                    <div>{resetConfirmModal.error}</div>
                  </div>
                )}

                <div className="form-group" style={{ marginTop: "1rem" }}>
                  <label className="form-label">Reason (optional)</label>
                  <input
                    type="text"
                    value={resetConfirmModal.reason}
                    onChange={(e) => setResetConfirmModal({ ...resetConfirmModal, reason: e.target.value })}
                    className="form-control"
                    placeholder="e.g. User requested password recovery"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setResetConfirmModal({ ...resetConfirmModal, open: false })}
                  disabled={resetConfirmModal.submitting}
                >
                  {LABELS.BUTTONS.CANCEL}
                </button>
                <button type="submit" className="btn btn-primary" disabled={resetConfirmModal.submitting}>
                  {resetConfirmModal.submitting ? "Resetting..." : LABELS.BUTTONS.RESET_PASSWORD}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 5: ONE-TIME TEMPORARY PASSWORD DISPLAY (D4) ── */}
      {oneTimePasswordModal.open && (
        <div
          className="modal-backdrop"
          onClick={() => setOneTimePasswordModal({ ...oneTimePasswordModal, open: false })}
          role="dialog"
          aria-modal="true"
          aria-labelledby="one-time-pwd-title"
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "440px" }}>
            <div className="modal-header">
              <h3 id="one-time-pwd-title">Temporary Password</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setOneTimePasswordModal({ ...oneTimePasswordModal, open: false })}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              <p style={{ fontSize: "0.875rem" }}>
                Temporary password for <strong>{oneTimePasswordModal.userName}</strong>:
              </p>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "#f1f5f9",
                  padding: "0.75rem 1rem",
                  borderRadius: "var(--radius-sm, 6px)",
                  margin: "1rem 0",
                  fontFamily: "monospace",
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  border: "1px dashed #cbd5e1"
                }}
              >
                <span>{oneTimePasswordModal.temporaryPassword}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(oneTimePasswordModal.temporaryPassword);
                    setOneTimePasswordModal((prev) => ({ ...prev, copied: true }));
                    setTimeout(() => setOneTimePasswordModal((prev) => ({ ...prev, copied: false })), 2000);
                  }}
                  className="btn btn-outline"
                  style={{ minHeight: "44px", padding: "0.25rem 0.65rem", fontSize: "0.875rem" }}
                >
                  {oneTimePasswordModal.copied ? "Copied!" : "Copy"}
                </button>
              </div>

              <div
                style={{
                  background: "#eff6ff",
                  color: "#1e40af",
                  padding: "0.65rem",
                  borderRadius: "var(--radius-sm, 6px)",
                  fontSize: "0.875rem",
                  lineHeight: 1.4
                }}
              >
                <strong>Important:</strong> This password will only be shown once. Please provide it directly to the user. The user will be required to set their own new password upon signing in.
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setOneTimePasswordModal({ ...oneTimePasswordModal, open: false })}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 6: USER DETAILS (C1: Internal ID details view) ── */}
      {detailsModalUser && (
        <div
          className="modal-backdrop"
          onClick={() => setDetailsModalUser(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-details-title"
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "440px" }}>
            <div className="modal-header">
              <h3 id="user-details-title">User Account Details</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDetailsModalUser(null)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <div className="modal-body" style={{ fontSize: "0.875rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "0.6rem" }}>
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Internal ID:</span>
                <code>{detailsModalUser._id}</code>

                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Name:</span>
                <span>{detailsModalUser.name}</span>

                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Phone:</span>
                <span>{detailsModalUser.phone}</span>

                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Role:</span>
                <span style={{ textTransform: "capitalize" }}>{detailsModalUser.role}</span>

                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Status:</span>
                <span>{detailsModalUser.active ? "Active" : "Disabled"}</span>

                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Linked entity:</span>
                <span>{getLinkedName(detailsModalUser)} {detailsModalUser.linkedId ? `(${detailsModalUser.linkedId})` : ""}</span>

                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Created date:</span>
                <span>{detailsModalUser.createdAt ? formatDate(detailsModalUser.createdAt) : "None"}</span>

                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Last sign-in:</span>
                <span>{detailsModalUser.lastLoginAt ? formatRelativeAge(detailsModalUser.lastLoginAt) : "Never"}</span>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setDetailsModalUser(null)}>
                {LABELS.BUTTONS.CLOSE}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 7: APPROVE REQUEST CONFIRMATION (E1) ── */}
      {approveModal.open && approveModal.user && (
        <div
          className="modal-backdrop"
          onClick={() => !approveModal.submitting && setApproveModal((prev) => ({ ...prev, open: false }))}
          role="dialog"
          aria-modal="true"
          aria-labelledby="approve-request-title"
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "460px" }}>
            <div className="modal-header">
              <h3 id="approve-request-title">Approve user request</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !approveModal.submitting && setApproveModal((prev) => ({ ...prev, open: false }))}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmitApprove}>
              <div className="modal-body">
                {approveModal.error && (
                  <div className="alert alert-error" style={{ marginBottom: "1rem" }} role="alert">
                    <div>{approveModal.error}</div>
                  </div>
                )}

                <p style={{ fontSize: "0.9rem", color: "var(--text-main)", marginBottom: "1rem" }}>
                  Approve access for <strong>{approveModal.user.name}</strong> ({approveModal.user.phone}).
                </p>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label htmlFor="approve-role-select" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 600 }}>
                    Assigned role:
                  </label>
                  <select
                    id="approve-role-select"
                    value={approveModal.role}
                    onChange={(e) => setApproveModal((prev) => ({ ...prev, role: e.target.value, linkedId: "" }))}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-color)",
                      minHeight: "44px"
                    }}
                  >
                    <option value="volunteer">Volunteer</option>
                    <option value="community">Community contact</option>
                    <option value="technician">Technician</option>
                    <option value="officer">District Officer</option>
                    <option value="admin">System Administrator</option>
                  </select>
                </div>

                {approveModal.role === "community" && (
                  <div className="form-group" style={{ marginBottom: "1rem" }}>
                    <label htmlFor="approve-community-select" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 600 }}>
                      Select community:
                    </label>
                    <select
                      id="approve-community-select"
                      value={approveModal.linkedId}
                      onChange={(e) => setApproveModal((prev) => ({ ...prev, linkedId: e.target.value }))}
                      required
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-color)",
                        minHeight: "44px"
                      }}
                    >
                      <option value="">Select an unlinked community...</option>
                      {communities
                        .filter((c) => !linkedCommIds.has(c._id) || c._id === approveModal.user?.linkedId)
                        .map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name} ({c.district})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {approveModal.role === "technician" && (
                  <div className="form-group" style={{ marginBottom: "1rem" }}>
                    <label htmlFor="approve-tech-select" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 600 }}>
                      Select technician record:
                    </label>
                    <select
                      id="approve-tech-select"
                      value={approveModal.linkedId}
                      onChange={(e) => setApproveModal((prev) => ({ ...prev, linkedId: e.target.value }))}
                      required
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-color)",
                        minHeight: "44px"
                      }}
                    >
                      <option value="">Select an unlinked technician...</option>
                      {technicians
                        .filter((t) => !linkedTechIds.has(t._id) || t._id === approveModal.user?.linkedId)
                        .map((t) => (
                          <option key={t._id} value={t._id}>
                            {t.name} ({t.specialisation || t.skills?.join(", ")})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: 0 }}>
                  Approving sets status to active and allows the user to sign in immediately.
                </p>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setApproveModal((prev) => ({ ...prev, open: false }))}
                  disabled={approveModal.submitting}
                >
                  {LABELS.BUTTONS.CANCEL}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={approveModal.submitting}
                >
                  {approveModal.submitting ? "Approving..." : LABELS.BUTTONS.APPROVE}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 8: REJECT REQUEST CONFIRMATION (E1) ── */}
      {rejectModal.open && rejectModal.user && (
        <div
          className="modal-backdrop"
          onClick={() => !rejectModal.submitting && setRejectModal((prev) => ({ ...prev, open: false }))}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-request-title"
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "460px" }}>
            <div className="modal-header">
              <h3 id="reject-request-title">Reject registration request</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !rejectModal.submitting && setRejectModal((prev) => ({ ...prev, open: false }))}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmitReject}>
              <div className="modal-body">
                {rejectModal.error && (
                  <div className="alert alert-error" style={{ marginBottom: "1rem" }} role="alert">
                    <div>{rejectModal.error}</div>
                  </div>
                )}

                <p style={{ fontSize: "0.9rem", color: "var(--text-main)", marginBottom: "1rem" }}>
                  Are you sure you want to reject the registration request from{" "}
                  <strong>{rejectModal.user.name}</strong> ({rejectModal.user.phone})?
                </p>
                <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                  This will remove the request and free their phone number for future registrations.
                </p>

                <div className="form-group">
                  <label htmlFor="reject-note-input" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 600 }}>
                    Optional reason or note:
                  </label>
                  <textarea
                    id="reject-note-input"
                    rows="2"
                    placeholder="e.g. Unverified identity or not in district directory"
                    value={rejectModal.note}
                    onChange={(e) => setRejectModal((prev) => ({ ...prev, note: e.target.value }))}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-color)",
                      fontSize: "0.875rem"
                    }}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setRejectModal((prev) => ({ ...prev, open: false }))}
                  disabled={rejectModal.submitting}
                >
                  {LABELS.BUTTONS.CANCEL}
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  style={{ background: "#dc2626", color: "#fff", borderColor: "#dc2626" }}
                  disabled={rejectModal.submitting}
                >
                  {rejectModal.submitting ? "Rejecting..." : "Reject request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 9: ACTIVITY LOG DETAILS (E2: Clean inspector without raw JSON in table) ── */}
      {activityDetailsModal && (
        <div
          className="modal-backdrop"
          onClick={() => setActivityDetailsModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="activity-details-title"
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div className="modal-header">
              <h3 id="activity-details-title">Activity Log Entry Details</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setActivityDetailsModal(null)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <div className="modal-body" style={{ fontSize: "0.875rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "0.6rem", marginBottom: "1rem" }}>
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Log ID:</span>
                <code>{activityDetailsModal._id}</code>

                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Timestamp:</span>
                <span>{new Date(activityDetailsModal.at).toLocaleString("en-UG")}</span>

                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Action:</span>
                <span style={{ fontWeight: 600 }}>{activityDetailsModal.action}</span>

                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Actor:</span>
                <span>{getUserNameById(activityDetailsModal.userId)} ({activityDetailsModal.userId})</span>

                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Target entity:</span>
                <span>{activityDetailsModal.entity} ({activityDetailsModal.entityId})</span>
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>
                  Details:
                </span>
                <pre
                  style={{
                    background: "var(--bg-muted, #f1f5f9)",
                    padding: "0.75rem",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.875rem",
                    maxHeight: "180px",
                    overflow: "auto"
                  }}
                >
                  {JSON.stringify(activityDetailsModal.details || {}, null, 2)}
                </pre>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setActivityDetailsModal(null)}>
                {LABELS.BUTTONS.CLOSE}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;

