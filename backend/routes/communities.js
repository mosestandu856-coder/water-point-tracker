// backend/routes/communities.js
// Handles read requests for administrative settlements (Bugema, Kalagala, etc.).
// Enforces row-level scoping: Community contacts only see their assigned community.

const express = require("express");
const router = express.Router();
const { getDB } = require("../db");
const { optionalAuth } = require("../middleware/auth");

/**
 * GET /api/communities
 * Returns communities.
 * Row-level scoping: If authenticated as 'community', returns ONLY their own community.
 */
router.get("/", optionalAuth, async (req, res) => {
  try {
    const db = getDB();
    const query = {};

    // Row-level scoping for Community Contact
    if (req.user && req.user.role === "community" && req.user.linkedId) {
      query._id = req.user.linkedId;
    }

    const communities = await db
      .collection("communities")
      .find(query)
      .sort({ name: 1 })
      .toArray();

    res.json(communities);
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve communities: " + err.message });
  }
});

/**
 * GET /api/communities/:id
 * Returns a single community by its string ID (e.g. "com_01").
 * Row-level scoping: Community contacts cannot inspect other communities.
 */
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user && req.user.role === "community" && req.user.linkedId && req.user.linkedId !== id) {
      return res.status(403).json({
        error: `Forbidden: You only have permission to view your assigned community (${req.user.linkedId}).`
      });
    }

    const db = getDB();
    const community = await db.collection("communities").findOne({ _id: id });
    if (!community) {
      return res.status(404).json({ error: `Community '${id}' not found` });
    }

    res.json(community);
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve community: " + err.message });
  }
});

module.exports = router;
