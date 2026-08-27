# Wave 1 Conflict Register and Output Verification

> Wave 2 · plan slot P1. Branch `cursor/w2-plan-p1-0453`, created from `cursor/w1-product-ia-9cd1` (`bcfa5ee`) with
> `cursor/w1-technical-design-docs-8a32` (`4c73e5e`) and `cursor/w1-plan-p3-e16a` (`580e46b`) merged in (octopus, no
> conflicts). Date 2026-08-27.
>
> This document does two things. It records what was independently verified about the Wave 1 outputs, and it
> registers every contradiction between them. It **does not rewrite any other slot's file**; every entry names an
> owner and a carrier task. The executable consequence of this register is `docs/plan/w2-ready-queue.md`.
>
> Language: English, matching `docs/architecture/` and `docs/product/`. The terminology map to the Chinese Wave 1
> documents is in `docs/architecture/system-overview.md` §14 and `docs/product/sitemap-and-ia.md` §13.

---

## 1. What Wave 1 produced, and which of it is now integrated

| Branch | SHA | Output | Present on this branch |
|---|---|---|---|
| `cursor/w1-work-a-1d0f` | `f42a67f` | `docs/11-*` — official onboarding checklist, API and bridge draft | yes |
| `cursor/w1-work-b-1d0f` | `71d27fe` | `docs/12-*` — domain model, REST contracts, error catalogue | yes |
| `cursor/w1-work-d-1d0f` | `ef9fba5` | `docs/14-*` — quality gates, security, test plan | yes |
| `cursor/w1-plan-p1-1d0f` | `2eedf89` | `docs/00-*`, `docs/01-*` — wave skeleton, product scope, requirements | yes |
| `cursor/w1-plan-p2-1d0f` | `07cd250` | `docs/02-*` — IA, journeys J1–J14, screen inventory | yes |
| `cursor/w1-plan-p3-1d0f` | `3c2b296` | `docs/03-*` — tech architecture, stack ADRs, non-functional budgets; conflict ledger C1–C11 | yes |
| `cursor/w1-architecture-bed5` | `3692cf5` | `docs/architecture/*` — canonical system overview, 24 tech decisions, 33 risks, **corrections A1–A6** | yes |
| `cursor/w1-product-ia-9cd1` | `bcfa5ee` | `docs/product/*` — sitemap/IA, journeys J15–J24 + PA-1…PA-10, One Page compliance extract, 67 acceptance criteria | yes |
| `cursor/w1-technical-design-docs-8a32` | `4c73e5e` | `docs/design/*` — domain model schema, player state machine, API/cache/error taxonomy, Minis integration points | yes (merged here) |
| `cursor/w1-plan-p3-e16a` | `580e46b` | `docs/plan/*` — 60-wave protocol, 142-task backlog, four-layer definition of done | yes (merged here) |

The two branches named in the Wave 2 brief as possibly still in flight — a research slot and a skeleton slot — do
not exist on the remote at this SHA. `git ls-remote --heads origin` returns exactly the ten branches above plus
`main` (`fc1333f`, README only). Nothing was waited for.

**Merge result:** the octopus merge of `cursor/w1-technical-design-docs-8a32` and `cursor/w1-plan-p3-e16a` into
`cursor/w1-product-ia-9cd1` produced zero file conflicts, because every Wave 1 slot respected the
no-rewriting-another-slot's-file rule. The contradictions are therefore all *semantic*, and none of them would have
been surfaced by git. That is what the rest of this document is for.

---

## 2. Verification performed

Method: re-derive the Wave 1 slots' own self-check claims from the merged tree rather than trusting the numbers as
written, then resolve the cross-document references that the Wave 1 self-checks explicitly deferred
(`docs/plan/backlog.md` §7.1 check 13 marks cross-file references as "to be validated after integration"; this is
that validation, in part).

