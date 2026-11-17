// scripts/update_schema_for_admin_role.js
// Updates JSON Schema validation for the 'users' collection to include the 'admin' role.

const path = require("path");
process.env.NODE_PATH = path.join(__dirname, "../backend/node_modules");
require("module").Module._initPaths();
require("dotenv").config({ path: path.join(__dirname, "../backend/.env") });

const { connectDB, closeDB, getDB } = require("../backend/db");

async function run() {
  await connectDB();
  const db = getDB();

  await db.command({
    collMod: "users",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "name", "phone", "role", "passwordHash", "active", "createdAt"],
        properties: {
          _id: { bsonType: "string", description: "Must be a string ID (e.g., user_01)" },
          name: { bsonType: "string" },
          phone: { bsonType: "string", description: "Ugandan phone number used as unique login identifier" },
          email: { bsonType: ["string", "null"] },
          role: {
            enum: ["admin", "officer", "community", "technician", "volunteer"],
            description: "Role determines system permissions and dashboard view"
          },
          linkedId: {
            bsonType: ["string", "null"],
            description: "References communities._id for community role, technicians._id for technician role, null otherwise"
          },
          passwordHash: { bsonType: "string", description: "bcrypt hash (cost 12)" },
          active: { bsonType: "bool" },
          status: { bsonType: ["string", "null"] },
          createdAt: { bsonType: "date" },
          lastLoginAt: { bsonType: ["date", "null"] },
          approvedAt: { bsonType: ["date", "null"] },
          approvedBy: { bsonType: ["string", "null"] }
        }
      }
    },
    validationLevel: "moderate",
    validationAction: "error"
  });

  console.log("[OK] Schema validator for 'users' updated to allow 'admin' role.");
  await closeDB();
}

run().catch((e) => {
  console.error("Schema update error:", e);
  process.exit(1);
});

