// scripts/test_phase1_endpoints.js
// Automated verification test for Phase 1 read endpoints.
// Starts an ephemeral Express test server connected to waterTracker and tests each route.

require("dotenv").config({ path: "./backend/.env" });
const express = require("express");
const cors = require("cors");
const http = require("http");
const { connectDB, closeDB, getDB } = require("../backend/db");

const app = express();
app.use(cors());
app.use(express.json());

// Mount the same routes as server.js
app.get("/api/health", async (req, res) => {
  try {
    const db = getDB();
    const communityCount = await db.collection("communities").countDocuments();
    const waterPointCount = await db.collection("waterPoints").countDocuments();
    const technicianCount = await db.collection("technicians").countDocuments();
    const reportCount = await db.collection("reports").countDocuments();
    res.json({
      status: "ok",
      counts: {
        communities: communityCount,
        waterPoints: waterPointCount,
        technicians: technicianCount,
        reports: reportCount
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.use("/api/communities", require("../backend/routes/communities"));
app.use("/api/water-points", require("../backend/routes/waterPoints"));
app.use("/api/technicians", require("../backend/routes/technicians"));
app.use("/api/reports", require("../backend/routes/reports"));
app.use("/api/stats", require("../backend/routes/stats"));

async function runTests() {
  console.log("\n========================================================");
  console.log("PHASE 1: Testing Backend Read Endpoints");
  console.log("========================================================");

  await connectDB();
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(5001, resolve));
  const baseUrl = "http://127.0.0.1:5001";
  console.log(`Test server running at ${baseUrl}`);

  let passed = 0;
  let failed = 0;

  async function check(name, path, validator) {
    try {
      const res = await fetch(`${baseUrl}${path}`);
      const data = await res.json();
      const ok = res.status === 200 && validator(data);
      if (ok) {
        console.log(`[PASS] ${name}`);
        passed++;
      } else {
        console.error(`[FAIL] ${name} (status ${res.status}):`, data);
        failed++;
      }
    } catch (err) {
      console.error(`[ERROR] ${name}:`, err.message);
      failed++;
    }
  }

  // Test 1: Healthcheck
  await check(
    "1. Healthcheck /api/health",
    "/api/health",
    (d) => d.counts.communities === 5 && d.counts.waterPoints === 6
  );

  // Test 2: Communities list
  await check(
    "2. GET /api/communities (5 settlements)",
    "/api/communities",
    (d) => Array.isArray(d) && d.length === 5
  );

  // Test 3: Single Community
  await check(
    "3. GET /api/communities/com_01 (Bugema details)",
    "/api/communities/com_01",
    (d) => d._id === "com_01" && d.name === "Bugema" && d.contact.name === "Esther Nakato"
  );

  // Test 4: Water Points list
  await check(
    "4. GET /api/water-points (all 6 points)",
    "/api/water-points",
    (d) => Array.isArray(d) && d.length === 6
  );

  // Test 5: Query 1 - Broken Water Points
  await check(
    "5. GET /api/water-points?status=broken (Query 1: wp_02, wp_05)",
    "/api/water-points?status=broken",
    (d) => {
      const ids = d.map((p) => p._id).sort();
      return ids.length === 2 && ids[0] === "wp_02" && ids[1] === "wp_05";
    }
  );

  // Test 6: Single Water Point with join
  await check(
    "6. GET /api/water-points/wp_02 (Kalagala borehole + community + reports)",
    "/api/water-points/wp_02",
    (d) => d._id === "wp_02" && d.community && d.community.name === "Kalagala" && Array.isArray(d.reports)
  );

  // Test 7: Technicians list
  await check(
    "7. GET /api/technicians (all 5 mechanics)",
    "/api/technicians",
    (d) => Array.isArray(d) && d.length === 5
  );

  // Test 8: Query 2 - Available Technicians covering Kalagala (com_02)
  await check(
    "8. GET /api/technicians?communityId=com_02&available=true (Query 2: tech_01, tech_04)",
    "/api/technicians?communityId=com_02&available=true",
    (d) => {
      const ids = d.map((t) => t._id).sort();
      return ids.length === 2 && ids[0] === "tech_01" && ids[1] === "tech_04";
    }
  );

  // Test 9: Reports list
  await check(
    "9. GET /api/reports (all 5 reports)",
    "/api/reports",
    (d) => Array.isArray(d) && d.length === 5
  );

  // Test 10: Query 3 - Open Reports FIFO Queue
  await check(
    "10. GET /api/reports?status=open (Query 3: FIFO rpt_002 then rpt_003)",
    "/api/reports?status=open",
    (d) => d.length === 2 && d[0]._id === "rpt_002" && d[1]._id === "rpt_003"
  );

  // Test 11: Single Report details
  await check(
    "11. GET /api/reports/rpt_001 (includes waterPoint and assigned technician)",
    "/api/reports/rpt_001",
    (d) => d._id === "rpt_001" && d.waterPoint && d.waterPoint._id === "wp_02" && d.technician._id === "tech_01"
  );

  // Test 12: Summary Statistics
  await check(
    "12. GET /api/stats/summary (breakdowns + affected households)",
    "/api/stats/summary",
    (d) =>
      d.waterPoints.broken === 2 &&
      d.waterPoints.working === 3 &&
      d.waterPoints.low_yield === 1 &&
      d.reports.open === 2 &&
      d.affectedHouseholds > 0
  );

  // Test 13: Query 5 - Broken Water Points Aggregated by Community
  await check(
    "13. GET /api/stats/broken-by-community (Query 5 aggregation)",
    "/api/stats/broken-by-community",
    (d) => {
      return (
        d.length === 2 &&
        d.some((c) => c.communityId === "com_02" && c.brokenCount === 1) &&
        d.some((c) => c.communityId === "com_03" && c.brokenCount === 1)
      );
    }
  );

  console.log("\n========================================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("========================================================\n");

  await new Promise((resolve) => server.close(resolve));
  await closeDB();

  process.exit(failed > 0 ? 1 : 0);
}

runTests();

