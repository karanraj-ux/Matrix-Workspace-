const fs = require('fs');
let content = fs.readFileSync('src/services/automationEngine.ts', 'utf8');

// 1. Time Boundary Logic
// Look for where we parse msgData and before evaluating conditions.
content = content.replace(
  `          const msgData = await msgRes.json();`,
  `          const msgData = await msgRes.json();\n\n          // Time Boundary: Only process emails received AFTER the rule was created\n          const msgDate = parseInt(msgData.internalDate || '0', 10);\n          if (msgDate < rule.createdAt) {\n            console.log('Skipping old email (arrived before rule creation)');\n            continue;\n          }`
);

fs.writeFileSync('src/services/automationEngine.ts', content, 'utf8');
