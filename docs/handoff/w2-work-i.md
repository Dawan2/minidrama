# Handoff — Wave 2, Work Slot I: wiring playback to the entitlement decision

> **Branch:** `cursor/w2-work-i-e53c`, cut from `cursor/w2-work-f-d409` (`73babb0`).
> **Scope:** the last open item of slot F's S36. `POST /v1/playback/sessions` stops deciding
> entitlement from the episode id and starts asking `decideEpisodeAccess`, reading the same facts
> through the same port instance that answers `POST /v1/entitlement/episode-access`. `NEED_UNLOCK`
> and `NEED_VIP` refuse without a VePlayer descriptor existing anywhere in the request; `ALLOWED`
> answers `201` with identifiers and no media URL.
> **Not in scope:** the rules inside `modules/entitlement/access.ts`, which are untouched; watch
> progress and the app feed UI, both in flight elsewhere; the unlock write path; the data layer; the
> lazy `play_auth_token` fetch. `app/` is byte-identical and no pull request was opened.
> **Endpoint identity:** transcribed from the binding X-19 adjudication,
> `docs/plan/x19-playback-endpoint.md` §1.1 (`cursor/w2-plan-p3-477e`, `55cda09`). Nothing about the
> name, method, success status or operation id is changed here — see §5.

---

## 1. What was wrong

Wave 1 shipped the playback contract and a deny path with a placeholder in the middle of it:

```ts
/** Stub entitlement rule, deliberately explicit so tests exercise a real deny path. */
function isEntitled(episodeId: string): boolean {
  return !episodeId.startsWith('ep_locked');
}
```

Slot F then built the real decision — one pure function, 53 tests, two domain defects closed — and
deliberately did not wire it in, because with the facts port defaulting to "refuse" the wiring would
have turned playback's stub tests into denials inside a slot that did not own playback (S36,
`docs/handoff/w2-work-f.md` §3). This slot is that wiring.

Three things were wrong while the stub stood, and only the first is obvious.

**The enforcement point had its own opinion.** `POST /v1/entitlement/episode-access` and
`POST /v1/playback/sessions` answer the same question about the same viewer and the same episode.
One read `drama.freeEpisodes`, the viewer's unlock rows and their subscription against server time;
the other read a string prefix. Two independent implementations of one commercial rule do not stay
in agreement, and the direction they drift in is not symmetric: the browse view says "you own this",
the play attempt says "pay again".

**A denial still assembled a descriptor.** The stub's `403` path returned before the descriptor
literal, so nothing leaked — but the descriptor was a constant sitting in the same function, and the
protection was that a `return` happened to come first. Nothing in the code said that resolving media
for an unentitled viewer was forbidden rather than merely unnecessary.

**`NEED_VIP` had no representation at all.** The stub produced exactly one denial,
`EPISODE_LOCKED` with `unlockOptions: ['COINS', 'AD', 'VIP']` — hardcoded, and wrong for a VIP-only
episode, which cannot be bought with coins and for which `AD` does not exist yet. A client rendering
a coin panel from that list offers a purchase the unlock endpoint would refuse (`422
UNLOCK_POLICY_NOT_ALLOWED`, `docs/12-api-contracts.md` §4.5).

---

## 2. What was delivered

