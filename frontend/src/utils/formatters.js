// frontend/src/utils/formatters.js
// Utility helpers to format dates, relative times, and currency consistently across screens.

/**
 * Formats an ISO date string or Date object into human-readable English text like "12 Oct 2026".
 * Example: "12 Oct 2026"
 */
export function formatDate(dateInput) {
  if (!dateInput) return "None";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "None";

  const day = date.getDate();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${day} ${month} ${year}`;
}

/**
 * Formats an elapsed duration like "3 days ago" or "Just now".
 */
export function formatRelativeAge(dateInput) {
  if (!dateInput) return "Never";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "Never";

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin === 1) return "1 minute ago";
  if (diffMin < 60) return `${diffMin} minutes ago`;
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

/**
 * Calculates human-readable elapsed duration for open reports.
 * Example: "Open for 3 days"
 */
export function formatReportAge(dateInput) {
  if (!dateInput) return "";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Reported today";
  if (diffDays === 1) return "Open for 1 day";
  return `Open for ${diffDays} days`;
}

/**
 * Formats numeric amounts into Ugandan Shillings with comma thousands separators.
 * Strict standard per B7: "UGX 85,000" everywhere.
 * Example: 85000 -> "UGX 85,000"
 */
export function formatUGX(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return "UGX 0";
  return `UGX ${Number(amount).toLocaleString("en-UG")}`;
}

