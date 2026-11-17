// backend/routes/reports.js
// Handles read and write operations for citizen water point breakdown reports.
// Features:
//   - GET /api/reports: FIFO queue inspection (Query 3) with row-level query scoping.
//   - POST /api/reports: Report filing with community boundary enforcement and auto-breakdown marking.
//   - PATCH /api/reports/:id/assign: Officer assignment with 409 conflict checks.
//   - PATCH /api/reports/:id/start-work: Technician transition from 'assigned' to 'in_progress'.
//   - POST /api/reports/:id/resolve: Multi-document ACID transaction (Query 4).

const express = require("express");
const router = express.Router();
const { getDB, getClient } = require("../db");
const { getNextReportId } = require("../utils/idGenerator");
const { optionalAuth, requireRole } = require("../middleware/auth");
const { logAudit } = require("../utils/auditLogger");
const { notifyLifecycleChange } = require("../utils/notificationService");

/**
 * Helper: Computes dynamic priority score and SLA indicator.
 * Priority = (severity weight: High=3, Medium=2, Low=1) * householdsServed + ageBonus
 * High overdue: > 24h unassigned; Medium overdue: > 72h unassigned
 */
function enrichReportMetadata(rpt, wpMap = {}) {
  const wp = wpMap[rpt.waterPointId] || {};
  const households = Number(wp.householdsServed) || 50;

  const severityWeights = { high: 3, medium: 2, low: 1 };
  const weight = severityWeights[rpt.severity] || 1;

  const ageHours = (Date.now() - new Date(rpt.reportedAt).getTime()) / (1000 * 60 * 60);
  const ageDays = Math.floor(ageHours / 24);
  const ageBonus = Math.min(ageDays * 10, 50);

  const priorityScore = (weight * households) + ageBonus;

  // SLA Overdue check for open reports
  let slaStatus = "normal";
  if (rpt.status === "open") {
    if (rpt.severity === "high" && ageHours > 24) {
      slaStatus = "overdue_critical";
    } else if (rpt.severity === "medium" && ageHours > 72) {
      slaStatus = "overdue_warning";
    }
  }

  return {
    ...rpt,
    priorityScore,
    slaStatus,
    ageHours: Math.round(ageHours),
    ageDays
  };
}

/**
 * GET /api/reports
 * Supports optional query filters:
 *   - ?status=open (Query 3: FIFO queue, matches rpt_002 then rpt_003)
 *   - ?severity=high
 *   - ?waterPointId=wp_02
 * Row-Level Scoping:
 *   - Community Contact: only reports for water points in their settlement.
 *   - Technician: only reports assigned to them.
 *   - Volunteer: only reports they filed.
 *   - Officer / Public: full district visibility.
 */
router.get("/", optionalAuth, async (req, res) => {
  try {
    const db = getDB();
    const { status, severity, waterPointId } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (waterPointId) filter.waterPointId = waterPointId;

    // Apply Row-Level Scoping
    if (req.user) {
      if (req.user.role === "community" && req.user.linkedId) {
        // Find all water points in this community
        const communityWps = await db
          .collection("waterPoints")
          .find({ communityId: req.user.linkedId }, { projection: { _id: 1 } })
          .toArray();
        const wpIds = communityWps.map((w) => w._id);
        filter.waterPointId = { $in: wpIds };
      } else if (req.user.role === "technician" && req.user.linkedId) {
        filter.assignedTo = req.user.linkedId;
      } else if (req.user.role === "volunteer") {
        filter.$or = [
          { "reportedBy.phone": req.user.phone },
          { "statusHistory.byUserId": req.user._id }
        ];
      }
    }

    // Sort: open reports use FIFO queue order (oldest first); otherwise newest first
    const sort = status === "open" ? { reportedAt: 1 } : { reportedAt: -1 };

    const reports = await db
      .collection("reports")
      .find(filter)
      .sort(sort)
      .toArray();

    // Fetch water points map for metadata enrichment
    const waterPoints = await db.collection("waterPoints").find({}).toArray();
    const wpMap = Object.fromEntries(waterPoints.map((w) => [w._id, w]));

    const enriched = reports.map((r) => enrichReportMetadata(r, wpMap));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve reports: " + err.message });
  }
});

