# W2 Work Slot A — Handoff

> Wave 2 · work slot A (client, bridge and player specification). Branch `cursor/w2-work-a-71b2`, based on
> `cursor/w2-plan-p1-0453` (`fc39e3e`), with `cursor/w1-research-official-bb4f` (`bb12f0d`) merged in. Date
> 2026-08-27.
>
> Constraints observed: no pull request, no subagents, no application code, no other slot's file modified, no test
> removed, no threshold lowered, no gate weakened. Documents only.

---

## 1. What this slot was asked for, and what landed

| # | Assignment | Deliverable | Status |
|---|---|---|---|
| 1 | Own the playback contract: episode playback is a VePlayer descriptor `{ albumId, episodeId, vid, playAuthToken? }`, not a CDN signed URL with a quality ladder | `docs/design/playback-contract.md` | done |
| 2 | Restate `docs/design/player-state-machine.md` for VePlayer (`TTMinis.getPlayer`, `playNext`, plugins); do not specify HTML5 `<video>` + `hls.js` as the drama player | `docs/design/player-state-machine.md`, rewritten (`PLY-020`) | done |
| 3a | Withdraw / replace the `PBK-002` signed-URL work | `docs/design/playback-contract.md` §7 | done |
| 3b | Resolve the `INF-001` layout question: fourteen modules with `media-ops` beats nine modules with signed-URL playback | §3 of this file — slot A's `INF-009` counter-signature | done |
| 4 | Write this handoff | `docs/handoff/w2-work-a.md` | done |

Both design documents are **normative for their subject** and both are written so that other slots transcribe rather
than re-derive: the playback contract carries ten numbered transcription obligations (§9 there), and the state
machine carries the `PS-2` state mapping that `IA-001` needs and the `CN-n` status table that P3's write-back needs.

---

## 2. Branch and SHAs

| Item | Value |
|---|---|
| This slot's branch | `cursor/w2-work-a-71b2` |
| Base | `cursor/w2-plan-p1-0453` (`fc39e3e`) — carries the W1 conflict register and the W2 ready queue |
| Merged in | `cursor/w1-research-official-bb4f` (`bb12f0d`) — additive only, zero conflicts |
| Read but **not** merged | `cursor/w1-repo-skeleton-e7c9` (`322bf9b`) — see §3.3 for why |
| Concurrent, untouched | `cursor/w2-work-b-1a8e` (`93753f4`) — slot B owns `docs/12-*` and `docs/design/api-contracts.md` |

**Why the research slot was merged.** `cursor/w1-research-official-bb4f` did not exist when P1 wrote the conflict
register — that register records the One Page as half-retrievable behind a Feishu login. It has since been read in
full, and `docs/research/tiktok-minis-official.md` §4 is the primary source for nearly every VePlayer fact this
slot needed: the constructor options, `playNext`'s signature, the event list, the `play_token` endpoint, the preload
numbers, and the 44.5.0 cutoff. Citing a document that is not on the branch would have left both new files with
dangling references, so it was merged rather than quoted second-hand. It is additive: five new files under
`docs/research/` and `docs/handoff/w1-research.md`, no modifications.

---

## 3. `INF-009` counter-signature (slot A)

`INF-009` is co-owned `P3+A+B`: P3 writes `docs/03-tech-architecture.md`, and *"A and B each record acceptance in
their W2 handoff"* (`docs/plan/w2-ready-queue.md` §4.1). No W2 P3 branch exists at this SHA, so this section is
slot A's half of the acceptance, recorded so that `INF-001` is unblocked whichever order the slots land in.

### 3.1 Accepted

**Slot A accepts the fourteen-module backend map and the `docs/architecture/tech-stack.md` §7 repository layout, and
accepts that `docs/03-tech-architecture.md` §4.1 and §9 are superseded.** Specifically:

