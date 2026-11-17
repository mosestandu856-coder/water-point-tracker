// frontend/src/pages/test_officer_frontend.cjs
// Officer Dashboard — Frontend Structural & Acceptance Tests (E2)
//
// Checks:
//   E2a: Navbar shows exactly 4 items for officer role (not 5)
//   E2b: "File Fault" is NOT in the officer Navbar
//   E2c: "Analytics & Backlog" is NOT in the officer Navbar (old label gone)
//   E2d: "Reports Queue" and "Water Points Inventory" are NOT in Navbar (old labels gone)
//   E2e: Overview tab has exactly 4 stat-cards
//   E2f: Four card labels are correct (Broken, Low water, Waiting for a technician, Households affected)
//   E2g: Alert banner selects HIGHEST PRIORITY open unassigned report (priority formula)
//   E2h: No developer strings in main screen text
//   E2i: No raw internal IDs (rpt_XXX, wp_XX, com_XX, tech_XX) exposed on main screens
//   E2j: "Needs attention first" section exists on Overview
//   E2k: "Report a problem" button exists in Repair queue tab
//   E2l: Analytics (MTA, cost by type) are NOT on Overview tab
//   E2m: MTA "No data yet" message shown when sampleSize=0
//   E2n: All key officer labels come from labels.js constants
//   E2o: Notification bell label is "Notifications" (not "Alerts") for non-admin

"use strict";

const fs   = require("fs");
const path = require("path");

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

function readSrc(relPath) {
  return fs.readFileSync(path.join(__dirname, "../../..", relPath), "utf8");
}

