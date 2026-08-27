# Wave 2 Ready Queue

> Wave 2 · plan slot P1. Branch `cursor/w2-plan-p1-0453`. Date 2026-08-27.
>
> W2 is the first **implement wave** of cycle C1 (`5k−3` for `k=1`, `docs/plan/wave-protocol.md` §2). Work slots
> A / B / C are the protagonists; plan slots P1 / P2 / P3 are supporting and may only carry adjudication writebacks
> and gate updates (§3.2 and §3.4 of the protocol; see conflict X-18 for the rule inconsistency this exposes).
>
> **This file is the authoritative execution queue for W2.** It supersedes `docs/plan/backlog.md` §2 for this wave
> only, because that queue was written before the architecture, product and technical-design slots landed and does
> not carry corrections A1–A6 (COR-1…COR-6), the 23 design deltas, the 67 acceptance criteria or the EIS gate. Every
> difference is itemized in §6 so P1 can write it back into the backlog at the C2 planning wave (`PLN-002`, W6).
> No other slot's file is modified by this document; the evidence behind each change is in
> `docs/plan/w1-conflict-register.md`.

---

## 1. What changed between the backlog's W2 queue and this one

The backlog's queue is ten tasks: six contract adjudications, two client-skeleton tasks, one CI-topology task and
one coverage task. All ten survive. What it is missing is everything the later Wave 1 slots produced:

- **The playback contract has no adjudication task.** Correction COR-4 (A4) changes `POST /episodes/{id}/playback-token`
  from a signed URL and quality ladder to a playback descriptor `{ albumId, episodeId, vid, playAuthToken? }`. This
  is a bigger contract change than any of C1–C10, and `CTR-007` (the OpenAPI transcription at W3) would otherwise
  transcribe a contract that cannot be implemented. It is now first in the slot-B queue as `CTR-009`.
- **`INF-001` cannot start.** Two documents specify two different repository layouts and two different backend
  module maps (conflict X-13). `INF-001`'s acceptance criterion says "matches `docs/03-tech-architecture.md` §9
  item by item", and that layout has no `media-ops` module and defines `playback` in terms of CDN signed URLs.
  `INF-009` resolves this and now precedes it.
- **Twenty-three registered design deltas have no carrier** (DM-1…DM-6, PS-1…PS-5, D-AC-1…D-AC-7, MI-1…MI-5).
  Carriers are `CTR-012`, `CTR-013`, `PLY-020`, `BRG-004`, `IA-001`, `IA-002`, `QA-004`.
- **The design set is written against the superseded media plane** (conflict X-14). `PLY-020` restates it before
  `PLY-001` is redefined at W14.
- **Slot P2 has no W2 task at all**, while `docs/product/sitemap-and-ia.md` §12 supersedes five statements in
  `docs/02-*` — including the deletion of PNL-05 and the change of episode switching from a route `replace` to
  `playNext`. `IA-001` and `IA-002` carry it.
- **EIS is not a gate anywhere.** `GOV-005` adds `GATE-7` and the five gate amendments from the One Page.
- **The identifier namespaces have collided** (N-1…N-7). `GOV-006` renames them once, now, rather than once per
  wave forever.

Net: ten tasks become twenty-four, of which two are scaffolding and the rest are adjudications, specifications and
writebacks. That ratio is correct for the first implement wave of a cycle whose exit criterion is "specification
baseline frozen" (`docs/plan/wave-protocol.md` §5.1, C1).

---

## 2. File ownership for Wave 2

`docs/plan/wave-protocol.md` §3.1 makes "one file, one owning slot" a hard constraint, but its table covers only
`docs/00-*` … `docs/14-*`, `app/`, `server/`, `contracts/`, `packages/`, `.github/` and `infra/`. Roughly half the
repository's documentation — `docs/architecture/`, `docs/product/`, `docs/design/` — has no owner, which is
conflict X-16. This table is the proposal, and it governs W2 until P3 adopts or amends it.

