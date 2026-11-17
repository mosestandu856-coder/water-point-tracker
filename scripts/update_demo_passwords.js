// scripts/update_demo_passwords.js
require("dotenv").config({ path: "backend/.env" });
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");

async function run() {
  const pwd = process.env.DEMO_PASSWORD;
  if (!pwd) throw new Error("No DEMO_PASSWORD found in backend/.env");
  const hash = await bcrypt.hash(pwd, 12);
  const client = new MongoClient("mongodb://localhost:27017");
  await client.connect();
  const db = client.db("waterTracker");
  const seedIds = ["user_01","user_02","user_03","user_04","user_05","user_06","user_07","user_08","user_09","user_10","user_11","user_12"];
  const res = await db.collection("users").updateMany(
    { _id: { $in: seedIds } },
    { $set: { passwordHash: hash } }
  );
  console.log("Updated passwords for count:", res.modifiedCount);
  await client.close();
}

run().catch(console.error);