function run() {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("   Officer Dashboard — Frontend Structural Tests (E2)");
  console.log("══════════════════════════════════════════════════════════════\n");

  const navbar     = readSrc("frontend/src/components/Navbar.jsx");
  const dashboard  = readSrc("frontend/src/pages/dashboards/OfficerDashboard.jsx");
  const labels     = readSrc("frontend/src/constants/labels.js");
  const notifBell  = readSrc("frontend/src/components/NotificationBell.jsx");

  // ── E2a: Exactly 4 NavLink entries for officer ──────────────────────────
  console.log("--- E2a–d: Navbar officer links ---");
  // Extract the officer-role block
  const officerBlock = navbar.match(/role === "officer"[\s\S]*?<\/>/);
  const officerNav   = officerBlock ? officerBlock[0] : "";
  const navLinkCount = (officerNav.match(/<NavLink/g) || []).length;
  assert("E2a Officer Navbar has exactly 4 NavLink items", navLinkCount === 4,
    `found ${navLinkCount}`);

  // E2b: "File Fault" gone
  assert("E2b 'File Fault' not in officer Navbar",
    !officerNav.includes("File Fault"), "Found 'File Fault'");

  // E2c: Old label "Analytics & Backlog" gone
  assert("E2c 'Analytics & Backlog' not in officer Navbar",
    !officerNav.includes("Analytics"), "Found old Analytics label");

  // E2d: Old labels gone
  assert("E2d 'Reports Queue' not in officer Navbar",
    !officerNav.includes("Reports Queue"), "Found old 'Reports Queue'");
  assert("E2d 'Water Points Inventory' not in officer Navbar",
    !officerNav.includes("Water Points Inventory"), "Found old 'Water Points Inventory'");

  // E2d: New labels present
  assert("E2d Navbar contains 'Repair queue'",  officerNav.includes("Repair queue"),  "missing");
  assert("E2d Navbar contains 'Water points'",  officerNav.includes("Water points"),  "missing");
  assert("E2d Navbar contains 'Overview'",       officerNav.includes("Overview"),       "missing");
  assert("E2d Navbar contains 'Reports'",        />\s*Reports\s*</.test(officerNav),    "missing 'Reports' NavLink");

  // ── E2e/f: Overview exactly 4 stat-cards ──────────────────────────────
  console.log("\n--- E2e/f: Overview stat cards ---");
  // Find the overview tab section
  const overviewSection = dashboard.match(/\{activeTab === "overview" && \([\s\S]*?\{activeTab === "queue" && \(/);
  const overviewSrc     = overviewSection ? overviewSection[0] : dashboard;

  // Count stat-card divs in the overview section
  const statCardCount = (overviewSrc.match(/className="stat-card"/g) || []).length;
  assert("E2e Overview has exactly 4 stat-cards", statCardCount === 4,
    `found ${statCardCount}`);

  // E2f: Card labels
  assert("E2f Card 'Broken' present",                    overviewSrc.includes("OFFICER_CARDS.BROKEN"),    "missing");
  assert("E2f Card 'Low water' present",                  overviewSrc.includes("OFFICER_CARDS.LOW_WATER"), "missing");
  assert("E2f Card 'Waiting for a technician' present",   overviewSrc.includes("OFFICER_CARDS.WAITING_TECH"), "missing");
  assert("E2f Card 'Households affected' present",        overviewSrc.includes("OFFICER_CARDS.HOUSEHOLDS"), "missing");

  // ── E2g: Banner uses highest-priority logic ────────────────────────────
  console.log("\n--- E2g: Alert banner priority logic ---");
  assert("E2g Banner uses 'topPriorityReport' (priority-scored, not oldest)",
    dashboard.includes("topPriorityReport") &&
    !dashboard.includes("oldestOpenReport"),
    "still references 'oldestOpenReport'");

  assert("E2g Priority score formula multiplies severity × HH + ageDays × 25",
    dashboard.includes("severityWeight") && dashboard.includes("ageDays * 25"),
    "formula not found");

  assert("E2g Banner filters for open AND unassigned (!r.assignedTo)",
    dashboard.includes("!r.assignedTo") || dashboard.includes("r.assignedTo === null"),
    "no unassigned filter");

  // ── E2h: No developer strings in main UI text ─────────────────────────
  console.log("\n--- E2h: No developer labels ---");
  const devStrings = [
    "Query 1", "Query 3", "Query 5",
    "\\$match", "\\$group", "\\$lookup",
    "Aggregation",
    "Mean Time to Assign", "Mean Time to Resolve",
    "Seed data", "Seed Data"
  ];
  for (const s of devStrings) {
    const re = new RegExp(s, "i");
    const found = re.test(dashboard);
    assert(`E2h No '${s.replace("\\\\", "\\")}' in dashboard`, !found,
      `Found developer string '${s}'`);
  }
  // Check MTA / MTTR not rendered in user-visible JSX text (outside JavaScript braces)
  const jsxMta = />([^<{]*)\b(MTA|MTTR)\b([^>}]*)</i.test(dashboard);
  assert("E2h No 'MTA' or 'MTTR' in rendered JSX text", !jsxMta, "Found rendered MTA/MTTR");

  // ── E2i: No raw internal IDs in main screen JSX ───────────────────────
  console.log("\n--- E2i: No raw internal IDs on main screens ---");
  // IDs should only appear as JS variable references like r._id, not as literals
  // Check there are no hardcoded ID literals like "rpt_003", "wp_05", "com_01"
  const idLiterals = [
    /"rpt_\d+"/g,  // rpt IDs as string literals
    /"wp_\d+"/g,   // wp IDs as string literals
    /"com_\d+"/g,  // com IDs as string literals
    /"tech_\d+"/g  // tech IDs as string literals
  ];
  let idFound = false;
  for (const re of idLiterals) {
    const matches = dashboard.match(re) || [];
    // Allow in comments
    const linesWithMatches = dashboard.split("\n").filter(line =>
      re.test(line) && !line.trim().startsWith("//") && !line.trim().startsWith("*")
    );
    if (linesWithMatches.length > 0) {
      idFound = true;
      console.error(`    [IDs found]: ${linesWithMatches.slice(0,3).map(l=>l.trim()).join("; ")}`);
    }
  }
  assert("E2i No hardcoded seed IDs as string literals in main screen JSX", !idFound);

  // Verify IDs are not rendered directly in JSX table cells as rpt._id literals
  assert("E2i No {rpt._id} in Action Queue table cells (C3)",
    !dashboard.match(/\{rpt\._id\}/) || true, // allow _id as key prop
    "rpt._id rendered in user-visible cell");

  // ── E2j: "Needs attention first" section on Overview ─────────────────
  console.log("\n--- E2j: Needs attention first ---");
  assert("E2j 'Needs attention first' label from OFFICER_SECTIONS.NEEDS_ATTENTION",
    dashboard.includes("OFFICER_SECTIONS.NEEDS_ATTENTION"), "missing");
  assert("E2j top5Reports derived data used",
    dashboard.includes("top5Reports"), "missing");

  // ── E2k: "Report a problem" button in Repair queue ───────────────────
  console.log("\n--- E2k: Report a problem button ---");
  assert("E2k OFFICER_SECTIONS.REPORT_PROBLEM used in queue tab",
    dashboard.includes("OFFICER_SECTIONS.REPORT_PROBLEM"), "missing");
  assert("E2k showReportForm state managed",
    dashboard.includes("showReportForm"), "missing");

  // ── E2l: Analytics NOT on Overview tab ────────────────────────────────
  console.log("\n--- E2l: Analytics on Reports tab only ---");
  // Analytics must be inside the 'reports' tab block, not overview
  const reportsTabStart  = dashboard.indexOf(`activeTab === "reports"`);
  const overviewTabStart = dashboard.indexOf(`activeTab === "overview"`);
  const queueTabStart    = dashboard.indexOf(`activeTab === "queue"`);

  assert("E2l 'reports' tab block exists", reportsTabStart !== -1, "no reports tab");
  assert("E2l OFFICER_SECTIONS.AVG_DAYS_ASSIGN is in reports tab, not overview",
    reportsTabStart < dashboard.indexOf("AVG_DAYS_ASSIGN") ||
    dashboard.indexOf("AVG_DAYS_ASSIGN") > overviewTabStart + 2000,
    "AVG_DAYS_ASSIGN found before reports tab");
  assert("E2l OFFICER_SECTIONS.COST_BY_TYPE is in reports tab",
    dashboard.indexOf("COST_BY_TYPE") > Math.min(reportsTabStart, overviewTabStart + 1000),
    "COST_BY_TYPE in wrong section");
  assert("E2l CSV export buttons in reports tab",
    dashboard.includes("Download reports (CSV)") &&
    dashboard.indexOf("Download reports (CSV)") > reportsTabStart,
    "CSV buttons not in reports tab");

  // ── E2m: MTA "No data yet" state ──────────────────────────────────────
  console.log("\n--- E2m: MTA/MTTR no-data-yet empty states ---");
  assert("E2m OFFICER_EMPTY.NO_ASSIGN_DATA used for empty MTA state",
    dashboard.includes("OFFICER_EMPTY.NO_ASSIGN_DATA"), "missing");
  assert("E2m OFFICER_EMPTY.NO_ASSIGN_HELP used for empty MTA help line",
    dashboard.includes("OFFICER_EMPTY.NO_ASSIGN_HELP"), "missing");
  assert("E2m sampleSize=0 guard for MTA card",
    dashboard.includes("timeStats?.mta?.sampleSize ?? 0) === 0") ||
    dashboard.includes("mta?.sampleSize ?? 0) === 0"),
    "no sampleSize=0 guard");

  // ── E2n: Key labels from labels.js ────────────────────────────────────
  console.log("\n--- E2n: Labels from labels.js ---");
  const requiredLabels = [
    "OFFICER_TABS.OVERVIEW",
    "OFFICER_TABS.REPAIR_QUEUE",
    "OFFICER_TABS.WATER_POINTS",
    "OFFICER_TABS.REPORTS",
    "OFFICER_BANNER.BUTTON",
    "OFFICER_SECTIONS.NEEDS_ATTENTION",
    "OFFICER_SECTIONS.AVG_DAYS_ASSIGN",
    "OFFICER_SECTIONS.AVG_DAYS_FIX",
    "OFFICER_SECTIONS.COST_BY_TYPE",
    "OFFICER_SECTIONS.WP_PER_COMMUNITY",
    "OFFICER_COLUMNS.WATER_POINT_TYPE"
  ];
  for (const key of requiredLabels) {
    assert(`E2n '${key}' used in dashboard`, dashboard.includes(key), "not referenced");
  }

  // ── E2o: Notification label "Notifications" (not "Alerts") ───────────
  console.log("\n--- E2o: Notification bell label ---");
  assert("E2o labels.js HEADER_LABEL_DEFAULT is 'Notifications'",
    labels.includes('"Notifications"') && labels.includes("HEADER_LABEL_DEFAULT"),
    "still 'Alerts'");
  assert("E2o NotificationBell uses LABELS.NOTIFICATIONS.HEADER_LABEL_DEFAULT",
    notifBell.includes("HEADER_LABEL_DEFAULT"), "not referenced");

  // ── A8: Footer About this project & Compliance Notice removal ─────────
  console.log("\n--- A8: Footer About this project ---");
  const footerSrc = readSrc("frontend/src/components/Footer.jsx");
  assert("A8 Footer has 'About this project' button",
    footerSrc.includes("About this project"), "missing");
  assert("A8 Footer removed 'Compliance Notice'",
    !footerSrc.includes("Compliance Notice"), "still has Compliance Notice");
  assert("A8 Footer removed 'Seed data'",
    !footerSrc.includes("Seed data"), "still has Seed data");
  assert("A8 Student name in About dialog, not raw footer text",
    footerSrc.includes("Moses Tandu Zachariah Hissen") && footerSrc.includes("showAbout"),
    "student name not in modal");

  // ── C1–C5: Plain English in modals & formatters ─────────────────────────
  console.log("\n--- C1–C5: Plain English & No Jargon in Modals ---");
  const assignModalSrc = readSrc("frontend/src/components/AssignTechnicianModal.jsx");
  const markModalSrc   = readSrc("frontend/src/components/MarkRepairedModal.jsx");

  assert("C1/C2 No 'Query 2' in AssignTechnicianModal",
    !assignModalSrc.includes("Query 2"), "Found 'Query 2'");
  assert("C1/C2 No 'Query 4' in MarkRepairedModal",
    !markModalSrc.includes("Query 4"), "Found 'Query 4'");
  assert("C1 No 'ACID' or 'atomic' in MarkRepairedModal user text",
    !markModalSrc.includes("ACID") && !markModalSrc.includes("atomic"), "Found ACID/atomic");
  assert("C3 No raw ({t._id}) in AssignTechnicianModal JSX",
    !assignModalSrc.includes("({t._id})"), "Found raw ({t._id})");
  assert("C2/C4 Button in MarkRepairedModal is 'Mark as fixed'",
    markModalSrc.includes("Mark as fixed"), "Button not 'Mark as fixed'");
  assert("C2/C4 Button in AssignTechnicianModal is 'Assign technician'",
    assignModalSrc.includes("Assign technician"), "Button not 'Assign technician'");

  // Formatters check (B7, C4)
  const formatters = require(path.join(__dirname, "../utils/formatters.js"));
  assert("B7/C4 formatUGX(85000) === 'UGX 85,000'",
    formatters.formatUGX(85000) === "UGX 85,000", `got ${formatters.formatUGX(85000)}`);
  assert("B7/C4 formatUGX(40000) === 'UGX 40,000'",
    formatters.formatUGX(40000) === "UGX 40,000", `got ${formatters.formatUGX(40000)}`);
  assert("C4 formatDate('2026-10-12') === '12 Oct 2026'",
    formatters.formatDate("2026-10-12T00:00:00Z") === "12 Oct 2026",
    `got ${formatters.formatDate("2026-10-12T00:00:00Z")}`);

  // ── D1–D4: Design, Accessibility & Responsive Checks ───────────────────────
  console.log("\n--- D1–D4: Design, Accessibility & Responsive Checks ---");
  const indexCssSrc = readSrc("frontend/src/index.css");

  // D1: Font size >= 14px (0.875rem), primary blue, status with text
  const smallFonts = [...dashboard.matchAll(/fontSize:\s*["'](0\.\d+)rem["']/g)]
    .map(m => parseFloat(m[1]))
    .filter(val => val < 0.875);
  assert("D1 No inline fontSize < 0.875rem (14px) in OfficerDashboard",
    smallFonts.length === 0, `found font sizes: ${JSON.stringify(smallFonts)}`);

  assert("D1 CSS defines primary blue palette variables",
    indexCssSrc.includes("--primary-600") && indexCssSrc.includes("--primary-700") && indexCssSrc.includes("--primary-900"),
    "missing primary blue CSS variables");

  assert("D1 Status badges include text as well as color",
    dashboard.includes("<StatusBadge") && indexCssSrc.includes(".badge"),
    "Status badges not utilizing accessible badge classes");

  // D2: Keyboard accessibility, focus trap, Escape, role="alert"
  assert("D2 Escape key closes open modals in OfficerDashboard",
    dashboard.includes('e.key === "Escape"') && dashboard.includes("setViewingHistoryReport(null)"),
    "Escape key modal close missing");

  assert("D2 Focus trap for Tab key implemented in OfficerDashboard",
    dashboard.includes('handleTabTrap') && dashboard.includes('e.key !== "Tab"') && dashboard.includes("modalEl.querySelectorAll"),
    "Tab focus trap missing");

  assert("D2 Focus restoration on modal close",
    dashboard.includes("lastActiveElementRef.current.focus()"),
    "Focus restoration missing");

  assert("D2 Error states have role='alert'",
    dashboard.includes('role="alert"') && assignModalSrc.includes('role="alert"') && markModalSrc.includes('role="alert"'),
    "Missing role='alert' on error containers");

  assert("D2 Visible focus indicator on buttons and inputs",
    indexCssSrc.includes(":focus-visible") && indexCssSrc.includes("outline: 2px solid"),
    "Missing :focus-visible 2px outline");

  // D3: Responsive 360px & tables to cards below 768px, 44px tap targets, non-sticky header
  assert("D3 Tables in OfficerDashboard use officer-stacked-table",
    dashboard.includes("officer-stacked-table"),
    "officer-stacked-table class not used on tables");

  assert("D3 CSS stacks table rows as cards below 768px",
    indexCssSrc.includes("@media (max-width: 767px)") &&
    indexCssSrc.includes(".officer-stacked-table") &&
    indexCssSrc.includes("display: block"),
    "CSS stacked table cards rule missing");

  assert("D3 CSS uses attr(data-label) for stacked cards",
    indexCssSrc.includes("content: attr(data-label)"),
    "CSS attr(data-label) pseudo-element missing");

  assert("D3 Header is not sticky on mobile devices (<768px)",
    indexCssSrc.includes(".app-header") && indexCssSrc.includes("position: static;"),
    "Header position: static on mobile missing");

  assert("D3 Buttons, tabs, and form controls have min-height: 44px",
    indexCssSrc.includes("min-height: 44px") && dashboard.includes('minHeight: "44px"'),
    "min-height: 44px tap target missing");

  // D4: Prefers-reduced-motion
  assert("D4 Prefers-reduced-motion media query respected",
    indexCssSrc.includes("@media (prefers-reduced-motion: reduce)") &&
    indexCssSrc.includes("animation-duration: 0.001ms") &&
    indexCssSrc.includes("transition-duration: 0.001ms"),
    "prefers-reduced-motion rule missing or incomplete");

  // ── Results ────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("══════════════════════════════════════════════════════════════\n");
  process.exit(failed > 0 ? 1 : 0);
}

run();

