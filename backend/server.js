// backend/server.js
// Main entry point for the Express REST API.
// Features:
//   - Helmet security headers, CORS with credentials for React SPA.
//   - Cookie parsing for httpOnly JWT sessions.
//   - In-memory rate limiting and NoSQL injection sanitizer.
//   - RBAC routes: Auth, Communities, Water Points, Technicians, Reports, Stats, Notifications, Audit, Users.

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { connectDB, getDB } = require("./db");
const { rateLimiter } = require("./utils/rateLimiter");
const { sanitizeInput } = require("./middleware/sanitize");

const app = express();
const PORT = process.env.PORT || 5000;

// ── Security Headers ─────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ─────────────────────────────────────────────────────────────────────
// Allows credentials (cookies) to be sent across origins in development & production
const ALLOWED_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
app.use(
  cors({
    origin: ALLOWED_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// ── Rate Limiter ──────────────────────────────────────────────────────────────
// Throttles high-frequency flooding
app.use(rateLimiter);

// ── Cookie Parser & Body Parsing ─────────────────────────────────────────────
app.use(cookieParser(process.env.COOKIE_SECRET || "water_cookie_secret_2026"));
app.use(express.json({ limit: "50kb" }));

// ── NoSQL Operator Injection Protection ──────────────────────────────────────
app.use(sanitizeInput);

// ── Development Request Logger ───────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

// ── Verification / Healthcheck endpoint ──────────────────────────────────────
app.get("/api/health", async (req, res) => {
  try {
    const db = getDB();
    const communityCount = await db.collection("communities").countDocuments();
    const waterPointCount = await db.collection("waterPoints").countDocuments();
    const technicianCount = await db.collection("technicians").countDocuments();
    const reportCount = await db.collection("reports").countDocuments();
    const userCount = await db.collection("users").countDocuments();

    res.json({
      status: "ok",
      project: "Community Water Point Tracker (Role-Based Edition)",
      student: "Moses Tandu Zachariah Hissen (24/BCC/BU/R/0016)",
      database: db.databaseName,
      counts: {
        communities: communityCount,
        waterPoints: waterPointCount,
        technicians: technicianCount,
        reports: reportCount,
        users: userCount
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to connect to database: " + err.message });
  }
});

// ── Mount REST API Resource Routes ───────────────────────────────────────────
const { requireAuth, requireRole } = require("./middleware/auth");

app.use("/api/auth", require("./routes/auth"));
app.use("/api/communities", require("./routes/communities"));
app.use("/api/water-points", require("./routes/waterPoints"));
app.use("/api/technicians", require("./routes/technicians"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/stats", require("./routes/stats"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/audit", require("./routes/audit"));
app.use("/api/users", require("./routes/users"));

// Dedicated /api/admin/* namespace strictly enforced for admin role (D7)
const adminRouter = express.Router();
adminRouter.use(requireAuth, requireRole("admin"));
adminRouter.use("/users", require("./routes/users"));
adminRouter.use("/audit", require("./routes/audit"));
adminRouter.all("*", (req, res) => {
  res.status(404).json({ error: `Admin route not found: ${req.method} ${req.url}` });
});
app.use("/api/admin", adminRouter);

// ── Production Static File Serving (React SPA) ──────────────────────────────
// In cloud production (Render, Railway, etc.), Express serves the built Vite frontend
const path = require("path");
const frontendDist = path.join(__dirname, "../frontend/dist");

if (process.env.NODE_ENV === "production" || process.env.SERVE_STATIC === "true") {
  app.use(express.static(frontendDist));
  // Client-side SPA routing fallback: send index.html for non-API GET requests
  app.get("*", (req, res, next) => {
    if (req.url.startsWith("/api/")) return next();
    res.sendFile(path.join(frontendDist, "index.html"), (err) => {
      if (err) next();
    });
  });
}

// ── 404 Handler for unmatched routes ─────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.url}` });
});

// ── Centralised Error Handler ────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[Unhandled Error]", err.stack || err.message);
  // Never leak internal stack traces to clients
  res.status(500).json({ error: "Internal server error: " + err.message });
});

// Start the server after establishing MongoDB connection
async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`[Server] Community Water Point Tracker API running on http://localhost:${PORT}`);
    console.log(`[Server] Healthcheck: http://localhost:${PORT}/api/health`);
  });
}

// Start only if run directly (allows supertest to import app without binding port)
if (require.main === module) {
  startServer();
}

module.exports = app;
