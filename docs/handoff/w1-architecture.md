# W1 Architecture — Handoff

> Wave 1 · architecture slot. Branch: `cursor/w1-architecture-bed5`, branched from `main` and fast-forwarded onto
> `cursor/w1-plan-p3-1d0f` so the earlier Wave 1 documents are present and cross-references resolve.
> Constraints observed: no subagents, no pull request, no CI created or weakened, no tests removed, no existing
> slot document rewritten.

## 1. Deliverables

| File | Contents |
|---|---|
| `docs/architecture/system-overview.md` | Canonical architecture: platform runtime model, boot sequence and capability policy, client layering and `PlatformBridge`, routes and page inventory, **VePlayer-based playback**, content/media supply chain through BytePlus and TikTok moderation, backend module map, money and entitlement flows, data stores, analytics, i18n, environments and release, cross-cutting concerns, open items, source list |
| `docs/architecture/tech-stack.md` | 24 justified decisions (T1–T24) with rejected alternatives, the reasoning behind the client/backend/telemetry shape, and a platform-constraint → build-time-enforcement matrix |
| `docs/architecture/risks.md` | 33 risks across platform, media/playback, review/rejection and commercial/compliance/operations, each with likelihood, impact, mitigation, early warning and contingency; 7 blockers; a pre-submission checklist |
| `docs/handoff/w1-architecture.md` | This file |

All five Mermaid diagrams in `system-overview.md` were rendered with `@mermaid-js/mermaid-cli` to confirm they parse.

## 2. What changed relative to the earlier Wave 1 architecture

The previous pass (`docs/03-tech-architecture.md`, `docs/03-stack-decision.md`) was written before the mini-drama
player and media-asset documentation had been located, and designed a self-hosted media plane. That design cannot
ship on this platform. The corrections are registered as **A1–A6** in `docs/architecture/system-overview.md` §1.1
and summarized here:

1. **A1 — Playback:** VePlayer via `TTMinis.getPlayer()` is mandatory. Third-party players and native HTML video are
   replaced by TikTok with a blocked UI. `hls.js`, `video.js` and `<video>` are out.
2. **A2 — Media:** episode video is hosted in BytePlus and registered through the `/v2/sg/shortdrama/*` media-asset
   APIs. No own transcoding, HLS ladder, AES-128 or CDN signing. Our object storage is an ingest staging area only.
3. **A3 — Play control:** the platform enforces playability from moderation status, online version, listing status
   and album↔`client_key` authorization. Our entitlement check can deny but cannot grant.
4. **A4 — Contract:** `POST /episodes/{id}/playback-token` returns `{ albumId, episodeId, vid, playAuthToken? }`
   rather than a signed URL and quality ladder. `play_auth_token` is only needed for TikTok clients below 44.5.0.
5. **A5 — Capabilities:** interstitial ads are required alongside rewarded ads, silent login, Beans IAP,
   subscriptions and the navigation bar.
6. **A6 — Bundle safety:** platform runtime restrictions (no `eval`/`Function`/string timers/`iframe`, self-source
   scripts and CSS, blocked web APIs, ≤ 20 trusted domains) are stricter than the CSP-first framing in
   `docs/14-security.md` §2.1 and are enforced at build time.

Two UI-level corrections follow from A1 and are worth flagging to the IA/product slots: the quality/speed panel
**PNL-05 is removed** (VePlayer owns those controls; two competing controls is a guaranteed bug), and episode
switching uses `playNext()` on a single retained player instance.

Everything else from the earlier slots — information architecture, journeys, screen inventory, domain model, error
catalogue, quality gates, security and test strategy — is adopted unchanged.

## 3. Assumptions

- The platform facts are reconstructed from public TikTok for Developers documentation retrieved 2026-08-27; the
  full source list is in `system-overview.md` §15.
- The `docs/architecture/` set is written in English while the earlier slots wrote Chinese. Rationale and a
  terminology map are in `system-overview.md` §14. If the integrator wants one language across the repository, this
  set is the one to translate, since it is the set that is checked against English platform documentation.
- Mini-drama apps use the bare `TTMinis.*` namespace; the bridge resolves it at runtime as a hedge (open item O-1).
- Webhook signatures are assumed HMAC-SHA256 over the raw body with a timestamp window, behind a swappable verifier
  interface (blocker B-2).

## 4. Blockers

Full detail in `docs/architecture/risks.md` §5.

| # | Blocker | Impact |
|---|---|---|
| B-1 | **The official One Page PDF is not in the workspace and was not locatable publicly.** A diff procedure is defined for when it arrives | Confidence in every platform-derived requirement |
| B-2 | Webhook signature algorithm and field list unconfirmed | Final webhook verifier implementation |
| B-3 | Partner approval, client key, monetization enablement and the Android test client not in hand — TikTok Minis is approved-partners-only | All on-device verification |
| B-4 | Launch regions undecided, and the documented region list is inconsistent between platform pages | Localization scope, legal URLs, RTL scope |
| B-5 | `minis.config.json` full field set unverified | Domain generation and build configuration |
| B-6 | BytePlus account, space and album authorization not set up | The entire ingest and publishing pipeline |
| B-7 | Content licensing and first-title slate undefined | Ingest volume, moderation scheduling |

Two onboarding risks deserve attention above the rest because they are business-track, not engineering-track, and
they gate everything: **P-1** (partner approval) and **P-2** (industry qualification requires a playable link to a
representative mini drama on another platform, which a first-time publisher cannot supply).

## 5. Next work-slot tasks

**Contract slot**

1. Transcribe the corrected playback contract (A4) into `contracts/` as OpenAPI 3.1, together with the C1/C2/C9/C10
   contract revisions already registered in `docs/handoff/w1-p3.md` §3.
2. Add the media-ops contract surface: album versioning, moderation state machine (8 states), listing, and the
   reconciliation view — it did not exist in `docs/12-api-contracts.md` because the media plane was assumed local.

**Frontend slot**

3. Scaffold `app/` per `tech-stack.md` §7; first module is `platform/` with `TikTokBridge` and `MockBridge`.
4. Build the player facade against VePlayer: instance lifecycle, `playNext`, feed preload
   (`prepare` → `setPreloadScene(1, …)` → `setPreloadList`), media-info cache, event→analytics mapping.
5. Land the lint rules and post-build bundle scan from `tech-stack.md` §6 with the first commit, not later.

**Backend slot**

6. Fastify module skeleton per `system-overview.md` §7.1, starting with `identity` + `platform-tiktok`, then
   `catalog`/`playback`, then `wallet`/`billing`/`entitlement`.
7. Implement the webhook pipeline fail-closed behind a swappable verifier, plus the order sweeper, from day one.

**Content-ops slot**

8. Design the CMS around album versions rather than dramas, and implement the drift reconciler
   (`system-overview.md` §6.3) alongside the publishing flow — not after it.

**Business/ops track (parallel, gating)**

9. Partner approval, business verification, industry qualification, monetization enablement, BytePlus account
   binding, region decision, and the Apple Team ID.
