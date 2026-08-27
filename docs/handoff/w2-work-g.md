# Handoff — Wave 2, Work Slot G: server watch progress

> **Branch:** `cursor/w2-work-g-d191`, cut from `cursor/w2-work-e-1aaa` (`cc943a0`).
> **Scope:** the server side of `PRG-001` — a viewer reports where they are, and asks where to
> resume. Two endpoints, the merge rules behind them, and the seam that says which viewer is asking.
> **Not in scope:** the catalogue, the feed, entitlement, the playback descriptor and the player. No
> file under `server/src/modules/playback/`, no catalogue or entitlement module and no client code was
> touched, so the slots in flight around this one keep their files. No media URL, no `<video>`, no
> pull request.

---

## 1. What exists now

```http
PUT /v1/progress/episodes/{episodeId}
Authorization: Bearer <session>

{ "positionSec": 45, "durationSec": 95, "clientUpdatedAt": "2026-08-27T12:00:00.000Z" }
```

`204`, empty body. Also `204` when the report is dropped as stale — see §3, decision S40.

```http
GET /v1/progress/episodes/{episodeId}
Authorization: Bearer <session>
```

```json
{
  "episodeId": "ep_01J6...",
  "resumePositionSec": 45,
  "completed": false,
  "recorded": true,
  "durationSec": 95,
  "updatedAt": "2026-08-27T12:00:00.000Z"
}
```

`Cache-Control: private, no-store`. For an episode this viewer never watched: `200` with
`resumePositionSec: 0`, `completed: false`, `recorded: false`, and no `durationSec` or `updatedAt`.

| Failure | Status | Code |
|---|---|---|
| No verifiable session — missing, rejected or unverifiable credential, undistinguished | `401` | `AUTH_REQUIRED` |
| A field is missing or the wrong type; `episodeId` empty or over 64 characters | `400` | `COMMON_VALIDATION_FAILED`, with `details.fields[]` |
| A position that cannot be true of the episode: negative, or more than 2 s past `durationSec` | `400` | `PROGRESS_INVALID_POSITION`, with `details.positionSec` and `details.durationSec` |

The field names are aligned with `docs/design/playback-contract.md` §3.1 on `cursor/w2-work-a-71b2`:
the read answers **`resumePositionSec`**, the same key the playback descriptor carries, so a client
that resumes reads the same field whichever endpoint answered. The write keeps `positionSec` from
`docs/12-api-contracts.md` §4.7. Decision S29 explains why the asymmetry is deliberate.

---

## 2. What was delivered

| File | Contents |
|---|---|
| `packages/shared/src/progress.ts` | New. `WatchProgressReport` (write) and `EpisodeResumeView` (read), the two wire shapes, with the field-naming rationale |
| `packages/shared/src/errors.ts` | `PROGRESS_INVALID_POSITION` added to `API_ERROR_CODES`, now that it has a producer |
| `server/src/modules/progress/progress.ts` | New. The rules as pure functions: `validateProgressReport`, `validateEpisodeId`, `isCompleted`, `mergeReport`, and `WatchProgressRules` with the four tolerances |
| `server/src/modules/progress/store.ts` | New. `WatchProgressStore` (read one row, write one row, async) and an in-memory implementation keyed `(userId, episodeId)` |
| `server/src/modules/progress/viewer.ts` | New. `ViewerResolver`, RFC 6750 bearer parsing, a session-lookup resolver, and the default resolver that refuses everything |
| `server/src/modules/progress/routes.ts` | New. The two handlers: resolve the viewer, validate, read, merge, save, answer |
| `server/src/modules/progress/{progress,store,viewer,routes}.test.ts` | New. 87 tests |
| `server/src/app.ts` | Registers the module and adds `watchProgressStore` and `viewerResolver` to `AppDependencies`. Additive; nothing existing changed |
| `contracts/openapi.yaml` | Both operations, both schemas, and the `bearerSession` security scheme — the first one in the document, because progress is the first endpoint whose answer is per-viewer |
| `server/src/contract.test.ts` | The two new operations added to the expected set |