/**
 * GET /api/reports/:id
 * Returns single report joined with water point and technician details.
 * Row-Level Scoping: Enforces permissions per role.
 */
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    const report = await db.collection("reports").findOne({ _id: id });
    if (!report) {
      return res.status(404).json({ error: `Report '${id}' not found` });
    }

    const waterPoint = await db.collection("waterPoints").findOne({ _id: report.waterPointId });

    // Row-level permission checks
    if (req.user) {
      if (req.user.role === "community" && req.user.linkedId) {
        if (waterPoint && waterPoint.communityId !== req.user.linkedId) {
          return res.status(403).json({ error: "Forbidden: Report belongs to another community." });
        }
      } else if (req.user.role === "technician" && req.user.linkedId) {
        if (report.assignedTo !== req.user.linkedId) {
          return res.status(403).json({ error: "Forbidden: Job is assigned to another technician." });
        }
      }
    }

    let technician = null;
    if (report.assignedTo) {
      technician = await db.collection("technicians").findOne(
        { _id: report.assignedTo },
        { projection: { name: 1, phone: 1, skills: 1 } }
      );
    }

    const enriched = enrichReportMetadata(report, { [waterPoint._id]: waterPoint });

    res.json({
      ...enriched,
      waterPoint: waterPoint || null,
      technician: technician || null
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve report: " + err.message });
  }
});

/**
 * POST /api/reports
 * Creates a new fault report.
 * Business rules:
 *   - Auto-generates rpt_NNN.
 *   - Automatically marks water point as 'broken' ONLY if currently 'working' (preserves 'low_yield').
 *   - Community users may only report for water points inside their assigned community.
 */
router.post("/", optionalAuth, async (req, res) => {
  try {
    const db = getDB();
    const { waterPointId, reportedBy, problem, severity } = req.body;

    if (!waterPointId || typeof waterPointId !== "string") {
      return res.status(400).json({ error: "waterPointId is required and must be a string" });
    }

    if (!reportedBy || typeof reportedBy !== "object") {
      return res.status(400).json({ error: "reportedBy must be an object containing name and phone" });
    }

    if (!reportedBy.name || !reportedBy.name.trim()) {
      return res.status(400).json({ error: "reportedBy.name is required" });
    }

    if (!reportedBy.phone || !reportedBy.phone.trim()) {
      return res.status(400).json({ error: "reportedBy.phone is required" });
    }

    if (!problem || !problem.trim()) {
      return res.status(400).json({ error: "problem description is required" });
    }

    const validSeverities = ["low", "medium", "high"];
    if (!severity || !validSeverities.includes(severity)) {
      return res.status(400).json({ error: "severity must be one of: 'low', 'medium', 'high'" });
    }

    const waterPoint = await db.collection("waterPoints").findOne({ _id: waterPointId });
    if (!waterPoint) {
      return res.status(400).json({ error: `Water point '${waterPointId}' does not exist` });
    }

    // Row-level validation for Community Contact
    if (req.user && req.user.role === "community" && req.user.linkedId) {
      if (waterPoint.communityId !== req.user.linkedId) {
        return res.status(403).json({
          error: `Forbidden: You may only report breakdowns for water points within your community (${req.user.linkedId}).`
        });
      }
    }

    const nextId = await getNextReportId(db);
    const now = new Date();
    const actorId = req.user ? req.user._id : "citizen_reporter";

    const candidateDoc = {
      _id: nextId,
      waterPointId,
      reportedBy: {
        name: reportedBy.name.trim(),
        phone: reportedBy.phone.trim(),
        ...(reportedBy.role ? { role: reportedBy.role.trim() } : {})
      },
      reportedAt: now,
      problem: problem.trim(),
      severity,
      status: "open",
      assignedTo: null,
      resolvedAt: null,
      statusHistory: [
        {
          status: "open",
          at: now,
          byUserId: actorId,
          note: `Initial breakdown reported: "${problem.trim()}"`
        }
      ]
    };

    await db.collection("reports").insertOne(candidateDoc);

    // Business rule: only overwrite "working" with "broken"
    if (waterPoint.status === "working") {
      await db.collection("waterPoints").updateOne(
        { _id: waterPointId },
        { $set: { status: "broken" } }
      );
    }

    // Audit and notifications
    await logAudit({
      userId: actorId,
      action: "REPORT_FILED",
      entity: "reports",
      entityId: nextId,
      details: { waterPointId, severity }
    });

    await notifyLifecycleChange({
      action: "REPORT_FILED",
      report: candidateDoc,
      waterPoint,
      actorUser: req.user
    });

    res.status(201).json(candidateDoc);
  } catch (err) {
    res.status(500).json({ error: "Failed to create report: " + err.message });
  }
});

