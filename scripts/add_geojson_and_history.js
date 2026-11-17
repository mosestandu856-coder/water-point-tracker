// scripts/add_geojson_and_history.js
// Enriches existing documents with:
// 1. Illustrative GeoJSON Point coordinates for waterPoints (location) and technicians (baseLocation)
// 2. Audit trail statusHistory array for reports
// 3. Demonstrates geospatial queries ($near and $geoNear) for nearest available technician
// Run with: mongosh mongodb://localhost:27017/waterTracker scripts/add_geojson_and_history.js

const targetDb = db.getSiblingDB("waterTracker");

print("\n=== Adding Illustrative GeoJSON Coordinates & Audit History ===");

// 1. Water points illustrative coordinates (Luweero District / Bugema area)
// Note: GeoJSON coordinates are in [longitude, latitude] format.
const wpLocations = {
  wp_01: [32.6410, 0.5720], // Bugema (near university main gate)
  wp_02: [32.6120, 0.6110], // Kalagala (behind central market)
  wp_03: [32.5320, 0.7210], // Wobulenzi (below the church)
  wp_04: [32.7210, 0.6910], // Ziroobwe (near health centre)
  wp_05: [32.7230, 0.6930], // Ziroobwe (near central market)
  wp_06: [32.6110, 0.7020]  // Bamunanika (next to primary school)
};

Object.entries(wpLocations).forEach(([id, coords]) => {
  targetDb.waterPoints.updateOne(
    { _id: id },
    { $set: { location: { type: "Point", coordinates: coords } } }
  );
});
print("[OK] Added illustrative GeoJSON location to all 6 water points.");

// 2. Technicians illustrative base locations
const techLocations = {
  tech_01: [32.6130, 0.6120], // Ibrahim Kalule (Kalagala base)
  tech_02: [32.7200, 0.6900], // Joyce Auma (Ziroobwe base)
  tech_03: [32.6100, 0.7000], // Charles Opio (Bamunanika base)
  tech_04: [32.6150, 0.6150], // Mariam Nabirye (Central Luweero / Kalagala base)
  tech_05: [32.6400, 0.5700]  // Robert Byaruhanga (Bugema base)
};

Object.entries(techLocations).forEach(([id, coords]) => {
  targetDb.technicians.updateOne(
    { _id: id },
    { $set: { baseLocation: { type: "Point", coordinates: coords } } }
  );
});
print("[OK] Added illustrative GeoJSON baseLocation to all 5 technicians.");

// 3. Reports statusHistory audit logs
const historyLogs = {
  rpt_001: [
    { status: "open", at: new Date("2026-10-09T07:15:00Z"), by: "Peter Ssemwogerere (Community Reporter)" },
    { status: "assigned", at: new Date("2026-10-09T08:30:00Z"), by: "Kalagala Water Desk Dispatcher" }
  ],
  rpt_002: [
    { status: "open", at: new Date("2026-10-05T16:40:00Z"), by: "Agnes Atim (Health Volunteer)" }
  ],
  rpt_003: [
    { status: "open", at: new Date("2026-10-11T06:30:00Z"), by: "Brian Mugabi (Student Volunteer)" }
  ],
  rpt_004: [
    { status: "open", at: new Date("2026-06-18T08:00:00Z"), by: "Rose Namutebi (School Head Teacher)" },
    { status: "assigned", at: new Date("2026-06-18T10:00:00Z"), by: "Wobulenzi Sub-county Desk" },
    { status: "resolved", at: new Date("2026-06-20T14:00:00Z"), by: "Joyce Auma (Technician)" }
  ],
  rpt_005: [
    { status: "open", at: new Date("2026-09-03T09:10:00Z"), by: "Moses Kiggundu (LC Chairperson)" },
    { status: "assigned", at: new Date("2026-09-03T11:00:00Z"), by: "Bamunanika Sub-county Desk" },
    { status: "resolved", at: new Date("2026-09-05T11:30:00Z"), by: "Mariam Nabirye (Technician)" }
  ]
};

Object.entries(historyLogs).forEach(([id, history]) => {
  targetDb.reports.updateOne(
    { _id: id },
    { $set: { statusHistory: history } }
  );
});
print("[OK] Added statusHistory lifecycle audit trails to all 5 reports.");

// 4. Geospatial Query Demonstration: Find Nearest Available Technician to Broken wp_02
print("\n=================================================================");
print("GEOSPATIAL QUERY: Find Nearest Available Technician to wp_02");
print("Broken point wp_02 (Kalagala Central Market): [32.6120, 0.6110]");
print("=================================================================");

const nearestTechs = targetDb.technicians.find({
  available: true,
  baseLocation: {
    $near: {
      $geometry: {
        type: "Point",
        coordinates: [32.6120, 0.6110]
      },
      $maxDistance: 25000 // within 25 kilometers
    }
  }
}).toArray();

print("\n--- Nearest Available Technicians (ordered by proximity via $near) ---");
nearestTechs.forEach((t, idx) => {
  print(`${idx + 1}. ${t.name} (${t._id}) | Skills: [${t.skills.join(", ")}] | Base: [${t.baseLocation.coordinates}]`);
});

// 5. Precise Distance Calculation using $geoNear Aggregation
print("\n--- Distance Calculation in Meters via $geoNear Aggregation ---");
const geoNearResult = targetDb.technicians.aggregate([
  {
    $geoNear: {
      near: { type: "Point", coordinates: [32.6120, 0.6110] },
      distanceField: "distanceMeters",
      query: { available: true },
      spherical: true
    }
  },
  {
    $project: {
      _id: 1,
      name: 1,
      skills: 1,
      distanceKm: { $round: [{ $divide: ["$distanceMeters", 1000] }, 2] }
    }
  }
]).toArray();

printjson(geoNearResult);
print("\nGeospatial enhancements completed successfully.\n");
