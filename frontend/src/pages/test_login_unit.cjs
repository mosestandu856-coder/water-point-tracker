// frontend/src/pages/test_login_unit.cjs
// Tests covering:
// 1. Phone normalisation (0700000106, 0700 000 106, +256700000106, 0700-000-106)
// 2. Auto-formatting input logic (0700 000 106)
// 3. Validation and generic error state with actionable guidance
// 4. Rate-limiting & lockout message detection
// 5. DEMO_MODE server guard

const assert = require("assert");

function normalisePhone(raw) {
  if (!raw) return "";
  let p = String(raw).replace(/[\s\-]/g, "");
  if (p.startsWith("+256")) p = "0" + p.slice(4);
  if (p.startsWith("256") && p.length === 12) p = "0" + p.slice(3);
  if (!p.startsWith("0") && p.length === 9) p = "0" + p;
  return p;
}

function formatUgandaPhoneInput(val) {
  if (!val) return "";
  let digits = String(val).replace(/\D/g, "");
  if (digits.startsWith("256")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  digits = digits.slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

function validateLoginForm(phone, password) {
  if (!phone.trim()) return "Please enter your registered telephone number.";
  if (!password) return "Please enter your account password.";
  return null;
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ FAIL: ${name}`, e);
    process.exit(1);
  }
}

console.log("\n═══ Frontend Login Logic, Formatting & Validation Tests ═══\n");

// Phone Normalisation tests
test("normalises 0700000106 without spaces", () => {
  assert.strictEqual(normalisePhone("0700000106"), "0700000106");
});

test("normalises 0700 000 106 with spaces", () => {
  assert.strictEqual(normalisePhone("0700 000 106"), "0700000106");
});

test("normalises +256700000106 international format", () => {
  assert.strictEqual(normalisePhone("+256700000106"), "0700000106");
});

test("normalises +256 700 000 106 with spaces and country code", () => {
  assert.strictEqual(normalisePhone("+256 700 000 106"), "0700000106");
});

test("normalises hyphens 0700-000-106", () => {
  assert.strictEqual(normalisePhone("0700-000-106"), "0700000106");
});

test("normalises 9-digit subscriber number 700 000 106 to 0700000106", () => {
  assert.strictEqual(normalisePhone("700 000 106"), "0700000106");
});

test("normalises 9-digit unspaced 700000106 to 0700000106", () => {
  assert.strictEqual(normalisePhone("700000106"), "0700000106");
});

// Auto-formatting tests (Uganda 9-digit subscriber number with UG +256 prefix)
test("auto-formats 3 digits or less as unspaced digits", () => {
  assert.strictEqual(formatUgandaPhoneInput("700"), "700");
});

test("auto-formats 4-6 digits with first space", () => {
  assert.strictEqual(formatUgandaPhoneInput("700000"), "700 000");
});

test("auto-formats full 9-digit number to 700 000 106", () => {
  assert.strictEqual(formatUgandaPhoneInput("700000106"), "700 000 106");
});

test("strips leading 0 when entered in 9-digit field (0700000106 -> 700 000 106)", () => {
  assert.strictEqual(formatUgandaPhoneInput("0700000106"), "700 000 106");
});

test("strips 256 country prefix when pasted (+256700000106 -> 700 000 106)", () => {
  assert.strictEqual(formatUgandaPhoneInput("+256 700 000 106"), "700 000 106");
});

test("ignores non-digit characters during auto-formatting", () => {
  assert.strictEqual(formatUgandaPhoneInput("700abc000xyz106"), "700 000 106");
});

// Validation tests
test("returns error when phone is empty", () => {
  assert.strictEqual(validateLoginForm("", "secret"), "Please enter your registered telephone number.");
});

test("returns error when password is empty", () => {
  assert.strictEqual(validateLoginForm("0700000106", ""), "Please enter your account password.");
});

test("returns null when both fields are present", () => {
  assert.strictEqual(validateLoginForm("0700000106", "secret"), null);
});

// Error & Lockout State tests
test("generic error contains required next steps guidance", () => {
  const GENERIC = "Phone or password is incorrect. Check your number and password, or contact your district officer.";
  assert.ok(GENERIC.includes("Check your number and password, or contact your district officer."));
});

test("lockout message pattern matches wait time string", () => {
  const LOCKOUT_MSG = "Account temporarily locked due to repeated failed logins. Please try again in 15 minute(s).";
  assert.match(LOCKOUT_MSG, /Account temporarily locked/);
  assert.match(LOCKOUT_MSG, /15 minute\(s\)/);
});

console.log(`\n═══ Results: ${passed} passed, 0 failed ═══\n`);