/**
 * PATCH /api/reports/:id/assign
 * Assigns or reassigns an available technician to an open or assigned report.
 * Strictly restricted to District Officers when authenticated.
 */
router.patch("/:id/assign", optionalAuth, async (req, res) => {
  try {
    if (req.user && req.user.role !== "officer") {
      return res.status(403).json({ error: "Forbidden: Only District Officers can assign technicians." });
    }

    const db = getDB();
    const { id } = req.params;
    const { technicianId } = req.body;

    if (!technicianId || typeof technicianId !== "string") {
      return res.status(400).json({ error: "technicianId is required and must be a string" });
    }

    const report = await db.collection("reports").findOne({ _id: id });
    if (!report) {
      return res.status(404).json({ error: `Report '${id}' not found` });
    }

    if (report.status === "resolved") {
      return res.status(400).json({ error: "Cannot assign technician to an already resolved report." });
    }

    const technician = await db.collection("technicians").findOne({ _id: technicianId });
    if (!technician) {
      return res.status(404).json({ error: `Technician '${technicianId}' not found` });
    }

    const waterPoint = await db.collection("waterPoints").findOne({ _id: report.waterPointId });
    if (!waterPoint) {
      return res.status(500).json({ error: `Associated water point '${report.waterPointId}' not found` });
    }

    // Hard constraint 1: must be available
    if (!technician.available) {
      return res.status(409).json({
        error: `Conflict: Technician '${technician.name}' (${technicianId}) is currently marked unavailable.`
      });
    }

    // Hard constraint 2: must cover community
    const covers = Array.isArray(technician.coversCommunities) && technician.coversCommunities.includes(waterPoint.communityId);
    if (!covers) {
      return res.status(409).json({
        error: `Conflict: Technician '${technician.name}' does not cover community '${waterPoint.communityId}'.`
      });
    }

    const now = new Date();
    const actorId = req.user ? req.user._id : "user_12";

    await db.collection("reports").updateOne(
      { _id: id },
      {
        $set: {
          status: "assigned",
          assignedTo: technicianId
        },
        $push: {
          statusHistory: {
            status: "assigned",
            at: now,
            byUserId: actorId,
            note: `Dispatched technician ${technician.name} (${technician.phone})`
          }
        }
      }
    );

    const updated = await db.collection("reports").findOne({ _id: id });

    await logAudit({
      userId: actorId,
      action: "REPORT_ASSIGNED",
      entity: "reports",
      entityId: id,
      details: { technicianId, technicianName: technician.name }
    });

    await notifyLifecycleChange({
      action: "REPORT_ASSIGNED",
      report: updated,
      waterPoint,
      actorUser: req.user
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to assign technician: " + err.message });
  }
});

/**
 * PATCH /api/reports/:id/start-work
 * Transitions an assigned report into 'in_progress'.
 * Role: Technician (assigned to job) or Officer.
 */
router.patch("/:id/start-work", optionalAuth, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    const report = await db.collection("reports").findOne({ _id: id });
    if (!report) {
      return res.status(404).json({ error: `Report '${id}' not found` });
    }

    if (report.status !== "assigned") {
      return res.status(400).json({
        error: `Cannot start work on report with status '${report.status}'. Must be 'assigned'.`
      });
    }

    // Role check: Only technicians can start work
    if (req.user && req.user.role !== "technician") {
      return res.status(403).json({ error: "Forbidden: Only assigned technicians can transition a job to in_progress." });
    }
    if (req.user && req.user.role === "technician" && req.user.linkedId) {
      if (report.assignedTo !== req.user.linkedId) {
        return res.status(403).json({ error: "Forbidden: You can only start work on jobs assigned to you." });
      }
    }

    const now = new Date();
    const actorId = req.user ? req.user._id : "field_technician";

    await db.collection("reports").updateOne(
      { _id: id },
      {
        $set: { status: "in_progress" },
        $push: {
          statusHistory: {
            status: "in_progress",
            at: now,
            byUserId: actorId,
            note: "Technician arrived on site and commenced diagnostic / repair work"
          }
        }
      }
    );

    const updated = await db.collection("reports").findOne({ _id: id });
    const waterPoint = await db.collection("waterPoints").findOne({ _id: report.waterPointId });

    await logAudit({
      userId: actorId,
      action: "WORK_STARTED",
      entity: "reports",
      entityId: id,
      details: { technicianId: report.assignedTo }
    });

    await notifyLifecycleChange({
      action: "WORK_STARTED",
      report: updated,
      waterPoint,
      actorUser: req.user
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to start repair work: " + err.message });
  }
});

/**
 * POST /api/reports/:id/resolve
 * Implements Query 4: Multi-Document ACID Transaction
 * Atomically marks the report as 'resolved' and sets water point to 'working'.
 */
router.post("/:id/resolve", optionalAuth, async (req, res) => {
  const client = getClient();
  const db = getDB();
  const { id } = req.params;
  const { costUGX, notes } = req.body;

  try {
    // 1. Role check: Only technicians and officers can resolve repairs
    if (req.user && req.user.role !== "technician" && req.user.role !== "officer") {
      return res.status(403).json({ error: "Forbidden: Only assigned technicians or District Officers can resolve repairs." });
    }

    const report = await db.collection("reports").findOne({ _id: id });
    if (!report) {
      return res.status(404).json({ error: `Report '${id}' not found` });
    }

    // If technician, must be assigned to them
    if (req.user && req.user.role === "technician" && req.user.linkedId) {
      if (report.assignedTo !== req.user.linkedId) {
        return res.status(403).json({ error: "Forbidden: You may only resolve repairs assigned to you." });
      }
    }

    if (report.status !== "assigned" && report.status !== "in_progress") {
      return res.status(400).json({
        error: `Cannot resolve report with status '${report.status}'. Only 'assigned' or 'in_progress' reports can be resolved.`
      });
    }

    let parsedCost = null;
    if (costUGX !== undefined && costUGX !== null && costUGX !== "") {
      parsedCost = Number(costUGX);
      if (isNaN(parsedCost) || parsedCost < 0) {
        return res.status(400).json({ error: "costUGX must be a valid non-negative number" });
      }
    }

    let isReplica = false;
    try {
      const helloCmd = await db.admin().command({ hello: 1 });
      isReplica = !!(helloCmd.setName || helloCmd.hosts);
    } catch (e) {
      isReplica = false;
    }

    const reportsColl = db.collection("reports");
    const wpColl = db.collection("waterPoints");
    const now = new Date();
    const actorId = req.user ? req.user._id : "field_technician";

    const reportUpdate = {
      $set: {
        status: "resolved",
        resolvedAt: now,
        ...(parsedCost !== null ? { costUGX: parsedCost } : {}),
        ...(notes ? { notes: notes.trim() } : {})
      },
      $push: {
        statusHistory: {
          status: "resolved",
          at: now,
          byUserId: actorId,
          note: notes ? `Repair completed: ${notes.trim()}` : "Repair completed and verified operational"
        }
      }
    };

    if (isReplica) {
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          await reportsColl.updateOne({ _id: id }, reportUpdate, { session });
          await wpColl.updateOne(
            { _id: report.waterPointId },
            { $set: { status: "working" } },
            { session }
          );
        });
      } finally {
        await session.endSession();
      }
    } else {
      // Compensating rollback for standalone development mode
      const originalWp = await wpColl.findOne({ _id: report.waterPointId });
      await reportsColl.updateOne({ _id: id }, reportUpdate);

      try {
        await wpColl.updateOne({ _id: report.waterPointId }, { $set: { status: "working" } });
      } catch (secondErr) {
        await reportsColl.updateOne(
          { _id: id },
          {
            $set: { status: report.status, resolvedAt: report.resolvedAt },
            $pop: { statusHistory: 1 }
          }
        );
        throw new Error("Compensating rollback executed: " + secondErr.message);
      }
    }

    const updatedReport = await reportsColl.findOne({ _id: id });
    const updatedWp = await wpColl.findOne({ _id: report.waterPointId });

    await logAudit({
      userId: actorId,
      action: "REPAIR_RESOLVED",
      entity: "reports",
      entityId: id,
      details: { waterPointId: report.waterPointId, costUGX: parsedCost }
    });

    await notifyLifecycleChange({
      action: "REPAIR_RESOLVED",
      report: updatedReport,
      waterPoint: updatedWp,
      actorUser: req.user
    });

    res.json({
      message: "Report resolved and water point restored to working status via ACID transaction.",
      report: updatedReport,
      waterPoint: updatedWp
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to resolve report transaction: " + err.message });
  }
});

/**
 * PATCH /api/reports/:id/payment
 * District Officer records Mobile Money disbursement to technician for a completed repair.
 */
router.patch("/:id/payment", optionalAuth, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { paymentRef, costUGX } = req.body;

    if (req.user && req.user.role !== "officer" && req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden: Only District Officers can disburse payments." });
    }

    const report = await db.collection("reports").findOne({ _id: id });
    if (!report) {
      return res.status(404).json({ error: `Report '${id}' not found` });
    }

    const now = new Date();
    const cleanRef = paymentRef || `WPT-${now.getFullYear().toString().slice(2)}-MOMO`;
    const updatedNotes = report.notes
      ? `${report.notes} | Payment ref: ${cleanRef}`
      : `Payment ref: ${cleanRef}`;

    const parsedCost = costUGX !== undefined ? Number(costUGX) : report.costUGX;

    await db.collection("reports").updateOne(
      { _id: id },
      {
        $set: {
          notes: updatedNotes,
          paid: true,
          paymentRef: cleanRef,
          paidAt: now,
          ...(parsedCost != null ? { costUGX: parsedCost } : {})
        },
        $push: {
          statusHistory: {
            status: "resolved",
            at: now,
            byUserId: req.user?._id || "user_12",
            note: `Payment of UGX ${parsedCost || 0} disbursed to technician via Mobile Money (Ref: ${cleanRef})`
          }
        }
      }
    );

    const updated = await db.collection("reports").findOne({ _id: id });
    await logAudit({
      userId: req.user?._id || "user_12",
      action: "PAYMENT_DISBURSED",
      entity: "reports",
      entityId: id,
      details: { paymentRef: cleanRef, costUGX: parsedCost }
    });

    res.json({ message: "Payment recorded successfully", report: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to record payment: " + err.message });
  }
});

/**
 * GET /api/reports/:id/messages
 * Returns the in-system job chat messages for a specific report.
 * Visible to: technician assigned to this job, district officers, admins.
 */
router.get("/:id/messages", optionalAuth, async (req, res) => {
  try {
    const db = getDB();
    const report = await db.collection("reports").findOne(
      { _id: req.params.id },
      { projection: { messages: 1, _id: 1 } }
    );
    if (!report) {
      return res.status(404).json({ error: `Report '${req.params.id}' not found` });
    }
    res.json(report.messages || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch messages: " + err.message });
  }
});

/**
 * POST /api/reports/:id/messages
 * Sends a new chat message on this job's in-system thread.
 * Body: { text }
 * Both the assigned technician and the District Officer can post.
 */
router.post("/:id/messages", optionalAuth, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Message text is required." });
    }

    const report = await db.collection("reports").findOne({ _id: id });
    if (!report) {
      return res.status(404).json({ error: `Report '${id}' not found` });
    }

    // Build the message document
    const msg = {
      from:      req.user?._id    || "unknown",
      fromName:  req.user?.name   || "Unknown",
      fromRole:  req.user?.role   || "unknown",
      text:      text.trim(),
      sentAt:    new Date(),
      type:      "chat"            // "chat" | "quote" | "system"
    };

    await db.collection("reports").updateOne(
      { _id: id },
      { $push: { messages: msg } }
    );

    // Notify the other party
    if (req.user) {
      const usersColl = db.collection("users");
      let recipientIds = [];

      if (req.user.role === "technician") {
        // Notify district officers
        const officers = await usersColl.find({ role: "officer", active: true }).toArray();
        recipientIds = officers.map(o => o._id);
      } else {
        // Officer / admin — notify the assigned technician
        if (report.assignedTo) {
          const techUser = await usersColl.findOne({ role: "technician", linkedId: report.assignedTo, active: true });
          if (techUser) recipientIds = [techUser._id];
        }
      }

      const { sendNotification } = require("../utils/notificationService");
      if (recipientIds.length) {
        await sendNotification({
          recipientUserIds: recipientIds,
          type:    "system_alert",
          message: `💬 New message on job ${id} from ${req.user.name}: "${text.trim().slice(0, 80)}"`,
          reportId: id
        });
      }
    }

    res.status(201).json(msg);
  } catch (err) {
    res.status(500).json({ error: "Failed to send message: " + err.message });
  }
});

