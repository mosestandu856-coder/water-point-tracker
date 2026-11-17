// backend/utils/rateLimiter.js
// Lightweight, zero-dependency in-memory rate limiting middleware.
// Protects public API endpoints from denial-of-service and brute-force flooding
// while accommodating real-time background polling (chat sync & notifications).

const requestCounts = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute window

function isLoopback(ip) {
  if (!ip) return true;
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "localhost" ||
    ip === "::ffff:127.0.0.1" ||
    ip.startsWith("127.") ||
    ip.includes("127.0.0.1") ||
    ip.startsWith("::ffff:127.")
  );
}

/**
 * Express middleware to track and throttle incoming HTTP requests per client IP.
 */
function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || "unknown-ip";
  const now = Date.now();

  // For localhost development, automated tests, or background polling across
  // multiple browser tabs (technician + officer dashboards), provide a generous
  // ceiling (10,000 req/min) so legitimate in-app messaging and status updates
  // are never throttled. In production from external IPs, enforce 1,200 req/min (20 req/s).
  const isDevOrLocal = process.env.NODE_ENV !== "production" || isLoopback(ip);
  const maxLimit = isDevOrLocal ? 10000 : 1200;

  const record = requestCounts.get(ip) || { count: 0, resetAt: now + WINDOW_MS };

  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + WINDOW_MS;
  } else {
    record.count += 1;
  }

  requestCounts.set(ip, record);

  // Set standard rate limit headers
  res.setHeader("X-RateLimit-Limit", maxLimit);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, maxLimit - record.count));
  res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetAt / 1000));

  if (record.count > maxLimit) {
    return res.status(429).json({
      error: "Too many requests. Please slow down and try again shortly."
    });
  }

  next();
}

// Clean up stale IP records every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of requestCounts.entries()) {
    if (now > record.resetAt) {
      requestCounts.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

module.exports = { rateLimiter };
