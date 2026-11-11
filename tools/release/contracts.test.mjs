import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatedRun, validateReleaseTag } from './contracts.mjs';
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
