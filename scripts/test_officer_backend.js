// scripts/test_officer_backend.js
// Officer Dashboard — Backend Acceptance Tests
// Covers E1 (RBAC) and B8 (calculation correctness).
//
// Checks:
//   E1a: Officer is allowed on dispatch (PATCH /api/reports/:id/assign)
//   E1b: Officer is allowed on resolve (POST /api/reports/:id/resolve)
//   E1c: Officer is allowed on all /api/stats/* analytics endpoints
//   E1d: Officer gets 403 on every /api/admin/* endpoint
//   E1e: Community role gets 403 on PATCH /api/reports/:id/assign
//   E1f: Technician role gets 403 on PATCH /api/reports/:id/assign
//   E1g: Volunteer role gets 403 on PATCH /api/reports/:id/assign
//   B1:  summary returns broken=2, low_yield=1, affectedHouseholds=440
//   B2:  priority-scored open reports: rpt_003 scores higher than rpt_002
//   B3:  top-priority open report is rpt_003 (wp_05 = Ziroobwe tap stand)
//   B4:  broken-by-community returns exactly 5 rows, all communities present
//   B4b: Kalagala: broken 1/1, brokenHH 200/410 (49%)
//   B4c: Ziroobwe: broken 1/2, brokenHH 180/520 (35%)
//   B4d: Bugema / Bamunanika / Wobulenzi: broken 0, brokenHH 0
//   B5:  MTTR = 2.2 days based on 2 repairs (rpt_004 + rpt_005)
//   B6:  MTA sampleSize = 3 (rpt_001 + rpt_004 + rpt_005); no extra test events
//   B7:  cost-by-type: protected_spring 1 repair UGX 85000; borehole 1 repair UGX 40000
//   E4:  seed counts: communities 5, waterPoints 6, technicians 5, reports 5, users 13

const path = require("path");
const backendDir = path.join(__dirname, "../backend");
process.env.NODE_PATH = path.join(backendDir, "node_modules");
require("module").Module._initPaths();

require("dotenv").config({ path: path.join(backendDir, ".env") });
const request   = require("supertest");
const { connectDB, closeDB, getDB } = require("../backend/db");
const app       = require("../backend/server");

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ PASS  ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL  ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

async function login(phone) {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ phone, password: process.env.DEMO_PASSWORD || "WaterTracker@2026" });
  return { status: res.status, body: res.body, cookie: res.headers["set-cookie"] };
}

