# X-19 — Playback Endpoint Identity: the Binding Decision

> **Wave 2 · plan slot P3.** Branch `cursor/w2-plan-p3-477e`, based on `cursor/w2-work-a-71b2` (`3c5fb84`) with
> `cursor/w2-plan-p2-media-plane-d4a6` (`0f1908c`) merged in. Date 2026-08-27.
>
> **Status: binding for the identity of the playback issuance endpoint.** One name, one method, one success status,
> one operation id, for every document, contract and generated artefact in the repository. Slots transcribe it; a
> slot that disagrees registers a conflict against *this file* under `docs/plan/wave-protocol.md` §3.4 and does not
> rename anything locally. §7 states the only three ways this reopens.
>
> **Why a separate file.** X-19 spans documents owned by four different slots, so no single owning slot can settle it
> without rewriting another slot's file — which §3.1 forbids. The mechanism the protocol provides for that is
> adjudication by the slot that owns the canonical form of the statement (§2 below), recorded once in a file the
> adjudicator owns. This is the same construction slot P2 used for `docs/plan/media-plane-decision.md`.
>
> **Ownership claim.** `docs/plan/x19-playback-endpoint.md` is **P3's**, on the same footing that
> `docs/plan/w2-ready-queue.md` §2 gives P1 the two files its own pass created. The row is owed to that table and is
> registered in §6, not taken unilaterally — X-16 makes the table P3's to adopt or amend, and this file is a piece of
> evidence for that pass, not a substitute for it.
>
> **Scope fence.** This decision settles a *name*. It does not settle the descriptor's fields, the failure status
> codes, the rate-limit numbers or the media-plane question. Every one of those has an owner and a carrier task in
> §1.2, and none of them is P3's.

---

## 1. The decision

### 1.1 Binding

```http
POST /v1/playback/sessions        →  201 Created
```

| # | Bound | Value | Why it is bound and not left to a transcriber |
|---|---|---|---|
| BD-1 | Path | `/v1/playback/sessions` | The whole subject of the conflict |
| BD-2 | Method | `POST` | Issuance mints state; it is not a read |
| BD-3 | Path shape | **Absolute**, including the `/v1` segment, with **no `/api` prefix** and no base-path variant. The version lives in the path, not in a server base URL | The running contract has `servers: https://api.example.invalid` with no base path (`contracts/openapi.yaml` at `9de8c2b`). A document that says `/playback/sessions` under a `/api/v1` base and a contract that says `/v1/playback/sessions` under no base produce the same string only by accident, and `CTR-008` generates from the contract |
| BD-4 | Success status | `201 Created` | §4 R2 and §4.2. It survives whether or not slot B keeps a client-visible session id |
| BD-5 | `Location` header | **Deliberately absent.** Per RFC 9110 §15.3.2 the created resource is then identified by the target URI | We serve no `GET` on a session. Advertising a URI we do not answer is worse than omitting the header. Adding a `GET` later is additive and does not disturb BD-1…BD-4 |
| BD-6 | Operation id | `createPlaybackSession` | It is the generated client method name at `CTR-008` (W4). Leaving it unbound leaves the name unbound where it is most expensive to change |
| BD-7 | Legacy path | `POST /episodes/{episodeId}/playback-token` `200` is **superseded, recorded, not deleted** | `docs/architecture/system-overview.md` §1.1's own convention. A deleted path is a path someone re-derives |

### 1.2 Not bound here — owner and carrier for each

Listing these is half the value of the file: it is what stops the decision from being read as wider than it is.

| Question | Owner | Carrier | Note |
|---|---|---|---|
| Does the response carry `playbackSessionId`? | **B** | `CTR-009` | Slot A proposes it and states the fallback (`docs/design/playback-contract.md` §3.1). BD-4 does not depend on the answer — §4.2 |
| Descriptor field set, and a `kind` discriminant | **B** | `CTR-009` | P2's input `P2-MP-3` (`docs/plan/media-plane-decision.md` §6.3) is a recommendation to B, not a decision by P2 or P3 |
| Failure status codes — `403` / `409` / `410` / `503` | **B** | `CTR-009`, `CTR-010` | Slot A proposes `409` for a platform block; the invariant that matters is separability plus `retryable:false`, not the number |
| The failure-report subresource path | **B** | `CTR-010` | Derivative of the `playbackSessionId` decision — §5.3 gives both forms so the client is never blocked on it |
| Rate-limit bucket for issuance | **B** | `CTR-012` | The bucket exists and is mislabelled — `P3-X19-4` |
| Whether `vid` resolves to platform-hosted media | Business | `GOV-008` / `GATE-8` | Plane-dependent. §5.6 |

