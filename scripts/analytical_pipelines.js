// scripts/analytical_pipelines.js
// Implements and executes the 7 analytical aggregation pipelines for Phase 4.
// Run with: mongosh mongodb://localhost:27017/waterTracker scripts/analytical_pipelines.js

const targetDb = db.getSiblingDB("waterTracker");

print("\n=================================================================");
print("       PHASE 4: ADVANCED ANALYTICAL AGGREGATION PIPELINES         ");
print("=================================================================");

// -----------------------------------------------------------------
// PIPELINE 1: Broken Points Per Community Joined to Community Names & Households
// -----------------------------------------------------------------
print("\n--- Pipeline 1: Broken Water Points per Community ($lookup & $group) ---");
const p1 = targetDb.waterPoints.aggregate([
  { $match: { status: "broken" } },
  {
    $group: {
      _id: "$communityId",
      brokenWaterPoints: { $sum: 1 },
      affectedHouseholds: { $sum: "$householdsServed" },
      waterPointIds: { $push: "$_id" }
    }
  },
  {
    $lookup: {
      from: "communities",
      localField: "_id",
      foreignField: "_id",
      as: "community"
    }
  },
  { $unwind: "$community" },
  {
    $project: {
      _id: 0,
      communityId: "$community._id",
      communityName: "$community.name",
      district: "$community.district",
      totalCommunityHouseholds: "$community.households",
      brokenWaterPoints: 1,
      affectedHouseholds: 1,
      waterPointIds: 1,
      percentHouseholdsAffected: {
        $round: [
          { $multiply: [{ $divide: ["$affectedHouseholds", "$community.households"] }, 100] },
          1
        ]
      }
    }
  },
  { $sort: { brokenWaterPoints: -1 } }
]).toArray();
printjson(p1);

// -----------------------------------------------------------------
// PIPELINE 2: Mean Time to Assign (MTA) & Mean Time to Resolve (MTTR)
// -----------------------------------------------------------------
print("\n--- Pipeline 2: Mean Time to Assign (MTA) & Mean Time to Resolve (MTTR) ---");
const p2 = targetDb.reports.aggregate([
  {
    $project: {
      _id: 1,
      status: 1,
      reportedAt: 1,
      resolvedAt: 1,
      statusHistory: 1,
      // Extract time from open to assigned from statusHistory
      assignDurationHours: {
        $let: {
          vars: {
            openEntry: { $arrayElemAt: [{ $filter: { input: "$statusHistory", as: "h", cond: { $eq: ["$$h.status", "open"] } } }, 0] },
            assignedEntry: { $arrayElemAt: [{ $filter: { input: "$statusHistory", as: "h", cond: { $eq: ["$$h.status", "assigned"] } } }, 0] }
          },
          in: {
            $cond: [
              { $and: [{ $ne: ["$$openEntry", null] }, { $ne: ["$$assignedEntry", null] }] },
              { $divide: [{ $subtract: ["$$assignedEntry.at", "$$openEntry.at"] }, 1000 * 60 * 60] },
              null
            ]
          }
        }
      },
      // Extract time to resolve
      resolveDurationHours: {
        $cond: [
          { $ne: ["$resolvedAt", null] },
          { $divide: [{ $subtract: ["$resolvedAt", "$reportedAt"] }, 1000 * 60 * 60] },
          null
        ]
      }
    }
  },
  {
    $group: {
      _id: null,
      totalReportsSampled: { $sum: 1 },
      assignedReportsCount: { $sum: { $cond: [{ $ne: ["$assignDurationHours", null] }, 1, 0] } },
      meanTimeToAssignHours: { $avg: "$assignDurationHours" },
      resolvedReportsCount: { $sum: { $cond: [{ $ne: ["$resolveDurationHours", null] }, 1, 0] } },
      meanTimeToResolveHours: { $avg: "$resolveDurationHours" }
    }
  },
  {
    $project: {
      _id: 0,
      totalReportsSampled: 1,
      assignedReportsCount: 1,
      meanTimeToAssignHours: { $round: ["$meanTimeToAssignHours", 2] },
      meanTimeToAssignMinutes: { $round: [{ $multiply: ["$meanTimeToAssignHours", 60] }, 0] },
      resolvedReportsCount: 1,
      meanTimeToResolveHours: { $round: ["$meanTimeToResolveHours", 2] },
      meanTimeToResolveDays: { $round: [{ $divide: ["$meanTimeToResolveHours", 24] }, 2] }
    }
  }
]).toArray();
printjson(p2);