| # | Claim or check | Result | Evidence |
|---|---|---|---|
| VF-1 | `docs/plan/backlog.md` §7: 142 tasks, 142 unique IDs, 258 dependency edges, no dangling dependency | **Pass** | Re-parsed the §4/§5 task tables: 142 rows, 142 unique IDs, 258 edges, empty dangling set |
| VF-2 | `docs/product/acceptance-criteria.md`: 67 criteria in nine groups | **Pass** | 67 unique `AC-<GROUP>-<n>` identifiers; 14 marked release-blocking |
| VF-3 | Journeys and amendments complete | **Pass** | J1–J24 contiguous, PA-1 … PA-10 present, every `AC-*` cited in the traceability matrix resolves |
| VF-4 | Backlog task IDs use only the domains declared in `docs/plan/backlog.md` §1 | **Fail (minor)** | `OBS-001` uses domain prefix `OBS`, which §1's domain list does not declare. Carrier `GOV-006` |
| VF-5 | Backlog §1 rule 1 ("main slot `P1/P2/P3` → planning waves only") is consistent with the protocol | **Fail (process)** | `docs/plan/wave-protocol.md` §3.4 explicitly permits an adjudicating slot to write back "in a later planning **or implement** wave", and §3.2 gives plan slots supporting duties during implement waves. Rule 1 as written forbids exactly that. Carrier `GOV-006` |
| VF-6 | The repository has one repository layout and one backend module map | **Fail (blocking)** | Two of each. See conflict **X-13** |
| VF-7 | `docs/design/*` is consistent with corrections A1–A6 | **Fail (blocking)** | The design set was written against the superseded media plane. See §3 and conflict **X-14** |
| VF-8 | Every documentation path has an owning slot in `docs/plan/wave-protocol.md` §3.1 | **Fail** | `docs/architecture/`, `docs/product/`, `docs/design/` are unowned. See conflict **X-16**; ownership proposal in `docs/plan/w2-ready-queue.md` §2 |
| VF-9 | The One Page is still only half retrievable | **Confirmed** | Re-fetched 2026-08-27: `HTTP 302` to `login.feishu.cn/accounts/trap`, zero bytes of document body returned anonymously. See §7 |
| VF-10 | The backlog's W2 ready queue is executable as written | **Fail** | It predates the architecture, product and design slots. See §6 and `docs/plan/w2-ready-queue.md` §4 |
| VF-11 | Every Wave 1 finding has a carrier task somewhere in the backlog | **Fail (largest gap)** | Nothing in the 142 tasks carries corrections A1–A6, the media-ops contract surface, the `BLOCKED` playback outcome, the 23 design deltas (DM/PS/AC/MI), the EIS gate, or the 67 acceptance criteria. Carriers created in `docs/plan/w2-ready-queue.md` §5 |
| VF-12 | `docs/plan/definition-of-done.md` a11y clauses reference live screens only | **Fail (minor)** | S-A1 and S-A8 scan "PNL-01…PNL-05"; PNL-05 was deleted by `docs/product/sitemap-and-ia.md` §12. Carrier `QA-011` |
| VF-13 | Named cross-document references resolve | **Pass** (sampled) | `docs/02-information-architecture.md` §10 G1–G8, `docs/12-api-contracts.md` §4.4, `docs/14-quality-gates.md` §5.4, `docs/11-official-onboarding-checklist.md` A1–A5 / C1–C17 all exist as cited |

Nothing in VF-4, VF-5 or VF-12 changes a threshold, removes a test, or weakens a gate; they are bookkeeping
defects. VF-6, VF-7, VF-10 and VF-11 are the ones that stop Wave 2 from being executable as planned.

---

## 3. Corrections A1–A6: the blast radius

`docs/architecture/system-overview.md` §1.1 registers six corrections to the earlier Wave 1 architecture. They were
applied to `docs/architecture/*` and reflected in `docs/product/*`, but the earlier Chinese document set, the design
set and the backlog were all written either before them or in parallel with them and do not reflect them. This table
is the complete impact list.

| Correction | What it invalidates | Documents still asserting the superseded version | Tasks still specified against it | Owner | Carrier |
|---|---|---|---|---|---|
| **A1** Playback is VePlayer via `TTMinis.getPlayer()`; no `<video>`, no third-party player | `<video>` + native HLS + `hls.js` fallback; the two-kernel normalization design; three retained `<video>` instances | `docs/03-tech-architecture.md` §3.1–§3.2, `docs/03-stack-decision.md` D3, `docs/design/player-state-machine.md` (whole document), `docs/02-screen-inventory.md` SCR-05 | `PLY-001` (W14) "native HLS first + hls.js fallback" is unbuildable as written | P3 (`docs/03-*`), A (`docs/design/player-state-machine.md`), P2 (`docs/02-*`) | `PLY-020`, `IA-001` |
| **A2** Media lives in BytePlus via the mini-drama media-asset APIs; no own transcode, ladder, AES-128 or CDN signing | S3 + CloudFront + MediaConvert, HLS ladder, AES-128 key endpoint | `docs/03-tech-architecture.md` §6, `docs/03-stack-decision.md` D11, `docs/design/domain-model.md` §3.2 (`encrypted` column comment), `docs/14-security.md` §5.1 | `PBK-002` (W14) "CDN signed URL and HLS AES-128 key interface" has no remaining subject | P3, B, C | `CTR-009`, `CTR-011` |
| **A3** The platform enforces playability; our entitlement can deny but cannot grant | The assumption that signed-URL issuance is the enforcement point | `docs/03-tech-architecture.md` §4.1 (`playback` module definition) | `PBK-001` (W13) is still valid in intent but its acceptance criterion describes the wrong enforcement mechanism | B | `CTR-009` |
| **A4** `POST /episodes/{id}/playback-token` returns `{ albumId, episodeId, vid, playAuthToken? }`, not a signed URL and quality ladder | The whole playback response shape, `TokenRegion`'s `nearExpiry`/re-sign machinery, `QualityRegion` | `docs/12-api-contracts.md` §4.4, `docs/design/player-state-machine.md` §4.1–§4.2, §10 | No task exists for this change at all | B | **`CTR-009`** |
| **A5** Interstitial ads are required alongside rewarded ads | "Rewarded video is the required ad capability" | `docs/01-tiktok-minis-requirements.md`, `docs/11-api-and-bridge.md` §3 (already lists both; wording only) | `INT-013` already covers both — no change needed | A | — |
| **A6** Platform runtime restrictions are stricter than and prior to our CSP | CSP-first framing of bundle safety | `docs/14-security.md` §2.1 | `INF-003`/`INF-007` gate lists do not include the platform restrictions | C | `QA-004` |

Two UI-level consequences ride on A1 and are already written down in `docs/product/sitemap-and-ia.md` §12, but have
no carrier in `docs/02-*`: **PNL-05 is deleted** (VePlayer plugins own definition and rate) and **episode switching
is `playNext` on one retained instance**, not a route `replace`. Carrier `IA-001`.

### 3.1 Why the player state machine cannot simply be patched