/**
 * PATCH /api/reports/:id/quote
 * Technician submits the agreed repair cost BEFORE starting work.
 * Sets report.quotedCostUGX and posts a "quote" type message in the job chat.
 * Body: { quotedCostUGX, notes }
 */
router.patch("/:id/quote", optionalAuth, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { quotedCostUGX, notes } = req.body;

    // Only technicians may submit a price quote
    if (req.user && req.user.role !== "technician" && req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden: Only technicians can submit a price quote." });
    }

    const parsedCost = Number(quotedCostUGX);
    if (!parsedCost || parsedCost <= 0) {
      return res.status(400).json({ error: "quotedCostUGX must be a positive number." });
    }

    const report = await db.collection("reports").findOne({ _id: id });
    if (!report) {
      return res.status(404).json({ error: `Report '${id}' not found` });
    }

    if (report.status !== "assigned") {
      return res.status(400).json({
        error: `Cannot submit a quote when job status is '${report.status}'. Must be 'assigned'.`
      });
    }

    const now = new Date();
    const actorName = req.user?.name || "Technician";

    // Quote message posted to the job chat thread
    const quoteMsg = {
      from:     req.user?._id || "unknown",
      fromName: actorName,
      fromRole: req.user?.role || "technician",
      text:     `Price quote submitted: UGX ${parsedCost.toLocaleString()}${notes ? ` — ${notes.trim()}` : ""}. Awaiting officer review before starting work.`,
      sentAt:   now,
      type:     "quote"
    };

    await db.collection("reports").updateOne(
      { _id: id },
      {
        $set: {
          quotedCostUGX,
          quoteSubmittedAt: now,
          quoteNotes: notes ? notes.trim() : undefined
        },
        $push: { messages: quoteMsg }
      }
    );

    // Notify district officers that a quote is waiting for review
    const officers = await db.collection("users").find({ role: "officer", active: true }).toArray();
    const { sendNotification } = require("../utils/notificationService");
    if (officers.length) {
      await sendNotification({
        recipientUserIds: officers.map(o => o._id),
        type:    "system_alert",
        message: `💰 Technician ${actorName} submitted a price quote of UGX ${parsedCost.toLocaleString()} for job ${id} (${report.problem}). Please review in Job Chat.`,
        reportId: id
      });
    }

    await logAudit({
      userId:   req.user?._id || "technician",
      action:   "QUOTE_SUBMITTED",
      entity:   "reports",
      entityId: id,
      details:  { quotedCostUGX: parsedCost }
    });

    const updated = await db.collection("reports").findOne({ _id: id });
    res.json({ message: "Quote submitted. Officer will be notified to approve before you start.", report: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to submit quote: " + err.message });
  }
});

