# Playback Contract — the VePlayer Descriptor

> **Wave 2 · work slot A.** Branch `cursor/w2-work-a-71b2`, based on `cursor/w2-plan-p1-0453` (`fc39e3e`).
> Date 2026-08-27.
>
> **Status: normative for the shape of the playback contract**, until `CTR-007` transcribes it into
> `contracts/openapi.yaml` at W3. From that point the OpenAPI document is the source of truth and this file is the
> rationale behind it (`docs/architecture/tech-stack.md` T13).
>
> **Why slot A owns this.** Correction `COR-4`/A4 changed the playback response from a signed URL plus quality ladder
> to a playback descriptor, and `docs/plan/w1-conflict-register.md` §3 records that **no task carried the change at
> all**. Slot A is the consumer of the descriptor and the owner of the player that consumes it
> (`docs/plan/w2-ready-queue.md` §2), so this slot writes the contract text and slot B transcribes it into the
> documents it owns. §9 is that transcription list, item by item.
>
> **What this file does not do.** It does not modify `docs/12-*` (slot B), `docs/design/api-contracts.md` (slot B),
> `docs/03-*` (P3) or `docs/14-*` (slot C). Every edit those files need is registered in §9 with an owner.
>
> Language: English, matching `docs/architecture/`, `docs/product/`, `docs/research/` and the Wave 2 plan set. The
> terminology map to the Chinese Wave 1 documents is in `docs/architecture/system-overview.md` §14.

---

## 1. The contract, in one page

```http
POST /v1/playback/sessions
Content-Type: application/json

{ "episodeId": "ep_01J6...", "clientCapabilities": { "needsPlayAuthToken": true } }
```

**`201 Created`** — the viewer is commercially entitled and our mirror of platform state says the episode is
playable:

```json
{
  "playbackSessionId": "pbs_01J6...",
  "albumId": "7401234567890123456",
  "episodeId": "ep_01J6...",
  "vid": "v0d00fg10000cq9...",
  "playAuthToken": "eyJhbGciOi...",
  "resumePositionSec": 45
}
```

`playAuthToken` is present **only** when the request declared `needsPlayAuthToken: true`, which is true only on
TikTok clients below 44.5.0 (§4).

**Failure outcomes**, which are three kinds of thing and must never be collapsed into two (§5):

| Outcome | Status | Code | Meaning | User-facing |
|---|---|---|---|---|
| Commercial lock | `403` | `EPISODE_LOCKED`, `EPISODE_VIP_REQUIRED` | We will not issue until the viewer pays, subscribes or completes an ad | Unlock panel — a conversion opportunity |
| Platform block | `409` | `EPISODE_PLATFORM_BLOCKED` | The viewer is entitled; the **platform** will not serve this album version | Blocked copy, no retry — an incident |
| Our own takedown | `410` | `CONTENT_OFFLINE` | We delisted it | Terminal, invalidate continue-watching |
| Not found / banned | `404` / `403` | `CONTENT_NOT_FOUND`, `AUTH_USER_BANNED` | — | Terminal |
| Asset not ready | `503` | `EPISODE_ASSET_UNAVAILABLE` | No `vid` yet (upload or moderation incomplete) | Retryable, "preparing" copy |
| Anonymous on a paid episode | `401` | `AUTH_REQUIRED` | — | Silent login, then retry once |

There is **no** `playUrl`, no `format`, no `quality`, no `expiresAt`, no manifest, no key endpoint, and no quality
ladder anywhere in this contract. §3.2 records each removed field and what replaced it.

---

## 2. Endpoint identity — an adjudication this slot had to make

Three artefacts named this endpoint three ways, and one of them is running code:

| Source | Endpoint | Success status |
|---|---|---|
| `docs/12-api-contracts.md` §4.4, `docs/design/api-contracts.md` §4.2, and `CTR-009`'s acceptance criterion in `docs/plan/w2-ready-queue.md` §4.1 | `POST /episodes/{episodeId}/playback-token` | `200` |
| `docs/architecture/system-overview.md` §5.2 sequence diagram | `POST /v1/playback/sessions` | not stated |
| `contracts/openapi.yaml` and `server/src/modules/playback/routes.ts` on `cursor/w1-repo-skeleton-e7c9` (`322bf9b`) | `POST /v1/playback/sessions` | `201` |

**Adopted: `POST /v1/playback/sessions`, `201 Created`.** Three reasons, in order of weight:

