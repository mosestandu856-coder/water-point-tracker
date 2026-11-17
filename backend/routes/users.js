// backend/routes/users.js
// User management endpoints strictly for System Administrators.
// Allows administrators to list accounts, create new accounts, toggle active status,
// change roles, reset passwords, and approve/reject self-registered users.

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { getDB } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { logAudit } = require("../utils/auditLogger");

/**
 * GET /api/users
 * Returns list of user accounts (strips passwordHash).
 * Strictly restricted to administrators.
 */
router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const db = getDB();
    const users = await db
      .collection("users")
      .find({})
      .project({ passwordHash: 0 })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to list users: " + err.message });
  }
});

/**
 * POST /api/users
 * Create a new user account.
 * Body: { name, phone, role, linkedId, email, password }
 * Strictly restricted to administrators.
 */
/**
 * POST /api/users
 * Create a new user account directly by an administrator.
 * Body: { name, phone, role, linkedId?, email?, password? }
 * Supports generating a one-time temporary password with mustChangePassword = true (C7, D4).
 */
router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { name, phone, role, linkedId, email } = req.body;
    let { password } = req.body;

    if (!name || !phone || !role) {
      return res.status(400).json({ error: "Name, phone, and role are required." });
    }

    const allowedRoles = ["admin", "officer", "community", "technician", "volunteer"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${allowedRoles.join(", ")}` });
    }

    const db = getDB();
    const cleanPhone = String(phone).trim();
    const existing = await db.collection("users").findOne({ phone: cleanPhone });
    if (existing) {
      return res.status(409).json({ error: "A user with this phone number already exists." });
    }

    // Role-specific unlinked asset validation (C7, C8)
    let assignedLinkedId = null;
    if (role === "community") {
      if (!linkedId) {
        return res.status(400).json({ error: "Community role requires choosing a valid settlement." });
      }
      const commExists = await db.collection("communities").findOne({ _id: linkedId });
      if (!commExists) {
        return res.status(400).json({ error: "Selected community does not exist." });
      }
      const commLinked = await db.collection("users").findOne({ role: "community", linkedId, active: true });
      if (commLinked) {
        return res.status(400).json({ error: `Community '${commExists.name}' is already linked to active user ${commLinked.name}.` });
      }
      assignedLinkedId = linkedId;
    } else if (role === "technician") {
      if (!linkedId) {
        return res.status(400).json({ error: "Technician role requires choosing a technician profile." });
      }
      const techExists = await db.collection("technicians").findOne({ _id: linkedId });
      if (!techExists) {
        return res.status(400).json({ error: "Selected technician profile does not exist." });
      }
      const techLinked = await db.collection("users").findOne({ role: "technician", linkedId, active: true });
      if (techLinked) {
        return res.status(400).json({ error: `Technician '${techExists.name}' is already linked to active user ${techLinked.name}.` });
      }
      assignedLinkedId = linkedId;
    }

    // Generate a secure one-time temporary password if not provided
    const tempPassword = password && String(password).length >= 6
      ? String(password)
      : `Temp-${Math.random().toString(36).slice(-6)}!`;

    const count = await db.collection("users").countDocuments();
    const nextId = `user_${String(count + 1).padStart(2, "0")}`;
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const newUser = {
      _id: nextId,
      name: String(name).trim(),
      phone: cleanPhone,
      email: email ? String(email).trim() : null,
      role,
      linkedId: assignedLinkedId,
      passwordHash,
      active: true,
      status: "active",
      mustChangePassword: true,
      createdAt: new Date(),
      lastLoginAt: null
    };

    await db.collection("users").insertOne(newUser);

    await logAudit({
      userId: req.user._id,
      action: "USER_CREATED",
      entity: "users",
      entityId: nextId,
      details: { role, linkedId: assignedLinkedId, name: newUser.name }
    });

    const { passwordHash: _, ...sanitized } = newUser;
    res.status(201).json({
      message: "User successfully created.",
      user: sanitized,
      temporaryPassword: tempPassword
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to create user: " + err.message });
  }
});

/**
 * PATCH /api/users/:id/status
 * Activate or deactivate an account.
 * Body: { active: boolean, reason?: string }
 * Strictly restricted to administrators.
 * Safeguards:
 *  - Admin cannot deactivate themselves (D1).
 *  - At least one active admin must exist at all times (D2).
 */
router.patch("/:id/status", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { active, reason } = req.body;
    if (typeof active !== "boolean") {
      return res.status(400).json({ error: "Field 'active' must be a boolean." });
    }

    // Safeguard 1: Admin cannot disable their own account (D1)
    if (req.params.id === req.user._id && !active) {
      return res.status(400).json({ error: "You cannot disable your own administrator account." });
    }

    const db = getDB();
    const target = await db.collection("users").findOne({ _id: req.params.id });
    if (!target) {
      return res.status(404).json({ error: "User not found." });
    }

    // Safeguard 2: Require at least one active admin at all times (D2)
    if (target.role === "admin" && !active) {
      const activeAdminCount = await db.collection("users").countDocuments({ role: "admin", active: true });
      if (activeAdminCount <= 1) {
        return res.status(400).json({
          error: "Cannot disable the last active administrator. At least one active admin must exist at all times."
        });
      }
    }

    await db.collection("users").updateOne(
      { _id: req.params.id },
      { $set: { active } }
    );

    await logAudit({
      userId: req.user._id,
      action: active ? "USER_ENABLED" : "USER_DISABLED",
      entity: "users",
      entityId: req.params.id,
      details: {
        active,
        targetRole: target.role,
        targetName: target.name,
        reason: reason ? String(reason).trim() : (active ? "Re-activated by admin" : "Disabled by admin")
      }
    });

    res.json({ message: `User account ${active ? "activated" : "deactivated"} successfully.` });
  } catch (err) {
    res.status(500).json({ error: "Failed to update user status: " + err.message });
  }
});

/**
 * PATCH /api/users/:id/role
 * Change a user's role with unlinked asset validation (C8).
 * Body: { role: string, linkedId?: string, reason?: string }
 * Strictly restricted to administrators.
 * Safeguards:
 *  - Admin cannot demote themselves from admin (D1).
 *  - Cannot demote the last active administrator (D2).
 */
router.patch("/:id/role", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { role, linkedId, reason } = req.body;
    const allowedRoles = ["admin", "officer", "community", "technician", "volunteer"];

    if (!role || !allowedRoles.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${allowedRoles.join(", ")}` });
    }

    // Safeguard 1: Admin cannot demote themselves (D1)
    if (req.params.id === req.user._id && role !== "admin") {
      return res.status(400).json({ error: "You cannot demote your own administrator account." });
    }

    const db = getDB();
    const target = await db.collection("users").findOne({ _id: req.params.id });
    if (!target) {
      return res.status(404).json({ error: "User not found." });
    }

    // Safeguard 2: Cannot demote the last active admin (D2)
    if (target.role === "admin" && role !== "admin") {
      const activeAdminCount = await db.collection("users").countDocuments({ role: "admin", active: true });
      if (activeAdminCount <= 1) {
        return res.status(400).json({
          error: "Cannot demote the last active administrator. At least one active admin must exist at all times."
        });
      }
    }

    // Unlinked asset validation (C8)
    let assignedLinkedId = null;
    if (role === "community") {
      if (!linkedId) {
        return res.status(400).json({ error: "Changing role to Community requires selecting an unlinked settlement." });
      }
      const commExists = await db.collection("communities").findOne({ _id: linkedId });
      if (!commExists) {
        return res.status(400).json({ error: "Selected community does not exist." });
      }
      const commLinked = await db.collection("users").findOne({
        _id: { $ne: req.params.id },
        role: "community",
        linkedId,
        active: true
      });
      if (commLinked) {
        return res.status(400).json({ error: `Community '${commExists.name}' is already linked to active user ${commLinked.name}.` });
      }
      assignedLinkedId = linkedId;
    } else if (role === "technician") {
      if (!linkedId) {
        return res.status(400).json({ error: "Changing role to Technician requires selecting an unlinked technician profile." });
      }
      const techExists = await db.collection("technicians").findOne({ _id: linkedId });
      if (!techExists) {
        return res.status(400).json({ error: "Selected technician profile does not exist." });
      }
      const techLinked = await db.collection("users").findOne({
        _id: { $ne: req.params.id },
        role: "technician",
        linkedId,
        active: true
      });
      if (techLinked) {
        return res.status(400).json({ error: `Technician '${techExists.name}' is already linked to active user ${techLinked.name}.` });
      }
      assignedLinkedId = linkedId;
    }

    await db.collection("users").updateOne(
      { _id: req.params.id },
      { $set: { role, linkedId: assignedLinkedId } }
    );

    await logAudit({
      userId: req.user._id,
      action: "USER_ROLE_CHANGED",
      entity: "users",
      entityId: req.params.id,
      details: {
        previousRole: target.role,
        newRole: role,
        linkedId: assignedLinkedId,
        targetName: target.name,
        reason: reason ? String(reason).trim() : "Role updated by administrator"
      }
    });

    res.json({ message: `User role updated to '${role}' successfully.` });
  } catch (err) {
    res.status(500).json({ error: "Failed to update user role: " + err.message });
  }
});

