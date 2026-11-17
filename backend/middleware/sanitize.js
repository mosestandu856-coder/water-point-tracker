// backend/middleware/sanitize.js
// Protects Express API from NoSQL operator injection attacks.
// Rejects any request payload (body, query, params) that contains keys
// starting with '$' (MongoDB query operators) or containing '.' (field paths).

function checkForbiddenKeys(obj) {
  if (!obj || typeof obj !== "object") return null;

  for (const key of Object.keys(obj)) {
    if (key.startsWith("$") || key.includes(".")) {
      return key;
    }
    if (typeof obj[key] === "object" && obj[key] !== null) {
      const nestedForbidden = checkForbiddenKeys(obj[key]);
      if (nestedForbidden) return nestedForbidden;
    }
  }
  return null;
}

function sanitizeInput(req, res, next) {
  // Check request body
  if (req.body) {
    const forbiddenKey = checkForbiddenKeys(req.body);
    if (forbiddenKey) {
      return res.status(400).json({
        error: `Invalid input: Field name '${forbiddenKey}' is forbidden. Keys must not start with '$' or contain '.'`
      });
    }
  }

  // Check query parameters
  if (req.query) {
    const forbiddenKey = checkForbiddenKeys(req.query);
    if (forbiddenKey) {
      return res.status(400).json({
        error: `Invalid query: Parameter '${forbiddenKey}' is forbidden.`
      });
    }
  }

  // Check URL params
  if (req.params) {
    const forbiddenKey = checkForbiddenKeys(req.params);
    if (forbiddenKey) {
      return res.status(400).json({
        error: `Invalid route parameter '${forbiddenKey}'.`
      });
    }
  }

  next();
}

module.exports = { sanitizeInput };