### 2.1 Where each rule lives, and why not in the handler

Everything that decides *what is stored* is a pure function in `progress.ts`. The handler resolves
the viewer, validates, reads, merges, saves and answers; it makes no decision of its own. This is not
tidiness. Every rule below is a case ordinary traffic produces, each has a different correct answer,
and a rule asserted only through HTTP is a rule nobody can change with confidence.

| Rule | Answer | Where it is tested |
|---|---|---|
| Two devices disagree | Last write wins on `clientUpdatedAt`, not on arrival order — arrival order is a property of the network (`PRG-001`) | `progress.test.ts`, "last write wins on the client clock" |
| The same heartbeat is re-sent | Equal timestamps keep the stored row, so the write is idempotent at one instant | same |
| The last `timeupdate` lands past the end | Clamped to `durationSec` | "the position, clamped or refused" |
| A report claims a position far past the end | `PROGRESS_INVALID_POSITION` | same |
| The position moves back by a second or two | Stored position unchanged, timestamp advanced | "backward noise" |
| The viewer rewinds deliberately | Honoured exactly | same |
| The episode reached 90 % | `completed`, computed server-side, sticky across a rewatch | "completion" |
| The device's clock is a year fast | Pulled back to server time + 300 s | "a client clock we do not control" |

### 2.2 The backward-noise rule, stated plainly

This is the one rule in the slot that loses information on purpose, so it is worth writing out.

A report whose timestamp is newer but whose position moved **backwards by no more than two seconds**
does not move the stored position. The report is still accepted: the timestamp and the duration
advance, and the decision is recorded as `ADVANCED_TIMESTAMP_ONLY`.

- **Why anything at all.** Out-of-order heartbeats are already handled by the timestamp comparison.
  What is left is jitter — position quantisation, a scrub preview, a re-buffer that reports the
  previous keyframe. None of those is a viewer decision, and honouring them costs the viewer a rewind
  they did not ask for.
- **Why it is safe.** A real backward seek is never two seconds; a viewer who rewinds moves further
  and is honoured exactly. The worst case is resuming up to two seconds later than the true position,
  which is inside `PRG-002`'s ±5 s acceptance criterion.
- **Why the timestamp still advances.** If it did not, the *next* legitimate rewind would be compared
  against a stale timestamp and dropped as older than what we hold. There is a test for exactly that
  sequence: jitter, then a real seek to 5 s, which is stored.
- **How to turn it off.** `backwardJitterToleranceSec: 0` honours every backward move. There is a
  test asserting that, so the reversal is one number and not an archaeology exercise.

### 2.3 Verification

Every gate was run on this branch.

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **384 passing, 0 skipped, 0 failing** — 251 server (was 162), 109 app, 16 config, 8 shared |
| Build | `pnpm build` | pass — `assets/index-*.js` 242.80 kB (78.07 kB gzipped), byte-identical to the base |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |
| Whole pipeline | `pnpm verify` | pass |

The 89 new tests are the four new files (87) plus two operations added to the contract test's expected
set. No existing test was modified, skipped or deleted. The client bundle is unchanged — nothing in
this slot is reachable from `app/src`.

---

## 3. Decisions taken in this slot

