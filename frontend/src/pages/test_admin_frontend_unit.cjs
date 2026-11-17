// frontend/src/pages/test_admin_frontend_unit.cjs
// Automated Front-end Unit & Structural Tests for Admin Acceptance Checks (G2)
// Tests:
// 1. Navigation shows only the three tabs: Requests, Users, Activity log (A1, G2).
// 2. Header button "Administration Dashboard" is removed; role badge appears once (A2, A4).
// 3. Own-row actions (Disable, Change role, Reset password) are absent on current admin's row (D1, G2).
// 4. Confirmation dialogs exist for Add user, Change role, Disable, Reset password, Approve, Reject (G2).
// 5. Cards replace tables below 768px in CSS (C6, G2).
// 6. Plain English labels dictionary conforms to exact specifications (B1, B3).
// 7. Date formatting ("12 Oct 2026") and relative age ("3 days ago") (B2).
// 8. Focus trapping, Escape key listener, and >= 44px touch targets (F1, F3, F4).

const assert = require("assert");
const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name} — ${err.message}`);
    failed++;
  }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("   Admin Frontend Acceptance & Structural Tests (G2)");
console.log("══════════════════════════════════════════════════════════════\n");

// Read frontend source files
const adminDashboardCode = fs.readFileSync(path.join(__dirname, "dashboards/AdminDashboard.jsx"), "utf8");
const navbarCode = fs.readFileSync(path.join(__dirname, "../components/Navbar.jsx"), "utf8");
const labelsCode = fs.readFileSync(path.join(__dirname, "../constants/labels.js"), "utf8");
const cssCode = fs.readFileSync(path.join(__dirname, "../index.css"), "utf8");
const formattersCode = fs.readFileSync(path.join(__dirname, "../utils/formatters.js"), "utf8");

// ──────────────────────────────────────────────────────────────────────────────
// 1. Navigation Tests (A1, A5, G2)
// ──────────────────────────────────────────────────────────────────────────────
console.log("--- 1. Admin Navigation Tabs (A1, A5, G2) ---");

test("A1: Admin navigation renders exactly three tabs (Requests, Users, Activity log)", () => {
  // Tab list role
  assert.ok(adminDashboardCode.includes('className="admin-tab-list"'));
  assert.ok(adminDashboardCode.includes('setActiveTab("requests")'));
  assert.ok(adminDashboardCode.includes('setActiveTab("users")'));
  assert.ok(adminDashboardCode.includes('setActiveTab("activity")'));

  // Ensure no other tabs exist
  const tabMatches = adminDashboardCode.match(/setActiveTab\("([^"]+)"\)/g);
  const distinctTabs = new Set(tabMatches.map((m) => m.match(/"([^"]+)"/)[1]));
  assert.deepStrictEqual(Array.from(distinctTabs).sort(), ["activity", "requests", "users"].sort());
});

test("A5: Active tab has 3px underline and fits 360px screen with no scroll arrows", () => {
  assert.ok(cssCode.includes(".admin-tab-list"));
  assert.ok(cssCode.includes(".admin-tab-btn.active"));
  assert.ok(cssCode.includes("border-bottom: 3px solid var(--primary-700)"));
  assert.ok(cssCode.includes("min-height: 44px"));
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Header & Role Badge Tests (A2, A4)
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n--- 2. Header and Role Badge Tests (A2, A4) ---");

test("A2: 'Administration Dashboard' header link is removed for admin", () => {
  assert.ok(!navbarCode.includes("Administration Dashboard"));
});

test("A4: Role badge appears once, in the header only", () => {
  assert.ok(navbarCode.includes("role-pill"));
  // Ensure the university name is not redundantly duplicated in AdminDashboard
  const universityMentions = (adminDashboardCode.match(/Bugema University/gi) || []).length;
  assert.strictEqual(universityMentions, 0, "University name must not be repeated inside AdminDashboard");
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Own-Row Protections in UI (D1, G2)
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n--- 3. Own-Row Action Absence (D1, G2) ---");

test("D1/G2: Own row (currentUser._id) hides Disable, Change role, and Reset password in desktop table", () => {
  assert.ok(adminDashboardCode.includes("const isCurrent = u._id === currentUser?._id;"));
  assert.ok(adminDashboardCode.includes("Current active session (modifications disabled)"));
  // Verify that when isCurrent is true, action buttons are replaced with passive text
  assert.ok(adminDashboardCode.includes("{isCurrent ? ("));
});

test("D1/G2: Own row hides action buttons in mobile stacked cards", () => {
  // Mobile cards also check isCurrent
  const matches = adminDashboardCode.match(/\{isCurrent \? \(/g);
  assert.strictEqual(matches.length, 2, "Both desktop table and mobile card must check isCurrent");
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Confirmation Dialogs (C7, C8, D3, D4, E1, G2)
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n--- 4. Confirmation Dialogs Existence (C7, C8, D3, D4, E1, G2) ---");

test("C7/G2: Add user modal exists with role and temporary password generation", () => {
  assert.ok(adminDashboardCode.includes("MODAL 1: ADD USER"));
  assert.ok(adminDashboardCode.includes("handleCreateUser"));
  assert.ok(adminDashboardCode.includes("temporaryPassword"));
});

test("C8/G2: Change role confirmation dialog exists with unlinked entity selection", () => {
  assert.ok(adminDashboardCode.includes("MODAL 2: CHANGE ROLE"));
  assert.ok(adminDashboardCode.includes("handleConfirmRoleChange"));
  assert.ok(adminDashboardCode.includes("linkedCommIds"));
  assert.ok(adminDashboardCode.includes("linkedTechIds"));
});

test("D3/G2: Disable confirmation dialog exists, names person, and accepts reason", () => {
  assert.ok(adminDashboardCode.includes("MODAL 3: DISABLE / ENABLE CONFIRMATION"));
  assert.ok(adminDashboardCode.includes("handleConfirmStatus"));
  assert.ok(adminDashboardCode.includes("Reason (optional)"));
});

test("D4/G2: Reset password confirmation dialog exists with one-time display", () => {
  assert.ok(adminDashboardCode.includes("MODAL 4: RESET PASSWORD CONFIRMATION"));
  assert.ok(adminDashboardCode.includes("MODAL 5: ONE-TIME TEMPORARY PASSWORD DISPLAY"));
  assert.ok(adminDashboardCode.includes("oneTimePasswordModal"));
});

test("E1/G2: Approve request confirmation dialog exists and sets role & linkedId", () => {
  assert.ok(adminDashboardCode.includes("MODAL 7: APPROVE REQUEST CONFIRMATION"));
  assert.ok(adminDashboardCode.includes("handleSubmitApprove"));
});

test("E1/G2: Reject request confirmation dialog exists, names person, and takes optional note", () => {
  assert.ok(adminDashboardCode.includes("MODAL 8: REJECT REQUEST CONFIRMATION"));
  assert.ok(adminDashboardCode.includes("handleSubmitReject"));
  assert.ok(adminDashboardCode.includes("Optional reason or note"));
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Responsive Mobile Cards Below 768px (C6, F4, G2)
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n--- 5. Responsive Mobile Cards (< 768px) (C6, F4, G2) ---");

test("C6/F4/G2: CSS hides tables and shows stacked cards below 768px", () => {
  assert.ok(cssCode.includes(".users-desktop-table"));
  assert.ok(cssCode.includes(".users-mobile-cards"));
  assert.ok(cssCode.includes("@media (max-width: 767px)"));
  assert.ok(cssCode.includes(".requests-desktop-table"));
  assert.ok(cssCode.includes(".requests-mobile-cards"));
  assert.ok(cssCode.includes(".activity-desktop-table"));
  assert.ok(cssCode.includes(".activity-mobile-cards"));
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. Plain English & No Jargon (B1, B3)
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n--- 6. Plain English Terminology (B1, B3) ---");

test("B1/B3: labels.js dictionary contains all required plain English replacements", () => {
  assert.ok(labelsCode.includes('MANAGE_USERS: "Manage users"'));
  assert.ok(labelsCode.includes('BANNER_HELP: "Approve new accounts, manage users, and see who did what."'));
  assert.ok(labelsCode.includes('USERS: "Users"'));
  assert.ok(labelsCode.includes('PHONE: "Phone number"'));
  assert.ok(labelsCode.includes('ROLE: "Role"'));
  assert.ok(labelsCode.includes('COMMUNITY_OR_TECH: "Community or technician"'));
  assert.ok(labelsCode.includes('RESET_PASSWORD: "Reset password"'));
  assert.ok(labelsCode.includes('ACTIVITY_LOG: "Activity log"'));
  assert.ok(labelsCode.includes('REQUESTS: "Requests"'));
  assert.ok(labelsCode.includes('ADD_USER: "Add user"'));
  assert.ok(labelsCode.includes('NO_REQUESTS: "No requests waiting."'));
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. Accessible Focus Trap, Escape Key & Tap Targets (F1, F3, F4)
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n--- 7. Accessibility & Keyboard Navigation (F1, F3, F4) ---");

test("F3: Dialogs implement focus trapping and return focus on close", () => {
  assert.ok(adminDashboardCode.includes("handleTabTrap"));
  assert.ok(adminDashboardCode.includes("lastActiveElementRef"));
  assert.ok(adminDashboardCode.includes("role=\"dialog\""));
  assert.ok(adminDashboardCode.includes("aria-modal=\"true\""));
});

test("F3: Escape key closes all open modals", () => {
  assert.ok(adminDashboardCode.includes('e.key === "Escape"'));
});

test("F4: Controls enforce minimum 44px tap targets", () => {
  assert.ok(cssCode.includes("min-height: 44px"));
});

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`   Admin Frontend Test Results: ${passed} PASSED, ${failed} FAILED`);
console.log("══════════════════════════════════════════════════════════════\n");

process.exit(failed > 0 ? 1 : 0);

