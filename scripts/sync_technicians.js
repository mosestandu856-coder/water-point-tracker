// scripts/sync_technicians.js
const path = require("path");
process.env.NODE_PATH = path.join(__dirname, "../backend/node_modules");
require("module").Module._initPaths();

const { MongoClient } = require("mongodb");
const technicians = require("../data/technicians.json");

async function sync() {
  const client = new MongoClient("mongodb://localhost:27017");
  try {
    await client.connect();
    const db = client.db("waterTracker");
    for (const tech of technicians) {
      await db.collection("technicians").updateOne(
        { _id: tech._id },
        { $set: { name: tech.name, phone: tech.phone } }
      );
    }
    const list = await db.collection("technicians").find({}).toArray();
    console.log("Updated technicians in MongoDB:");
    console.table(list.map(t => ({ id: t._id, name: t.name, phone: t.phone })));
  } finally {
    await client.close();
  }
}

sync().catch(console.error);

