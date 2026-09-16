const fs = require('fs');
let view = fs.readFileSync('src/views/DriveView.tsx', 'utf8');

view = view.replace(
  `import { makeManifestChunksPublic, motion, AnimatePresence } from 'motion/react';`,
  `import { motion, AnimatePresence } from 'motion/react';`
);

view = view.replace(
  `import {\n  ShardManifest,`,
  `import {\n  makeManifestChunksPublic,\n  ShardManifest,`
);

fs.writeFileSync('src/views/DriveView.tsx', view, 'utf8');
console.log('Fixed');
