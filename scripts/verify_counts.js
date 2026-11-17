// scripts/verify_counts.js
// Verifies that collection document counts match the assignment specification exactly:
// communities: 5, waterPoints: 6, technicians: 5, reports: 5 (21 total)
// Run with: mongosh mongodb://localhost:27017/waterTracker scripts/verify_counts.js

const targetDb = db.getSiblingDB("waterTracker");

const expected = {
  communities: 5,
  waterPoints: 6,
  technicians: 5,
  reports: 5
};

print("\n=== Verifying Collection Counts in 'waterTracker' ===");

let allPass = true;
let totalDocs = 0;

Object.entries(expected).forEach(([coll, expectedCount]) => {
  const actualCount = targetDb.getCollection(coll).countDocuments();
  totalDocs += actualCount;
  const status = actualCount === expectedCount ? "PASS" : "FAIL";
  if (status === "FAIL") allPass = false;
  print(`[${status}] ${coll.padEnd(14)}: ${actualCount} / ${expectedCount}`);
});

print(`\nTotal Documents: ${totalDocs} (Expected: 21)`);
print(`Verification Result: ${allPass ? "ALL REQUIREMENTS MET" : "MISMATCH DETECTED"}\n`);
