// frontend/src/services/api.js
// Centralized HTTP client for communication between React SPA and Express API.
// Configured with credentials: "include" for automatic httpOnly JWT cookie handling.

/**
 * Generic request helper that formats query parameters and validates JSON responses.
 * @param {string} endpoint - The API path, e.g. "/api/reports".
 * @param {object} [options] - Standard Fetch options (method, body, headers).
 * @returns {Promise<any>} The parsed response data.
 */
async function request(endpoint, options = {}) {
  const config = {
    credentials: "include", // Essential for cross-origin / proxy httpOnly cookies
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  };

  const response = await fetch(endpoint, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.error || `HTTP ${response.status}: ${response.statusText}`;
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  // ── Authentication ──────────────────────────────────────────────────────────
  login: (phone, password, keepSignedIn = false) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone, password, keepSignedIn })
    }),
  register: (userData) =>
    request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(userData)
    }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  getMe: () => request("/api/auth/me"),

  // ── Notifications ───────────────────────────────────────────────────────────
  getNotifications: () => request("/api/notifications"),
  markNotificationRead: (id) => request(`/api/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () => request("/api/notifications/mark-all-read", { method: "PATCH" }),

  // ── Communities ─────────────────────────────────────────────────────────────
  getCommunities: () => request("/api/communities"),
  getCommunityById: (id) => request(`/api/communities/${id}`),

  // ── Water Points ────────────────────────────────────────────────────────────
  getWaterPoints: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.communityId) params.set("communityId", filters.communityId);
    if (filters.type) params.set("type", filters.type);
    const query = params.toString() ? `?${params.toString()}` : "";
    return request(`/api/water-points${query}`);
  },
  getWaterPointById: (id) => request(`/api/water-points/${id}`),

  // ── Technicians ─────────────────────────────────────────────────────────────
  getTechnicians: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.communityId) params.set("communityId", filters.communityId);
    if (filters.available !== undefined) params.set("available", String(filters.available));
    if (filters.skill) params.set("skill", filters.skill);
    const query = params.toString() ? `?${params.toString()}` : "";
    return request(`/api/technicians${query}`);
  },
  getTechnicianById: (id) => request(`/api/technicians/${id}`),
  getRankedTechnicians: (reportId) => request(`/api/technicians/ranked-for-report/${reportId}`),
  updateTechnicianAvailability: (id, available) =>
    request(`/api/technicians/${id}/availability`, {
      method: "PATCH",
      body: JSON.stringify({ available })
    }),

  // ── Reports & Lifecycle ─────────────────────────────────────────────────────
  getReports: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.severity) params.set("severity", filters.severity);
    if (filters.waterPointId) params.set("waterPointId", filters.waterPointId);
    const query = params.toString() ? `?${params.toString()}` : "";
    return request(`/api/reports${query}`);
  },
  getReportById: (id) => request(`/api/reports/${id}`),
  createReport: (reportData) =>
    request("/api/reports", {
      method: "POST",
      body: JSON.stringify(reportData)
    }),
  assignTechnician: (reportId, technicianId) =>
    request(`/api/reports/${reportId}/assign`, {
      method: "PATCH",
      body: JSON.stringify({ technicianId })
    }),
  startWork: (reportId) =>
    request(`/api/reports/${reportId}/start-work`, {
      method: "PATCH"
    }),
  resolveReport: (reportId, resolveData) =>
    request(`/api/reports/${reportId}/resolve`, {
      method: "POST",
      body: JSON.stringify(resolveData)
    }),
  disbursePayment: (reportId, paymentData) =>
    request(`/api/reports/${reportId}/payment`, {
      method: "PATCH",
      body: JSON.stringify(paymentData)
    }),

  // ── In-system Job Chat ───────────────────────────────────────────────────────
  // Get all chat messages for a job
  getJobMessages: (reportId) => request(`/api/reports/${reportId}/messages`),
  // Send a chat message on a job thread
  sendJobMessage: (reportId, text) =>
    request(`/api/reports/${reportId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text })
    }),
  // Technician submits agreed price quote BEFORE starting work
  submitPriceQuote: (reportId, quotedCostUGX, notes) =>
    request(`/api/reports/${reportId}/quote`, {
      method: "PATCH",
      body: JSON.stringify({ quotedCostUGX, notes })
    }),
  // District Officer approves the submitted price quote
  approvePriceQuote: (reportId) =>
    request(`/api/reports/${reportId}/approve-quote`, {
      method: "PATCH"
    }),

  // ── Statistics & Analytics ──────────────────────────────────────────────────
  getSummary: () => request("/api/stats/summary"),
  getBrokenByCommunity: () => request("/api/stats/broken-by-community"),
  getStatsMtaMttr: () => request("/api/stats/mta-mttr"),
  getStatsCostByType: () => request("/api/stats/cost-by-type"),
  getRecurrence: () => request("/api/stats/recurrence"),
  getServiceBacklog: () => request("/api/stats/service-backlog"),
  getTechnicianWorkload: () => request("/api/stats/technician-workload"),

  // ── User Management & Audit (Administrator Only) ───────────────────────────
  getUsers: () => request("/api/users"),
  createUser: (userData) =>
    request("/api/users", {
      method: "POST",
      body: JSON.stringify(userData)
    }),
  toggleUserStatus: (userId, active, reason) =>
    request(`/api/users/${userId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ active, reason })
    }),
  updateUserRole: (userId, role, linkedId, reason) =>
    request(`/api/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role, linkedId, reason })
    }),
  resetUserPassword: (userId, password, reason) =>
    request(`/api/users/${userId}/reset-password`, {
      method: "PATCH",
      body: JSON.stringify({ password, reason })
    }),
  // Approve a pending self-registered account (administrator only) (E1)
  approveUser: (userId, data = {}) =>
    request(`/api/users/${userId}/approve`, {
      method: "PATCH",
      body: JSON.stringify(data)
    }),
  // Reject and remove a pending registration (administrator only) (E1)
  rejectUser: (userId, data = {}) =>
    request(`/api/users/${userId}/reject`, {
      method: "PATCH",
      body: JSON.stringify(data)
    }),
  getAuditLogs: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.action) params.set("action", filters.action);
    if (filters.entity) params.set("entity", filters.entity);
    if (filters.limit) params.set("limit", String(filters.limit));
    if (filters.skip) params.set("skip", String(filters.skip));
    const query = params.toString() ? `?${params.toString()}` : "";
    return request(`/api/audit${query}`);
  }
};
