# Acceptance Criteria

> **Slot:** Wave 1 · product IA / journeys / compliance. Derived from `docs/product/user-journeys.md` and
> `docs/product/sitemap-and-ia.md`, constrained by `docs/product/compliance-tiktok-minis.md` §5.
> **Purpose:** turn the journeys into statements that can be shown to be true or false. Nothing here relaxes an
> existing gate: `docs/14-quality-gates.md` (R1–R6, the three-level gate model) and the pre-submission checklist in
> `docs/architecture/risks.md` §6 remain in force, and these criteria are additional evidence feeding them.

---

## 1. Conventions

Each criterion has an identifier, a Given/When/Then statement, and a **verification method**:

| Method | Meaning |
|---|---|
| `build` | Fails the build or the packaging step. No human judgement involved |
| `unit` / `integration` | Automated test in CI |
| `e2e` | End-to-end test, mock bridge or platform sandbox |
| `device` | Manual verification on a real TikTok client, both platforms |
| `ops` | Verified by an operational rehearsal or a report, with the artefact archived |

Criteria marked **(release-blocking)** must pass before a submission for review. The rest must pass before the
feature they cover is considered done.

---

## 2. Boot, identity and configuration

| # | Criterion | Method |
|---|---|---|
| AC-BOOT-1 | **Given** the app is opened inside TikTok, **when** the boot sequence runs, **then** SDK initialization, the capability probe, silent login, `GET /config` and the cached VePlayer constructor all complete before any business screen renders. **(release-blocking)** | e2e, device |
| AC-BOOT-2 | **Given** SDK initialization fails, **when** boot completes, **then** a terminal error screen with a retry is shown and no business screen is reachable — the app never proceeds on a half-initialized runtime | e2e |
| AC-BOOT-3 | **Given** silent login fails, **when** boot completes, **then** the user lands on Home in anonymous mode, free content is fully usable, and login is retried at the first action that needs identity | e2e |
| AC-BOOT-4 | **Given** `GET /config` fails, **when** boot completes, **then** conservative built-in defaults apply (paid features off, comments off, heartbeat 10 s) and a background refetch is scheduled | unit, e2e |
| AC-BOOT-5 | **Given** `getPlayer()` fails at boot, **when** the user browses, **then** nothing outside the player is affected; the constructor is retried lazily at the first playback attempt | e2e |
| AC-BOOT-6 | **Given** any screen, **when** it renders, **then** no interactive element overlaps the capsule safe area returned by `getMenuButtonBoundingClientRect()`, on both platforms | device |

---

## 3. Discovery

| # | Criterion | Method |
|---|---|---|
| AC-DISC-1 | **Given** the feed loads successfully with zero items, **when** it renders, **then** an empty state with an action is shown — never a blank screen | e2e |
| AC-DISC-2 | **Given** a returning user with watch progress, **when** Home renders, **then** the continue-watching entry is present and one tap resumes at the server-side position | e2e |
| AC-DISC-3 | **Given** a drama whose album is not approved, not the online version, delisted, or unauthorized for our `client_key`, **when** the feed or catalogue is composed, **then** it does not appear in either | integration |
| AC-DISC-4 | **Given** a card is exposed on a list screen, **when** manual preload warms a candidate, **then** at most one candidate drama's first episode is warming at a time | unit |
| AC-DISC-5 | **Given** a deep link with an unknown, malformed or missing parameter, **when** it resolves, **then** the user lands on Home with no error dialog; a deep link never white-screens and never dead ends. **(release-blocking)** | e2e |

---

## 4. Playback