/**
 * PATCH /api/users/:id/reset-password
 * Reset a user's password to a one-time temporary password (D1, D4).
 * Body: { password?: string, reason?: string }
 * Strictly restricted to administrators.
 * Safeguard: Admin cannot reset their own password via this endpoint (D1).
 */
router.patch("/:id/reset-password", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    // Safeguard: Admin cannot reset their own password through admin reset (D1)
    if (req.params.id === req.user._id) {
      return res.status(400).json({ error: "You cannot reset your own password via the administration panel." });
    }

    const db = getDB();
    const target = await db.collection("users").findOne({ _id: req.params.id });
    if (!target) {
      return res.status(404).json({ error: "User not found." });
    }

    // Generate random one-time temporary password (D4)
    const tempPassword = req.body.password && String(req.body.password).length >= 6
      ? String(req.body.password)
      : `Temp-${Math.random().toString(36).slice(-6)}!`;

    const passwordHash = await bcrypt.hash(tempPassword, 12);
    await db.collection("users").updateOne(
      { _id: req.params.id },
      { $set: { passwordHash, mustChangePassword: true } }
    );

    await logAudit({
      userId: req.user._id,
      action: "PASSWORD_RESET_BY_ADMIN",
      entity: "users",
      entityId: req.params.id,
      details: {
        targetName: target.name,
        targetRole: target.role,
        reason: req.body.reason ? String(req.body.reason).trim() : "Password reset by administrator"
      }
    });

    // Returns temporary password ONCE to the admin; does not leak hash or store plaintext in DB
    res.json({
      message: `Password for ${target.name} has been reset successfully.`,
      temporaryPassword: tempPassword
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset password: " + err.message });
  }
});