1. **`playback-token` is now a lie in the common case.** Under `COR-4` the response contains a token only on TikTok
   clients below 44.5.0. Naming an endpoint after a field most callers will never receive is exactly the drift that
   produced this conflict in the first place, and it would be transcribed into a generated client method name
   (`postEpisodesPlaybackToken`) that every client author then has to un-learn.
2. **The thing being created is a play attempt, not a credential.** It is the point where entitlement is enforced,
   where the per-user rate limit belongs (`docs/architecture/system-overview.md` §12), where the lazy
   `play_auth_token` fetch happens, and where the identifier that a blocked-playback report and a credit-back must
   quote is minted (§5.3). `201` with a `playbackSessionId` is that resource; `200` with an anonymous body is not.
3. **It is already implemented, with a test.** The skeleton's handler returns the descriptor and asserts that the
   response body contains no URL. Renaming running code to match a document that `COR-4` already invalidated is
   motion, not progress.

**Registered for P1** as proposed conflict **`X-19`** (renumber freely; the content is what matters): the queue's own
acceptance criterion for `CTR-009` names the superseded path, so transcribing it literally would re-introduce the
inconsistency this task exists to remove. `docs/plan/w2-ready-queue.md` §4.1 item 2 should read `POST
/v1/playback/sessions`.

The legacy path is recorded as superseded, not deleted, per the convention in
`docs/architecture/system-overview.md` §1.1.

---

## 3. Fields

### 3.1 What the descriptor carries, and why each field is in it

| Field | Type | Required | Source | Why it is here |
|---|---|---|---|---|
| `playbackSessionId` | `string` (prefixed ULID, `pbs_`) | yes | ours | Names the issuance. A blocked-playback report (`AC-PB-2`) and an automatic credit-back (`AC-PB-3`) both have to say *which* play attempt failed; without it the only correlator is `(userId, episodeId, wall-clock)`, which does not survive a retry storm. **This is an addition beyond `COR-4`** — see the note below |
| `albumId` | `string` | yes | platform (`album_id`) | VePlayer construction parameter. Stored verbatim as its own column (`docs/architecture/system-overview.md` §8) |
| `episodeId` | `string` | yes | ours, echoed | VePlayer construction parameter, and the idempotent echo that lets a client correlate a response to a request |
| `vid` | `string` | yes | platform (`byteplus_vid`) | VePlayer construction parameter. Opaque to us |
| `playAuthToken` | `string` | **conditional** | platform, fetched server-side per issuance | Required only below TikTok 44.5.0 (§4). Absent — not `null`, not `undefined` — on modern clients |
| `resumePositionSec` | `integer ≥ 0` | yes | ours (`progress` module) | Becomes the player's `startTime`. It is on the first-frame critical path, so folding it into this response removes a serial round trip; `AC-DISC-2` requires one tap to resume at the *server-side* position |

> **On `playbackSessionId`.** `COR-4` specifies the media-plane core as `{ albumId, episodeId, vid, playAuthToken? }`
> and says nothing about correlation, because it was correcting the media plane and not designing the endpoint. If
> slot B rejects the field at `CTR-009`, the fallback is that the report endpoint in §5.3 accepts
> `(episodeId, issuedAt)` and operations loses exact correlation across retries. Slot A's position is that the field
> is cheaper than the loss.

`resumePositionSec` is likewise not in `COR-4`'s four-field list. It carries no media-plane meaning — it is our own
progress data — and both `docs/architecture/system-overview.md` §5.2 and the running skeleton already include it.

### 3.2 What was removed, and where the concern went

Each row is a field that `docs/12-api-contracts.md` §4.4 returns today and that this contract does not. Nothing is
merely deleted; every row names the replacement.

