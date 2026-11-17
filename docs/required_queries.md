# Required Queries & Execution Results

This document records the 5 core queries required for the **Community Water Point Tracker** database (`waterTracker`). Each query includes the business problem it solves, the exact MongoDB command, explanation for oral defense (viva), and verified execution output.

---

## Query 1: Find Broken Water Points

### 1. Business Problem
Dispatchers and maintenance managers must immediately locate non-functional water points across the communities to schedule repairs and avoid prolonged water crises.

### 2. MongoDB Shell Command
```javascript
db.waterPoints.find({ status: "broken" });
```

### 3. Explanation for Viva
We perform an equality match on the indexed `status` field for value `"broken"`. Because `waterPoints` documents store real-time operational status, this query quickly filters out `"working"` and `"low_yield"` points without touching other collections.

### 4. Verified Output
```json
[
  {
    "_id": "wp_02",
    "communityId": "com_02",
    "type": "borehole",
    "landmark": "Behind Kalagala Central Market",
    "installedYear": 2012,
    "householdsServed": 200,
    "status": "broken",
    "lastServiced": ISODate("2025-11-02T00:00:00.000Z")
  },
  {
    "_id": "wp_05",
    "communityId": "com_03",
    "type": "tap_stand",
    "landmark": "Near Ziroobwe Central Market",
    "installedYear": 2021,
    "householdsServed": 180,
    "status": "broken",
    "lastServiced": ISODate("2026-02-11T00:00:00.000Z"),
    "managedBy": "Water User Committee"
  }
]
```
**Result:** Exactly matches expected IDs: `wp_02` (Kalagala) and `wp_05` (Ziroobwe).

---

## Query 2: Find Available Technicians Covering Kalagala (`com_02`)

### 1. Business Problem
When a water point in Kalagala breaks down (e.g., `wp_02`), the coordinator needs to identify all qualified technicians who service that specific community and are currently available for assignment.

### 2. MongoDB Shell Command
```javascript
db.technicians.find({
  coversCommunities: "com_02",
  available: true
});
```

### 3. Explanation for Viva
`coversCommunities` is a multikey array field storing community IDs. In MongoDB, querying `{ coversCommunities: "com_02" }` automatically scans inside the array elements without needing special array operators. Combined with `available: true`, it provides an instantaneous lookup of ready technicians.

### 4. Verified Output
```json
[
  {
    "_id": "tech_01",
    "name": "Ibrahim Kalule",
    "phone": "0770 000 201",
    "skills": ["hand pump", "borehole"],
    "coversCommunities": ["com_01", "com_02"],
    "available": true
  },
  {
    "_id": "tech_04",
    "name": "Mariam Nabirye",
    "phone": "0770 000 204",
    "skills": ["borehole", "water testing"],
    "coversCommunities": ["com_02", "com_03", "com_04"],
    "available": true,
    "hasOwnToolkit": true
  }
]
```
**Result:** Exactly matches expected technicians: `tech_01` (Ibrahim Kalule) and `tech_04` (Mariam Nabirye).

---

## Query 3: Open Reports Needing Technician Assignment (Oldest First)

### 1. Business Problem
To uphold a fair First-In, First-Out (FIFO) service level agreement, coordinators must view unassigned breakdown reports ranked by the longest waiting time.

### 2. MongoDB Shell Command
```javascript
db.reports.find({ status: "open" }).sort({ reportedAt: 1 });
```

### 3. Explanation for Viva
We filter by `{ status: "open" }` to isolate unassigned cases, and apply `.sort({ reportedAt: 1 })` where `1` specifies ascending chronological order. This ensures the oldest report appears at the top.

### 4. Verified Output
```json
[
  {
    "_id": "rpt_002",
    "waterPointId": "wp_04",
    "reportedBy": {
      "name": "Agnes Atim",
      "phone": "0700 000 103"
    },
    "reportedAt": ISODate("2026-10-05T16:40:00.000Z"),
    "problem": "Water level very low, muddy",
    "severity": "medium",
    "status": "open",
    "assignedTo": null,
    "resolvedAt": null
  },
  {
    "_id": "rpt_003",
    "waterPointId": "wp_05",
    "reportedBy": {
      "name": "Brian Mugabi",
      "role": "Student volunteer",
      "phone": "0700 000 106"
    },
    "reportedAt": ISODate("2026-10-11T06:30:00.000Z"),
    "problem": "Tap leaking, no pressure",
    "severity": "high",
    "status": "open",
    "assignedTo": null,
    "resolvedAt": null
  }
]
```
**Result:** Exactly matches expected order: `rpt_002` (Oct 5) followed by `rpt_003` (Oct 11).