| Path | Owning slot | Rationale |
|---|---|---|
| `docs/00-*`, `docs/01-*` | **P1** | unchanged |
| `docs/plan/backlog.md`, `docs/plan/w2-ready-queue.md`, `docs/plan/w1-conflict-register.md` | **P1** | unchanged for the backlog; the two new files are P1's own output. Conflict X-17 asks P1 and P3 to confirm the backlog assignment, since W1 P3 authored it |
| `docs/02-*` | **P2** | unchanged |
| `docs/product/sitemap-and-ia.md`, `docs/product/user-journeys.md` | **P2** | they extend and supersede `docs/02-*`; splitting the owner from the superseded document would guarantee drift |
| `docs/product/compliance-tiktok-minis.md`, `docs/product/acceptance-criteria.md` | **P1** | compliance and acceptance are product-scope artefacts, and P1 already owns `docs/01-tiktok-minis-requirements.md` |
| `docs/03-*` | **P3** | unchanged. Becomes a summary plus links once X-15 is resolved |
| `docs/architecture/*` | **P3** | P3 is the architecture and execution-protocol slot; `docs/architecture/` is the canonical form of what `docs/03-*` states |
| `docs/plan/wave-protocol.md`, `docs/plan/definition-of-done.md` | **P3** | unchanged |
| `docs/11-*`, `app/` | **A** | unchanged |
| `docs/design/player-state-machine.md`, `docs/design/minis-integration.md` | **A** | both are client and bridge specifications; A implements them |
| `docs/12-*`, `server/`, `contracts/`, `packages/` | **B** | unchanged |
| `docs/design/domain-model.md`, `docs/design/api-contracts.md` | **B** | both are server and contract specifications |
| `docs/14-*`, `.github/`, `infra/` | **C** | unchanged |
| `docs/handoff/w<n>-<slot>.md` | the slot itself | unchanged |
| `docs/verify/*` | verification slots V1/V2/V3 | unchanged |

Two W2 tasks are deliberately co-owned because they change a file whose owner is a different slot from the one that
holds the knowledge. In both cases the **first-listed slot writes the file** and the others counter-sign in their
handoff, which keeps the hard constraint intact:

- `INF-009` is `P3+A+B`: P3 writes `docs/03-tech-architecture.md`; A and B counter-sign because they build against it.
- `CTR-005` is `B+C`: B writes `docs/12-api-contracts.md` §2.2, C writes `docs/14-security.md` §3.2, and the two
  statements must match word for word. This is unchanged from the backlog.

---

## 3. Definition of ready used here

A task is in this queue only if all four hold. Where one does not hold, the task is in §7 instead, with the reason.

1. Every dependency is complete, or is in this same wave **and shares a slot** with it (`docs/plan/backlog.md` §1
   rule 2 — no cross-slot serialization inside one wave).
2. Its gate is released, or it has none.
3. Its acceptance criterion is reproducible and states how it is proven — not "tested" or "reviewed".
4. Its output file has exactly one owning slot in §2.

---

## 4. The queue

Ordered by dependency, then by cost of delay. `New` marks an identifier created by this document; it is registered
in §5 for write-back into `docs/plan/backlog.md` at `PLN-002` (W6).

### 4.1 Tier 0 — unblockers

Nothing else in the wave is safe to finish before these three. Each one is a task that other, already-planned tasks
were silently depending on.

| # | ID | Task | Slot | Deps | Writes to | Acceptance criterion | Gate |
|---|---|---|---|---|---|---|---|
| 1 | `INF-009` **New** | Freeze the Wave 2 repository layout and the backend module map (conflict X-13) | **P3**+A+B | — | `docs/03-tech-architecture.md` §4.1, §9 | The fourteen-module map from `docs/architecture/tech-stack.md` §7 is adopted verbatim, including `media-ops`; `playback`'s description no longer mentions signed URLs or a key endpoint; `minis.config.json` is declared as generated from a single domain source rather than hand-maintained; `docs/03-tech-architecture.md` §9's tree is replaced by a pointer to `tech-stack.md` §7 with the superseded version recorded as a correction row, not deleted; A and B each record acceptance in their W2 handoff | — |
| 2 | `CTR-009` **New** | Adjudicate correction COR-4: the playback endpoint returns a descriptor, not a signed URL | **B** | `GOV-004` | `docs/12-api-contracts.md` §4.4, `docs/12-domain-model.md` §3.3 | `POST /episodes/{id}/playback-token` returns `{ albumId, episodeId, vid, playAuthToken? }`; `playUrl`, `expiresAt`, the quality ladder and the AES-128 key endpoint are removed from the contract and recorded as superseded with COR-2/COR-4 cited; `playAuthToken` is documented as required only below TikTok client 44.5.0 and as fetched immediately before playback, never cached beyond validity (`AC-CAP-5`); the `VideoAsset.quality` enum is marked platform-owned; a one-line note states that entitlement can deny but cannot grant playability (COR-3) | — |
| 3 | `PLY-020` **New** | Restate the player state machine against the VePlayer surface (conflict X-14) | **A** | — | `docs/design/player-state-machine.md` | Constraints CN-1, CN-3, CN-6, CN-7, CN-8 and the CN-11 mechanism are marked superseded with the replacing correction cited; `QualityRegion` and the media-cache table are removed; `TokenRegion` is reduced to `playAuthToken` acquisition for legacy clients; the main region keeps `locked`, `suspended`, `paused`, `seeking`, `errorRetryable` and `errorTerminal`, and invariants INV-P1 … INV-P11 are each either retained verbatim or restated with a reason; a new `blocked` state carries IAG-9 and satisfies `AC-PB-1`; `playNext` on one retained instance replaces the three-instance `EpisodeWindow` (`AC-PL-3`, `AC-PL-4`); preload is expressed as the two platform scenes with the transition rule, closing IAG-12; every state maps to a screen-inventory state so PS-2 can be closed by `IA-001`; the file states that MSE affects preload only, not playback (risk `M-3`, `AC-PF-3`) | — |

