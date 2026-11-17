const fs = require('fs');

const dash = fs.readFileSync('frontend/src/pages/dashboards/OfficerDashboard.jsx', 'utf8');
const lines = dash.split('\n');

console.log('--- Font size checks in OfficerDashboard.jsx ---');
lines.forEach((line, i) => {
  // Check rem < 0.875rem or px < 14px
  const remMatch = line.match(/fontSize:\s*["'](0\.[0-7]\d*|0\.8[0-6]\d*)rem["']/);
  if (remMatch) {
    console.log(`Line ${i + 1}: ${remMatch[0]} -> ${line.trim()}`);
  }
  const pxMatch = line.match(/fontSize:\s*["'](\d+)px["']/);
  if (pxMatch && parseInt(pxMatch[1], 10) < 14) {
    console.log(`Line ${i + 1}: ${pxMatch[0]} -> ${line.trim()}`);
  }
  // Check minHeight < 44px
  const heightMatch = line.match(/minHeight:\s*["'](\d+)px["']/);
  if (heightMatch && parseInt(heightMatch[1], 10) < 44) {
    console.log(`Line ${i + 1}: small minHeight ${heightMatch[0]} -> ${line.trim()}`);
  }
});