| File | Contents |
|---|---|
| `server/src/modules/playback/routes.ts` | Rewritten around `decideEpisodeAccess`. Holds the verdict→HTTP mapping and no access rule of its own |
| `server/src/modules/playback/media-port.ts` | New. `PlaybackMediaPort` — where the `vid` comes from — and `createUnavailablePlaybackMediaPort`, the fail-closed default |
| `server/src/modules/playback/fixtures.ts` | New. A fixture `vid` per entitlement fixture episode, plus `createCountingPlaybackMediaPort`, which records what the route asked for |
| `server/src/modules/playback/routes.test.ts` | New, **48 tests** across issuance, `NEED_UNLOCK`, `NEED_VIP`, the lapsed subscription, the anonymous attempt, unavailable content, the assetless case and the unwired default |
| `server/src/app.ts` | Playback is registered with the **same** facts port and viewer resolver instance as entitlement, plus a media port that defaults to refusing |
| `server/src/app.test.ts` | The playback block now covers the unwired default (`503`) and keeps the `201`, the exact descriptor and the two negative media-URL assertions against a fixture-wired app |
| `server/src/modules/platform-tiktok/webhook-routes.test.ts` | Harness only: its raw-body scoping control borrows this endpoint, so it gains the fixture ports it now needs. No webhook behaviour changed |
| `contracts/openapi.yaml` | The four statuses the operation can now answer — `401`, `404`, `410`, `503` — and what distinguishes the two `503` codes |

Nothing under `server/src/modules/entitlement/` was modified. `git diff --stat` against the base
lists eight files and none of them is `access.ts`, `facts-port.ts`, `viewer-resolver.ts` or the
entitlement fixtures.

### 2.1 The verdict mapping

`decideEpisodeAccess` produces one verdict; this table is the whole of what playback does with it.

| Verdict | Answer | Why |
|---|---|---|
| `unavailableCause: NOT_PUBLISHED` | `404 CONTENT_NOT_FOUND` | Same mapping as the decision endpoint. A draft outranks a withdrawal, so unreleased content is reported absent rather than confirmed to exist |
| `unavailableCause: WITHDRAWN` | `410 CONTENT_OFFLINE` | |
| `unavailableCause: MISCONFIGURED_PRICE` | `503 COMMON_SERVICE_UNAVAILABLE` | A paid episode with no usable price. Quoting `0` would let the unlock endpoint charge nothing |
| `playable: false`, anonymous viewer | `401 AUTH_REQUIRED` | `docs/12-api-contracts.md` §4.4. See §3.3 |
| `NEED_VIP` | `403 EPISODE_VIP_REQUIRED` | The episode cannot be bought; the option is a subscription |
| `NEED_UNLOCK` | `403 EPISODE_LOCKED` | A conversion opportunity, carrying the price and the options that would fix it |
| `playable: true` | `201` + descriptor | After, and only after, resolving the media |

Every denial carries `details: { episodeId, unlockPolicy, unlockOptions, priceCoins }`, taken from
the verdict rather than composed locally. `docs/12-error-catalog.md` specifies `{ episodeId,
unlockPolicy, priceCoins }` for `EPISODE_LOCKED`; `unlockOptions` is added because it is the field
`contracts/openapi.yaml` already says drives the unlock panel, and because it is the only field that
distinguishes "coins" from "coins or VIP" without the client re-deriving policy.

The unlock context rides on the anonymous `401` too, so a client can render "sign in to unlock for
300 coins" in one step. It discloses nothing: the decision endpoint already quotes the same price to
the same anonymous caller with a `200`.

### 2.2 A denial does not mint a descriptor, and does not look one up

The requirement is that `NEED_UNLOCK` produces no VePlayer descriptor. The response body is the weak
half of that: an absent `vid` in a `403` proves the descriptor was not *sent*, not that it was never
assembled. A route that resolved the media first and discarded it on the deny path would satisfy a
body assertion while still reading the media-asset store on behalf of someone who has not paid.

So the guarantee is structural. The `vid` does not come from the access facts — the entitlement
module carries no media reference of any kind, not even in its fixtures
(`docs/handoff/w2-work-f.md` §4) — it comes from `PlaybackMediaPort`, and the only call to that port
sits below the single `if (!access.playable)` gate. A refused request never reaches it.
`createCountingPlaybackMediaPort` records every episode id the route asks about, and the assertion
is `expect(media.lookups).toEqual([])`, applied to **every** denial in the suite through the shared
`denied()` helper — commercial, unavailable, unauthenticated and malformed alike.