### 4.2 Tier 1 — contract adjudications (slot B)

These close the conflict ledger's contract half. They are the head of the project's longest dependency chain:
`CTR-009` + `CTR-001…006` + `CTR-010` → `CTR-007` (OpenAPI, W3) → `CTR-008` (generated types, W4) → every server
task from cycle C3 onward. A slip here moves every later cycle.

| # | ID | Task | Slot | Deps | Writes to | Acceptance criterion | Gate |
|---|---|---|---|---|---|---|---|
| 4 | `CTR-001` | Adjudicate X-01 (C1): login provider gains `TIKTOK` | B | `GOV-004` | `docs/12-api-contracts.md` §4.1 | Unchanged from `docs/plan/backlog.md` §4.2 | — |
| 5 | `CTR-002` | Adjudicate X-02 (C2): payment channel `TIKTOK_BEANS` | B | `GOV-004` | `docs/12-api-contracts.md` §4.6, `docs/12-domain-model.md` §5.3 | Unchanged, **plus**: the tier payload carries price, currency and symbol from the platform and the contract states they are never locally converted (`AC-MON-8`) | — |
| 6 | `CTR-004` | Adjudicate X-10 (C10): ad-unlock and subscription endpoints | B | `GOV-004` | `docs/12-api-contracts.md` §4.5, §4.6 | Unchanged, **plus**: the ad-unlock endpoint grants server-side only, gated on completion, a session nonce and per-user / per-day / per-drama quotas with an audit record, so that a client cannot mint entitlement (`AC-MON-6`, superseding the weaker "trust the client and log it" position in D-AC-4); subscriptions become a separate entity with periodic full sync as the primary path, not `RechargeOrder(productType=VIP)` (MI-4, IAG-4) | — |
| 7 | `CTR-003` | Adjudicate X-09 (C9): minor-unit amounts with `currency`, and per-language error messages | B | `GOV-004` | `docs/12-api-contracts.md` §2.1, §2.5 | Unchanged. Closes DM-4 in the same edit — they are the same conflict found twice | — |
| 8 | `CTR-005` | Adjudicate X-08 (C8): Minis-side token posture | B+C | `GOV-004` | `docs/12-api-contracts.md` §2.2, `docs/14-security.md` §3.2 | Unchanged from the backlog | — |
| 9 | `CTR-006` | Close IAG-5: search endpoint contract | B | `GOV-004` | `docs/12-api-contracts.md` §4.3 | Unchanged from the backlog | — |
| 10 | `CTR-010` **New** | Add the platform-blocked playback outcome and its error code (IAG-9) | **B** | `CTR-009` | `docs/12-api-contracts.md` §4.4, `docs/12-error-catalog.md` | A `BLOCKED` outcome exists and is distinguishable in code, copy and metrics from a locked episode and from a network failure (`AC-PB-1`, release-blocking); the error payload carries `albumId`, `episodeId`, `vid` and the platform payload so an operations alert can name the album (`AC-PB-2`); the catalogue's fallback-reason set gains `BLOCKED` alongside `NOT_FOUND` / `OFFLINE` / `MAINTENANCE`; the contract states the credit-back obligation when a paid episode stays blocked past the incident SLO (`AC-PB-3`) | — |

### 4.3 Tier 2 — adopting the design deltas (slot B, spans W2–W3)

