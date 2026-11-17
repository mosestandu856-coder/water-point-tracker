# Database Enhancements, Indexing & Performance Benchmarks

This document details the database enhancements applied to the **Community Water Point Tracker** (`waterTracker`), including JSON Schema validation rules, production index strategies, geospatial location features, audit trails, and execution plan benchmarks.

---

## 1. JSON Schema Validation

To prevent corrupt, mistyped, or invalid data from compromising the system, MongoDB JSON Schema validation (`$jsonSchema`) was applied to all four collections using `collMod` with `validationLevel: "moderate"` and `validationAction: "error"`.

### Controlled Enums & Types
1. **`waterPoints`:**
   - `type` strictly constrained to: `["borehole", "protected_spring", "shallow_well", "tap_stand"]`.
   - `status` strictly constrained to: `["working", "broken", "low_yield"]`.
   - `lastServiced`: accepts BSON `date` or `null`.
   - Allows optional fields: `managedBy` (string) and `location` (GeoJSON Point).
2. **`reports`:**
   - `severity` strictly constrained to: `["low", "medium", "high"]`.
   - `status` strictly constrained to: `["open", "assigned", "resolved"]`.
   - `assignedTo`: accepts string technician ID or `null`.
   - `resolvedAt`: accepts BSON `date` or `null`.
   - Allows optional fields: `costUGX` (numeric >= 0), `notes` (string), `reportedBy.role` (string), and `statusHistory` (array of objects).
3. **`technicians`:**
   - `skills`: array of strings (minimum 1).
   - `coversCommunities`: array of community string IDs.
   - `available`: boolean.
   - Allows optional fields: `hasOwnToolkit` (boolean) and `baseLocation` (GeoJSON Point).
4. **`communities`:**
   - Enforces required contact structure (`name`, `phone`).
   - Allows optional `universityLink` (string).

### Validation Enforcement Proof
When attempting to insert a document with an unapproved enum value (e.g. `severity: "critical"`), MongoDB rejects the write with:
`Document failed validation: "severity" is not one of ["low", "medium", "high"]`.

---

## 2. Production Indexing Strategy

Indexes were created to optimize frequent query paths and prevent costly collection scans:

| Collection | Index Key | Index Type | Target Query / Purpose |
| :--- | :--- | :--- | :--- |
| `waterPoints` | `{ status: 1 }` | Single Field | Instant filtering of broken or low-yield points (`Query 1`). |
| `waterPoints` | `{ communityId: 1, status: 1 }` | Compound | Fast localized status checks and aggregation grouping (`Query 5`). |
| `waterPoints` | `{ location: "2dsphere" }` | Geospatial | Proximity searches around physical water points. |
| `reports` | `{ status: 1, reportedAt: 1 }` | Compound | High-performance FIFO dispatch queue (`Query 3`). |
| `reports` | `{ waterPointId: 1, reportedAt: -1 }` | Compound | Chronological repair history for a specific water point. |
| `technicians` | `{ coversCommunities: 1, available: 1 }` | Multikey Compound | Rapid technician matching by community and availability (`Query 2`). |
| `technicians` | `{ skills: 1 }` | Multikey | Finding technicians with specific hardware competencies (e.g. "hand pump"). |
| `technicians` | `{ baseLocation: "2dsphere" }` | Geospatial | Finding nearest available technician using spherical distance. |

---

## 3. Geospatial Features & GeoJSON Integration

Illustrative GeoJSON Point coordinates around Bugema / Luweero District were added to the collections (in `[longitude, latitude]` format):

### Sample Coordinates
- `wp_02` (Kalagala Central Market): `[32.6120, 0.6110]`
- `tech_01` (Ibrahim Kalule - Kalagala Base): `[32.6130, 0.6120]` (~160 meters away)
- `tech_04` (Mariam Nabirye - Luweero Central Base): `[32.6150, 0.6150]` (~560 meters away)
- `tech_05` (Robert Byaruhanga - Bugema Base): `[32.6400, 0.5700]` (~5.5 km away)
- `tech_02` (Joyce Auma - Ziroobwe Base): `[32.7200, 0.6900]` (~14.9 km away)
- `tech_03` (Charles Opio): Excluded automatically from queries because `available: false`.