### 2.3 One facts port, not two

`buildApp` constructs the entitlement facts port and the viewer resolver **once** and hands the same
instances to both modules. Registering playback with its own `createUnavailableEntitlementFactsPort()`
while entitlement got the injected one is a two-character mistake that a reader would not notice, so
it is reverse-verified: it fails 34 tests (§4).

Above that, `routes.test.ts` ends with a table that asks both endpoints about six viewer/episode
pairs and asserts they agree on playability — the two differ on *status* by design, never on the
verdict.

---

## 3. Decisions taken in this slot

Numbering continues from `docs/handoff/w2-work-f.md` §3.

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| S38 | **The media identifier comes from a port, and the port is consulted only after the verdict permits playback** | §2.2. It converts "we remembered to return early" into "there is no path from a denial to the media-asset store", and it gives the test something to assert other than the absence of a field. It also keeps the `vid` out of the entitlement module, which correction A4 requires: a decision endpoint that knows the media identifier is a second, unaudited source of media references | Moving one `await` above one `if`, which is precisely what the counting port exists to catch |
| S39 | **The media port defaults to refusing, and an entitled viewer with no asset is `503 EPISODE_ASSET_UNAVAILABLE`** | The same posture as the entitlement facts port (S33): the media-asset table is W7 work and an unwired deployment must not invent a video id. The code already existed in the catalogue at `503` with no producer; it has one now. Reporting a missing asset as `EPISODE_LOCKED` would be worse than a plain failure — it invites a viewer who has already paid to pay again | Injecting a real port, which is the intended path |
| S40 | **`NEED_VIP` gets `EPISODE_VIP_REQUIRED`, not `EPISODE_LOCKED` with a `VIP` option** | The two denials lead to different purchases and different endpoints. Collapsing them makes the client infer the difference from `unlockOptions`, which is the inference `docs/12-api-contracts.md` §3.3 forbids, and a coin panel rendered for a VIP-only episode offers a purchase `POST /episodes/{id}/unlock` answers `422` | One ternary; three tests fail when it goes |
| S41 | **An anonymous viewer denied a paid episode gets `401`, not `403`** | §3.3 below | One condition; two tests |
| S42 | **The album id is read from the facts that authorized the request** | `facts.drama.id` is already in hand and is by definition the drama the access decision was made about. Resolving it separately would let the descriptor name a different drama than the one that was authorized — the sort of mismatch that is invisible until an entitlement bug is being investigated and the two records disagree | One expression |
| S43 | **The verdict→HTTP tables are duplicated from `modules/entitlement/routes.ts` rather than shared** | The three shared tables are 20 lines and the modules genuinely differ on the fourth (`playable: false`). Extracting them would create a module that exists only to be imported by two callers and whose one job is to stay identical — and the day the tables legitimately diverge, the shared version grows a flag. The duplication is asserted instead: the six-case agreement table would catch a real divergence | Extracting them later is additive |
| S44 | **`resumePositionSec` stays `0`** | Watch progress is in flight in another slot and owns that field. Hardcoding `0` is wrong for a returning viewer and never wrong about entitlement, which is this slot's subject. The comment names the owner so it is not read as an oversight | One field |
| S45 | **The webhook module's scoping control was repaired rather than rewritten** | `webhook-routes.test.ts` uses `POST /v1/playback/sessions` as the control proving its raw-body parser stays inside its own plugin (X-19 §3 calls this out as load-bearing). Playback now refuses unless the entitlement facts are wired, so the control needed the fixture ports to still get its `201`. Three lines in that file's harness and one episode id; no assertion about webhook behaviour was touched | Trivial, and the alternative — weakening the control to accept a `503` — would have cost the test its point |

### 3.1 What was deliberately not changed

`modules/entitlement/access.ts` is byte-identical. Every case this slot exercises was already
decided correctly by slot F, including the two that took the most argument to get right, and the
mapping table in §2.1 is a translation of its output rather than a second reading of the rules. The
one behaviour that looks like an access rule and lives here instead is the anonymous `401` — §3.3
explains why that belongs to the enforcement point.

