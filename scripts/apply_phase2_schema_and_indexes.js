// scripts/apply_phase2_schema_and_indexes.js
// Applies JSON Schema validation and indexes for users, notifications, auditLog,
// and updates reports schema to support 'in_progress' and 'statusHistory'.
//
// Usage: mongosh mongodb://localhost:27017/waterTracker scripts/apply_phase2_schema_and_indexes.js

const targetDb = db.getSiblingDB("waterTracker");

print("\n========================================================");
print("PHASE 2: Applying Schemas & Indexes for RBAC Architecture");
print("========================================================");

// 1. Ensure new collections exist before applying validators
const existingColls = targetDb.getCollectionNames();
["users", "notifications", "auditLog"].forEach((name) => {
  if (!existingColls.includes(name)) {
    targetDb.createCollection(name);
    print(`+ Created collection: ${name}`);
  }
});

// 2. Schema validation for 'users'
targetDb.runCommand({
  collMod: "users",
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "name", "phone", "role", "passwordHash", "active", "createdAt"],
      properties: {
        _id: { bsonType: "string", description: "Must be a string ID (e.g., user_01)" },
        name: { bsonType: "string" },
        phone: { bsonType: "string", description: "Ugandan phone number used as unique login identifier" },
        email: { bsonType: ["string", "null"] },
        role: {
          enum: ["admin", "officer", "community", "technician", "volunteer"],
          description: "Role determines system permissions and dashboard view"
        },
        linkedId: {
          bsonType: ["string", "null"],
          description: "References communities._id for community role, technicians._id for technician role, null otherwise"
        },
        passwordHash: { bsonType: "string", description: "bcrypt hash (cost 12)" },
        active: { bsonType: "bool" },
        createdAt: { bsonType: "date" },
        lastLoginAt: { bsonType: ["date", "null"] }
      }
    }
  },
  validationLevel: "moderate",
  validationAction: "error"
});
print("[OK] Schema validation applied to: users");

// 3. Schema validation for 'notifications'
targetDb.runCommand({
  collMod: "notifications",
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "userId", "type", "message", "read", "createdAt"],
      properties: {
        _id: { bsonType: "string" },
        userId: { bsonType: "string", description: "Target recipient user ID" },
        type: {
          enum: ["report_filed", "report_assigned", "work_started", "repair_resolved", "reassigned", "system_alert"],
          description: "Notification classification"
        },
        message: { bsonType: "string" },
        reportId: { bsonType: ["string", "null"] },
        read: { bsonType: "bool" },
        createdAt: { bsonType: "date" }
      }
    }
  },
  validationLevel: "moderate",
  validationAction: "error"
});
print("[OK] Schema validation applied to: notifications");

// 4. Schema validation for 'auditLog'
targetDb.runCommand({
  collMod: "auditLog",
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "userId", "action", "entity", "entityId", "at"],
      properties: {
        _id: { bsonType: "string" },
        userId: { bsonType: "string" },
        action: { bsonType: "string" },
        entity: { bsonType: "string" },
        entityId: { bsonType: "string" },
        at: { bsonType: "date" },
        details: { bsonType: ["object", "null"] }
      }
    }
  },
  validationLevel: "moderate",
  validationAction: "error"
});
print("[OK] Schema validation applied to: auditLog");

// 5. Update reports schema validation to include 'in_progress' status
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
          enum: ["open", "assigned", "in_progress", "resolved"],
          description: "Supports additive in_progress status while keeping existing reports valid"
        },
        assignedTo: {
          bsonType: ["string", "null"]
        },
        resolvedAt: {
          bsonType: ["date", "null"]
        },
        costUGX: { bsonType: ["int", "double", "long"], minimum: 0 },
        notes: { bsonType: "string" },
        statusHistory: {
          bsonType: "array",
          items: {
            bsonType: "object",
            required: ["status", "at"],
            properties: {
              status: { enum: ["open", "assigned", "in_progress", "resolved"] },
              at: { bsonType: "date" },
              byUserId: { bsonType: "string" },
              note: { bsonType: "string" }
            }
          }
        }
      }
    }
  },
  validationLevel: "moderate",
  validationAction: "error"
});
print("[OK] Updated schema validation applied to: reports (with in_progress support)");

// 6. Create Indexes
print("\n--- Applying Indexes ---");
// Users: unique phone login, role filter, linkedId lookup
targetDb.users.createIndex({ phone: 1 }, { unique: true, name: "uniq_phone" });
targetDb.users.createIndex({ role: 1 }, { name: "idx_role" });
targetDb.users.createIndex({ linkedId: 1 }, { name: "idx_linkedId" });
print("+ Created users indexes: { phone: 1 } (unique), { role: 1 }, { linkedId: 1 }");

// Notifications: fast query for unread bell counts per user, sorting by time
targetDb.notifications.createIndex({ userId: 1, read: 1 }, { name: "idx_userId_read" });
targetDb.notifications.createIndex({ createdAt: -1 }, { name: "idx_createdAt" });
print("+ Created notifications indexes: { userId: 1, read: 1 }, { createdAt: -1 }");

// AuditLog: officer audit review, event tracing by entity
targetDb.auditLog.createIndex({ at: -1 }, { name: "idx_at" });
targetDb.auditLog.createIndex({ userId: 1 }, { name: "idx_userId" });
targetDb.auditLog.createIndex({ entity: 1, entityId: 1 }, { name: "idx_entity_lookup" });
print("+ Created auditLog indexes: { at: -1 }, { userId: 1 }, { entity: 1, entityId: 1 }");

// Reports: technician job query compound index
targetDb.reports.createIndex({ assignedTo: 1, status: 1 }, { name: "idx_assignedTo_status" });
print("+ Created reports index: { assignedTo: 1, status: 1 } (for 'My Jobs' dashboard)");

print("\n========================================================");
print("Phase 2 Schemas and Indexes Successfully Applied!");
print("========================================================\n");

