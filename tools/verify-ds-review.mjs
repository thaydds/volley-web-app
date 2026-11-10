import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
const metadata = JSON.parse(
  fs.readFileSync(new URL('../vendor/components-review.json', import.meta.url), 'utf8')
);
if (
  path.basename(metadata.file) !== metadata.file ||
  !metadata.file.startsWith('beachsports-components-')
)
  throw new Error('Invalid review artifact path.');
const digest = crypto
  .createHash('sha256')
  .update(fs.readFileSync(new URL('../vendor/' + metadata.file, import.meta.url)))
  .digest('hex');
if (digest !== metadata.sha256 || !/^[a-f0-9]{40}$/.test(metadata.commit))
  throw new Error('Review artifact provenance mismatch.');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (
  pkg.dependencies['@beachsports/components'] !== `file:vendor/${metadata.file}` ||
  metadata.source !== 'https://github.com/thaydds/Beach-Sports-DS'
)
  throw new Error('Review dependency does not match provenance.');
console.log(`DS review artifact verified: ${metadata.commit}`);