| Removed | Why it has no subject | Where the concern lives now |
|---|---|---|
| `playUrl` (signed CDN URL) | We do not own delivery. Media is BytePlus-hosted and fetched by the player under platform play control (`COR-2`). The media-asset documentation states that **using the raw video address to bypass platform play control is explicitly disallowed** (`docs/research/tiktok-minis-official.md` §5.3) | The player resolves media itself from `albumId` + `episodeId` + `vid` |
| `format: "hls"` | There is no manifest we serve. Preload is **MP4 only** (`docs/research/tiktok-minis-official.md` §4.2) and container choice is the platform's | Nothing to replace. Any format branch in client code is dead code |
| `quality` request field and response field | Quality/definition selection is a VePlayer concern (`COR-1`). A per-request quality parameter implied one signed URL per rendition, which no longer exists | `defaultDefinition`, one server-configured value delivered by `GET /config` (§8) — a player construction hint, not an entitlement decision |
| `expiresAt` | Nothing in the response expires on modern clients. On legacy clients the `playAuthToken` has its own short validity, and the response is not cached or refreshed — it is re-requested (§4) | §4's re-request rule, and the `TokenRegion` reduction in `docs/design/player-state-machine.md` §5.1 |
| Quality ladder `1080p → 720p → 480p` | It described our own transcoding output (`COR-2`) | `VideoAsset.quality` becomes **platform-owned** metadata, if it survives at all (slot B, `CTR-009` + `CTR-013`) |
| HLS AES-128 key endpoint | We do not encrypt what we do not transcode. EME is moot for platform-hosted content, where play control is enforced by the platform (`docs/research/gaps.md` §4, U-16) | Platform play control. Our anti-abuse surface is rate-limiting **issuance** (§7.3) |
| `definition` in the `system-overview.md` §5.2 response sketch | It is not a per-viewer or per-episode decision, and putting it in the descriptor would make it look like one | `GET /config` (§8). Registered for P3 as a one-line correction to that diagram |

---

## 4. `playAuthToken`: the legacy-client path, and the prefetch rule it forces

Facts, from `docs/research/tiktok-minis-official.md` §4.1 (source `S-PD-2`):

- The token is needed **only by TikTok clients below 44.5.0**. Newer clients play from `albumId`/`episodeId`/`vid`.
- It is fetched server-side from
  `GET https://open.tiktokapis.com/v2/sg/shortdrama/play_token/?client_key=…&episode_id=…` with a
  `client_credentials` bearer token, returning `{ play_auth_token }`.
- It is short-lived, so it is fetched **only when playback is actually about to happen**.
- The player receives it as `getVideoByToken: { playAuthToken, needPoster: true }`, and `playNext` takes its own
  `getVideoByToken` — so **each episode needs its own token**.

Normative rules:

| # | Rule | Enforced by |
|---|---|---|
| PT-1 | The client declares `needsPlayAuthToken` from the capability object built at boot, never by sniffing a user-agent string | `AC-CAP-1`; the capability probe in `docs/architecture/system-overview.md` §3.3 |
| PT-2 | The server fetches the token during the issuance that returns it, never ahead of time, and never stores it beyond the response | `AC-CAP-5` |
| PT-3 | The client holds it in memory only, passes it to the player, and drops it. It is never persisted, logged, put in analytics, or attached to an error report | `AC-CAP-5`; `INV-P10` in `docs/design/player-state-machine.md` §6 |
| PT-4 | **On a client that needs the token, the descriptor for the next episode is not requested before the switch begins.** A descriptor prefetched at browse time carries a token that may be dead by the time the user taps | `AC-CAP-5`, `INV-P13` |
| PT-5 | On a client that does *not* need the token, the descriptor **may** be prefetched, because it contains nothing that expires | first-frame budget `AC-PF-1` |

PT-4 and PT-5 are the reason the client must know which cohort it is in before it designs its own critical path:
below 44.5.0, one descriptor round trip sits in front of every episode switch and cannot be hidden; at or above it,
the round trip can be moved off the critical path entirely. That asymmetry is a measured cohort in `AC-PF-2`, not an
assumption — and it is the concrete engineering consequence of gap `IAG-11`, which `IA-002` gives copy to.

Preload is unaffected either way: the platform's preload module warms **media bytes** from the episode list and
never needs our descriptor (§ `docs/design/player-state-machine.md` §8).

---

## 5. Three failure kinds, and why the middle one is new

### 5.1 The distinction

> Two authorization systems are in series. Ours answers "has this user paid?"; the platform's answers "is this
> content moderated, online, listed and authorized to this `client_key`?". A user can be fully entitled and still be
> unable to play. (`docs/architecture/system-overview.md` §5.2)

Our entitlement check **can deny but cannot grant** (`COR-3`). So the outcome space has three regions, and the
release-blocking criterion `AC-PB-1` requires them to be distinguishable **in code, in copy and in metrics**:

| Region | Cause | Copy | Retry offered | Metric | Ops signal |
|---|---|---|---|---|---|
| `locked` | our commercial gate | unlock options, priced | n/a — the action is to unlock | unlock-funnel entry | none; this is normal traffic |
| `blocked` | platform play control | "this episode is unavailable right now", no blame, no price | **no** | `playback_blocked` with `albumId` | **alert** naming the album (`AC-PB-2`) |
| transport / server | network, 5xx, timeout | generic retryable error | yes | `playback_error` | alert on rate, not per event |

Collapsing `blocked` into the retryable error is the failure mode this section exists to prevent: the user retries
a thing that cannot succeed, the metric that should have paged operations is buried in ordinary network noise, and
the paid episode stays broken until a human notices. `IAG-9` is exactly this gap.

### 5.2 How `blocked` is detected without depending on undocumented payloads

The platform refuses playback for reasons we mirror but do not own, and the VePlayer `ERROR` payload structure is
not documented — the same class of unknown as `U-05` for the SDK generally, which
`docs/design/minis-integration.md` §5.2 forbids us to destructure speculatively. So detection is specified in
three tiers, and only the first two are authoritative:

1. **Server pre-flight (authoritative).** Issuance consults our mirror of `album/query` — `review_status`,
   `online_version`, `publish_status`, album↔`client_key` authorization, presence of `byteplus_vid`. If the online
   version is not playable, issuance returns `409 EPISODE_PLATFORM_BLOCKED` and never mints a session.
2. **Re-issuance after a fatal player error (authoritative).** On a fatal player error the client re-requests the
   descriptor **once**. If the server now answers `409`, the state is `blocked`; if it answers `201`, the failure
   was transport-class and the state is `errorRetryable`. This turns an undocumented client-side taxonomy into a
   server-side answer, and it is what makes `AC-PB-1` satisfiable today rather than after device testing.
3. **Player error payload (advisory only).** If the payload happens to carry a recognizable play-control signal, it
   is attached to the report as evidence. It never *decides* the classification. `[to verify on device]`

Tier 2 replaces the old "silently re-sign the token and replay once" rule (`CN-7`) with the same retry-once
discipline and a different reason: we are not refreshing a credential, we are asking the authority to classify a
failure.

### 5.3 The report path, and why it is not the analytics batch

`AC-PB-2` requires that a platform-blocked failure raises an operations alert naming the album. Client analytics is
explicitly best-effort with a capped local queue that drops on overflow
(`docs/architecture/system-overview.md` §9), so an incident signal cannot ride on it.

```http
POST /v1/playback/sessions/{playbackSessionId}/failures
{ "kind": "PLATFORM_BLOCKED" | "PLAYER_FATAL" | "START_TIMEOUT",
  "albumId": "...", "episodeId": "...", "vid": "...",
  "playerPayloadSummary": "<stringified, truncated, never destructured>",
  "occurredAt": "2026-08-27T13:20:00.000Z" }
```

- Sent once per failed play attempt, not retried in a loop, `no-store`, no `Idempotency-Key` required (the session
  id is the idempotency subject).
- `playerPayloadSummary` is `String(err)`-style, truncated, and carries **no** `playAuthToken` (PT-3).
- The server correlates it with the drift reconciler (`AC-OPS-7`) so an alert that a user hit a blocked album
  arrives with the reconciler's view of *why*, and it starts the clock for the credit-back obligation
  (`AC-PB-3`).

### 5.4 Blast radius: `blocked` is per album **version**, not per episode

From the media-asset documentation (`docs/research/tiktok-minis-official.md` §5.2), restated twice in its own FAQ:

> As long as any drama shell element or any episode within a drama version fails moderation, **all episodes under
> that version cannot be played.**

Product consequences, which belong in this contract because they change what the client is told:

- A `409` on one episode means the **drama** is unplayable, not that item in the grid. The client's correct response
  is to leave the player and land on `#/fallback?reason=BLOCKED`, not to offer the next episode — which would fail
  identically and burn a second alert.
- Server-side, the kill switch and the reconciler operate at `(album_id, version)` granularity and hide the whole
  drama (`AC-PB-4`).
- A rotated-but-not-updated BytePlus `AccessKeyID`/`SecretAccessKey` invalidates **every** video call and stops
  playback across the catalogue (`docs/research/tiktok-minis-official.md` §5.3). That is a single credential with a
  catalogue-wide outage mode, so it is an operational runbook item, and a `409` storm across unrelated albums is
  its signature.

---

## 6. Descriptor → player configuration

The mapping is fixed so that no product code invents player parameters. Everything not listed comes from `/config`
(§8) or is a constant in the facade.