---

## 2. Why P3 adjudicates this, and what "binding" means

`docs/plan/wave-protocol.md` §3.4 is *register, do not rewrite*, and it makes the adjudicator a function of file
ownership (§3.1). Applied to X-19, that rule alone produces a deadlock, which is why the conflict has been passed
between slots twice already:

| Artefact naming the endpoint | Owning slot |
|---|---|
| `docs/12-api-contracts.md` §4.4, `docs/design/api-contracts.md` §4.2, `contracts/openapi.yaml` | **B** |
| `docs/02-user-journeys.md`, `docs/02-screen-inventory.md` | **P2** |
| `docs/00-wave-plan.md`, `docs/plan/w2-ready-queue.md` | **P1** |
| `docs/03-tech-architecture.md`, `docs/architecture/system-overview.md` | **P3** |
| `docs/design/playback-contract.md`, `docs/design/player-state-machine.md` | **A** |
| `server/`, `app/` | **B**, **A** |

Four owners, one string. Each of them can only fix their own copy, which is exactly how the repository arrived at
three spellings of one endpoint. The tie-break the protocol offers is that a *convention* is adjudicated by the slot
that owns its canonical statement, and three things put that here:

1. **X-15 makes `docs/architecture/*` canonical and P3 the adjudicator**, with `docs/03-*` reduced to pointers. The
   URL namespace is an architecture-level convention: it decides route registration, module boundaries and the
   generated client surface, and it appears in the canonical sequence diagram
   (`docs/architecture/system-overview.md` §5.2, line 284, already `POST /v1/playback/sessions`).
2. **X-16 makes the ownership table P3's to adopt or amend**, which is the same authority under which this file
   claims its own row.
3. **`INF-009` is P3's task in this wave** and freezes the fourteen-module backend map. `/v1/playback/*` versus
   `/episodes/{id}/playback-token` is a question about which module owns the route — §4 R4 — so it is decided by the
   same slot that freezes the map, in the same wave, or it is decided twice.

Slot A adjudicated the substance first and correctly, inside its own file, and registered it for a plan slot exactly
as §3.4 requires (`docs/design/playback-contract.md` §2, `docs/handoff/w2-work-a.md` §5.1). This file does not
overturn that; it does the one thing slot A could not do from a work slot — make it binding across four owners' files
and give the transcribers a single citation.

**What "binding" obliges.** A slot transcribing X-19 into its own file cites this file and changes nothing about the
name. A slot that believes the decision is wrong opens a conflict row against `docs/plan/x19-playback-endpoint.md`
in its own handoff, names which of `RO-1`…`RO-3` in §7 it invokes, and leaves the name alone until that is
adjudicated. Silent local divergence is the failure this file exists to end, so a second spelling appearing anywhere
after this point is a protocol violation and reviewable as such, not a difference of opinion.

---

## 3. What was actually in conflict

Five artefacts, not three. The fifth is the one nobody counted, and it is the reason BD-3 exists.

