# User Journeys

> **Slot:** Wave 1 · product IA / journeys / compliance. Companion to `docs/product/sitemap-and-ia.md` (structure),
> `docs/product/compliance-tiktok-minis.md` (platform obligations) and `docs/product/acceptance-criteria.md`
> (verifiable statements derived from these journeys).
> **Relationship to earlier documents:** `docs/02-user-journeys.md` defines J1–J14 in Chinese and remains the
> detailed reference for the branches it covers. This file **amends** those journeys where the VePlayer and
> media-asset architecture changed the underlying mechanics (§2), and **adds** the journeys that were missing:
> platform-blocked playback, episode continuity, subtitles, legacy clients, and the entire operator side of the
> product (§3–§4).

---

## 1. How to read this

A journey is written as preconditions → main flow → exception branches. The exception branches are the point:
this product's revenue and its review outcome both live in the branches, not in the happy path.

Two conventions carry over from `docs/02-user-journeys.md`: screens are referenced by their inventory IDs
(`SCR-xx`, `PNL-xx`), and the global degradation framework in `docs/02-information-architecture.md` §8 applies to
every journey, so only journey-specific handling is written here.

New in this file: every journey names the **acceptance criteria** it is verified by, using the `AC-*` identifiers
from `docs/product/acceptance-criteria.md`.

---

## 2. Amendments to the existing journeys J1–J14

These are corrections, not rewrites. Each one follows from an architecture correction (A1–A6 in
`docs/architecture/system-overview.md` §1.1) or from the One Page.

| # | Journey | Statement in `docs/02-user-journeys.md` | Amendment | Source |
|---|---|---|---|---|
| **PA-1** | J1 boot | Boot is SDK init → silent login → `/config` → home | Adds a capability probe after init and a `getPlayer()` call that caches the VePlayer constructor. **`getPlayer()` failure is not fatal**: it degrades to a lazy retry at first playback, because a user who never opens the player must not be blocked by it | A1, arch §3.1 |
| **PA-2** | J2 step 2 and 10 | "Exchange a playback token", response carries `playUrl` and a quality ladder | The playback session returns `{ albumId, episodeId, vid, playAuthToken?, resumePositionSec }`. There is no URL to sign, expire or refresh. The client hands the descriptor to VePlayer | A4 |
| **PA-3** | J2 step 3 | End of episode auto-advances via route `replace` | Auto-advance calls `playNext` on the retained player instance. The route does not change; the back destination does not change | A1, IA §4.2 |
| **PA-4** | J5 ad unlock | Rewarded video is the ad capability | Interstitial ads are also a required capability. Product position for launch: interstitials are **not** used inside the player, and never interrupt an episode; the only sanctioned slot is a session-level placement outside playback, dark by default behind config | A5 |
| **PA-5** | J6 VIP | — | Unchanged in flow. Restated because it is easy to get wrong: VIP validity is derived from the platform subscription state at entitlement-check time, never from a local boolean | arch §7.3 |
| **PA-6** | J12 branch 3 | On stall, auto-downgrade one definition step and toast | Removed from our side. Adaptive behaviour belongs to the player kernel; if a drama exposes multiple definitions the user changes them through `sdkDefinitionPlugin`. Our chrome shows a stall indicator and, after the stall budget, a retry affordance | A1, IA §4.1 |
| **PA-7** | J12 branch 4 | Re-sign `playUrl` before resuming after a long pause | Deleted. `play_auth_token` is fetched lazily, only when playback is about to happen, only for TikTok clients below 44.5.0, and is never cached beyond its validity. A long pause does not invalidate anything the user can see | A4, player doc |
| **PA-8** | J12 branch 1 | Start-up failure at the token layer maps to locked / terminal / retryable | Adds a fourth class: **platform-blocked**. Entitled content can still be unplayable because of moderation, online-version, listing or `client_key` authorization state. It is a different message to the user and a different alert to operations (J15) | A3 |
| **PA-9** | J13 takedown | `410 CONTENT_OFFLINE` at every touchpoint | Still true for *our* takedown. The authoritative kill switch is platform-side delisting; our takedown is the second step and only removes discovery. Both must happen, in that order (J22) | arch §6.2 |
| **PA-10** | J2 step 8, J11 | Poll the order until `CREDITED` | Unchanged, and worth restating as the product's single most important money rule: **the payment sheet's success callback grants nothing.** Fulfilment happens on the server webhook. The UI state after the callback is "confirming" | arch §7.3 |

