const fs = require('fs');
let drive = fs.readFileSync('src/views/DriveView.tsx', 'utf8');

if (!drive.includes('Mail,')) {
  drive = drive.replace(
    `import {`,
    `import { Mail, ArrowRight, `
  );
  fs.writeFileSync('src/views/DriveView.tsx', drive, 'utf8');
}
