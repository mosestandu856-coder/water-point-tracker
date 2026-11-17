// frontend/src/components/JobChatPanel.jsx
//
// Enterprise Job Chat & Price Negotiation Panel
// Professional, corporate communication interface compliant with
// public utility management standards (clean typography, no informal emojis,
// real-time sync, structured quote authorization, and audit logs).

import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { whatsappLink } from "../utils/phoneUtils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });
}

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || "")
    .join("");
}

function getRoleMeta(role) {
  switch (role) {
    case "technician":
      return { label: "Field Technician", bg: "#0f766e", badgeBg: "#ccfbf1", badgeText: "#0f766e" };
    case "officer":
      return { label: "District Officer", bg: "#1e40af", badgeBg: "#dbeafe", badgeText: "#1e40af" };
    case "admin":
      return { label: "System Admin", bg: "#6b21a8", badgeBg: "#f3e8ff", badgeText: "#6b21a8" };
    default:
      return { label: "User", bg: "#475569", badgeBg: "#f1f5f9", badgeText: "#475569" };
  }
}

// Professional preset replies (No informal emojis)
const TECH_QUICK_REPLIES = [
  "Arrived on-site, commencing physical inspection.",
  "Diagnosis: Broken pump handle and cylinder seal require replacement.",
  "Spare parts sourced from approved district inventory.",
  "Estimated repair duration: approximately 2 hours.",
  "Work completed and discharge rate verified successfully."
];

const OFFICER_QUICK_REPLIES = [
  "Quote approved. You are authorized to proceed with the repair.",
  "Please ensure you conduct a standard water test before departure.",
  "Kindly provide an itemized breakdown of spare parts versus labour.",
  "Acknowledged. Contact district office if further assistance is needed."
];

const COST_PRESETS = [
  { amount: 30000, label: "UGX 30,000 (Minor)" },
  { amount: 50000, label: "UGX 50,000 (Standard)" },
  { amount: 60000, label: "UGX 60,000 (Typical)" },
  { amount: 80000, label: "UGX 80,000 (Major)" },
  { amount: 120000, label: "UGX 120,000 (Overhaul)" }
];