| # | ID | Task | Slot | Deps | Writes to | Acceptance criterion | Gate |
|---|---|---|---|---|---|---|---|
| 11 | `CTR-013` **New** | Adopt domain-model deltas DM-1, DM-2, DM-3, DM-5, DM-6 | **B** | `GOV-004` | `docs/12-domain-model.md` §3.1–§3.4, §9.1 | `globalEpisodeNumber` is drama-unique and contiguous and is what display, free-episode judgement and cursors use, with the season-scoped revenue leak recorded as the reason (DM-1); `effectiveStatus` composition is defined and `DRAFT` reads as 404 (DM-2), **composed with the platform album state** so that a drama invisible to the platform is invisible to us (COR-3, `AC-DISC-3`); an `Unlock` record outranks VIP identity, so an expired VIP keeps individually-purchased episodes (DM-3); the two-level comment constraint is stated as application-layer with its error code (DM-5); an analytics retention window and a per-`user_id` deletion SLA are stated, with the partitioning granularity derived from them (DM-6). DM-4 is closed by `CTR-003`, not here | — |
| 12 | `CTR-012` **New** | Adopt contract, cache and error-taxonomy deltas D-AC-1, D-AC-2, D-AC-3, D-AC-5, D-AC-6, D-AC-7 and MI-2 | **B** | `CTR-009`, `CTR-010` | `docs/12-api-contracts.md` §2.3–§2.6, §4.10, `docs/12-error-catalog.md` | The error envelope carries `category`, `retryable` and `actionable` as pure additions, and the catalogue is annotated for every existing code, so an older client meeting a new code has a defined default (D-AC-1) — this is also what makes `BLOCKED` classifiable rather than special-cased; every endpoint declares its cacheability with `no-store` as the default (D-AC-2); `GET /config` is extended to cover the parameters that must be server-controlled **excluding** the PS-4 quality fields, which COR-1 invalidated, and **including** rewarded and interstitial ad unit IDs so that changing one does not cost a review cycle (MI-2); rate-limit buckets get initial numbers (D-AC-5); the idempotency key is user-scoped `(userId, idempotencyKey)` (D-AC-6); the pagination cursor is an opaque encoding of sort key plus id, with `globalEpisodeNumber` as the episode sort key (D-AC-7) | — |
| 13 | `CTR-011` **New** | Media-operations contract surface | **B** | `CTR-009` | `docs/12-api-contracts.md` new section; `contracts/media-ops.yaml` at W3 | Album versioning, the eight-state moderation machine, listing, album↔`client_key` authorization and the drift-reconciliation view are all specified — none of them exist today, because the media plane was assumed local (COR-2); setting an unapproved version as the online version is rejected server-side (`AC-OPS-2`); publishing is blocked with a specific reason when an episode has no `byteplus_vid` or a language's subtitles are incomplete (`AC-OPS-4`, `AC-I18N-3`); the reconciler's four drift classes are named — approved-but-not-online, listed-but-rejected, missing `vid`, broken account binding (`AC-OPS-7`); the remaining daily urgent-priority quota is a readable field (`AC-OPS-3`). **Target W3**, delivered as a separate contract document so it does not gate `CTR-007` | — |

### 4.4 Tier 3 — client foundation (slot A)

| # | ID | Task | Slot | Deps | Writes to | Acceptance criterion | Gate |
|---|---|---|---|---|---|---|---|
| 14 | `INF-001` | monorepo skeleton (pnpm workspaces + Turborepo) | A | **`INF-009`** | repository root, `app/`, `server/`, `packages/`, `infra/` | The tree matches the layout frozen by `INF-009` item by item; `pnpm install` and `pnpm -r build` pass; the lockfile is committed. *(Dependency added: the backlog listed none, which is what made the layout ambiguity invisible.)* | — |
| 15 | `INF-002` | Shared engineering configuration (tsconfig strict, eslint, prettier) | A | `INF-001` | `packages/config` | Unchanged from the backlog: TypeScript `strict` fully on, `pnpm lint` and `pnpm typecheck` at zero errors with warnings treated as errors, configuration centralized for reuse | — |
| 16 | `BRG-004` **New** | Reconcile the three `PlatformBridge` specifications into one, and adopt MI-1 as its behaviour contract | **A** | — | `docs/11-api-and-bridge.md` §5.2 | `docs/11-api-and-bridge.md` §5.2, `docs/architecture/system-overview.md` §4.2 and `docs/design/minis-integration.md` §5 are reconciled into one interface, with each difference resolved explicitly rather than merged silently; the interface carries an error model that normalizes to `BRIDGE_*` and never destructures an undocumented SDK error object (MI-1, U-05); per-call timeouts with the deliberate no-timeout exception for platform-native panels (MI-1, U-06, MI-5); single-instance `init` queuing (U-02); two-level capability gating — `canIUse` and the `/config` flag — where an unavailable optional capability has **no entry point** rather than a disabled one (`AC-CAP-1`, `AC-CAP-2`); a dual listener for platform lifecycle plus `visibilitychange`/`pagehide` taking whichever fires first (PS-3, IAG-6); all six required capabilities appear on the interface even where the platform capability is not yet enabled (COR-5, `AC-CMP-6`). Feeds `BRG-001` at W3 | — |

### 4.5 Tier 4 — gates and quality (slot C)