/**
 * PATCH /api/users/:id/approve
 * Approve a pending self-registered account (E1).
 * Sets role, status: "active", active: true, and linkedId.
 * Enforces that community and technician approvals require a valid, unlinked entity record.
 * Strictly restricted to administrators.
 */
router.patch("/:id/approve", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const db = getDB();
    const { role, linkedId } = req.body;

    // Load the target user to validate they are actually pending
    const target = await db.collection("users").findOne({ _id: req.params.id });
    if (!target) {
      return res.status(404).json({ error: "User not found." });
    }
    if (target.status !== "pending") {
      return res.status(400).json({ error: "This account is not pending approval." });
    }

    const assignedRole = role || target.role || "volunteer";
    const allowedRoles = ["admin", "officer", "community", "technician", "volunteer"];
    if (!allowedRoles.includes(assignedRole)) {
      return res.status(400).json({ error: `Role must be one of: ${allowedRoles.join(", ")}` });
    }

    let finalLinkedId = null;
    if (assignedRole === "community") {
      finalLinkedId = linkedId !== undefined ? linkedId : target.linkedId;
      if (!finalLinkedId) {
        return res.status(400).json({ error: "A community user must be linked to a community." });
      }
      const community = await db.collection("communities").findOne({ _id: finalLinkedId });
      if (!community) {
        return res.status(400).json({ error: `Community ${finalLinkedId} not found.` });
      }
      const alreadyLinked = await db.collection("users").findOne({
        role: "community",
        linkedId: finalLinkedId,
        active: true,
        _id: { $ne: req.params.id }
      });
      if (alreadyLinked) {
        return res.status(400).json({
          error: `Community ${community.name} is already assigned to ${alreadyLinked.name}.`
        });
      }
    } else if (assignedRole === "technician") {
      finalLinkedId = linkedId !== undefined ? linkedId : target.linkedId;
      if (!finalLinkedId) {
        return res.status(400).json({ error: "A technician user must be linked to a technician record." });
      }
      const tech = await db.collection("technicians").findOne({ _id: finalLinkedId });
      if (!tech) {
        return res.status(400).json({ error: `Technician ${finalLinkedId} not found.` });
      }
      const alreadyLinked = await db.collection("users").findOne({
        role: "technician",
        linkedId: finalLinkedId,
        active: true,
        _id: { $ne: req.params.id }
      });
      if (alreadyLinked) {
        return res.status(400).json({
          error: `Technician ${tech.name} is already assigned to ${alreadyLinked.name}.`
        });
      }
    }

    // Set role, status: "active", active: true, linkedId (E1)
    await db.collection("users").updateOne(
      { _id: req.params.id },
      {
        $set: {
          role: assignedRole,
          status: "active",
          active: true,
          linkedId: finalLinkedId,
          approvedAt: new Date(),
          approvedBy: req.user._id
        }
      }
    );

    // Mark any related PENDING_REGISTRATION notifications as read so the bell count drops
    await db.collection("notifications").updateMany(
      { relatedId: req.params.id, type: "PENDING_REGISTRATION" },
      { $set: { read: true } }
    );

    await logAudit({
      userId: req.user._id,
      action: "USER_APPROVED",
      entity: "users",
      entityId: req.params.id,
      details: { approvedName: target.name, role: assignedRole, linkedId: finalLinkedId }
    });

    res.json({ message: `Account for ${target.name} has been approved. They can now sign in.` });
  } catch (err) {
    res.status(500).json({ error: "Failed to approve user: " + err.message });
  }
});

