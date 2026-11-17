// backend/utils/auditLogger.js
// Records security, state mutation, and authentication events into the 'auditLog' collection.
// Provides an immutable audit trail for District Officers and regulatory compliance.

const { getDB } = require("../db");

/**
 * Log an event to the auditLog collection.
 * @param {Object} event
 * @param {string} event.userId - User who performed the action (or "anonymous")
 * @param {string} event.action - e.g. "LOGIN", "REPORT_FILED", "STATUS_CHANGE", "ASSIGN_TECH", "USER_MODIFIED"
 * @param {string} event.entity - e.g. "users", "reports", "waterPoints", "auth"
 * @param {string} event.entityId - ID of the affected document
 * @param {Object} [event.details] - Additional contextual details
 */
async function logAudit({ userId, action, entity, entityId, details = {} }) {
  try {
    const db = getDB();
    if (!db) return;

    const auditColl = db.collection("auditLog");
    const lastEntry = await auditColl.find({}, { projection: { _id: 1 } }).sort({ _id: -1 }).limit(1).toArray();
    let nextNum = 1;
    if (lastEntry.length > 0 && typeof lastEntry[0]._id === "string" && lastEntry[0]._id.startsWith("audit_")) {
      const parsed = parseInt(lastEntry[0]._id.replace("audit_", ""), 10);
      if (!isNaN(parsed)) nextNum = parsed + 1;
    }
    const nextId = `audit_${String(nextNum).padStart(3, "0")}`;

    await auditColl.insertOne({
      _id: nextId,
      userId: userId || "anonymous",
      action,
      entity,
      entityId: String(entityId),
      at: new Date(),
      details
    });
  } catch (err) {
    // Non-blocking: audit logging error must not crash the primary request
    console.error(`[Audit Log Failure] ${action} on ${entity}/${entityId}:`, err.message);
  }
}

module.exports = { logAudit };