`docs/design/player-state-machine.md` is a good document about the wrong player. Of its twelve design constraints,
CN-1 (short-lived token), CN-3 (dual kernel), CN-6 (stall → downgrade definition), CN-7 and CN-8 (silent re-sign)
and CN-11's mechanism are all consequences of owning the media plane. Its `QualityRegion`, most of its
`TokenRegion`, the `MEDIA_ERROR` normalization rationale in §5, and the media-cache table in §10 describe work the
platform now does.

What survives, and survives well, is the part that has nothing to do with the kernel: the `locked` / `suspended` /
`errorRetryable` / `errorTerminal` distinction, the eleven invariants INV-P1 … INV-P11, the discipline that
`errorTerminal` has no outgoing edge, the heartbeat-only-while-playing rule, and the property-testing approach. The
correct treatment is a restatement against the VePlayer event surface that keeps those and drops the rest — which is
why `PLY-020` is a rewrite task owned by slot A rather than a set of edits, and why it must land before `PLY-001`
is redefined. Marking the document superseded without a replacement would delete the only formal specification the
test plan has to test against (`docs/14-test-plan.md` §1.1).

Note also that A1 changes the *meaning* of the MSE question rather than answering it. Under the old design, no MSE
meant no playback on Android. Under VePlayer, MSE availability affects **preload only** — this is exactly risk
`M-3` in `docs/architecture/risks.md`, and `AC-PF-3` already requires that a device without MSE plays successfully
without preload and without a user-visible error. `PLY-002` and `PLY-003` must be restated in those terms.

---

## 4. Design-slot deltas: DM, PS, AC, MI

The technical-design slot registered 23 deltas against the upstream documents and, correctly, applied none of them.
None of them has a carrier task in the backlog. This table assigns each one an owner, a carrier and a status against
corrections A1–A6, because several were written on the superseded media plane and must not be adopted as written.

### 4.1 Domain model (`docs/design/domain-model.md` §8)

| # | Delta | Status vs A1–A6 | Owner | Carrier |
|---|---|---|---|---|
| DM-1 | Add `globalEpisodeNumber` (drama-unique, contiguous); use it for display, free-episode judgement and cursors. Season-scoped numbering makes "first N episodes free" leak revenue once per season | unaffected | B | `CTR-013` |
| DM-2 | Define `effectiveStatus` composition over drama/season/episode (`OFFLINE > DRAFT > PUBLISHED`; `DRAFT` reads as 404) | unaffected, but must now compose with the **platform's** album state as well (A3) — the composition is four-level, not three | B | `CTR-013` + `CTR-011` |
| DM-3 | `viewerAccess`: an `Unlock` record takes precedence over VIP identity, so an expired VIP keeps individually-purchased episodes | unaffected | B | `CTR-013` |
| DM-4 | `RechargeOrder` needs `currency`; amount is a minor-unit integer | same as conflict X-09; adjudicate once | B (+ business) | `CTR-003` |
| DM-5 | Two-level comment depth is an application-layer constraint, not a table constraint | unaffected | B | `CTR-013` |
| DM-6 | Analytics retention window and per-`user_id` deletion SLA are undefined | unaffected; interacts with EIS (§6) because retention is exactly what an information-sharing review asks about | C (+ legal) | `GOV-005` |

### 4.2 Player state machine (`docs/design/player-state-machine.md` §12.1)

| # | Delta | Status vs A1–A6 | Owner | Carrier |
|---|---|---|---|---|
| PS-1 | `docs/03-tech-architecture.md` §3.1's one-line state list lacks `locked`, `suspended`, `paused`, `seeking` and does not separate retryable from terminal errors | valid, and now compounded: the target of the reference is itself superseded by A1 | P3 | `PLY-020` then P3 writeback |
| PS-2 | Screen-inventory states S6/S7 have no defined mapping to technical states | valid and unaffected | P2 | `IA-001` |
| PS-3 | No confirmed platform foreground/background lifecycle callback; dual-listen platform + `visibilitychange`/`pagehide`, take whichever fires first | valid and unaffected; merges with IA gap G6 | A | `BRG-004` |
| PS-4 | Add `defaultQuality` and `freeEpisodeMaxQuality` to `GET /config` | **Rejected by A1.** Definition is a VePlayer concern; a server-controlled quality ceiling has no delivery mechanism now. The underlying cost concern must be re-raised against BytePlus-side controls instead | B | closed by `CTR-009`; cost concern re-opened as `GOV-007` |
| PS-5 | Auto-play-next default and whether it is user-disableable is a product decision | valid and unaffected | P1 | `IA-002` |

### 4.3 API contracts, caching, error taxonomy (`docs/design/api-contracts.md` §10.1)

Renamed here to `D-AC-n` to keep them out of the `AC-*` acceptance-criteria namespace (see §5, N-4).

| # | Delta | Status vs A1–A6 | Owner | Carrier |
|---|---|---|---|---|
| D-AC-1 | Error envelope gains `category` / `retryable` / `actionable`, so an older client meeting a new code has a defined default behaviour | unaffected; this is a prerequisite for the `BLOCKED` outcome to be classifiable rather than special-cased | B | `CTR-012` |
| D-AC-2 | No endpoint declares cacheability; adopt the per-endpoint cache policy table, default `no-store` | unaffected | B | `CTR-012` |
| D-AC-3 | `GET /config` is too thin for the parameters that must be server-controlled | valid **minus** the PS-4 quality fields | B | `CTR-012` |
| D-AC-4 | Ad-unlock server-side verification capability is unknown; isolate behind a replaceable verifier | unaffected; note `AC-MON-6` already states the stricter target (server-side grant gated on completion, session nonce and quotas) | A + B | `CTR-004` |
| D-AC-5 | Rate-limit buckets have no numbers; adopt the proposed initial values | unaffected | B + P3 | `CTR-012` |
| D-AC-6 | Idempotency-key scope is user-scoped `(userId, idempotencyKey)`, not global | unaffected | B | `CTR-012` |
| D-AC-7 | Pagination cursor is an opaque encoding of (sort key, id) | unaffected; interacts with DM-1 because the sort key becomes `globalEpisodeNumber` | B | `CTR-012` |