| # | Artefact | At | Says | Status |
|---|---|---|---|---|
| E-1 | `docs/12-api-contracts.md` §4.4 (line 194), `docs/design/api-contracts.md` §4.2 (line 145) | this branch | `POST /episodes/{episodeId}/playback-token`, `200`, returning `playUrl` + `format` + `quality` + `expiresAt` | Superseded — payload by `COR-4`, name by this decision |
| E-2 | `CTR-009`'s acceptance criterion, `docs/plan/w2-ready-queue.md` §4.1 item 2 (line 134) | this branch | *"`POST /episodes/{id}/playback-token` returns `{ albumId, episodeId, vid, playAuthToken? }`"* | The criterion is right about the payload and wrong about the name. Transcribing it literally re-introduces the conflict the task exists to close |
| E-3 | `docs/architecture/system-overview.md` §5.2 (line 284) | this branch | `POST /v1/playback/sessions`, status not stated | Adopted for the path; status now stated by BD-4 |
| E-4 | `contracts/openapi.yaml`, `server/src/modules/playback/routes.ts` | `322bf9b`, still true at `9de8c2b` | `POST /v1/playback/sessions` → `201`, `operationId: createPlaybackSession`, no `Location` | **Adopted verbatim.** It is running code with contract tests |
| E-5 | `docs/12-api-contracts.md` line 14 — Base URL `https://api.<domain>/api/v1`; `docs/03-tech-architecture.md` lines 53, 173 (`/api/v1/auth/login`); `docs/11-api-and-bridge.md` line 212 (`POST /api/webhooks/tiktok-pay`) | this branch | Paths in the contract documents are relative to an `/api/v1` base, and one document uses an `/api/` prefix with no version at all | **Wider than X-19.** BD-3 settles the playback endpoint's full path. The general reconciliation is registered as proposed conflict **X-20** (§6) because it touches every endpoint and is B's to adjudicate |

The running code is the tie-break on evidence as well as on cost. At `9de8c2b` the adopted spelling occurs in six
files: eight path literals (`contracts/openapi.yaml` line 33, `server/src/modules/playback/routes.ts` line 30,
`server/src/app.test.ts` lines 42, 55, 73, 84, `server/src/contract.test.ts` line 78,
`server/src/modules/platform-tiktok/webhook-routes.test.ts` line 420), one test title and one comment in
`app/src/routes/PlayPage.tsx`. Three of those are load-bearing:

- `server/src/contract.test.ts` asserts that **every** operation in `contracts/openapi.yaml` reaches a live handler
  and is neither `404` nor `405`. The contract and the route cannot drift apart silently.
- `server/src/app.test.ts` asserts `201`, the exact descriptor body, and that the serialized response matches
  neither `https?://` nor `\.m3u8|\.mp4|playUrl|definitions?"`.
- `server/src/modules/platform-tiktok/webhook-routes.test.ts` uses `POST /v1/playback/sessions` as the *control* that
  proves the webhook module's raw-body parser stays scoped to its own plugin. The playback path is load-bearing for a
  test about a different module.

---

## 4. Reasons, in order of weight

R1, R2 and R3 are slot A's, restated because a binding decision must carry its own argument rather than point at
one. R4, R5 and R6 are new here.

**R1 — `playback-token` is false in the common case.** Under `COR-4` a token is in the response only for TikTok
clients below 44.5.0 (`docs/research/tiktok-minis-official.md` §4.1). An endpoint named after a field most callers
never receive is the same drift that produced this conflict, and at `CTR-008` it becomes a generated method name
every client author has to un-learn.

**R2 — the resource is a play attempt, not a credential.** It is where entitlement is enforced, where the per-user
rate limit belongs, where the lazy `play_auth_token` fetch happens, and where the identifier that a blocked-playback
report and a credit-back must quote is minted. `POST` to a collection returning `201` is that; `200` on a
token-shaped noun is not.

**R3 — it is already implemented, with tests.** §3 E-4 and the three tests above. Renaming running code to match a
document whose payload `COR-4` already invalidated is motion, not progress.

**R4 — the path maps to the module that owns the route.** `INF-009` freezes the fourteen-module map in which
`playback` is a module and `catalog` owns episodes. `/v1/playback/sessions` registers under the module that
implements it; `/episodes/{id}/playback-token` nests the playback module's only write operation inside `catalog`'s
resource tree, which is precisely the shape that made the nine-module map unable to express `media-ops`. One
namespace per module also gives `D-AC-5`'s rate-limit buckets and the observability labels an obvious key.

**R5 — endpoint identity is plane-independent; the payload is not.** `docs/plan/media-plane-decision.md` §6.1 lists
"the playback endpoint returns a descriptor, not a URL" as true whichever way `GATE-8` resolves, and §6.2 lists the
*payload* as genuinely plane-dependent. Naming the endpoint after a payload field therefore couples the one part of
the contract that survives the media-plane question to the one part that may not. `/v1/playback/sessions` is correct
in both worlds; `playback-token` would need renaming in one of them.

