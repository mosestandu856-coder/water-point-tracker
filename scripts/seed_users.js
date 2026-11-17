// scripts/seed_users.js
// Seeds the 'users' collection linked directly to existing community contacts and technicians.
// Uses bcrypt (cost 12) for secure password hashing.
// Run with: node scripts/seed_users.js

const path = require("path");
process.env.NODE_PATH = path.join(__dirname, "../backend/node_modules");
require("module").Module._initPaths();

require("dotenv").config({ path: path.join(__dirname, "../backend/.env") });
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const dbName = process.env.DB_NAME || "waterTracker";

// Demo password for university local testing — overridable via env var
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "WaterTracker@2026";
const BCRYPT_ROUNDS = 12;

const seedUsersData = [
  // ── 1. Community Contacts (linked to com_01..com_05) ───────────────────────
  {
    _id: "user_01",
    name: "Hissen",
    phone: "0765 924 115",
    email: "hissen@bugema.ac.ug",
    role: "community",
    linkedId: "com_01", // Bugema
    active: true
  },
  {
    _id: "user_02",
    name: "Fahad",
    phone: "0700 000 102",
    email: "fahad@kalagala.org",
    role: "community",
    linkedId: "com_02", // Kalagala
    active: true
  },
  {
    _id: "user_03",
    name: "Solomon",
    phone: "0700 000 103",
    email: "solomon@health.go.ug",
    role: "community",
    linkedId: "com_03", // Ziroobwe
    active: true
  },
  {
    _id: "user_04",
    name: "Kitumba",
    phone: "0700 000 104",
    email: "kitumba@bamunanika.org",
    role: "community",
    linkedId: "com_04", // Bamunanika
    active: true
  },
  {
    _id: "user_05",
    name: "Ryder Kunar",
    phone: "0700 000 105",
    email: "ryder.kunar@schools.ug",
    role: "community",
    linkedId: "com_05", // Wobulenzi
    active: true
  },

  // ── 2. Technicians (linked to tech_01..tech_05) ────────────────────────────
  {
    _id: "user_06",
    name: "Moses Zach",
    phone: "0726 927 445",
    email: "moses.zach@watertech.ug",
    role: "technician",
    linkedId: "tech_01",
    active: true
  },
  {
    _id: "user_07",
    name: "Gatrude",
    phone: "0782 200 302",
    email: "gatrude@watertech.ug",
    role: "technician",
    linkedId: "tech_02",
    active: true
  },
  {
    _id: "user_08",
    name: "Joseph",
    phone: "0701 300 403",
    email: "joseph@watertech.ug",
    role: "technician",
    linkedId: "tech_03",
    active: true
  },
  {
    _id: "user_09",
    name: "Brian Erick",
    phone: "0752 400 504",
    email: "brian.erick@watertech.ug",
    role: "technician",
    linkedId: "tech_04",
    active: true
  },
  {
    _id: "user_10",
    name: "Dominic Lopir",
    phone: "0774 500 605",
    email: "dominic.lopir@watertech.ug",
    role: "technician",
    linkedId: "tech_05",
    active: true
  },

  // ── 3. Student Volunteer ───────────────────────────────────────────────────
  {
    _id: "user_11",
    name: "Zachariah",
    phone: "0765 924 114",
    email: "zachariah@bugema.ac.ug",
    role: "volunteer",
    linkedId: null,
    active: true
  },

  // ── 4. District Water Officer ──────────────────────────────────────────────
  {
    _id: "user_12",
    name: "Mohamed Abdi",
    phone: "0765 924 113",
    email: "mohamed.abdi@luweero.go.ug",
    role: "officer",
    linkedId: null,
    active: true
  },

  // ── 5. System Administrator ────────────────────────────────────────────────
  {
    _id: "user_13",
    name: "Moses Tandu",
    phone: "0726 986 218",
    email: "mosestandu856@gmail.com",
    role: "admin",
    linkedId: null,
    active: true
  }
];

async function seedUsers() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log(`[Seed Users] Connected to MongoDB (${dbName}) at ${uri}`);

    const db = client.db(dbName);
    const usersCollection = db.collection("users");

    console.log(`[Seed Users] Hashing passwords with bcrypt (cost: ${BCRYPT_ROUNDS})...`);
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
    const now = new Date();

    const preparedUsers = seedUsersData.map((u) => ({
      ...u,
      passwordHash,
      createdAt: now,
      lastLoginAt: null
    }));

    // Remove existing seed users to allow clean re-runs without duplicate key errors
    await usersCollection.deleteMany({
      _id: { $in: preparedUsers.map((u) => u._id) }
    });

    const result = await usersCollection.insertMany(preparedUsers);
    console.log(`[Seed Users] Successfully inserted ${result.insertedCount} users into 'users' collection.`);

    console.log("\n========================================================");
    console.log("DEMO ACCOUNTS READY (Local Testing / Viva Defense):");
    console.log(`Universal Demo Password: ${DEMO_PASSWORD}`);
    console.log("========================================================");
    console.table(
      preparedUsers.map((u) => ({
        ID: u._id,
        Name: u.name,
        Phone: u.phone,
        Role: u.role,
        LinkedEntity: u.linkedId || "(All / None)"
      }))
    );
    console.log("========================================================\n");
  } catch (err) {
    console.error("[Seed Users Error]", err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

seedUsers();