| Item | Accepted position |
|---|---|
| Backend modules | The fourteen of `docs/architecture/tech-stack.md` §7 / `system-overview.md` §7.1: `identity, catalog, media-ops, playback, entitlement, wallet, billing, ads, progress, discovery, engagement, analytics, config, platform-tiktok`. The nine-module map is superseded |
| `media-ops` | Mandatory. `COR-2` and `COR-3` put album versioning, moderation state, listing, `client_key` authorization and drift reconciliation on our side of the line, and the nine-module map has nowhere to put any of it |
| `playback` module definition | "Entitlement → playback descriptor, lazy `play_auth_token`, playback error classification." **Not** "issue a CDN signed URL and serve a key endpoint" |
| Client layout | `app/src/{platform,player,features,routes,stores,api,core,i18n}` — the fourteen-module document's version, which adds `routes/` and `core/` |
| `minis.config.json` | Generated from a single domain source, never hand-maintained. This is what `AC-CMP-5` and `MI-3` both require, and the six-directory layout has no generator step |
| Superseded text | Recorded as correction rows, not deleted (`docs/architecture/system-overview.md` §1.1's own convention) |

### 3.2 Why this is the client slot's answer and not just a preference

The client half of the disagreement is decided by two things the nine-module layout cannot express:

1. **`player/` is a facade over a foreign renderer, and it needs `core/`.** The player is an imperative class that
   owns its DOM; the facade maps its events into our analytics and error taxonomy
   (`docs/design/player-state-machine.md` §4.1). That mapping is cross-cutting infrastructure — error
   classification, analytics, logging — which is exactly what `core/` is for. Without it, either `player/` grows a
   private copy of the error taxonomy or `features/` starts importing player internals.
2. **`routes/` is where the deep-link contract lives.** `#/fallback?reason=BLOCKED` is a new route parameter this
   wave (`docs/product/sitemap-and-ia.md` §5), and `AC-DISC-5` — release-blocking — says a deep link must never
   white-screen or dead-end. That is a guard layer with its own tests, not a subdirectory of `features/`.

### 3.3 The strongest evidence is that it is already built

`cursor/w1-repo-skeleton-e7c9` (`322bf9b`) has an installed, building, tested tree that matches the fourteen-module
layout: `app/src/{platform,player,routes,core}`, `server/src/modules/{health,playback}` created as modules are
implemented, `packages/{shared,config}`, `contracts/openapi.yaml`, and `docs/engineering/repo-layout.md` §2 stating
that it matches `docs/architecture/tech-stack.md` §7 with two deviations recorded in §2.1 (no Turborepo yet;
hand-written types until the generator exists).

So `INF-001` is not blocked on a decision any more — it is blocked on nobody having written the acceptance down.
This section writes it down. **`INF-001` should be reduced to adopting the skeleton's tree and recording those two
deviations**, rather than re-creating a layout that exists and passes `pnpm verify`.

This slot deliberately did **not** merge the skeleton branch or touch any file it owns — no `app/`, `server/`,
`packages/`, `contracts/`, `infra/`, `.github/`, `README.md` or `docs/engineering/*`. It is still in flight, and a
docs-only slot taking a snapshot of a moving code branch would create exactly the divergence the wave protocol's
one-file-one-owner rule exists to prevent. Everything above is cited by branch and SHA instead.

### 3.4 Two consistency items for the skeleton slot, non-blocking

Both are alignments with the specifications in this slot's documents, not defects:

| # | Item | Why |
|---|---|---|
| A-1 | `packages/shared/src/playback.ts` `PlaybackDescriptor` has no `playbackSessionId`, and `server/src/modules/playback/routes.ts` returns `201` with an anonymous body | `docs/design/playback-contract.md` §3.1 specifies the field, because `AC-PB-2`'s report and `AC-PB-3`'s credit-back both have to name the failed play attempt. Flagged as an addition beyond `COR-4`, so slot B may still reject it at `CTR-009` |
| A-2 | `app/src/player/veplayer-types.ts` uses lowercase event names (`'ready'`, `'play'`, …) while the platform documentation writes `READY` / `PLAY` / `TIME_UPDATE` | Unresolved either way until device testing (`Q-PS-1`). The facade is the correct place for the mapping, which is where it already is — this is a note so that neither side assumes the other is authoritative |

---

## 4. Key decisions taken by this slot

1. **The endpoint is `POST /v1/playback/sessions` returning `201`, not `POST /episodes/{id}/playback-token`
   returning `200`.** Three artefacts disagreed and one of them was running code. A token is returned only to TikTok
   clients below 44.5.0, so naming the endpoint after it would have been transcribed into a generated client method
   that lies about the common case. Registered for P1 as proposed conflict `X-19`, because `CTR-009`'s own
   acceptance criterion in `docs/plan/w2-ready-queue.md` §4.1 still names the superseded path.
2. **`blocked` is a state, not a flag on an error.** `AC-PB-1` is release-blocking and requires a platform block to
   be distinguishable from a commercial lock and from a network failure in code, copy *and* metrics. A single error
   state with a reason field makes that a property of a UI branch instead of a property of the machine.
3. **A platform block is detected by asking our own server, not by parsing the player's error.** On a fatal player
   error the client re-requests the descriptor once: `409` means blocked, `201` means the failure was
   transport-class. This satisfies `AC-PB-1` **today** rather than after device testing, because the VePlayer error
   payload shape is undocumented and `docs/design/minis-integration.md` §5.2 forbids speculative destructuring. It
   also preserves `CN-7`'s retry-once discipline with an honest new reason.
4. **No descriptor prefetching on the legacy cohort.** A descriptor prefetched at browse time carries a
   short-lived `play_auth_token` that may be dead when the user taps, and `AC-CAP-5` forbids caching it beyond
   validity. The consequence is worth planning around: below TikTok 44.5.0 a round trip sits in front of every
   episode switch and cannot be hidden. Above it, the round trip leaves the critical path entirely.
5. **Stall and seek are specified as inferred, not reported.** The documented event set has no buffering or waiting
   event. A watchdog on `TIME_UPDATE`, cross-checked against the kernel's `paused` and `ended` flags, is the only
   way to tell "buffering" from "paused". This is the largest piece of genuinely new specification in the state
   machine, and it is why the kernel handle must be captured in `READY`.
6. **`CN-6`'s 8-second budget is kept while its mechanism is deleted.** The stall response is now indicator at
   1.5 s, retry affordance at 8 s, and *never* a definition change (`AC-PL-7`, `AC-PL-6`). Keeping the number keeps
   the journey J12-3 acceptance intact; keeping the auto-downgrade would have contradicted the plugin policy.
7. **`PS-4` stays rejected, but for a sharper reason than "no mechanism".** `defaultDefinition` does exist as a
   server-configurable construction parameter — and the player documentation requires it to match the definition
   actually played, or the media-info cache **and** the preload cache both miss. It is a cache-correctness
   parameter. What still has no mechanism is a *per-viewer, per-episode* quality ceiling, which is what the
   free-episode cost guardrail needed. `GOV-007` should be aimed at the BytePlus transcoding side — which
   renditions exist for a drama at all — which makes it a publish-time content-operations decision, not a runtime
   one.
8. **The state machine is restated in English.** The Wave 1 version was Chinese. Every document that now cites it —
   the architecture set, the product set, the research set, the W2 plan set and the skeleton's code comments — is
   English, and a specification that its own test authors read in translation is a specification that drifts. All
   Chinese-era identifiers (`CN-n`, `INV-Pn`, `PS-n`, `S6`, `S7`) are preserved unchanged, so every existing
   citation still resolves, and §13 maps every Wave 1 section to its successor.

---

## 5. Findings other slots need

### 5.1 Proposed conflict `X-19` — endpoint identity (owner: P1, adjudicated here)

`docs/12-api-contracts.md` §4.4, `docs/design/api-contracts.md` §4.2 and `CTR-009`'s acceptance criterion name
`POST /episodes/{episodeId}/playback-token` with `200`. `docs/architecture/system-overview.md` §5.2 and the running
skeleton use `POST /v1/playback/sessions`, and the skeleton returns `201`. Resolved in
`docs/design/playback-contract.md` §2. **This must be settled before `CTR-007` at W3**, because the endpoint name
becomes a generated client method name and a generated server route.

### 5.2 `G-R1` is the largest open question touching this slot

The One Page's dated notice (2026-06-25) says the BytePlus + VePlayer media-asset programme is a **pilot**, that
unified access is not yet open, and that *"developers who are not included in the pilot can continue to use their
own solutions"* (`docs/research/gaps.md` `G-R1`). The public player documentation states the VePlayer mandate in
the present tense. Both can be true — one describes the destination, the other the rollout.

Slot A's position, and why it did not hedge:

- **The specification targets VePlayer, single-sourced.** The prohibition is enforced by the client replacing a
  `<video>` element with a blocked UI; `AC-PL-1` is release-blocking; and the skeleton already enforces it in three
  layers. Specifying two kernels is precisely the dual-kernel design that `COR-1` invalidated, and doing it
  speculatively would double the state machine to hedge a question business can answer with one conversation.
- **The contract shape survives either answer.** The client asks for a descriptor and never sees a media address —
  which is why `docs/research/gaps.md` itself calls the descriptor "the right shape for both".
- **What does not survive is the assumption that `vid` resolves to platform-hosted media.** If we launch outside
  the pilot: the descriptor gains a media-resolution field, `AC-PL-1` needs a written platform exemption,
  `PBK-002` must be *un*-withdrawn, and the facade boundary in `docs/design/player-state-machine.md` §4.1 is what
  keeps that a facade rewrite rather than a state-machine rewrite.
- **It must be answered before `PLY-001` at W14**, and the ask is now concrete: `S-OP-1`
  (短剧媒资库和播放器接入说明) and `S-OP-2` (TTOP short-drama playback doc) by name. `docs/research/one-page-feishu.md`
  §4 shows the One Page's §3.1/§3.2 are link-only and point at exactly those two documents, so re-requesting the
  One Page would return nothing new. This sharpens open question 2 in `docs/plan/w1-conflict-register.md` §8.3.

### 5.3 Operational finding with no predecessor in the backlog

A rotated-but-not-updated BytePlus `AccessKeyID` / `SecretAccessKey` **invalidates every video-related API call and
stops playback across the whole catalogue** (`docs/research/tiktok-minis-official.md` §5.3). That is one credential
with a catalogue-wide outage mode and no client-side recovery. A `409` storm across unrelated albums is its
signature. It needs an operational runbook item and an alert; `docs/design/playback-contract.md` §7.2 assigns it to
slot C / operations as one of `PBK-002`'s successors.

### 5.4 Blast radius of a moderation rejection is per album **version**

*"As long as any drama shell element or any episode within a drama version fails moderation, all episodes under
that version cannot be played"* (`docs/research/tiktok-minis-official.md` §5.2, restated twice in its own FAQ).
So a `409` on one episode means the **drama** is unplayable. The client must leave the player rather than offer the
next episode, and the kill switch and reconciler operate at `(album_id, version)` granularity. This changes what
`IA-002` has to design for `IAG-9`: the blocked state is a drama-level state, not an episode-level one.

---

## 6. Interfaces for the other W2 slots

**Slot B (`CTR-009`, `CTR-010`, `CTR-012`).** `docs/design/playback-contract.md` §9 is your list, T-1 through T-6.
The contract text is written to be transcribed, not re-derived. Three things need your judgement rather than your
transcription: the endpoint name (§5.1 above), whether `playbackSessionId` stays (a proposed addition beyond
`COR-4`, with the fallback stated), and the HTTP status for a platform block — slot A proposes `409` so that metric
separation survives tooling that only sees status codes, but the invariant that matters is separability plus
`retryable: false`, not the number.

**Slot C (`QA-004`).** `docs/design/playback-contract.md` §10 lists seven verification hooks; V-1 (no URL in the
playback response) and V-2 (no `<video>` and no third-party player in the bundle) already exist as running checks
on the skeleton branch and should be adopted rather than re-specified. `docs/14-security.md` §5.1 needs T-8: two of
its three anti-leech controls have no subject, and issuance rate limiting is retained with a different rationale.

**Slot P2 (`IA-001`, `IA-002`).** `PS-2` is closed: `docs/design/player-state-machine.md` §3.1 maps all fourteen
states to screen-inventory states, S6 = `locked` and S7 = `stalled`. Two amendments you will need beyond the five
in `docs/product/sitemap-and-ia.md` §12: S7's definition must lose the auto-downgrade (it is indicator + retry
now), and SCR-05 needs a terminal-error variant for `reason=BLOCKED`. For `IAG-9`, note §5.4 above — blocked is
drama-level. For `IAG-11`, the concrete engineering consequence of the legacy cohort is in
`docs/design/playback-contract.md` §4: a mandatory round trip before every episode switch below TikTok 44.5.0.
`IAG-12` is closed by §8 of the state machine, in both directions including back-navigation.

