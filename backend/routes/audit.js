// backend/routes/audit.js
// System Administrator audit inspection endpoints.
// Strictly restricted to users with the 'admin' role.

const express = require("express");
const router = express.Router();
const { getDB } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

/**
 * GET /api/audit
 * Returns paginated audit log entries with optional action/entity filters.
 * Strictly restricted to administrators.
 */
router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const db = getDB();
    const { action, entity, limit = 50, skip = 0 } = req.query;

    const filter = {};
    if (action) filter.action = action;
    if (entity) filter.entity = entity;

    const total = await db.collection("auditLog").countDocuments(filter);
    const logs = await db
      .collection("auditLog")
      .find(filter)
      .sort({ at: -1 })
      .skip(Number(skip))
      .limit(Math.min(Number(limit), 100))
      .toArray();

    res.json({
      total,
      limit: Number(limit),
      skip: Number(skip),
      logs
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to query audit trail: " + err.message });
  }
});

module.exports = router;

