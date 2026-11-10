# Offline match lifecycle — implementation contract

Explicit implementation handoff: Personal Designer message ab3882ea-75bb-4c56-8e51-7b566ad59526.
Visual source: Figma baO5SbbaGO01QTGc8d5M0P, current screens 2124:9497,9595,9686,10622 and 2184:16973,16993,17980,20090,19992,20135. Screenshots and instance metadata inspected live on 10 Nov 2026. Previous Loading/Modal snapshot is NOT the app source.

## Scope and authorization

Prepare code, tests and reviewable PRs for DS + app/API. No npm publish, merge, deploy or production migration. Preserve existing rows/local backups. Keyword has NOT been defined: production deactivation fails closed until securely configured; tests use explicitly test-only credentials, never a production default. No Figma writes.

Verified main states: app PR10 merged, main94f1be2; DS PR23 merged, main6414c66; npm components0.6.0 available. Original checkouts clean before new branches. App feat/offline-match-lifecycle; DS feat/score-match-input-slots.

## UI

Initial spinner only with accessible name, offline cached open or retry failure. Home sync controls/status/time/pending; horizontal lower Ranking/Partidas/Ajustes, Cartas unavailable. Real build version. Roster natural wrapping removable chips, selected check only; name field + Add on same screen. Remove opens deactivation, separate from presence. Reactivation explicit and preserves UUID; normalized names ignore case/extra whitespace, no silent homonym merge. Pregame drag + accessible move, complementary randomized serving/choosing badges in same title row; redraw both players and assignment. Start freezes teams. Live list and detail use two real DS inputs56×56 in ScoreMatch score slots. Integer nonnegative values, tie/blank cannot finish; winner computed server-side. Confirmation; final immutable and readonly, rematch starts separate draft. Offline finalized shows pending synchronization and cannot edit locally.

## DS

ScoreMatch live scoreContent {A,B} slots replace only numeric cells, preserve team labels/players/metadata; finished ignores slots and remains numeric. Optional statusLabel preserves defaults. Chip showSelectionIndicator renders native selected check without default icon. Removable right inset0 follows explicit approved documentation2098:55311 despite master right16. Tests/Storybook Light/Dark/320. App review can consume a reproducible prerelease tarball built from DS PR commit; no npm release fabricated. Replace review dependency with approved published DS version before app production adoption.

## Storage/synchronization

IndexedDB: one atomic persisted state per API URL, confirmed snapshot + FIFO outbox + local presence/pregame draft. Do not acknowledge a local operation until its IDB transaction commits. Legacy localStorage/cache/input remain intact, import/backup explicit. UUIDs are generated once client-side for create player/start match; match number remains server allocated, local placeholder until ack.

Every command has fixed request UUID, canonical payload, optimistic expected version. Append intent before network; projection derived from confirmed data plus queued commands. FIFO preserves create-player -> start-match -> score -> finish dependencies. Manual Home Sync sends then fetches; reconnect never auto-flushes. Uncertain response keeps identical request and payload. Server global idempotency receipt handles retries across session recreation. Transactionally apply ack/remove queue item; crash after server commit safely replays. Stop on conflict/definitive error without deleting intent. Explicit conflict review may choose server state, discarding command plus transitive dependents only after confirmation; export available. No automatic rebase/overwrite or name merging. IDB lease/BroadcastChannel coordinates tabs; renewal/rechecking before requests plus idempotency and expected versions protect expired lease replay.

Scores/finalization reduce locally for offline ranking but final confirmation remains pending until remote ack. Initialization may read remote without flushing outbox; overlay never mutates captured expected versions. Revision/version guards prevent stale reads/acks rolling back newer confirmed state.

## Server/data

Additive migration, new fixed lifecycle RPC; validated parameterized SQL only. Existing historical winner rows become finished with explicitly unknown legacy scores (no invented points); winner-null matches become in progress. Preserve IDs, numbers, participants, names and archive flags. Add state, nullable scores, serving_side, legacy-result marker. New commands create player with supplied UUID, reactivate, start match, save scores, finish; server derives winner and rejects immutable finished changes. Existing raw mutation routes must not bypass deactivation/finalization restrictions, even by calling RPC directly. Preserve receipts/recovery of previously accepted requests.

Deactivation is online only. Separate authorization parameter is never persisted in outbox/receipts/audit or echoed/logged. Server/DB verify against private configuration, with durable attempt throttling including failed attempts; missing config fails closed. No public/private project keys in frontend. Final authorization checked in database too, preventing bypass of Edge via RPC. Settings/authorization table private and RLS/restricted, no schema usage for browser roles. No production secret required to prepare/test; secure configuration is an activation prerequisite.

## Validation

Actual SQL migrations in PGlite + real API handler, mocked Auth only. Test direct-RPC authorization bypass, key redaction, constraints/grants, legacy preservation, immutable final rows, idempotency, conflict, normalization/reactivation, offline reload, lost ack, dependency ordering, multiclient/tabs, queue persistence/storage failure, unavailable service, keyboard/touch/drag and Light/Dark320. No live production fixtures/writes required or authorized.

## Review implementation and local evidence

DS PR24, exact source commit5df85620b0e082de81700b2755ba5ec7d86a5f91; CI Quality/Storybook/browser tests passed. App vendor digest is checked by verify:ds-review and npm lock integrity; this is a review dependency, not a published release. UI is separated into HomeScreen, PresenceScreen, PrepTeams, MatchPanel, DialogViews and ConflictDialog; LifecycleApp coordinates navigation/actions, engine owns journal/transport.

Local validation: lint, formatting, TypeScript frontend/backend and production PWA build passed;112 unit tests (89.55% lines,90.07% branches, no threshold reduction),50 SQL/API/client tests,49 browser cases passed across393/320/1440 with2 intentional skips (native pointer test desktop-only; keyboard move covered everywhere). Browser fixture uses the actual handler and complete migration chain in PGlite; only external Auth is simulated. Captures compare live, home, presence, pregame and confirmation in Light/Dark; axe and layout assertions passed. Initial spinner is checked while reads are paused; IDB quota/corruption, lost acknowledgements, manual reconnect behavior, cross-device conflict, cross-tab lease/dirty input and legacy import/recovery are covered. No production fixtures, migrations or deployment.

Runtime JS scan found no embedded project key/JWT, server key variable or test authorization phrase. Lifecycle CSS references only existing DS tokens. No claim of pixel-perfect parity, real GoTrue certification, PostgreSQL multiconnection load testing, or newly deployed service. Production deactivation is intentionally unavailable until the responsible person defines/configures its secret through a secure administrative parameterized session. README describes staging and coordinated activation; no secret was requested or invented to prepare these PRs.

Review hardening: an uncertain online deactivation blocks incompatible new intents until its receipt is recovered; queue checks are repeated inside the same leased IDB transaction. Legacy archived unfinished matches remain read-only even when the old cache did not include an archive timestamp; no date is fabricated. Browser regression covers both cases.

Malformed v1 pending journals are not silently filtered away by import/recovery: a strict check blocks replacement and preserves the original raw journal for backup.
