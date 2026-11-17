// scripts/fix_notifications_schema.js
// Extends the notifications collection validator to allow PENDING_REGISTRATION type.
// Run once: node scripts/fix_notifications_schema.js

const path = require("path");
process.env.NODE_PATH = path.join(__dirname, "../backend/node_modules");
require("module").Module._initPaths();
require("dotenv").config({ path: path.join(__dirname, "../backend/.env") });

const { connectDB, closeDB, getDB } = require("../backend/db");

async function run() {
  await connectDB();
  const db = getDB();

  await db.command({
    collMod: "notifications",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "userId", "type", "message", "read", "createdAt"],
        properties: {
          _id:     { bsonType: "string" },
          userId:  { bsonType: "string", description: "Target recipient user ID" },
          type: {
            // Added PENDING_REGISTRATION and ACCOUNT_LOCKED to support admin workflows (A6, D5)
            enum: [
              "report_filed",
              "report_assigned",
              "work_started",
              "repair_resolved",
              "reassigned",
              "system_alert",
              "PENDING_REGISTRATION",
              "ACCOUNT_LOCKED"
            ],
            description: "Notification classification"
          },
          message:   { bsonType: "string" },
          reportId:  { bsonType: ["string", "null"] },
          relatedId: { bsonType: ["string", "null"] }, // links notification to a user for approvals
          read:      { bsonType: "bool" },
          createdAt: { bsonType: "date" }
        }
      }
    },
    validationLevel: "moderate"
  });

  console.log("[OK] notifications validator updated — PENDING_REGISTRATION type now allowed");
  console.log("[OK] relatedId field added to schema");
  await closeDB();
}

run().catch((e) => { console.error(e); process.exit(1); });

