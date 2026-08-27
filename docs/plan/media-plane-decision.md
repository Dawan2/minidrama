# Media Plane Decision Record — BytePlus / VePlayer, pilot or generally available

> Wave 2 · plan slot P2. Branch `cursor/w2-plan-p2-media-plane-d4a6`, based on `cursor/w2-work-b-1a8e` (`455e38b`).
> Date 2026-08-27.
>
> **Status: open.** This document does not resolve the question. It records the evidence on both sides, enumerates
> the options with their reversal costs, names **one default for engineering to build against until the account
> manager answers**, and states the rules that keep the build guardrails fail-closed while the question is open.
> The question itself is registered as **`GATE-8`** (§7) with the exact ask in §8.
>
> **Scope discipline.** This file is owned by plan slot P2 and is the only file this decision lives in. Every
> consequence for another slot's document is *registered* here with an owner and a carrier task (§9), not applied.
> Nothing here weakens a guardrail, lowers a threshold, removes a test or adds an exemption; §5 makes several
> requirements stricter.

---

## 1. The question, in one paragraph

`docs/architecture/system-overview.md` §1.1 corrections **A1–A3** state as present-tense fact that episode video
must play through VePlayer obtained from `TTMinis.getPlayer()`, that masters live in BytePlus and are uploaded
through TikTok's mini-drama media-asset APIs, and that the platform — not our backend — enforces playability. The
entire media design in §5 and §6 of that document, the withdrawal of `PBK-002`, the rewrite of `PLY-001`, the new
`media-ops` backend module and the `CTR-011` contract surface all descend from those three corrections. The
Wave 1 official-research slot then retrieved the Feishu One Page in full and found, in §3, a notice dated
2026-06-25 saying the platform media-storage-and-player programme is a **pilot**, and that **"developers who are
not included in the pilot can continue to use their own solutions"** until the platform gives notice, with
"sufficient switching time" reserved. Both statements can be true at once — the public developer documentation
describes the destination, the One Page describes the rollout — but between them sits a first-order question that
nobody has answered: **is the platform media plane what we launch on, or what we migrate to?**

Registered by research as gap **`G-R1`** and finding **`F-2`**; recorded as stale-statement `W2B-S3` in
`docs/handoff/w2-work-b.md` §5, whose recommendation was that this is "the largest blast radius open". This
document is the response to that recommendation.

---

## 2. Evidence, on both sides, with its grade

### 2.1 What the public developer documentation says