| # | ID | Task | Slot | Deps | Writes to | Acceptance criterion | Gate |
|---|---|---|---|---|---|---|---|
| 17 | `INF-000` | Freeze the three-level CI job topology | C | — | `docs/14-quality-gates.md` §7.1 | Unchanged from the backlog: the job list corresponds one-to-one with the topology, and each job states what it checks, what makes it fail and how it is reverse-verified. **Amended input:** the job list must accommodate the build-time gates specified by `QA-004`, which is why the two are same-slot and same-wave | — |
| 18 | `QA-003` | Freeze the five core modules and wire coverage grouping | C | `GOV-004` | `docs/14-quality-gates.md` §3.1 | Unchanged in shape. **Amended item 5:** "playback token issuance" becomes "playback descriptor issuance and entitlement enforcement", because COR-3 and COR-4 moved the enforcement point; the loss-exposure argument for including it is unchanged. The other four — payment orders, auth sessions, unlock and entitlement, content moderation state machine — are unchanged | — |
| 19 | `QA-004` **New** | Specify the build-time gates for the platform runtime restrictions and the release-blocking `build` criteria | **C** | `INF-000` | `docs/14-quality-gates.md` §2, `docs/14-security.md` §2.1 | Each of these is specified as a build-time gate with its failure condition and its reverse-verification method, ready for `INF-003` to implement at W3: no `<video>` element and no third-party player anywhere in the bundle including trailers (`AC-PL-1`, COR-1, release-blocking); no `eval`, no `Function` constructor, no string-form timer, no `iframe` (`AC-CMP-3`, COR-6); no script or CSS from a non-self source except the platform SDK tag and self-hosted fonts (`AC-CMP-4`); every runtime request target inside a generated allowlist of at most 20 `https://`/`wss://` entries with no wildcards or paths, generated from the one source shared with the Portal registration (`AC-CMP-5`, MI-3, closing the gap where E9 could only be discovered after upload); ZIP ≤ 200 MB with no zero-byte file (`AC-CMP-1`); the `en` locale has no missing key and the build fails if it does (`AC-I18N-1`). `docs/14-security.md` §2.1 is annotated to record that the platform's restrictions are stricter than CSP and are enforced first (COR-6, conflict X-07) — the CSP itself is unchanged and is still adjudicated by `APP-003` | — |

### 4.6 Tier 5 — plan-slot writebacks (supporting)

Permitted by `docs/plan/wave-protocol.md` §3.4, which lets an adjudicating slot write back in a later planning **or
implement** wave. Conflict X-18 records that `docs/plan/backlog.md` §1 rule 1 forbids this as literally written;
`GOV-006` fixes the rule. None of these tasks changes an acceptance standard frozen for this cycle.