---

## 3. New consumer journeys

### J15 — Platform-blocked playback

The user is entitled, has possibly paid, and the platform still will not play the episode: the album version is
not approved, is not the online version, the album is delisted, the `client_key` authorization is missing, or the
`byteplus_vid` never materialized. This is an incident, and the product has to behave like it is one.

**Preconditions:** entitlement check passed; playback descriptor issued; VePlayer reports an error, or the
playability pre-check fails.

| Step | What the user sees | What the system does |
|---|---|---|
| 1 | Poster frame with a neutral message: the episode cannot be played right now, with a retry and a "back to the drama" exit | Player error is classified as platform-blocked rather than network |
| 2 | Nothing further; the app stays usable | The client reports the classified error with `albumId`, `episodeId`, `vid` and the platform error payload |
| 3 | — | The server correlates with the reconciler's last `album/query` snapshot and raises an operations alert naming the album and the suspected cause |
| 4 | If the user paid for this episode specifically and it stays blocked past the incident SLO, they are credited back automatically and told so | Automatic re-credit; support path retained |

**Exception branches**

| Branch | Handling |
|---|---|
| Whole drama is blocked, not one episode | Remove it from feed and detail through the takedown path (J22) so other users never reach the error |
| Blocked on some devices only | Almost always a client-version or capability issue, not a moderation issue: classify by TikTok client version before alerting content operations (J18) |
| User retries repeatedly | Retry is rate-limited client-side; the message does not change, because promising a different outcome we cannot deliver is worse than an honest wall |

**Product rule:** a locked episode is a conversion opportunity; a blocked episode is an outage. They must never
share a message, a colour, or a metric. Verified by AC-PB-1 … AC-PB-4.

---

### J16 — Episode continuity and first frame

The core loop of the format: episode ends, next one starts, and the gap decides retention.

**Preconditions:** player route open, ordered episode list known, `enableMp4MSE: true`, preload scene set to feed
mode with one previous and two next.

| Step | What the user sees | What the system does |
|---|---|---|
| 1 | Episode plays | Player schedules preload for neighbours; preload yields to active playback by design |
| 2 | Episode ends, or the user swipes | `playNext({ albumId, episodeId, vid, getVideoByToken })` on the same instance |
| 3 | Next episode starts, ideally without a visible gap | Preload hit is recorded from `preLoadData.hit` / `PRELOAD_INFO`; time-to-first-frame is measured from the switch, not from route entry |
| 4 | Progress for the finished episode is persisted | Heartbeat flush on switch, in addition to the interval heartbeat |

**Exception branches**

| Branch | Handling |
|---|---|
| Next episode is locked | Do not switch. Stay on the last frame, show the locked state and the unlock panel. Switching into a wall is disorienting and loses the position |
| Preload unavailable (no MSE: Android WebView absent, iOS below 17.1) | Playback still works, first frame is slower. Silent to the user, segmented in analytics so the cohort is measured rather than assumed |
| `playNext` rejects | Treat as a start-up failure for the target episode, classified per J15 / J12; the previous episode stays on screen rather than a black frame |
| User pages far ahead in the episode picker | Extend the ordered list (`addPreloadList`); do not rebuild the player |
| User leaves the player | Destroy the instance, cancel preload tasks, clear the list — otherwise home-screen warming competes with nothing and wastes the user's data |

