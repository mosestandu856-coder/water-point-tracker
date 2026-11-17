// scripts/init_database.js
// Database initialization script for Community Water Point Tracker
// Run with: mongosh mongodb://localhost:27017/waterTracker scripts/init_database.js

const dbName = "waterTracker";
const targetDb = db.getSiblingDB(dbName);

print(`\n=== Initializing Database: ${dbName} ===`);

// Collections required for the assignment
const collections = ["communities", "waterPoints", "technicians", "reports"];

collections.forEach(colName => {
  const existing = targetDb.getCollectionNames();
  if (!existing.includes(colName)) {
    targetDb.createCollection(colName);
    print(`+ Created collection: ${colName}`);
  } else {
    print(`= Collection already exists: ${colName}`);
  }
});

print("\nInitialization complete. Ready for data import.");
