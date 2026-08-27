# Risk Register

> **Slot:** Wave 1 · architecture. Companion to `docs/architecture/system-overview.md` and
> `docs/architecture/tech-stack.md`.
> **Purpose:** the risks that can stop this app from shipping, or from staying shipped, on TikTok Minis — plus the
> blockers that currently prevent parts of the architecture from being finalized.

Scoring: **Likelihood** and **Impact** are High / Medium / Low. *Severity* is the pair, read together; a
Low-likelihood / High-impact risk still gets a mitigation because the cost of being wrong is asymmetric. Every risk
has an **early warning** — the observable signal that tells us it is materializing — because a mitigation you only
remember during the incident is not a mitigation.

---

## 1. Platform and dependency risks

| # | Risk | L | I | Mitigation | Early warning | Contingency |
|---|---|---|---|---|---|---|
| **P-1** | **TikTok Minis is available to approved partners only.** Without partner approval and a TikTok point of contact, the Portal's Minis and monetization configuration is not unlocked at all | M | High | Treat partner approval as the critical path item and start it before engineering ramps; it is a prerequisite for the client key, monetization enablement and the Android test client | No point of contact assigned; Minis configuration absent from the app page | Nothing technical routes around this. Build against `MockBridge` and the documented contracts so engineering is not idle, but the launch date is gated |
| **P-2** | **Industry qualification requires a playable link to a representative mini drama on another platform.** A first-time publisher with no prior catalogue cannot satisfy this as written | M | High | Confirm early whether a licensor's existing catalogue link and a proof-of-identity document satisfy the requirement, or whether we must publish elsewhere first | Qualification application returns a request for a work link we cannot supply | Partner with a licensor/publisher who already holds a qualifying link; or launch the representative title on another platform first |
| **P-3** | Required platform capabilities are gated on client version and on `canIUse`. Calling an unavailable JSAPI on an older TikTok build can break the session | M | M | Every bridge call is `canIUse`-gated; capability state is computed once at boot and drives UI (`system-overview.md` §3.3). The Portal's "minimum supported library version" is set deliberately, not by default | Capability probe reports unavailable for a required capability on real devices | Raise minimum supported library version and accept the reachable-audience cost; degrade the affected feature rather than the session |
| **P-4** | SDK behaviour changes between versions (the SDK changelog is a Portal-managed document) | M | M | Bridge isolates the entire SDK surface; contract tests run against recorded SDK responses; the changelog is reviewed as part of each release | Behaviour differences between preview and production clients | Hotfix inside the bridge only; business code is unaffected |
| **P-5** | Trusted-domain budget of 20 (`https://`/`wss://`, no wildcards, no paths) is exhausted by well-meaning additions | L | M | One domain source file generates both `minis.config.json` and the Portal list; a CI check fails on any request target outside it; policy is one API domain plus the minimum, with third parties proxied server-side | Domain list review shows >12 entries | Consolidate behind our API domain; drop or proxy the offending dependency |
| **P-6** | The mini-drama SDK namespace (`TTMinis.*` vs `TTMinis.game.*`) is inconsistent between the drama and games documentation | M | L | Bridge resolves the namespace at init and logs the binding | Bridge logs the unexpected namespace on device | One-line change inside the bridge |
| **P-7** | Documented launch regions conflict between pages (one lists Brazil, Indonesia, Japan, Malaysia, Philippines, Saudi Arabia, Thailand, Turkey, US, Vietnam; another says Japan and the US only) | M | M | Confirm the current region list with the TikTok contact before committing to localization scope and legal review | Region selector in the Portal does not offer the planned launch region | Re-scope first launch to a confirmed region; the architecture is region-agnostic so the cost is localization and legal, not rework |
| **P-8** | Apple Team ID is required for iOS users to access the Minis app | L | M | Collect it during account preparation, alongside business verification | iOS preview fails while Android works | Blocking for iOS only; supply the Team ID |

---

## 2. Media and playback risks

