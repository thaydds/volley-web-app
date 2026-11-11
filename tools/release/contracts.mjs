export function validatedRun(run, sha, repository) {
  if (
    run.event !== 'push' ||
    run.head_branch !== 'main' ||
    run.conclusion !== 'success' ||
    run.head_repository?.full_name !== repository
  )
    throw new Error('Expected successful push CI from this repository main');
  return run.head_sha === sha;
}
export function validateReleaseTag(tag, version) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag) || tag !== `v${version}`)
    throw new Error('Release tag must match the stable app version');
  return tag;
}
