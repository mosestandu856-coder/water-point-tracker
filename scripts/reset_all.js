// scripts/reset_all.js
// Comprehensive reset script for viva demonstrations.
// Restores original 4 collections to pristine seed data (5/6/5/5),
// applies statusHistory migration, reseeds 12 users, and clears notifications/auditLog.
//
// Usage: node scripts/reset_all.js

require("dotenv").config({ path: "./backend/.env" });
const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const dbName = process.env.DB_NAME || "waterTracker";
const dataDir = path.join(__dirname, "..", "data");

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "WaterTracker@2026";
const BCRYPT_ROUNDS = 12;

function parseJsonWithDates(rawJson) {
  return JSON.parse(rawJson, (key, value) => {
    if (value && typeof value === "object" && value.$date) {
      return new Date(value.$date);
    }
    return value;
  });
}

async function resetAll() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log(`\n========================================================`);
    console.log(`RESETTING SYSTEM TO PRISTINE VIVA DEMO STATE`);
    console.log(`Target Database: ${dbName} at ${uri}`);
    console.log(`========================================================\n`);

    const db = client.db(dbName);

    // 1. Reset original 4 collections from data/*.json
    const collectionsToSeed = ["communities", "waterPoints", "technicians", "reports"];

    for (const collName of collectionsToSeed) {
      const filePath = path.join(dataDir, `${collName}.json`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Data file not found: ${filePath}`);
      }
      const raw = fs.readFileSync(filePath, "utf-8");
      const docs = parseJsonWithDates(raw);

      const coll = db.collection(collName);
      await coll.deleteMany({});
      const res = await coll.insertMany(docs);
      console.log(`* Collection [${collName}]: Restored ${res.insertedCount} documents.`);
    }

    // 2. Reseed users collection (12 users)
    console.log(`\n* Hashing demo password for users with bcrypt (cost: ${BCRYPT_ROUNDS})...`);
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
    const now = new Date();

    const usersData = [
      { _id: "user_01", name: "Hissen", phone: "0765 924 115", email: "hissen@bugema.ac.ug", role: "community", linkedId: "com_01", active: true },
      { _id: "user_02", name: "Fahad", phone: "0700 000 102", email: "fahad@kalagala.org", role: "community", linkedId: "com_02", active: true },
      { _id: "user_03", name: "Solomon", phone: "0700 000 103", email: "solomon@health.go.ug", role: "community", linkedId: "com_03", active: true },
      { _id: "user_04", name: "Kitumba", phone: "0700 000 104", email: "kitumba@bamunanika.org", role: "community", linkedId: "com_04", active: true },
      { _id: "user_05", name: "Ryder Kunar", phone: "0700 000 105", email: "ryder.kunar@schools.ug", role: "community", linkedId: "com_05", active: true },
      { _id: "user_06", name: "Moses Zach", phone: "0726 927 445", email: "moses.zach@watertech.ug", role: "technician", linkedId: "tech_01", active: true },
      { _id: "user_07", name: "Gatrude", phone: "0782 200 302", email: "gatrude@watertech.ug", role: "technician", linkedId: "tech_02", active: true },
      { _id: "user_08", name: "Joseph", phone: "0701 300 403", email: "joseph@watertech.ug", role: "technician", linkedId: "tech_03", active: true },
      { _id: "user_09", name: "Brian Erick", phone: "0752 400 504", email: "brian.erick@watertech.ug", role: "technician", linkedId: "tech_04", active: true },
      { _id: "user_10", name: "Dominic Lopir", phone: "0774 500 605", email: "dominic.lopir@watertech.ug", role: "technician", linkedId: "tech_05", active: true },
      { _id: "user_11", name: "Zachariah", phone: "0765 924 114", email: "zachariah@bugema.ac.ug", role: "volunteer", linkedId: null, active: true },
      { _id: "user_12", name: "Mohamed Abdi", phone: "0765 924 113", email: "mohamed.abdi@luweero.go.ug", role: "officer", linkedId: null, active: true },
      { _id: "user_13", name: "Moses Tandu", phone: "0726 986 218", email: "mosestandu856@gmail.com", role: "admin", linkedId: null, active: true }
    ].map((u) => ({
      ...u,
      passwordHash,
      createdAt: now,
      lastLoginAt: null
    }));

    const usersColl = db.collection("users");
    await usersColl.deleteMany({});
    const userRes = await usersColl.insertMany(usersData);
    console.log(`* Collection [users]: Restored ${userRes.insertedCount} users.`);

    // 3. Clear transient notification and auditLog collections
    const notifColl = db.collection("notifications");
    await notifColl.deleteMany({});
    console.log(`* Collection [notifications]: Cleared all transient records.`);

    const auditColl = db.collection("auditLog");
    await auditColl.deleteMany({});
    console.log(`* Collection [auditLog]: Cleared all transient records.`);

    // 4. Backfill statusHistory on the 5 reports
    const reportsColl = db.collection("reports");
    const reports = await reportsColl.find({}).toArray();

    for (const rpt of reports) {
      const history = [];
      const reporterUser = usersData.find((u) => u.phone === rpt.reportedBy?.phone) || usersData.find((u) => u._id === "user_11");
      const techUser = usersData.find((u) => u.linkedId === rpt.assignedTo) || usersData.find((u) => u._id === "user_06");

      history.push({
        status: "open",
        at: new Date(rpt.reportedAt),
        byUserId: reporterUser._id,
        note: `Initial fault reported: "${rpt.problem}"`
      });

      if (rpt.status === "assigned" || rpt.status === "in_progress" || rpt.status === "resolved") {
        const assignedTime = new Date(new Date(rpt.reportedAt).getTime() + 75 * 60 * 1000);
        history.push({
          status: "assigned",
          at: assignedTime,
          byUserId: "user_12",
          note: `Assigned to technician ${rpt.assignedTo || "mechanic"}`
        });
      }

      if (rpt.status === "resolved" && rpt.resolvedAt) {
        history.push({
          status: "resolved",
          at: new Date(rpt.resolvedAt),
          byUserId: techUser._id,
          note: rpt.notes ? `Repair completed: ${rpt.notes}` : "Repair completed"
        });
      }

      await reportsColl.updateOne({ _id: rpt._id }, { $set: { statusHistory: history } });
    }
    console.log(`* Collection [reports]: Backfilled statusHistory on all 5 reports.`);

    // 5. Verify counts
    const counts = {
      communities: await db.collection("communities").countDocuments(),
      waterPoints: await db.collection("waterPoints").countDocuments(),
      technicians: await db.collection("technicians").countDocuments(),
      reports: await db.collection("reports").countDocuments(),
      users: await db.collection("users").countDocuments(),
      notifications: await notifColl.countDocuments(),
      auditLog: await auditColl.countDocuments()
    };

    console.log(`\n========================================================`);
    console.log(`DATABASE COUNTS VERIFICATION:`);
    console.log(`- communities:   ${counts.communities} (Expected: 5)`);
    console.log(`- waterPoints:   ${counts.waterPoints} (Expected: 6)`);
    console.log(`- technicians:   ${counts.technicians} (Expected: 5)`);
    console.log(`- reports:       ${counts.reports} (Expected: 5)`);
    console.log(`- users:         ${counts.users} (Expected: 12)`);
    console.log(`- notifications: ${counts.notifications} (Expected: 0)`);
    console.log(`- auditLog:      ${counts.auditLog} (Expected: 0)`);
    console.log(`========================================================\n`);

    if (
      counts.communities === 5 &&
      counts.waterPoints === 6 &&
      counts.technicians === 5 &&
      counts.reports === 5 &&
      counts.users === 12
    ) {
      console.log(`[PASS] All collection counts match viva requirements exactly!\n`);
    } else {
      console.error(`[FAIL] Verification mismatch in collection counts.`);
      process.exit(1);
    }
  } catch (err) {
    console.error("[Reset Error]", err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

resetAll();