| # | Risk | L | I | Mitigation | Early warning | Contingency |
|---|---|---|---|---|---|---|
| **M-1** | **Playability is platform-controlled.** An episode that is entitled, paid for and live in our catalogue is still unplayable if the album version is unmoderated, not set as the online version, delisted, or if the BytePlus account binding is invalid | M | High | Continuous reconciliation between our catalogue and `album/query` (`system-overview.md` §6.3); the storefront serves only the online version; publishing is a state machine, not a flag | Reconciler drift alert; spike in player errors on a specific album | Delist the affected drama from our feed within minutes; refund or re-credit affected unlocks automatically |
| **M-2** | Native `<video>` or any third-party player anywhere in the bundle gets replaced with a blocked UI | L | High | Lint rule plus post-build bundle scan (`tech-stack.md` §6); no video element is permitted even for trailers | Blocked-UI element appears in preview testing | `TTMinis.setValidateVideoReplaceElement` to customize the replacement while the offending surface is removed; request a migration exemption if a legacy surface must survive temporarily |
| **M-3** | Preload requires MP4 + MSE (Android WebView, iOS 17.1+ `ManagedMediaSource`). Older iOS devices get no preload, so episode-switch latency is materially worse for that cohort | High | M | `enableMp4MSE: true` with graceful no-preload fallback; first-frame metrics segmented by OS version so the gap is measured, not assumed | First-frame p95 divergence between iOS <17.1 and everything else | Reduce perceived latency for that cohort (poster-first transitions, earlier playback-session fetch); do not add a custom prefetch that competes for bandwidth |
| **M-4** | Asynchronous ingest (`job_id` polling for video and subtitles) fails silently, leaving an album with a missing `byteplus_vid` | M | M | Durable jobs with backoff, dead-letter queue and alerting; publishing is blocked while any episode lacks a `vid` | Media job dead-letter count > 0 | Manual re-ingest from the staging bucket; the master is retained until the platform copy is verified |
| **M-5** | Moderation latency (1–3 working days) plus a 35/day organization cap on urgent submissions constrains release cadence | High | M | Content calendar treats moderation as a scheduled lead time; the urgent quota is tracked and shown in the CMS; batching rules avoid burning quota on low-priority titles | Urgent quota consumption > 70% before mid-day | Re-plan the release slate; reserve urgent capacity for titles with paid promotion behind them |
| **M-6** | Editing an album creates a new version; publishing the wrong version makes a "small metadata fix" ship unmoderated content or revert an approved one | M | M | Version is explicit in every CMS action; `online_version` is only ever set to a version whose `review_status` is approved, enforced server-side | Attempt to set an unapproved version as online (rejected and alerted) | Roll `online_version` back to the last approved version |
| **M-7** | Subtitles must be uploaded per language and bound per video; a partial upload produces an episode that shows subtitles in some languages and not others | M | L | Subtitle completeness is a publish precondition per language in the release scope | Publish precondition check fails | Publish with the confirmed language set; add languages in a later album version |

---

## 3. Review and rejection risks

Code review, basic-information review and content moderation are three separate gates. Most rejection causes are
avoidable and are therefore treated as pre-submission checks rather than risks to absorb.

| # | Risk | L | I | Mitigation | Early warning | Contingency |
|---|---|---|---|---|---|---|
| **R-1** | **Code scan rejection** — empty files, missing TikTok Login, unrestricted dynamic script sources, requests to unregistered domains | M | High | All four are build-time gates (`tech-stack.md` §6). The package step refuses to produce a ZIP that would fail the scan | Package step failure in CI | Fix and re-upload; a preview version costs nothing (up to 30 are allowed) |
| **R-2** | **English incompatibility** — the app must be compatible with English to pass review | M | High | English is the default locale and is bundled; an i18n completeness check fails the build on any missing `en` key; on-device review rehearsal is done in English | Missing-key report non-empty | Ship English-only for the first version and add locales in later releases |
| **R-3** | **Listing/app mismatch** — basic information is cross-referenced during code review, so a screenshot, description, category or legal URL that does not match the built app is a rejection cause | M | High | Listing copy, icon and legal URLs are version-controlled next to the code and diffed as part of the release checklist; ToS and privacy URLs must be live and reachable before submission (empty or placeholder configuration also breaks login and authorization at runtime) | Release checklist diff shows drift | Correct the listing and resubmit; basic-information approval is a separate, faster gate |
| **R-4** | **First release must go to full production** — gray release is only available once a production version exists, so there is no 1% canary for launch | High | High | Compensate with preview builds on real devices for both platforms, a platform sandbox pass on the money paths, and server-side kill switches for every risky behaviour so a bad client can be neutered without a review cycle | — (structural, not an event) | Emergency mitigation is server-side config; a client fix requires a new review cycle, so the config surface must be broad enough to disable any feature |
| **R-5** | **Rollback is not a percentage dial** — only one production and one gray version can be live, and a gray percentage must exceed the current one | M | High | Always keep the previous approved package ready to promote; every release is preceded by an explicit "what do we promote if this is bad" answer | — (structural) | Promote the previous approved version; disable the feature via server config in the meantime |
| **R-6** | **Content moderation rejection** on a drama (any failing shell element or episode makes the whole version unplayable) | M | High | Content compliance review before submission against TikTok content policy; the appeal API is part of the CMS workflow with attachment support | `review_status` = rejected | Appeal with evidence, or re-cut and submit a new version; the storefront never lists an unapproved version so users are unaffected |
| **R-7** | Monetization features integrated before enablement and contract signature is complete | M | M | Ads and IAP are behind capability flags and are dark until enablement is confirmed; the unlock panel always renders at least one available channel | Portal shows monetization not enabled while flags are on | Ship with monetization disabled and free content only; enable by config afterwards |
| **R-8** | Prerequisites incomplete at submission (business verification, industry qualification, basic-information approval, all required capabilities integrated) | M | M | A submission gate checklist mirroring the platform's prerequisite list; submission is not attempted until all are green | Any checklist item unverified | Delay submission; a rejected submission costs a full review cycle |