### 3.2 Where the two endpoints differ, and why that is not a disagreement

| | `POST /v1/entitlement/episode-access` | `POST /v1/playback/sessions` |
|---|---|---|
| `NEED_UNLOCK`, signed in | `200`, `playable: false`, price quoted | `403 EPISODE_LOCKED` |
| `NEED_UNLOCK`, anonymous | `200`, `playable: false`, price quoted | `401 AUTH_REQUIRED` |
| `playable: true` | `200`, `playable: true`, no media identifier | `201` + descriptor |

One reports state and the other refuses an attempt (S32). The client renders an unlock panel from
the first and never has to interpret an error to know what a viewer owns; the second is where the
commercial gate is actually enforced, and an enforcement point that answered `200` to a locked
episode would be one `if` in a client away from being no gate at all.

### 3.3 The anonymous `401`

`docs/12-api-contracts.md` §4.4 says an anonymous viewer requesting a paid episode gets `401
AUTH_REQUIRED`, and `decideEpisodeAccess` answers the same viewer `NEED_UNLOCK`. Both are right.
For a browse view, "this costs 300 coins" is the truth about the episode and does not depend on who
is asking. For an attempt, it is an answer the viewer cannot act on: there is no wallet to spend
from and no account to record the unlock against, so quoting the price asks them to solve the second
problem before the first. Slot F named this as the one case belonging to playback rather than to the
decision function (`docs/handoff/w2-work-f.md` §5), and it is implemented as a mapping of the
verdict, not as a second rule — the decision is unchanged, only what playback does with it.

The unlock context still rides on the `401`, so the client is not forced to make a second call after
sign-in to learn what it is asking the viewer to buy.

---

## 4. Reverse verification

Each rule was reintroduced as a defect on a scratch copy and the suite re-run, per `SR-1`. A rule
nothing fails for is a rule that is not being enforced. Scope is `src/modules/playback` +
`src/app.test.ts` (55 tests) except where noted.

| Defect reintroduced | Failing tests | Representative names |
|---|---|---|
| Media resolved before the playability gate | **16** | `never asks the media port about an episode it is about to refuse`, `does not resolve the media for the lapsed subscriber it refuses`, `resolves the media exactly once, and only for the episode that was authorized`, + 13 |
| The Wave 1 stub `isEntitled` restored in place of the verdict | **19** | `refuses a coin-only episode to a live subscriber, offering coins and not VIP`, `refuses an episode the lapsed subscriber only ever watched as a VIP`, `agrees on ep_fx_s2e07 for usr_fx_vip_active`, + 16 |
| Playback registered with its own facts port instead of the shared one | **34** *(full server suite, 317 tests)* | The whole fixture-backed surface, including the agreement table |
| `NEED_VIP` collapsed into `EPISODE_LOCKED` | **3** | `refuses a VIP-only episode with EPISODE_VIP_REQUIRED, not EPISODE_LOCKED`, `quotes no coin price for an episode that cannot be bought`, `refuses an episode the lapsed subscriber only ever watched as a VIP` |
| Unavailability not separated from a commercial denial | **5** | `reports a draft episode as absent rather than as taken down`, `reports a free episode of a withdrawn drama as gone`, `refuses a paid episode with no usable price, and quotes nothing` |
| Anonymous denial answered `403` instead of `401` | **2** | `asks an anonymous viewer to sign in rather than quoting a 403`, `asks an anonymous viewer to sign in for a VIP-only episode too` |
| `albumId` hardcoded rather than taken from the facts | **2** | `issues one for a free episode, naming the drama it was authorized against`, `issues a playback descriptor for an entitled episode` |

Two rows deserve a note.

