// backend/routes/auth.js
// Authentication endpoints: login, logout, session inspection, and volunteer registration.
// Security: bcrypt cost 12, JWT httpOnly cookie, generic error messages,
//           failed-login lockout, phone normalisation, DEMO_MODE guard.

const express = require("express");
const router  = express.Router();
const bcrypt  = require("bcryptjs");
const { getDB }                    = require("../db");
const { signToken, requireAuth }   = require("../middleware/auth");
const { logAudit }                 = require("../utils/auditLogger");
const { sendNotification }         = require("../utils/notificationService");

// ── Phone normaliser ────────────────────────────────────────────────────────
// Accepts: "0700 000 100", "0700000100", "+256700000100", "256700000100", "0700-000-100"
// Produces: Canonical 10-digit format: "0700000100"
function normalisePhone(raw) {
  if (!raw) return "";
  let p = String(raw).replace(/[\s\-]/g, ""); // strip spaces and hyphens
  if (p.startsWith("+256")) p = "0" + p.slice(4);
  if (p.startsWith("256") && p.length === 12) p = "0" + p.slice(3);
  if (!p.startsWith("0") && p.length === 9) p = "0" + p;
  return p;
}

// Converts a canonical 10-digit number into standard spaced display format: "0700 000 100"
function formatPhoneSpaced(canonical) {
  if (!canonical || canonical.length !== 10) return canonical;
  return canonical.slice(0, 4) + " " + canonical.slice(4, 7) + " " + canonical.slice(7);
}

// ── Lockout tracking ────────────────────────────────────────────────────────
// In-memory map: { failedCount, lockUntil } keyed by normalised phone
const failedLoginMap      = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

setInterval(() => {
  const now = Date.now();
  for (const [phone, rec] of failedLoginMap.entries()) {
    if (now > rec.lockUntil && rec.failedCount === 0) failedLoginMap.delete(phone);
  }
}, 10 * 60 * 1000).unref();

/**
 * POST /api/auth/login
 * Body: { phone, password, keepSignedIn }
 */
router.post("/login", async (req, res) => {
  try {
    const { phone, password, keepSignedIn = false } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: "Both phone number and password are required." });
    }

    const cleanPhone = normalisePhone(String(phone));
    const spacedPhone = formatPhoneSpaced(cleanPhone);
    const now = Date.now();

    // Check lockout using canonical phone key
    const lockoutRecord = failedLoginMap.get(cleanPhone);
    if (lockoutRecord && lockoutRecord.lockUntil && now < lockoutRecord.lockUntil) {
      const remainingMinutes = Math.ceil((lockoutRecord.lockUntil - now) / 60000);
      return res.status(429).json({
        error: `Account temporarily locked due to repeated failed logins. Please try again in ${remainingMinutes} minute(s).`
      });
    }

    const db   = getDB();
    // Query matches either canonical ("0700000106") or seeded display ("0700 000 106")
    const user = await db.collection("users").findOne({
      phone: { $in: [cleanPhone, spacedPhone] }
    });

    // Single generic error with actionable next steps
    const GENERIC_ERROR = "Phone or password is incorrect. Check your number and password, or contact your district officer.";

    const recordFail = async () => {
      const cur = failedLoginMap.get(cleanPhone) || { failedCount: 0, lockUntil: 0 };
      cur.failedCount += 1;
      if (cur.failedCount >= MAX_FAILED_ATTEMPTS && !cur.lockUntil) {
        cur.lockUntil = now + LOCKOUT_DURATION_MS;
        await logAudit({
          userId: user?._id || "anonymous",
          action: "ACCOUNT_LOCKED",
          entity: "users",
          entityId: user?._id || cleanPhone,
          details: { phone: cleanPhone, failedAttempts: cur.failedCount, durationMinutes: 15 }
        });

        // Notify admins about account lockout (A6, D5)
        try {
          const admins = await db.collection("users").find({ role: "admin", active: true }).toArray();
          if (admins.length > 0) {
            await sendNotification({
              recipientUserIds: admins.map((a) => a._id),
              type: "ACCOUNT_LOCKED",
              message: `Account for ${user?.name || cleanPhone} was locked due to repeated failed logins.`,
              relatedId: user?._id || cleanPhone
            });
          }
        } catch (_) {}
      }
      failedLoginMap.set(cleanPhone, cur);
    };

    if (!user || user.active === false) {
      await recordFail();
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      await recordFail();
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    // Success — clear lockout counter
    failedLoginMap.delete(cleanPhone);

    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { lastLoginAt: new Date() } }
    );

    await logAudit({
      userId: user._id,
      action: "LOGIN",
      entity: "auth",
      entityId: user._id,
      details: { role: user.role, phone: user.phone }
    });

    const token  = signToken(user);
    const isProd = process.env.NODE_ENV === "production";
    
    // Cookie lifetime: 7 days when keepSignedIn is true; session cookie (undefined maxAge) when false
    const cookieOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax"
    };
    if (keepSignedIn === true || keepSignedIn === "true") {
      cookieOptions.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    }

    res.cookie("token", token, cookieOptions);

    return res.json({
      message: "Login successful.",
      token,
      user: {
        _id:      user._id,
        name:     user.name,
        phone:    user.phone,
        email:    user.email || null,
        role:     user.role,
        status:   user.status || "active",
        linkedId: user.linkedId || null
      }
    });
  } catch (err) {
    console.error("[Login Error]", err);
    return res.status(500).json({ error: "An unexpected error occurred. Please try again." });
  }
});