**Slot P3 (`INF-009`, W6 consolidation).** §3 of this file is slot A's counter-signature; you still need B's.
Beyond the layout, three one-line write-backs: `PS-1` (the §3.1 state list in `docs/03-tech-architecture.md` becomes
a summary plus a link), T-7 (the signed-URL sentences in §2/§3.2/§6 become correction rows), and T-10 (drop
`definition` from the `system-overview.md` §5.2 response sketch).

**Slot P1 (`GOV-006`, `PLN-002`).** Four items: proposed conflict `X-19`; the `PBK-002` successors in
`docs/design/playback-contract.md` §7.2 to replace the bare "withdrawn" row; the sharpened `GOV-007` framing in §4
decision 7; and the note that the conflict register's §8 Feishu section is now superseded by the research slot's
full transcription, so the remaining ask is `S-OP-1` and `S-OP-2` rather than the One Page.

**Verification slot at W5 (`VER-001`).** The mechanically checkable claims are `docs/design/playback-contract.md`
§10 V-1…V-7. The two most worth checking independently: that no document still describes the superseded media plane
without a correction row, and that `docs/12-api-contracts.md` §4.4, `contracts/openapi.yaml` and
`docs/design/playback-contract.md` agree on both the endpoint **and** the field set once `CTR-009` and `CTR-007`
have run.

