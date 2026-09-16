const fs = require('fs');

let engine = fs.readFileSync('src/services/automationEngine.ts', 'utf8');

// The variable `isOtp` was removed from the top of the function but is still being used on line 199.
// We should replace it with a simple string or a condition based on the rule.

engine = engine.replace(
  `const subjectPrefix = isOtp ? '[Verification Code]' : '[Mail Automation]';`,
  `const subjectPrefix = '[Matrix Auto-Fwd]';`
);

fs.writeFileSync('src/services/automationEngine.ts', engine, 'utf8');
console.log('Engine fixed');
