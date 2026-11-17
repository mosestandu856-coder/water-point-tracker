// backend/routes/technicians.js
// Handles queries for local artisans and hand pump mechanics.
// Features:
//   - Query 2: Multikey search for available technicians covering a specific community.
//   - Smart dispatch ranking: Recommends technicians ranked by skill match and lowest active workload.
//   - Self-service availability toggling for technicians.

const express = require("express");
const router = express.Router();
const { getDB } = require("../db");
const { optionalAuth, requireRole } = require("../middleware/auth");
const { logAudit } = require("../utils/auditLogger");

/**
 * GET /api/technicians
 * Supports optional query filters:
 *   - ?communityId=com_02 (Query 2: matches tech_01, tech_04)
 *   - ?available=true
 *   - ?skill=hand pump
 */
router.get("/", async (req, res) => {
  try {
    const db = getDB();
    const { communityId, available, skill } = req.query;

    const filter = {};
    if (communityId) {
      filter.coversCommunities = communityId;
    }
    if (available !== undefined) {
      filter.available = available === "true";
    }
    if (skill) {
      filter.skills = skill;
    }

    const technicians = await db
      .collection("technicians")
      .find(filter)
      .sort({ name: 1 })
      .toArray();

    res.json(technicians);
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve technicians: " + err.message });
  }
});

/**
 * GET /api/technicians/ranked-for-report/:reportId
 * Returns available technicians covering the report's community,
 * ranked by skill match (recommended) and fewest open/active jobs.
 */
router.get("/ranked-for-report/:reportId", optionalAuth, async (req, res) => {
  try {
    const db = getDB();
    const { reportId } = req.params;

    const report = await db.collection("reports").findOne({ _id: reportId });
    if (!report) {
      return res.status(404).json({ error: `Report '${reportId}' not found` });
    }

    const waterPoint = await db.collection("waterPoints").findOne({ _id: report.waterPointId });
    if (!waterPoint) {
      return res.status(404).json({ error: `Associated water point '${report.waterPointId}' not found` });
    }

    // Hard constraints: must be available AND cover this community
    const eligibleTechnicians = await db
      .collection("technicians")
      .find({
        coversCommunities: waterPoint.communityId,
        available: true
      })
      .toArray();

    // Map of expected skills per water point type
    const skillMapping = {
      borehole: ["borehole", "hand pump"],
      protected_spring: ["masonry", "plumbing"],
      shallow_well: ["hand pump", "masonry"],
      tap_stand: ["piping", "plumbing"]
    };
    const desiredSkills = skillMapping[waterPoint.type] || [];

    // Count active jobs per technician
    const activeJobs = await db
      .collection("reports")
      .aggregate([
        { $match: { status: { $in: ["assigned", "in_progress"] } } },
        { $group: { _id: "$assignedTo", activeCount: { $sum: 1 } } }
      ])
      .toArray();

    const jobCountMap = Object.fromEntries(activeJobs.map((j) => [j._id, j.activeCount]));

    const ranked = eligibleTechnicians.map((tech) => {
      // Check skill match
      const hasSkillMatch = Array.isArray(tech.skills) && tech.skills.some((s) => desiredSkills.includes(s.toLowerCase()));
      const currentActiveJobs = jobCountMap[tech._id] || 0;

      return {
        ...tech,
        skillMatch: hasSkillMatch,
        activeJobsCount: currentActiveJobs,
        matchScore: (hasSkillMatch ? 10 : 0) - currentActiveJobs
      };
    });

    // Sort: skill match first, then lowest active workload, then name
    ranked.sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name));

    res.json({
      waterPointType: waterPoint.type,
      desiredSkills,
      rankedTechnicians: ranked
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to rank technicians: " + err.message });
  }
});

/**
 * GET /api/technicians/:id
 * Returns a single technician by string ID (e.g. "tech_01").
 */
router.get("/:id", async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    const technician = await db.collection("technicians").findOne({ _id: id });
    if (!technician) {
      return res.status(404).json({ error: `Technician '${id}' not found` });
    }

    res.json(technician);
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve technician: " + err.message });
  }
});

/**
 * PATCH /api/technicians/:id/availability
 * Toggles a technician's availability status.
 * Technicians can toggle their own; District Officers can toggle any.
 */
router.patch("/:id/availability", optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { available } = req.body;

    if (typeof available !== "boolean") {
      return res.status(400).json({ error: "Field 'available' must be a boolean." });
    }

    // Role check
    if (req.user) {
      if (req.user.role === "technician" && req.user.linkedId !== id) {
        return res.status(403).json({ error: "Forbidden: You may only update your own availability." });
      }
      if (req.user.role !== "technician" && req.user.role !== "officer") {
        return res.status(403).json({ error: "Forbidden: Insufficient privileges." });
      }
    }

    const db = getDB();
    const result = await db.collection("technicians").updateOne(
      { _id: id },
      { $set: { available } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: `Technician '${id}' not found` });
    }

    const updated = await db.collection("technicians").findOne({ _id: id });

    await logAudit({
      userId: req.user ? req.user._id : "technician_user",
      action: "AVAILABILITY_TOGGLED",
      entity: "technicians",
      entityId: id,
      details: { available }
    });

    res.json({
      message: `Technician availability updated to ${available ? "available" : "unavailable"}.`,
      technician: updated
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update availability: " + err.message });
  }
});

module.exports = router;