| # | Criterion | Method |
|---|---|---|
| AC-PL-1 | **Given** the built bundle, **when** it is scanned, **then** it contains no `<video>` element and no third-party player, in any code path including trailers. **(release-blocking)** | build |
| AC-PL-2 | **Given** an entitled episode, **when** playback starts, **then** it renders through a VePlayer instance created from `TTMinis.getPlayer()`, with `{ albumId, episodeId, vid }` and, on TikTok clients below 44.5.0, a freshly fetched `playAuthToken`. **(release-blocking)** | device, integration |
| AC-PL-3 | **Given** the player is showing episode *n*, **when** the user advances to episode *n+1*, **then** `playNext` is called on the same instance: no second instance is created, no route teardown occurs, and the back destination is unchanged | e2e, device |
| AC-PL-4 | **Given** the player route is left, **when** teardown runs, **then** the instance is destroyed and preload tasks and lists are cleared | unit |
| AC-PL-5 | **Given** the next episode is locked, **when** the current episode ends, **then** the player does not switch; it holds the final frame and presents the locked state with the unlock panel | e2e |
| AC-PL-6 | **Given** any playback state owned by a VePlayer plugin (definition, subtitle track, playback rate), **when** the UI is inspected, **then** the app renders no competing control for it | device, review |
| AC-PL-7 | **Given** a stall, **when** the stall budget elapses, **then** the app shows a stall indicator and a retry affordance and does **not** change definition itself | e2e |
| AC-PL-8 | **Given** playback progress, **when** the app is hidden, paused, or the episode is switched, **then** progress is flushed in addition to the interval heartbeat, and the worst-case loss is bounded by the configured heartbeat interval | integration |

### 4.1 Platform-blocked playback

| # | Criterion | Method |
|---|---|---|
| AC-PB-1 | **Given** an entitled episode that the platform will not play, **when** the error surfaces, **then** it is classified as platform-blocked and is distinguishable in code, copy and metrics from a locked episode and from a network failure. **(release-blocking)** | integration, e2e |
| AC-PB-2 | **Given** a platform-blocked error, **when** it is reported, **then** the report carries `albumId`, `episodeId`, `vid` and the platform payload, and raises an operations alert naming the album and the suspected cause | integration |
| AC-PB-3 | **Given** a user paid for an episode that stays blocked beyond the incident SLO, **when** the SLO expires, **then** the unlock is credited back automatically and the user is told | integration, ops |
| AC-PB-4 | **Given** a drama is blocked platform-wide, **when** operations responds, **then** it is removed from feed, detail and deep links so no further user reaches the error | ops |

### 4.2 First frame and continuity

| # | Criterion | Method |
|---|---|---|
| AC-PF-1 | **Given** the player page with feed-mode preload configured, **when** an episode switch occurs, **then** time to first frame is measured from the switch and meets the budget in `docs/14-quality-gates.md` §5.4 (P90 ≤ 1.2 s on Wi-Fi, ≤ 2.5 s on 4G) | device, performance gate |
| AC-PF-2 | **Given** playback starts, **when** `preLoadData` and `PRELOAD_INFO` are read, **then** preload hit rate is reported as a tracked metric, segmented by OS version so the no-MSE cohort is visible rather than assumed | integration |
| AC-PF-3 | **Given** a device without MSE support, **when** an episode is played, **then** playback still succeeds without preload and without any user-visible error | device |

---

## 5. Monetization

| # | Criterion | Method |
|---|---|---|
| AC-MON-1 | **Given** a purchase, **when** the payment sheet's success callback fires, **then** no entitlement and no balance change is written; the UI moves to a confirming state. **(release-blocking)** | unit, integration |
| AC-MON-2 | **Given** a purchase, **when** the server webhook is verified, **then** fulfilment happens exactly once, and a duplicate delivery produces no second credit | integration |
| AC-MON-3 | **Given** a lost webhook, **when** the order sweeper runs, **then** the pending order is reconciled from the platform order query and fulfilled | integration |
| AC-MON-4 | **Given** a sandbox order, **when** it is processed, **then** it never touches a production ledger | integration |
| AC-MON-5 | **Given** a refund or claw-back event, **when** it arrives, **then** the ledger is adjusted and the raw event is retained; an unknown event type is persisted and alerted, never dropped | integration |
| AC-MON-6 | **Given** a rewarded ad, **when** the ad closes, **then** the reward is granted server-side only, gated on completion, a session nonce and per-user/per-day/per-drama quotas, with an audit record. A client cannot mint entitlement | integration |
| AC-MON-7 | **Given** an incomplete ad view, **when** the ad closes, **then** no reward is granted and the unlock panel remains usable for another attempt | e2e |
| AC-MON-8 | **Given** recharge tiers, **when** they render, **then** price, currency and symbol come from the platform tier payload and are never hard-coded or locally converted | unit |
| AC-MON-9 | **Given** any payment branch, **when** it terminates, **then** the user has not lost money and recovering a lost unlock intent costs at most one tap | e2e |
| AC-MON-10 | **Given** an interstitial ad placement, **when** an episode is playing, **then** no interstitial interrupts playback | e2e, review |
| AC-MON-11 | **Given** VIP entitlement, **when** access is evaluated, **then** validity derives from the platform subscription state, never from a locally stored boolean | integration |