### 4.4 Minis integration (`docs/design/minis-integration.md` §11.1)

| # | Delta | Status vs A1–A6 | Owner | Carrier |
|---|---|---|---|---|
| MI-1 | The bridge interface draft has no error model, timeout policy, init ordering or capability-gating behaviour; adopt §5.2–§5.5 as its behaviour contract | valid and unaffected — this is the most directly reusable of the design outputs | A | `BRG-004` |
| MI-2 | Ad unit IDs must be server-delivered via `/config`, never baked into the bundle, or changing one costs a review cycle | valid and unaffected | A + B | `CTR-012` |
| MI-3 | E9 (runtime requests restricted to declared domains) has no automated check; add a build-time domain-consistency scan | valid; `docs/architecture/tech-stack.md` §6 and `AC-CMP-5` already require the generated-allowlist version of this. Adopt the stricter formulation | C | `QA-004` |
| MI-4 | Subscriptions are modelled as `RechargeOrder(productType=VIP)` but the platform has a distinct subscription API; use a separate entity plus periodic full sync as the primary path | valid; same as IA gap G4 and conflict X-10's subscription half | B | `CTR-004` |
| MI-5 | Platform-native panels (pay, rewarded ad) must not carry a client timeout; the general timeout policy has no such exception | valid and unaffected | P2 | `IA-002` |

The integration document's §2 uncertainty table (U-01 … U-22) and §9 degradation matrix are unaffected by A1–A6 and
should be treated as adopted, with three amendments: U-16 (MSE/EME) is now a preload concern per §3.1 above; U-18
(ad verification) is superseded by the stricter `AC-MON-6`; and the seven "required capability" list must be read as
six-plus-interstitial per A5.

Its central claim — that none of the ten open questions blocks Wave 2 from starting — was checked and **holds**. Every
one is isolated behind a replaceable interface, a fallback path or a conservative default.

---

## 5. Identifier namespace collisions

Six Wave 1 slots numbered their findings independently, and the prefixes now collide. This is not pedantry: three of
the collisions already produce sentences whose meaning depends on which document the reader came from, and the
backlog's conflict ledger cites cycles and conflicts in adjacent columns using the same letter.

| # | Prefix | Colliding meanings | Worst case | Proposed resolution | Owner |
|---|---|---|---|---|---|
| N-1 | `C-n` / `Cn` | (a) execution **cycles** C1–C12 (`wave-protocol.md` §5.1); (b) cross-slot **conflicts** C1–C12 (`backlog.md` §6); (c) commercial/compliance **risks** C-1…C-10 (`risks.md` §4), extended to C-11/C-12/C-13 by `compliance-tiktok-minis.md` §7; (d) Portal **checklist items** C1–C17 (`11-official-onboarding-checklist.md`) | **`C-12`** means both "a11y is elevated to a release blocker" and "organization and app names are permanent". **`C7`** means the CSP conflict, the Portal minimum-SDK-version setting, and cycle 7 | Conflicts become **`X-01…X-12`** (this document uses that form throughout). Cycles keep `C1–C12`. Risks keep `C-1…C-13` (incumbent hyphenated form in `risks.md`). Checklist items become **`CHK-A1`, `CHK-C13`**, … | P1 (conflicts, `backlog.md`), A (checklist) |
| N-2 | `B-n` blockers | `risks.md` §5 B-1…B-7 vs `handoff/w1-p3.md` §5 B-1…B-5. B-1, B-2, B-4, B-5 agree; **B-3 does not**: partner approval and the Android test client in one, WebView MSE/EME availability in the other. `backlog.md` `PLY-002`/`PLY-003` mean the second | A task claiming to "clear B-3" clears a different blocker depending on which register the reader holds | Adopt `risks.md` B-1…B-7 as canonical. The MSE/EME item becomes **`B-8`** and is restated as a preload-scope question per §3.1. Note that `risks.md` B-3 largely duplicates risk P-1 and should say so | P3 |
| N-3 | `M-n` | Business **gates** M0–M6 (`wave-protocol.md` §6) vs **media risks** M-1…M-7 (`risks.md` §3). Only the hyphen separates them | "M1 blocks C7" and "M-1 is platform-controlled playability" sit two documents apart | Gates become **`GATE-0…GATE-6`**, plus the new `GATE-7` (§6). Risks keep `M-n` | P3 |
| N-4 | `AC-n` | Design deltas AC-1…AC-7 (`design/api-contracts.md` §10.1) vs 67 acceptance criteria `AC-BOOT-1`, `AC-PL-2`, … (`product/acceptance-criteria.md`) | A cited "AC-4" is either an unresolved contract proposal or a boot-configuration requirement | Design deltas become **`D-AC-1…7`** (used in §4.3 above). Acceptance criteria keep `AC-<GROUP>-<n>` | B |
| N-5 | `G-n` | IA **gap register** G1–G8 (`02-information-architecture.md` §10) and G9–G14 (`product/sitemap-and-ia.md` §11) vs **CI gate IDs** G1.1–G1.10, G2.x, G3.x (`14-quality-gates.md`) | "G1" is either the missing TikTok login provider or the entire L1 gate group | IA gaps become **`IAG-1…14`**. CI gates keep `G<level>.<n>` | P2 |
| N-6 | `A-n` | Architecture **corrections** A1–A6 (`system-overview.md` §1.1) vs Portal **account checklist** items A1–A5 (`11-official-onboarding-checklist.md`) vs work **slot A** | "A4" is either the playback-contract correction or "create the app in the Portal" | Corrections become **`COR-1…6`**; checklist items fold into `CHK-*` per N-1 | P3 + A |
| N-7 | `AC-*` vs `A/B/C` slots in the backlog `槽位` column | Not a true collision, but `CTR-005`'s slot is `B+C` while `C` also opens every conflict ID | — | Resolved implicitly once conflicts become `X-*` | — |

