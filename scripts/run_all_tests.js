// scripts/run_all_tests.js
// Single-command master test runner for the entire Community Water Point Tracker test suite (G3).
// Runs:
// 1. Backend Admin Safety, Security & RBAC Tests (D1, D2, D4, D5, D7, D8, E1)
// 2. Frontend Unit, A11y & Structural Tests (A1-A6, B1-B4, C1-C8, F1-F5, G2)
// 3. Database Integrity & Core Query Verification (G4: 5/6/5/5/13 counts & 5 queries)

const { spawnSync } = require("child_process");
const path = require("path");

const rootDir = path.join(__dirname, "..");

console.log("══════════════════════════════════════════════════════════════════");
console.log("  COMMUNITY WATER POINT TRACKER — FULL SYSTEM TEST SUITE (G3)     ");
console.log("══════════════════════════════════════════════════════════════════\n");

const suites = [
  {
    name: "Backend Admin Safety & Security (D1, D2, D4, D5, D7, D8, E1)",
    cmd: "node",
    args: ["scripts/test_admin_safety_security.js"]
  },
  {
    name: "Backend Officer RBAC & Calculations (B1-B7, E1)",
    cmd: "node",
    args: ["scripts/test_officer_backend.js"]
  },
  {
    name: "Frontend Admin Unit, Structural & Accessibility (A, B, C, F, G2)",
    cmd: "node",
    args: ["frontend/src/pages/test_admin_frontend_unit.cjs"]
  },
  {
    name: "Frontend Officer Unit, Structural & Labels (A1-A6, B1-B3, C1-C3, E2)",
    cmd: "node",
    args: ["frontend/src/pages/test_officer_frontend.cjs"]
  },
  {
    name: "Database Integrity, Protected Counts (5/6/5/5/13) & 5 Queries (G4)",
    cmd: "node",
    args: ["scripts/verify_phase2.js"]
  }
];

let totalFailedSuites = 0;

for (const suite of suites) {
  console.log(`\n▶ RUNNING SUITE: ${suite.name}`);
  console.log("──────────────────────────────────────────────────────────────────");
  const result = spawnSync(suite.cmd, suite.args, {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, NODE_PATH: path.join(rootDir, "backend/node_modules") }
  });

  if (result.status !== 0) {
    console.error(`\n❌ SUITE FAILED: ${suite.name} (exit code ${result.status})`);
    totalFailedSuites++;
  } else {
    console.log(`\n✔ SUITE COMPLETED SUCCESSFULLY: ${suite.name}`);
  }
}

console.log("\n══════════════════════════════════════════════════════════════════");
if (totalFailedSuites === 0) {
  console.log("  🎉 ALL TEST SUITES PASSED! FULL SYSTEM COMPLIANT WITH ALL CHECKS  ");
} else {
  console.error(`  ❌ ${totalFailedSuites} TEST SUITE(S) FAILED                    `);
}
console.log("══════════════════════════════════════════════════════════════════\n");

process.exit(totalFailedSuites > 0 ? 1 : 0);