| Player parameter | Value | Source |
|---|---|---|
| `albumId`, `episodeId`, `vid` | verbatim | descriptor |
| `getVideoByToken` | `{ playAuthToken, needPoster: true }`, **key absent** when the descriptor has no token | descriptor |
| `startTime` | `resumePositionSec` | descriptor |
| `enableMp4MSE` | `true`, always | constant — preload cannot use its bytes without it |
| `lang` | app locale, falling back to `en` for values outside `en` / `zh-cn` / `jp` | `AC-I18N-4` |
| `autoSubtitle` | `true`, with a registered `Subtitle` plugin | `AC-I18N-2` |
| `defaultDefinition` | server-configured, one value | `GET /config` (§8) |
| `ignores` | the plugin policy in `docs/product/sitemap-and-ia.md` §4.1 | product |
| `closeVideoClick` / `closeVideoDblclick` | `false` / `true` | product (immersive gesture policy) |

`exactOptionalPropertyTypes` is on in the repository's TypeScript baseline specifically so that "no token" and
"token is `undefined`" are different at compile time, and the skeleton asserts the key is absent rather than
present-and-undefined (`docs/engineering/repo-layout.md` §7 on `cursor/w1-repo-skeleton-e7c9`). Sending
`getVideoByToken: { playAuthToken: undefined }` to the player is not the same as omitting it, and this is the kind
of difference that shows up only on the oldest cohort of devices.

---

## 7. `PBK-002` is withdrawn; this is what replaces it

### 7.1 The withdrawal

`docs/plan/backlog.md` `PBK-002` (W14) is *"CDN signed URL and HLS AES-128 key interface"*.
`docs/plan/w2-ready-queue.md` §6 registers it as **withdrawn** because `COR-2` removed its subject.
Slot A confirms the withdrawal and states it precisely, because "withdrawn" alone invites someone to rebuild it
later under another name:

| Deliverable in `PBK-002` | Status | Reason |
|---|---|---|
| CDN signed-URL issuance | **Withdrawn — must not be built** | We serve no media. A signed media URL in any response is a regression to a delivery path the platform does not permit, and using a raw video address to bypass play control is explicitly disallowed |
| HLS AES-128 key endpoint | **Withdrawn — must not be built** | We neither transcode nor encrypt episode media |
| Anti-leech triple (short-lived URL + key auth + fetch rate control) in `docs/14-security.md` §5.1 | **Two of three withdrawn**, one retained and relocated | See §7.3 |

### 7.2 Where the budget goes

Not back into the pool. The work that `PBK-002` was standing in for still exists; it moved to the other side of the
media plane:

| Successor | Wave | Slot | What it inherits |
|---|---|---|---|
| `CTR-011` implementation (media-operations surface) | C2+ | B / content-ops | Album versioning, the eight moderation states, listing, album↔`client_key` authorization, drift reconciliation — the platform-side equivalents of everything `PBK-002` would have built for ourselves |
| Legacy-client token path | C4 (with `PLY-001`) | B + A | Lazy `play_auth_token` fetch, the `client_credentials` token provider with pre-expiry refresh, and PT-1…PT-5 |
| Playback failure classification and reporting | C4 | A + B | §5.2 tier 1 and tier 2, the report endpoint in §5.3, and the `blocked` state in the player state machine |
| Issuance abuse controls | C4 | B + C | §7.3 |
| BytePlus AK/SK rotation runbook | C2+ | C / ops | The catalogue-wide outage mode in §5.4 — a genuinely new operational duty with no predecessor in the backlog |

### 7.3 What survives of the anti-leech design

One of the three original controls is still meaningful, and it is worth being explicit that it is *not* the same
control with a new name:

- **Retained:** rate limiting and anomaly detection on **descriptor issuance**, per user and per IP
  (`docs/architecture/system-overview.md` §12). The thing being protected changed from "the media URL" to "the
  entitlement decision and the platform token quota", and the reason changed from anti-leech to abuse control plus
  cost control on the `play_token` call.
- **Not retained:** URL expiry, re-signing, concurrent-stream limits enforced at fetch time, and key-request
  authorization. All four were properties of a delivery path we do not have.

`PBK-001` (W13, "the server denies a locked episode at all three entry points") **stands**, with the mechanism
restated exactly as `docs/plan/w2-ready-queue.md` §6 requires: the denial is *refusing to issue a descriptor*, not
*withholding a signed URL*. The three entry points are unchanged (episode list, episode detail, playback issuance).