Numbering continues from `docs/handoff/w2-work-e.md` §3.

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| S28 | **`PUT`/`GET /v1/progress/episodes/{episodeId}`, with the `/v1` prefix** | `docs/12-api-contracts.md` §4.7 writes it without one, but every running route in this server is `/v1/…` and slot A's endpoint adjudication (`docs/design/playback-contract.md` §2) settled the same question the same way. An unprefixed path here would be the only one in the document | One string; registered for slot B in §5 |
| S29 | **The read says `resumePositionSec`, the write says `positionSec`** | The read is an instruction about the future and is the same value the playback descriptor carries under that exact name (`playback-contract.md` §3.1), so a client resumes from one key regardless of which endpoint answered. The write is an observation about the past and keeps its documented name. Making both `positionSec` would put the resume value under two names across two endpoints; making both `resumePositionSec` would have clients reporting a "resume position" they are not resuming to | One field name in two files |
| S30 | **An unwatched episode answers `200` with `resumePositionSec: 0` and `recorded: false`, not `404`** | "You have never watched this" is a complete answer to "where do I resume". A `404` would make the first play of every episode traverse an error path. `recorded` exists because a continue-watching list has to tell "never watched" from "watched, position 0", and those are identical through the position alone | One branch |
| S31 | **Small overshoot is clamped; large overshoot is refused** | This reconciles the two instructions that both apply. `docs/12-error-catalog.md` §8 gives a negative or far-past-duration position its own code, and clamping everything would let one call mark any episode complete — which is a completion metric and, later, a `PRG-001` completion flag. Clamping nothing would reject the last `timeupdate` of a normal playthrough, which lands a hair past the end | `overshootToleranceSec`, one number |
| S32 | **Backward moves inside two seconds do not rewind the stored position, and the report is still accepted** | §2.2 | `backwardJitterToleranceSec: 0` |
| S33 | **`clientUpdatedAt` is required, not defaulted to server time** | A default would make a client that omits the field win every conflict against one that sends it — the inverse of the intended rule, invisible until two devices disagreed. `PRG-001`'s acceptance criterion adjudicates on this field, so a report without it cannot be adjudicated | One branch, and a rule nobody could trust afterwards |
| S34 | **A `clientUpdatedAt` more than 300 s ahead of server time is pulled back to server time, not rejected** | A device set a year forward would otherwise win every comparison it ever takes part in, pinning that viewer's row for that episode permanently — no later report from any device could displace it. Clamping degrades that device to arrival ordering, which is what it would have had with no timestamp at all. Rejecting would silently stop recording progress for a viewer whose only fault is a wrong clock | `futureSkewToleranceSec` |
| S35 | **`completed` is server-computed, sticky, and a client-reported `completed` is ignored** | `docs/design/domain-model.md` §4.5 requires the first two. Sticky is ours: completion is a fact about the viewer's history, and clearing it on a rewatch would let a rewatch subtract from a completion count | One line each |
| S36 | **Equal timestamps keep the stored row** | A re-sent heartbeat after a network failure is the common case, and treating it as newer would let two devices with synchronised clocks flip the row on arrival order — the exact thing the timestamp exists to stop | One comparison |
| S37 | **The viewer resolver refuses every request by default, and all three refusal reasons answer one `401 AUTH_REQUIRED`** | No session in this deployment is verifiable: `createSessionIssuer` keeps no token-to-user mapping, deliberately, and the platform code exchange refuses every request. A resolver that trusted a token or read a user id from a header would let a caller choose whose progress to read and write, and it would pass every test written against it. This is slot C's `createUnavailableIdentityPort` reasoning applied to the read side. The undistinguished `401` is the same anti-oracle rule the login endpoint already follows; the reason goes to the log | The whole point is that it is one function to implement, not a policy to unwind |
| S38 | **The store is `(userId, episodeId)` → row, with a `\u0000` separator, and the merge decision lives above it** | The key is `watch_progress`'s primary key and the reason one viewer's position can never be served to another; a printable separator is how a viewer named `a:b` reads another viewer's row. The merge is a pure function rather than a store method so the same predicate can move into the SQL `WHERE` clause the durable path needs (`domain-model.md` §4.5) | None; the interface is two methods |
| S39 | **`episodeId` is bounded at 64 characters** | Clear of a prefixed ULID and deliberately below Fastify's default `maxParamLength` of 100, past which the router refuses with a `414` and no view of which parameter was at fault. Keeping our bound the tighter of the two means the same defect always gets the same answer | One constant |
| S40 | **The write answers `204` with an empty body, including when the report is dropped** | `docs/12-error-catalog.md` §8 is explicit that progress reporting is tolerant and a stale report is not an error; an error would teach the client to retry a report it is right to have dropped. The empty body is the other half: the client already knows what it sent, and returning the merged row would invite it to trust a value that may have come from another device mid-scrub | One response body |
| S41 | **The read is `private, no-store`** | A resume position is per viewer, and a shared cache holding one is a cross-user leak waiting for a misconfigured proxy (`docs/design/api-contracts.md` §7.3 already specifies this cache row) | One header |
| S42 | **No drama-level endpoint in this slot** | `GET /progress/dramas/{dramaId}`, the watch-history list and the continue-watching card all need an episode-to-drama mapping, which belongs to `catalog` — in flight in an adjacent slot. Inventing a mapping here would be a second source of truth for it | Nothing built to remove |

