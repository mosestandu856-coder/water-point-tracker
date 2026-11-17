// scripts/test_phone_formats.js
// Verifies that 0700000106, 0700 000 106, +256700000106, and 0700-000-106 all authenticate successfully.

require("dotenv").config({ path: "backend/.env" });
const http = require("http");
const assert = require("assert");

const password = process.env.DEMO_PASSWORD;
if (!password) {
  console.error("No DEMO_PASSWORD found in backend/.env");
  process.exit(1);
}

function loginReq(phone) {
  const payload = JSON.stringify({ phone, password });
  return new Promise((resolve, reject) => {
    const req = http.request("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log("\n═══ Phone Format Integration Tests (Volunteer: user_11) ═══\n");

  const formats = [
    { label: "Canonical unspaced (0700000106)", phone: "0700000106" },
    { label: "Seeded spaced format (0700 000 106)", phone: "0700 000 106" },
    { label: "International prefix (+256700000106)", phone: "+256700000106" },
    { label: "Hyphenated format (0700-000-106)", phone: "0700-000-106" },
    { label: "9-digit subscriber format with country code context (700 000 106)", phone: "700 000 106" },
    { label: "9-digit unspaced subscriber format (700000106)", phone: "700000106" }
  ];

  for (const f of formats) {
    const res = await loginReq(f.phone);
    assert.strictEqual(res.status, 200, `Expected 200 for ${f.label}, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.user.name, "Brian Mugabi");
    assert.strictEqual(res.body.user.role, "volunteer");
    console.log(`  ✓ PASS: ${f.label} -> authenticated as ${res.body.user.name}`);
  }

  // Test keepSignedIn = true sets 7-day cookie
  const payload7d = JSON.stringify({ phone: "0700 000 106", password, keepSignedIn: true });
  const res7d = await new Promise((resolve) => {
    const req = http.request("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload7d) }
    }, (res) => {
      resolve({ status: res.statusCode, headers: res.headers });
    });
    req.write(payload7d);
    req.end();
  });
  const cookie7d = res7d.headers["set-cookie"]?.[0] || "";
  assert.ok(cookie7d.includes("Max-Age=604800"), "Expected 7-day Max-Age (604800s) on cookie");
  console.log("  ✓ PASS: Keep me signed in sets 7-day cookie (Max-Age=604800)");

  // Test keepSignedIn = false uses session cookie (no Max-Age)
  const payloadSession = JSON.stringify({ phone: "0700 000 106", password, keepSignedIn: false });
  const resSession = await new Promise((resolve) => {
    const req = http.request("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payloadSession) }
    }, (res) => {
      resolve({ status: res.statusCode, headers: res.headers });
    });
    req.write(payloadSession);
    req.end();
  });
  const cookieSession = resSession.headers["set-cookie"]?.[0] || "";
  assert.ok(!cookieSession.includes("Max-Age"), "Expected session cookie with no Max-Age");
  console.log("  ✓ PASS: Unchecked keep signed in issues a session cookie (no Max-Age)");

  console.log("\n═══ All Integration Checks Passed ═══\n");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

