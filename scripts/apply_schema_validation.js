// scripts/apply_schema_validation.js
// Applies JSON Schema validation to all 4 collections in waterTracker.
// Run with: mongosh mongodb://localhost:27017/waterTracker scripts/apply_schema_validation.js

const targetDb = db.getSiblingDB("waterTracker");

print("\n=== Applying JSON Schema Validation to waterTracker Collections ===");

// 1. communities validation
targetDb.runCommand({
  collMod: "communities",
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "name", "district", "households", "population", "contact"],
      properties: {
        _id: { bsonType: "string", description: "Must be a string identifier (e.g., com_01)" },
        name: { bsonType: "string" },
        district: { bsonType: "string" },
        households: { bsonType: ["int", "double", "long"], minimum: 1 },
        population: { bsonType: ["int", "double", "long"], minimum: 1 },
        contact: {
          bsonType: "object",
          required: ["name", "phone"],
          properties: {
            name: { bsonType: "string" },
            role: { bsonType: "string" },
            phone: { bsonType: "string" }
          }
        },
        universityLink: { bsonType: "string" }
      }
    }
  },
  validationLevel: "moderate",
  validationAction: "error"
});
print("[OK] Schema validation applied to: communities");

// 2. waterPoints validation
targetDb.runCommand({
  collMod: "waterPoints",
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "communityId", "type", "landmark", "installedYear", "householdsServed", "status"],
      properties: {
        _id: { bsonType: "string" },
        communityId: { bsonType: "string" },
        type: {
          enum: ["borehole", "protected_spring", "shallow_well", "tap_stand"],
          description: "Must be one of the 4 approved water point types"
        },
        landmark: { bsonType: "string" },
        installedYear: { bsonType: ["int", "double", "long"], minimum: 1950, maximum: 2030 },
        householdsServed: { bsonType: ["int", "double", "long"], minimum: 0 },
        status: {
          enum: ["working", "broken", "low_yield"],
          description: "Must be working, broken, or low_yield"
        },
        lastServiced: {
          bsonType: ["date", "null"],
          description: "Date of last service or null if unserviced"
        },
        managedBy: { bsonType: "string" },
        location: {
          bsonType: "object",
          required: ["type", "coordinates"],
          properties: {
            type: { enum: ["Point"] },
            coordinates: {
              bsonType: "array",
              minItems: 2,
              maxItems: 2,
              items: { bsonType: ["double", "int"] }
            }
          }
        }
      }
    }
  },
  validationLevel: "moderate",
  validationAction: "error"
});
print("[OK] Schema validation applied to: waterPoints");

// 3. technicians validation
targetDb.runCommand({
  collMod: "technicians",
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "name", "phone", "skills", "coversCommunities", "available"],
      properties: {
        _id: { bsonType: "string" },
        name: { bsonType: "string" },
        phone: { bsonType: "string" },
        skills: {
          bsonType: "array",
          minItems: 1,
          items: { bsonType: "string" }
        },
        coversCommunities: {
          bsonType: "array",
          items: { bsonType: "string" }
        },
        available: { bsonType: "bool" },
        hasOwnToolkit: { bsonType: "bool" },
        baseLocation: {
          bsonType: "object",
          required: ["type", "coordinates"],
          properties: {
            type: { enum: ["Point"] },
            coordinates: {
              bsonType: "array",
              minItems: 2,
              maxItems: 2,
              items: { bsonType: ["double", "int"] }
            }
          }
        }
      }
    }
  },
  validationLevel: "moderate",
  validationAction: "error"
});
print("[OK] Schema validation applied to: technicians");

// 4. reports validation
targetDb.runCommand({
  collMod: "reports",
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "waterPointId", "reportedBy", "reportedAt", "problem", "severity", "status"],
      properties: {
        _id: { bsonType: "string" },
        waterPointId: { bsonType: "string" },
        reportedBy: {
          bsonType: "object",
          required: ["name", "phone"],
          properties: {
            name: { bsonType: "string" },
            role: { bsonType: "string" },
            phone: { bsonType: "string" }
          }
        },
        reportedAt: { bsonType: "date" },
        problem: { bsonType: "string" },
        severity: {
          enum: ["low", "medium", "high"],
          description: "Must be low, medium, or high"
        },
        status: {
          enum: ["open", "assigned", "resolved"],
          description: "Must be open, assigned, or resolved"
        },
        assignedTo: {
          bsonType: ["string", "null"],
          description: "Technician ID or null if unassigned"
        },
        resolvedAt: {
          bsonType: ["date", "null"],
          description: "Date resolved or null if unresolved"
        },
        costUGX: { bsonType: ["int", "double", "long"], minimum: 0 },
        notes: { bsonType: "string" },
        statusHistory: {
          bsonType: "array",
          items: {
            bsonType: "object",
            required: ["status", "at", "by"],
            properties: {
              status: { enum: ["open", "assigned", "resolved"] },
              at: { bsonType: "date" },
              by: { bsonType: "string" }
            }
          }
        }
      }
    }
  },
  validationLevel: "moderate",
  validationAction: "error"
});
print("[OK] Schema validation applied to: reports");

print("\n=== Testing Schema Validation Enforcement ===");
// Negative test: attempt to insert an invalid report (severity 'critical' not in enum)
try {
  targetDb.reports.insertOne({
    _id: "rpt_invalid_test",
    waterPointId: "wp_01",
    reportedBy: { name: "Test User", phone: "0700 000 999" },
    reportedAt: new Date(),
    problem: "Test invalid severity",
    severity: "critical", // INVALID: only low, medium, high allowed
    status: "open",
    assignedTo: null,
    resolvedAt: null
  });
  print("[FAIL] Validation failed to reject invalid severity!");
} catch (err) {
  print("[PASS] Schema validation successfully rejected document with invalid enum value 'critical'.");
}

print("\nAll validation rules applied and verified.\n");