---

## 6. Capabilities and legacy clients

| # | Criterion | Method |
|---|---|---|
| AC-CAP-1 | **Given** any platform capability, **when** it is used, **then** it was probed with `canIUse` at boot and its state is read from the session capability object, not by testing for the SDK method. **(release-blocking)** | unit, device |
| AC-CAP-2 | **Given** an optional capability reported unavailable, **when** the UI renders, **then** its entry point is absent — not disabled, not explained | e2e |
| AC-CAP-3 | **Given** a required capability reported unavailable, **when** the session continues, **then** only the affected surface degrades and the session remains usable; the event is recorded | e2e |
| AC-CAP-4 | **Given** every monetization channel is unavailable, **when** the unlock panel opens, **then** it states plainly that purchases are unavailable rather than rendering an empty sheet | e2e |
| AC-CAP-5 | **Given** a TikTok client below 44.5.0, **when** playback starts, **then** `play_auth_token` is fetched lazily, immediately before playback, and is not cached beyond its validity | integration, device |
| AC-CAP-6 | **Given** each required capability forced to unavailable, **when** the app is exercised, **then** the UI degrades and never breaks. **(release-blocking)** | e2e |

---

## 7. Internationalization

| # | Criterion | Method |
|---|---|---|
| AC-I18N-1 | **Given** the shipped bundle, **when** locale completeness is checked, **then** the `en` locale has no missing key, and the build fails if it does. **(release-blocking)** | build |
| AC-I18N-2 | **Given** subtitles exist for the device language, **when** an episode starts, **then** that track is selected by default; otherwise English; otherwise the first available track | e2e, device |
| AC-I18N-3 | **Given** a drama that is only partially subtitled in a language, **when** the catalogue is published, **then** that language is not offered for that drama | integration |
| AC-I18N-4 | **Given** the app locale, **when** the player is created, **then** VePlayer `lang` is set from it, falling back to English for unsupported values | unit |
| AC-I18N-5 | **Given** an RTL locale in the launch set, **when** any screen renders, **then** layout mirrors correctly because logical CSS properties are used throughout | device |

---

## 8. Operations

| # | Criterion | Method |
|---|---|---|
| AC-OPS-1 | **Given** an album edit, **when** it is saved, **then** the console names the album version the action applies to; there is no version-ambiguous save | ops |
| AC-OPS-2 | **Given** an attempt to set an unapproved version as the online version, **when** it is submitted, **then** it is rejected server-side and alerted | integration |
| AC-OPS-3 | **Given** any moderation submission screen, **when** it opens, **then** the remaining urgent-priority quota for the organization that day is displayed, and spending the last of it requires an explicit confirmation | ops |
| AC-OPS-4 | **Given** an episode without a `byteplus_vid`, or a language with incomplete subtitles, **when** publishing is attempted, **then** it is blocked with a specific reason | integration |
| AC-OPS-5 | **Given** an emergency takedown, **when** it is rehearsed end to end, **then** platform delisting, catalogue offline, cache invalidation and active-player termination all complete within the incident SLO, and the rehearsal is archived. **(release-blocking)** | ops |
| AC-OPS-6 | **Given** an inbound user report, **when** it is triaged, **then** it is resolved or dismissed within 72 hours of submission, with payment reports triaged first and a named rota owning the queue. **(release-blocking)** | ops |
| AC-OPS-7 | **Given** the reconciler runs, **when** our catalogue and `album/query` disagree, **then** the drift is alerted with the album named — approved-but-not-online, listed-but-rejected, missing `vid`, or broken account binding | integration |

---

## 9. Compliance and release readiness

Each of these maps to an obligation in `docs/product/compliance-tiktok-minis.md` §5. All are release-blocking.

