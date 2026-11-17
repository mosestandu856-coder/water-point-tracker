// scripts/restore_pristine_seed.js
const path = require("path");
const backendDir = path.join(__dirname, "../backend");
process.env.NODE_PATH = path.join(backendDir, "node_modules");
require("module").Module._initPaths();

const { connectDB, closeDB, getDB } = require("../backend/db");
const fs = require("fs");

async function restore() {
  await connectDB();
  const db = getDB();

  // Reset rpt_002
  await db.collection("reports").updateOne(
    { _id: "rpt_002" },
    { $set: { status: "open", assignedTo: null } }
  );

  console.log("rpt_002 restored to open.");
  await closeDB();
}

restore();

