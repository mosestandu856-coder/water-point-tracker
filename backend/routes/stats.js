// backend/routes/stats.js
// Handles aggregation queries and statistical summaries for dashboards.
// Features:
//   - GET /api/stats/summary: KPI overview (water points, reports, households affected)
//   - GET /api/stats/broken-by-community: Query 5 $match -> $group -> $lookup aggregation
//   - GET /api/stats/mta-mttr: Mean Time to Assign & Mean Time to Resolve
//   - GET /api/stats/cost-by-type: Expenditures grouped by extraction technology
//   - GET /api/stats/cost-by-technician: Expenditures grouped by technician
//   - GET /api/stats/recurrence: Points with 2+ breakdowns in the past 12 months
//   - GET /api/stats/service-backlog: Water points unserviced or overdue (> 12 months)
//   - GET /api/stats/technician-workload: Real-time dispatch workload across all mechanics
//   - GET /api/stats/export/reports.csv & water-points.csv: CSV export for District Officers

const express = require("express");
const router = express.Router();
const { getDB } = require("../db");
const { optionalAuth, requireRole } = require("../middleware/auth");

/**
 * GET /api/stats/summary
 * High-level KPI operational counts.
 */
router.get("/summary", optionalAuth, async (req, res) => {
  try {
    const db = getDB();

    // 1. Group water points by status
    const wpStats = await db
      .collection("waterPoints")
      .aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            households: { $sum: "$householdsServed" }
          }
        }
      ])
      .toArray();

    const waterPoints = { working: 0, broken: 0, low_yield: 0, total: 0 };
    let affectedHouseholds = 0;

    wpStats.forEach((item) => {
      if (item._id in waterPoints) {
        waterPoints[item._id] = item.count;
      }
      waterPoints.total += item.count;
      if (item._id === "broken" || item._id === "low_yield") {
        affectedHouseholds += item.households;
      }
    });

    // 2. Group reports by status (supports additive in_progress)
    const reportStats = await db
      .collection("reports")
      .aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ])
      .toArray();

    const reports = { open: 0, assigned: 0, in_progress: 0, resolved: 0, total: 0 };
    reportStats.forEach((item) => {
      if (item._id in reports) {
        reports[item._id] = item.count;
      }
      reports.total += item.count;
    });

    // 3. Technician availability
    const techStats = await db
      .collection("technicians")
      .aggregate([
        {
          $group: {
            _id: "$available",
            count: { $sum: 1 }
          }
        }
      ])
      .toArray();

    let totalTechs = 0;
    let availableTechs = 0;
    techStats.forEach((item) => {
      totalTechs += item.count;
      if (item._id === true) availableTechs = item.count;
    });

    res.json({
      waterPoints,
      reports,
      affectedHouseholds,
      technicians: {
        total: totalTechs,
        available: availableTechs
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to compile summary stats: " + err.message });
  }
});

/**
 * GET /api/stats/broken-by-community
 * Returns ALL communities with water point counts, broken counts and household figures.
 * Uses communities collection as the driving collection so every community appears
 * even when it has zero broken water points (B4).
 */
router.get("/broken-by-community", async (req, res) => {
  try {
    const db = getDB();

    const pipeline = [
      // Start from communities so all 5 always appear
      {
        $lookup: {
          from: "waterPoints",
          localField: "_id",
          foreignField: "communityId",
          as: "allPoints"
        }
      },
      {
        $project: {
          communityId: "$_id",
          _id: 0,
          communityName: "$name",
          district: "$district",
          totalHouseholds: "$households",
          totalWaterPoints: { $size: "$allPoints" },
          brokenCount: {
            $size: {
              $filter: {
                input: "$allPoints",
                as: "wp",
                cond: { $eq: ["$$wp.status", "broken"] }
              }
            }
          },
          affectedHouseholds: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$allPoints",
                    as: "wp",
                    cond: { $in: ["$$wp.status", ["broken", "low_yield"]] }
                  }
                },
                as: "affected",
                in: "$$affected.householdsServed"
              }
            }
          },
          brokenHouseholds: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$allPoints",
                    as: "wp",
                    cond: { $eq: ["$$wp.status", "broken"] }
                  }
                },
                as: "b",
                in: "$$b.householdsServed"
              }
            }
          }
        }
      },
      {
        $addFields: {
          percentBrokenPoints: {
            $cond: {
              if: { $gt: ["$totalWaterPoints", 0] },
              then: {
                $round: [
                  { $multiply: [{ $divide: ["$brokenCount", "$totalWaterPoints"] }, 100] },
                  0
                ]
              },
              else: 0
            }
          },
          percentHouseholdsAffected: {
            $cond: {
              if: { $gt: ["$totalHouseholds", 0] },
              then: {
                $round: [
                  { $multiply: [{ $divide: ["$brokenHouseholds", "$totalHouseholds"] }, 100] },
                  0
                ]
              },
              else: 0
            }
          }
        }
      },
      { $sort: { brokenCount: -1, communityName: 1 } }
    ];

    const results = await db.collection("communities").aggregate(pipeline).toArray();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Failed to compile community breakdown: " + err.message });
  }
});

