// scripts/seed_cloud.js
// Cloud Database Initializer & Seeder for Community Water Point Tracker.
// Populates any remote MongoDB cluster (such as MongoDB Atlas free M0 tier)
// with the complete pristine dataset, indexes, and user accounts.
//
// Usage:
//   node scripts/seed_cloud.js <mongodb-connection-string>
// Or via environment variable:
//   MONGODB_URI="mongodb+srv://..." node scripts/seed_cloud.js

const path = require("path");
process.env.NODE_PATH = path.join(__dirname, "../backend/node_modules");
require("module").Module._initPaths();

require("dotenv").config({ path: path.join(__dirname, "../backend/.env") });
const { MongoClient } = require("mongodb");
const fs = require("fs");
const bcrypt = require("bcryptjs");

const rawArgUri = process.argv[2];
const uri = rawArgUri || process.env.MONGODB_URI || "mongodb://localhost:27017";
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

const seedUsersData = [
  // ── 1. Community Contacts (linked to com_01..com_05) ───────────────────────
  { _id: "user_01", name: "Hissen",       phone: "0765 924 115", email: "hissen@bugema.ac.ug",       role: "community", linkedId: "com_01", active: true },
  { _id: "user_02", name: "Fahad",        phone: "0700 000 102", email: "fahad@kalagala.org",        role: "community", linkedId: "com_02", active: true },
  { _id: "user_03", name: "Solomon",      phone: "0700 000 103", email: "solomon@health.go.ug",      role: "community", linkedId: "com_03", active: true },
  { _id: "user_04", name: "Kitumba",      phone: "0700 000 104", email: "kitumba@bamunanika.org",    role: "community", linkedId: "com_04", active: true },
  { _id: "user_05", name: "Nsubuga",      phone: "0700 000 105", email: "nsubuga@zobwe.org",        role: "community", linkedId: "com_05", active: true },

  // ── 2. Field Technicians (linked to tech_01..tech_05) ──────────────────────
  { _id: "user_06", name: "Moses Zach",    phone: "0726 927 445", email: "moses.zach@watertech.ug",   role: "technician", linkedId: "tech_01", active: true },
  { _id: "user_07", name: "Sarah Nabukalu", phone: "0700 000 202", email: "sarah.nabukalu@watertech.ug", role: "technician", linkedId: "tech_02", active: true },
  { _id: "user_08", name: "Kato Patrick",  phone: "0700 000 203", email: "kato.patrick@watertech.ug",  role: "technician", linkedId: "tech_03", active: true },
  { _id: "user_09", name: "Amina Namukasa", phone: "0700 000 204", email: "amina.namukasa@watertech.ug", role: "technician", linkedId: "tech_04", active: true },
  { _id: "user_10", name: "Dominic Lopir", phone: "0700 000 205", email: "dominic.lopir@watertech.ug", role: "technician", linkedId: "tech_05", active: true },

  // ── 3. Student Volunteer ───────────────────────────────────────────────────
  { _id: "user_11", name: "Zachariah",     phone: "0765 924 114", email: "zachariah@bugema.ac.ug",    role: "volunteer",  linkedId: null,      active: true },

  // ── 4. District Water Officer ──────────────────────────────────────────────
  { _id: "user_12", name: "Mohamed Abdi",  phone: "0765 924 113", email: "mohamed.abdi@luweero.go.ug", role: "officer",    linkedId: null,      active: true },

  // ── 5. System Administrator ────────────────────────────────────────────────
  { _id: "user_13", name: "Moses Tandu",   phone: "0726 986 218", email: "moses.tandu@water.luweero.ug", role: "admin",   linkedId: null,      active: true }
];