| # | Criterion | Obligation | Method |
|---|---|---|---|
| AC-CMP-1 | The emitted ZIP is ≤ 200 MB and contains no zero-byte file | RC-8 | build |
| AC-CMP-2 | TikTok Login is implemented and exercised in the boot sequence | RC-4 | build, device |
| AC-CMP-3 | The bundle contains no `eval`, no `Function` constructor, no string-form timer, and no `iframe` | RC-6 | build |
| AC-CMP-4 | No script or CSS is loaded from a non-self source, except the platform SDK tag and self-hosted fonts | RC-6 | build |
| AC-CMP-5 | Every runtime request target is inside the generated allowlist, which is ≤ 20 entries, `https://` or `wss://`, with no wildcards or paths, and is generated from one source shared with the Portal registration | RC-7 | build |
| AC-CMP-6 | All six required capabilities — silent login, rewarded ads, interstitial ads, Beans purchase, subscription, navigation bar — are integrated and verified on both platforms | RC-5 | device |
| AC-CMP-7 | Terms of Service and Privacy Policy URLs are live, reachable, and match the registered service domains | RC-10 | ops |
| AC-CMP-8 | Listing icon, name, description and category match the built app exactly, verified by an explicit diff before submission | RC-11 | ops |
| AC-CMP-9 | Every listed drama has passed content self-review against the ten content-requirement categories, with the record archived; adaptations of real events carry a fiction disclaimer | content policy | ops |
| AC-CMP-10 | The reviewer walkthrough (J19) has been rehearsed end to end in English on both platforms | RC-9 | device |
| AC-CMP-11 | A rollback target is identified — the previous approved package — and server-side kill switches are verified for every feature that could need an emergency change | RC-12 | ops |
| AC-CMP-12 | Business verification, EIS review where applicable, industry qualification, region approvals, contract signature and monetization enablement are all confirmed complete before submission | §3 of the compliance document | ops |

---

## 10. Traceability

| Journey | Criteria |
|---|---|
| J1 cold start | AC-BOOT-1 … AC-BOOT-6 |
| J2 golden path | AC-DISC-2, AC-PL-2, AC-MON-1, AC-MON-2, AC-MON-8, AC-MON-9 |
| J4 deep link | AC-DISC-5, AC-PL-5 |
| J5 ad unlock | AC-MON-6, AC-MON-7, AC-CAP-2 |
| J6 VIP | AC-MON-11 |
| J11 payment recovery | AC-MON-2, AC-MON-3, AC-MON-4, AC-MON-5, AC-MON-9 |
| J12 playback failure | AC-PL-7, AC-PL-8, AC-PB-1 |
| J15 platform-blocked | AC-PB-1 … AC-PB-4, AC-OPS-7 |
| J16 continuity | AC-PL-3, AC-PL-4, AC-PL-5, AC-PF-1, AC-PF-2, AC-PF-3 |
| J17 subtitles | AC-I18N-2, AC-I18N-3, AC-I18N-4 |
| J18 legacy clients | AC-CAP-1 … AC-CAP-6 |
| J19 reviewer walkthrough | AC-CMP-1 … AC-CMP-12 |
| J20 publishing | AC-OPS-1 … AC-OPS-4, AC-DISC-3 |
| J21 rejection and appeal | AC-OPS-1, AC-OPS-2 |
| J22 emergency takedown | AC-OPS-5, AC-PB-4 |
| J23 user reports | AC-OPS-6 |
| J24 onboarding | AC-CMP-12 |

---

## 11. How these relate to the existing gates

- They do **not** replace `docs/14-quality-gates.md`. The three-level gate model and the six iron rules (CI failure
  is failure, no deleting tests, no skipping failures, no lowering thresholds, no empty tests, main stays
  releasable) apply unchanged.
- Criteria marked `build` are expected to be implemented as build-time gates, which is where the platform's own
  code scan would otherwise catch them — later, and at the cost of a review cycle.
- Criteria marked `ops` produce an archived artefact (a rehearsal record, a diff, a signed checklist). "We think we
  did it" is not a pass.
- The release-blocking subset is intentionally a superset of nothing: every item in it corresponds to either a
  documented platform rejection cause, a money-integrity invariant, or an incident path that has no client-side
  recovery.