**R6 — the costs of being wrong are asymmetric, and both are known.** Adopting the legacy name costs eight path
literals, three tests and one OpenAPI path today, plus re-registering the route in a module it does not belong to.
Leaving the conflict open until `CTR-007` costs a generated client method, a generated server route and every
compile-time consumer from `CTR-008` onward — `docs/plan/w2-ready-queue.md` §8 already names `CTR-009` as the single
highest-cost delay in the wave for exactly this reason.

### 4.1 The case for the legacy name, and why it loses

Stated properly, because a decision that only lists its own supports is not an adjudication:

| For the legacy name | Why it does not carry |
|---|---|
| Three documents and one acceptance criterion say it — a 4:2 count of artefacts | Counting artefacts counts transcriptions. E-1, E-2 and the `docs/02-*` rows all descend from one Wave 1 statement whose payload `COR-4` has already invalidated. Weight of evidence is not multiplicity of copies |
| REST convention nests a sub-resource under its parent entity | The convention applies when the thing created belongs to the parent. A play attempt belongs to the *viewer*, is metered per user, and outlives the request; `episodeId` is an argument to it, not its parent. The episode is already in the request body |
| `episodeId` in the path is friendlier to logs, caches and per-episode rate limits | The response is `no-store` and issuance is deliberately non-idempotent, so there is nothing to cache; `D-AC-5` keys the bucket on `userId`, not on the path; and the episode id is in the body for logs. This buys nothing and costs R4 |
| Renaming is churn | The rename has already happened, in the direction of the running code. Adopting the legacy name is the churn — §3 E-4 |

### 4.2 Why `201` and not `200`

`200` would say "here is a representation of something that already existed". Issuance is not that: it records an
attempt server-side, it is the metered and rate-limited event, and on the legacy cohort it causes a platform-side
`play_token` fetch. It is also the only anchor a failure report and a credit-back can name (`AC-PB-2`, `AC-PB-3`).

BD-4 does **not** depend on slot B keeping a client-visible `playbackSessionId`. The skeleton already returns `201`
with an anonymous body, and `201` describes what the server did, not what it chose to disclose. If B rejects the
field, `201` stands and the failure-report path takes the fallback form in §5.3.

---

## 5. Migration notes

### 5.1 Documents — every occurrence, with an owner

Complete as of this branch. Handoff documents are excluded on purpose: `docs/plan/wave-protocol.md` §3.3 makes them
per-slot historical records, and rewriting a handoff to match a later decision destroys the audit trail that made
this conflict findable. `docs/handoff/w1-architecture.md` line 32, `docs/handoff/w1-work-b.md` line 22,
`docs/handoff/w2-plan-p1.md` line 53 and `docs/handoff/w2-work-a.md` lines 111 and 155 stay exactly as they are.

