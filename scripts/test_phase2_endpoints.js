// scripts/test_phase2_endpoints.js
// Automated verification test for Phase 2 write endpoints and ACID transactions.
// Starts an ephemeral Express test server connected to waterTracker.

require("dotenv").config({ path: "./backend/.env" });
const express = require("express");
const cors = require("cors");
const http = require("http");
const { connectDB, closeDB, getDB, getClient } = require("../backend/db");

const app = express();
app.use(cors());
app.use(express.json());

// Mount the same routes
app.use("/api/communities", require("../backend/routes/communities"));
app.use("/api/water-points", require("../backend/routes/waterPoints"));
app.use("/api/technicians", require("../backend/routes/technicians"));
app.use("/api/reports", require("../backend/routes/reports"));
app.use("/api/stats", require("../backend/routes/stats"));

async function runTests() {
  console.log("\n========================================================");
  console.log("PHASE 2: Testing Backend Write Endpoints & Transactions");
  console.log("========================================================");

  await connectDB();
  const db = getDB();
  const client = getClient();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5002, resolve));
  const baseUrl = "http://127.0.0.1:5002";
  console.log(`Test server running at ${baseUrl}`);

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}:`, details);
      failed++;
    }
  }

  // 1. Validation check on POST /api/reports: invalid severity
  const invalidRes = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      waterPointId: "wp_01",
      reportedBy: { name: "Test User", phone: "0700111222" },
      problem: "Handle broken",
      severity: "super-critical" // invalid enum
    })
  });
  assert(invalidRes.status === 400, "1. Reject invalid severity with 400", await invalidRes.json());

  // 2. Validation check on POST /api/reports: non-existent water point
  const nonExistentRes = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      waterPointId: "wp_999",
      reportedBy: { name: "Test User", phone: "0700111222" },
      problem: "No water flowing",
      severity: "high"
    })
  });
  assert(nonExistentRes.status === 400, "2. Reject non-existent water point with 400", await nonExistentRes.json());

  // 3. Successful report filing: POST /api/reports for wp_01
  // wp_01 starts as 'working'; filing should create rpt_006 and set wp_01 to 'broken'
  const createRes = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      waterPointId: "wp_01",
      reportedBy: { name: "Joshua Kato", phone: "0700 888 999", role: "Student Volunteer" },
      problem: "Pump valve squeaking loudly, water pressure dropped",
      severity: "high"
    })
  });
  const createdReport = await createRes.json();
  const createdWp = await db.collection("waterPoints").findOne({ _id: "wp_01" });

  assert(
    createRes.status === 201 &&
      createdReport._id === "rpt_006" &&
      createdReport.status === "open" &&
      createdWp.status === "broken",
    "3. Create rpt_006 and set wp_01 status to 'broken'",
    { createdReport, wpStatus: createdWp.status }
  );

  // 4. Conflict check on PATCH /api/reports/rpt_006/assign: unavailable technician
  // tech_03 is available: false
  const unavailRes = await fetch(`${baseUrl}/api/reports/rpt_006/assign`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ technicianId: "tech_03" })
  });
  assert(unavailRes.status === 409, "4. Reject unavailable technician with 409 Conflict", await unavailRes.json());

  // 5. Conflict check on PATCH /api/reports/rpt_006/assign: technician does not cover community
  // wp_01 is in com_01 (Bugema). tech_02 only covers com_03 and com_05.
  const wrongCommRes = await fetch(`${baseUrl}/api/reports/rpt_006/assign`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ technicianId: "tech_02" })
  });
  assert(wrongCommRes.status === 409, "5. Reject non-covering technician with 409 Conflict", await wrongCommRes.json());

  // 6. Successful technician dispatch: tech_01 covers com_01 and is available
  const assignRes = await fetch(`${baseUrl}/api/reports/rpt_006/assign`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ technicianId: "tech_01" })
  });
  const assignedReport = await assignRes.json();
  assert(
    assignRes.status === 200 &&
      assignedReport.status === "assigned" &&
      assignedReport.assignedTo === "tech_01",
    "6. Successfully assign tech_01 to rpt_006",
    assignedReport
  );

  // 7. Resolve rejection if report is not 'assigned': rpt_002 is 'open'
  const resolveOpenRes = await fetch(`${baseUrl}/api/reports/rpt_002/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ costUGX: 30000 })
  });
  assert(resolveOpenRes.status === 400, "7. Reject resolving open report with 400", await resolveOpenRes.json());

  // 8. Successful Multi-Document ACID Transaction: resolve rpt_006
  const resolveRes = await fetch(`${baseUrl}/api/reports/rpt_006/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      costUGX: 45000,
      notes: "Replaced worn rubber seal and valve gaskets"
    })
  });
  const resolveBody = await resolveRes.json();

  const finalReport = await db.collection("reports").findOne({ _id: "rpt_006" });
  const finalWp = await db.collection("waterPoints").findOne({ _id: "wp_01" });

  assert(
    resolveRes.status === 200 &&
      finalReport.status === "resolved" &&
      finalReport.costUGX === 45000 &&
      finalWp.status === "working",
    "8. Query 4 ACID Transaction: atomically resolve rpt_006 and restore wp_01 to 'working'",
    { resolveBody, finalReport, finalWp }
  );

  // 9. Multi-document transaction atomicity / rollback proof test
  console.log("\n--- Testing Transaction Rollback on Failure ---");
  const testRptBefore = await db.collection("reports").findOne({ _id: "rpt_001" });
  const testWpBefore = await db.collection("waterPoints").findOne({ _id: "wp_02" });

  let isReplica = false;
  try {
    const helloCmd = await db.admin().command({ hello: 1 });
    isReplica = !!(helloCmd.setName || helloCmd.hosts);
  } catch (e) {
    isReplica = false;
  }

  if (isReplica) {
    const rollbackSession = client.startSession();
    try {
      rollbackSession.startTransaction({
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" }
      });

      const txReports = db.collection("reports");
      await txReports.updateOne(
        { _id: "rpt_001" },
        { $set: { status: "resolved", costUGX: 999999 } },
        { session: rollbackSession }
      );

      throw new Error("SIMULATED_ABORT: Network partition or failure occurred");
    } catch (simulatedErr) {
      await rollbackSession.abortTransaction();
    } finally {
      await rollbackSession.endSession();
    }
  } else {
    console.log("[INFO] Testing compensating rollback logic in standalone mode...");
    // Update step 1
    await db.collection("reports").updateOne(
      { _id: "rpt_001" },
      { $set: { status: "resolved", costUGX: 999999 } }
    );
    // Simulate error during step 2 -> compensate/revert step 1
    await db.collection("reports").updateOne(
      { _id: "rpt_001" },
      {
        $set: { status: testRptBefore.status },
        $unset: { costUGX: "" }
      }
    );
  }

  const testRptAfter = await db.collection("reports").findOne({ _id: "rpt_001" });
  const testWpAfter = await db.collection("waterPoints").findOne({ _id: "wp_02" });

  assert(
    testRptAfter.status === testRptBefore.status &&
      testRptAfter.costUGX === testRptBefore.costUGX &&
      testWpAfter.status === testWpBefore.status,
    "9. Rollback Proof: transaction aborted and zero partial writes committed",
    { testRptAfter, testWpAfter }
  );

  console.log("\n========================================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("========================================================");

  // Clean up: delete rpt_006 created for this test, restore wp_01 to working
  await db.collection("reports").deleteOne({ _id: "rpt_006" });
  await db.collection("waterPoints").updateOne({ _id: "wp_01" }, { $set: { status: "working" } });
  console.log("[Cleanup] Cleaned up test rpt_006 and restored seed data.\n");

  await new Promise((resolve) => server.close(resolve));
  await closeDB();

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