---

## 8. Player parameters that belong to `GET /config`, and why `PS-4` stays rejected

`docs/plan/w1-conflict-register.md` §4.2 rejected `PS-4` (adding `defaultQuality` and `freeEpisodeMaxQuality` to
`GET /config`) on the grounds that a server-controlled quality ceiling has no delivery mechanism. That rejection
holds, and the research adds a distinction worth recording so that nobody reverses it for the wrong reason:

| Parameter | Server-configured? | Purpose | Not for |
|---|---|---|---|
| `defaultDefinition` | **yes**, `/config` | The player documentation is explicit that `defaultDefinition` **must match the definition actually played**, or both the media-info cache and the preload cache miss — and the media-info cache key is `episodeId + defaultDefinition` (`docs/research/tiktok-minis-official.md` §4.2). It is a cache-correctness parameter first and a quality preference second | Tiering, entitlement, or per-episode cost control |
| `preloadTime`, `prevCount`, `nextCount`, `preloadMaxCacheCount` | **yes**, `/config` | First-frame tuning without a review cycle (`docs/architecture/tech-stack.md` §3) | — |
| Subtitle default policy | yes, `/config` | `AC-I18N-2`'s track selection order | — |
| `freeEpisodeMaxQuality` | **no** | — | There is no mechanism: we do not select renditions per viewer, and the platform's play control does not take a ceiling from us |

So the free-episode bandwidth-cost guardrail that `PS-4` was really about still has **no mechanism**, and
`GOV-007` (W6) is the right place for it. The input slot A can add: the lever, if one exists, is on the BytePlus
transcoding side of the media plane (which renditions exist for a drama at all) and is therefore a
content-operations decision at publish time, not a runtime decision at play time. `CTR-011` is where that lever
would have to be specified.

---

## 9. Transcription obligations

This is the whole point of the document: one contract text, transcribed by the slots that own the files. Nothing
below has been edited by this slot.

| # | File | Owner | Required change |
|---|---|---|---|
| T-1 | `docs/12-api-contracts.md` §4.4 | **B** (`CTR-009`) | Replace the endpoint with §1 of this file. Record `POST /episodes/{id}/playback-token`, `playUrl`, `format`, `quality`, `expiresAt`, the ladder and the key endpoint as superseded, citing `COR-2`/`COR-4`. Add the one-line statement that entitlement can deny but cannot grant (`COR-3`) |
| T-2 | `docs/12-api-contracts.md` §4.4 | **B** (`CTR-010`) | Add the `409 EPISODE_PLATFORM_BLOCKED` outcome (§5) and the failure-report endpoint (§5.3) |
| T-3 | `docs/12-domain-model.md` §3.3 | **B** (`CTR-009`) | `VideoAsset.quality` marked platform-owned; `byteplus_vid` as the playback identifier; no `assetKey`-per-rendition model |
| T-4 | `docs/12-error-catalog.md` | **B** (`CTR-010`) | `EPISODE_PLATFORM_BLOCKED` with `category=CONTENT`, `retryable=false`, `actionable=false` (per `D-AC-1`); fallback-reason set gains `BLOCKED` |
| T-5 | `docs/design/api-contracts.md` §4.2, §7.3 | **B** (`CTR-012`) | Cache row renamed to the new path, still `no-store`, with the reason changed from "caching defeats anti-leech" to "the response is a one-shot authorization decision and may contain a short-lived token". Mock scenarios `playback.token_expires_in_5s` → `playback.legacy_client_token`, and add `playback.blocked` |
| T-6 | `contracts/openapi.yaml` | **B** (`CTR-007`, W3) | Transcribe §1, §3.1 and §5. The skeleton's existing `/v1/playback/sessions` entry is the starting point, not a competing version |
| T-7 | `docs/03-tech-architecture.md` §2 item 3, §3.2, §6 | **P3** (`INF-009`, then the W6 consolidation) | The signed-URL sentences and the transcode-ladder pipeline become correction rows pointing at `docs/architecture/system-overview.md` §5–§6 |
| T-8 | `docs/14-security.md` §5.1 | **C** | Apply §7.3: two of the three anti-leech controls have no subject; issuance rate limiting is retained with a new rationale |
| T-9 | `docs/plan/w2-ready-queue.md` §4.1 item 2, §6 `PBK-002` row | **P1** (`GOV-006`) | Endpoint name per §2 (proposed conflict `X-19`); `PBK-002`'s successors per §7.2; the `defaultDefinition`-versus-`PS-4` distinction per §8 as input to `GOV-007` |
| T-10 | `docs/architecture/system-overview.md` §5.2 | **P3** | Drop `definition` from the response sketch (§3.2, last row) |

