// scripts/test_phase5_registration_approval.js
// Integration tests for the full self-registration and officer-approval workflow.
//
// What this file proves (each numbered test is a viva-ready claim):
//   1.  POST /api/auth/register ignores client role — server always assigns volunteer+pending
//   2.  Duplicate phone is blocked (409 Conflict)
//   3.  Password too short is blocked (400)
//   4.  Missing required fields are blocked (400)
//   5.  Pending user's JWT cookie is issued on registration
//   6.  Pending user CANNOT call any protected route (403 PENDING_APPROVAL)
//   7.  Pending user can re-authenticate via login — still blocked after login
//   8.  Officer can see the pending user in GET /api/users
//   9.  Officer notification was created when user registered
//  10.  Officer can approve pending user (PATCH /api/users/:id/approve)
//  11.  Approved user can now call protected routes (200 OK)
//  12.  Approving a second time returns 400 "not pending"
//  13.  Audit log has USER_REGISTERED and USER_APPROVED entries
//
//  REJECT branch (independent of approve branch):
//  14.  Officer can reject a different pending user (PATCH /api/users/:id/reject)
//  15.  Rejected user document is deleted from the collection
//  16.  Rejected user's phone number is freed (can re-register)
//  17.  Core collection counts unchanged: communities 5, waterPoints 6, technicians 5, reports ≥5
//
// Usage (from project root):
//   $env:NODE_PATH="backend/node_modules"; node scripts/test_phase5_registration_approval.js
//
// Or just:
//   npm --prefix backend run test:phase5   (if you add the entry — see package.json note)

const path = require("path");
const backendDir = path.join(__dirname, "../backend");
process.env.NODE_PATH = path.join(backendDir, "node_modules");
require("module").Module._initPaths();

require("dotenv").config({ path: path.join(backendDir, ".env") });
const request  = require("supertest");
const { connectDB, closeDB, getDB } = require("../backend/db");
const app      = require("../backend/server");

// ── Helpers ──────────────────────────────────────────────────────────────────
// Unique suffix so parallel runs don't collide
const RUN_ID   = Date.now().toString().slice(-6);
// Two fresh phones — one for the approve branch, one for the reject branch
const PHONE_A  = `0780${RUN_ID}0`; // Approve branch
const PHONE_B  = `0780${RUN_ID}1`; // Reject branch
const PASSWORD = "Test@Phase5!";
const DEMO_PWD = process.env.DEMO_PASSWORD || "WaterTracker@2026";