All renames are mechanical and can be executed in one pass. They are carried by `GOV-006`, scheduled in W2 so that
the Wave 2 implement waves and the first verification wave (`VER-001`, W5) work in a single namespace. Doing this
later costs more each wave, because every handoff document adds citations.

This register uses the proposed names — `X-nn`, `GATE-n`, `D-AC-n`, `IAG-n`, `COR-n` — from here on, with the legacy
identifier in parentheses at first use, so that the mapping is demonstrated rather than merely asserted.

---

## 6. Conflict ledger

### 6.1 Carried forward from Wave 1 (X-01 … X-12, formerly C1–C12)

Status re-checked against the architecture and product outputs. Adjudication recommendations from
`docs/handoff/w1-p3.md` §3 stand except where a later slot changed the premise.

| # | Legacy | Conflict | Adjudicator | Carrier | Target | Status after Wave 1 |
|---|---|---|---|---|---|---|
| X-01 | C1 | Login provider enum has no `TIKTOK` slot | B | `CTR-001` | W2 | Unchanged. Cross-validated by IAG-1 |
| X-02 | C2 | `paymentChannel` lacks `TIKTOK_BEANS` | B | `CTR-002` | W2 | Unchanged. Cross-validated by IAG-2 |
| X-03 | C3 | Privacy baseline hard-codes PIPL while the launch set excludes mainland China | C + legal | to be split by `PLN-010` | C10 | **Escalated.** EIS (§6.2) makes information-sharing scope a review object, and DM-6 retention feeds it. This should not wait for cycle 10 if Europe or the US is in scope |
| X-04 | C4 | Compatibility matrix includes WeChat WebView; the real host is the TikTok WebView | C | `QA-011` | C4 | Unchanged |
| X-05 | C5 | Bundle-size and crash-rate gates are defined for native packages | C | `QA-011` | C4 | Unchanged. `AC-CMP-1` (ZIP ≤ 200 MB, no zero-byte files) is the platform-side form and is stricter about file contents |
| X-06 | C6 | Certificate pinning is not implementable inside a WebView | C | `HRD-005` | C10 | Unchanged |
| X-07 | C7 | CSP `default-src 'self'` versus the required platform SDK tag and inline `TTMinis.init` | C | `APP-003`, `SRV-004` | C2 | **Premise changed by COR-6.** The platform's own runtime restrictions are stricter and are enforced first; CSP is a second layer, not the primary control. The proposed CSP is still correct, but the rationale and the gate location move |
| X-08 | C8 | Contract carries a 30-day refresh token while the security document forbids storing long-lived tokens in an H5 client | B + C | `CTR-005`, `AUT-004` | W2 / C3 | Unchanged |
| X-09 | C9 | Amounts in RMB cents and fixed Chinese error messages versus a multi-region, English-mandatory launch | B (+ business) | `CTR-003` | W2 | Unchanged. Same as DM-4 and IAG-8; adjudicate once. `AC-MON-8` adds that price, currency and symbol come from the platform tier payload and are never locally converted |
| X-10 | C10 | `features.adUnlock=false` and no ad-unlock endpoint; no subscription endpoints | B | `CTR-004` | W2 | Unchanged. Subscription half is also MI-4 and IAG-4 |
| X-11 | C11 | Contract testing prescribes Pact-style CDC with only one consumer | C | `QA-012` | C3 | Unchanged |
| X-12 | C-12 | a11y raised from "P2, non-blocking" to a release blocker (`definition-of-done.md` §6 vs `14-test-plan.md` §6.4) | C, counter-signed by P1 | `QA-011` | C4 | Unchanged in substance. Two amendments: the adjudication must also fix `definition-of-done.md` S-A1/S-A8, which scan PNL-05 after its deletion (VF-12); and it should record that `docs/product/acceptance-criteria.md` contains no a11y group, so the release-blocking a11y bar lives only in the DoD |

### 6.2 New conflicts found in Wave 2 planning (X-13 … X-18)