---

## 7. Explicitly not done

- **No application code.** No file under `app/`, `server/`, `packages/`, `contracts/`, `infra/` or `.github/` was
  created or modified. `INF-001` and `INF-002` are the carriers, and §3.3 argues they should adopt the skeleton's
  existing tree.
- **No other slot's file was modified.** `docs/12-*`, `docs/03-*`, `docs/14-*`, `docs/02-*`, `docs/11-*`,
  `docs/plan/*`, `docs/architecture/*`, `docs/product/*`, `docs/engineering/*` and `docs/design/api-contracts.md`,
  `docs/design/domain-model.md`, `docs/design/minis-integration.md` are all unchanged on this branch. Verified by
  diff, not by intention — see §8 check 6.
- **`BRG-004` was not started.** It is slot A's task in this wave (`docs/plan/w2-ready-queue.md` §4.4) and it is
  independent of the critical path this slot was told to clear. The player's requirements on it are stated in
  `docs/design/player-state-machine.md` §9 — dual lifecycle listening, no timeout on native panels, opaque error
  carrying — so `BRG-004` can start from a defined consumer.
- **`INF-001` / `INF-002` were not executed**, only unblocked.
- **No pull request, no merge to `main`, no subagents, no CI change.**
- **No calendar estimates.** Sequencing is expressed in waves and dependencies.
- **No speculative dual-kernel design** for `G-R1`. Reasoning in §5.2.

