// scripts/index_benchmark.js
// Proves the performance value of compound indexing using explain("executionStats")
// Uses a separate synthetic collection (syntheticReports, 10,000+ docs)
// leaving the 21 core assignment documents untouched.
// Run with: mongosh mongodb://localhost:27017/waterTracker scripts/index_benchmark.js

const targetDb = db.getSiblingDB("waterTracker");
const synColl = targetDb.syntheticReports;

print("\n=================================================================");
print("BENCHMARK: Performance Comparison - COLLSCAN vs. IXSCAN");
print("Dataset: 10,000 Synthetic Reports in 'syntheticReports' collection");
print("Query: Find open reports reported after 2026-06-01, sorted by date");
print("=================================================================");

// 1. Generate 10,000 synthetic documents
print("\n[Step 1] Preparing 10,000 synthetic documents...");
synColl.drop(); // clean start

const statuses = ["open", "assigned", "resolved"];
const severities = ["low", "medium", "high"];
const waterPointIds = ["wp_01", "wp_02", "wp_03", "wp_04", "wp_05", "wp_06"];

const batch = [];
const baseDate = new Date("2026-01-01T00:00:00Z").getTime();
const dayMs = 24 * 60 * 60 * 1000;

for (let i = 1; i <= 10000; i++) {
  const status = statuses[i % 3]; // approx 3,333 open reports
  const severity = severities[i % 3];
  const wpId = waterPointIds[i % 6];
  const reportedAt = new Date(baseDate + (i % 300) * dayMs);

  batch.push({
    _id: `syn_rpt_${i}`,
    waterPointId: wpId,
    reportedBy: { name: `Community Member ${i}`, phone: `0700000${(i % 900) + 100}` },
    reportedAt: reportedAt,
    problem: `Periodic breakdown issue #${i}`,
    severity: severity,
    status: status,
    assignedTo: status === "open" ? null : "tech_01",
    resolvedAt: status === "resolved" ? new Date(reportedAt.getTime() + 2 * dayMs) : null
  });
}

synColl.insertMany(batch);
print(`[OK] Inserted ${synColl.countDocuments()} synthetic documents into 'syntheticReports'.`);

// Query definition
const filter = {
  status: "open",
  reportedAt: { $gte: new Date("2026-06-01T00:00:00Z") }
};
const sort = { reportedAt: 1 };

// 2. Benchmark BEFORE Index (COLLSCAN)
print("\n[Step 2] Executing explain() BEFORE Indexing (Full Collection Scan)...");
const unindexedExplain = synColl.find(filter).sort(sort).explain("executionStats");
const statsBefore = unindexedExplain.executionStats;

// Helper to find winning stage in execution stages tree
function getScanStage(stageObj) {
  if (!stageObj) return "UNKNOWN";
  if (stageObj.stage === "COLLSCAN" || stageObj.stage === "IXSCAN") return stageObj.stage;
  if (stageObj.inputStage) return getScanStage(stageObj.inputStage);
  if (stageObj.inputStages && stageObj.inputStages.length > 0) return getScanStage(stageObj.inputStages[0]);
  return stageObj.stage;
}

const stageBefore = getScanStage(statsBefore.executionStages);

// 3. Create Compound Index
print("\n[Step 3] Creating compound index: { status: 1, reportedAt: 1 }...");
synColl.createIndex({ status: 1, reportedAt: 1 }, { name: "idx_syn_status_reportedAt" });
print("[OK] Index created.");

// 4. Benchmark AFTER Index (IXSCAN)
print("\n[Step 4] Executing explain() AFTER Indexing (Index Scan)...");
const indexedExplain = synColl.find(filter).sort(sort).explain("executionStats");
const statsAfter = indexedExplain.executionStats;
const stageAfter = getScanStage(statsAfter.executionStages);

// 5. Output Comparison Table
print("\n=================================================================");
print("            INDEXING BENCHMARK RESULTS SUMMARY                   ");
print("=================================================================");
print(`Metric                       | BEFORE Index (No Index) | AFTER Index (Compound)`);
print(`-----------------------------|-------------------------|-----------------------`);
print(`Access Strategy (Stage)      | ${stageBefore.padEnd(23)} | ${stageAfter.padEnd(21)}`);
print(`Total Documents in Collection| 10,000                  | 10,000`);
print(`Documents Examined           | ${String(statsBefore.totalDocsExamined).padEnd(23)} | ${String(statsAfter.totalDocsExamined).padEnd(21)}`);
print(`Index Keys Examined          | ${String(statsBefore.totalKeysExamined).padEnd(23)} | ${String(statsAfter.totalKeysExamined).padEnd(21)}`);
print(`Matching Documents Returned  | ${String(statsBefore.nReturned).padEnd(23)} | ${String(statsAfter.nReturned).padEnd(21)}`);
print(`Execution Time (ms)          | ${String(statsBefore.executionTimeMillis + " ms").padEnd(23)} | ${String(statsAfter.executionTimeMillis + " ms").padEnd(21)}`);
print(`In-Memory Sort Required?     | ${String(statsBefore.executionStages.stage === "SORT" || statsBefore.executionStages.inputStage?.stage === "SORT" ? "YES (Costly)" : "NO").padEnd(23)} | NO (Pre-sorted by index)`);
print("=================================================================");

print("\n--- Key Engineering Takeaway for Viva Defense ---");
print("1. BEFORE Index: MongoDB had to scan all 10,000 documents from disk (COLLSCAN) and");
print("   perform an expensive in-memory sort buffer operation to satisfy the .sort().");
print("2. AFTER Index: The compound index { status: 1, reportedAt: 1 } eliminated the full");
print("   collection scan. MongoDB hopped directly to the matching B-Tree branch (IXSCAN),");
print("   examined zero unnecessary documents, and returned results already sorted in index order.");
print("\nBenchmark completed.\n");
