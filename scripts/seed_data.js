// scripts/seed_data.js
// Loads the 4 exact seed JSON files into waterTracker database
// using MongoDB Extended JSON so $date becomes real ISODate.
// Run with: mongosh mongodb://localhost:27017/waterTracker scripts/seed_data.js

const fs = require("fs");
const path = require("path");

const targetDb = db.getSiblingDB("waterTracker");

const datasets = [
  { name: "communities", file: "data/communities.json", expectedCount: 5 },
  { name: "waterPoints", file: "data/waterPoints.json", expectedCount: 6 },
  { name: "technicians", file: "data/technicians.json", expectedCount: 5 },
  { name: "reports", file: "data/reports.json", expectedCount: 5 }
];

print("\n=== Seeding waterTracker Database from JSON Files ===");

datasets.forEach(d => {
  const filePath = path.resolve(d.file);
  const rawData = fs.readFileSync(filePath, "utf-8");
  const parsedDocs = EJSON.parse(rawData);

  // Clean collection before seeding
  targetDb.getCollection(d.name).deleteMany({});

  const result = targetDb.getCollection(d.name).insertMany(parsedDocs);
  const count = targetDb.getCollection(d.name).countDocuments();
  print(`* Collection [${d.name}]: Inserted ${Object.keys(result.insertedIds).length} documents (Count: ${count} / Expected: ${d.expectedCount})`);
});

print("\n=== Seeding Completed Successfully ===");
