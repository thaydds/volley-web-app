import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatedRun, validateReleaseTag, isReleaseBranch } from './contracts.mjs';
import { execFileSync } from 'node:child_process';
const run = {
  event: 'push',
  head_branch: 'main',
  conclusion: 'success',
  head_sha: 'tested',
  head_repository: { full_name: 'thaydds/volley-web-app' },
};
test('only the current tested main may release, never a PR, fork, failed or stale run', () => {
  assert.equal(validatedRun(run, 'tested', 'thaydds/volley-web-app'), true);
  assert.equal(validatedRun(run, 'newer', 'thaydds/volley-web-app'), false);
  for (const bad of [
    { ...run, event: 'pull_request' },
    { ...run, conclusion: 'failure' },
    { ...run, head_branch: 'other' },
    { ...run, head_repository: { full_name: 'someone/fork' } },
  ])
    assert.throws(() => validatedRun(bad, 'tested', 'thaydds/volley-web-app'));
});
test('deploy requires a stable tag exactly matching the app, independently of DS versions', () => {
  assert.equal(validateReleaseTag('v0.1.0', '0.1.0'), 'v0.1.0');
  for (const tag of ['main', 'components@0.8.0', 'v0.1.1', 'v0.1.0-beta', 'v01.1.0'])
    assert.throws(() => validateReleaseTag(tag, '0.1.0'));
});
test('the first structured release and lockfile agree; future versions are calculated from commits', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const config = JSON.parse(readFileSync('release-please-config.json', 'utf8'));
  assert.equal(pkg.version, lock.version);
  assert.equal(pkg.version, lock.packages[''].version);
  assert.equal(config['release-type'], 'node');
  assert.equal(config['initial-version'], '0.1.0');
  assert.equal(config['include-component-in-tag'], false);
  assert.equal(config['release-as'], undefined);
  assert.match(config['bootstrap-sha'], /^[a-f\d]{40}$/);
});

test('Release Please compact JSON is accepted by formatting while version metadata remains validated', () => {
  const manifest = JSON.parse(readFileSync('.release-please-manifest.json', 'utf8'));
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  if (manifest['.'] !== undefined) assert.equal(manifest['.'], pkg.version);
  const info = (path) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        ['node_modules/prettier/bin/prettier.cjs', '--file-info', path],
        { encoding: 'utf8' }
      )
    );
  assert.equal(info('.release-please-manifest.json').ignored, true);
  assert.equal(info('src/main.tsx').ignored, false);
});
test('dispatch recognizes both root release branch forms without matching unrelated work', () => {
  assert.equal(isReleaseBranch('release-please--branches--main'), true);
  assert.equal(isReleaseBranch('release-please--branches--main--components--volley-web-app'), true);
  for (const branch of [
    'main',
    'feature/example',
    'release-please--branches--other',
    'release-please--branches--main--components--other',
  ])
    assert.equal(isReleaseBranch(branch), false);
});