/**
 * GET /api/stats/mta-mttr
 * Computes Mean Time to Assign (MTA) and Mean Time to Resolve (MTTR).
 */
router.get("/mta-mttr", async (req, res) => {
  try {
    const db = getDB();
    const reports = await db.collection("reports").find({}).toArray();

    let totalAssignHours = 0;
    let assignedCount = 0;
    let totalResolveHours = 0;
    let resolvedCount = 0;

    reports.forEach((rpt) => {
      const reportedAt = new Date(rpt.reportedAt).getTime();

      // Check statusHistory for assigned timestamp
      if (Array.isArray(rpt.statusHistory)) {
        const assignedEntry = rpt.statusHistory.find((h) => h.status === "assigned");
        if (assignedEntry && assignedEntry.at) {
          const diffHours = (new Date(assignedEntry.at).getTime() - reportedAt) / (1000 * 60 * 60);
          if (diffHours >= 0) {
            totalAssignHours += diffHours;
            assignedCount++;
          }
        }
      }

      // Check resolved timestamp
      if (rpt.status === "resolved" && rpt.resolvedAt) {
        const diffHours = (new Date(rpt.resolvedAt).getTime() - reportedAt) / (1000 * 60 * 60);
        if (diffHours >= 0) {
          totalResolveHours += diffHours;
          resolvedCount++;
        }
      }
    });

    const mtaHours = assignedCount > 0 ? Math.round((totalAssignHours / assignedCount) * 10) / 10 : 0;
    const mttrHours = resolvedCount > 0 ? Math.round((totalResolveHours / resolvedCount) * 10) / 10 : 0;

    res.json({
      mta: {
        hours: mtaHours,
        days: Math.round((mtaHours / 24) * 10) / 10,
        sampleSize: assignedCount
      },
      mttr: {
        hours: mttrHours,
        days: Math.round((mttrHours / 24) * 10) / 10,
        sampleSize: resolvedCount
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to compute MTA/MTTR: " + err.message });
  }
});

/**
 * GET /api/stats/cost-by-type
 * Total and average repair expenditures grouped by water point type.
 */
router.get("/cost-by-type", async (req, res) => {
  try {
    const db = getDB();

    const pipeline = [
      { $match: { costUGX: { $ne: null } } },
      {
        $lookup: {
          from: "waterPoints",
          localField: "waterPointId",
          foreignField: "_id",
          as: "waterPoint"
        }
      },
      { $unwind: "$waterPoint" },
      {
        $group: {
          _id: "$waterPoint.type",
          completedRepairs: { $sum: 1 },
          totalCostUGX: { $sum: "$costUGX" },
          avgCostUGX: { $avg: "$costUGX" }
        }
      },
      {
        $project: {
          waterPointType: "$_id",
          _id: 0,
          completedRepairs: 1,
          totalCostUGX: 1,
          avgCostUGX: { $round: ["$avgCostUGX", 0] }
        }
      },
      { $sort: { totalCostUGX: -1 } }
    ];

    const results = await db.collection("reports").aggregate(pipeline).toArray();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Failed to compile costs by type: " + err.message });
  }
});

/**
 * GET /api/stats/recurrence
 * Identifies chronic failure points: water points with 2+ reports recorded.
 */
router.get("/recurrence", async (req, res) => {
  try {
    const db = getDB();

    const pipeline = [
      {
        $group: {
          _id: "$waterPointId",
          reportCount: { $sum: 1 },
          reportIds: { $push: "$_id" },
          latestReportAt: { $max: "$reportedAt" }
        }
      },
      { $match: { reportCount: { $gte: 2 } } },
      {
        $lookup: {
          from: "waterPoints",
          localField: "_id",
          foreignField: "_id",
          as: "waterPoint"
        }
      },
      { $unwind: "$waterPoint" },
      {
        $lookup: {
          from: "communities",
          localField: "waterPoint.communityId",
          foreignField: "_id",
          as: "community"
        }
      },
      { $unwind: "$community" },
      {
        $project: {
          waterPointId: "$_id",
          _id: 0,
          type: "$waterPoint.type",
          landmark: "$waterPoint.landmark",
          status: "$waterPoint.status",
          communityName: "$community.name",
          reportCount: 1,
          latestReportAt: 1
        }
      },
      { $sort: { reportCount: -1 } }
    ];

    const results = await db.collection("reports").aggregate(pipeline).toArray();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Failed to compile recurrence stats: " + err.message });
  }
});

/**
 * GET /api/stats/service-backlog
 * Water points unserviced (lastServiced null) or overdue for preventive maintenance (> 12 months).
 */
router.get("/service-backlog", async (req, res) => {
  try {
    const db = getDB();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const pipeline = [
      {
        $match: {
          $or: [
            { lastServiced: null },
            { lastServiced: { $lt: oneYearAgo } }
          ]
        }
      },
      {
        $lookup: {
          from: "communities",
          localField: "communityId",
          foreignField: "_id",
          as: "community"
        }
      },
      { $unwind: "$community" },
      {
        $project: {
          _id: 1,
          type: 1,
          landmark: 1,
          status: 1,
          installedYear: 1,
          householdsServed: 1,
          lastServiced: 1,
          communityName: "$community.name",
          district: "$community.district",
          serviceCategory: {
            $cond: {
              if: { $eq: ["$lastServiced", null] },
              then: "Never Serviced",
              else: "Overdue (> 12 months)"
            }
          }
        }
      },
      { $sort: { installedYear: 1 } }
    ];

    const results = await db.collection("waterPoints").aggregate(pipeline).toArray();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Failed to compile service backlog: " + err.message });
  }
});

/**
 * GET /api/stats/technician-workload
 * Real-time technician dispatch workload: active jobs vs completed repairs.
 */
router.get("/technician-workload", async (req, res) => {
  try {
    const db = getDB();

    const technicians = await db.collection("technicians").find({}).sort({ name: 1 }).toArray();

    const activeCounts = await db
      .collection("reports")
      .aggregate([
        { $match: { status: { $in: ["assigned", "in_progress"] }, assignedTo: { $ne: null } } },
        { $group: { _id: "$assignedTo", activeCount: { $sum: 1 } } }
      ])
      .toArray();

    const completedCounts = await db
      .collection("reports")
      .aggregate([
        { $match: { status: "resolved", assignedTo: { $ne: null } } },
        {
          $group: {
            _id: "$assignedTo",
            completedCount: { $sum: 1 },
            totalRepairsUGX: { $sum: { $ifNull: ["$costUGX", 0] } }
          }
        }
      ])
      .toArray();

    const activeMap = Object.fromEntries(activeCounts.map((a) => [a._id, a.activeCount]));
    const completedMap = Object.fromEntries(completedCounts.map((c) => [c._id, c]));

    const workload = technicians.map((tech) => {
      const completedInfo = completedMap[tech._id] || { completedCount: 0, totalRepairsUGX: 0 };
      return {
        _id: tech._id,
        name: tech.name,
        phone: tech.phone,
        skills: tech.skills,
        coversCommunities: tech.coversCommunities,
        available: tech.available,
        activeJobs: activeMap[tech._id] || 0,
        completedJobs: completedInfo.completedCount,
        totalRepairsUGX: completedInfo.totalRepairsUGX
      };
    });

    res.json(workload);
  } catch (err) {
    res.status(500).json({ error: "Failed to compile technician workload: " + err.message });
  }
});

/**
 * GET /api/stats/export/reports.csv
 * Streams reports data as CSV for District Officers.
 */
router.get("/export/reports.csv", optionalAuth, async (req, res) => {
  try {
    if (req.user && req.user.role !== "officer") {
      return res.status(403).json({ error: "Forbidden: CSV export is restricted to District Officers." });
    }

    const db = getDB();
    const reports = await db.collection("reports").find({}).sort({ reportedAt: -1 }).toArray();

    const header = "Report ID,Water Point ID,Reporter Name,Reporter Phone,Severity,Status,Assigned To,Reported Date,Resolved Date,Cost UGX,Problem\n";
    const rows = reports.map((r) => {
      const name = (r.reportedBy?.name || "").replace(/,/g, " ");
      const phone = (r.reportedBy?.phone || "").replace(/,/g, " ");
      const problem = (r.problem || "").replace(/[\r\n,]/g, " ");
      const reportedAt = r.reportedAt ? new Date(r.reportedAt).toISOString() : "";
      const resolvedAt = r.resolvedAt ? new Date(r.resolvedAt).toISOString() : "";
      const cost = r.costUGX !== undefined && r.costUGX !== null ? r.costUGX : "";
      return `${r._id},${r.waterPointId},${name},${phone},${r.severity},${r.status},${r.assignedTo || ""},${reportedAt},${resolvedAt},${cost},"${problem}"`;
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="water_reports_export.csv"');
    res.send(header + rows.join("\n"));
  } catch (err) {
    res.status(500).json({ error: "Failed to export reports CSV: " + err.message });
  }
});

/**
 * GET /api/stats/export/water-points.csv
 * Streams water points inventory as CSV for District Officers.
 */
router.get("/export/water-points.csv", optionalAuth, async (req, res) => {
  try {
    if (req.user && req.user.role !== "officer") {
      return res.status(403).json({ error: "Forbidden: CSV export is restricted to District Officers." });
    }

    const db = getDB();
    const waterPoints = await db.collection("waterPoints").find({}).sort({ _id: 1 }).toArray();

    const header = "Water Point ID,Community ID,Type,Status,Landmark,Installed Year,Households Served,Last Serviced\n";
    const rows = waterPoints.map((w) => {
      const landmark = (w.landmark || "").replace(/,/g, " ");
      const serviced = w.lastServiced ? new Date(w.lastServiced).toISOString() : "";
      return `${w._id},${w.communityId},${w.type},${w.status},"${landmark}",${w.installedYear},${w.householdsServed},${serviced}`;
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="water_points_inventory.csv"');
    res.send(header + rows.join("\n"));
  } catch (err) {
    res.status(500).json({ error: "Failed to export water points CSV: " + err.message });
  }
});

module.exports = router;
