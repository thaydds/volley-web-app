// Rebuild the review dependency from a clean, exact DS commit. Never publishes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const repo = process.argv[2];
if (!repo) throw new Error('Pass the path of the clean Beach-Sports-DS checkout.');
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
if (git('status', '--porcelain'))
  throw new Error('The DS checkout must be clean to establish provenance.');
const sha = git('rev-parse', 'HEAD');
execFileSync('pnpm', ['exec', 'nx', 'run-many', '-t', 'build', '--projects=tokens,components'], {
  cwd: repo,
  stdio: 'inherit',
});
const vendor = new URL('../vendor/', import.meta.url);
fs.mkdirSync(vendor, { recursive: true });
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'volley-ds-review-'));
try {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(repo, 'packages/components/package.json'), 'utf8')
  );
  pkg.version += `-review.score-content.${sha.slice(0, 8)}`;
  for (const name of Object.keys(pkg.dependencies ?? {}))
    pkg.dependencies[name] = pkg.dependencies[name].replace('workspace:', '');
  delete pkg.scripts;
  delete pkg.devDependencies;
  fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  fs.cpSync(path.join(repo, 'packages/components/dist'), path.join(stage, 'dist'), {
    recursive: true,
  });
  fs.copyFileSync(path.join(repo, 'LICENSE'), path.join(stage, 'LICENSE'));
  const [packed] = JSON.parse(
    execFileSync(
      'npm',
      ['pack', '--json', '--ignore-scripts', '--pack-destination', path.resolve(vendor.pathname)],
      { cwd: stage, encoding: 'utf8' }
    )
  );
  const metadataUrl = new URL('components-review.json', vendor);
  const previous = fs.existsSync(metadataUrl)
    ? JSON.parse(fs.readFileSync(metadataUrl, 'utf8'))
    : null;
  fs.writeFileSync(
    metadataUrl,
    JSON.stringify(
      {
        source: 'https://github.com/thaydds/Beach-Sports-DS',
        commit: sha,
        version: pkg.version,
        file: packed.filename,
        sha256: crypto
          .createHash('sha256')
          .update(fs.readFileSync(new URL(packed.filename, vendor)))
          .digest('hex'),
        purpose:
          'Review-only artifact. Replace with an approved npm release before production adoption.',
        build: 'node tools/pack-ds-review.mjs <clean-DS-checkout>',
      },
      null,
      2
    ) + '\n'
  );
  if (
    previous?.file !== packed.filename &&
    typeof previous?.file === 'string' &&
    path.basename(previous.file) === previous.file &&
    previous.file.startsWith('beachsports-components-')
  ) {
    const prior = new URL(previous.file, vendor);
    if (fs.existsSync(prior)) fs.unlinkSync(prior);
  }
  console.log(packed.filename);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
