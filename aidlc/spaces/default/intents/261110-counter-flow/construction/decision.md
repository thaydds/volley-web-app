# Counter and session score flow

Explicit user approval relayed by Personal Designer36c9bbc0-d2bd-47f1-9597-e1aae513890a. Implement code/PRs only, no Figma writes, publish, merge, deploy or production API changes. Current mains inspected; app PR12 merged, DS components0.7.0 released. New branch per repository.

The previous layout is superseded by Figma Counter2197:11752, app2124:9496 and ScoreMatch2184:17980, screenshot/metadata read live. Counter API is a single integer,1/2/3 visual places and derived maximum9/99/999. One native spinbutton controls continuous edit/selection; decorative cells do not create separate inputs. Invalid prop combinations and legacy values remain exposed, never truncated.

Decision stated before implementation: no new provisional persistence/API semantics. SessionScore in LifecycleApp retains each match's draft across navigation; reload/close discards unfinalized values. No save_score command is produced by this UI. start_match and finish_match remain persisted/idempotent through the existing queue, and only finished results affect ranking. Existing endpoints/old pending save_score intents remain supported. Version drift preserves local draft and requires explicit review, never silent rebase. Server values above99 require manual correction in the two-place UI; historical finals remain unchanged. No credentials, secrets or production data accessed by these changes.

DS PR26 was merged and components0.8.0 was published. The app now pins that published release in the lockfile; the review tarball was removed and the full suite revalidated against it. No merge or deploy was performed by this implementation.
