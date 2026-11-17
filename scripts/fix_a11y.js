const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "../frontend/src/pages/dashboards/AdminDashboard.jsx");
let content = fs.readFileSync(filePath, "utf8");

// Replace all fontSize values under 0.875rem / 14px with "0.875rem" (14px)
content = content.replace(/fontSize:\s*["']0\.[0-8]\d*rem["']/g, 'fontSize: "0.875rem"');
content = content.replace(/fontSize:\s*["']1[0-3]px["']/g, 'fontSize: "14px"');

// Ensure minHeight for buttons and inputs is at least 44px (F4)
content = content.replace(/minHeight:\s*["'](3[0-9]|4[0-3])px["']/g, 'minHeight: "44px"');

fs.writeFileSync(filePath, content, "utf8");
console.log("A11y fixes applied to AdminDashboard.jsx");

