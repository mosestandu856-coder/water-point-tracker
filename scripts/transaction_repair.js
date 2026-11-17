// scripts/transaction_repair.js
// Query 4: Multi-document ACID Transaction
// Atomically marks report rpt_001 as resolved and updates waterPoint wp_02 to "working".
// Run with: mongosh mongodb://localhost:27017/waterTracker scripts/transaction_repair.js

const targetDb = db.getSiblingDB("waterTracker");

print("\n=================================================================");
print("QUERY 4: Multi-Document Transaction - Record Finished Repair");
print("Actions to execute atomically:");
print("  1. rpt_001 -> status: 'resolved', resolvedAt: new Date(), costUGX: 60000");
print("  2. wp_02  -> status: 'working'");
print("=================================================================");

// Check if running on replica set
let isReplica = false;
try {
  const rsStatus = rs.status();
  isReplica = (rsStatus && rsStatus.ok === 1);
} catch (e) {
  isReplica = false;
}

if (!isReplica) {
  print("\n[NOTE] MongoDB requires a replica set (even single-node 'rs0') for multi-document transactions.");
  print("To enable rs0 on your MongoDB Windows service, run this in an Administrator PowerShell:");
  print("   powershell -ExecutionPolicy Bypass -File \".\\scripts\\enable_replica_set.ps1\"");
  print("\nFalling back to sequential demonstration on standalone mongod:");
}

const session = db.getMongo().startSession();

try {
  if (isReplica) {
    session.startTransaction({
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" }
    });
    print("\n[TRANSACTION STARTED] Session transaction opened.");
  }

  const reportsColl = isReplica ? session.getDatabase("waterTracker").reports : targetDb.reports;
  const wpColl = isReplica ? session.getDatabase("waterTracker").waterPoints : targetDb.waterPoints;

  const resolutionTime = new Date();

  // Step 1: Resolve report rpt_001
  const rptResult = reportsColl.updateOne(
    { _id: "rpt_001" },
    {
      $set: {
        status: "resolved",
        resolvedAt: resolutionTime,
        costUGX: 60000
      }
    }
  );
  print(`Step 1: Updated rpt_001 (matched: ${rptResult.matchedCount}, modified: ${rptResult.modifiedCount})`);

  // Step 2: Mark water point wp_02 as working
  const wpResult = wpColl.updateOne(
    { _id: "wp_02" },
    {
      $set: {
        status: "working"
      }
    }
  );
  print(`Step 2: Updated wp_02  (matched: ${wpResult.matchedCount}, modified: ${wpResult.modifiedCount})`);

  if (isReplica) {
    session.commitTransaction();
    print("[TRANSACTION COMMITTED] Both updates permanently applied as an atomic unit.\n");
  } else {
    print("[STANDALONE] Both updates executed sequentially.\n");
  }

} catch (err) {
  if (isReplica) {
    session.abortTransaction();
    print(`[TRANSACTION ABORTED] Error encountered: ${err.message}. Rolled back all changes.`);
  } else {
    print(`[ERROR] ${err.message}`);
  }
} finally {
  session.endSession();
}

// Display updated state
print("=== Updated State in Database ===");
printjson(targetDb.reports.findOne({ _id: "rpt_001" }));
printjson(targetDb.waterPoints.findOne({ _id: "wp_02" }));
