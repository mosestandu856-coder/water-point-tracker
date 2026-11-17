// scripts/test_phase4_end_to_end.js
// End-to-end test verifying the complete report lifecycle:
// Step 1: File breakdown (POST /api/reports) -> water point becomes "broken"
// Step 2: Dispatch mechanic (PATCH /api/reports/:id/assign) -> report becomes "assigned"
// Step 3: Multi-document ACID Transaction (POST /api/reports/:id/resolve) -> report resolved, water point restored to "working"

require("dotenv").config({ path: "./backend/.env" });
const express = require("express");
const cors = require("cors");
const http = require("http");
const { connectDB, closeDB, getDB } = require("../backend/db");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/communities", require("../backend/routes/communities"));
app.use("/api/water-points", require("../backend/routes/waterPoints"));
app.use("/api/technicians", require("../backend/routes/technicians"));
app.use("/api/reports", require("../backend/routes/reports"));
app.use("/api/stats", require("../backend/routes/stats"));

async function runEndToEnd() {
  console.log("\n========================================================");
  console.log("PHASE 4: End-to-End Workflow Test (Report -> Assign -> Resolve)");
  console.log("========================================================");

  await connectDB();
  const db = getDB();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5003, resolve));
  const baseUrl = "http://127.0.0.1:5003";

  let passed = 0;
  let failed = 0;

  function assert(condition, message, details) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}:`, details);
      failed++;
    }
  }

  // Record initial state of wp_06
  const initialWp = await db.collection("waterPoints").findOne({ _id: "wp_06" });
  console.log(`Initial wp_06 status: "${initialWp.status}"`);

  // STEP 1: File breakdown report for wp_06 (Bamunanika borehole)
  console.log("\n--- STEP 1: Citizen Files Breakdown Report ---");
  const reportPayload = {
    waterPointId: "wp_06",
    reportedBy: {
      name: "Moses Kiggundu",
      phone: "0700 000 104",
      role: "Local Council Chairperson"
    },
    problem: "Hand pump handle sheared off at the pivot pin",
    severity: "high"
  };

  const createRes = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reportPayload)
  });
  const createdReport = await createRes.json();
  const wpAfterReport = await db.collection("waterPoints").findOne({ _id: "wp_06" });

  assert(
    createRes.status === 201 &&
      createdReport._id &&
      createdReport.status === "open" &&
      wpAfterReport.status === "broken",
    "Step 1: Created report and automatically set wp_06 to 'broken'",
    { createdReport, wpStatus: wpAfterReport.status }
  );

  const reportId = createdReport._id;

  // STEP 2: Assign technician covering Bamunanika (com_04)
  console.log(`\n--- STEP 2: Dispatcher Assigns Technician to ${reportId} ---`);
  // tech_04 covers com_02, com_03, com_04 and is available
  const assignRes = await fetch(`${baseUrl}/api/reports/${reportId}/assign`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ technicianId: "tech_04" })
  });
  const assignedReport = await assignRes.json();

  assert(
    assignRes.status === 200 &&
      assignedReport.status === "assigned" &&
      assignedReport.assignedTo === "tech_04",
    `Step 2: Successfully assigned technician tech_04 to ${reportId}`,
    assignedReport
  );

  // STEP 3: Multi-Document ACID Transaction - Mark Repaired
  console.log(`\n--- STEP 3: Technician Resolves Repair (ACID Transaction) ---`);
  const resolveRes = await fetch(`${baseUrl}/api/reports/${reportId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      costUGX: 75000,
      notes: "Fabricated new pivot bolt and re-greased pump handle assembly"
    })
  });
  const resolveBody = await resolveRes.json();

  const finalReport = await db.collection("reports").findOne({ _id: reportId });
  const finalWp = await db.collection("waterPoints").findOne({ _id: "wp_06" });

  assert(
    resolveRes.status === 200 &&
      finalReport.status === "resolved" &&
      finalReport.costUGX === 75000 &&
      finalWp.status === "working",
    `Step 3: Query 4 ACID Transaction committed: ${reportId} resolved and wp_06 restored to 'working'`,
    { finalReport, finalWp }
  );

  console.log("\n========================================================");
  console.log(`End-to-End Workflow Result: ${passed} passed, ${failed} failed`);
  console.log("========================================================");

  // Clean up: remove created test report and reset wp_06 status to initial
  await db.collection("reports").deleteOne({ _id: reportId });
  await db.collection("waterPoints").updateOne(
    { _id: "wp_06" },
    { $set: { status: initialWp.status } }
  );
  console.log(`[Cleanup] Deleted test ${reportId} and restored wp_06 status to "${initialWp.status}".\n`);

  await new Promise((resolve) => server.close(resolve));
  await closeDB();

  process.exit(failed > 0 ? 1 : 0);
}

runEndToEnd();

