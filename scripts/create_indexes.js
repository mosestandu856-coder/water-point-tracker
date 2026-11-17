// scripts/create_indexes.js
// Creates compound, multikey, and 2dsphere geospatial indexes across collections
// Run with: mongosh mongodb://localhost:27017/waterTracker scripts/create_indexes.js

const targetDb = db.getSiblingDB("waterTracker");

print("\n=== Creating Indexes in waterTracker Database ===");

// 1. waterPoints indexes
print("\n--- waterPoints Indexes ---");
targetDb.waterPoints.createIndex({ status: 1 }, { name: "idx_status" });
print("+ Created single-field index: { status: 1 }");

targetDb.waterPoints.createIndex({ communityId: 1, status: 1 }, { name: "idx_community_status" });
print("+ Created compound index: { communityId: 1, status: 1 }");

targetDb.waterPoints.createIndex({ location: "2dsphere" }, { name: "idx_location_2dsphere", sparse: true });
print("+ Created 2dsphere geospatial index: { location: '2dsphere' }");

// 2. reports indexes
print("\n--- reports Indexes ---");
targetDb.reports.createIndex({ status: 1, reportedAt: 1 }, { name: "idx_status_reportedAt" });
print("+ Created compound index: { status: 1, reportedAt: 1 } (FIFO queue optimization)");

targetDb.reports.createIndex({ waterPointId: 1, reportedAt: -1 }, { name: "idx_waterPoint_reportedAt" });
print("+ Created compound index: { waterPointId: 1, reportedAt: -1 } (Repair history lookup)");

// 3. technicians indexes
print("\n--- technicians Indexes ---");
targetDb.technicians.createIndex({ coversCommunities: 1, available: 1 }, { name: "idx_covers_available" });
print("+ Created multikey compound index: { coversCommunities: 1, available: 1 }");

targetDb.technicians.createIndex({ skills: 1 }, { name: "idx_skills" });
print("+ Created multikey index: { skills: 1 }");

targetDb.technicians.createIndex({ baseLocation: "2dsphere" }, { name: "idx_baseLocation_2dsphere", sparse: true });
print("+ Created 2dsphere geospatial index: { baseLocation: '2dsphere' }");

print("\n=== Current Collection Indexes Summary ===");
print("\nwaterPoints indexes:");
printjson(targetDb.waterPoints.getIndexes().map(i => ({ name: i.name, key: i.key })));

print("\nreports indexes:");
printjson(targetDb.reports.getIndexes().map(i => ({ name: i.name, key: i.key })));

print("\ntechnicians indexes:");
printjson(targetDb.technicians.getIndexes().map(i => ({ name: i.name, key: i.key })));

print("\nAll indexes successfully created and verified.\n");
