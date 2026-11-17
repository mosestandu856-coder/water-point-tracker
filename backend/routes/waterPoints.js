// backend/routes/waterPoints.js
// Handles read requests for communal water points (boreholes, shallow wells, tap stands, protected springs).
// Supports Query 1 (filtering broken points) and detailed single water point inspection with maintenance history.
// Row-level scoping: Community contacts only query water points in their own settlement.

const express = require("express");
const router = express.Router();
const { getDB } = require("../db");
const { optionalAuth } = require("../middleware/auth");

/**
 * GET /api/water-points
 * Supports optional query filters:
 *   - ?status=broken (Query 1: matches wp_02, wp_05)
 *   - ?communityId=com_02
 *   - ?type=borehole
 * Row-level scoping: If role is 'community', communityId is strictly locked to user.linkedId.
 */
router.get("/", optionalAuth, async (req, res) => {
  try {
    const db = getDB();
    const { status, communityId, type } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (communityId) filter.communityId = communityId;
    if (type) filter.type = type;

    // Row-level scoping for Community Contact
    if (req.user && req.user.role === "community" && req.user.linkedId) {
      filter.communityId = req.user.linkedId;
    }

    const waterPoints = await db
      .collection("waterPoints")
      .find(filter)
      .sort({ _id: 1 })
      .toArray();

    res.json(waterPoints);
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve water points: " + err.message });
  }
});

/**
 * GET /api/water-points/:id
 * Fetches a single water point by string ID (e.g. "wp_02"),
 * joined with its community details and its past breakdown reports.
 * Row-level scoping: Community contacts cannot inspect water points outside their settlement.
 */
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    const waterPoint = await db.collection("waterPoints").findOne({ _id: id });
    if (!waterPoint) {
      return res.status(404).json({ error: `Water point '${id}' not found` });
    }

    // Row-level scoping check
    if (req.user && req.user.role === "community" && req.user.linkedId && waterPoint.communityId !== req.user.linkedId) {
      return res.status(403).json({
        error: `Forbidden: You only have permission to view water points within your community (${req.user.linkedId}).`
      });
    }

    // Join community information so the front end can display community name & district
    const community = await db.collection("communities").findOne(
      { _id: waterPoint.communityId },
      { projection: { name: 1, district: 1, contact: 1 } }
    );

    // Fetch all breakdown reports for this water point, newest first
    const reports = await db
      .collection("reports")
      .find({ waterPointId: id })
      .sort({ reportedAt: -1 })
      .toArray();

    res.json({
      ...waterPoint,
      community: community || null,
      reports: reports || []
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve water point: " + err.message });
  }
});

module.exports = router;