| # | File · line | Owner | Carrier | Required change |
|---|---|---|---|---|
| MG-1 | `docs/12-api-contracts.md` §4.4, lines 190–210 | **B** | `CTR-009` | Endpoint becomes `POST /v1/playback/sessions` `201` per BD-1…BD-6; body per `docs/design/playback-contract.md` §1. Record the legacy path *and* `playUrl` / `format` / `quality` / `expiresAt` / the ladder / the key endpoint as superseded, citing `COR-2`, `COR-4` and this file. This is slot A's T-1 with the name resolved |
| MG-2 | `docs/12-api-contracts.md` line 14 | **B** | `X-20` (§6) | The Base URL and the in-path `/v1` must be reconciled once, for every endpoint. Not X-19's subject; BD-3 fixes the playback endpoint's full path in the meantime |
| MG-3 | `docs/design/api-contracts.md` line 145 | **B** | `CTR-012` | Cache-table row renamed; still `no-store`, with the reason restated per slot A's T-5 |
| MG-4 | `docs/design/api-contracts.md` line 547 | **B** | `CTR-012` | The rate-limit bucket is labelled 播放令牌签发 ("playback token issuance") and carries a concurrent-stream ceiling. Rename to descriptor issuance; the ceiling needs the treatment in `docs/design/playback-contract.md` §7.3, which retains issuance rate limiting and drops fetch-time concurrency. Registered as `P3-X19-4` |
| MG-5 | `docs/02-user-journeys.md` lines 70, 78 | **P2** | `IA-001` | Two journey data-dependency cells. Line 78's prose 换取播放令牌 ("exchange a playback token") also stops being true on modern clients |
| MG-6 | `docs/02-screen-inventory.md` line 97 | **P2** | `IA-001` | SCR-05's data-dependency list |
| MG-7 | `docs/00-wave-plan.md` line 48 | **P1** | `PLN-002` | W10's theme is 播放令牌与播放器骨架 and its deliverable is `playback-token` 签发. The wave's subject survives; its name does not |
| MG-8 | `docs/03-tech-architecture.md` lines 67, 159 | **P3** | `INF-009` + the W6 consolidation | Both become correction rows pointing at `docs/architecture/system-overview.md` §5–§6, per slot A's T-7. **Not done in this pass** — see §5.5 |
| MG-9 | `docs/plan/w2-ready-queue.md` §4.1 item 2 (line 134) | **P1** | `GOV-006` | `CTR-009`'s acceptance criterion must name the adopted path, or the task's own criterion contradicts its purpose. Slot A's T-9, now with an adjudicated name to point at |
| MG-10 | `docs/plan/w1-conflict-register.md` §6.2 | **P1** | `GOV-006` | Add the X-19 row: conflict, documents, resolution *decided* (not recommended), adjudicator P3, carrier this file, target W2 — closed. Line 82's A4 row is a quotation of the superseded statement and is correct as written |
| MG-11 | `docs/architecture/system-overview.md` line 43 (A4 row), line 284 | **P3** | — / `T-10` | No name change needed: line 43 quotes the legacy path as the *before* column of a correction, line 284 already uses the adopted path. T-10 (drop `definition` from the §5.2 sketch) is separate and still owed |
| MG-12 | `docs/plan/w2-ready-queue.md` line 28, `docs/design/playback-contract.md` lines 72, 78, 354 | **P1**, **A** | — | No change. Each names the legacy path as the thing being superseded, which is what a supersession record is for |

**Nothing in this table is a rewrite by P3.** Ten of the twelve rows are transcriptions by the file's own owner; two
are P3's own and are sequenced in §5.5.

### 5.2 Code — the migration is documents-only

Zero code changes. Every one of the ten occurrences in §3 already spells the adopted name, at `322bf9b` and still at
`9de8c2b`. The verification is one command:

```bash
git grep -n "playback-token" -- app server contracts packages   # must return nothing
```

That is the whole point of R3: X-19 is a decision to stop a rename, not to perform one. The catalog and guardrail
work in flight on `cursor/w2-work-c-5101` and `cursor/w2-work-e-1aaa` needs no branch surgery and no rebase — the
name they are building against is the name that is now binding.

### 5.3 The one derivative that is genuinely conditional

Slot A's failure-report endpoint (`docs/design/playback-contract.md` §5.3) is keyed on the session id:

```http
POST /v1/playback/sessions/{playbackSessionId}/failures
```

If slot B keeps `playbackSessionId` at `CTR-009`, this path follows from BD-1 and needs no further adjudication. If
B rejects it, the subresource has no key and the fallback is a sibling collection carrying its own correlation
fields:

```http
POST /v1/playback/failures     { episodeId, albumId, vid, kind, occurredAt, playerPayloadSummary }
```

Both forms live under `/v1/playback/`, so BD-1 is stable either way and neither client nor operations work is
blocked on B's field decision. What is lost in the fallback is exact correlation across retries, which is slot A's
stated cost and B's call to accept.

### 5.4 What `CTR-007` and `CTR-008` inherit

