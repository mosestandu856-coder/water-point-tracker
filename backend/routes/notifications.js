// backend/routes/notifications.js
// In-app notifications endpoints: fetch alerts, mark read, unread badge counters.

const express = require("express");
const router = express.Router();
const { getDB } = require("../db");
const { requireAuth } = require("../middleware/auth");

/**
 * GET /api/notifications
 * Returns notifications for the authenticated user, sorted latest-first.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const notifications = await db
      .collection("notifications")
      .find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    const unreadCount = await db.collection("notifications").countDocuments({
      userId: req.user._id,
      read: false
    });

    res.json({
      unreadCount,
      notifications
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch notifications: " + err.message });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Marks a single notification as read.
 */
router.patch("/:id/read", requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const result = await db.collection("notifications").updateOne(
      { _id: req.params.id, userId: req.user._id },
      { $set: { read: true } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Notification not found or unauthorized." });
    }

    res.json({ message: "Notification marked as read." });
  } catch (err) {
    res.status(500).json({ error: "Failed to update notification: " + err.message });
  }
});

/**
 * PATCH /api/notifications/mark-all-read
 * Marks all notifications for the current user as read.
 */
router.patch("/mark-all-read", requireAuth, async (req, res) => {
  try {
    const db = getDB();
    await db.collection("notifications").updateMany(
      { userId: req.user._id, read: false },
      { $set: { read: true } }
    );

    res.json({ message: "All notifications marked as read." });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark notifications read: " + err.message });
  }
});

module.exports = router;