---

## 4. Commercial, compliance and operational risks

| # | Risk | L | I | Mitigation | Early warning | Contingency |
|---|---|---|---|---|---|---|
| **C-1** | **Fulfilment on the client callback instead of the webhook** — the classic revenue/entitlement bug. The client success callback only means the payment sheet closed | M | High | Fulfilment is webhook-only by construction: the client callback moves the UI to "confirming" and grants nothing. Enforced by design review and by a test that asserts no entitlement write exists on the client callback path | Any entitlement granted without a corresponding webhook record | Reconcile from `trade_order/query/`; the order sweeper already does this continuously |
| **C-2** | Webhook signature algorithm and payload fields are not documented publicly (blocker B-2) | High | M | The verifier sits behind an interface with a fail-closed default; sandbox webhooks are captured as fixtures as soon as they are available | Webhook verification failures in sandbox | Verification is a single swappable implementation; nothing else changes |
| **C-3** | Lost or delayed webhooks leave paid users unfulfilled | M | High | Sweeper job queries pending orders against `trade_order/query/`; users see an honest "confirming" state with a support path rather than a silent failure | Pending-order age p95 rising | Manual fulfilment tooling in the operations console, with an audit trail |
| **C-4** | Refund and partial claw-back events (`refund_success`, `refund_traceback`) arrive against an unmodelled event type | M | M | All documented event types are modelled now, including the ones currently marked unavailable; unknown event types are persisted and alerted rather than dropped | Unknown-event alert | Ledger reversal tooling; the raw event is retained so nothing is lost |
| **C-5** | Sandbox orders contaminate production ledgers (`is_sandbox` in payload) | L | High | `is_sandbox` is checked before any ledger write; sandbox traffic routes to a separate ledger space | Sandbox flag observed on a production ledger entry | Ledger correction from the retained raw events |
| **C-6** | Rewarded-ad reward fraud (client claims completion it did not earn) | M | M | Rewards are granted server-side only, gated on `isEnded`, a session nonce and per-user/per-day/per-drama quotas, with an audit log | Ad-grant rate anomaly per user or per device | Tighten quotas by config; disable ad unlock while retaining the coin channel |
| **C-7** | Ad inventory or fill rate is poor in a launch region, so the ad-unlock funnel underperforms | M | M | Ad unlock is never the only path to an episode; coins are always available | Ad show failure rate by region | Feature-flag ad unlock off per region |
| **C-8** | Regional legal requirements (Vietnam G1 licence, US launch approval, minors/consumer-protection rules in the launch set) are discovered late | M | High | Region requirements are part of launch planning, not release engineering; US and Vietnam are treated as separate tracks with their own lead time | Region blocked at basic-information submission | Launch the unblocked regions first; the architecture is region-agnostic |
| **C-9** | Privacy baseline was written against PIPL/China assumptions while the launch set is elsewhere (registered as C3 in `docs/handoff/w1-p3.md`) | High | M | Baseline moves to strict-by-default minimization plus a per-region matrix; `open_id` is the user key and explicit-authorization profile data stays optional and separable | Legal review flags the mismatch | Documentation change only, provided minimization was actually implemented — which is why it is designed in rather than retrofitted |
| **C-10** | Settlement and payout operations (statement confirmation, invoice upload) are unowned | M | M | Named finance owner and a documented monthly process before the first revenue period closes | First statement period approaches with no owner | Manual process; the risk is delayed payout, not lost revenue |

---

## 5. Blockers

Blockers prevent a decision from being finalized. They are not risks to be mitigated; they need an action and an
owner.

