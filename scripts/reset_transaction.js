// scripts/reset_transaction.js
// Resets rpt_001 and wp_02 back to their exact original seed state
// Run with: mongosh mongodb://localhost:27017/waterTracker scripts/reset_transaction.js

const targetDb = db.getSiblingDB("waterTracker");

print("\n=== Resetting Transaction Test Data to Original Seed State ===");

// Reset rpt_001
targetDb.reports.updateOne(
  { _id: "rpt_001" },
  {
    $set: {
      status: "assigned",
      assignedTo: "tech_01",
      resolvedAt: null
    },
    $unset: {
      costUGX: ""
    }
  }
);
print("Reset rpt_001: status='assigned', assignedTo='tech_01', resolvedAt=null, costUGX removed.");

// Reset wp_02
targetDb.waterPoints.updateOne(
  { _id: "wp_02" },
  {
    $set: {
      status: "broken"
    }
  }
);
print("Reset wp_02: status='broken'.");

print("\n=== Current Document States ===");
printjson(targetDb.reports.findOne({ _id: "rpt_001" }));
printjson(targetDb.waterPoints.findOne({ _id: "wp_02" }));
print("\nReset complete. Ready to run transaction test again.\n");