async function seedCloud() {
  console.log(`\n========================================================`);
  console.log(`SEEDING CLOUD MONGODB CLUSTER`);
  console.log(`Target: ${uri.replace(/:([^@]+)@/, ":****@")}`);
  console.log(`Database: ${dbName}`);
  console.log(`========================================================\n`);

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 20000,
    connectTimeoutMS: 20000
  });

  try {
    await client.connect();
    console.log(`[Connected] MongoDB connection established.`);
    const db = client.db(dbName);

    // 1. Seed Core Collections (communities, waterPoints, technicians, reports)
    const collections = ["communities", "waterPoints", "technicians", "reports"];
    for (const collName of collections) {
      const filePath = path.join(dataDir, `${collName}.json`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Data file missing: ${filePath}`);
      }
      const raw = fs.readFileSync(filePath, "utf-8");
      const docs = parseJsonWithDates(raw);

      const coll = db.collection(collName);
      await coll.deleteMany({});
      await coll.insertMany(docs);
      console.log(`* [${collName}]: Seeded ${docs.length} documents.`);
    }

    // 2. Backfill statusHistory on reports
    const reportsColl = db.collection("reports");
    const reports = await reportsColl.find({}).toArray();
    for (const rpt of reports) {
      const history = [];
      history.push({
        status: "open",
        at: new Date(rpt.reportedAt),
        byUserId: "user_02",
        note: "Initial fault report filed"
      });

      if (rpt.status === "assigned" || rpt.status === "in_progress" || rpt.status === "resolved") {
        history.push({
          status: "assigned",
          at: new Date(new Date(rpt.reportedAt).getTime() + 3600000),
          byUserId: "user_12",
          note: `Assigned to technician ${rpt.assignedTo || "mechanic"}`
        });
      }

      if (rpt.status === "resolved" && rpt.resolvedAt) {
        history.push({
          status: "resolved",
          at: new Date(rpt.resolvedAt),
          byUserId: "user_06",
          note: rpt.notes ? `Repair completed: ${rpt.notes}` : "Repair completed"
        });
      }

      await reportsColl.updateOne({ _id: rpt._id }, { $set: { statusHistory: history } });
    }
    console.log(`* [reports]: Backfilled statusHistory timeline on all reports.`);

    // 3. Seed Users with bcrypt passwords
    console.log(`* [users]: Generating password hashes (cost ${BCRYPT_ROUNDS})...`);
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
    const usersWithHash = seedUsersData.map(u => ({
      ...u,
      passwordHash,
      createdAt: new Date("2026-10-01T00:00:00Z"),
      lastLoginAt: null
    }));

    const usersColl = db.collection("users");
    await usersColl.deleteMany({});
    await usersColl.insertMany(usersWithHash);
    console.log(`* [users]: Seeded ${usersWithHash.length} authenticated users.`);

    // 4. Clear/init ephemeral collections
    await db.collection("notifications").deleteMany({});
    await db.collection("auditLog").deleteMany({});
    console.log(`* [notifications, auditLog]: Initialized clean.`);

    // 5. Create Core Indexes safely
    console.log(`* [indexes]: Building query performance and unique indexes...`);
    const safeCreateIndex = async (coll, spec, opts) => {
      try {
        await coll.createIndex(spec, opts);
      } catch (err) {
        if (!err.message.includes("already exists")) {
          console.warn(`  [Notice] Index ${JSON.stringify(spec)}: ${err.message}`);
        }
      }
    };

    await safeCreateIndex(usersColl, { phone: 1 }, { unique: true, name: "uniq_phone" });
    await safeCreateIndex(usersColl, { role: 1 }, { name: "idx_role" });
    await safeCreateIndex(usersColl, { linkedId: 1 }, { name: "idx_linkedId" });
    await safeCreateIndex(db.collection("waterPoints"), { location: "2dsphere" }, { name: "idx_wp_location" });
    await safeCreateIndex(reportsColl, { waterPointId: 1 }, { name: "idx_report_waterPointId" });
    await safeCreateIndex(reportsColl, { status: 1 }, { name: "idx_report_status" });
    await safeCreateIndex(reportsColl, { reportedAt: 1 }, { name: "idx_report_reportedAt" });
    await safeCreateIndex(reportsColl, { assignedTo: 1 }, { name: "idx_report_assignedTo" });
    await safeCreateIndex(db.collection("notifications"), { userId: 1, read: 1 }, { name: "idx_userId_read" });
    await safeCreateIndex(db.collection("auditLog"), { timestamp: -1 }, { name: "idx_audit_timestamp" });
    console.log(`* [indexes]: All indexes verified successfully.`);

    // 6. Verification
    const counts = {
      communities: await db.collection("communities").countDocuments(),
      waterPoints: await db.collection("waterPoints").countDocuments(),
      technicians: await db.collection("technicians").countDocuments(),
      reports:     await db.collection("reports").countDocuments(),
      users:       await db.collection("users").countDocuments()
    };

    console.log(`\n========================================================`);
    console.log(`CLOUD DATABASE INITIALIZATION COMPLETE!`);
    console.log(`- communities:   ${counts.communities} / 5`);
    console.log(`- waterPoints:   ${counts.waterPoints} / 6`);
    console.log(`- technicians:   ${counts.technicians} / 5`);
    console.log(`- reports:       ${counts.reports} / 5`);
    console.log(`- users:         ${counts.users} / 13`);
    console.log(`Universal Demo Password: ${DEMO_PASSWORD}`);
    console.log(`========================================================\n`);

    if (
      counts.communities === 5 &&
      counts.waterPoints === 6 &&
      counts.technicians === 5 &&
      counts.reports === 5 &&
      counts.users === 13
    ) {
      console.log(`[PASS] Cloud cluster is fully prepared and ready for production hosting!\n`);
    } else {
      console.error(`[FAIL] Verification mismatch in collection counts.`);
      process.exit(1);
    }
  } catch (err) {
    console.error("[Cloud Seed Error]", err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

seedCloud();