| # | Statement | Source | Reading |
|---|---|---|---|
| E-1 | "Your app **must** use the official TikTok Minis player (VePlayer) to play reviewed mini drama episodes… **Third-party players and native HTML video are not allowed. If they are used, TikTok will replace them with a default blocked UI.** If you need support for gradual migration, submit a support ticket or contact your operations representative." | [TikTok Minis Player](https://developers.tiktok.com/docs/en/minis-player), quoted verbatim in `docs/research/tiktok-minis-official.md` §4.1 | Present tense, no pilot qualifier, and it ships its own migration escape hatch — which is itself evidence that a migration is in progress rather than complete |
| E-2 | `TTMinis.setValidateVideoReplaceElement((videoEl, replaceReason) => HTMLElement \| null)` customises the element that replaces a disallowed `<video>` | same, §4.1 | A replacement API exists, is documented, and takes a *reason*. A platform that had never allowed `<video>` would not need to explain why it replaced one |
| E-3 | Media-asset APIs `/v2/sg/shortdrama/*` are documented publicly, including album versioning, the moderation state machine, listing, subtitle binding and `client_key` authorization | [Media Asset Management](https://developers.tiktok.com/docs/en/media-asset-management) | The surface is real and documented. Documentation does not establish that our organisation may call it |

### 2.2 What the One Page says

| # | Statement | Source | Reading |
|---|---|---|---|
| E-4 | **EN, 2026-06-25:** "Platform media storage player program optimization has been completed, and **pilot access will begin in July**… **Developers who are not included in the pilot can continue to use their own solutions.** The specific access time will be notified by the platform. The platform will reserve sufficient switching time and will not affect the normal online operation of Mini Programs." | One Page §3, transcribed at `docs/research/one-page-feishu.md` §4 | Explicitly contemplates a live, listed, non-pilot Mini using its own storage and player |
| E-5 | **EN, same notice:** developers not yet in the pilot should "First, use **your own storage and player** to complete the development of short drama Mini Programs online. Currently, there is no need to access the platform's official storage player program." | same | This is not permission to deviate; it is an *instruction* to deviate |
| E-6 | **CN, same date:** 方案**处于试点阶段，尚未开放统一接入**; 一期邀测已结束 — "in pilot, unified access is not yet open"; "phase-one invited testing has ended" | same, and §13.3 | More conservative than the English. Reads as "the door is currently shut", not "the door is opening" |
| E-7 | Non-pilot developers may nevertheless pre-register BytePlus account information; the platform will assign someone to assist with preferential pricing, account opening and upload preparation | One Page §3 | A concrete, zero-regret business action available today (§8.4) |
| E-8 | One Page §3.1 and §3.2 are link-only, pointing at Lark sub-documents `S-OP-1`, `S-OP-2`, `S-OP-3`, none of which has been retrieved | `docs/research/sources.md`; `docs/handoff/w2-work-b.md` §6 question 1 | The authoritative integration description exists and we have not read it. `S-OP-1` (短剧媒资库和播放器接入说明) is the single highest-value unretrieved document in the project |

### 2.3 The contradiction is sharper than "two documents disagree"

E-1 and E-4/E-5 are not merely differently dated; taken literally they cannot both be operating. If the TikTok
client replaced every `<video>` element in every Minis bundle today, a non-pilot developer **could not** "use their
own storage and player", because their player would be replaced with blocked UI the moment it rendered. So exactly
one of the following must hold, and which one it is decides the whole question:

| # | Possibility | Consequence if true |
|---|---|---|
| H-1 | The replacement behaviour is **not yet live** in the production TikTok client, or is live only for pilot organisations | Non-pilot developers really can ship their own player today. Our launch plane is a genuine choice |
| H-2 | The replacement is live but **scoped to reviewed mini-drama episodes** — that is, to media served out of the platform's own media library — and does not touch a `<video>` element playing self-hosted bytes | Same practical outcome as H-1, but the scope boundary is undocumented and could move without notice, which makes an own-plane launch a bet on an unwritten rule |
| H-3 | The replacement is live and unconditional, and the One Page notice is stale or describes a policy the client no longer implements | An own-media plane is **not shippable at all**, the question collapses, and corrections A1–A3 are correct as written |

**Nobody in this project has tested which of these is true, and it is not decidable from any document.** It is
decidable in about ten minutes on a real device with a preview build, and it is the single most informative
experiment available (§8.3). Note the asymmetry: under H-3 the answer to the whole gate is "VePlayer, now", and
under H-1/H-2 it is a decision rather than a constraint. So the experiment can only ever *close* the question or
leave it open — it cannot make it worse.

### 2.4 What is not known, stated plainly

1. Whether our organisation is in the pilot. `G-R20` records that we do not even know whether an account-manager
   relationship exists, which is the channel through which pilot admission would arrive.
2. When unified access opens, and what "sufficient switching time" means in days.
3. Whether the migration exemption ticket in E-1 is available pre-listing, what it grants, and for how long.
4. Whether the media-asset APIs are callable by a non-pilot `client_key` at all — that is, whether we could begin
   ingest and moderation ahead of pilot admission (§8.2 question 6, and it matters more than it looks: see §4.2).
5. What `S-OP-1` says. It is the document that would answer 1, 2 and 4 without a conversation.

---

## 3. The options

Four options were considered. Each is stated with what it means for the client bundle, the server contract, the
media supply chain, and — the column that actually decides it — **what it costs to be wrong**.

### MP-A — VePlayer-only, assume pilot access by launch

Build exactly what corrections A1–A3 describe: no media element anywhere, playback only through the VePlayer
façade, masters ingested into BytePlus through `/v2/sg/shortdrama/*`, playability enforced by the platform, our
entitlement check layered on top as a commercial gate that can deny but not grant.

- **Cost if right:** none. This is the destination.
- **Cost if wrong** (we are outside the pilot at listing time): the *client* is fine — it was always going to be
  VePlayer-only. What fails is the **content supply chain**: if the media-asset APIs are closed to us, we have no
  ingest path, no moderation path, and therefore no playable catalogue, and no amount of engineering fixes it.
  Listing slips until pilot admission.
- **Reversibility:** high for code, zero for calendar.

### MP-B — Own storage and player now, migrate to VePlayer later

Follow E-5 literally: build an own media pipeline (ingest, transcode, CDN, signed delivery), play through our own
player in the bundle, and migrate when notified.

- **Cost if right:** we resurrect the design corrections A1–A3 deleted — `PBK-002`'s signed-URL and AES-128 key
  interface, the quality ladder, an own CDN and its bill, an anti-leech story, and a player kernel we now own the
  bugs in. Then we do the VePlayer migration *anyway*, including re-ingesting the entire catalogue into BytePlus
  and waiting out moderation on all of it (normal lane: **two weeks**, per `W2B-D2`; the urgent lane is capped at
  35 shows per organisation per day).
- **Cost if wrong** (H-3 holds, or the switchover lands before our launch): the own player is replaced with blocked
  UI in production, on real users, and the catalogue is in the wrong place. This is the only option with a failure
  mode that is visible to users.
- **Reversibility:** low. It is the only option that spends money on something we have already decided to delete.

### MP-C — VePlayer-shaped build, media plane deferred, ingest specified but not built *(recommended)*

Build everything that is identical in both worlds, specify everything that differs, and build none of it:

- Client: VePlayer-only, no media element, one player façade with one implementation, guardrails fail-closed (§5).
- Contract: the playback endpoint returns a descriptor and never a URL, and the `BLOCKED` outcome exists —
  both of which are required in either world (§6).
- Media operations: `CTR-011` specifies album versioning, the moderation state machine, listing, `client_key`
  authorization and drift reconciliation on paper. No ingest pipeline is implemented, and no own-CDN pipeline is
  implemented either.
- Infrastructure: the ingest staging bucket for masters and posters — needed in both worlds — is the only media
  infrastructure that exists.
- Business: pre-register BytePlus account information now (E-7), which is free and useful in both directions, and
  ask the question in §8.

- **Cost if right:** zero.
- **Cost if wrong:** the same calendar exposure as MP-A, minus nothing. MP-C is strictly dominant over MP-A: it
  produces the same artefact and additionally does not spend engineering on an ingest pipeline that may be closed
  to us. The distinction between MP-A and MP-C is not what is built — it is what is *promised*: MP-A schedules
  ingest, MP-C does not schedule it until `GATE-8` resolves.
- **Reversibility:** total, in both directions.

### MP-D — Dual path: both players behind the façade, chosen at runtime

Ship both a VePlayer path and an own-media path, select by configuration or capability probe.

- **Rejected**, and it is worth saying why in full, because it is the option that sounds most prudent and is the
  most dangerous: it puts a native media element into the bundle. That single fact (a) makes `AC-PL-1`
  unsatisfiable, and `AC-PL-1` is release-blocking; (b) converts every guardrail in §5 from a hard ban into a
  ban-with-an-exception, and an exception is exactly the thing a deny-list cannot enforce reliably; (c) risks
  rejection at the platform's upload code scan, which reads the artifact and not our intentions; and (d) gives
  every future contributor a legitimate-looking reason to add a second media code path. It buys optionality in a
  dimension where optionality has no value: the *client* work is not what makes MP-B expensive.

### 3.1 Summary

| Option | Client bundle | Media supply chain | Failure mode | Verdict |
|---|---|---|---|---|
| MP-A | VePlayer-only | BytePlus ingest built now | Ingest built against an API we may not be allowed to call | Superseded by MP-C |
| MP-B | Own player in bundle | Own pipeline, then migrate | Blocked UI in production; full re-ingest later | Rejected |
| MP-C | VePlayer-only | Specified, not built; staging bucket only | Calendar exposure only, identical to MP-A | **Adopted as the default** |
| MP-D | Both | Both | `AC-PL-1` unsatisfiable; guardrails become advisory | Rejected |

---

## 4. `D-MP-1` — the default for engineering until the account manager answers

> **`D-MP-1`.** Until `GATE-8` resolves, engineering builds **MP-C**. The client is VePlayer-only and contains no
> media element and no second playback path. The playback contract is a descriptor with a platform-blocked outcome.
> The media-operations surface is specified and not implemented. No own-media pipeline and no BytePlus ingest
> pipeline is built. The ingest staging bucket is the only media infrastructure. The business track pre-registers
> BytePlus account information and asks the question in §8.
>
> **This is a default, not a resolution.** It is chosen because it is the option whose cost of being wrong is
> lowest in both directions, not because the pilot question has an answer.

### 4.1 What follows from it, as instructions rather than principles

| # | Instruction | Applies to |
|---|---|---|
| 1 | Do not write, schedule, or leave a placeholder for an own-media pipeline: no transcoding, no CDN configuration, no signed-URL issuance, no AES-128 key endpoint. `PBK-002` stays withdrawn | slots A, B, C |
| 2 | Do not schedule BytePlus ingest implementation into a wave while `GATE-8` is open. Specifying it (`CTR-011`) is correct and continues; implementing it is not | P1 at `PLN-002`, slot B |
| 3 | Do not describe the media plane as settled in any new document. Statements that hold in both worlds may be stated flatly; statements that hold only under the platform plane must name `GATE-8` in place (`SR-9`) | every slot |
| 4 | Do not treat the migration exemption ticket (E-1) as a mitigation anywhere. It is not ours until a ticket number and a written grant exist (`SR-6`) | every slot |
| 5 | Keep every guardrail in §5 at full strength regardless of which way the gate resolves (`SR-4`) | slot C |

### 4.2 The asymmetry that actually decides this, and it is not an engineering asymmetry

The engineering cost of holding MP-C open is close to zero — the client is the same artefact either way, and the
contract already has the right shape. The cost that is not zero is **content lead time**, and it runs on a clock we
do not control:

- Ingest into BytePlus is asynchronous and job-polled, and publishing is blocked while any episode lacks a `vid`
  (risk `M-4`).
- Moderation in the normal lane takes **two weeks**. The 1–3 working day figure quoted in
  `docs/architecture/system-overview.md` §6.1 and `docs/product/compliance-tiktok-minis.md` §8 is the **urgent**
  lane, which is capped at **35 shows per organisation per day** (`W2B-D2`, risk `M-5`).
- Playability is a property of the `(album_id, version)` pair. One rejected episode or shell element dark-screens
  every episode in that version.

So the launch-critical question is not "can we write the client against VePlayer" — we already have. It is
**"when can we start putting content into BytePlus"**, and the answer to that is gated on pilot admission and on
whether the media-asset APIs accept our `client_key`. That reframes the ask: the most valuable single sentence the
account manager can give us is not "you are in the pilot" but **"you may begin ingest on date X"**. That is why
`Q-MP-1` in §8.2 leads the ask and pilot membership is only `Q-MP-2` — an ordering that looks like a technicality
and is the substance.

It also means the decision is only nominally an architecture decision. Architecture is indifferent between MP-A and
MP-C. The decision with money attached belongs to content operations and business: how much catalogue is committed
before the ingest path is known to be open.

---

## 5. How the guardrails stay fail-closed

This section exists because of a specific scenario: **the answer never comes, or comes late, and at listing time
VePlayer is required.** The guardrails must be in a state where that outcome costs nothing. That is a stronger
requirement than "we have a lint rule".

### 5.1 What fail-closed means here

A guardrail is fail-closed when **the absence of evidence of compliance is a failure**, not a pass. The
distinction matters because every media guardrail in the repository today is a **deny-list**, and deny-lists are
structurally fail-open: they catch the forms of the violation that someone thought to enumerate, and they pass
silently on every form nobody thought of. That is acceptable as a first line and unacceptable as the only line.

What exists today, on `cursor/w1-repo-skeleton-e7c9` (`322bf9b`), and it is good work:

| Layer | Mechanism | Catches |
|---|---|---|
| Lint (AST) | `no-restricted-syntax` on `JSXOpeningElement[name.name=/^(video\|audio\|iframe\|object\|embed)$/]` and on `createElement` with a literal media tag; `no-restricted-imports` on `hls.js`, `video.js`, `shaka-player`, `dashjs`, `plyr` | Our source, written in the obvious form |
| Post-build scan | `app/tools/bundle-scan.ts` regex rules over emitted `.js/.css/.html`: `createElement('video')`, `createElement('iframe')`, third-party player package names, remote script injection | The artifact, including what a dependency contributed |
| Document integrity | `app/tools/html-integrity.ts` rejects `<video>`, `<audio>`, `<iframe>`, `<object>`, `<embed>` in `index.html`, permits exactly one external script (the SDK) and **requires** it, and rejects non-self stylesheets. Run against both the source document and `dist/index.html` | The one file where a forbidden element or an external script most easily enters |
| Containment | `app/tools/source-rules.ts` confines `TTMinis` references to `app/src/platform/` | Ungated platform access |
| Mock discipline | Skeleton decision `S2`: `MockVePlayer` renders a `div`, never a `<video>` | The normalisation path — a mock built on the banned element teaches the team the element is fine |
| Meta-test | `app/tools/eslint-guardrails.test.ts` runs the real ESLint config against fixtures | A rule silently dropped in a config refactor |

Two things in that table deserve to be named rather than left implicit. The **required** SDK script tag in the
document-integrity check is the one rule in the whole set that is already fail-closed in the strong sense: it fails
on *absence*, not on presence, so a document that lost the tag cannot pass by omission. It is the model the rest of
§5.3 argues for. And the **meta-test** is the most valuable item in the table and the one most likely to be lost in
a refactor, because it is the only thing preventing the enforcement matrix from becoming a claim on paper — worth
saying now, because `INF-009` is about to move this tree under a frozen layout, and whoever moves it should
preserve the meta-test deliberately rather than incidentally.

### 5.2 The standing rules

These are the rules the media-plane question must not be allowed to erode. Each names its enforcement point and how
it is reverse-verified — that is, how we prove the guardrail still fires rather than assuming it.

| # | Rule | Enforcement point | Reverse verification |
|---|---|---|---|
| **SR-1** | **No native media element, unconditionally.** No `<video>`, `<audio>`, `<source>`, `<iframe>`, `<object>` or `<embed>` in any bundle, on any branch, in any build mode, including trailers, placeholders, tests, fixtures and mocks. The rule does not become conditional on `GATE-8` in either direction | Lint AST rules; post-build bundle scan; HTML integrity check | A fixture containing each banned form is committed, and the build is asserted to fail on it. A guardrail with no failing fixture is unverified |
| **SR-2** | **There is no fallback player.** The client has exactly one playback implementation. If `TTMinis.getPlayer` is unavailable, or the instance cannot be constructed, the outcome is a named terminal product state — never another playback path, never a degraded one | Player façade has one implementation plus a media-element-free mock; capability gating per `AC-CAP-1`/`AC-CAP-2` — an unavailable capability has **no entry point**, not a disabled one | The state exists in the screen inventory and has copy (`IA-005`); a test constructs the bridge with `getPlayer` absent and asserts the terminal state, not a fallback |
| **SR-3** | **The deny-list is not the guardrail; it is the fast half of it.** The scan must additionally assert the *absence* of media-tag tokens and the *presence* of only allow-listed runtime dependencies, so that an unanticipated form fails by default | `QA-004`, slot C — registered as an amendment in §9, not applied here | See §5.3 for the specific gaps and the proposed checks |
| **SR-4** | **Monotone ratchet.** No guardrail may be weakened by `GATE-8` resolving in either direction. If the gate resolves against the platform plane and an own-media path is ever adopted, it is a separate deliverable behind a new gate, and the mainline guardrails stay as they are | `docs/plan/wave-protocol.md` §8 rule 1 (thresholds tighten monotonically); `docs/14-quality-gates.md` §0 R1–R5 | Any commit that removes or narrows a rule in §5.1 is a protocol violation, reviewable as such |
| **SR-5** | **`setValidateVideoReplaceElement` is a mitigation, not a design.** It is not called in product code. Its presence in the bundle is a build failure while `GATE-8` is open. If it is ever adopted, it carries a written exemption, a dated expiry in the source, and a test that fails after that date | Banned identifier in `app/src/**`, alongside the existing platform bans | A fixture calling it fails the build |
| **SR-6** | **No plan may cite the migration exemption ticket as a mitigation** until a ticket ID and a written grant exist. Until then the plan assumes no exemption | Planning review at `PLN-002`; this document | The exemption is cited twice today — risk `M-2`'s *contingency* column and `docs/architecture/system-overview.md` §5.1, which calls it "a mitigation, not a design". Both treatments are already correct; `SR-6` makes the rule explicit rather than conventional, so a later wave cannot promote it into a mitigation column by inattention |
| **SR-7** | **Ingest is specified, not built,** while `GATE-8` is open. The staging bucket for masters and posters is the only media infrastructure permitted, because it is required in both directions | `D-MP-1` instruction 2; `PLN-002` scheduling | No wave contains an ingest implementation task while the gate is `[ ]` |
| **SR-8** | **One blocked family, at `(albumId, version)` granularity.** Platform-blocked and our own takedown surface through the same product state family with distinct reasons, so the copy, the metrics and the operations alert do not need rebuilding if the plane changes | `IA-005` (product state); `CTR-010` (contract, slot B) | `AC-PB-1` requires the classification to be distinguishable from a locked episode and a network failure; the version-granularity half comes from the platform's own rule that one rejected episode blocks the whole version |
| **SR-9** | **Conditionality is stated in place.** A document asserting something true only under the platform plane must name `GATE-8` in the same sentence; a statement true in both worlds should be marked as such so it is not re-litigated when the gate resolves | `IA-004` audits the P2 documentation set; other slots own their own | Every occurrence of "there is no signed URL", "VePlayer only" or equivalent either carries the qualifier or is listed in §6 as plane-independent |

### 5.3 The specific fail-open holes in today's scan

Registered for slot C as an amendment to `QA-004` (§9). These are not defects in the skeleton — that slot built a
good first line, and one of its checks (§5.2 above) is already fail-closed in the strong sense. They are the
difference between a first line and a complete one, and they are cheap to close now and expensive to discover at
upload. Each was checked against the actual rule set on `322bf9b` rather than assumed.

| # | Form that passes today | Why it passes | Proposed check |
|---|---|---|---|
| 1 | **The bundle scan is skipped entirely when `app/dist` is absent.** `app/tools/cli/check-guardrails.ts` prints `note: app/dist is absent, skipping the bundle scan` and **exits 0** | A missing artifact is treated as "nothing to scan" rather than as "cannot prove compliance". Any CI ordering change, cache miss, or — imminently — the `INF-009` layout freeze moving `dist` out from under the hard-coded `../../dist` makes the strongest guardrail in the set silently stop running while the job stays green. `docs/14-quality-gates.md` §0 R1 forbids `allow_failure`, `continue-on-error` and soft-fail; a check that exits 0 without having run is the same defect reached from the other direction, and R1's intent covers it | Take the artifact directory as a required argument and **fail** when it is absent or empty. This is the textbook fail-open and the first one to fix, because its failure mode is invisible: it does not report a violation, it reports success |
| 2 | A media player shipped by a dependency under a name not on the five-package ban list | `no-restricted-imports` and the bundle regex are both enumerations of *known* players | Assert the runtime dependency set against an **allow-list**, so a new package fails by not being listed rather than by being listed. The highest-value structural change in the table: it converts an enumeration into a proof |
| 3 | `document.createElement(tag)` where `tag` is a variable or comes from a table | Both the regex and the AST selector match only a literal argument | Flag `createElement` with a non-literal argument outside the player façade. A computed tag name in a Minis bundle has no legitimate use that cannot be written literally |
| 4 | `el.innerHTML = '<video …>'`, `insertAdjacentHTML`, `dangerouslySetInnerHTML` | The bundle scan looks for `createElement`, not for markup inside string literals | Scan emitted JS and CSS for the tag-open tokens `<video`, `<audio`, `<source`, `<iframe`, `<object`, `<embed` and their closing forms. Token-level matching, not the bare word "video", so `videoId` and `enableMp4MSE` do not false-positive |
| 5 | `new Audio()`, `new MediaSource()`, `ManagedMediaSource`, or `HTMLMediaElement` prototype use | None of these is a `createElement` call or a JSX element | Ban these symbols outside the player façade. One deliberate exception: `enableMp4MSE` is a VePlayer *construction flag*, not our MSE usage, and lives inside the façade |
| 6 | A Web Component or custom element wrapping a media element inside a dependency's shadow DOM | Invisible to source lint; visible in the artifact only as markup in a string | Covered by items 2 and 4 together. Listed separately so it is not assumed unhandled |
| 7 | `<source>` in a document, and media tags in any HTML file other than `index.html` | `html-integrity.ts` covers `video`/`audio`/`iframe`/`object`/`embed` — a good list — but not `source`, and the CLI applies it to `index.html` and `dist/index.html` only | Add `source` to the forbidden-element list, and apply the document check to every emitted `.html` rather than to the two known ones. Small, and it keeps the check correct when the build starts emitting more than one document |

### 5.4 The listing-time scenario, walked through

Suppose `GATE-8` is still open on the day we submit for listing, and the platform requires VePlayer. What must be
true for that to cost nothing?

| # | Requirement at listing time | Held by | Cost if `D-MP-1` was followed |
|---|---|---|---|
| 1 | The bundle contains no media element and no third-party player | `SR-1`, `SR-3`, `AC-PL-1` (release-blocking) | Zero — the bundle never had one |
| 2 | Playback goes through exactly one façade whose only implementation is VePlayer | `SR-2`, `PLY-020` | Zero |
| 3 | The playback response carries what VePlayer needs and no media URL | `CTR-009`, correction A4 | Zero |
| 4 | Platform-blocked playback is a distinguishable, alertable outcome | `CTR-010`, `SR-8`, `AC-PB-1` | Zero |
| 5 | The upload code scan finds no prohibited construct | `QA-004` gates running since W3 via `INF-003`, not a pre-submission self-check | Zero, **and** this is the point of specifying the gates at W2 rather than discovering E5–E9 at `REL-004` |
| 6 | The catalogue is in BytePlus, moderated, with an online version and `client_key` authorization | Nothing we control | **This is the whole exposure.** Two-week normal moderation, 35/day urgent cap, and ingest may not even be open to us |

Rows 1–5 are free because the default was chosen to make them free. Row 6 is the reason `GATE-8` is a gate and not
a preference, and the reason §8's ask leads with the ingest date rather than with pilot membership.

The mirror-image scenario is worth one line: if the gate resolves the *other* way — we are outside the pilot and
choose to launch on our own media — **none of rows 1–5 is wasted and none of the guardrails is relaxed**. An
own-media launch would be a new deliverable behind a new gate, on its own branch, with its own review, and the
mainline would keep refusing to contain a media element until that gate released. That is what `SR-4` is for.

### 5.5 A guardrail this document deliberately does not propose

It would be possible to make the client fail-closed at runtime by having it refuse to start when
`TTMinis.getPlayer` is missing. That is rejected: it converts a playback-surface failure into a whole-app failure,
it breaks the browse and catalogue path which depends on no platform capability
(`docs/design/minis-integration.md` §9), and it makes local development impossible. `SR-2` puts the fail-closed
boundary at the *playback surface*, which is the smallest scope that contains the risk. Recording the rejected
alternative so it is not re-proposed as an improvement.

---

## 6. What changes, and what does not, in each direction

The useful output of a decision record is not the recommendation; it is the list of things that need no decision.

### 6.1 Plane-independent — true whichever way `GATE-8` resolves

| Item | Why it is independent |
|---|---|
| No `<video>` and no third-party player in the bundle | Under the platform plane it is mandatory. Under an own plane it is still the safest posture given H-2/H-3, and `AC-PL-1` is release-blocking either way |
| The playback endpoint returns a descriptor, not a URL, and entitlement can deny but not grant | The endpoint's job — authenticate, check entitlement, emit something the player can consume, refuse when not entitled — is the same in both worlds |
| A `BLOCKED` outcome distinct from locked and from a network failure | Platform moderation blocks under one plane; our own takedown blocks under the other. The user-facing and operational treatments are the same (`SR-8`) |
| The entire product information architecture, journeys and screen inventory | The client never sees a URL, a bitrate or a storage location in either world. **No screen, panel, state or journey owned by P2 depends on which plane serves the bytes** — this is what `IA-004` verifies rather than assumes |
| Album versioning, the moderation state machine, listing, and drift reconciliation as *concepts* | We need a publishing state machine regardless; under the platform plane it mirrors theirs, under an own plane it is ours alone |
| The ingest staging bucket | Masters and posters have to land somewhere before they go anywhere |
| The two-week content lead time as a planning input | Applies under the platform plane; under an own plane our own QC still takes time. Planning against two weeks is never wrong |

### 6.2 Plane-dependent — genuinely different

| Item | Platform plane (in the pilot) | Own plane (outside it) | Owner |
|---|---|---|---|
| Playback payload | `{ albumId, episodeId, vid, playAuthToken? }` | Would need an additive variant carrying a media reference — the endpoint survives, the payload shape does not (see §6.3) | slot B |
| Playability enforcement | Platform, from moderation status, online version, listing and `client_key` authorization (correction A3) | Ours alone; risk `M-1` changes character entirely | architecture |
| `media-ops` backend module | Talks to `/v2/sg/shortdrama/*` | Talks to our own pipeline | slot B |
| Delivery cost | Platform's | Ours, and `GOV-007`'s free-episode cost guardrail becomes urgent rather than deferred | P1 + P3 |
| Preload and first-frame | VePlayer preload scenes, MSE-gated (risk `M-3`) | Our own problem, with no `preLoadData` metric to read | slot A |
| Subtitles | Platform assets, bound to a video, picked up by VePlayer | Our assets, our rendering | slot A |
| `AC-OPS-7` drift reconciliation | Reconciles our catalogue against `album/query` | Has nothing external to reconcile against | slot B |
| Content migration | None | Full re-ingest and re-moderation of the catalogue at switchover | content ops |

### 6.3 One correction to a claim already in the repository

`docs/handoff/w2-work-b.md` §7 states that "the descriptor shape survives `G-R1` in either direction — nothing needs
to be undone". That is right about the **endpoint** and overstated about the **payload**: a descriptor of
`{ albumId, episodeId, vid }` cannot drive playback from our own storage, because there is nothing in it that
resolves to bytes we control. Under an own plane the payload would need a media reference, which is an additive
change to a contract that `CTR-007` will have transcribed and `CTR-008` will have generated types from.

**Recommendation to the slot adjudicating `CTR-009`, offered as input and not as an edit** (§9 records it as such,
because that adjudication is in flight and its acceptance criterion is not P2's to change): make the descriptor a
**discriminated union with exactly one member today** — a `kind` (or equivalent) discriminant whose only permitted
value is the VePlayer one. It costs one field now and converts a would-be breaking change into an additive one
later.

This must not be misread as building the escape hatch. A discriminant in the server contract is not a player in the
client bundle, and the two are governed by different rules: the client's obligation under `SR-2` is that an
unrecognised discriminant maps to a **terminal error state**, never to a fallback playback path. The contract
becomes extensible; the bundle stays fail-closed. If the reviewing slot judges the extra field not worth it, that
is a legitimate call — the point of recording it is that the cost of adding it later is known in advance rather
than discovered at `CTR-008`.

---

## 7. `GATE-8` — the gate registration

Registered here in the four-element form `GOV-005` established. Adoption into the authoritative tables is proposed,
not applied: `docs/plan/wave-protocol.md` §6 belongs to P3 and `docs/plan/w1-conflict-register.md` §7 belongs to P1.

| Field | Value |
|---|---|
| **Gate** | **`GATE-8` — Media plane: BytePlus/VePlayer pilot or generally available** |
| **Content** | Whether this organisation may use the platform media plane at launch: pilot membership, whether the media-asset APIs `/v2/sg/shortdrama/*` accept our `client_key`, whether the `<video>` replacement behaviour is live and how it is scoped, and the announced switchover terms. Evidence in §2; the question in §8 |
| **Blocks** | Any task that **implements** BytePlus ingest, moderation submission or listing against the real platform APIs; any commitment of catalogue volume to a dated launch; the `AC-OPS-7` drift reconciler against real data; scheduling `CTR-011`'s implementation into a wave |
| **Explicitly does not block** | The whole of cycle C1. The client build, the player façade, `PLY-020`, `BRG-004`, `INF-001`, `INF-002`; the contract adjudications `CTR-001`…`CTR-006`, `CTR-009`, `CTR-010`, `CTR-012`, `CTR-013`; **writing** the `CTR-011` media-ops specification; the guardrail specifications in `QA-004`; every Mock-path task; the entire product information architecture. It does not block Wave 2 at all |
| **Release condition** | A written answer from the account manager or the platform, or a retrieved `S-OP-1`, that establishes **either** (a) we are in the pilot, with a date from which media-asset ingest is available to our `client_key`, **or** (b) we are not in the pilot, together with the switchover terms and the scope of the `<video>` replacement behaviour, at which point the choice between MP-B and waiting becomes a business decision with known terms. A device probe result (§8.3) alone narrows the gate but does not release it, because it establishes current client behaviour and not policy |
| **Status** | `[ ]` not started |
| **Owner** | Business, with P2 holding the record and P3 holding the gate table |
| **Standing behaviour while open** | `D-MP-1` (§4) and `SR-1`…`SR-9` (§5) |

Two notes on how this gate differs from the eight that precede it — `GATE-0` … `GATE-7`, of which `GATE-7` is
itself still a proposal in `GOV-005`. First, it is the only one whose *unfavourable* resolution costs more than its
favourable one: the others all block work until released, whereas `GATE-8` resolving against us **creates** work,
which means "still open" is a materially different state here than it is for the rest of the table. Second,
`docs/plan/wave-protocol.md` §6's gate discipline rule 3 — a gate
with no movement for two consecutive cycles must be escalated to a risk entry with an alternative — should be read
as already applying: the alternative is MP-B, its terms are in §3, and it should be priced before it is needed
rather than during a launch slip.

---

## 8. The ask

### 8.1 Who to ask, and the obstacle

The TikTok mini-drama account manager. `G-R20` records that we do not know whether such a relationship exists.
If it does not, the routes in descending order of speed are: the industry-qualification submission's "TikTok
Account Manager Email" field, which implies the relationship is assignable; the developer support portal, escalating
from the AI bot to a human ticket; and the on-call route, which requires a `client_key` and an error code and is
therefore not available pre-listing. **Establishing that relationship is itself the first action**, and it is the
same prerequisite as `GATE-6` and as the `S-OP-1` retrieval — which is worth stating because it means one business
action unblocks three separate items.

### 8.2 The questions, in priority order

Written to be forwarded verbatim. Each is answerable in one sentence, which is deliberate.

| # | Question | Why it is asked in this order |
|---|---|---|
| **Q-MP-1** | **From what date can our `client_key` upload media through the mini-drama media-asset APIs (`/v2/sg/shortdrama/*`) and submit albums for moderation?** | Leads because it is the one with a calendar attached (§4.2). An answer here makes the rest optional |
| **Q-MP-2** | Is our organisation currently included in the media-storage-and-player pilot described in the One Page §3 notice of 2026-06-25? If not, what is the admission path and the expected timing? | The nominal question. Second because a "no" without Q-MP-1's date is not actionable |
| **Q-MP-3** | Is the behaviour where TikTok replaces a native `<video>` element with a blocked UI live in the production client today, and does it apply to every `<video>` in a Minis bundle or only to reviewed mini-drama episode playback? | Decides between H-1, H-2 and H-3, and therefore whether MP-B exists as an option at all |
| **Q-MP-4** | If we are not in the pilot at listing time, will a bundle that plays self-hosted media pass the upload code scan and pre-listing review, or does review assume VePlayer? | The One Page instructs non-pilot developers to use their own player; this asks whether the review process has been told |
| **Q-MP-5** | When unified access opens, what is the "sufficient switching time" in concrete terms, and is there a date after which non-VePlayer bundles stop playing for existing users? | Prices MP-B. Without it, MP-B's migration cost is unbounded |
| **Q-MP-6** | Is the migration support ticket referenced in the player documentation available to us before listing, and what does it grant — a time-boxed allowance, or a per-`client_key` allowance? | `SR-6` forbids assuming this. The question converts it from an assumption into either a fact or a closed door |

**A single sub-request worth more than any of them:** access to `S-OP-1` (短剧媒资库和播放器接入说明), which is the
document the One Page §3 defers to and which plausibly answers Q-MP-1, Q-MP-2 and Q-MP-5 without a conversation.
It is already the top item in `docs/handoff/w2-work-b.md` §10's next-capture list.

### 8.3 The experiment that does not need an answer

Independent of the ask, and available as soon as a preview build can run on a real device: put a `<video>` element
on a throwaway page in a **non-production preview build**, load it in the TikTok client, and observe whether it is
replaced. This distinguishes H-1/H-2 from H-3 directly.

Three conditions, because this is deliberately touching the thing everything else in this document forbids:

1. It runs on a **throwaway branch that is never merged**, never in a code version submitted for review, and never
   in a production or canary build. The mainline guardrails are not relaxed for it, are not made conditional for
   it, and no exemption or environment flag is added to accommodate it — if the guardrails make the experiment
   inconvenient, that is the guardrails working.
2. Its result is recorded here as evidence, with the client version and OS tested, since the behaviour is
   client-version-dependent and an observation without a version number is not reusable.
3. A negative result (no replacement) **does not release `GATE-8`** and does not authorise MP-B. It narrows H-3 out,
   which is worth having, but current client behaviour is not policy and can change in any client release.

### 8.4 The zero-regret business action, available today

Per E-7, pre-register BytePlus account information with the platform. It is useful if we are admitted to the pilot,
harmless if we are not, requires no engineering, and puts us in a queue we would otherwise join later. It should
start regardless of how any of §8.2 is answered, and it is plausibly the fastest way to discover the answer to
Q-MP-1 as a side effect.

---

## 9. Consequences registered for other slots

Registered, **not applied**. Each row names the owning slot, which is the only slot that may make the edit. Rows
marked *in flight* address a task believed to be running right now; those are **inputs for the owning slot to
accept or reject in its own handoff**, and explicitly not changes to an acceptance criterion already being worked.

| # | For | Item | Status |
|---|---|---|---|
| `P2-MP-1` | **slot C**, in `QA-004` | The seven fail-open forms in §5.3. Item 1 first — the guardrail CLI exits 0 when `app/dist` is absent, and `INF-009`'s layout freeze is about to move that path — then `SR-3`'s allow-listed dependency set. Additive to `QA-004`'s scope; nothing in it is relaxed | Registered for W2 |
| `P2-MP-2` | **slot C**, in `QA-004` | `SR-5`: `setValidateVideoReplaceElement` becomes a banned identifier in `app/src/**` while `GATE-8` is open | Registered for W2 |
| `P2-MP-3` | **slot B**, adjudicating `CTR-009` | §6.3: consider a one-member discriminated union for the playback descriptor, with the client's unrecognised-discriminant behaviour fixed as a terminal error by `SR-2` | *In flight* — input only |
| `P2-MP-4` | **slot B**, in `CTR-011` | `SR-7`: continue specifying the media-ops surface; do not let a wave schedule its implementation while `GATE-8` is open. `docs/plan/w2-ready-queue.md` §4.3 already targets it at W3 as specification, which is consistent | *In flight* — input only |
| `P2-MP-5` | **slot A**, in `PLY-020` | `SR-2`: the restated state machine should carry the "no player available" terminal state alongside `blocked`, and state that it has no outgoing edge to any playback path | *In flight* — input only |
| `P2-MP-6` | **P3**, in the `docs/plan/wave-protocol.md` §6 gate table | Adopt `GATE-8` from §7, including the note that this is the first gate whose unfavourable resolution creates work | Registered for W2 |
| `P2-MP-7` | **P1**, in `docs/plan/w1-conflict-register.md` §7 and §9 | Adopt `GATE-8`; record `G-R1` as carried by `GOV-008` so it does not lose its carrier the way corrections A1–A6 did | Registered for W2 |
| `P2-MP-8` | **P3 / architecture**, in `docs/architecture/system-overview.md` §1.1 | Corrections A1–A3 should carry a conditionality note naming `GATE-8` (`SR-9`). They are not wrong — they describe the destination — but as written they read as present-tense fact, which is what caused this gap to go unnoticed | Registered for W2 |
| `P2-MP-9` | **P3 / architecture**, in `docs/architecture/risks.md` | Risk `M-1` is understated while `GATE-8` is open: it assumes the platform plane and prices only drift. Add the plane risk itself, with §3's options as the contingency | Registered for W2 |
| `P2-MP-10` | **P1**, in `GOV-007` (W6) | The free-episode cost guardrail's urgency is plane-dependent (§6.2). If `GATE-8` resolves against the platform plane, delivery cost becomes ours and `GOV-007` moves earlier than W6 | Registered for W6 |
| `P2-MP-11` | **P1 / P3** | `SR-4` and `SR-6` are protocol-level statements. They belong in `docs/plan/wave-protocol.md` §8's constant prohibitions if P3 agrees, since that list is where "no threshold is ever relaxed" already lives | Registered for W2 |

---

## 10. Self-check

| # | Check | Result |
|---|---|---|
| 1 | Every option states what it costs to be wrong, not only what it costs | Pass — MP-A, MP-B, MP-C, MP-D each carry a reversal cost, and MP-C is adopted on dominance rather than preference |
| 2 | The default is falsifiable — it says what would change it | Pass — §7's release condition and §8.2's six questions each map to an action in §6.2 |
| 3 | `GATE-8` has all four required elements | Pass — blocks / explicitly does not block / release condition / status, in the form `GOV-005` established for `GATE-7` |
| 4 | No guardrail is weakened, no threshold lowered, no test removed, no exemption added | Pass. §5.3 adds seven checks; `SR-4` forbids relaxation in either direction; `SR-5` and `SR-6` close two paths that were previously only conventions. The §8.3 experiment is fenced by three conditions and explicitly does not relax the mainline |
| 5 | No file owned by another slot is modified | Pass — `docs/plan/media-plane-decision.md` and `docs/handoff/w2-plan-p2.md` are this slot's own; `docs/plan/w2-ready-queue.md` is amended under the explicit brief and additively, per its own §10 change log |
| 6 | No task belonging to a running slot is redefined | Pass — `P2-MP-3`, `P2-MP-4` and `P2-MP-5` are marked *in flight* and are inputs; no acceptance criterion in `docs/plan/w2-ready-queue.md` §4.1–§4.6 is edited |
| 7 | Every claim about the guardrails was read from the source, not inferred | Pass — `eslint.config.js`, `app/tools/bundle-scan.ts`, `app/tools/source-rules.ts` and `docs/handoff/w1-skeleton.md` decision `S2` were read on `cursor/w1-repo-skeleton-e7c9` at `322bf9b`. Note that head has moved since `docs/handoff/w2-work-b.md` §8 recorded it at `abfc664` |
| 8 | Every quotation is traceable | Pass — E-1 … E-8 each name a source document and section; the One Page quotations are from `docs/research/one-page-feishu.md` §4 and §13.3, which is itself a transcription and is labelled as such |
| 9 | The document distinguishes what it decided from what it recorded | Pass — one decision (`D-MP-1`), nine standing rules, one gate, eleven registered consequences, zero adjudications of another slot's conflict |
| 10 | No calendar estimates | Pass — lead times quoted (two weeks' moderation, 15–30 US business days for EIS) are platform-published durations, not effort estimates |

---

## 11. Change log

| Date | Wave · slot | Change |
|---|---|---|
| 2026-08-27 | W2 · P2 | First version. Recorded the evidence on both sides of `G-R1`/`F-2` as E-1…E-8; identified H-1/H-2/H-3 as the decisive and untested sub-question; enumerated options MP-A…MP-D; adopted MP-C as default `D-MP-1`; wrote the nine fail-closed standing rules `SR-1`…`SR-9` and seven fail-open holes in the current guardrail set, one of which is a green-on-absent-artifact exit path; registered `GATE-8` and the six-question ask; corrected the overstated "the descriptor survives in either direction" claim; registered eleven consequences for other slots |