Two of these are *stricter* than what they replace, and neither is a threshold change: T-2 adds an outcome that did
not exist, and §5.2 tier 2 adds a mandatory server re-classification step that the old design did not have.
Nothing here removes a test, lowers a threshold, weakens a gate or adds an exemption.

---

## 10. Verification

How each claim in this contract is proven, so `VER-001` (W5) has something mechanical to check:

| # | Claim | Proof |
|---|---|---|
| V-1 | The response contains no media URL | Server test asserting the serialized body matches no `https?://` (exists today: `server/src/app.test.ts` on `cursor/w1-repo-skeleton-e7c9`) |
| V-2 | No `<video>` and no third-party player anywhere in the bundle | `AC-PL-1`, release-blocking; ESLint + emitted-bundle scan + `index.html` integrity check (three layers, already running) |
| V-3 | `locked`, `blocked` and transport failures are separable | `AC-PB-1`: an integration test per branch asserting distinct code, distinct copy key and distinct metric name |
| V-4 | The token is fetched only at play time and never cached | `AC-CAP-5`: integration test asserting one `play_token` call per issuance and none at browse time; PT-4 asserted by a test that no descriptor request precedes a switch on the legacy cohort |
| V-5 | The token never leaks | `INV-P10`: a log/analytics/error-report serializer test with a token-shaped value planted in the descriptor |
| V-6 | A blocked album is hidden rather than re-offered | `AC-PB-4`, `AC-DISC-3`: integration test at `(album_id, version)` granularity |
| V-7 | This contract and `contracts/openapi.yaml` agree | `CTR-007` at W3, then `oasdiff` in CI (`docs/architecture/tech-stack.md` T23). Until then, this file is the source |

---

## 11. Open items

| # | Item | Effect on this contract | Owner |
|---|---|---|---|
| `G-R1` | The BytePlus + VePlayer media plane may still be a pilot; non-pilot developers "can continue to use their own solutions" (`docs/research/gaps.md` §1) | **The contract shape survives either answer** — the client asks for a descriptor and never sees a media address, which is why `docs/research/gaps.md` itself calls it "the right shape for both". What does *not* survive is the assumption that `vid` resolves to platform-hosted media. If we launch outside the pilot, the descriptor gains a media-resolution field, `AC-PL-1` needs a written platform exemption, and `PBK-002` would have to be *un*-withdrawn. **This is a business question with an engineering deadline: it must be answered before `PLY-001` at W14** | Business + P3 |
| `G-R17` / `U-20` | The minimum supported library version is unchosen; `play_auth_token` is needed below TikTok 44.5.0 and IAA needs ≥ 44.2.0 | Decides how large the PT-4 cohort is, and therefore whether a descriptor round trip sits on every episode switch for a material share of traffic | P3 + business |
| One Page question 2 | Whether the authenticated One Page constrains VePlayer beyond the public docs (`docs/plan/w1-conflict-register.md` §8.3) | The only remaining source of unknown constraints on this contract. `docs/research/one-page-feishu.md` §4 shows §3.1/§3.2 of the One Page are link-only, pointing at `S-OP-1`/`S-OP-2`, so **the ask should now be for those two documents by name**, not for the One Page again | Business |
| `U-05` | VePlayer error payload shape undocumented | Confined to §5.2 tier 3, which is advisory only. No classification depends on it | A, on device |

---

## 12. Change log

| Date | Wave · slot | Change |
|---|---|---|
| 2026-08-27 | W2 · A | First version. Adopted the playback descriptor as the contract (`COR-4`); adjudicated the endpoint identity in favour of `POST /v1/playback/sessions` `201` and registered proposed conflict `X-19`; specified `playbackSessionId` and the prefetch rules PT-1…PT-5; specified the three-way `locked` / `blocked` / transport distinction with a detection procedure that does not depend on undocumented player payloads; confirmed and detailed the withdrawal of `PBK-002` with five named successors; separated `defaultDefinition` (a cache-correctness parameter) from the rejected `PS-4` quality ceiling; registered ten transcription obligations |
