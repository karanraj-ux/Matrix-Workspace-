const fs = require('fs');
let drive = fs.readFileSync('src/views/DriveView.tsx', 'utf8');

drive = drive.replace(
  `import { Mail, ArrowRight,  motion, AnimatePresence } from 'motion/react';`,
  `import { motion, AnimatePresence } from 'motion/react';\nimport { Mail, ArrowRight } from 'lucide-react';`
);

fs.writeFileSync('src/views/DriveView.tsx', drive, 'utf8');