### Nearest Available Technician Query (`$near`)
```javascript
db.technicians.find({
  available: true,
  baseLocation: {
    $near: {
      $geometry: {
        type: "Point",
        coordinates: [32.6120, 0.6110] // Coordinates of broken wp_02
      },
      $maxDistance: 25000 // 25 km radius
    }
  }
});
```

### Proximity Calculation (`$geoNear` Pipeline)
```javascript
db.technicians.aggregate([
  {
    $geoNear: {
      near: { type: "Point", coordinates: [32.6120, 0.6110] },
      distanceField: "distanceMeters",
      query: { available: true },
      spherical: true
    }
  },
  {
    $project: {
      _id: 1,
      name: 1,
      skills: 1,
      distanceKm: { $round: [{ $divide: ["$distanceMeters", 1000] }, 2] }
    }
  }
]);
```

**Output:**
1. Ibrahim Kalule (`tech_01`): 0.16 km (160 m)
2. Mariam Nabirye (`tech_04`): 0.56 km (560 m)
3. Robert Byaruhanga (`tech_05`): 5.53 km
4. Joyce Auma (`tech_02`): 14.89 km

---

## 4. Status History Lifecycle Audit Trail

Every report now maintains a full audit log in `statusHistory: [{ status, at, by }]` capturing the chronological state transitions from initial complaint to final resolution:

```json
{
  "_id": "rpt_001",
  "status": "assigned",
  "statusHistory": [
    {
      "status": "open",
      "at": ISODate("2026-10-09T07:15:00.000Z"),
      "by": "Peter Ssemwogerere (Community Reporter)"
    },
    {
      "status": "assigned",
      "at": ISODate("2026-10-09T08:30:00.000Z"),
      "by": "Kalagala Water Desk Dispatcher"
    }
  ]
}
```

---

## 5. Performance Benchmark: COLLSCAN vs. IXSCAN

To evaluate query efficiency under real-world scale without altering the 21 required assignment documents, a dedicated benchmark collection (`syntheticReports`) of **10,000 documents** was populated and profiled using `.explain("executionStats")`.

### Benchmark Query
```javascript
db.syntheticReports.find({
  status: "open",
  reportedAt: { $gte: ISODate("2026-06-01T00:00:00Z") }
}).sort({ reportedAt: 1 });
```

### Empirical Results

| Metric | BEFORE Indexing (No Index) | AFTER Indexing (Compound `{ status: 1, reportedAt: 1 }`) | Improvement Factor |
| :--- | :--- | :--- | :--- |
| **Execution Stage** | `COLLSCAN` + `SORT` | `IXSCAN` + `FETCH` | **Eliminated in-memory sort** |
| **Total Collection Documents** | 10,000 | 10,000 | Baseline |
| **Documents Examined** | **10,000** | **1,617** | **83.8% fewer reads** |
| **Index Keys Examined** | 0 | 1,617 | Targeted B-Tree traversal |
| **Matching Documents Returned**| 1,617 | 1,617 | 100% precision match |
| **In-Memory Sort Buffer** | **Required (`SORT` stage)** | **None (0 bytes)** | Pre-ordered by B-Tree |

### Viva Defense Explanation
1. **Without the index (`COLLSCAN`):** MongoDB was forced to scan every single document on disk (10,000 reads). Furthermore, because the results were not sorted on disk, MongoDB had to allocate an in-memory buffer to sort the documents before returning them.
2. **With the compound index (`IXSCAN`):** The compound index `{ status: 1, reportedAt: 1 }` enables MongoDB to seek directly to the `"open"` index keys and stream documents in their natural ascending date order. Zero unmatching documents were read, and zero in-memory sort memory was consumed.
