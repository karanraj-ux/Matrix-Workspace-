const fs = require('fs');

// We need to prevent the automation engine from infinitely forwarding the same forwarded email.
// If the email subject contains "[Matrix Auto-Fwd]" we should skip it.
let engine = fs.readFileSync('src/services/automationEngine.ts', 'utf8');

const loopPrevention = `
                // Loop Prevention: If this email was already forwarded by us, DO NOT forward it again.
                if (subject.includes('[Matrix Auto-Fwd]')) {
                   console.log('Skipping already forwarded email to prevent loop');
                   continue;
                }
`;

engine = engine.replace(
  `// Condition check passed!`,
  `// Condition check passed!\n${loopPrevention}`
);

fs.writeFileSync('src/services/automationEngine.ts', engine, 'utf8');
console.log('Fixed infinite loop');