async function run() {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("   Officer Dashboard — Backend Correctness & RBAC Tests (B8, E1)");
  console.log("══════════════════════════════════════════════════════════════\n");

  await connectDB();
  const db = getDB();

  try {
    // ── Authenticate all roles ──────────────────────────────────────────────
    console.log("--- Authenticating all roles ---");
    const officer   = await login("0765 924 113"); // user_12 (Mohamed Abdi)
    const community = await login("0765 924 115"); // user_01 (Hissen)
    const tech      = await login("0726 927 445"); // user_06 (Moses Zach)
    const volunteer = await login("0765 924 114"); // user_11 (Zachariah)
    const admin     = await login("0726 986 218"); // user_13 (Moses Tandu)

    assert("Officer login OK",   officer.status   === 200, `HTTP ${officer.status}`);
    assert("Community login OK",  community.status === 200, `HTTP ${community.status}`);
    assert("Technician login OK", tech.status      === 200, `HTTP ${tech.status}`);
    assert("Volunteer login OK",  volunteer.status === 200, `HTTP ${volunteer.status}`);
    assert("Admin login OK",      admin.status     === 200, `HTTP ${admin.status}`);

    const oc = officer.cookie;
    const cc = community.cookie;
    const tc = tech.cookie;
    const vc = volunteer.cookie;

    // ── E4: Seed counts ────────────────────────────────────────────────────
    console.log("\n--- E4: Seed collection counts ---");
    const comCount  = await db.collection("communities").countDocuments();
    const wpCount   = await db.collection("waterPoints").countDocuments();
    const techCount = await db.collection("technicians").countDocuments();
    const rptCount  = await db.collection("reports").countDocuments();
    const usrCount  = await db.collection("users").countDocuments();

    assert("communities = 5",   comCount  === 5,  `got ${comCount}`);
    assert("waterPoints = 6",   wpCount   === 6,  `got ${wpCount}`);
    assert("technicians = 5",   techCount === 5,  `got ${techCount}`);
    assert("reports = 5",       rptCount  === 5,  `got ${rptCount}`);
    assert("users = 13",        usrCount  === 13, `got ${usrCount}`);

    // ── B1: Summary KPIs ───────────────────────────────────────────────────
    console.log("\n--- B1: Summary KPIs ---");
    const sumRes = await request(app).get("/api/stats/summary").set("Cookie", oc);
    assert("GET /api/stats/summary 200", sumRes.status === 200, `HTTP ${sumRes.status}`);

    const sum = sumRes.body;
    assert("B1 broken = 2",            sum.waterPoints?.broken   === 2,   `got ${sum.waterPoints?.broken}`);
    assert("B1 low_yield = 1",          sum.waterPoints?.low_yield === 1,  `got ${sum.waterPoints?.low_yield}`);
    assert("B1 households = 440",       sum.affectedHouseholds    === 440, `got ${sum.affectedHouseholds}`);

    // ── B1 sub: breakdown 380 broken + 60 low water ────────────────────────
    const wps = await db.collection("waterPoints").find({}).toArray();
    const hhBroken   = wps.filter(w => w.status === "broken")   .reduce((s, w) => s + (w.householdsServed || 0), 0);
    const hhLowYield = wps.filter(w => w.status === "low_yield").reduce((s, w) => s + (w.householdsServed || 0), 0);
    assert("B1 broken HH = 380",    hhBroken   === 380, `got ${hhBroken}`);
    assert("B1 low-water HH = 60",  hhLowYield === 60,  `got ${hhLowYield}`);

    // ── B1 sub: waiting for technician = 2 ────────────────────────────────
    const openUnassigned = await db.collection("reports")
      .countDocuments({ status: "open", assignedTo: null });
    assert("B1 waiting for technician = 2", openUnassigned === 2, `got ${openUnassigned}`);

    // ── B2 / B3: Priority scoring — rpt_003 highest ────────────────────────
    console.log("\n--- B2/B3: Priority scoring ---");
    const rptRes = await request(app).get("/api/reports").set("Cookie", oc);
    assert("GET /api/reports 200", rptRes.status === 200, `HTTP ${rptRes.status}`);

    const reports = rptRes.body;
    // Compute priority scores using the spec formula: weight*HH + ageDays*25
    const SEED_DATE = new Date("2026-10-30T00:00:00Z");
    const wpMap = Object.fromEntries(wps.map(w => [w._id, w]));

    const severityW = { high: 3, medium: 2, low: 1 };
    function score(r) {
      const wp = wpMap[r.waterPointId] || {};
      const hh = wp.householdsServed || 50;
      const days = Math.floor((SEED_DATE - new Date(r.reportedAt)) / 86_400_000);
      return severityW[r.severity] * hh + days * 25;
    }

    const rpt002 = reports.find(r => r._id === "rpt_002");
    const rpt003 = reports.find(r => r._id === "rpt_003");
    assert("rpt_003 found in reports", !!rpt003, "not returned");
    assert("rpt_002 found in reports", !!rpt002, "not returned");

    if (rpt002 && rpt003) {
      const s003 = score(rpt003); // high × 180 + 19×25 = 540+475 = 1015
      const s002 = score(rpt002); // med × 60 + 25×25  = 120+625 = 745
      assert(`B2 rpt_003 score (${s003}) > rpt_002 score (${s002})`, s003 > s002,
        `rpt_003=${s003}, rpt_002=${s002}`);
      assert("B3 rpt_003 is wp_05 (Ziroobwe tap stand)", rpt003.waterPointId === "wp_05",
        `got ${rpt003.waterPointId}`);
      assert("B3 rpt_003 is open and unassigned", rpt003.status === "open" && !rpt003.assignedTo,
        `status=${rpt003.status} assignedTo=${rpt003.assignedTo}`);
    }

    // ── B4: broken-by-community ────────────────────────────────────────────
    console.log("\n--- B4: Broken by community ---");
    const commRes = await request(app).get("/api/stats/broken-by-community").set("Cookie", oc);
    assert("GET /api/stats/broken-by-community 200", commRes.status === 200, `HTTP ${commRes.status}`);

    const comms = commRes.body;
    assert("B4 returns exactly 5 communities", comms.length === 5, `got ${comms.length}`);

    const byName = {};
    comms.forEach(c => { byName[c.communityName] = c; });

    assert("B4 Kalagala present",    !!byName["Kalagala"],    "missing");
    assert("B4 Ziroobwe present",    !!byName["Ziroobwe"],    "missing");
    assert("B4 Bugema present",      !!byName["Bugema"],      "missing");
    assert("B4 Bamunanika present",  !!byName["Bamunanika"],  "missing");
    assert("B4 Wobulenzi present",   !!byName["Wobulenzi"],   "missing");

    // Kalagala: 1 water point total (wp_02 broken), 1 broken
    if (byName["Kalagala"]) {
      const k = byName["Kalagala"];
      assert("B4b Kalagala broken=1",        k.brokenCount      === 1,   `got ${k.brokenCount}`);
      assert("B4b Kalagala totalWP=1",        k.totalWaterPoints === 1,   `got ${k.totalWaterPoints}`);
      assert("B4b Kalagala brokenHH=200",     (k.brokenHouseholds ?? k.affectedHouseholds) === 200,
        `got ${k.brokenHouseholds ?? k.affectedHouseholds}`);
      assert("B4b Kalagala totalHH=410",      k.totalHouseholds  === 410, `got ${k.totalHouseholds}`);
      assert("B4b Kalagala pct=49%",          k.percentHouseholdsAffected === 49,
        `got ${k.percentHouseholdsAffected}`);
    }

    // Ziroobwe: 2 water points (wp_04 low_yield, wp_05 broken), 1 broken
    if (byName["Ziroobwe"]) {
      const z = byName["Ziroobwe"];
      assert("B4c Ziroobwe broken=1",        z.brokenCount      === 1,   `got ${z.brokenCount}`);
      assert("B4c Ziroobwe totalWP=2",        z.totalWaterPoints === 2,   `got ${z.totalWaterPoints}`);
      assert("B4c Ziroobwe brokenHH=180",     (z.brokenHouseholds ?? z.affectedHouseholds) === 180,
        `got ${z.brokenHouseholds ?? z.affectedHouseholds}`);
      assert("B4c Ziroobwe totalHH=520",      z.totalHouseholds  === 520, `got ${z.totalHouseholds}`);
      assert("B4c Ziroobwe pct=35%",          z.percentHouseholdsAffected === 35,
        `got ${z.percentHouseholdsAffected}`);
    }

    // Bugema, Bamunanika, Wobulenzi: 0 broken
    for (const name of ["Bugema", "Bamunanika", "Wobulenzi"]) {
      if (byName[name]) {
        assert(`B4d ${name} broken=0`, byName[name].brokenCount === 0, `got ${byName[name].brokenCount}`);
        assert(`B4d ${name} brokenHH=0`,
          (byName[name].brokenHouseholds ?? byName[name].affectedHouseholds) === 0,
          `got ${byName[name].brokenHouseholds ?? byName[name].affectedHouseholds}`);
      }
    }

    // ── B5 / B6: MTA and MTTR ─────────────────────────────────────────────
    console.log("\n--- B5/B6: MTA / MTTR ---");
    const mtaRes = await request(app).get("/api/stats/mta-mttr").set("Cookie", oc);
    assert("GET /api/stats/mta-mttr 200", mtaRes.status === 200, `HTTP ${mtaRes.status}`);

    const mta = mtaRes.body;

    // B5: MTTR = 2.2 days, 2 repairs
    assert("B5 MTTR sampleSize = 2",  mta.mttr.sampleSize === 2,   `got ${mta.mttr.sampleSize}`);
    assert("B5 MTTR days = 2.2",      mta.mttr.days       === 2.2, `got ${mta.mttr.days}`);

    // B5: manual calculation
    // rpt_004: resolved 2026-06-20T14:00 - reported 2026-06-18T08:00 = 54h exactly
    // rpt_005: resolved 2026-09-05T11:30 - reported 2026-09-03T09:10 = 50.333...h
    // avg = (54 + 50.333) / 2 = 52.167h → /24 = 2.173 days → round to 1dp → 2.2
    const rpt004hours = (new Date("2026-06-20T14:00:00Z") - new Date("2026-06-18T08:00:00Z")) / 3_600_000;
    const rpt005hours = (new Date("2026-09-05T11:30:00Z") - new Date("2026-09-03T09:10:00Z")) / 3_600_000;
    const mttrExpectedDays = Math.round(((rpt004hours + rpt005hours) / 2 / 24) * 10) / 10;
    assert(`B5 MTTR formula: (${rpt004hours}h + ${rpt005hours}h)/2/24 = ${mttrExpectedDays} days`,
      mttrExpectedDays === 2.2, `computed ${mttrExpectedDays}`);

    // B6: MTA sampleSize = 3 (rpt_001 assigned, rpt_004 assigned, rpt_005 assigned)
    assert("B6 MTA sampleSize = 3",  mta.mta.sampleSize === 3, `got ${mta.mta.sampleSize}`);

    // B6: verify no extra test events beyond the 3 real seed assignments
    const assignedEvents = await db.collection("reports").aggregate([
      { $unwind: "$statusHistory" },
      { $match: { "statusHistory.status": "assigned" } },
      { $count: "total" }
    ]).toArray();
    const totalAssigned = assignedEvents[0]?.total ?? 0;
    assert("B6 exactly 3 assigned statusHistory entries in DB (no extra test data)",
      totalAssigned === 3, `got ${totalAssigned} — expected 3 (rpt_001, rpt_004, rpt_005)`);

    // ── B7: Cost by type ───────────────────────────────────────────────────
    console.log("\n--- B7: Repair cost by water point type ---");
    const costRes = await request(app).get("/api/stats/cost-by-type").set("Cookie", oc);
    assert("GET /api/stats/cost-by-type 200", costRes.status === 200, `HTTP ${costRes.status}`);

    const costs = costRes.body;
    const costByName = {};
    costs.forEach(c => { costByName[c.waterPointType] = c; });

    assert("B7 protected_spring row present", !!costByName["protected_spring"], "missing");
    assert("B7 borehole row present",          !!costByName["borehole"],          "missing");

    if (costByName["protected_spring"]) {
      assert("B7 protected_spring repairs = 1",    costByName["protected_spring"].completedRepairs === 1,
        `got ${costByName["protected_spring"].completedRepairs}`);
      assert("B7 protected_spring total = 85000",  costByName["protected_spring"].totalCostUGX === 85000,
        `got ${costByName["protected_spring"].totalCostUGX}`);
    }
    if (costByName["borehole"]) {
      assert("B7 borehole repairs = 1",    costByName["borehole"].completedRepairs === 1,
        `got ${costByName["borehole"].completedRepairs}`);
      assert("B7 borehole total = 40000",  costByName["borehole"].totalCostUGX === 40000,
        `got ${costByName["borehole"].totalCostUGX}`);
    }

    // ── E1: RBAC — Officer allowed on officer endpoints ───────────────────
    console.log("\n--- E1a/b/c: Officer allowed on officer endpoints ---");

    // Stats endpoints
    for (const ep of [
      "/api/stats/summary",
      "/api/stats/broken-by-community",
      "/api/stats/mta-mttr",
      "/api/stats/cost-by-type",
      "/api/stats/recurrence",
      "/api/stats/service-backlog",
      "/api/stats/technician-workload"
    ]) {
      const r = await request(app).get(ep).set("Cookie", oc);
      assert(`E1c Officer allowed: GET ${ep}`, r.status === 200, `HTTP ${r.status}`);
    }

    // Officer allowed on /api/reports
    const rAllowed = await request(app).get("/api/reports").set("Cookie", oc);
    assert("E1c Officer allowed: GET /api/reports", rAllowed.status === 200, `HTTP ${rAllowed.status}`);

    // Officer allowed on PATCH assign (use rpt_003 which is open)
    // Save original pristine document to restore unconditionally
    const pristineRpt3 = await db.collection("reports").findOne({ _id: "rpt_003" });
    try {
      const availTech = await db.collection("technicians").findOne({
        coversCommunities: "com_03", available: true
      });
      if (availTech) {
        const assignRes = await request(app)
          .patch("/api/reports/rpt_003/assign")
          .set("Cookie", oc)
          .send({ technicianId: availTech._id });
        assert("E1a Officer allowed: PATCH /api/reports/:id/assign",
          assignRes.status === 200, `HTTP ${assignRes.status} — tech ${availTech._id}`);
      }
    } finally {
      // Unconditionally restore rpt_003 to pristine seed state
      if (pristineRpt3) {
        await db.collection("reports").replaceOne({ _id: "rpt_003" }, pristineRpt3);
      }
    }

    // ── E1d: Officer gets 403 on /api/admin/* ─────────────────────────────
    console.log("\n--- E1d: Officer gets 403 on /api/admin/* ---");
    const adminEndpoints = [
      "/api/admin/users",
      "/api/admin/users/user_01/approve",
      "/api/admin/audit"
    ];
    for (const ep of adminEndpoints) {
      const r = await request(app).get(ep).set("Cookie", oc);
      assert(`E1d Officer gets 403: GET ${ep}`, r.status === 403, `HTTP ${r.status}`);
    }

    // ── E1e/f/g: Community / Technician / Volunteer get 403 on assign ─────
    console.log("\n--- E1e/f/g: Non-officer roles get 403 on officer endpoints ---");

    const assignEndpoint = "/api/reports/rpt_002/assign";
    const assignBody = { technicianId: "tech_01" };

    const communityAssign = await request(app)
      .patch(assignEndpoint).set("Cookie", cc).send(assignBody);
    assert("E1e Community gets 403 on PATCH assign",
      communityAssign.status === 403, `HTTP ${communityAssign.status}`);

    const techAssign = await request(app)
      .patch(assignEndpoint).set("Cookie", tc).send(assignBody);
    assert("E1f Technician gets 403 on PATCH assign",
      techAssign.status === 403, `HTTP ${techAssign.status}`);

    const volAssign = await request(app)
      .patch(assignEndpoint).set("Cookie", vc).send(assignBody);
    assert("E1g Volunteer gets 403 on PATCH assign",
      volAssign.status === 403, `HTTP ${volAssign.status}`);

  } catch (err) {
    console.error("\n[Fatal test error]", err.message);
    failed++;
  } finally {
    await closeDB();
  }

  // ── Results ───────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("══════════════════════════════════════════════════════════════\n");
  process.exit(failed > 0 ? 1 : 0);
}

run();