The **eager media lookup** fails 16 tests rather than the two obvious ones, and that is the point of
routing every denial through the shared `denied()` helper: the ordering is asserted on unavailable
content and rejected credentials as well as on commercial locks, because "we do not read the media
store for a request we are about to refuse" is not a rule about paying customers specifically.

The **separate facts port** row is the largest and the least visible in review. It is not a wrong
rule; it is the same rule reading a different world, and with both defaults refusing it would look
completely correct in production until the day a real port was injected into one registration and
not the other.

### 4.1 Gates

Every gate was run on this branch.

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **450 passing, 0 skipped, 0 failing** — 317 server (was 268), 109 app, 16 config, 8 shared |
| Build | `pnpm build` | pass — `assets/index-B_KnFxaH.js` 242.80 kB (78.07 kB gzipped), byte-identical to the base |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

The server gained 49 tests: the 48 in `routes.test.ts` and one in `app.test.ts` for the unwired
default. No test was skipped or deleted. Two pre-existing files changed assertions, both because the
behaviour they described genuinely changed: `app.test.ts`'s playback block (the stub's episode ids
no longer exist) and the webhook scoping control (S45).

---

## 5. X-19 compliance

`docs/plan/x19-playback-endpoint.md` is binding for the identity of this endpoint, and this slot
transcribes it without amending it. No conflict is registered against it.

| Bound | Value | State on this branch |
|---|---|---|
| BD-1 path | `/v1/playback/sessions` | Unchanged |
| BD-2 method | `POST` | Unchanged |
| BD-3 shape | Absolute, `/v1` in the path, no `/api` prefix | Unchanged |
| BD-4 status | `201 Created` | Unchanged, and still asserted with the exact descriptor body |
| BD-5 `Location` | Absent | Unchanged |
| BD-6 operation id | `createPlaybackSession` | Unchanged |
| BD-7 legacy path | Superseded, recorded, not deleted | Untouched; V-1 (`git grep -n "playback-token" -- app server contracts packages`) still returns nothing |

V-5 in §8 of that file — "the `201` and the descriptor body still hold, `server/src/app.test.ts`,
status, exact body, and the two negative assertions on media URLs" — is preserved literally. The
test now runs against a fixture-wired app, because the unwired one correctly refuses, and the same
three assertions are made in `routes.test.ts` across three viewer/episode pairs.

What this slot *did* change in the contract is the failure surface, which X-19 §1.2 explicitly does
not bind (owner **B**, carrier `CTR-009`/`CTR-010`). The four statuses added — `401`, `404`, `410`,
`503` — are the ones the implementation can now produce, and `contract.test.ts` binds every
documented operation to a live handler, so omitting them would mean the statuses a client must
handle are exactly the ones it is never told about. The choices are the same ones slot F made for
the decision endpoint and are open to B's adjudication at `CTR-009`; the `403` split into
`EPISODE_LOCKED` / `EPISODE_VIP_REQUIRED` is from `docs/12-error-catalog.md`, not new here.

---

## 6. Deliberately not built

- **No change to `modules/entitlement/`.** The decision, the facts port, the viewer resolver and the
  fixtures are byte-identical. This slot consumes them.
- **No watch progress.** `resumePositionSec` is `0` (S44). The slot that owns it changes one field
  and one comment.
- **No `app/` change.** No client file, no lint rule, no `app/tools/` guardrail. The built bundle
  hashes identically to the base, so the feed UI work in flight needs no rebase.
- **No unlock, wallet or order write path.** This endpoint refuses; it never charges, grants or
  records.
- **No `play_auth_token` fetch.** The lazy fetch for TikTok clients below 44.5.0 is W10. The field is
  optional in `PlaybackDescriptor` and is never populated here.
- **No session storage.** The viewer resolver is still slot F's interface with a fail-closed default.
- **No rate limiting, no `playbackSessionId`, no failure-report subresource.** All three are named in
  X-19 §1.2 as slot B's at `CTR-009`/`CTR-012`, and none is needed to close S36.
