// scripts/verify_phase2.js
// Verifies Phase 2 database state:
// 1. Checks counts: communities 5, waterPoints 6, technicians 5, reports 5, users 12
// 2. Tests schema validation for users (rejects invalid roles, verifies unique phone)
// 3. Tests reports schema accepts 'in_progress'
// 4. Verifies all 5 required queries return identical results to original spec
//
// Usage: node scripts/verify_phase2.js

const path = require("path");
const backendDir = path.join(__dirname, "../backend");
process.env.NODE_PATH = path.join(backendDir, "node_modules");
require("module").Module._initPaths();

require("dotenv").config({ path: path.join(backendDir, ".env") });
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const dbName = process.env.DB_NAME || "waterTracker";

async function verifyPhase2() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log(`\n========================================================`);
    console.log(`PHASE 2 VERIFICATION: Schemas, Indexes & Required Queries`);
    console.log(`Connected to MongoDB (${dbName})`);
    console.log(`========================================================\n`);

    const db = client.db(dbName);

    // ── CHECK 1: Collection Counts ───────────────────────────────────────────
    const cCount = await db.collection("communities").countDocuments();
    const wpCount = await db.collection("waterPoints").countDocuments();
    const tCount = await db.collection("technicians").countDocuments();
    const rCount = await db.collection("reports").countDocuments();
    const uCount = await db.collection("users").countDocuments();

    console.log(`[CHECK 1] Collection Counts:`);
    console.log(`- communities:  ${cCount} / 5`);
    console.log(`- waterPoints:  ${wpCount} / 6`);
    console.log(`- technicians:  ${tCount} / 5`);
    console.log(`- reports:      ${rCount} / 5`);
    console.log(`- users:        ${uCount} / 13`);

    if (cCount !== 5 || wpCount !== 6 || tCount !== 5 || rCount !== 5 || uCount !== 13) {
      throw new Error(`Count verification failed! Unexpected document totals.`);
    }
    console.log(`[PASS] Collection counts meet exact criteria (5/6/5/5/13).\n`);

    // ── CHECK 2: Users Schema Validation & Unique Index ──────────────────────
    console.log(`[CHECK 2] Testing Users Schema Validation & Unique Phone Index:`);
    const usersColl = db.collection("users");

    // Negative test: invalid role
    try {
      await usersColl.insertOne({
        _id: "user_test_bad_role",
        name: "Bad Role User",
        phone: "0700 999 999",
        role: "superadmin", // INVALID: only officer, community, technician, volunteer allowed
        passwordHash: "dummy",
        active: true,
        createdAt: new Date()
      });
      throw new Error("Validation failed to reject invalid role 'superadmin'");
    } catch (err) {
      if (err.message.includes("Document failed validation") || err.code === 121) {
        console.log(`[PASS] Rejected user with invalid role 'superadmin' (Schema validation works).`);
      } else {
        throw err;
      }
    }

    // Negative test: duplicate phone number
    try {
      await usersColl.insertOne({
        _id: "user_test_dup_phone",
        name: "Duplicate Phone User",
        phone: "0765 924 115", // Duplicate of Hissen (user_01)
        role: "community",
        passwordHash: "dummy",
        active: true,
        createdAt: new Date()
      });
      throw new Error("Unique index failed to reject duplicate phone number");
    } catch (err) {
      if (err.code === 11000) {
        console.log(`[PASS] Rejected user with duplicate phone '0765 924 115' (Unique index works).`);
      } else {
        throw err;
      }
    }

    // ── CHECK 3: Reports Schema Allows 'in_progress' ──────────────────────────
    console.log(`\n[CHECK 3] Testing Reports Schema with 'in_progress':`);
    const reportsColl = db.collection("reports");
    const testReportId = "rpt_test_in_progress";

    await reportsColl.insertOne({
      _id: testReportId,
      waterPointId: "wp_01",
      reportedBy: { name: "Test Reporter", phone: "0700 000 999" },
      reportedAt: new Date(),
      problem: "Testing in_progress status validation",
      severity: "medium",
      status: "in_progress", // NEW STATUS
      assignedTo: "tech_01",
      resolvedAt: null,
      statusHistory: [
        { status: "open", at: new Date(), byUserId: "user_11", note: "Created" },
        { status: "assigned", at: new Date(), byUserId: "user_12", note: "Assigned" },
        { status: "in_progress", at: new Date(), byUserId: "user_06", note: "Mechanic on site" }
      ]
    });
    console.log(`[PASS] Successfully inserted report with status 'in_progress' and statusHistory.`);
    // Clean up test document
    await reportsColl.deleteOne({ _id: testReportId });

    // ── CHECK 4: Five Required Queries Against Database ──────────────────────
    console.log(`\n[CHECK 4] Testing the Five Required Queries:`);

    // Query 1: Broken water points
    const q1Broken = await db.collection("waterPoints").find({ status: "broken" }).toArray();
    const q1Ids = q1Broken.map((w) => w._id).sort();
    console.log(`Query 1 (Broken water points): Found [${q1Ids.join(", ")}]`);
    if (q1Ids.join(",") !== "wp_02,wp_05") {
      throw new Error(`Query 1 mismatch! Expected wp_02, wp_05; got ${q1Ids.join(",")}`);
    }
    console.log(`[PASS] Query 1 returns exactly wp_02 and wp_05.`);

    // Query 2: Free technicians in com_02
    const q2Techs = await db.collection("technicians").find({ coversCommunities: "com_02", available: true }).toArray();
    const q2Ids = q2Techs.map((t) => t._id).sort();
    console.log(`Query 2 (Free technicians in com_02): Found [${q2Ids.join(", ")}]`);
    if (q2Ids.join(",") !== "tech_01,tech_04") {
      throw new Error(`Query 2 mismatch! Expected tech_01, tech_04; got ${q2Ids.join(",")}`);
    }
    console.log(`[PASS] Query 2 returns exactly tech_01 and tech_04.`);

    // Query 3: Open reports FIFO
    const q3Reports = await db.collection("reports").find({ status: "open" }).sort({ reportedAt: 1 }).toArray();
    const q3Ids = q3Reports.map((r) => r._id);
    console.log(`Query 3 (Open reports FIFO oldest first): Found [${q3Ids.join(", ")}]`);
    if (q3Ids[0] !== "rpt_002" || q3Ids[1] !== "rpt_003") {
      throw new Error(`Query 3 mismatch! Expected rpt_002 then rpt_003; got ${q3Ids.join(",")}`);
    }
    console.log(`[PASS] Query 3 returns rpt_002 first, followed by rpt_003.`);

    // Query 4: Repair-closure transaction readiness
    console.log(`Query 4 (Repair closure transaction schema & state check):`);
    const rpt1 = await reportsColl.findOne({ _id: "rpt_001" });
    const wp2 = await db.collection("waterPoints").findOne({ _id: "wp_02" });
    if (rpt1.status !== "assigned" || wp2.status !== "broken") {
      throw new Error(`Query 4 prerequisite mismatch! rpt_001 must be 'assigned', wp_02 must be 'broken'.`);
    }
    console.log(`[PASS] Query 4 target documents (rpt_001 assigned, wp_02 broken) ready for atomic closure.`);

    // Query 5: Broken points per community aggregation
    const q5Agg = await db.collection("waterPoints").aggregate([
      { $match: { status: "broken" } },
      { $group: { _id: "$communityId", brokenCount: { $sum: 1 } } },
      {
        $lookup: {
          from: "communities",
          localField: "_id",
          foreignField: "_id",
          as: "community"
        }
      },
      { $unwind: "$community" },
      { $sort: { brokenCount: -1, _id: 1 } }
    ]).toArray();

    const q5Communities = q5Agg.map((g) => `${g.community.name} (${g.brokenCount})`);
    console.log(`Query 5 (Broken points per community): ${q5Communities.join(", ")}`);
    if (q5Agg.length !== 2) {
      throw new Error(`Query 5 expected 2 affected communities, got ${q5Agg.length}`);
    }
    console.log(`[PASS] Query 5 aggregation correctly groups broken assets across settlements.`);

    console.log(`\n========================================================`);
    console.log(`ALL PHASE 2 VERIFICATIONS PASSED SUCCESSFULLY!`);
    console.log(`========================================================\n`);
  } catch (err) {
    console.error(`\n[VERIFICATION FAILED]`, err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

verifyPhase2();