---

## 8. Self-check

| # | Check | Result |
|---|---|---|
| 1 | Every acceptance item of `PLY-020` in `docs/plan/w2-ready-queue.md` §4.1 is satisfied | Pass — `CN-1/3/6/7/8` and `CN-11`'s mechanism marked superseded with the replacing correction cited; `QualityRegion` and the media-cache table removed; `TokenRegion` reduced to `playAuthToken` acquisition; `locked`, `suspended`, `paused`, `seeking`, `errorRetryable`, `errorTerminal` all retained; `INV-P1 … INV-P11` each retained verbatim or restated with a reason; `blocked` added carrying `IAG-9` and `AC-PB-1`; `playNext` on one retained instance replaces the `EpisodeWindow`; preload expressed as the two scenes with transition rules; every state mapped to a screen-inventory state; MSE recorded as preload-only. `CN-4` was also marked superseded, which the criterion did not list but which follows from the same correction |
| 2 | No document written by this slot specifies `<video>`, `hls.js` or any third-party player as the drama player | Pass — both files name them only as superseded or prohibited, and `INV-P8` makes zero `<video>` elements an invariant |
| 3 | The playback contract is stated once, with a single owner | Pass — `docs/design/playback-contract.md` is normative until `CTR-007`, then `contracts/openapi.yaml` is, with the precedence stated in the file's own header |
| 4 | Every cited section anchor resolves | Pass — checked by grep against every cited file, including the Chinese documents. One inherited error found and corrected in place: the Wave 1 state machine cited `docs/01-product-scope.md` §3 for the offline-caching exclusion, which is §2.2 item 7 |
| 5 | Every claim about the skeleton branch was verified against the branch, not assumed | Pass — `packages/shared/src/playback.ts`, `app/src/player/{player-facade,veplayer-types}.ts`, `server/src/modules/playback/routes.ts`, `server/src/app.test.ts` (the no-URL assertion is real: `expect(response.body).not.toMatch(/https?:\/\//)`), `contracts/openapi.yaml` and `docs/engineering/repo-layout.md` all read at `322bf9b` |
| 6 | No file owned by another slot was touched | Pass — `git diff --name-status cursor/w2-plan-p1-0453..HEAD` lists exactly eight paths: three from this slot (`docs/design/playback-contract.md` added, `docs/design/player-state-machine.md` modified under `PLY-020`, `docs/handoff/w2-work-a.md` added) and five added by the research merge (`docs/handoff/w1-research.md`, `docs/research/{gaps,one-page-feishu,sources,tiktok-minis-official}.md`). The only modification in the set is the one file this slot was told to restate |
| 7 | Nothing lowers a threshold, removes a test, weakens a gate or adds an exemption | Pass — two items are **stricter** than what they replace: the `blocked` outcome did not exist before, and the mandatory server re-classification on a fatal player error adds a step the old design did not have. `INV-P12 … INV-P16` are five new assertions |
| 8 | Numbers are sourced, not invented | Pass — 44.5.0, 44.2.0, `preloadTime` 5 s, `preloadMaxCacheCount` 15, `prevCount`/`nextCount` 1/2, media-info cache `expireTime` 1,800,000 ms and its `episodeId + defaultDefinition` key, iOS 17.1+, the 35/day urgent moderation quota and the two-week normal lane all trace to `docs/research/tiktok-minis-official.md` §4–§5. The 8 s stall budget, the 15 s timeout and the 10 s heartbeat are inherited from the Wave 1 documents and are cited as such |
| 9 | Open questions are marked rather than guessed | Pass — `Q-PS-1 … Q-PS-6` carry `[to verify]` / `[unknown]`, and each states what it affects and what contains it. No `[unknown]` was implemented as a guess |

---

## 9. Suggested next work

1. **Slot B, before anything else in the contract chain:** settle the endpoint name and the `409` status, then
   transcribe T-1 through T-5. `CTR-007` at W3 transcribes whatever exists, so a disagreement left standing here
   becomes generated code in two waves' time.
2. **Business, one conversation:** are we in the BytePlus/VePlayer pilot at launch (`G-R1`)? Ask for `S-OP-1` and
   `S-OP-2` by name. This is the only question in the wave that could invalidate a specification rather than merely
   refine it.
3. **Slot A's own remainder:** `BRG-004`, then `INF-001`/`INF-002` reduced to adopting the skeleton's tree per §3.3.
4. **Device testing, as soon as the Android test client arrives (`G-R18`):** `Q-PS-1` and `Q-PS-2` are the two that
   turn the facade's event mapping and the stall watchdog from specified-with-a-default into measured. Everything
   else in the state machine is verifiable in CI against `MockVePlayer`.