| Wave | Task | What X-19 hands it |
|---|---|---|
| W3 | `CTR-007` | A settled path, method, success status and operation id. The skeleton's existing `/v1/playback/sessions` entry is the starting point, not a competing version. `CTR-007` transcribes the *payload* adjudicated by `CTR-009`; the identity is no longer an open question at transcription time — which is what slot A said had to be true before this wave ended |
| W4 | `CTR-008` | `createPlaybackSession` as the generated method name, fixed by BD-6 before generation rather than discovered after it |
| W5 | `VER-001` | The checks in §8 |
| W13 | `PBK-001` | Denial at three entry points, with the mechanism being refusal to issue a descriptor from this endpoint |

### 5.5 Two obligations P3 owes, and why they are not in this pass

MG-8 and MG-11's T-10 are P3's own files. This pass deliberately did not open them:

- `docs/03-tech-architecture.md` is `INF-009`'s target file, and `INF-009`'s acceptance criterion covers §4.1 and §9
  — the layout and module map — while the playback sentences are in §2, §3.2 and §6. Editing three sections of a
  file whose scheduled edit is a different section, in a wave where `INF-001` is waiting on that same freeze, risks
  landing a half-frozen document. The playback sentences ride with `INF-009`'s edit or with the W6 consolidation,
  whichever runs first, and they are recorded here so neither can silently drop them.
- `INF-009` itself is still open. Slot A's counter-signature is already banked (`docs/handoff/w2-work-a.md` §3);
  slot B's is outstanding. That is the wave's remaining blocking item and it is P3's, not X-19's.

### 5.6 Conditionality under `SR-9`

`docs/plan/media-plane-decision.md` §5 `SR-9` requires a statement that holds only under the platform media plane to
name `GATE-8` in place, and a statement that holds in both worlds to be marked as such. Applied to this file:

| Statement | Plane |
|---|---|
| BD-1 … BD-7, and every reason in §4 | **Plane-independent.** The endpoint authenticates, checks entitlement, emits something the player can consume and refuses when not entitled, in either world (`media-plane-decision.md` §6.1). If `GATE-8` resolves against the platform plane, this decision does not reopen — `RO-1` in §7 |
| The `vid` / `playAuthToken` payload, and the 44.5.0 cohort behind R1 | **Plane-dependent (`GATE-8`).** B's subject at `CTR-009`, with P2's discriminant recommendation as input. R1's force is reduced but not removed if the cohort argument changes, because R2 and R4 do not depend on the payload at all |

---

## 6. Registered, not decided

Following §3.4: found while adjudicating, belongs to someone else, not touched here.

| # | Item | Owner | Carrier | Note |
|---|---|---|---|---|
| **X-20** *(proposed)* | **Base-path and version-prefix drift across the whole HTTP surface.** `docs/12-api-contracts.md` declares Base URL `https://api.<domain>/api/v1` and writes paths relative to it; `docs/03-tech-architecture.md` lines 53 and 173 use `/api/v1/...`; `docs/11-api-and-bridge.md` line 212 uses `POST /api/webhooks/tiktok-pay` with no version at all; the running server registers `/v1/auth/login`, `/v1/playback/sessions`, `/v1/payments/callbacks/tiktok` and an unversioned `/health`, with an OpenAPI `servers` entry that has no base path | **B**, with P3 counter-signing the namespace convention | `CTR-007` (W3) for the contract; `GOV-006` for the document set | Same failure mode as X-19 and a larger blast radius: it is every endpoint, and it becomes generated code at `CTR-008`. Recommended resolution, offered as input: version in the path, no `/api` segment, operational endpoints (`/health`) outside the versioned surface — which is what runs today. X-19 fixes only the playback endpoint (BD-3) |
| `P3-X19-1` | `CTR-009`'s acceptance criterion names the superseded path (MG-9) | **P1** | `GOV-006` | The highest-priority row in §5.1: a task whose criterion contradicts its purpose will be satisfied literally by someone in a hurry |
| `P3-X19-2` | The X-19 row for the conflict ledger (MG-10), recorded as **decided** with this file as the carrier | **P1** | `GOV-006` | X-19 is the first conflict in the register resolved by a plan slot writing a decision record rather than by editing a document. If P1 or P3 wants that pattern named, `PLN-002` is the place |
| `P3-X19-3` | `docs/design/playback-contract.md` §2 says X-19 is "proposed" and "renumber freely". It is now decided and the number is fixed | **A** | A's next wave, optional | One-line pointer to this file. Not requested and not required — slot A's file is already correct on the substance |
| `P3-X19-4` | The `D-AC-5` bucket label and its concurrent-stream ceiling (MG-4) | **B** | `CTR-012` | Cross-check against `docs/design/playback-contract.md` §7.3, which retains issuance rate limiting and drops fetch-time concurrency control as having no subject |
| `P3-X19-5` | `docs/00-wave-plan.md` W10's theme and deliverable name (MG-7) | **P1** | `PLN-002` | Cosmetic, but it is the wave plan a reader meets first |

