const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../frontend/src/pages/dashboards/AdminDashboard.jsx");
const lines = fs.readFileSync(file, "utf8").split("\n");

let issues = 0;
lines.forEach((line, i) => {
  const match = line.match(/fontSize:\s*["']([^"']+)["']/);
  if (match) {
    const val = match[1];
    let px = 0;
    if (val.endsWith("rem")) px = parseFloat(val) * 16;
    else if (val.endsWith("px")) px = parseFloat(val);
    else if (val.endsWith("em")) px = parseFloat(val) * 16;
    if (px > 0 && px < 14) {
      console.log(`Line ${i + 1}: ${val} (${px}px) -> ${line.trim()}`);
      issues++;
    }
  }
});

console.log(`Total font size < 14px issues: ${issues}`);

