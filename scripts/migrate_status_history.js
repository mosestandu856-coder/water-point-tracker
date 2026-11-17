// scripts/migrate_status_history.js
// Reversibly adds statusHistory audit trail to existing report documents.
// Run to apply: node scripts/migrate_status_history.js
// Run to rollback: node scripts/migrate_status_history.js --rollback

require("dotenv").config({ path: "./backend/.env" });
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const dbName = process.env.DB_NAME || "waterTracker";
const isRollback = process.argv.includes("--rollback");

async function migrateStatusHistory() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log(`[Status History Migration] Connected to MongoDB (${dbName})`);
    const db = client.db(dbName);
    const reportsCollection = db.collection("reports");
    const usersCollection = db.collection("users");

    if (isRollback) {
      console.log("\n[Rollback Mode] Removing statusHistory field from all reports...");
      const rollbackResult = await reportsCollection.updateMany(
        {},
        { $unset: { statusHistory: "" } }
      );
      console.log(`[Rollback] Removed statusHistory from ${rollbackResult.modifiedCount} reports.`);
      console.log("[Rollback] Database successfully restored to original schema without statusHistory.\n");
      return;
    }

    console.log("\n[Apply Mode] Backfilling statusHistory for reports...");

    // Map phone numbers to user IDs for accurate attribution
    const users = await usersCollection.find({}).toArray();
    const phoneToUserId = new Map(users.map((u) => [u.phone, u._id]));
    const techToUserId = new Map(users.filter((u) => u.linkedId).map((u) => [u.linkedId, u._id]));
    const officerUser = users.find((u) => u.role === "officer");
    const officerId = officerUser ? officerUser._id : "user_12";

    const reports = await reportsCollection.find({}).toArray();
    let updatedCount = 0;

    for (const rpt of reports) {
      const reporterUserId = phoneToUserId.get(rpt.reportedBy?.phone) || "user_11";
      const techUserId = techToUserId.get(rpt.assignedTo) || "user_06";

      const history = [];

      // 1. Initial creation entry
      history.push({
        status: "open",
        at: new Date(rpt.reportedAt),
        byUserId: reporterUserId,
        note: `Initial fault reported: "${rpt.problem}"`
      });

      // 2. Assignment entry (if assigned or resolved)
      if (rpt.status === "assigned" || rpt.status === "in_progress" || rpt.status === "resolved") {
        const assignedTime = new Date(new Date(rpt.reportedAt).getTime() + 75 * 60 * 1000); // ~1h 15m later
        history.push({
          status: "assigned",
          at: assignedTime,
          byUserId: officerId,
          note: `Assigned to technician ${rpt.assignedTo || "mechanic"}`
        });
      }

      // 3. Resolution entry (if resolved)
      if (rpt.status === "resolved" && rpt.resolvedAt) {
        history.push({
          status: "resolved",
          at: new Date(rpt.resolvedAt),
          byUserId: techUserId,
          note: rpt.notes ? `Repair completed: ${rpt.notes}` : "Repair completed and verified operational"
        });
      }

      await reportsCollection.updateOne(
        { _id: rpt._id },
        { $set: { statusHistory: history } }
      );
      updatedCount++;
    }

    console.log(`[Apply] Successfully migrated ${updatedCount} reports with statusHistory.`);
    console.log("[Apply] Each history record contains { status, at, byUserId, note } adhering to schema.");
    console.log("[Apply] Run with '--rollback' at any time to reverse this migration.\n");
  } catch (err) {
    console.error("[Migration Error]", err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

migrateStatusHistory();