| # | Conflict | Documents | Recommended resolution | Adjudicator | Carrier | Target |
|---|---|---|---|---|---|---|
| **X-13** | **Two repository layouts and two backend module maps.** `docs/03-tech-architecture.md` §9 gives `app/src/{platform,player,features,stores,api,i18n}` and nine server modules `{auth,content,playback,wallet,unlock,progress,rec,comment,platform-tiktok}`. `docs/architecture/tech-stack.md` §7 gives `app/src/{…,routes,core,…}` and fourteen server modules `{identity,catalog,media-ops,playback,entitlement,wallet,billing,ads,progress,discovery,engagement,analytics,config,platform-tiktok}`, with `minis.config.json` generated from `domains.config.ts` rather than hand-maintained | `docs/03-tech-architecture.md` §4.1, §9; `docs/architecture/tech-stack.md` §7 | Adopt the fourteen-module map. It is the only one containing `media-ops`, which COR-2/COR-3 make mandatory, and its `playback` module is not defined in terms of signed-URL issuance. Adopt the generated `minis.config.json`, which is what `AC-CMP-5` and MI-3 both require. `docs/03-*` becomes a pointer | P3, with A and B | **`INF-009`** | **W2 — blocks `INF-001` and `SRV-001`** |
| **X-14** | **The design set is written against the superseded media plane.** See §3.1 | `docs/design/player-state-machine.md` (whole), `docs/design/domain-model.md` §3.2, `docs/design/minis-integration.md` §2 U-16 | Restate the player state machine against the VePlayer surface, keeping INV-P1…P11, the four error/lock states and the property-testing approach; mark the superseded sections rather than deleting the file | A | **`PLY-020`** | W2 |
| **X-15** | **`docs/03-*` and `docs/architecture/*` are two canonical architectures.** Beyond X-13 they also disagree on the player state list (PS-1), the media plane (COR-2) and the playback enforcement point (COR-3) | both sets | Make `docs/architecture/` canonical and reduce `docs/03-*` to a summary plus links, recording each superseded statement in the correction registry rather than editing it away. This is `docs/architecture/system-overview.md` §1.1's own stated convention | P3 | `INF-009` (layout half), then a P3 consolidation task at W6 | W2 / W6 |
| **X-16** | **`docs/architecture/`, `docs/product/` and `docs/design/` have no owner** in `wave-protocol.md` §3.1, so the "one file, one owning slot" hard rule cannot be applied to roughly half the repository's documentation | `docs/plan/wave-protocol.md` §3.1 | Ownership table in `docs/plan/w2-ready-queue.md` §2 | P3 | `GOV-006` | W2 |
| **X-17** | **`docs/plan/backlog.md` is assigned to P1 in `wave-protocol.md` §3.1 but was authored by the W1 P3 slot**, and it contains the conflict ledger, which §3.4 makes a per-slot handoff artefact | `docs/plan/wave-protocol.md` §3.1, §3.4; `docs/plan/backlog.md` §6 | Confirm P1 as the owner of `backlog.md` (that is what makes the W2 queue P1's to write) and move the conflict ledger out of the backlog into this file, which P1 also owns. The backlog then references it | P1 | `GOV-006` | W2 |
| **X-18** | **Backlog §1 rule 1 forbids what `wave-protocol.md` §3.4 permits** (VF-5) | `docs/plan/backlog.md` §1; `docs/plan/wave-protocol.md` §3.2, §3.4 | Amend rule 1 with a narrow exception: a plan slot may own a task in an implement wave when its only deliverable is a writeback of an adjudicated conflict or a gate-status update. Every other task keeps the rule. This is not a loosening — it is what §3.2 already assigns plan slots to do | P1 | `GOV-006` | W2 |

### 6.3 IA and product gaps still open

IAG-1 … IAG-8 (formerly `docs/02-information-architecture.md` §10 G1–G8) are all carried by `CTR-001` … `CTR-006`
and are closing in W2. IAG-9 … IAG-14 (formerly `docs/product/sitemap-and-ia.md` §11 G9–G14) are new and have no
carrier:

| # | Legacy | Gap | Owner | Carrier | Target |
|---|---|---|---|---|---|
| IAG-9 | G9 | No screen or state for **platform-blocked** playback as distinct from our own takedown | P2 + B | `CTR-010`, `IA-002` | W2 |
| IAG-10 | G10 | No product surface for the operations console, although the publishing workflow requires one; J20–J23 are undeliverable without it | P2 | `IA-002`, then a content-ops slot | W2 (IA), C2+ (build) |
| IAG-11 | G11 | TikTok clients below 44.5.0 need `play_auth_token`, and clients below the configured minimum library version get an upgrade prompt; neither has copy or a defined experience | P2 + A | `IA-002` | W2 |
| IAG-12 | G12 | Preload scene transitions undefined for back-navigation and for browse → detail → player | A | `PLY-020` | W2 |
| IAG-13 | G13 | Share is still unconfirmed as a platform capability, yet the deep-link resolver already accepts share parameters | A + business | `GOV-005` | continuous |
| IAG-14 | G14 | The user-report desk has no owner, no rota and no tooling, against a 72-hour platform SLA (`AC-OPS-6`, release-blocking) | business | `GOV-005` | continuous |

---

## 7. The EIS gate and the gate model

### 7.1 What EIS is, and why it is not in any plan

`docs/product/compliance-tiktok-minis.md` §4 records it as ONE-1: **after 2026-08-08, launching an IAA or IAP mini
program in Europe or the US requires passing the EIS compliance review**, whose criteria are not published, and
whose recommended first step is an off-system information questionnaire completed with the account manager (ONE-3).
Its scope covers every third party involved in information sharing and all shared information (ONE-2).

No repository document written before the product slot mentions it. `docs/plan/wave-protocol.md` §6 models six
external gates and the missing-PDF gate; EIS is not among them. `docs/00-wave-plan.md` §2's business milestones do
not have it. The critical path in `compliance-tiktok-minis.md` §8 places it immediately after entity verification
and before contract signing, which means it sits **upstream of every monetization integration task in cycle C8**.

### 7.2 Proposed gate-table amendment

| Gate | Content | Blocks | Explicitly does not block | Release condition | Status |
|---|---|---|---|---|---|
| **`GATE-7` EIS** *(new)* | EIS compliance review for IAA/IAP launches in Europe or the US after 2026-08-08. Criteria unpublished; begins with an account-manager questionnaire | `REL-003` basic-information approval and `REL-005` submission for a monetized EU/US launch; `AC-CMP-12` | Cycles C1–C6 entirely; all Mock-path work; a non-EU/US launch | Review passed, **or** the launch region set is documented as excluding Europe and the US | `[ ]` not started |
| `GATE-5` (was M5) US approval | US Launch Approval + TPRM | as before | as before | Extend the release condition with the USDS half: restricted-country screening plus demonstrated data-security capability, evidenced by materials such as a penetration test report (ONE-11, risk C-13) | `[ ]` |
| `GATE-1` (was M1) accounts and organization | as before | as before | as before | **Add a precondition:** organization name and app name are permanent (ONE-8) and app type must be *Minis drama* at creation (ONE-9). Both need written business and legal sign-off **before** the organization is created, because there is no correction path | `[ ]` |
| `GATE-2` (was M2) entity verification | as before | as before | as before | Add the quantified lead time: typically three working days (ONE-6, conflict C-ONE-4). Note that merchant/entity qualification becomes mandatory for publishing dramas and for monetization (ONE-7), which removes the "unverified soft launch" option from planning | `[ ]` |
| `GATE-4` (was M4) monetization enablement | as before | as before | as before | Correct the mechanism: **IAA has been self-service in the Portal since 2026-07-09** (ONE-5, conflict C-ONE-1); enabling IAP opens a four-step contract flow (ONE-4, C-ONE-2). The account manager is the escalation path, not the mechanism. This shortens the ad-unlock path materially | `[ ]` |
| `GATE-0` (was M0) official PDF | as before | as before | as before | Amend to reflect §8: the One Page has been located and half transcribed, so this is no longer "not locatable" but "authenticated access required" | `[!]` blocked |

The six `C-ONE-1 … C-ONE-6` conflicts in `compliance-tiktok-minis.md` §6 are all resolved by adopting the One Page
over the checklist, and are carried by `GOV-005` (gate table, P1) plus a checklist writeback owned by slot A.

The three proposed risk entries `C-11` (EIS), `C-12` (permanent names), `C-13` (USDS security evidence) continue
`risks.md`'s own commercial/compliance C-series correctly and should be appended there by P3 — after N-1's renaming
removes the clash with the a11y conflict.

### 7.3 What this changes about sequencing

Nothing in cycles C1–C6 is blocked. The integration document's degradation matrix (§9) already establishes that the
content path — browse, play, progress, favourites — depends on no commercially-approved capability, and
`AC-CAP-2`/`AC-CAP-3` require that unavailable capabilities simply have no entry point. Engineering proceeds.

What changes is the **business track's start date and ordering**: EIS begins with a conversation, not a submission;
the two permanent names must be signed off before anyone clicks "create organization"; and the region decision
(blocker B-4) now determines whether two gates apply at all rather than only affecting localization scope. Those are
`GOV-003` and `GOV-005` items, and they should start in W2 regardless of engineering progress.

---

## 8. Feishu One Page: obtained, missing, and what to ask for

### 8.1 Current state, re-verified

| Property | Value |
|---|---|
| URL | `https://bytedance.larkoffice.com/wiki/MJ2BwFqSxi4r2SkwHS8cRrlsnVb` |
| First retrieval | 2026-08-27 by the W1 product slot, anonymous |
| Obtained | §1 introduction through §2.5 basic information, including table cell contents. Reproduced verbatim in `docs/product/compliance-tiktok-minis.md` Appendix A |
| Not obtained | Everything after the basic-information field table; screenshots; two board diagrams; one file attachment; two synced blocks |
| Re-check, this slot, 2026-08-27 | `HTTP 302` → `login.feishu.cn/accounts/trap?...redirect_uri=...`, zero bytes of document body. Anonymous access to the remaining blocks is still refused |

Feishu paginates block delivery and serves the remainder only to an authenticated session; the document API
redirects anonymous callers to login. This is an access-control boundary, not a retrieval bug, so no amount of
further scraping work will close it. **This slot did not attempt to authenticate and did not attempt any bypass.**

### 8.2 Effect on blocker `GATE-0` / B-1

The blocker wording in `docs/architecture/risks.md` §5 B-1 ("not in the workspace and could not be located
publicly") and in `docs/plan/wave-protocol.md` §6 M0 ("the PDF has not been provided") are both now inaccurate in
the same direction: the source is located, roughly half of it is transcribed into the repository, and the missing
half is precisely characterized. The replacement wording proposed in `compliance-tiktok-minis.md` §2 should be
applied by P3 as part of `GOV-005`.

This matters for `definition-of-done.md` §8 S-M0, which makes the PDF diff a submission veto with a two-way
alternative (complete the diff, or archive a dual-signed risk acceptance). With half the document transcribed, the
diff is now partially executable — the onboarding half of `docs/11-official-onboarding-checklist.md` can be
diffed today, and conflicts `C-ONE-1 … C-ONE-6` are the result of doing exactly that.

### 8.3 The six open questions, and why each needs the authenticated copy

From `compliance-tiktok-minis.md` §9, with the Wave 2 consequence attached:

| # | Question | Blocks |
|---|---|---|
| 1 | Does the One Page prescribe a media-asset upload workflow different from the public `/v2/sg/shortdrama/*` documentation — paths, priorities, quotas? | `CTR-011`'s media-ops contract surface is being written from public docs only |
| 2 | Does it constrain VePlayer integration beyond the public player docs — in particular the `play_auth_token` cutoff at TikTok 44.5.0, or required player configuration? | `PLY-020` and `AC-PL-2`/`AC-CAP-5` |
| 3 | What does it say about IAA/IAP mechanics, tier configuration and settlement beyond enablement? | `CTR-002`/`CTR-003` tier and currency modelling; risk C-10's settlement ownership |
| 4 | Are there dashboards or data reports operations is expected to use, and do they impose data obligations on us? | `IA-002`'s operations console IA; DM-6 retention; EIS scope |
| 5 | Does it name the required points of contact and escalation paths? | `GATE-6` (POC) and every gate's escalation path |
| 6 | Does it state region availability in a way that resolves risk P-7's contradiction? | Blocker B-4, and therefore whether `GATE-7` and `GATE-5` apply at all |

### 8.4 The request package

Rather than repeating "obtain the PDF" each wave, `GOV-002` should carry a concrete ask, because the earlier framing
produced three waves of restating the same blocker. The minimum request is: an authenticated export of the One Page
covering everything after §2.5, plus the two board diagrams, the file attachment and the two synced blocks; or view
access for one named account. Failing that, answers to the six questions above are a sufficient substitute for
Wave 2 and Wave 3 purposes, and questions 2 and 6 are the two worth escalating first — question 2 because it is the
only remaining source of unknown constraints on the player rewrite, and question 6 because it decides whether two
business gates exist.

---

## 9. Everything still open, in one table

| # | Item | Kind | Owner | Carrier | Target wave |
|---|---|---|---|---|---|
| X-01, X-02, X-08, X-09, X-10 | Contract adjudications | conflict | B | `CTR-001`…`CTR-005` | W2 |
| X-03 | Privacy baseline regionalization | conflict | C + legal | `PLN-010` split | C10, escalate if EU/US |
| X-04, X-05, X-12 | Test matrix, size gates, a11y blocking status | conflict | C | `QA-011` | C4 (W17) |
| X-06 | Certificate pinning N/A | conflict | C | `HRD-005` | C10 |
| X-07 | CSP versus platform restrictions | conflict | C | `APP-003`, `QA-004` | W2 / C2 |
| X-11 | Pact-style CDC deferral | conflict | C | `QA-012` | C3 |
| X-13 | Two repository layouts and module maps | conflict | P3 + A + B | `INF-009` | **W2, blocking** |
| X-14 | Design set on the superseded media plane | conflict | A | `PLY-020` | W2 |
| X-15 | Two canonical architectures | conflict | P3 | `INF-009`, then W6 | W2 / W6 |
| X-16, X-17, X-18 | Ownership and rule inconsistencies | process | P1 + P3 | `GOV-006` | W2 |
| N-1 … N-7 | Identifier namespace collisions | process | P1 | `GOV-006` | W2 |
| COR-1 … COR-6 | Architecture corrections not yet propagated | correction | P3, A, B, P2 | `CTR-009`, `PLY-020`, `IA-001`, `QA-004` | W2 |
| DM-1 … DM-6 | Domain model deltas | delta | B | `CTR-013` | W2–W3 |
| PS-1 … PS-5 | Player state machine deltas | delta | A, P2, P1 | `PLY-020`, `IA-001`, `IA-002` | W2 |
| D-AC-1 … D-AC-7 | Contract, cache and error taxonomy deltas | delta | B | `CTR-012` | W2–W3 |
| MI-1 … MI-5 | Integration deltas | delta | A, B, C, P2 | `BRG-004`, `CTR-012`, `QA-004`, `IA-002` | W2 |
| IAG-9 … IAG-14 | Product and IA gaps | gap | P2, A, business | `IA-002`, `CTR-010`, `GOV-005` | W2 and continuous |
| `GATE-7` EIS | New business gate | gate | P1 + business | `GOV-005` | continuous, start W2 |
| `GATE-0` | One Page, authenticated half | blocker | business | `GOV-002` | continuous |
| B-8 (was p3 B-3) | MSE/EME, restated as preload scope | blocker | A | `PLY-002`, `PLY-003` | C3 / C9 |
| VF-4, VF-12 | `OBS` domain undeclared; DoD scans a deleted panel | defect | P1, C | `GOV-006`, `QA-011` | W2 / C4 |

Sixty-five items, of which two need no further action — COR-5 is already satisfied by `INT-013`, and PS-4 is
rejected outright by COR-1 — leaving sixty-three that require one. None of them blocks Wave 2 from starting; three
of them — X-13, X-14 and the absence of a carrier for COR-4 — block specific Wave 2 tasks and are therefore first
in the queue.

---

## 10. Change log

| Date | Wave · slot | Change |
|---|---|---|
| 2026-08-27 | W2 · P1 | First version. Verified the Wave 1 self-check claims (VF-1 … VF-13); mapped corrections A1–A6 to every document and task still asserting the superseded version; assigned owners and carriers to the 23 design deltas (DM/PS/D-AC/MI), rejecting PS-4 as invalidated; registered six new conflicts X-13 … X-18 and seven identifier collisions N-1 … N-7; proposed `GATE-7` for EIS and five gate amendments from the One Page; re-verified and characterized the Feishu access boundary |