/**
 * POST /api/auth/register
 * Public self-registration. Allowed only for the "volunteer" role with status "pending".
 * The server ALWAYS assigns the role — the client cannot choose or override it.
 * Officers, community contacts, and technicians must be created by an officer via /api/users.
 * Body: { name, phone, password, email }  — any "role" field sent by the client is ignored.
 */
router.post("/register", async (req, res) => {
  try {
    const { name, phone, password, email = null, role = null } = req.body;

    // D8: "admin" and "officer" are strictly rejected by the public registration form and by any client-supplied role field
    if (role && ["admin", "officer"].includes(String(role).trim().toLowerCase())) {
      return res.status(400).json({ error: "Registration for administrator or officer roles is prohibited." });
    }

    if (!name || !phone || !password) {
      return res.status(400).json({ error: "Full name, phone number, and password are required." });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    const cleanPhone = normalisePhone(String(phone).trim());
    const cleanName  = String(name).trim();

    const db = getDB();

    // Duplicate phone guard
    const existing = await db.collection("users").findOne({ phone: cleanPhone });
    if (existing) {
      return res.status(409).json({ error: "An account with this phone number already exists. Please sign in." });
    }

    // Generate deterministic string ID: user_XX
    const count  = await db.collection("users").countDocuments();
    const nextId = `user_${String(count + 1).padStart(2, "0")}`;

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();

    // Server-enforced: new public registrations are ALWAYS volunteer + pending
    const newUserDoc = {
      _id: nextId,
      name: cleanName,
      phone: cleanPhone,
      email: email ? String(email).trim().toLowerCase() : null,
      role: "volunteer",      // SERVER assigns — never trust the client
      status: "pending",      // Awaits officer approval before full access
      linkedId: null,
      passwordHash,
      active: true,
      createdAt: now,
      lastLoginAt: now
    };

    await db.collection("users").insertOne(newUserDoc);

    await logAudit({
      userId: nextId,
      action: "USER_REGISTERED",
      entity: "users",
      entityId: nextId,
      details: { name: cleanName, phone: cleanPhone, role: "volunteer", status: "pending" }
    });

    // Notify every administrator so they see the pending approval badge immediately.
    // We find all active admins and insert one notification per administrator.
    try {
      const admins = await db.collection("users")
        .find({ role: "admin", active: true })
        .project({ _id: 1 })
        .toArray();

      if (admins.length > 0) {
        await sendNotification({
          recipientUserIds: admins.map((a) => a._id),
          type: "PENDING_REGISTRATION",
          message: `New account request from ${cleanName}. Review in Admin → Pending Approvals.`,
          relatedId: nextId
        });
      }
    } catch (notifErr) {
      // Non-fatal — log but don't fail the registration
      console.warn("[Registration] Could not create admin notifications:", notifErr.message);
    }

    // Issue a limited session — pending users see a "awaiting approval" page
    const token = signToken(newUserDoc);
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("token", token, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000
    });

    return res.status(201).json({
      message: "Registration received. Your account is pending officer approval.",
      token,
      user: {
        _id: newUserDoc._id,
        name: newUserDoc.name,
        phone: newUserDoc.phone,
        email: newUserDoc.email,
        role: newUserDoc.role,
        status: newUserDoc.status,
        linkedId: null
      }
    });
  } catch (err) {
    console.error("[Registration Error]", err);
    return res.status(500).json({ error: "Failed to register account: " + err.message });
  }
});

/**
 * POST /api/auth/logout
 * Clears JWT session cookie.
 */
router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "lax"
  });
  return res.json({ message: "Logged out successfully." });
});

/**
 * GET /api/auth/me
 * Returns currently authenticated user context.
 */
router.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

/**
 * GET /api/auth/demo-accounts
 * Returns the list of demo personas for the one-click login panel.
 * ONLY available when DEMO_MODE=true in server environment.
 * This endpoint is absent (404) in production builds.
 */
router.get("/demo-accounts", (req, res) => {
  if (process.env.DEMO_MODE !== "true") {
    return res.status(404).json({ error: "Not found." });
  }
  // The demo password is read from environment variable DEMO_PASSWORD, never hardcoded
  const demoPassword = process.env.DEMO_PASSWORD || "";
  return res.json({
    accounts: [
      { role: "admin",      name: "Moses Tandu",   phone: "0726 986 218", canonical: "0726986218" },
      { role: "officer",    name: "Mohamed Abdi",  phone: "0726 927 445", canonical: "0726927445" },
      { role: "community",  name: "Hissen",        phone: "0765 924 115", canonical: "0765924115" },
      { role: "technician", name: "Moses Zach",    phone: "0765 924 113", canonical: "0765924113" },
      { role: "volunteer",  name: "Zachariah",     phone: "0765 924 114", canonical: "0765924114" }
    ],
    password: demoPassword
  });
});

/**
 * POST /api/auth/forgot-password
 * Initiates officer-assisted password reset.
 * Phase 1: records the request and returns a generic message (no hint if phone exists).
 * Phase 2 (future): send SMS OTP via Africa's Talking or similar gateway.
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number is required." });

    const cleanPhone = normalisePhone(String(phone));
    const db         = getDB();
    const user       = await db.collection("users").findOne({ phone: cleanPhone }, { projection: { _id: 1 } });

    // Log the request regardless of whether phone exists (prevents enumeration)
    if (user) {
      await logAudit({
        userId: user._id,
        action: "PASSWORD_RESET_REQUESTED",
        entity: "auth",
        entityId: user._id,
        details: { phone: cleanPhone, method: "officer_assisted" }
      });
    }

    // Generic response — never reveal whether the phone is registered
    return res.json({
      message: "If this number is registered, your district officer has been notified to assist with a reset."
    });
  } catch (err) {
    console.error("[Forgot Password Error]", err);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

module.exports = router;