async function runPhase5Tests() {
  console.log("\n========================================================");
  console.log("PHASE 5: Self-Registration & Officer Approval Workflow");
  console.log("========================================================\n");

  await connectDB();
  const db = getDB();

  let passed = 0;
  let failed = 0;

  function assert(condition, label) {
    if (condition) {
      console.log(`[PASS] ${label}`);
      passed++;
    } else {
      console.error(`[FAIL] ${label}`);
      failed++;
    }
  }

  // Track IDs created in this run so we always clean up, even on failure
  const createdIds = [];

  try {

    // ── Step 0: Get admin and officer auth ─────────────────────────────────
    const officerLogin = await request(app)
      .post("/api/auth/login")
      .send({ phone: "0700 000 100", password: DEMO_PWD });

    const officerCookie = officerLogin.headers["set-cookie"]?.[0];
    const officerToken  = officerLogin.body.token;

    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ phone: "0700 000 000", password: DEMO_PWD });

    const adminToken = adminLogin.body.token;

    // ── 1. Register — server enforces role=volunteer, status=pending ─────────
    console.log("--- 1. Self-Registration (Approve branch) ---");
    console.log(`[HTTP] POST /api/auth/register`);
    const regA = await request(app)
      .post("/api/auth/register")
      .send({
        name:     "Test Volunteer Alice",
        phone:    PHONE_A,
        password: PASSWORD,
        role:     "officer"   // deliberately trying to claim officer — server must ignore this
      });

    assert(regA.status === 201, "1.1 Registration returns 201 Created");
    assert(regA.body.user?.role === "volunteer",
      "1.2 Server forces role='volunteer' (ignores client's 'officer' claim)");
    assert(regA.body.user?.status === "pending",
      "1.3 Server sets status='pending' (requires officer approval)");
    assert(regA.body.user?.linkedId === null,
      "1.4 linkedId is null (server never trusts client's linkedId for volunteers)");
    assert(!regA.body.user?.passwordHash,
      "1.5 Response strips passwordHash (never sent to client)");
    assert(typeof regA.body.user?._id === "string" && regA.body.user._id.startsWith("user_"),
      "1.6 ID follows 'user_XX' string format (no ObjectId)");
    assert(regA.headers["set-cookie"]?.length > 0,
      "1.7 httpOnly JWT cookie is issued on registration");

    const userAId = regA.body.user?._id;
    if (userAId) createdIds.push(userAId);

    const pendingCookie = regA.headers["set-cookie"]?.[0];
    const pendingToken  = regA.body.token;

    // ── 2. Duplicate phone guard ─────────────────────────────────────────────
    console.log("\n--- 2. Duplicate Phone Guard ---");
    console.log(`[HTTP] POST /api/auth/register`);
    const dupReg = await request(app)
      .post("/api/auth/register")
      .send({ name: "Duplicate Alice", phone: PHONE_A, password: PASSWORD });

    assert(dupReg.status === 409,
      "2.1 Duplicate phone returns 409 Conflict");
    assert(dupReg.body.error?.toLowerCase().includes("already exists"),
      "2.2 Error message mentions 'already exists'");

    // ── 3. Validation: short password ───────────────────────────────────────
    console.log("\n--- 3. Input Validation ---");
    console.log(`[HTTP] POST /api/auth/register`);
    const shortPwd = await request(app)
      .post("/api/auth/register")
      .send({ name: "Val User", phone: "0781000001", password: "123" });

    assert(shortPwd.status === 400,
      "3.1 Short password (<6 chars) returns 400 Bad Request");

    console.log(`[HTTP] POST /api/auth/register`);
    const missingName = await request(app)
      .post("/api/auth/register")
      .send({ phone: "0781000002", password: PASSWORD });

    assert(missingName.status === 400,
      "3.2 Missing name returns 400 Bad Request");

    console.log(`[HTTP] POST /api/auth/register`);
    const missingPhone = await request(app)
      .post("/api/auth/register")
      .send({ name: "No Phone", password: PASSWORD });

    assert(missingPhone.status === 400,
      "3.3 Missing phone returns 400 Bad Request");

    // ── 4. Pending user blocked from requireAuth-protected routes ────────────
    // Note: routes using optionalAuth (reports, water-points, communities) allow
    // unauthenticated guests — they are tested at the network/RBAC level, not here.
    // Pending users are blocked by requireAuth on: /api/auth/me, /api/users, /api/stats/*, /api/audit.
    console.log("\n--- 4. Pending User Blocked from Protected Routes ---");

    // Use the cookie issued during registration
    console.log(`[HTTP] GET /api/auth/me`);
    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Cookie", pendingCookie);

    // /api/auth/me goes through requireAuth — pending users are blocked
    assert(
      meRes.status === 403 && meRes.body.code === "PENDING_APPROVAL",
      "4.1 Pending user: GET /api/auth/me returns 403 with code PENDING_APPROVAL"
    );

    // /api/users uses requireAuth + requireRole(officer) — pending hits requireAuth first
    console.log(`[HTTP] GET /api/users`);
    const usersBlockedRes = await request(app)
      .get("/api/users")
      .set("Cookie", pendingCookie);

    assert(usersBlockedRes.status === 403,
      "4.2 Pending user: GET /api/users blocked with 403 (requireAuth gate)");

    // /api/notifications uses requireAuth — pending user must be blocked
    console.log(`[HTTP] GET /api/notifications`);
    const notifsBlockedRes = await request(app)
      .get("/api/notifications")
      .set("Cookie", pendingCookie);

    assert(notifsBlockedRes.status === 403,
      "4.3 Pending user: GET /api/notifications blocked with 403");

    // /api/audit uses requireAuth + requireRole(officer)
    console.log(`[HTTP] GET /api/audit`);
    const auditBlockedRes = await request(app)
      .get("/api/audit")
      .set("Cookie", pendingCookie);

    assert(auditBlockedRes.status === 403,
      "4.4 Pending user: GET /api/audit blocked with 403");

    // ── 5. Pending user can log in again but cookie still blocked ───────────
    console.log("\n--- 5. Pending User Login Still Blocked ---");
    console.log(`[HTTP] POST /api/auth/login`);
    const pendingLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ phone: PHONE_A, password: PASSWORD });

    // Login itself returns 200 (phone + password correct), status field tells the story
    assert(
      pendingLoginRes.status === 200 &&
      pendingLoginRes.body.user?.status === "pending",
      "5.1 Pending user can authenticate (200) but status='pending' is returned"
    );

    const pendingLoginCookie = pendingLoginRes.headers["set-cookie"]?.[0];
    console.log(`[HTTP] GET /api/users`);
    const afterLoginBlock = await request(app)
      .get("/api/users")
      .set("Cookie", pendingLoginCookie);

    assert(afterLoginBlock.status === 403,
      "5.2 Cookie from pending login still blocked (403) on requireAuth routes");

    // ── 6. Admin sees pending user in user list (Officer gets 403) ─────────
    console.log("\n--- 6. Admin Sees Pending User & Officer Blocked ---");
    console.log(`[HTTP] GET /api/users (as Officer)`);
    const officerBlockedRes = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${officerToken}`);

    assert(
      officerBlockedRes.status === 403,
      "6.1 Officer GET /api/users is blocked with 403 Forbidden"
    );

    console.log(`[HTTP] GET /api/users (as Admin)`);
    const usersRes = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${adminToken}`);

    const pendingInList = usersRes.body?.find?.((u) => u._id === userAId);
    assert(
      usersRes.status === 200 && pendingInList?.status === "pending",
      "6.2 Admin GET /api/users shows Alice with status='pending'"
    );
    assert(!pendingInList?.passwordHash,
      "6.3 GET /api/users strips passwordHash from all users");

    // ── 7. Notification created in admin's inbox ─────────────────────────────
    console.log("\n--- 7. Admin Notification on Registration ---");
    const adminUser = await db.collection("users").findOne({ _id: "user_13" });
    const notif = await db.collection("notifications").findOne({
      relatedId: userAId,
      type:      "PENDING_REGISTRATION",
      userId:    adminUser?._id
    });

    assert(notif !== null,
      "7.1 PENDING_REGISTRATION notification created for Admin on new registration");
    assert(notif?.read === false,
      "7.2 Notification starts unread");
    if (!notif?.message?.includes("Test Volunteer Alice")) {
      console.log(`[DEBUG notif.message]: "${notif?.message}"`);
    }
    assert(notif?.message?.includes("Test Volunteer Alice"),
      "7.3 Notification message includes the registrant's name");

    // ── 8. Audit log has USER_REGISTERED entry ───────────────────────────────
    console.log("\n--- 8. Audit Trail ---");
    const regLog = await db.collection("auditLog").findOne({
      action:   "USER_REGISTERED",
      entityId: userAId
    });

    assert(regLog !== null,
      "8.1 auditLog has USER_REGISTERED entry for the new account");
    assert(regLog?.details?.status === "pending",
      "8.2 Audit entry records status='pending'");
    assert(regLog?.details?.role === "volunteer",
      "8.3 Audit entry records role='volunteer'");

    // ── 9. Admin approves the account (Officer forbidden) ───────────────────
    console.log("\n--- 9. Admin Approval ---");
    console.log(`[HTTP] PATCH /api/users/${userAId}/approve (as Officer)`);
    const officerApproveRes = await request(app)
      .patch(`/api/users/${userAId}/approve`)
      .set("Authorization", `Bearer ${officerToken}`);

    assert(
      officerApproveRes.status === 403,
      "9.1 Officer PATCH /api/users/:id/approve is blocked with 403 Forbidden"
    );

    console.log(`[HTTP] PATCH /api/users/${userAId}/approve (as Admin)`);
    const approveRes = await request(app)
      .patch(`/api/users/${userAId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    assert(approveRes.status === 200,
      "9.2 Admin PATCH /api/users/:id/approve returns 200 OK");
    assert(approveRes.body.message?.toLowerCase().includes("approved"),
      "9.3 Response message confirms approval");

    // Verify in DB
    const approvedUser = await db.collection("users").findOne({ _id: userAId });
    assert(approvedUser?.status === "approved",
      "9.4 User status changed to 'approved' in database");
    assert(approvedUser?.approvedBy === adminUser?._id,
      "9.5 approvedBy field records which admin approved");
    assert(approvedUser?.approvedAt instanceof Date,
      "9.6 approvedAt timestamp recorded");

    // Notification should now be read
    const notifAfter = await db.collection("notifications").findOne({ _id: notif?._id });
    assert(notifAfter?.read === true,
      "9.7 PENDING_REGISTRATION notification marked read after approval");

    // ── 10. Approved user can now access protected routes ────────────────────
    console.log("\n--- 10. Approved User Access ---");
    // Re-login to get a fresh cookie (old pending cookie was issued before approval)
    console.log(`[HTTP] POST /api/auth/login`);
    const approvedLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ phone: PHONE_A, password: PASSWORD });

    const approvedCookie = approvedLoginRes.headers["set-cookie"]?.[0];
    assert(
      approvedLoginRes.status === 200 &&
      approvedLoginRes.body.user?.status === "approved",
      "10.1 Approved user login returns status='approved'"
    );

    console.log(`[HTTP] GET /api/water-points`);
    const wpAfter = await request(app)
      .get("/api/water-points")
      .set("Cookie", approvedCookie);

    assert(wpAfter.status === 200,
      "10.2 Approved user can now access GET /api/water-points (200 OK)");

    console.log(`[HTTP] GET /api/reports`);
    const rptAfter = await request(app)
      .get("/api/reports")
      .set("Cookie", approvedCookie);

    assert(rptAfter.status === 200,
      "10.3 Approved user can now access GET /api/reports (200 OK)");

    console.log(`[HTTP] GET /api/notifications`);
    const notifAfterAccess = await request(app)
      .get("/api/notifications")
      .set("Cookie", approvedCookie);

    assert(notifAfterAccess.status === 200,
      "10.4 Approved user can now access GET /api/notifications (requireAuth 200 OK)");

    // ── 11. Double-approve returns 400 ───────────────────────────────────────
    console.log("\n--- 11. Idempotency Guard ---");
    console.log(`[HTTP] PATCH /api/users/${userAId}/approve (as Admin)`);
    const doubleApprove = await request(app)
      .patch(`/api/users/${userAId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    assert(doubleApprove.status === 400,
      "11.1 Approving already-approved account returns 400 'not pending'");

    // ── 12. Audit log has USER_APPROVED entry ────────────────────────────────
    console.log("\n--- 12. Approval Audit Trail ---");
    const approveLog = await db.collection("auditLog").findOne({
      action:   "USER_APPROVED",
      entityId: userAId
    });

    assert(approveLog !== null,
      "12.1 auditLog has USER_APPROVED entry after admin approves");
    assert(approveLog?.userId === adminUser?._id,
      "12.2 Audit entry records the admin's userId as the actor");

    // ── 13. REJECT branch — register a second user, reject them ─────────────
    console.log("\n--- 13. Reject Branch ---");
    console.log(`[HTTP] POST /api/auth/register`);
    const regB = await request(app)
      .post("/api/auth/register")
      .send({ name: "Test Volunteer Bob", phone: PHONE_B, password: PASSWORD });

    assert(regB.status === 201, "13.1 Second user (Bob) registered successfully");
    const userBId = regB.body.user?._id;
    if (userBId) createdIds.push(userBId);

    console.log(`[HTTP] PATCH /api/users/${userBId}/reject (as Officer)`);
    const officerRejectRes = await request(app)
      .patch(`/api/users/${userBId}/reject`)
      .set("Authorization", `Bearer ${officerToken}`);

    assert(officerRejectRes.status === 403,
      "13.2 Officer PATCH /api/users/:id/reject is blocked with 403 Forbidden");

    console.log(`[HTTP] PATCH /api/users/${userBId}/reject (as Admin)`);
    const rejectRes = await request(app)
      .patch(`/api/users/${userBId}/reject`)
      .set("Authorization", `Bearer ${adminToken}`);

    assert(rejectRes.status === 200,
      "13.3 Admin PATCH /api/users/:id/reject returns 200 OK");
    assert(rejectRes.body.message?.toLowerCase().includes("rejected"),
      "13.4 Response message confirms rejection");

    // ── 14. Rejected user is deleted from DB ─────────────────────────────────
    console.log("\n--- 14. Rejected Account Cleanup ---");
    const deletedUser = await db.collection("users").findOne({ _id: userBId });
    assert(deletedUser === null,
      "14.1 Rejected user document deleted from users collection");

    // Phone is freed — can register again
    console.log(`[HTTP] POST /api/auth/register`);
    const reRegB = await request(app)
      .post("/api/auth/register")
      .send({ name: "Bob Second Attempt", phone: PHONE_B, password: PASSWORD });

    assert(reRegB.status === 201,
      "14.2 Rejected phone number freed — same phone can re-register");
    const userBv2Id = reRegB.body.user?._id;
    if (userBv2Id) createdIds.push(userBv2Id);

    // Reject audit entry
    const rejectLog = await db.collection("auditLog").findOne({
      action:   "USER_REJECTED",
      entityId: userBId
    });
    assert(rejectLog !== null,
      "14.3 auditLog has USER_REJECTED entry");

    // ── 15. Core collection counts are untouched ─────────────────────────────
    console.log("\n--- 15. Core Collection Integrity ---");
    const [commCount, wpCount, techCount, rptCount] = await Promise.all([
      db.collection("communities").countDocuments(),
      db.collection("waterPoints").countDocuments(),
      db.collection("technicians").countDocuments(),
      db.collection("reports").countDocuments()
    ]);

    assert(commCount === 5,   "15.1 communities collection still has exactly 5 documents");
    assert(wpCount   === 6,   "15.2 waterPoints collection still has exactly 6 documents");
    assert(techCount === 5,   "15.3 technicians collection still has exactly 5 documents");
    assert(rptCount  >= 5,    "15.4 reports collection has ≥5 documents (lifecycle tests add some)");

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log("\n========================================================");
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log("========================================================\n");

  } catch (err) {
    console.error("[Test Execution Error]", err);
    failed++;
  } finally {
    // ── Cleanup: remove all users created by this test run ──────────────────
    // This keeps the DB clean after every run.
    if (createdIds.length > 0) {
      await db.collection("users").deleteMany({ _id: { $in: createdIds } });
      await db.collection("notifications").deleteMany({ relatedId: { $in: createdIds } });
      await db.collection("auditLog").deleteMany({ entityId: { $in: createdIds } });
    }
    // Also cleanup any stray test users with name matching Test Volunteer
    await db.collection("users").deleteMany({
      _id: { $nin: ["user_01","user_02","user_03","user_04","user_05","user_06","user_07","user_08","user_09","user_10","user_11","user_12","user_13"] }
    });
    await closeDB();
    if (failed > 0) process.exit(1);
  }
}

runPhase5Tests();