Verified by AC-PL-3, AC-PL-4, AC-PF-1, AC-PF-2.

---

### J17 — Subtitles and language

**Preconditions:** subtitles uploaded per language and bound to the video; `autoSubtitle: true`; `Subtitle` plugin
registered.

Main flow: the player parses the subtitle list from media info → `formatAutoSubtitleItem` selects the default
track (device/app language, then English, then first available) → the user can change or disable the track through
the plugin, and the choice persists for the session.

| Branch | Handling |
|---|---|
| No subtitle exists for the user's language | Fall back to English; do not show an empty language picker |
| A drama is partially subtitled in a language | The language is not offered for that drama. Completeness is a publishing precondition (J20), not a runtime decision |
| The device language is one VePlayer's UI does not support | Player UI falls back to English while the subtitle track can still be the user's language; these are two separate settings |
| The user disables subtitles | Respected for the session; no re-prompt |

Verified by AC-I18N-2, AC-I18N-3.

---

### J18 — Legacy clients and capability degradation

TikTok client versions differ in what they can do, and the Portal's minimum supported library version decides who
gets in at all. This journey exists because the failure mode is a silent cohort, not a visible bug.

| Situation | Product behaviour |
|---|---|
| TikTok client below 44.5.0 | Playback needs `play_auth_token`. Fetched lazily, server-side, immediately before playback. Invisible to the user; visible in metrics as a separate cohort |
| A capability probe (`canIUse`) returns false for an optional capability | That entry point is not rendered at all. No greyed-out button, no explanation the user cannot act on |
| A capability probe returns false for a required capability | Feature-flag it off for the session, record it, and degrade the affected surface — never the whole session |
| Client below the configured minimum library version | The platform prompts the user to update TikTok. Our copy must not contradict it; the app is simply not reachable for that user |
| Ad or IAP capability present but not yet enabled for the organization | Channels are dark. The unlock panel must still render at least one usable path, or it must explain honestly that purchases are not available yet |

**Product rule:** the unlock panel never renders zero channels. If every monetization channel is unavailable, the
panel says so plainly instead of presenting an empty sheet. Verified by AC-CAP-1 … AC-CAP-4.

---

### J19 — Reviewer walkthrough (TikTok version review)

The reviewer is a user with unusual constraints, and the review is a gate the product either designs for or fails.

**Preconditions:** basic information approved; all required capabilities integrated; package passes the code scan;
at least one drama fully published (approved, online version set, listed, `client_key` authorized).

| Step | What the reviewer does | What must be true |
|---|---|---|
| 1 | Opens the mini drama from the Portal preview or the production listing | The loading page shows the ToS and privacy URLs, and both resolve |
| 2 | Uses the app in **English** | Every string is translated; no key fallbacks, no truncation in English layouts |
| 3 | Compares what they see against the basic information | Icon, name, description and category match the built app exactly |
| 4 | Plays an episode | It plays through VePlayer, first frame is quick, no blocked-UI element appears anywhere |
| 5 | Exercises login, an ad, a purchase and a subscription | Each required capability is reachable and functional, or explicitly dark for a documented reason |
| 6 | Looks for policy violations in content, name, icon, description and any promotional material | Every listed title passed the content self-review; adaptations of real events carry a fiction disclaimer |

**Exception branches:** a rejection is a full review cycle, so each of these is a pre-submission check rather than
a recovery path — see `docs/architecture/risks.md` §6 and `docs/product/acceptance-criteria.md` §7.

---

## 4. Operator journeys

The consumer app cannot be operated without these, and none of them existed in the Wave 1 product documents. They
are stated at product level; the console IA is in `docs/product/sitemap-and-ia.md` §9.

### J20 — Publishing a title

**Actor:** content operations. **Precondition:** licensed masters, posters, and subtitle files in hand; BytePlus
account bound; organization verified and qualified.