/**
 * PATCH /api/users/:id/reject
 * Reject and remove a pending self-registered account (E1).
 * Accepts optional note/reason in request body.
 * Deletes the user document entirely so the phone number is freed.
 * Strictly restricted to administrators.
 */
router.patch("/:id/reject", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const db = getDB();
    const { reason, note } = req.body || {};

    const target = await db.collection("users").findOne({ _id: req.params.id });
    if (!target) {
      return res.status(404).json({ error: "User not found." });
    }
    if (target.status !== "pending") {
      return res.status(400).json({ error: "Only pending accounts can be rejected." });
    }

    // Remove the user document so the phone number is freed for future registration
    await db.collection("users").deleteOne({ _id: req.params.id });

    // Mark related notifications as read
    await db.collection("notifications").updateMany(
      { relatedId: req.params.id, type: "PENDING_REGISTRATION" },
      { $set: { read: true } }
    );

    await logAudit({
      userId: req.user._id,
      action: "USER_REJECTED",
      entity: "users",
      entityId: req.params.id,
      details: {
        rejectedName: target.name,
        phone: target.phone,
        note: note || reason || null
      }
    });

    res.json({ message: `Registration request from ${target.name} has been rejected and removed.` });
  } catch (err) {
    res.status(500).json({ error: "Failed to reject user: " + err.message });
  }
});

module.exports = router;