---

## 7. How this reopens

Three ways, and no others. Anything else is a transcription question, answered by §1.

| # | Condition | Effect |
|---|---|---|
| RO-1 | **A platform requirement dictates a path shape.** None is known: the platform constrains domains and TLS, not our path structure (`docs/research/tiktok-minis-official.md`, `packages/config/src/domains.ts`) | Would override BD-1 and BD-3 outright. Evidence must be a cited platform document, not an inference |
| RO-2 | **Slot B demonstrates a generator or tooling constraint** at `CTR-007` / `CTR-008` that BD-1…BD-6 cannot satisfy | Reopens BD-6 first — an operation id is cheaper to change than a path — and only then BD-1 |
| RO-3 | **A `GET` on a playback session becomes real** | Reopens BD-5 only, additively: the `Location` header appears, nothing else moves |

`GATE-8` resolving against the platform plane is explicitly **not** a reopening condition (§5.6, `RO-1` does not
apply): it changes the payload, which is B's, and leaves the identity untouched. Recorded here because "the media
plane changed, so the endpoint should be renamed" is the plausible-sounding move this row exists to refuse.

---

## 8. Verification

Mechanical, for `VER-001` at W5 and for anyone checking this file did what it claims.

| # | Claim | Check |
|---|---|---|
| V-1 | No implementation artefact names the legacy path | `git grep -n "playback-token" -- app server contracts packages` returns nothing (true today) |
| V-2 | No **current** document names the legacy path without marking it superseded | `git grep -n "playback-token" -- docs` returns twenty lines outside this file: the fifteen enumerated in §5.1 and the five handoff lines it excludes. As MG-1 … MG-9 are transcribed the count decreases monotonically to eleven — the four supersession records in MG-12, the two correct quotations in MG-10 and MG-11, and the five permanent handoff lines. Any increase, or any residue outside that set, is a regression |
| V-3 | One spelling, one status, one operation id across contract, server and documents | `server/src/contract.test.ts` already binds every documented operation to a live handler; `oasdiff` in CI from `CTR-007` onward (`docs/architecture/tech-stack.md` T23) |
| V-4 | The decision did not exceed its scope | `git diff --name-status` for this branch lists exactly the two files this slot was asked for, plus the P2 merge. No file owned by another slot is modified |
| V-5 | The `201` and the descriptor body still hold | `server/src/app.test.ts` — status, exact body, and the two negative assertions on media URLs (running today) |

---

## 9. Change log

| Date | Wave · slot | Change |
|---|---|---|
| 2026-08-27 | W2 · P3 | First version. Adjudicated X-19 as binding: `POST /v1/playback/sessions` → `201 Created`, absolute path with the version in the path and no `/api` prefix, no `Location` header, `operationId: createPlaybackSession`, legacy `POST /episodes/{id}/playback-token` `200` recorded as superseded. Stated the protocol basis for a plan slot adjudicating across four owners, and fenced what the decision does not bind. Added three reasons beyond slot A's — module ownership under `INF-009`, plane-independence under `GATE-8`, and the asymmetric cost of deferral — and stated the case for the legacy name and why it loses. Produced the complete twelve-row migration inventory with owner and carrier per occurrence, established that no code changes, gave both forms of the conditional failure-report path, and recorded the conditionality split required by `SR-9`. Registered proposed conflict X-20 (base-path drift across the whole surface) and five consequences for other slots. Fixed the three reopening conditions and excluded `GATE-8` from them |