---

## 4. Deliberately not built

Listed so it is not re-scoped as an omission.

- **No wiring into the playback descriptor.** `POST /v1/playback/sessions` still returns
  `resumePositionSec: 0` from its stub. Folding the real value in is one call — read the store with
  the resolved viewer and the requested episode — but `server/src/modules/playback/routes.ts` is the
  entitlement slot's file this wave, and two slots editing one handler is how a merge loses a rule.
  §5 has the exact wiring.
- **No `GET /progress/dramas/{dramaId}`, no `GET /users/me/watch-history`, no
  `DELETE /users/me/watch-history/{dramaId}`, no continue-watching card.** All need `catalog`
  (S42). `PRG-003` is where they belong.
- **No episode-existence check.** A report against an identifier no episode has is accepted; it
  writes one row under the reporter's own user id and is invisible to everyone else. When `catalog`
  lands, the write should `404` on an unknown episode.
- **No rate limiting on the write.** It is the highest-frequency authenticated endpoint in the
  product and it has no per-user cap yet. The cap belongs with the shared rate-limiting work
  (`system-overview.md` §12), not in this module, and the honest note is that a client that ignores
  `progressHeartbeatSec` is currently only bounded by its own restraint.
- **No `identity` change.** `session.ts`, `routes.ts` and the identity port are byte-identical to the
  base. The viewer seam is a new file in this module precisely so that nothing another slot may be
  editing had to move.
- **No batch read.** Marking "watched" on an episode list is one request per episode today. The batch
  shape is `GET /progress/dramas/{dramaId}`, which is S42.
- **No client code.** Nothing under `app/src` was touched, no `<video>`, no `<audio>`, no
  `<source>`, no player, and no media URL appears anywhere in this slot. The read endpoint has a test
  asserting its body matches no `https?://`, mirroring the playback endpoint's.

---

## 5. For the next slots

**For whoever owns the playback descriptor** (`CTR-009` / the entitlement slot). The descriptor's
`resumePositionSec` is on the first-frame path and `AC-DISC-2` requires it to be the *server-side*
position. Once the viewer is resolved in that handler, it is:

```ts
const progress = await store.read(viewer.userId, episodeId);
const resumePositionSec = progress?.positionSec ?? 0;
```

`WatchProgressStore` is the whole dependency; take it as a route option the way this module does.
Two things worth deciding there rather than here: whether a `completed` episode resumes at `0`
(a product question — resuming a finished episode one second before the end is not a resume), and
whether the descriptor is where the position should come from at all, given that this slot also
exposes it directly.

**For whoever needs the viewer** (entitlement above all). Take `ViewerResolver` from
`modules/progress/viewer.ts` rather than growing a second one; when `identity` can verify a session,
the port moves there as a shared `preHandler` and both modules import it. If the entitlement slot has
already introduced its own viewer seam, the merge should collapse the two into `identity`'s — and the
resolver that survives must keep the property that matters: it refuses by default, and no user
identifier is ever read from anything the caller controls.

