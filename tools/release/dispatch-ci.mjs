import { execFileSync } from 'node:child_process';
if (!process.env.CI || process.env.GITHUB_REPOSITORY !== 'thaydds/volley-web-app')
  throw new Error('Run only in the app release workflow');
const prs = JSON.parse(
  execFileSync(
    'gh',
    [
      'pr',
      'list',
      '--repo',
      process.env.GITHUB_REPOSITORY,
      '--base',
      'main',
      '--head',
      'release-please--branches--main',
      '--state',
      'open',
      '--json',
      'headRefName',
    ],
    { encoding: 'utf8' }
  )
);
// Explicit dispatch validates bot-authored PRs without waiting for event approval.
for (const pr of prs) {
  if (pr.headRefName !== 'release-please--branches--main')
    throw new Error('Unexpected release branch');
  execFileSync(
    'gh',
    ['workflow', 'run', 'ci.yml', '--repo', process.env.GITHUB_REPOSITORY, '--ref', pr.headRefName],
    { stdio: 'inherit' }
  );
}