| Step | Action | Platform effect | Failure handling |
|---|---|---|---|
| 1 | Stage masters and posters | Objects readable by the platform for the duration of the pull only | Bad master → reject at ingest with a checkable reason, never silently |
| 2 | Upload video and images | Asynchronous; returns a `job_id` per asset | Durable job with backoff and a dead-letter queue; a dead-lettered job blocks publishing rather than producing a half title |
| 3 | Poll until `byteplus_vid` exists | Video registered in the space | Missing `vid` is a hard publishing block |
| 4 | Create or update the album | **A new version** — updates never mutate in place | The console names the version in every action; there is no ambiguous "save" |
| 5 | Upload and bind subtitles per language | Tracks discoverable by the player | Incomplete language → that language is not offered (J17) |
| 6 | Submit for moderation | Normal or urgent priority; urgent is capped per organization per day | Remaining urgent quota is shown at the point of submission; the console refuses to spend the last of it without a confirmation |
| 7 | Track the review state machine | Eight states, not two | Every state is surfaced; collapsing them is how an episode looks live internally and is unplayable in the app |
| 8 | Set the online version | Only an approved version may be set online, enforced server-side | An attempt to set an unapproved version is rejected and alerted |
| 9 | List the album and authorize the `client_key` | Content becomes playable | Missing authorization is a common cause of J15 |
| 10 | Publish in our catalogue | Appears in feed, detail and deep links | Our publish is blocked until steps 3, 8 and 9 are all true |

Verified by AC-OPS-1 … AC-OPS-6.

### J21 — Moderation rejection and appeal

| Step | Action |
|---|---|
| 1 | Review returns rejected; the console shows the state and the platform's reason |
| 2 | Operations decides: appeal with evidence, or re-cut and submit a new version |
| 3 | Appeal is submitted with attachments through the platform API and tracked through its own states (appealing → approved / rejected) |
| 4 | Nothing in the storefront changes at any point, because the storefront only ever serves the online version — users are never exposed to a rejected version |

The product consequence worth stating: **rejection is a scheduling event, not an outage.** The release slate has to
carry moderation lead time (the platform states one to three working days) as a planned dependency.

### J22 — Emergency takedown

Order matters, and the first step is the only authoritative one.

| Step | Action | Owner |
|---|---|---|
| 1 | Delist the album at the platform | Content ops — stops playback platform-wide |
| 2 | Mark the drama offline in our catalogue | Removes it from feed, detail and deep links |
| 3 | Invalidate the feed and detail read models | Otherwise a cached card keeps sending users into a wall |
| 4 | Active players receive a terminal error and route to `#/fallback?reason=OFFLINE` | |
| 5 | Decide on refunds or re-credits for unlocks bought recently | Finance + support, from the ledger |

Steps 2–4 must complete inside the incident SLO in `docs/14-security.md` §7.3. Rehearsing this end to end is a
pre-submission checklist item, not a post-launch aspiration. Verified by AC-OPS-5.

### J23 — Handling a user report

The platform routes three kinds of user report to us — experience, payments, community-guideline violations — and
they appear in the Developer Portal under the app's Operations section. **They must be resolved or dismissed within
72 hours of submission**, after which they are flagged as past due. Users who are unhappy with the outcome can
appeal (currently payment reports only), and our contact email is shared with them when they do.

| Step | Action |
|---|---|
| 1 | Poll or check the report queue on a defined rota; payment reports are triaged first |
| 2 | Correlate a payment report with the order and ledger by `trade_order_id`; a genuinely lost fulfilment is completed from the operations console with an audit trail |
| 3 | Resolve or dismiss inside the window, with a note |
| 4 | Handle appeals over email from the verified contact address, which must have two-factor authentication enabled |

Gap G14 is open: this rota has no owner. Verified by AC-OPS-6.

### J24 — Onboarding the organization (business track)

This is a journey with a user (the business owner), a long critical path, and hard dependencies that gate every
engineering milestone. Full detail and provenance are in `docs/product/compliance-tiktok-minis.md`; the sequence is
here because the product plan depends on its shape:

```text
register on TikTok for Developers
  → create the organization (full legal entity name — permanent)
  → create the app (name and type "Minis drama" — permanent)
  → business verification
  → EIS compliance review (IAA/IAP in Europe and the US)
  → industry qualification (representative playable work + authorization proof)
  → USDS / US launch approval (only if launching in the US)
  → sign the contract in the Developer Portal, enable IAP (and IAA)
  → basic information submission and approval
  → development, debugging, preview on device
  → submit for review → full production release
```

Two irreversible steps sit early in that chain: the organization name and the app name cannot be changed after
creation. Two long poles sit in the middle: EIS and, for the US, USDS. Both are business-track work that no amount
of engineering can shorten, which is why `docs/architecture/risks.md` treats partner approval and qualification as
the critical path.

---

## 5. Journey index

| # | Journey | Where defined | Status |
|---|---|---|---|
| J1 | Cold start, first visit | `docs/02-user-journeys.md` | Adopted, amended by PA-1 |
| J2 | Browse → sample → paywall → recharge → unlock → resume | `docs/02-user-journeys.md` | Adopted, amended by PA-2, PA-3, PA-10 |
| J3 | Returning user resume | `docs/02-user-journeys.md` | Adopted |
| J4 | Deep-link entry | `docs/02-user-journeys.md` | Adopted |
| J5 | Ad unlock | `docs/02-user-journeys.md` | Adopted, amended by PA-4 |
| J6 | VIP / subscription | `docs/02-user-journeys.md` | Adopted, amended by PA-5 |
| J7 | Whole-drama unlock | `docs/02-user-journeys.md` | Adopted |
| J8 | Favourites and following | `docs/02-user-journeys.md` | Adopted |
| J9 | Comments | `docs/02-user-journeys.md` | Adopted (feature-flagged) |
| J10 | Authorization refusal, anonymous limits | `docs/02-user-journeys.md` | Adopted |
| J11 | Payment failure recovery | `docs/02-user-journeys.md` | Adopted, amended by PA-10 |
| J12 | Playback failure and weak network | `docs/02-user-journeys.md` | Adopted, amended by PA-6, PA-7, PA-8 |
| J13 | Content takedown | `docs/02-user-journeys.md` | Adopted, amended by PA-9 |
| J14 | Ban and wallet freeze | `docs/02-user-journeys.md` | Adopted |
| **J15** | Platform-blocked playback | this file §3 | New |
| **J16** | Episode continuity and first frame | this file §3 | New |
| **J17** | Subtitles and language | this file §3 | New |
| **J18** | Legacy clients and capability degradation | this file §3 | New |
| **J19** | Reviewer walkthrough | this file §3 | New |
| **J20** | Publishing a title | this file §4 | New |
| **J21** | Moderation rejection and appeal | this file §4 | New |
| **J22** | Emergency takedown | this file §4 | New |
| **J23** | Handling a user report | this file §4 | New |
| **J24** | Onboarding the organization | this file §4 | New |

---

## 6. Sources

- Official One Page (Feishu wiki), retrieved 2026-08-27 — onboarding sequence, verification gates, EIS, contract
  signing. Coverage and extract: `docs/product/compliance-tiktok-minis.md` §2 and Appendix A.
- [TikTok Minis Player](https://developers.tiktok.com/docs/en/minis-player) — VePlayer, `playNext`, preload,
  subtitles, `play_auth_token` for clients below 44.5.0.
- [Media Asset Management](https://developers.tiktok.com/docs/en/media-asset-management) — ingest jobs, album
  versions, moderation states, listing, authorization.
- [Report Handling Guide](https://developers.tiktok.com/doc/minis-report-handling-guide) — the 72-hour window and
  appeals.
- `docs/architecture/system-overview.md` §1.1, §5, §6, §7 — corrections A1–A6 and the flows they imply.