| # | Blocker | Blocks | Action | Owner |
|---|---|---|---|---|
| **B-1** | **The official One Page PDF is not in the workspace and could not be located publicly.** All platform facts in this architecture set are reconstructed from public TikTok for Developers documentation (retrieved 2026-08-27, sources listed in `system-overview.md` §15) | Confidence in every platform-derived requirement | Obtain the PDF, then diff in this order: `docs/11-official-onboarding-checklist.md` → `docs/01-tiktok-minis-requirements.md` → `docs/architecture/system-overview.md` §1.1 correction registry → `docs/architecture/tech-stack.md` §6 enforcement matrix. Record any contradiction as a new correction row rather than editing history | Requester / TikTok contact |
| **B-2** | Webhook signature algorithm and field list unconfirmed | Final `platform-tiktok` webhook verifier | Obtain from the Portal webhook documentation or the TikTok contact; capture sandbox fixtures | Backend + TikTok contact |
| **B-3** | Partner approval, client key, monetization enablement and the Android test client are not yet in hand (see P-1) | On-device verification of every platform capability | Start the account, verification and qualification track immediately | Business |
| **B-4** | Launch regions not decided, and the documented region list is inconsistent (P-7) | Localization scope, legal URLs, RTL scope, hosting region | Confirm with the TikTok contact and business; write the answer into `docs/03-nonfunctional.md` §7 | Business |
| **B-5** | `minis.config.json` full field set unverified | Domain generation and build configuration details | Run `minis init` against a real project in Wave 2 and reconcile with the Portal domain list | Frontend |
| **B-6** | BytePlus account, space name and the album↔`client_key` authorization model are not set up | The entire ingest and publishing pipeline | Create and bind the BytePlus account during account preparation; verify with one end-to-end test album | Content ops |
| **B-7** | Content licensing and the first-title slate are undefined | Ingest volume, moderation scheduling, storage sizing | Product and business decision | Business |

---

## 6. Pre-submission checklist

Derived from the platform's own prerequisites and rejection causes. Every item is verifiable, and the ones marked
*(auto)* fail the build rather than the review.

**Organization and app**

- [ ] Business verification approved
- [ ] Industry qualification approved
- [ ] Basic information submitted and approved (app info, category, icon, description)
- [ ] Terms of Service and Privacy Policy URLs live, reachable, and matching the service domains
- [ ] Apple Team ID provided
- [ ] Release regions selected, with region-specific approvals in hand (US approval, Vietnam G1 where applicable)
- [ ] Trusted domains registered, ≤ 20, `https://`/`wss://`, no wildcards or paths
- [ ] Payment webhook callback URL configured and URL properties verified
- [ ] Ad units configured for rewarded and interstitial formats
- [ ] Minimum supported library version set deliberately

**Package** *(auto)*

- [ ] ZIP ≤ 200 MB, no zero-byte files
- [ ] TikTok Login implemented and exercised in the boot sequence
- [ ] No `eval`, no `Function` constructor, no string-form timers, no `iframe`
- [ ] No `<video>` element and no third-party player in the emitted bundle
- [ ] No script or CSS from a non-self source except the platform SDK tag and self-hosted fonts
- [ ] Every runtime request target is inside the generated domain allowlist
- [ ] `en` locale complete

**Capabilities on device**

- [ ] Silent login, explicit authorization (and graceful refusal), rewarded ads, interstitial ads, Beans purchase,
      subscription, navigation bar colour and menu-button safe area — each verified on both iOS and Android
- [ ] VePlayer plays, switches episodes via `playNext`, reports preload hits, and recovers from an error
- [ ] Every capability verified against `canIUse` returning false (forced), with the UI degrading rather than breaking

**Money paths in sandbox**

- [ ] Purchase → webhook → fulfilment, with the client callback proven not to grant anything
- [ ] Duplicate webhook delivery produces exactly one fulfilment
- [ ] Lost webhook is recovered by the order sweeper
- [ ] Refund and claw-back events adjust the ledger correctly
- [ ] Sandbox orders never touch production ledgers

**Content**

- [ ] Every listed drama: album version approved, set as `online_version`, listed, `client_key` authorized
- [ ] Reconciler reports zero drift between our catalogue and `album/query`
- [ ] Subtitles complete for every language in the launch scope
- [ ] Kill switch rehearsed end to end within the incident SLO

**Release readiness**

- [ ] Previous approved package identified as the rollback target
- [ ] Server-side kill switches verified for every feature that could require an emergency change
- [ ] On-call, alerting and the reconciliation dashboards live before the first release, not after
