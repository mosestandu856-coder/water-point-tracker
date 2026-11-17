// backend/utils/notificationService.js
// Creates and dispatches in-app notifications to targeted roles.
// Isolated in one module so an SMS gateway (e.g. Africa's Talking) can be easily plugged in.

const { getDB } = require("../db");

/**
 * Send an in-app notification to one or multiple users.
 * @param {Object} options
 * @param {string|string[]} options.recipientUserIds - User ID or array of User IDs
 * @param {string} options.type - Notification type (see notifications collection enum)
 * @param {string} options.message - Human-readable alert message
 * @param {string} [options.reportId] - Associated report ID (lifecycle notifications)
 * @param {string} [options.relatedId] - Associated entity ID (e.g. user ID for approvals)
 */
async function sendNotification({ recipientUserIds, type, message, reportId = null, relatedId = null }) {
  try {
    const db = getDB();
    if (!db) return;

    const notifColl = db.collection("notifications");
    const uids = Array.isArray(recipientUserIds) ? recipientUserIds : [recipientUserIds];
    const validUids = uids.filter(Boolean);

    if (validUids.length === 0) return;

    const lastEntry = await notifColl.find({}, { projection: { _id: 1 } }).sort({ _id: -1 }).limit(1).toArray();
    let nextNum = 0;
    if (lastEntry.length > 0 && typeof lastEntry[0]._id === "string" && lastEntry[0]._id.startsWith("notif_")) {
      const parsed = parseInt(lastEntry[0]._id.replace("notif_", ""), 10);
      if (!isNaN(parsed)) nextNum = parsed;
    }
    let index = 0;

    const docs = validUids.map((uid) => {
      index++;
      return {
        _id: `notif_${String(nextNum + index).padStart(3, "0")}`,
        userId: uid,
        type,
        message,
        reportId: reportId ? String(reportId) : null,
        // relatedId links the notification to a user (used for approval workflow)
        ...(relatedId ? { relatedId: String(relatedId) } : {}),
        read: false,
        createdAt: new Date()
      };
    });

    await notifColl.insertMany(docs);
  } catch (err) {
    // Non-blocking error logging
    console.error(`[Notification Service Failure] ${type}:`, err.message);
  }
}

/**
 * Helper to dispatch notification on report lifecycle transitions.
 */
async function notifyLifecycleChange({ action, report, waterPoint, actorUser }) {
  try {
    const db = getDB();
    if (!db) return;

    const usersColl = db.collection("users");

    // Fetch district officers
    const officers = await usersColl.find({ role: "officer", active: true }).toArray();
    const officerIds = officers.map((o) => o._id);

    // Fetch community contact user linked to water point's community
    const communityUser = waterPoint
      ? await usersColl.findOne({ role: "community", linkedId: waterPoint.communityId, active: true })
      : null;

    if (action === "REPORT_FILED") {
      const recipients = [...officerIds];
      if (communityUser && !recipients.includes(communityUser._id)) {
        recipients.push(communityUser._id);
      }
      await sendNotification({
        recipientUserIds: recipients,
        type: "report_filed",
        message: `New breakdown reported for ${waterPoint?.type?.replace("_", " ") || "water point"} (${report.waterPointId}): "${report.problem}"`,
        reportId: report._id
      });
    } else if (action === "REPORT_ASSIGNED") {
      // Find technician user
      const techUser = await usersColl.findOne({ role: "technician", linkedId: report.assignedTo, active: true });
      const recipients = [];
      if (techUser) recipients.push(techUser._id);
      if (communityUser && !recipients.includes(communityUser._id)) recipients.push(communityUser._id);

      await sendNotification({
        recipientUserIds: recipients,
        type: "report_assigned",
        message: `Report ${report._id} has been assigned to technician for repair.`,
        reportId: report._id
      });
    } else if (action === "WORK_STARTED") {
      const recipients = [...officerIds];
      if (communityUser && !recipients.includes(communityUser._id)) recipients.push(communityUser._id);

      await sendNotification({
        recipientUserIds: recipients,
        type: "work_started",
        message: `Technician has arrived on site and started repairs on ${report.waterPointId}.`,
        reportId: report._id
      });
    } else if (action === "QUOTE_APPROVED") {
      // Officer replied to price quote — notify the technician they can start work
      const techUser2 = await usersColl.findOne({ role: "technician", linkedId: report.assignedTo, active: true });
      if (techUser2) {
        await sendNotification({
          recipientUserIds: [techUser2._id],
          type: "quote_approved",
          message: `The District Officer has accepted your price quote for job ${report._id}. You may now start work.`,
          reportId: report._id
        });
      }
    } else if (action === "REPAIR_RESOLVED") {
      const recipients = [...officerIds];
      if (communityUser && !recipients.includes(communityUser._id)) recipients.push(communityUser._id);

      // Include agreed cost in the notification if it was quoted
      const costInfo = report.quotedCostUGX
        ? ` Agreed cost: UGX ${Number(report.quotedCostUGX).toLocaleString()}.`
        : report.costUGX
        ? ` Cost: UGX ${Number(report.costUGX).toLocaleString()}.`
        : "";

      // Find technician name
      const techUser = await usersColl.findOne({ role: "technician", linkedId: report.assignedTo, active: true });
      const techName = techUser?.name || report.assignedTo || "Technician";

      await sendNotification({
        recipientUserIds: officers.map(o => o._id),  // Officers only get the payment action
        type: "payment_approval_needed",
        message: `✅ ${techName} has completed the repair on ${waterPoint?.type?.replace("_", " ") || "water point"} (Job ${report._id}).${costInfo} Please review and disburse Mobile Money payment.`,
        reportId: report._id
      });

      // Also notify community contact that repair is done
      if (communityUser) {
        await sendNotification({
          recipientUserIds: [communityUser._id],
          type: "repair_resolved",
          message: `Water point repair completed by ${techName}. The water point is now working. (Job ${report._id})`,
          reportId: report._id
        });
      }
    }
  } catch (err) {
    console.error("[Lifecycle Notification Error]", err.message);
  }
}

module.exports = { sendNotification, notifyLifecycleChange };