// -----------------------------------------------------------------
// PIPELINE 3: Repair Cost by Water Point Type & by Technician
// -----------------------------------------------------------------
print("\n--- Pipeline 3A: Repair Cost by Water Point Type ---");
const p3a = targetDb.reports.aggregate([
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
      avgCostUGX: { $avg: "$costUGX" },
      minCostUGX: { $min: "$costUGX" },
      maxCostUGX: { $max: "$costUGX" }
    }
  },
  {
    $project: {
      waterPointType: "$_id",
      _id: 0,
      completedRepairs: 1,
      totalCostUGX: 1,
      avgCostUGX: { $round: ["$avgCostUGX", 0] },
      minCostUGX: 1,
      maxCostUGX: 1
    }
  },
  { $sort: { totalCostUGX: -1 } }
]).toArray();
printjson(p3a);

print("\n--- Pipeline 3B: Repair Cost by Technician ---");
const p3b = targetDb.reports.aggregate([
  { $match: { costUGX: { $ne: null }, assignedTo: { $ne: null } } },
  {
    $lookup: {
      from: "technicians",
      localField: "assignedTo",
      foreignField: "_id",
      as: "tech"
    }
  },
  { $unwind: "$tech" },
  {
    $group: {
      _id: "$tech._id",
      technicianName: { $first: "$tech.name" },
      completedRepairs: { $sum: 1 },
      totalEarnedUGX: { $sum: "$costUGX" },
      avgRepairCostUGX: { $avg: "$costUGX" }
    }
  },
  {
    $project: {
      technicianId: "$_id",
      _id: 0,
      technicianName: 1,
      completedRepairs: 1,
      totalEarnedUGX: 1,
      avgRepairCostUGX: { $round: ["$avgRepairCostUGX", 0] }
    }
  },
  { $sort: { totalEarnedUGX: -1 } }
]).toArray();
printjson(p3b);

// -----------------------------------------------------------------
// PIPELINE 4: Recurrence Analysis (Water Points with Chronic Failures)
// -----------------------------------------------------------------
print("\n--- Pipeline 4: Water Point Breakdown Frequency / Recurrence ---");
const p4 = targetDb.reports.aggregate([
  {
    $group: {
      _id: "$waterPointId",
      totalReports: { $sum: 1 },
      distinctProblems: { $push: "$problem" },
      severities: { $push: "$severity" },
      mostRecentReport: { $max: "$reportedAt" }
    }
  },
  {
    $lookup: {
      from: "waterPoints",
      localField: "_id",
      foreignField: "_id",
      as: "wp"
    }
  },
  { $unwind: "$wp" },
  {
    $project: {
      waterPointId: "$_id",
      _id: 0,
      type: "$wp.type",
      landmark: "$wp.landmark",
      communityId: "$wp.communityId",
      householdsServed: "$wp.householdsServed",
      totalReports: 1,
      distinctProblems: 1,
      severities: 1,
      mostRecentReport: 1,
      isChronic: { $gte: ["$totalReports", 2] }
    }
  },
  { $sort: { totalReports: -1, householdsServed: -1 } }
]).toArray();
printjson(p4);

// -----------------------------------------------------------------
// PIPELINE 5: Service Backlog (lastServiced null or older than 12 months)
// -----------------------------------------------------------------
print("\n--- Pipeline 5: Preventative Maintenance Service Backlog ---");
// Cutoff: 12 months prior to current project date (October 2026 -> October 2025)
const twelveMonthsAgo = new Date("2025-10-01T00:00:00Z");

