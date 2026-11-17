const path = require("path");
process.env.NODE_PATH = path.join(__dirname, "../backend/node_modules");
require("module").Module._initPaths();
require("dotenv").config({ path: path.join(__dirname, "../backend/.env") });
const { MongoClient } = require("mongodb");

async function clean() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("waterTracker");

  const validIds = [
    "user_01", "user_02", "user_03", "user_04", "user_05",
    "user_06", "user_07", "user_08", "user_09", "user_10",
    "user_11", "user_12", "user_13"
  ];

  const del = await db.collection("users").deleteMany({ _id: { $nin: validIds } });
  console.log("Deleted extraneous users:", del.deletedCount);
  const count = await db.collection("users").countDocuments();
  console.log("Users count in DB is now exactly:", count);
  await client.close();
}

clean().catch(console.error);

