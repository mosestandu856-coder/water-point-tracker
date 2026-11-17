// scripts/test_phase3_auth_rbac.js
// Automated verification for Phase 3:
// Tests authentication, lockout, JWT cookies, NoSQL injection protection,
// role-based access control (RBAC), and database row-level query scoping.
//
// Usage: node scripts/test_phase3_auth_rbac.js

const path = require("path");
// Ensure backend node_modules are accessible regardless of invocation directory
const backendDir = path.join(__dirname, "../backend");
process.env.NODE_PATH = path.join(backendDir, "node_modules");
require("module").Module._initPaths();

require("dotenv").config({ path: path.join(backendDir, ".env") });
const request = require("supertest");
const { connectDB, closeDB, getDB } = require("../backend/db");
const app = require("../backend/server");
const { signToken } = require("../backend/middleware/auth");

async function runPhase3Tests() {
  console.log("\n========================================================");
  console.log("PHASE 3: Testing Authentication, RBAC & Row-Level Scoping");
  console.log("========================================================\n");

  await connectDB();
  const db = getDB();

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  try {
    // ── 1. AUTHENTICATION & LOGIN ────────────────────────────────────────────
    console.log("--- 1. Login & Token Generation ---");

    // 1.1 Valid login for Officer (Mohamed Abdi)
    const validPassword = process.env.DEMO_PASSWORD || "WaterTracker@2026";
    const officerLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ phone: "0765 924 113", password: validPassword });

    assert(
      officerLoginRes.status === 200 &&
      officerLoginRes.body.user &&
      officerLoginRes.body.user.role === "officer" &&
      !officerLoginRes.body.user.passwordHash &&
      officerLoginRes.headers["set-cookie"],
      "1.1 Officer login succeeds, sets httpOnly cookie, strips passwordHash"
    );

    const officerCookie = officerLoginRes.headers["set-cookie"][0];
    const officerToken = officerLoginRes.body.token;

    // 1.2 Invalid password returns 401 with generic message
    const badLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ phone: "0765 924 113", password: "WrongPassword" });

    assert(
      badLoginRes.status === 401 && badLoginRes.body.error && badLoginRes.body.error.startsWith("Phone or password is incorrect"),
      "1.2 Invalid password returns 401 with generic error message"
    );

    // 1.3 Lockout test after 5 failed attempts
    const testLockoutPhone = "0700 000 999_test";
    // Create temporary user for lockout test
    await db.collection("users").insertOne({
      _id: "user_test_lock",
      name: "Lockout Test",
      phone: testLockoutPhone,
      role: "volunteer",
      passwordHash: "dummy",
      active: true,
      createdAt: new Date()
    });

    let lockoutTriggered = false;
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ phone: testLockoutPhone, password: "Wrong" });
      if (res.status === 429 && res.body.error.includes("Account temporarily locked")) {
        lockoutTriggered = true;
      }
    }
    await db.collection("users").deleteOne({ _id: "user_test_lock" });
    assert(lockoutTriggered, "1.3 Account temporarily locked with 429 after 5 failed attempts");

    // 1.4 GET /api/auth/me requires auth
    const unauthMe = await request(app).get("/api/auth/me");
    assert(unauthMe.status === 401, "1.4 Unauthenticated GET /api/auth/me is rejected with 401");

    const authMe = await request(app)
      .get("/api/auth/me")
      .set("Cookie", officerCookie);
    assert(
      authMe.status === 200 && authMe.body.user.phone === "0765 924 113",
      "1.5 Authenticated GET /api/auth/me returns current user profile"
    );

    // 1.5 Logout clears cookie
    const logoutRes = await request(app).post("/api/auth/logout");
    assert(
      logoutRes.status === 200 &&
      logoutRes.headers["set-cookie"][0].includes("token=;"),
      "1.6 POST /api/auth/logout clears JWT cookie"
    );

    // ── 2. NOSQL INJECTION DEFENSE ───────────────────────────────────────────
    console.log("\n--- 2. NoSQL Operator Injection Sanitization ---");
    const nosqlRes = await request(app)
      .post("/api/auth/login")
      .send({ phone: { $gt: "" }, password: validPassword });

    assert(
      nosqlRes.status === 400 && nosqlRes.body.error.includes("forbidden"),
      "2.1 Rejects request body with MongoDB operator '$gt' (NoSQL injection defense)"
    );

    // ── 3. ROW-LEVEL SCOPING: COMMUNITY CONTACT ──────────────────────────────
    console.log("\n--- 3. Row-Level Scoping: Community Contact (com_01) ---");
    // Esther Nakato (user_01, com_01)
    const communityUser = await db.collection("users").findOne({ _id: "user_01" });
    const communityToken = signToken(communityUser);

    // 3.1 Can only list own community
    const commListRes = await request(app)
      .get("/api/communities")
      .set("Authorization", `Bearer ${communityToken}`);

    assert(
      commListRes.status === 200 &&
      commListRes.body.length === 1 &&
      commListRes.body[0]._id === "com_01",
      "3.1 Community contact GET /api/communities only returns their own community (com_01)"
    );

    // 3.2 Forbidden to view another community
    const commForbiddenRes = await request(app)
      .get("/api/communities/com_02")
      .set("Authorization", `Bearer ${communityToken}`);

    assert(
      commForbiddenRes.status === 403,
      "3.2 Community contact GET /api/communities/com_02 rejected with 403 Forbidden"
    );

    // 3.3 Can only query water points in own community
    const commWpRes = await request(app)
      .get("/api/water-points")
      .set("Authorization", `Bearer ${communityToken}`);

    const allInCom01 = commWpRes.body.every((w) => w.communityId === "com_01");
    assert(
      commWpRes.status === 200 && allInCom01,
      "3.3 Community contact GET /api/water-points strictly scoped to community com_01"
    );

    // 3.4 Forbidden to file report for water point in another community (wp_02 is in com_02)
    const reportOtherCommRes = await request(app)
      .post("/api/reports")
      .set("Authorization", `Bearer ${communityToken}`)
      .send({
        waterPointId: "wp_02", // In Kalagala com_02, not Bugema com_01
        reportedBy: { name: "Hissen", phone: "0765 924 115" },
        problem: "Illegal cross-community report",
        severity: "medium"
      });

    assert(
      reportOtherCommRes.status === 403 &&
      reportOtherCommRes.body.error.includes("within your community"),
      "3.4 Rejects fault report for water point in another community with 403 Forbidden"
    );

    // ── 4. ROW-LEVEL SCOPING: TECHNICIAN ─────────────────────────────────────
    console.log("\n--- 4. Row-Level Scoping: Technician (tech_01) ---");
    // John Mugisha (user_06, tech_01)
    const techUser = await db.collection("users").findOne({ _id: "user_06" });
    const techToken = signToken(techUser);

    // 4.1 Reports list strictly scoped to assigned jobs
    const techReportsRes = await request(app)
      .get("/api/reports")
      .set("Authorization", `Bearer ${techToken}`);

    const allAssignedToTech01 = techReportsRes.body.every((r) => r.assignedTo === "tech_01");
    assert(
      techReportsRes.status === 200 && allAssignedToTech01,
      "4.1 Technician GET /api/reports strictly scoped to jobs assigned to tech_01"
    );

    // 4.2 Technicians cannot assign other technicians
    const techAssignRes = await request(app)
      .patch("/api/reports/rpt_002/assign")
      .set("Authorization", `Bearer ${techToken}`)
      .send({ technicianId: "tech_01" });

    assert(
      techAssignRes.status === 403,
      "4.2 Technician PATCH /api/reports/:id/assign rejected with 403 Forbidden"
    );

    // 4.3 Technician can toggle own availability
    const techAvailRes = await request(app)
      .patch("/api/technicians/tech_01/availability")
      .set("Authorization", `Bearer ${techToken}`)
      .send({ available: false });

    assert(
      techAvailRes.status === 200 && techAvailRes.body.technician.available === false,
      "4.3 Technician can update their own availability status"
    );
    // Restore availability
    await db.collection("technicians").updateOne({ _id: "tech_01" }, { $set: { available: true } });

    // 4.4 Technician forbidden to modify another mechanic's availability
    const techAvailOtherRes = await request(app)
      .patch("/api/technicians/tech_02/availability")
      .set("Authorization", `Bearer ${techToken}`)
      .send({ available: false });

    assert(
      techAvailOtherRes.status === 403,
      "4.4 Technician cannot update another technician's availability (403 Forbidden)"
    );

    // ── 5. ROW-LEVEL SCOPING: STUDENT VOLUNTEER ──────────────────────────────
    console.log("\n--- 5. Row-Level Scoping: Student Volunteer ---");
    const volunteerUser = await db.collection("users").findOne({ _id: "user_11" });
    const volunteerToken = signToken(volunteerUser);

    // 5.1 Volunteer cannot assign technicians
    const volAssignRes = await request(app)
      .patch("/api/reports/rpt_002/assign")
      .set("Authorization", `Bearer ${volunteerToken}`)
      .send({ technicianId: "tech_01" });

    assert(
      volAssignRes.status === 403,
      "5.1 Volunteer cannot assign technicians (403 Forbidden)"
    );

    // 5.2 Volunteer cannot resolve repairs
    const volResolveRes = await request(app)
      .post("/api/reports/rpt_001/resolve")
      .set("Authorization", `Bearer ${volunteerToken}`)
      .send({ costUGX: 20000 });

    assert(
      volResolveRes.status === 403,
      "5.2 Volunteer cannot resolve repairs (403 Forbidden)"
    );

    // ── 6. DISTRICT OFFICER POWERS & RESTRICTIONS ───────────────────────────
    console.log("\n--- 6. District Officer Powers & Restrictions ---");

    // 6.1 Officer CANNOT access audit log (delegated to Admin)
    const officerAuditRes = await request(app)
      .get("/api/audit")
      .set("Authorization", `Bearer ${officerToken}`);

    assert(
      officerAuditRes.status === 403,
      "6.1 Officer accessing audit log is blocked with 403 Forbidden (Audit delegated to Admin)"
    );

    // 6.2 Officer CANNOT manage users (delegated to Admin)
    const officerUsersRes = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${officerToken}`);

    assert(
      officerUsersRes.status === 403,
      "6.2 Officer accessing user management (GET /api/users) is blocked with 403 Forbidden"
    );

    // 6.3 Officer can view ranked technicians for smart dispatch
    const rankedRes = await request(app)
      .get("/api/technicians/ranked-for-report/rpt_002")
      .set("Authorization", `Bearer ${officerToken}`);

    assert(
      rankedRes.status === 200 &&
      Array.isArray(rankedRes.body.rankedTechnicians) &&
      rankedRes.body.rankedTechnicians.length > 0,
      "6.3 Officer gets smart-ranked technicians based on skill matching and open workload"
    );

    // 6.4 Officer can assign a technician
    const officerAssignRes = await request(app)
      .patch("/api/reports/rpt_002/assign")
      .set("Authorization", `Bearer ${officerToken}`)
      .send({ technicianId: "tech_02", note: "Dispatch test assignment" });

    assert(
      officerAssignRes.status === 200,
      "6.4 Officer can assign technician to report (PATCH /api/reports/:id/assign)"
    );

    // Restore rpt_002 back to open state so baseline seed state remains pristine
    await db.collection("reports").updateOne(
      { _id: "rpt_002" },
      { $set: { status: "open", assignedTo: null }, $pull: { statusHistory: { status: "assigned" } } }
    );

    // ── 7. SYSTEM ADMINISTRATOR PRIVILEGES & SAFEGUARDS ──────────────────────
    console.log("\n--- 7. System Administrator Privileges & Safeguards ---");

    // 7.1 Admin login (Moses Tandu)
    const adminLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ phone: "0726 986 218", password: validPassword });

    assert(
      adminLoginRes.status === 200 &&
      adminLoginRes.body.user &&
      adminLoginRes.body.user.role === "admin",
      "7.1 Admin login succeeds with phone 0726 986 218 and role: admin"
    );
    const adminToken = adminLoginRes.body.token;

    // 7.2 Admin can access audit log
    const adminAuditRes = await request(app)
      .get("/api/audit")
      .set("Authorization", `Bearer ${adminToken}`);

    assert(
      adminAuditRes.status === 200 && Array.isArray(adminAuditRes.body.logs),
      "7.2 Admin can view audit trail (GET /api/audit)"
    );

    // 7.3 Admin can access user management
    const adminUsersRes = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${adminToken}`);

    assert(
      adminUsersRes.status === 200 && Array.isArray(adminUsersRes.body),
      "7.3 Admin can list user accounts (GET /api/users)"
    );

    // 7.4 Admin CANNOT dispatch / assign reports
    const adminAssignRes = await request(app)
      .patch("/api/reports/rpt_002/assign")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ technicianId: "tech_01" });

    assert(
      adminAssignRes.status === 403,
      "7.4 Admin cannot dispatch or assign reports (403 Forbidden)"
    );

    // 7.5 Admin CANNOT resolve reports
    const adminResolveRes = await request(app)
      .post("/api/reports/rpt_001/resolve")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ costUGX: 10000 });

    assert(
      adminResolveRes.status === 403,
      "7.5 Admin cannot resolve reports (403 Forbidden)"
    );

    // 7.6 Admin cannot disable themselves
    const adminSelfDisable = await request(app)
      .patch("/api/users/user_13/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ active: false });

    assert(
      adminSelfDisable.status === 400 && adminSelfDisable.body.error.includes("disable your own"),
      "7.6 Admin cannot disable their own account (400 Bad Request)"
    );

    // 7.7 Admin cannot demote themselves
    const adminSelfDemote = await request(app)
      .patch("/api/users/user_13/role")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "volunteer" });

    assert(
      adminSelfDemote.status === 400 && adminSelfDemote.body.error.includes("demote your own"),
      "7.7 Admin cannot demote their own role (400 Bad Request)"
    );

    console.log("\n========================================================");
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log("========================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("[Test Execution Error]", err);
    process.exit(1);
  } finally {
    await closeDB();
  }
}

runPhase3Tests();
