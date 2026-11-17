// scripts/transaction_rollback_test.js
// Proves Rollback on Failure for Query 4 ACID Transaction
// Run with: mongosh mongodb://localhost:27017/waterTracker scripts/transaction_rollback_test.js

const targetDb = db.getSiblingDB("waterTracker");

print("\n=================================================================");
print("TRANSACTION ROLLBACK TEST: Proving Atomicity on Failure");
print("Objective: Show that if an error occurs mid-transaction, ALL partial");
print("writes are rolled back and no corrupted/partial state is committed.");
print("=================================================================");

let isReplica = false;
try {
  const rsStatus = rs.status();
  isReplica = (rsStatus && rsStatus.ok === 1);
} catch (e) {
  isReplica = false;
}

if (!isReplica) {
  print("\n[NOTE] A replica set is required for MongoDB session transactions.");
  print("Run .\\scripts\\enable_replica_set.ps1 as Administrator to activate rs0.");
  print("Exiting test early until rs0 is running.");
  quit(0);
}

// 1. Record pre-test state
const preRpt = targetDb.reports.findOne({ _id: "rpt_001" });
const preWp = targetDb.waterPoints.findOne({ _id: "wp_02" });
print(`Pre-test rpt_001 status: "${preRpt.status}"`);
print(`Pre-test wp_02  status: "${preWp.status}"`);

const session = db.getMongo().startSession();

try {
  session.startTransaction({
    readConcern: { level: "snapshot" },
    writeConcern: { w: "majority" }
  });
  print("\n[STEP 1] Started transaction.");

  const reportsColl = session.getDatabase("waterTracker").reports;
  const wpColl = session.getDatabase("waterTracker").waterPoints;

  // Execute Step 1: Modify rpt_001 inside transaction
  reportsColl.updateOne(
    { _id: "rpt_001" },
    { $set: { status: "resolved", resolvedAt: new Date(), costUGX: 60000 } }
  );
  print("[STEP 2] Updated rpt_001 to 'resolved' inside transaction buffer.");

  // Simulate unexpected failure before updating waterPoint
  print("[STEP 3] Simulating critical server/network failure before wp_02 is updated...");
  throw new Error("SIMULATED_FAILURE: Power outage or database constraint violation occurred!");

  // Step 4 (will never be reached)
  wpColl.updateOne({ _id: "wp_02" }, { $set: { status: "working" } });
  session.commitTransaction();

} catch (err) {
  print(`\n[STEP 4] Exception caught: "${err.message}"`);
  print("[STEP 5] Calling session.abortTransaction() to rollback...");
  session.abortTransaction();
  print("[OK] Transaction successfully aborted.");
} finally {
  session.endSession();
}

// 2. Verify post-rollback state in database
const postRpt = targetDb.reports.findOne({ _id: "rpt_001" });
const postWp = targetDb.waterPoints.findOne({ _id: "wp_02" });

print("\n=== Post-Rollback Database State Verification ===");
print(`rpt_001 status in database: "${postRpt.status}" (Expected: "${preRpt.status}")`);
print(`wp_02  status in database: "${postWp.status}" (Expected: "${preWp.status}")`);

if (postRpt.status === preRpt.status && postWp.status === preWp.status) {
  print("\n[RESULT: PASS] Atomicity proven: Zero partial modifications were saved.");
} else {
  print("\n[RESULT: FAIL] Inconsistency detected: Rollback failed.");
}
