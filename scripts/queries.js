// scripts/queries.js
// Runs the 4 read queries (Queries 1, 2, 3, 5) against waterTracker
// Run with: mongosh mongodb://localhost:27017/waterTracker scripts/queries.js

const targetDb = db.getSiblingDB("waterTracker");

print("\n=======================================================");
print("QUERY 1: Broken Water Points");
print("MongoDB: db.waterPoints.find({ status: 'broken' })");
print("Expected: wp_02, wp_05");
print("=======================================================");
const q1 = targetDb.waterPoints.find({ status: "broken" }).toArray();
printjson(q1);

print("\n=======================================================");
print("QUERY 2: Free Technicians in Kalagala (com_02)");
print("MongoDB: db.technicians.find({ coversCommunities: 'com_02', available: true })");
print("Expected: tech_01, tech_04");
print("=======================================================");
const q2 = targetDb.technicians.find({ coversCommunities: "com_02", available: true }).toArray();
printjson(q2);

print("\n=======================================================");
print("QUERY 3: Open Reports Needing a Technician (Oldest First)");
print("MongoDB: db.reports.find({ status: 'open' }).sort({ reportedAt: 1 })");
print("Expected: rpt_002, then rpt_003");
print("=======================================================");
const q3 = targetDb.reports.find({ status: "open" }).sort({ reportedAt: 1 }).toArray();
printjson(q3);

print("\n=======================================================");
print("QUERY 5: Broken Water Points Per Community (Aggregation)");
print("MongoDB: db.waterPoints.aggregate([{ $match: { status: 'broken' } }, { $group: { _id: '$communityId', brokenCount: { $sum: 1 } } }, { $sort: { _id: 1 } }])");
print("Expected: com_02: 1, com_03: 1");
print("=======================================================");
const q5 = targetDb.waterPoints.aggregate([
  { $match: { status: "broken" } },
  { $group: { _id: "$communityId", brokenCount: { $sum: 1 } } },
  { $sort: { _id: 1 } }
]).toArray();
printjson(q5);

print("\n=== All Read Queries Executed Successfully ===\n");
