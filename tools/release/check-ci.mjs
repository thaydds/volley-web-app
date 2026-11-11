import { readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validatedRun } from './contracts.mjs';
const repository = process.env.GITHUB_REPOSITORY;
if (repository !== 'thaydds/volley-web-app' || !process.env.CI || !process.env.GITHUB_OUTPUT)
  throw new Error('Run only in the app release workflow');
const api = (path) =>
  JSON.parse(execFileSync('gh', ['api', `repos/${repository}/${path}`], { encoding: 'utf8' }));
const sha = api('git/ref/heads/main').object.sha;
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
let approved;
if (event.workflow_run) approved = validatedRun(event.workflow_run, sha, repository);
else {
  if (process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Dispatch must target main');
  approved = api(
    `actions/workflows/ci.yml/runs?head_sha=${sha}&event=push&status=success&per_page=10`
  ).workflow_runs.some((run) => validatedRun(run, sha, repository));
}
if (execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== sha)
  approved = false;
appendFileSync(process.env.GITHUB_OUTPUT, `approved=${approved}\n`);