| # | ID | Task | Slot | Deps | Writes to | Acceptance criterion | Gate |
|---|---|---|---|---|---|---|---|
| 20 | `IA-001` **New** | Apply the supersession table and the journey amendments to `docs/02-*` | **P2** | `PLY-020` (same wave, different slot — see the note below) | `docs/02-information-architecture.md`, `docs/02-screen-inventory.md`, `docs/02-user-journeys.md` | All five rows of `docs/product/sitemap-and-ia.md` §12 are applied: PNL-05 is deleted; episode switching becomes `playNext` on a retained instance with the URL updated and no screen teardown; the stall auto-downgrade with toast is removed because definition belongs to the player kernel; `playUrl` expiry, re-signing and the quality ladder are removed; the fallback-reason set gains `BLOCKED`. Amendments PA-1 … PA-10 are applied to J1–J14 and journeys J15–J24 are cross-linked. PS-2 is closed by mapping S6 to `locked` and S7 to `stalled` against `PLY-020`'s restated states. Every screen and panel identifier cited by `docs/product/*` resolves afterwards except the deliberately deleted PNL-05 | — |
| 21 | `IA-002` **New** | Land the new IA gaps and the two product decisions | **P2** | `IA-001` | `docs/02-information-architecture.md`, `docs/02-screen-inventory.md` | IAG-9 gets a distinct blocked-playback state with its own copy, distinct from our own takedown; IAG-10 gets an operations-console IA good enough for J20–J23 to be designable, built around album versions and the eight moderation states with the urgent quota visible at the point of submission; IAG-11 gets defined copy and behaviour for TikTok clients below 44.5.0 and for clients below the minimum library version; MI-5 adds the explicit exception that platform-native panels carry no client timeout and the server order state is the truth; PS-5 records auto-play-next as default-on with a setting, delivered as a `/config` flag. IAG-12 is closed by `PLY-020`, not here | — |
| 22 | `GOV-005` **New** | Register `GATE-7` (EIS), amend five gates from the One Page, and name the two unowned operational duties | **P1**+BIZ | `GOV-001` | `docs/plan/w1-conflict-register.md` §7 (this slot's file); proposed amendments to `docs/plan/wave-protocol.md` §6 for P3 | `GATE-7` exists with all four required elements — what it blocks, what it explicitly does not block, its release condition and its status — and states that it is released either by passing the review or by documenting a launch-region set that excludes Europe and the US; `GATE-1` gains the precondition that the organization name, the app name and the app type are permanent and need written business and legal sign-off before creation; `GATE-2` records the three-working-day lead time and that entity qualification becomes mandatory for publishing and monetization; `GATE-4` records that IAA has been self-service since 2026-07-09 and that enabling IAP opens a four-step contract flow, with the account manager as escalation rather than mechanism; `GATE-5` gains the USDS restricted-country screening and the data-security evidence requirement; `GATE-0` is reworded to "authenticated access required" rather than "not locatable". Conflicts C-ONE-1 … C-ONE-6 are each marked resolved-in-favour-of-the-One-Page. Named owners are recorded for the user-report rota (IAG-14, `AC-OPS-6`, release-blocking) and for the share decision (IAG-13) | — |
| 23 | `GOV-006` **New** | Remediate the identifier namespaces and the two process inconsistencies | **P1** | `GOV-004` | `docs/plan/backlog.md` §1, §6; `docs/plan/w1-conflict-register.md` | Renames N-1 … N-7 are applied in one pass and every citation still resolves: conflicts become `X-nn`, gates become `GATE-n`, design deltas become `D-AC-n`, IA gaps become `IAG-n`, architecture corrections become `COR-n`, Portal checklist items become `CHK-*`; the MSE/EME blocker becomes `B-8` and is restated as a preload-scope question. The `OBS` domain and the new `IA` domain are declared in `docs/plan/backlog.md` §1 (VF-4). Rule 1 gains the narrow exception for conflict-writeback and gate-status tasks (X-18). The conflict ledger moves out of `backlog.md` §6 into `docs/plan/w1-conflict-register.md`, with the backlog referencing it (X-17) | — |
| 24 | `GOV-003` | Start the business track and write back gate status | P1+BIZ | `GOV-001` | `docs/plan/w1-conflict-register.md` §7 | Unchanged in shape. **Amended content:** the EIS conversation with the account manager and the pre-submission questionnaire start now, because `GATE-7`'s duration is unpublished and it sits upstream of contract signing; the two permanent names go to sign-off before the organization is created; and the region decision (blocker B-4) is raised as the item that decides whether `GATE-5` and `GATE-7` apply at all | — |

**Note on `IA-001`'s dependency.** It depends on `PLY-020`, which is slot A, in the same wave — which
`docs/plan/backlog.md` §1 rule 2 forbids, and correctly so. The dependency is real but narrow: only the S6/S7 state
mapping (PS-2) needs `PLY-020`'s output. The resolution is to split rather than to weaken the rule: `IA-001` runs on
`docs/product/sitemap-and-ia.md` §12, which is already final, and the PS-2 mapping paragraph moves to `IA-003` in
W3. If `PLY-020` lands early in W2, P2 may fold it back in. `PLN-002` should record whichever happened.

---

## 5. New identifiers registered

For write-back into `docs/plan/backlog.md` at `PLN-002` (W6), preserving the backlog's eight-column schema. Two new
domain prefixes are declared here and formalized by `GOV-006`: **`IA`** for information-architecture writebacks
owned by P2, and **`OBS`** for observability, which `OBS-001` already used without declaring (VF-4).

| ID | Domain | Task | Wave | Slot | Gate |
|---|---|---|---|---|---|
| `INF-009` | INF | Freeze the repository layout and backend module map | W2 | P3+A+B | — |
| `CTR-009` | CTR | Adjudicate COR-4, the playback descriptor | W2 | B | — |
| `CTR-010` | CTR | Platform-blocked playback outcome and error code | W2 | B | — |
| `CTR-011` | CTR | Media-operations contract surface | W2–W3 | B | — |
| `CTR-012` | CTR | Adopt D-AC-1/2/3/5/6/7 and MI-2 | W2–W3 | B | — |
| `CTR-013` | CTR | Adopt DM-1/2/3/5/6 | W2–W3 | B | — |
| `PLY-020` | PLY | Restate the player state machine against VePlayer | W2 | A | — |
| `BRG-004` | BRG | Reconcile the bridge specifications, adopt MI-1 | W2 | A | — |
| `QA-004` | QA | Build-time gates for platform runtime restrictions | W2 | C | — |
| `IA-001` | **IA** *(new domain)* | Apply the supersession table and PA-1 … PA-10 | W2 | P2 | — |
| `IA-002` | IA | Land IAG-9 … IAG-11, MI-5, PS-5 | W2 | P2 | — |
| `IA-003` | IA | PS-2 state mapping, split out of `IA-001` | W3 | P2 | — |
| `GOV-005` | GOV | `GATE-7` EIS and five gate amendments | W2 | P1+BIZ | — |
| `GOV-006` | GOV | Namespace remediation, X-16 … X-18, VF-4 | W2 | P1 | — |
| `GOV-007` | GOV | Re-raise the free-episode cost guardrail against BytePlus-side controls, since PS-4's mechanism was invalidated by COR-1 | W6 | P1+P3 | — |

Thirteen of these enter W2 and one enters W3; `GOV-007` is deliberately deferred to the C2 planning wave. Applying
all fifteen takes the backlog from 142 tasks to 157.

---

## 6. Amendments to already-planned tasks

Registered, not applied — these are edits to `docs/plan/backlog.md`, which P1 makes at `PLN-002`. Every one of them
follows from a correction or conflict in `docs/plan/w1-conflict-register.md`.

| Task | Wave | Amendment | Reason |
|---|---|---|---|
| `INF-001` | W2 | Gains dependency `INF-009`; acceptance criterion points at the frozen layout instead of `docs/03-tech-architecture.md` §9 | X-13 |
| `QA-003` | W2 | Core module 5 becomes "playback descriptor issuance and entitlement enforcement" | COR-3, COR-4 |
| `CTR-007` | W3 | Gains dependencies `CTR-009` and `CTR-010`; explicitly **excludes** `CTR-011`, whose media-ops surface is transcribed separately so it does not gate the main contract | COR-4, IAG-9 |
| `SRV-001` | W4 | Nine modules become fourteen, per the frozen map; `playback` is no longer described as issuing signed URLs | X-13, COR-2 |
| `APP-003` | W7 | Keeps the CSP adjudication, and adds that the platform's runtime restrictions are the primary control and are checked at build time by the gates `QA-004` specifies | COR-6, X-07 |
| `PBK-001` | W13 | Retained. Acceptance criterion is restated: the server denies a locked episode at all three entry points, but the mechanism is refusing to issue a descriptor, not withholding a signed URL | COR-3, COR-4 |
| `PBK-002` | W14 | **Withdrawn.** "CDN signed URL and HLS AES-128 key interface" has no remaining subject; the media plane is BytePlus. Its budget moves to `CTR-011`'s implementation | COR-2 |
| `PLY-001` | W14 | **Rewritten.** "Native HLS first with an hls.js fallback" becomes "player façade over VePlayer: instance lifecycle, `playNext`, feed preload, media-info cache, event-to-analytics mapping", specified by `PLY-020` and gated by `AC-PL-1` through `AC-PL-8` | COR-1 |
| `PLY-002` | W12 | Restated: MSE/EME availability is a **preload** question, not a playback-feasibility question. Success is a per-OS-version preload-hit-rate measurement, with playback succeeding without preload and without a user-visible error on devices lacking MSE (`AC-PF-2`, `AC-PF-3`, risk `M-3`) | COR-1 |
| `PLY-003` | W42 | Same restatement; it no longer "clears B-3" but `B-8`, and its fallback branch is "no preload", not "no playback" | COR-1, N-2 |
| `QA-011` | W17 | Gains two items: fix `docs/plan/definition-of-done.md` S-A1 and S-A8, which scan PNL-05 after its deletion (VF-12); and record that `docs/product/acceptance-criteria.md` has no a11y group, so the release-blocking a11y bar exists only in the DoD | VF-12, X-12 |
| `REL-004`, `INT-006` | W58, W34 | The E5–E9 self-check becomes a re-run of gates that already exist from W3 via `QA-004`, rather than a first execution near submission | MI-3, `AC-CMP-5` |
| `wave-protocol.md` §5.1 C3 exit criterion | — | "MSE/EME probe conclusion written back, B-3 downgraded" becomes the preload-scope formulation and cites `B-8` | COR-1, N-2 |
| `wave-protocol.md` §6 gate table | — | Six gate amendments plus `GATE-7`, per `GOV-005` | §7 of the conflict register |

---

## 7. Deliberately not in W2

| Item | Why not, and when |
|---|---|
| `GOV-002` — obtain the authenticated One Page | Gate-type, no fixed wave. Its ask is now concrete rather than "obtain the PDF": see `docs/plan/w1-conflict-register.md` §8.4. Questions 2 and 6 are the two worth escalating first |
| `QA-005` event dictionary, `QA-006` content grading | Cycle C2 planning-wave output (W6), by design |
| `QA-011` a11y adjudication (X-12) | Cycle C4 implement wave (W17), by design. It is not urgent, but it is release-blocking, so it must not slip past C4 |
| `GOV-007` free-episode cost guardrail | Needs the BytePlus-side control surface, which `CTR-011` is only now specifying. W6 |
| X-03 privacy-baseline regionalization | Scheduled for C10 via `PLN-010`. **Flagged:** if Europe or the US is in the launch set, EIS makes information-sharing scope a review object far earlier than cycle 10, and this should be pulled forward. The decision belongs with the region decision, blocker B-4 |
| Any `app/` or `server/` feature code | W2's job is to freeze the specification baseline; the only code is the monorepo skeleton and shared configuration. Cycle C1's exit criterion is a frozen baseline, not a running application (`docs/plan/wave-protocol.md` §5.1) |
| Anything behind `GATE-1` … `GATE-7` | No gate is released. `docs/design/minis-integration.md` §9 establishes that the browse–play–progress path depends on none of them, which is why W2 is full of work despite that |

---

## 8. Critical path out of W2

```text
INF-009 ──► INF-001 ──► INF-002 ──► APP-001 (W4) ──► APP-002 (W7) ──► every client task
  (layout)

CTR-009 ─┐
CTR-001  │
CTR-002  ├──► CTR-007 (W3, OpenAPI) ──► CTR-008 (W4, generated types) ──► AUT/CNT/PBK and
CTR-003  │                                                                every server task
CTR-004  │
CTR-005  │    CTR-011 ──► contracts/media-ops.yaml (W3) ──► content-ops, deliberately off
CTR-006  │                                                   the main contract path
CTR-010 ─┘

PLY-020 ──► PLY-001 restated (W14) ──► PLY-010 … PLY-012 (C4)
BRG-004 ──► BRG-001 (W3) ──► BRG-002 (W3) ──► every Mock-path task in C3
QA-004  ──► INF-003 (W3, L1 gates) ──► INF-004 … INF-007
```

Two properties of this shape are worth stating because they are what the wave was arranged to achieve. The contract
chain and the client chain do not touch until W4, so slots A and B cannot block each other inside cycle C1. And
`CTR-011`, the largest new piece of specification, is deliberately kept off the main contract path — the media-ops
surface is real work, but nothing in cycles C1 through C5 depends on it, so letting it gate `CTR-007` would trade a
month of parallelism for nothing.

The single highest-cost delay in the wave is `CTR-009`. It is small — one endpoint and one enum — but `CTR-007`
transcribes it, `CTR-008` generates types from it, and every server task from C3 onward compiles against those
types. If it is wrong, the error is found in C3 by a player that cannot be built.

---

## 9. Self-check

| # | Check | Result |
|---|---|---|
| 1 | Every task has all eight backlog columns | Pass — 24 tasks, no empty cell |
| 2 | Every dependency resolves to a task in this queue or to one already complete | Pass — `GOV-001` and `GOV-004` are `[x]` in `docs/plan/backlog.md` §4.1; all others are in §4 above |
| 3 | No cross-slot dependency inside W2 | **One found and resolved by splitting**: `IA-001` → `PLY-020`. See the note at the end of §4.6. `INF-009` is co-owned `P3+A+B`, so `INF-001` (slot A) depending on it satisfies the slot-overlap rule |
| 4 | Every acceptance criterion states how it is proven | Pass — each names the document section, the identifier or the reverse-verification that settles it |
| 5 | Every file written in W2 has exactly one owning slot | Pass, under the §2 table. `CTR-005` and `INF-009` are co-owned tasks, not co-owned files: each file has one writer |
| 6 | No task lowers a threshold, removes a test, weakens a gate, or adds an exemption | Pass. `QA-004` and `CTR-004` both make requirements **stricter** than the design set proposed — `AC-MON-6` replaces D-AC-4's "trust the client and log it", and `AC-CMP-5` replaces MI-3's post-upload discovery of E9 |
| 7 | Every W1 finding has a carrier | Pass — cross-checked against `docs/plan/w1-conflict-register.md` §9, which enumerates 65 items, 63 of them still needing action; each maps to a task here, to a later wave with a named carrier, or to a gate |
| 8 | No queued task depends on an unreleased gate | Pass — the gate column is `—` for all 24. `GOV-003` and `GOV-005` **track** gates, they are not blocked by them |
| 9 | The plan-slot tasks in §4.6 are permitted in an implement wave | Pass under `docs/plan/wave-protocol.md` §3.4; conflict X-18 records that `docs/plan/backlog.md` §1 rule 1 contradicts it, and `GOV-006` fixes the rule in this same wave |

---

## 10. Change log

| Date | Wave · slot | Change |
|---|---|---|
| 2026-08-27 | W2 · P1 | First version. Extended the backlog's ten-task W2 queue to twenty-four; created fifteen identifiers and two domain prefixes; assigned owners and file ownership including the three previously unowned documentation trees; registered fourteen amendments to already-planned tasks, of which one withdrawal (`PBK-002`) and one rewrite (`PLY-001`) follow from correction COR-1/COR-2 |