export function JobChatPanel({ report, onQuoteSubmitted, onQuoteApproved, onMessagesRead }) {
  const { user } = useAuth();
  const isTechnician = user?.role === "technician";
  const isOfficer    = user?.role === "officer" || user?.role === "admin";

  const [messages,      setMessages]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [isSyncing,     setIsSyncing]     = useState(false);
  const [sending,       setSending]       = useState(false);
  const [text,          setText]          = useState("");
  const [quoteMode,     setQuoteMode]     = useState(false);
  const [quoteCost,     setQuoteCost]     = useState(report.quotedCostUGX ? String(report.quotedCostUGX) : "");
  const [quoteNote,     setQuoteNote]     = useState("");
  const [quoteErr,      setQuoteErr]      = useState(null);
  const [chatErr,       setChatErr]       = useState(null);
  const [approving,     setApproving]     = useState(false);

  const feedRef           = useRef(null);
  const userScrolledUpRef = useRef(false);
  const pollRef           = useRef(null);
  const inputRef          = useRef(null);
  const onMessagesReadRef = useRef(onMessagesRead);

  useEffect(() => {
    onMessagesReadRef.current = onMessagesRead;
  }, [onMessagesRead]);

  const hasQuote   = Boolean(report.quotedCostUGX);
  const isApproved = Boolean(report.quoteApproved);

  // ── Scroll Helpers (Internal to chat feed, NEVER scrolling the window) ───────
  const scrollFeedToBottom = useCallback((behavior = "smooth") => {
    if (feedRef.current) {
      feedRef.current.scrollTo({
        top: feedRef.current.scrollHeight,
        behavior
      });
    }
  }, []);

  const handleFeedScroll = useCallback(() => {
    if (!feedRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    // If user is more than 50px away from the bottom, they have scrolled up to read earlier messages
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    userScrolledUpRef.current = !isAtBottom;
  }, []);

  // ── Fetch Messages ──────────────────────────────────────────────────────────
  const loadMessages = useCallback(async (background = false) => {
    if (background) setIsSyncing(true);
    try {
      const msgs = await api.getJobMessages(report._id);
      const list = msgs || [];
      setMessages(prev => {
        if (prev.length === list.length) {
          const pLast = prev[prev.length - 1];
          const nLast = list[list.length - 1];
          if ((!pLast && !nLast) || (pLast?.sentAt === nLast?.sentAt && pLast?.text === nLast?.text)) {
            return prev;
          }
        }
        return list;
      });
      if (onMessagesReadRef.current && list.length > 0) {
        onMessagesReadRef.current(list.length);
      }
    } catch (_) {
      // background polling fail safe
    } finally {
      if (background) setIsSyncing(false);
      setLoading(false);
    }
  }, [report._id]);

  useEffect(() => {
    loadMessages(false);
    pollRef.current = setInterval(() => loadMessages(true), 8_000);
    return () => clearInterval(pollRef.current);
  }, [loadMessages]);

  // Auto-scroll feed only when user has not intentionally scrolled up
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      scrollFeedToBottom("smooth");
    }
  }, [messages, scrollFeedToBottom]);

  // Initial scroll to bottom on mount
  useEffect(() => {
    if (!loading && messages.length > 0) {
      scrollFeedToBottom("auto");
    }
  }, [loading, scrollFeedToBottom]);

  // ── Send Message ────────────────────────────────────────────────────────────
  const handleSend = async (customText = null) => {
    const content = (customText || text).trim();
    if (!content || sending) return;

    setSending(true);
    setChatErr(null);
    try {
      await api.sendJobMessage(report._id, content);
      if (!customText) setText("");
      userScrolledUpRef.current = false;
      await loadMessages(false);
      scrollFeedToBottom("smooth");
      inputRef.current?.focus();
    } catch (err) {
      setChatErr(err.message || "Message delivery failed. Please retry.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Submit Price Quote ──────────────────────────────────────────────────────
  const handleSubmitQuote = async (e) => {
    e.preventDefault();
    setQuoteErr(null);
    const cost = Number(quoteCost);
    if (!cost || cost <= 0) {
      setQuoteErr("Please enter a valid amount greater than 0 UGX.");
      return;
    }
    setSending(true);
    try {
      const result = await api.submitPriceQuote(report._id, cost, quoteNote);
      setQuoteMode(false);
      await loadMessages(false);
      if (onQuoteSubmitted) onQuoteSubmitted(result.report);
    } catch (err) {
      setQuoteErr(err.message || "Failed to record price quote.");
    } finally {
      setSending(false);
    }
  };

  // ── Officer Approves Quote ──────────────────────────────────────────────────
  const handleApproveQuote = async () => {
    setApproving(true);
    try {
      const result = await api.approvePriceQuote(report._id);
      await loadMessages(false);
      if (onQuoteApproved) onQuoteApproved(result.report);
    } catch (err) {
      setChatErr(err.message || "Authorization failed.");
    } finally {
      setApproving(false);
    }
  };

  const quickReplies = isTechnician ? TECH_QUICK_REPLIES : OFFICER_QUICK_REPLIES;

  return (
    <div style={{
      border: "1px solid #cbd5e1",
      borderRadius: "10px",
      background: "#ffffff",
      overflow: "hidden",
      boxShadow: "0 4px 16px rgba(15,23,42,0.06)",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif"
    }}>

      {/* ── Top Header ── */}
      <div style={{
        padding: "0.85rem 1.25rem",
        background: "#0f172a",
        color: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "0.75rem",
        borderBottom: "1px solid #1e293b"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {/* Status Indicator */}
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            background: "rgba(34,197,94,0.15)",
            padding: "0.2rem 0.5rem",
            borderRadius: "4px",
            border: "1px solid rgba(34,197,94,0.3)"
          }}>
            <span style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#22c55e",
              display: "inline-block"
            }} />
            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#86efac", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Live Channel
            </span>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontWeight: 700, fontSize: "0.95rem", letterSpacing: "-0.01em", color: "#f8fafc" }}>
                Job Negotiation &amp; Quotation
              </span>
              <span style={{
                fontSize: "0.72rem",
                background: "rgba(255,255,255,0.1)",
                padding: "0.15rem 0.5rem",
                borderRadius: "4px",
                fontFamily: "monospace",
                color: "#93c5fd"
              }}>
                REF: {report._id}
              </span>
            </div>
            <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "0.1rem" }}>
              Logged channel between District Water Office and Assigned Field Mechanic
            </div>
          </div>
        </div>

        {/* Right Badges */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          {hasQuote && (
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.3rem 0.75rem",
              borderRadius: "4px",
              background: isApproved ? "#064e3b" : "#78350f",
              color: "#ffffff",
              fontSize: "0.74rem",
              fontWeight: 700,
              letterSpacing: "0.01em"
            }}>
              <span>{isApproved ? "QUOTE AUTHORIZED:" : "SUBMITTED QUOTE:"}</span>
              <span style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>
                UGX {Number(report.quotedCostUGX).toLocaleString()}
              </span>
            </div>
          )}

          {/* WhatsApp Direct Dispatch Fallback */}
          <a
            href={whatsappLink(isTechnician ? "0765924113" : "0726927445", `Official Inquiry regarding Job ${report._id}: following up on agreed repair quote.`)}
            target="_blank"
            rel="noopener noreferrer"
            title="External WhatsApp channel"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.3rem 0.65rem",
              borderRadius: "4px",
              background: "#1e293b",
              color: "#94a3b8",
              border: "1px solid #334155",
              fontSize: "0.72rem",
              fontWeight: 600,
              textDecoration: "none"
            }}
          >
            <span>WhatsApp Dispatch</span>
          </a>
        </div>
      </div>

      {/* ── Workflow Guide Strip ── */}
      <div style={{
        background: "#f8fafc",
        padding: "0.5rem 1.25rem",
        borderBottom: "1px solid #e2e8f0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: "0.73rem",
        color: "#64748b",
        flexWrap: "wrap",
        gap: "0.5rem"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: "#0f172a", textTransform: "uppercase", fontSize: "0.68rem" }}>
            Operational Protocol:
          </span>
          <span style={{ color: "#334155" }}>1. Diagnostic Scope</span>
          <span style={{ color: "#cbd5e1" }}>&rarr;</span>
          <span style={{ fontWeight: hasQuote ? 700 : 500, color: hasQuote ? "#0f766e" : "#64748b" }}>
            2. Price Quotation
          </span>
          <span style={{ color: "#cbd5e1" }}>&rarr;</span>
          <span style={{ fontWeight: isApproved ? 700 : 500, color: isApproved ? "#15803d" : "#64748b" }}>
            3. Officer Authorization
          </span>
          <span style={{ color: "#cbd5e1" }}>&rarr;</span>
          <span style={{ color: "#334155" }}>4. Work Execution</span>
        </div>

        <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
          {isSyncing ? "Refreshing feed..." : "Messages synchronized"}
        </div>
      </div>

      {/* ── Officer Pending Approval Banner ── */}
      {isOfficer && hasQuote && !isApproved && report.status === "assigned" && (
        <div style={{
          padding: "0.85rem 1.25rem",
          background: "#fffbeb",
          borderBottom: "2px solid #fde68a",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem"
        }}>
          <div>
            <div style={{ fontWeight: 700, color: "#92400e", fontSize: "0.84rem" }}>
              Action Required: Price Quotation of UGX {Number(report.quotedCostUGX).toLocaleString()} Submitted
            </div>
            <div style={{ fontSize: "0.74rem", color: "#78350f", marginTop: "0.15rem" }}>
              {report.quoteNotes ? `Technician's note: "${report.quoteNotes}"` : "Please review the scope and authorize work commencement."}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={handleApproveQuote}
              disabled={approving}
              style={{
                padding: "0.45rem 1.1rem",
                borderRadius: "4px",
                background: "#047857",
                color: "#ffffff",
                border: "none",
                fontWeight: 700,
                fontSize: "0.78rem",
                cursor: approving ? "not-allowed" : "pointer",
                letterSpacing: "0.01em"
              }}
            >
              {approving ? "Authorizing..." : "Authorize Work (Approve UGX " + Number(report.quotedCostUGX).toLocaleString() + ")"}
            </button>
          </div>
        </div>
      )}

      {/* ── Messages Feed ── */}
      <div
        ref={feedRef}
        onScroll={handleFeedScroll}
        style={{
          height: "280px",
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: "1rem 1.25rem",
          background: "#f8fafc",
          display: "flex",
          flexDirection: "column",
          gap: "0.85rem"
        }}
      >
        {loading ? (
          <div style={{ textAlign: "center", color: "#64748b", fontSize: "0.82rem", margin: "auto" }}>
            Loading discussion history...
          </div>
        ) : messages.length === 0 ? (
          <div style={{
            margin: "auto",
            textAlign: "center",
            padding: "1.75rem",
            maxWidth: "360px",
            background: "#ffffff",
            borderRadius: "6px",
            border: "1px solid #e2e8f0"
          }}>
            <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.88rem" }}>
              No Communication Logged Yet
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.35rem", lineHeight: 1.5 }}>
              Use this channel to assess required replacement hardware and record the agreed repair quotation.
            </div>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isMe = m.from === user?._id;
            const meta = getRoleMeta(m.fromRole);
            const isQuote = m.type === "quote";
            const isQuoteApproved = m.type === "quote_approved";
            const isSystem = m.type === "system";

            if (isSystem) {
              return (
                <div key={idx} style={{
                  textAlign: "center",
                  fontSize: "0.7rem",
                  color: "#64748b",
                  padding: "0.25rem 0",
                  borderTop: "1px solid #e2e8f0",
                  borderBottom: "1px solid #e2e8f0"
                }}>
                  {m.text}
                </div>
              );
            }

            if (isQuote || isQuoteApproved) {
              return (
                <div key={idx} style={{
                  margin: "0.2rem auto",
                  width: "100%",
                  maxWidth: "500px",
                  background: isQuoteApproved ? "#f0fdf4" : "#fffbeb",
                  border: `1px solid ${isQuoteApproved ? "#86efac" : "#fde68a"}`,
                  borderRadius: "6px",
                  padding: "0.85rem 1.15rem",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                    <span style={{
                      fontWeight: 800,
                      fontSize: "0.74rem",
                      color: isQuoteApproved ? "#166534" : "#92400e",
                      letterSpacing: "0.03em"
                    }}>
                      {isQuoteApproved ? "OFFICIAL QUOTE AUTHORIZATION" : "FORMAL REPAIR QUOTATION"}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                      {fmtDate(m.sentAt)} · {fmtTime(m.sentAt)}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.84rem", color: "#0f172a", lineHeight: 1.5, fontWeight: 500 }}>
                    {m.text}
                  </div>
                  <div style={{
                    fontSize: "0.7rem",
                    color: "#64748b",
                    marginTop: "0.5rem",
                    borderTop: "1px dashed rgba(0,0,0,0.12)",
                    paddingTop: "0.35rem"
                  }}>
                    Recorded by {m.fromName} ({meta.label})
                  </div>
                </div>
              );
            }

            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem"
                }}
              >
                {/* Clean Professional Avatar with Initials */}
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: "4px",
                  background: meta.bg,
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  flexShrink: 0
                }}>
                  {initials(m.fromName)}
                </div>

                {/* Message Body (Teams/Slack style layout) */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.2rem" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "#0f172a" }}>
                      {m.fromName}
                    </span>
                    <span style={{
                      fontSize: "0.68rem",
                      color: "#64748b",
                      fontWeight: 600
                    }}>
                      [{meta.label}]
                    </span>
                    <span style={{ fontSize: "0.68rem", color: "#94a3b8", marginLeft: "auto" }}>
                      {fmtDate(m.sentAt)} at {fmtTime(m.sentAt)}
                    </span>
                  </div>

                  <div style={{
                    padding: "0.6rem 0.85rem",
                    borderRadius: "4px",
                    background: isMe ? "#f1f5f9" : "#ffffff",
                    border: "1px solid #e2e8f0",
                    color: "#0f172a",
                    fontSize: "0.85rem",
                    lineHeight: 1.5,
                    wordBreak: "break-word"
                  }}>
                    {m.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Quick Action Templates (Wrapped cleanly without horizontal scrollbar) ── */}
      <div style={{
        padding: "0.5rem 1.25rem",
        background: "#ffffff",
        borderTop: "1px solid #e2e8f0",
        display: "flex",
        alignItems: "center",
        gap: "0.45rem",
        flexWrap: "wrap"
      }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
          Templates:
        </span>
        {quickReplies.map((reply, i) => (
          <button
            key={i}
            onClick={() => handleSend(reply)}
            disabled={sending}
            style={{
              padding: "0.25rem 0.65rem",
              borderRadius: "4px",
              background: "#f8fafc",
              border: "1px solid #cbd5e1",
              fontSize: "0.72rem",
              color: "#334155",
              cursor: "pointer",
              fontWeight: 500,
              whiteSpace: "normal",
              textAlign: "left"
            }}
          >
            {reply}
          </button>
        ))}
      </div>

      {/* ── Technician Quote Entry Panel ── */}
      {isTechnician && report.status === "assigned" && (
        <div style={{
          padding: "0.85rem 1.25rem",
          background: "#fffbeb",
          borderTop: "1px solid #fde68a"
        }}>
          {!quoteMode ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
              <div style={{ fontSize: "0.8rem", color: "#78350f" }}>
                {hasQuote
                  ? `Your quote of UGX ${Number(report.quotedCostUGX).toLocaleString()} has been submitted. Awaiting officer authorization.`
                  : "Submit agreed repair cost once initial assessment is completed."}
              </div>
              <button
                onClick={() => setQuoteMode(true)}
                style={{
                  padding: "0.4rem 0.95rem",
                  borderRadius: "4px",
                  background: "#b45309",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  cursor: "pointer"
                }}
              >
                {hasQuote ? "Modify Submitted Quote" : "Enter Formal Price Quote"}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmitQuote}>
              <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "#78350f", marginBottom: "0.5rem" }}>
                Submit Formal Repair Quotation
              </div>
              {quoteErr && (
                <div style={{ color: "#b91c1c", fontSize: "0.74rem", marginBottom: "0.4rem" }}>
                  {quoteErr}
                </div>
              )}

              {/* Amount presets */}
              <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.6rem", flexWrap: "wrap" }}>
                {COST_PRESETS.map((p) => (
                  <button
                    key={p.amount}
                    type="button"
                    onClick={() => setQuoteCost(String(p.amount))}
                    style={{
                      padding: "0.25rem 0.55rem",
                      borderRadius: "3px",
                      background: quoteCost === String(p.amount) ? "#b45309" : "#ffffff",
                      color: quoteCost === String(p.amount) ? "#ffffff" : "#78350f",
                      border: "1px solid #d97706",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  flex: "1 1 150px",
                  border: "1px solid #b45309",
                  borderRadius: "4px",
                  background: "#ffffff",
                  overflow: "hidden"
                }}>
                  <span style={{ padding: "0 0.6rem", background: "#fef3c7", fontSize: "0.76rem", fontWeight: 700, color: "#78350f" }}>
                    UGX
                  </span>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    placeholder="e.g. 60000"
                    value={quoteCost}
                    onChange={(e) => setQuoteCost(e.target.value)}
                    required
                    style={{
                      flex: 1,
                      border: "none",
                      padding: "0.45rem 0.6rem",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      outline: "none"
                    }}
                  />
                </div>
                <input
                  type="text"
                  placeholder="Scope details (e.g. cylinder seal, new rod, labour)"
                  value={quoteNote}
                  onChange={(e) => setQuoteNote(e.target.value)}
                  style={{
                    flex: "2 1 200px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "4px",
                    padding: "0.45rem 0.65rem",
                    fontSize: "0.82rem",
                    outline: "none"
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setQuoteMode(false)}
                  style={{
                    padding: "0.35rem 0.75rem",
                    borderRadius: "4px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    fontSize: "0.78rem",
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  style={{
                    padding: "0.35rem 1.1rem",
                    borderRadius: "4px",
                    border: "none",
                    background: "#b45309",
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: "0.78rem",
                    cursor: sending ? "not-allowed" : "pointer"
                  }}
                >
                  {sending ? "Submitting..." : "Submit Quotation"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Message Composer ── */}
      <div style={{
        padding: "0.85rem 1.25rem",
        background: "#ffffff",
        borderTop: "1px solid #e2e8f0"
      }}>
        {chatErr && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
            padding: "0.4rem 0.65rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "4px",
            color: "#991b1b",
            fontSize: "0.76rem",
            marginBottom: "0.5rem"
          }}>
            <span>{chatErr}</span>
            <button
              type="button"
              onClick={() => setChatErr(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "#991b1b",
                fontWeight: 700,
                fontSize: "0.8rem",
                cursor: "pointer",
                padding: "0 0.2rem"
              }}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} style={{ display: "flex", gap: "0.6rem" }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Type your message to the district officer or technician... (Press Enter)"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (chatErr) setChatErr(null);
            }}
            onKeyDown={handleKeyDown}
            disabled={sending}
            style={{
              flex: 1,
              padding: "0.55rem 0.85rem",
              borderRadius: "4px",
              border: "1px solid #cbd5e1",
              fontSize: "0.85rem",
              outline: "none",
              background: "#ffffff"
            }}
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            style={{
              padding: "0.55rem 1.25rem",
              borderRadius: "4px",
              background: (!text.trim() || sending) ? "#e2e8f0" : "#0f766e",
              color: (!text.trim() || sending) ? "#94a3b8" : "#ffffff",
              border: "none",
              fontWeight: 700,
              fontSize: "0.82rem",
              cursor: (!text.trim() || sending) ? "not-allowed" : "pointer",
              transition: "background 0.2s"
            }}
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default JobChatPanel;