const p5 = targetDb.waterPoints.aggregate([
  {
    $match: {
      $or: [
        { lastServiced: null },
        { lastServiced: { $lt: twelveMonthsAgo } }
      ]
    }
  },
  {
    $lookup: {
      from: "communities",
      localField: "communityId",
      foreignField: "_id",
      as: "comm"
    }
  },
  { $unwind: "$comm" },
  {
    $project: {
      _id: 1,
      type: 1,
      landmark: 1,
      communityName: "$comm.name",
      status: 1,
      lastServiced: 1,
      householdsServed: 1,
      serviceCategory: {
        $cond: [
          { $eq: ["$lastServiced", null] },
          "NEVER_SERVICED (Critical)",
          "OVERDUE (> 12 Months)"
        ]
      }
    }
  },
  { $sort: { lastServiced: 1 } }
]).toArray();
printjson(p5);

// -----------------------------------------------------------------
// PIPELINE 6: Technician Workload (Active Dispatches per Technician)
// -----------------------------------------------------------------
print("\n--- Pipeline 6: Technician Workload & Capacity Analysis ---");
const p6 = targetDb.technicians.aggregate([
  {
    $lookup: {
      from: "reports",
      let: { techId: "$_id" },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ["$assignedTo", "$$techId"] },
                { $eq: ["$status", "assigned"] }
              ]
            }
          }
        }
      ],
      as: "activeTasks"
    }
  },
  {
    $project: {
      _id: 1,
      name: 1,
      phone: 1,
      available: 1,
      skills: 1,
      coversCommunities: 1,
      activeAssignedCount: { $size: "$activeTasks" },
      capacityStatus: {
        $cond: [
          { $eq: ["$available", false] },
          "UNAVAILABLE (Offline)",
          {
            $cond: [
              { $gt: [{ $size: "$activeTasks" }, 0] },
              "BUSY (Active Task in Progress)",
              "AVAILABLE (Ready for Dispatch)"
            ]
          }
        ]
      }
    }
  },
  { $sort: { activeAssignedCount: -1, available: -1 } }
]).toArray();
printjson(p6);

// -----------------------------------------------------------------
// PIPELINE 7: Impact-Weighted Dispatch Priority Queue
// Priority Score = Severity Weight (High: 3, Med: 2, Low: 1) * householdsServed
// -----------------------------------------------------------------
print("\n--- Pipeline 7: Impact-Weighted Dispatch Priority Queue ---");
const p7 = targetDb.reports.aggregate([
  {
    $match: {
      status: { $in: ["open", "assigned"] }
    }
  },
  {
    $lookup: {
      from: "waterPoints",
      localField: "waterPointId",
      foreignField: "_id",
      as: "wp"
    }
  },
  { $unwind: "$wp" },
  {
    $lookup: {
      from: "communities",
      localField: "wp.communityId",
      foreignField: "_id",
      as: "comm"
    }
  },
  { $unwind: "$comm" },
  {
    $addFields: {
      severityWeight: {
        $switch: {
          branches: [
            { case: { $eq: ["$severity", "high"] }, then: 3 },
            { case: { $eq: ["$severity", "medium"] }, then: 2 },
            { case: { $eq: ["$severity", "low"] }, then: 1 }
          ],
          default: 1
        }
      }
    }
  },
  {
    $project: {
      reportId: "$_id",
      waterPointId: 1,
      community: "$comm.name",
      waterPointType: "$wp.type",
      problem: 1,
      severity: 1,
      severityWeight: 1,
      householdsServed: "$wp.householdsServed",
      status: 1,
      priorityScore: { $multiply: ["$severityWeight", "$wp.householdsServed"] }
    }
  },
  { $sort: { priorityScore: -1 } }
]).toArray();
printjson(p7);

print("\n=== All 7 Analytical Pipelines Successfully Executed ===\n");