---

## Query 4: Multi-Document ACID Transaction (Record Finished Repair)

### 1. Business Problem
When a technician completes a repair on `wp_02` documented under `rpt_001`, two updates across two different collections must happen simultaneously:
1. `reports`: mark `rpt_001` as `resolved`, stamp `resolvedAt`, and record `costUGX: 60000`.
2. `waterPoints`: mark `wp_02` status back to `"working"`.

If the system crashes after Step 1, the report would say resolved while the physical water point remains flagged as broken. Using a MongoDB multi-document transaction ensures **Atomicity**: both updates commit together or neither does.

### 2. Replica Set Requirement
In MongoDB, multi-document transactions require a replica set (even a local single-node `rs0`) because transactional consistency is tracked through the replication **oplog**. Standalone servers do not maintain an active oplog for transaction coordinator state.

### 3. MongoDB Transaction Script
```javascript
const session = db.getMongo().startSession();
try {
  session.startTransaction({
    readConcern: { level: "snapshot" },
    writeConcern: { w: "majority" }
  });

  const reportsColl = session.getDatabase("waterTracker").reports;
  const wpColl = session.getDatabase("waterTracker").waterPoints;

  // 1. Resolve the report
  reportsColl.updateOne(
    { _id: "rpt_001" },
    {
      $set: {
        status: "resolved",
        resolvedAt: new Date(),
        costUGX: 60000
      }
    }
  );

  // 2. Mark the water point as functional
  wpColl.updateOne(
    { _id: "wp_02" },
    {
      $set: {
        status: "working"
      }
    }
  );

  session.commitTransaction();
  print("Repair committed atomically.");
} catch (error) {
  session.abortTransaction();
  print("Transaction aborted and rolled back: " + error.message);
} finally {
  session.endSession();
}
```

### 4. Rollback Proof Test
In `scripts/transaction_rollback_test.js`, we simulate a fatal crash immediately after updating `rpt_001` before `wp_02` is touched.
- `session.abortTransaction()` executes upon catching the error.
- Subsequent queries to `rpt_001` confirm its status was **reverted to "assigned"** and `wp_02` remained **"broken"**.
- This proves that partial changes are discarded, preserving data integrity.

### 5. Reset Script
`scripts/reset_transaction.js` resets `rpt_001` back to `status: "assigned"`, `resolvedAt: null`, unsets `costUGX`, and restores `wp_02` to `status: "broken"`, allowing repeatable demonstration.

---

## Query 5: Count Broken Water Points Per Community (Aggregation Pipeline)

### 1. Business Problem
District water officers in Luweero need aggregated counts of broken infrastructure grouped by community to allocate emergency funding and spare parts efficiently.

### 2. MongoDB Aggregation Pipeline
```javascript
db.waterPoints.aggregate([
  {
    $match: {
      status: "broken"
    }
  },
  {
    $group: {
      _id: "$communityId",
      brokenCount: { $sum: 1 }
    }
  },
  {
    $sort: {
      _id: 1
    }
  }
]);
```

### 3. Explanation for Viva
- **`$match` stage:** Filters the stream to only include water points where `status == "broken"`. This acts early to minimize documents passed to subsequent stages.
- **`$group` stage:** Accumulates documents by the grouping key `_id: "$communityId"`. The accumulator `brokenCount: { $sum: 1 }` counts one for each matching document.
- **`$sort` stage:** Orders the final summary by community ID.

### 4. Verified Output
```json
[
  { "_id": "com_02", "brokenCount": 1 },
  { "_id": "com_03", "brokenCount": 1 }
]
```
**Result:** Exactly matches expected counts: `com_02` (Kalagala) has 1 broken water point (`wp_02`), `com_03` (Ziroobwe) has 1 broken water point (`wp_05`).