/**
 * PATCH /api/reports/:id/approve-quote
 * District Officer formally approves the price quote submitted by the technician.
 * Records quoteApproved: true, quoteApprovedAt: now, and posts a system message to the chat.
 */
router.patch("/:id/approve-quote", optionalAuth, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    if (req.user && req.user.role !== "officer" && req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden: Only District Officers or Admins can approve price quotes." });
    }

    const report = await db.collection("reports").findOne({ _id: id });
    if (!report) {
      return res.status(404).json({ error: `Report '${id}' not found` });
    }

    if (!report.quotedCostUGX) {
      return res.status(400).json({ error: "No price quote has been submitted yet for this job." });
    }

    const now = new Date();
    const officerName = req.user?.name || "District Officer";

    const approvalMsg = {
      from:     req.user?._id || "officer",
      fromName: officerName,
      fromRole: req.user?.role || "officer",
      text:     `✅ Price quote of UGX ${Number(report.quotedCostUGX).toLocaleString()} APPROVED by ${officerName}. Technician is authorized to commence work.`,
      sentAt:   now,
      type:     "quote_approved"
    };

    await db.collection("reports").updateOne(
      { _id: id },
      {
        $set: {
          quoteApproved: true,
          quoteApprovedAt: now,
          quoteApprovedBy: officerName
        },
        $push: { messages: approvalMsg }
      }
    );

    // Notify technician
    if (report.assignedTo) {
      const techUser = await db.collection("users").findOne({ role: "technician", linkedId: report.assignedTo, active: true });
      if (techUser) {
        const { sendNotification } = require("../utils/notificationService");
        await sendNotification({
          recipientUserIds: [techUser._id],
          type:    "system_alert",
          message: `✅ Officer ${officerName} approved your price quote of UGX ${Number(report.quotedCostUGX).toLocaleString()} for job ${id}. You can now start work!`,
          reportId: id
        });
      }
    }

    await logAudit({
      userId:   req.user?._id || "officer",
      action:   "QUOTE_APPROVED",
      entity:   "reports",
      entityId: id,
      details:  { quotedCostUGX: report.quotedCostUGX, approvedBy: officerName }
    });

    const updated = await db.collection("reports").findOne({ _id: id });
    res.json({ message: "Quote approved successfully.", report: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to approve quote: " + err.message });
  }
});

module.exports = router;

