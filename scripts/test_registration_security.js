// scripts/test_registration_security.js
// Proves the server never lets a client self-assign "admin", "officer", or any privileged role.
// Run: $env:NODE_PATH="backend/node_modules"; node scripts/test_registration_security.js

const path = require("path");
const backendDir = path.join(__dirname, "../backend");
process.env.NODE_PATH = path.join(backendDir, "node_modules");
require("module").Module._initPaths();

require("dotenv").config({ path: path.join(backendDir, ".env") });
const request = require("supertest");
const { connectDB, closeDB, getDB } = require("../backend/db");
const app = require("../backend/server");

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

// Use a unique phone per test run to avoid collisions across runs
const testPhone = `0799${Date.now().toString().slice(-6)}`;
const t1bPhone  = `0796${Date.now().toString().slice(-6)}`;
const t2Phone   = `0798${Date.now().toString().slice(-6)}`;
const t3Phone   = `0797${Date.now().toString().slice(-6)}`;

async function run() {
  console.log("\n═══ Registration Security Tests ═══\n");

  await connectDB();
  const db = getDB();

  try {
    // T1: Attempt to register with role="officer" — server must ignore it
    const t1 = await request(app).post("/api/auth/register").send({
      name: "Hacker User",
      phone: testPhone,
      password: "Test@1234",
      role: "officer"           // client tries to claim officer
    });
    assert("T1: Registration returns 201",          t1.status === 201,         `got ${t1.status}`);
    assert("T1: Server assigns 'volunteer' not 'officer'", t1.body.user?.role === "volunteer", `got role='${t1.body.user?.role}'`);
    assert("T1: Status is 'pending' (requires approval)", t1.body.user?.status === "pending", `got status='${t1.body.user?.status}'`);
    assert("T1: linkedId is null (volunteers have no settlement)", t1.body.user?.linkedId === null);

    // T1b: Attempt to register with role="admin" — server must ignore it
    const t1b = await request(app).post("/api/auth/register").send({
      name: "Admin Claimant",
      phone: t1bPhone,
      password: "Test@1234",
      role: "admin"
    });
    assert("T1b: Server forces 'volunteer', ignores 'admin'", t1b.body.user?.role === "volunteer", `got role='${t1b.body.user?.role}'`);
    assert("T1b: Status is 'pending'", t1b.body.user?.status === "pending");

    // T2: Attempt with role="community" — also refused, forced to volunteer+pending
    const t2 = await request(app).post("/api/auth/register").send({
      name: "Community Claimant",
      phone: t2Phone,
      password: "Test@1234",
      role: "community",
      linkedId: "com_01"
    });
    assert("T2: Registration returns 201",                     t2.status === 201,           `got ${t2.status}`);
    assert("T2: Server forces 'volunteer', ignores 'community'", t2.body.user?.role === "volunteer", `got role='${t2.body.user?.role}'`);
    assert("T2: linkedId is null (server refuses client's com_01)", t2.body.user?.linkedId === null);

    // T3: Attempt with role="technician" — also refused
    const t3 = await request(app).post("/api/auth/register").send({
      name: "Tech Claimant",
      phone: t3Phone,
      password: "Test@1234",
      role: "technician",
      linkedId: "tech_01"
    });
    assert("T3: Server forces 'volunteer', ignores 'technician'", t3.body.user?.role === "volunteer", `got role='${t3.body.user?.role}'`);

    // T4: DEMO_MODE endpoint returns 404 when DEMO_MODE not set (or returns data when set)
    const t4 = await request(app).get("/api/auth/demo-accounts");
    if (process.env.DEMO_MODE === "true") {
      assert("T4: /demo-accounts returns 200 in DEMO_MODE=true", t4.status === 200, `got ${t4.status}`);
      assert("T4: Returns exactly 5 demo accounts",              t4.body.accounts?.length === 5);
      assert("T4: All demo accounts have valid roles",
        t4.body.accounts?.every(a => ["admin","officer","community","technician","volunteer"].includes(a.role)));
    } else {
      assert("T4: /demo-accounts returns 404 outside DEMO_MODE", t4.status === 404, `got ${t4.status}`);
    }

    // T5: Generic error — bad credentials give same message whether phone exists or not
    const r_badPhone = await request(app).post("/api/auth/login").send({ phone: "0700000000", password: "wrong" });
    const r_goodPhoneBadPwd = await request(app).post("/api/auth/login").send({ phone: "0700000100", password: "wrong" });
    assert("T5: Non-existent phone gives same error as wrong password",
      r_badPhone.body?.error === r_goodPhoneBadPwd.body?.error,
      `"${r_badPhone.body?.error}" vs "${r_goodPhoneBadPwd.body?.error}"`);
    assert("T5: Error message is the generic string",
      r_badPhone.body?.error?.startsWith("Phone or password is incorrect"), `got "${r_badPhone.body?.error}"`);

    // T6: Forgot-password never reveals if phone is registered
    const fp_known   = await request(app).post("/api/auth/forgot-password").send({ phone: "0700000100" });
    const fp_unknown = await request(app).post("/api/auth/forgot-password").send({ phone: "0799999999" });
    assert("T6: Forgot-password gives same message for known phone",   fp_known.status === 200);
    assert("T6: Forgot-password gives same message for unknown phone", fp_unknown.status === 200);
    assert("T6: Both messages are identical (no enumeration leak)",
      fp_known.body?.message === fp_unknown.body?.message,
      `"${fp_known.body?.message}" vs "${fp_unknown.body?.message}"`);

  } finally {
    // Cleanup test users created during this test
    try {
      await db.collection("users").deleteMany({
        phone: { $in: [testPhone, t1bPhone, t2Phone, t3Phone] }
      });
    } catch (e) {
      // Non-critical cleanup
    }
    await closeDB();
  }

  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => { console.error("Fatal:", e); process.exit(1); });