**For whoever implements the durable store.** Two properties of the in-memory implementation are
contracts, not accidents. The key is `(userId, episodeId)`; and the last-write-wins comparison must
end up in the upsert predicate (`INSERT … ON CONFLICT DO UPDATE WHERE excluded.client_updated_at >
watch_progress.client_updated_at`) rather than as application-level read-compare-write, which is what
makes concurrent flushes from several instances deterministic (`domain-model.md` §4.5). Note that
`mergeReport`'s backward-jitter and stickiness rules are *not* expressible in that predicate alone;
the Redis buffer is where they run, and the batch flush must not undo them.

**For slot B, as a transcription obligation** in the style of `playback-contract.md` §9:

| # | File | Required change |
|---|---|---|
| G-1 | `docs/12-api-contracts.md` §4.7 | Endpoint paths gain the `/v1` prefix (S28). Add the `GET /v1/progress/episodes/{episodeId}` read, which the document does not currently have — it only has the drama-level read. Record `resumePositionSec` as the read's field name and why it differs from the write's (S29) |
| G-2 | `docs/12-error-catalog.md` §8 | `PROGRESS_INVALID_POSITION` now has a producer, and its trigger is "negative, or more than `overshootToleranceSec` past `durationSec`" — small overshoot is clamped, not refused (S31) |
| G-3 | `docs/design/api-contracts.md` §7.3 | The cache row for the new per-episode read: `private, no-store`, same reason as the drama-level one |
| G-4 | `docs/12-domain-model.md` §7.1 | `completed` is sticky across a rewatch (S35) |

---

## 6. Known gaps in this slot's own work

- **One failure does not wear the standard error envelope.** Past Fastify's default
  `maxParamLength` of 100 the router refuses the request before any handler or error handler runs, so
  an over-long path parameter answers `414` with Fastify's own body rather than ours. This module has
  the first route in the server with a path parameter, so it is the first place the hole is reachable.
  Our own 64-character bound means no plausible identifier gets there, and there is a test recording
  the behaviour so a framework change shows up — but normalising it properly needs an app-level
  `onRequest` check, which belongs with whoever owns the envelope invariant.
- **`clientUpdatedAt` is an ordering key supplied by the caller.** The future clamp bounds the damage
  and the key is per user, so the worst case is a client corrupting its own resume position. It is
  still true that the server does not know whether a timestamp describes reality, and no amount of
  validation here can change that; the server-side alternative is arrival ordering, which is what
  `PRG-001` rejected.
- **The read-merge-write sequence is atomic only because Node is single-threaded.** Two concurrent
  reports from one viewer in one process serialise; two processes do not. This is exactly why the
  comparison has to move into the SQL predicate, and it is a real defect in the interim
  implementation rather than a theoretical one.
- **In-memory storage forgets everything on restart**, and evicts the least recently written row past
  10 000. Progress is the one kind of data a viewer notices losing, so the durable path is not
  optional work — `DAT-004`.
- **`completed` and the resume position can disagree with what a viewer expects.** A viewer who
  finished an episode resumes at the end of it, because this module reports the stored position
  faithfully and the "restart a finished episode" decision is a read-time product rule. It is stated
  in §5 rather than implemented, so today the behaviour is the unhelpful one.
- **Nothing measures the merge decisions.** `STORED`, `IGNORED_STALE`, `IGNORED_DUPLICATE` and
  `ADVANCED_TIMESTAMP_ONLY` are logged at debug and counted nowhere. A client release that started
  losing every conflict — a clock bug, a timezone bug, a serialisation bug — would be invisible until
  a viewer complained about resume positions. One counter per decision is the cheapest fix and it
  belongs with the observability work.
- **The two tolerances are guesses with reasons, not measurements.** Two seconds of backward jitter
  and two seconds of overshoot are defensible from how players behave, but the number that would
  settle them is the distribution of real reports, which does not exist yet. Both are named constants
  in one object for that reason.