- **No real media-asset lookup.** `PlaybackMediaPort` is an interface with a refusing default and a
  fixture implementation. The table it stands in for is W7.

---

## 7. For the next slots

**For whoever lands the data layer (W7).** There are now two ports to implement, not one.
`EntitlementFactsPort` is unchanged and slot F's notes still apply. `PlaybackMediaPort` is new and
deliberately narrow: one episode id in, one `vid` out. Keep it that way — the moment it returns a
URL, a signed URL or a quality ladder, correction A4 is violated at the only endpoint that could
violate it, and `app.test.ts` asserts against the raw response body rather than named fields so the
regression surfaces immediately. `server/src/modules/playback/fixtures.ts` doubles as the shape of
the seed data.

**For whoever owns watch progress.** `resumePositionSec` is the one field in the descriptor this
slot could not fill. It is read at issuance, so it wants the viewer's position for this episode at
the moment the session is minted — a read on the same request, not a client-supplied value. Note
that the anonymous path reaches `201` for free episodes, so the lookup has to tolerate a `null`
viewer.

**For whoever owns the app feed and player.** The client contract changed in three ways that matter
at the call site: a locked episode may now answer `401` rather than `403` when there is no session,
`EPISODE_VIP_REQUIRED` is a distinct code from `EPISODE_LOCKED` and needs its own panel, and `503`
carries two codes with different meanings — `COMMON_SERVICE_UNAVAILABLE` is retryable and
`EPISODE_ASSET_UNAVAILABLE` means the viewer is entitled but the video is not ready, which must not
be shown as a lock.

**For slot B at `CTR-009`.** The failure surface in `contracts/openapi.yaml` is now what the server
actually does, so the transcription has an implementation to check against rather than a proposal.
If `playbackSessionId` is kept, it is minted in this handler and the `201` body grows one field;
nothing in the entitlement path is affected.

**For whoever writes the "no access decision outside the entitlement module" guard.** Slot F named
this as a known gap (§6). It is now cheaper to build and more worth building: playback was the one
module with its own access logic, there is nothing left in `server/src` that decides entitlement
outside `access.ts`, and a guard added today would be starting from a clean tree rather than from an
exception list.

---

## 8. Known gaps in this slot's own work

- **Nothing is proven against a database.** Every happy path here runs on fixtures. The wrapper is
  tested; the query is not, because it does not exist.
- **The `vid` is unvalidated.** The port returns a string and the route puts it in the descriptor.
  An empty string, or an id belonging to a different episode, produces a `201` that fails inside
  VePlayer with no server-side trace of why. The fixture port cannot exhibit that; a real one can.
- **The agreement between the two endpoints is asserted on six pairs, not proven.** They share a
  facts port and a decision function, so they agree structurally, but nothing prevents a future
  handler from being registered with a different port. The test catches the mistake for the six
  cases it covers.
- **The `403` details are a superset of the error catalogue.** `docs/12-error-catalog.md` gives
  `EPISODE_VIP_REQUIRED` only `{ episodeId }` and this sends four fields. That is deliberate — the
  extra fields are `null` or `['VIP']` and save the client a call — but it is a divergence from the
  document, and the document is B's to reconcile at `CTR-009`.
- **`unlockOptions` still cannot say `AD`.** The decision function's vocabulary is `COINS | VIP`
  until ad unlocking exists (W16). A client that renders an ad option today is rendering it from
  nothing.
- **No test covers concurrent issuance.** Sessions are non-idempotent by design and nothing here
  serialises them. That is correct for a stateless descriptor and becomes a real question the moment
  `playbackSessionId` or a concurrent-stream ceiling lands.
- **The platform's own gates are still invisible from here.** Moderation state, online version and
  client authorization are enforced independently by TikTok and can refuse an episode this endpoint
  approved (correction A4). The `201` means the commercial gate opened, and nothing more.
