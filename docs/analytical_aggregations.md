# Advanced Analytical Aggregation Pipelines

This document details the 7 analytical aggregation pipelines implemented in MongoDB for the **Community Water Point Tracker** (`waterTracker`). Each pipeline addresses a strategic operational question for water resource governance around Bugema University and Luweero District.

---

## Pipeline 1: Broken Points Joined to Community Names & Households

### Business Justification
A simple count of broken points is insufficient for district planning. Decision-makers need to know the human impact: which community name is affected, how many total households live there, and what proportion of the population is currently deprived of water.

### Aggregation Pipeline
```javascript
db.waterPoints.aggregate([
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
]);
```

### Viva Explanation
1. **`$match`**: Filters broken points immediately, minimizing memory usage.
2. **`$group`**: Aggregates points per community and sums `householdsServed`.
3. **`$lookup` & `$unwind`**: Joins with `communities` via `_id` and flattens the array.
4. **`$project`**: Calculates `percentHouseholdsAffected` dynamically.

### Output
- **Kalagala (`com_02`)**: 1 broken point (`wp_02`), 200 / 410 households affected (**48.8%** of community).
- **Ziroobwe (`com_03`)**: 1 broken point (`wp_05`), 180 / 520 households affected (**34.6%** of community).

---

## Pipeline 2: Mean Time to Assign (MTA) & Mean Time to Resolve (MTTR)

### Business Justification
Luweero District local government needs objective Key Performance Indicators (KPIs) to measure dispatch efficiency (how fast reports get assigned to technicians) and repair turnaround (how fast water flows again).

### Aggregation Pipeline
```javascript
db.reports.aggregate([
  {
    $project: {
      _id: 1,
      status: 1,
      reportedAt: 1,
      resolvedAt: 1,
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
]);
```

### Viva Explanation
- Uses `$filter` and `$arrayElemAt` within a `$let` block to extract timestamps from the `statusHistory` array.
- Uses date subtraction (`$subtract` returns millisecond intervals) converted into hours.
- Computes `$avg` in the `$group` stage.

### Output
- **Mean Time to Assign (MTA):** **1.69 hours** (approx. 102 minutes).
- **Mean Time to Resolve (MTTR):** **52.17 hours** (approx. 2.17 days).

---

## Pipeline 3: Repair Cost by Water Point Type & by Technician

### Business Justification
Enables budget forecasting for spare parts and tracks financial disbursements made to local technicians.

### Aggregation Pipelines

#### 3A. By Water Point Type
```javascript
db.reports.aggregate([
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
  { $sort: { totalCostUGX: -1 } }
]);
```

#### 3B. By Technician
```javascript
db.reports.aggregate([
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
  { $sort: { totalEarnedUGX: -1 } }
]);
```

### Output
- **By Type:**
  - `protected_spring`: 85,000 UGX (1 repair — `rpt_004`, cover resealing & fencing).
  - `borehole`: 40,000 UGX (1 repair — `rpt_005`, seal replacement).
- **By Technician:**
  - Joyce Auma (`tech_02`): 85,000 UGX total.
  - Mariam Nabirye (`tech_04`): 40,000 UGX total.

---

## Pipeline 4: Recurrence & Chronic Breakdown Analysis

### Business Justification
Identifies infrastructure experiencing repeat failures to determine if complete asset replacement is needed instead of repeated temporary patch-ups.

### Aggregation Pipeline
```javascript
db.reports.aggregate([
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
      isChronic: { $gte: ["$totalReports", 2] }
    }
  },
  { $sort: { totalReports: -1, householdsServed: -1 } }
]);
```

### Viva Explanation
Groups all historical reports by `waterPointId`, aggregates problem descriptions using `$push`, and calculates a boolean `isChronic` flag (`totalReports >= 2`).

---

## Pipeline 5: Preventative Maintenance Service Backlog

### Business Justification
Unserviced water points are prone to catastrophic sudden failure. This pipeline identifies points where `lastServiced` is `null` (never serviced since installation) or older than 12 months, triggering preventative maintenance visits before outages happen.

### Aggregation Pipeline
```javascript
const twelveMonthsAgo = new Date("2025-10-01T00:00:00Z");

db.waterPoints.aggregate([
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
  }
]);
```

### Output
- `wp_04` (Ziroobwe, near health centre): Installed in 2008, serves 60 households, currently `status: "low_yield"`, `lastServiced: null` &rarr; Classified as **`NEVER_SERVICED (Critical)`**.

---

## Pipeline 6: Technician Workload & Capacity Analysis

### Business Justification
Prevents technician burnout and bottlenecking by analyzing active task assignments against availability status.

### Aggregation Pipeline
```javascript
db.technicians.aggregate([
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
]);
```

### Viva Explanation
Uses an expressive `$lookup` with `let` and sub-pipeline to count only active (`status: "assigned"`) tickets, then classifies technicians into `BUSY`, `AVAILABLE`, or `UNAVAILABLE`.

### Output
- **Ibrahim Kalule (`tech_01`)**: `BUSY (1 active task on rpt_001)`.
- **Joyce Auma (`tech_02`)**: `AVAILABLE (0 active tasks)`.
- **Mariam Nabirye (`tech_04`)**: `AVAILABLE (0 active tasks)`.
- **Robert Byaruhanga (`tech_05`)**: `AVAILABLE (0 active tasks)`.
- **Charles Opio (`tech_03`)**: `UNAVAILABLE (Offline)`.

---

## Pipeline 7: Impact-Weighted Dispatch Priority Queue

### Business Justification
Rather than naive FIFO ordering, critical emergencies must be prioritized by human impact. A broken borehole serving 200 households with high severity must be fixed before a shallow well serving 60 households with medium severity.

### Formula
$$\text{Priority Score} = \text{Severity Weight} \times \text{Households Served}$$
- High Severity = 3
- Medium Severity = 2
- Low Severity = 1

### Aggregation Pipeline
```javascript
db.reports.aggregate([
  { $match: { status: { $in: ["open", "assigned"] } } },
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
      householdsServed: "$wp.householdsServed",
      status: 1,
      priorityScore: { $multiply: ["$severityWeight", "$wp.householdsServed"] }
    }
  },
  { $sort: { priorityScore: -1 } }
]);
```

### Output (Priority Ranking)
1. **Rank 1: `rpt_001` (Kalagala Borehole `wp_02`)** &rarr; Score: **600** ($3 \times 200$ households).
2. **Rank 2: `rpt_003` (Ziroobwe Tap Stand `wp_05`)** &rarr; Score: **540** ($3 \times 180$ households).
3. **Rank 3: `rpt_002` (Ziroobwe Shallow Well `wp_04`)** &rarr; Score: **120** ($2 \times 60$ households).
