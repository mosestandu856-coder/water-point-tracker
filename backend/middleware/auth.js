// backend/middleware/auth.js
// Authentication and Role-Based Access Control (RBAC) middleware.
// Uses JWT signed sessions stored in httpOnly cookies (or Bearer Authorization headers).

const jwt = require("jsonwebtoken");
const { getDB } = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_for_bugema_university_water_tracker_2026";
const TOKEN_EXPIRY = "8h";

/**
 * Sign a JWT token for an authenticated user.
 */
function signToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      name: user.name,
      role: user.role,
      linkedId: user.linkedId || null
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * Extract token from cookie or Authorization header.
 */
function extractToken(req) {
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return null;
}

/**
 * Middleware: Strictly requires authentication.
 * Verifies JWT and loads the current active user from MongoDB into req.user.
 */
async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: "Authentication required. Please log in." });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Session expired or invalid token. Please log in again." });
    }

    const db = getDB();
    const user = await db.collection("users").findOne({ _id: decoded.userId });

    if (!user || user.active === false) {
      return res.status(401).json({ error: "User account is inactive or no longer exists." });
    }

    // Block pending accounts from all protected routes.
    // They must wait for an officer to approve them via PATCH /api/users/:id/approve.
    if (user.status === "pending") {
      return res.status(403).json({
        error: "Your account is awaiting officer approval. You will be notified when access is granted.",
        code: "PENDING_APPROVAL"
      });
    }

    // Attach sanitized user to request context (strip passwordHash)
    req.user = {
      _id: user._id,
      name: user.name,
      phone: user.phone,
      email: user.email || null,
      role: user.role,
      status: user.status || "active",
      linkedId: user.linkedId || null
    };

    next();
  } catch (err) {
    return res.status(500).json({ error: "Authentication error: " + err.message });
  }
}

/**
 * Middleware: Role-Based Authorization Guard.
 * Checks whether the authenticated user's role is included in allowedRoles.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Access restricted. Role '${req.user.role}' lacks sufficient privileges for this resource.`
      });
    }

    next();
  };
}

/**
 * Middleware: Optional authentication.
 * If a token is provided, loads the user; otherwise continues as anonymous guest.
 */
async function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDB();
    const user = await db.collection("users").findOne({ _id: decoded.userId });

    if (user && user.active !== false) {
      req.user = {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email || null,
        role: user.role,
        linkedId: user.linkedId || null
      };
    } else {
      req.user = null;
    }

    next();
  } catch (err) {
    req.user = null;
    next();
  }
}

module.exports = {
  signToken,
  requireAuth,
  requireRole,
  optionalAuth,
  JWT_SECRET
};

