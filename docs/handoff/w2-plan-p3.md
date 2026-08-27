# W2 Plan Slot P3 — Handoff

> Wave 2 · plan slot P3 (architecture and execution protocol). Branch `cursor/w2-plan-p3-477e`, based on
> `cursor/w2-work-a-71b2` (`3c5fb84`) with `cursor/w2-plan-p2-media-plane-d4a6` (`0f1908c`) merged in. Date
> 2026-08-27.
>
> Assignment: adjudicate conflict **X-19**, the playback endpoint naming, and hand off. Constraints observed: no
> pull request, no subagents, no server implementation, no rewrite of slot A's player state machine or playback
> contract, no file owned by another slot modified, no test removed, no threshold lowered, no gate weakened, no
> calendar estimates.

---

## 1. Deliverables

| # | Deliverable | File | Status |
|---|---|---|---|
| 1 | The binding X-19 decision, with the migration inventory | `docs/plan/x19-playback-endpoint.md` | done |
| 2 | This handoff | `docs/handoff/w2-plan-p3.md` | done |

Two files. Nothing else on this branch is authored by this slot; everything else arrived through the P2 merge in §2.

**The decision, in one line:** `POST /v1/playback/sessions` → `201 Created`, absolute path with the version in the
path and no `/api` prefix, no `Location` header, `operationId: createPlaybackSession`;
`POST /episodes/{episodeId}/playback-token` `200` is superseded and recorded rather than deleted. Binding across all
four owning slots. Reasons, scope fence and the twelve-row migration inventory are in
`docs/plan/x19-playback-endpoint.md` §1, §4 and §5.

---

## 2. Branch, bases and what was read

| Item | Value |
|---|---|
| This slot's branch | `cursor/w2-plan-p3-477e` |
| Base | `cursor/w2-work-a-71b2` (`3c5fb84`) — carries `docs/design/playback-contract.md`, the file that raised X-19, plus P1's ready queue and conflict register through its own base `cursor/w2-plan-p1-0453` (`fc39e3e`) |
| Merged in | `cursor/w2-plan-p2-media-plane-d4a6` (`0f1908c`) — additive, zero conflicts. Brings `docs/plan/media-plane-decision.md`, the P2 queue amendment, and `docs/handoff/w2-work-b.md` |
| Read, **not** merged | `cursor/w1-repo-skeleton-e7c9` (`322bf9b`), `cursor/w2-work-c-5101` (`a3a3615`), `cursor/w2-work-e-1aaa` (`9de8c2b`) — the running code, cited by branch and SHA |
| Concurrent, untouched | `cursor/w2-work-a-71b2`, `cursor/w2-work-b-1a8e` (`455e38b`) |

**Why P2's branch was merged.** `SR-9` in `docs/plan/media-plane-decision.md` §5 obliges every slot to state
media-plane conditionality *in place*, and `SR-4` forbids weakening a guardrail in either direction. Those rules bind
this decision's text, and `docs/plan/x19-playback-endpoint.md` §5.6 discharges them explicitly. Citing a rule set
that was not on the branch would have left the file's central conditionality claim dangling — the same reasoning
slot A used for the research branch. The merge is additive: three new files and one additive amendment to a P1 file
already amended by P2, no modifications by this slot.

**Why the code branches were not merged.** They are in flight — the catalog and guardrail work is live on
`cursor/w2-work-c-5101` and `cursor/w2-work-e-1aaa` — and a docs-only plan slot taking a snapshot of a moving code
branch creates exactly the divergence the one-file-one-owner rule exists to prevent. Every claim about the code was
verified against the branch and is cited with file and line: `docs/plan/x19-playback-endpoint.md` §3 E-4 and the
three load-bearing tests below it.

---

## 3. Key decisions taken by this slot

1. **The endpoint is `POST /v1/playback/sessions` returning `201`.** Slot A adjudicated the substance first and
   correctly; this slot made it binding across four owners and gave the transcribers one citation. Slot A's three
   reasons are restated rather than referenced, and three new ones added: the path maps to the module that owns the
   route under `INF-009`'s fourteen-module map; endpoint identity is plane-independent under `GATE-8` while the
   payload is not, so naming the endpoint after a payload field couples the durable half of the contract to the
   fragile half; and the cost of deferral is asymmetric and already quantified — eight path literals now versus a
   generated client method and every compile-time consumer from `CTR-008` onward.
2. **P3 is the adjudicator, and the decision lives in its own file.** X-19 spans documents owned by B, P2, P1, P3 and
   A, so no owning slot can settle it without rewriting another's file. The tie-break is that a *convention* is
   adjudicated by the slot owning its canonical statement: X-15 makes `docs/architecture/*` canonical and P3 its
   adjudicator, X-16 makes the ownership table P3's, and `INF-009` — P3's own task this wave — freezes the module map
   that the path shape follows from. Reasoning in full in `docs/plan/x19-playback-endpoint.md` §2.
3. **The scope is a name, and the fence is written down.** The descriptor's fields, `playbackSessionId`, the `kind`
   discriminant P2 recommends, the failure status codes and the rate-limit numbers are all slot B's at `CTR-009`,
   `CTR-010` and `CTR-012`. §1.2 of the decision lists each with its owner and carrier so that "X-19 decided it" can
   never be used to short-circuit B's adjudication.
4. **`201` does not depend on slot B keeping `playbackSessionId`.** The status describes what the server did — it
   recorded a metered, rate-limited play attempt and, on the legacy cohort, caused a platform-side `play_token`
   fetch — not what it chose to disclose. The running skeleton already returns `201` with an anonymous body. This
   matters because it decouples a decision that had to be made now from one that is legitimately still open.
5. **The `Location` header is deliberately absent.** There is no `GET` on a playback session; per RFC 9110 §15.3.2
   the created resource is then identified by the target URI. Advertising a URI we do not serve is worse than
   omitting the header, and adding a `GET` later is additive — recorded as reopening condition `RO-3`.
6. **The migration is documents-only, and that is the point.** All ten occurrences in the running code already spell
   the adopted name, at `322bf9b` and still at `9de8c2b`. Adopting the legacy name would have been the churn.
   Verified by `git grep -n "playback-token" -- app server contracts packages`, which returns nothing.
7. **The case for the legacy name is stated and answered rather than ignored** (`docs/plan/x19-playback-endpoint.md`
   §4.1). The 4:2 artefact count is transcriptions of one Wave 1 statement, not independent evidence; the REST
   nesting convention does not apply because a play attempt belongs to the viewer and not to the episode; and the
   `episodeId`-in-path argument buys nothing against a `no-store`, non-idempotent response whose rate-limit bucket is
   keyed on `userId`.
8. **`GATE-8` is explicitly excluded as a reopening condition.** "The media plane changed, so the endpoint should be
   renamed" is the plausible-sounding move that `RO-1`…`RO-3` exist to refuse. If the gate resolves against the
   platform plane the payload changes, which is B's subject; the identity does not.

---

## 4. Conflict register

Per `docs/plan/wave-protocol.md` §3.4: found while adjudicating, owned by someone else, not touched.

| # | Item | Documents | Recommended resolution | Adjudicator | Carrier |
|---|---|---|---|---|---|
| **X-20** *(proposed)* | **Base-path and version-prefix drift across the whole HTTP surface.** `docs/12-api-contracts.md` line 14 declares Base URL `https://api.<domain>/api/v1` and writes every path relative to it; `docs/03-tech-architecture.md` lines 53 and 173 use `/api/v1/...`; `docs/11-api-and-bridge.md` line 212 uses `POST /api/webhooks/tiktok-pay`, versionless; the running server registers `/v1/auth/login`, `/v1/playback/sessions`, `/v1/payments/callbacks/tiktok` and an unversioned `/health` against an OpenAPI `servers` entry with no base path | Version in the path, no `/api` segment, operational endpoints outside the versioned surface — which is what runs today. Offered as input, not as a decision | **B**, with P3 counter-signing the namespace convention | `CTR-007` (W3) for the contract, `GOV-006` for the document set |
| `P3-X19-1` | `CTR-009`'s acceptance criterion in `docs/plan/w2-ready-queue.md` §4.1 item 2 still names the superseded path | that line | Name the adopted path | **P1** | `GOV-006` |
| `P3-X19-2` | The conflict ledger needs the X-19 row, recorded as **decided** with `docs/plan/x19-playback-endpoint.md` as the carrier | `docs/plan/w1-conflict-register.md` §6.2 | Add the row; line 82's A4 row is a correct quotation of the superseded statement and needs no change | **P1** | `GOV-006` |
| `P3-X19-3` | `docs/design/playback-contract.md` §2 calls X-19 "proposed" and invites renumbering. It is decided and the number is fixed | that section | One-line pointer, optional. The file is already correct on the substance | **A** | A's next wave |
| `P3-X19-4` | `docs/design/api-contracts.md` line 547 labels the rate-limit bucket 播放令牌签发 and carries a concurrent-stream ceiling that `docs/design/playback-contract.md` §7.3 records as having no subject | that line | Rename to descriptor issuance; reconcile the ceiling against §7.3 | **B** | `CTR-012` |
| `P3-X19-5` | `docs/00-wave-plan.md` line 48: W10's theme and deliverable are named after the token | that line | Rename; the wave's subject survives | **P1** | `PLN-002` |
| `P3-X19-6` | An ownership row is owed for `docs/plan/x19-playback-endpoint.md`, claimed as **P3** on the same footing that gives P1 the files its own pass created and P2 `media-plane-decision.md` | `docs/plan/w2-ready-queue.md` §2 | Add when P3 adopts or amends the table under X-16, or at `PLN-002`, whichever comes first | **P3**, table owned by P1 until adopted | `GOV-006` / X-16 |

The full inventory of legacy-path occurrences, with owner and carrier per occurrence, is
`docs/plan/x19-playback-endpoint.md` §5.1 — twelve rows, of which ten are transcriptions by the file's own owner and
two are P3's own.

---

## 5. Blockers and open items

| # | Item | Effect | Owner |
|---|---|---|---|
| 1 | **`INF-009` is still open.** It is P3's tier-0 task for this wave and it was not this slot's assignment. Slot A's counter-signature is already banked (`docs/handoff/w2-work-a.md` §3, including the recommendation that `INF-001` be reduced to adopting the skeleton's existing tree); slot B's is outstanding | Blocks `INF-001` and `INF-002`, and carries two of X-19's own migration rows (MG-8) | **P3** + A + B |
| 2 | `GATE-8` — BytePlus/VePlayer pilot versus generally available — is `[ ]` not started | Does **not** block X-19 (`docs/plan/x19-playback-endpoint.md` §5.6) and, per `docs/plan/media-plane-decision.md` §7, does not block Wave 2 at all. It does decide the descriptor payload at `CTR-009` | Business, P2 holds the record, P3 holds the gate table |
| 3 | `GATE-0` / the Feishu One Page is still authenticated-only; the sharpened ask is `S-OP-1` and `S-OP-2` by name | The only remaining source of unknown constraints that could invoke reopening condition `RO-1` | Business |
| 4 | X-20 (§4) is unadjudicated | It is every endpoint, not one, and it becomes generated code at `CTR-008`. BD-3 fixes the playback endpoint's full path in the meantime, so nothing in W2 is blocked | B, with P3 counter-signing |
| 5 | The gate-table amendments `GOV-005` proposes, and the X-16 ownership-table adoption | Both are P3's remaining W2 adjudications per `docs/handoff/w2-plan-p1.md` §"Slot P3" | **P3** |

Items 1 and 5 are this slot's own unfinished W2 scope, recorded so the next P3 pass does not have to rediscover
them. Nothing in X-19 depends on either.

---

## 6. Interfaces for the other slots

**Slot B — the largest consumer.** Five of the twelve migration rows are yours. At `CTR-009`, transcribe slot A's
`docs/design/playback-contract.md` §1 into `docs/12-api-contracts.md` §4.4 using the name in
`docs/plan/x19-playback-endpoint.md` §1.1 rather than the one in your own acceptance criterion — `P3-X19-1` exists
because that criterion is wrong about the name and right about everything else. Three things remain **yours** and X-19
does not touch them: whether `playbackSessionId` survives, whether the descriptor takes P2's one-member discriminant
(`P2-MP-3`), and the failure status codes. If you reject `playbackSessionId`, use the sibling-collection form of the
failure-report path in §5.3 — both forms live under `/v1/playback/`, so nothing else moves. At `CTR-007`, BD-6 fixes
`createPlaybackSession` as the generated method name before `CTR-008` generates from it. X-20 is yours to adjudicate,
and it is bigger than X-19.

**Slot A.** Nothing is required of you and nothing of yours was modified — `docs/design/playback-contract.md` and
`docs/design/player-state-machine.md` are untouched on this branch, by diff and not by intention (§7 check 3). Your
§2 adjudication is upheld in substance and in every particular, including `201` and the `no-URL` invariant. The only
optional item is `P3-X19-3`, a one-line pointer. Two things you flagged are now settled in your favour by a slot that
owns the canonical form: the endpoint name, and the statement that it must be settled before `CTR-007`.

**Slot C.** No new gate and no new check. The three tests that make X-19 verifiable already exist and should be
adopted rather than re-specified: `server/src/contract.test.ts` binding every documented operation to a live handler,
`server/src/app.test.ts` asserting `201` plus the two negative assertions on media URLs, and the raw-body scope test
in `server/src/modules/platform-tiktok/webhook-routes.test.ts` that uses the playback path as its control. `V-1` and
`V-2` in §8 of the decision are `git grep` invariants cheap enough to run in CI if you want them there.

**Slot P1.** Four items, all in §4: `P3-X19-1` (the `CTR-009` criterion, the one worth doing first — a task whose
acceptance criterion contradicts its purpose will be satisfied literally by someone in a hurry), `P3-X19-2` (the
X-19 row in the ledger, recorded as decided), `P3-X19-5` (the W10 wave-plan name), and `P3-X19-6` (the ownership row,
which P3 will take at the X-16 pass unless you prefer it in `GOV-006`). X-19 is the first conflict in the register
resolved by a plan slot writing a decision record rather than by editing a document; if that pattern should be named
in the protocol, `PLN-002` is the place and P3 will write it.

**Slot P2.** Two of your rows now have a settled name to transcribe: `docs/02-user-journeys.md` lines 70 and 78 and
`docs/02-screen-inventory.md` line 97, at `IA-001`. Line 78's prose 换取播放令牌 stops being true on modern clients,
not just the path. Your `SR-9` obligation is discharged in `docs/plan/x19-playback-endpoint.md` §5.6, which splits
this decision into a plane-independent part (all of it) and the plane-dependent payload (B's), and §6.1 of your own
record is cited as the authority for the first half.

**Verification slot at W5 (`VER-001`).** `docs/plan/x19-playback-endpoint.md` §8 has five checks, four of which are
mechanical today. The one worth checking independently is `V-2`: the count of documents naming the legacy path
without a supersession marker must strictly decrease wave over wave and converge on the MG-12 rows plus the five
handoff lines, which are deliberately permanent.

---

## 7. Explicitly not done

- **No server implementation, and no code of any kind.** No file under `app/`, `server/`, `packages/`, `contracts/`,
  `infra/` or `.github/` was created or modified. The catalog and guardrail work in flight on
  `cursor/w2-work-c-5101` and `cursor/w2-work-e-1aaa` needs no rebase and no branch surgery: the name they build
  against is the name that is now binding.
- **Slot A's player state machine and playback contract were not rewritten**, not edited, and not superseded. Both
  are unchanged on this branch.
- **No other slot's file was modified.** `docs/12-*`, `docs/02-*`, `docs/00-*`, `docs/01-*`, `docs/11-*`,
  `docs/14-*`, `docs/design/*`, `docs/product/*`, `docs/research/*`, `docs/engineering/*`,
  `docs/plan/w2-ready-queue.md`, `docs/plan/w1-conflict-register.md`, `docs/plan/backlog.md` and
  `docs/plan/media-plane-decision.md` are all untouched by this slot. Every change they need is a registered row with
  an owner.
- **`docs/03-*` and `docs/architecture/*` were not opened**, although they are P3's own. The playback sentences in
  `docs/03-tech-architecture.md` §2 and §6 ride with `INF-009`'s edit or the W6 consolidation, for the reason in
  `docs/plan/x19-playback-endpoint.md` §5.5 — a file whose scheduled freeze covers different sections should not be
  half-frozen in a wave where `INF-001` is waiting on it.
- **`INF-009` was not executed**, nor were the `GOV-005` gate amendments or the X-16 ownership-table adoption. All
  three are P3's remaining W2 scope and are recorded in §5.
- **The ownership table was not edited** to add this file's row. It is P1's until P3 adopts it under X-16, so the
  claim is registered as `P3-X19-6` rather than taken.
- **The descriptor payload was not adjudicated.** Not P3's, at any point, in any wave.
- **No pull request, no merge to `main`, no subagents, no CI change, no calendar estimates.**

---

## 8. Self-check

| # | Check | Result |
|---|---|---|
| 1 | X-19 is settled with a single binding decision, not a recommendation | Pass — `docs/plan/x19-playback-endpoint.md` §1.1 is seven bound items with a stated obligation on transcribers (§2) and three fixed reopening conditions (§7). The word "recommended" appears in that file only for items belonging to other slots |
| 2 | The decision's authority is derived from the protocol rather than asserted | Pass — §2 derives it from `wave-protocol.md` §3.1/§3.4 plus X-15, X-16 and `INF-009`, and states the deadlock that makes an owning-slot adjudication impossible |
| 3 | No file owned by another slot was modified | Pass — verified by diff, not intention. `git diff --name-status cursor/w2-work-a-71b2..HEAD` lists the two files this slot authored plus the four brought in by the P2 merge, and none of the four is modified by this slot |
| 4 | Every claim about the running code was verified against the branch at a stated SHA | Pass — `contracts/openapi.yaml` line 33 and `operationId` line 35, `server/src/modules/playback/routes.ts` line 30, `server/src/app.test.ts` lines 38/42/55/73/84, `server/src/contract.test.ts` line 78, `server/src/modules/platform-tiktok/webhook-routes.test.ts` line 420, `app/src/routes/PlayPage.tsx` line 15, the `servers:` entry with no base path, and the three registered route paths `/health`, `/v1/auth/login`, `/v1/payments/callbacks/tiktok`, all read at `9de8c2b` |
| 5 | Every cited section anchor and line number resolves | Pass — checked by grep against every cited file on this branch, including the Chinese documents. `docs/plan/w2-ready-queue.md` line numbers are quoted **post-P2-merge**, which is the state of this branch; §8 there is the critical-path section that names `CTR-009` as the wave's highest-cost delay |
| 6 | The migration inventory is complete, not illustrative | Pass — `git grep -n "playback-token" -- docs` returns twenty lines outside this slot's own two files, and all twenty are accounted for: fifteen enumerated line by line across the twelve rows of `docs/plan/x19-playback-endpoint.md` §5.1, and five in handoff documents which §5.1 excludes by rule. The three `/api/`-prefix occurrences that this pattern does not catch are recorded separately as E-5 and X-20 |
| 7 | Nothing lowers a threshold, removes a test, weakens a gate or adds an exemption | Pass — no gate is touched; three existing tests are named as the decision's verification and none is modified; `SR-4`'s monotone ratchet is respected because nothing in a naming decision relaxes a guardrail; `GATE-8` is excluded as a reopening condition, which is a tightening, not a relaxation |
| 8 | `SR-9`'s conditionality obligation is discharged in place | Pass — `docs/plan/x19-playback-endpoint.md` §5.6 splits the file into plane-independent (BD-1…BD-7 and all six reasons) and plane-dependent (the payload, B's), citing `media-plane-decision.md` §6.1 and §6.2 for both halves |
| 9 | The decision does not exceed its scope | Pass — §1.2 lists six questions X-19 does *not* answer, each with owner and carrier, and X-20 is registered rather than decided even though it was found by the same analysis and is larger |
| 10 | Open questions are marked rather than guessed | Pass — `RO-1`…`RO-3`, X-20, and the six items in §5 each state what they affect and who owns them. Nothing unknown was implemented as a default |

---

## 9. Suggested next work

1. **P1, cheapest and highest value:** `P3-X19-1`. `CTR-009`'s acceptance criterion currently instructs slot B to
   write the superseded name into the file X-19 exists to fix.
2. **Slot B:** transcribe `CTR-009` against `docs/design/playback-contract.md` §1 and
   `docs/plan/x19-playback-endpoint.md` §1.1, then decide the three payload questions that are genuinely yours. Then
   adjudicate X-20, which is the same class of error at ten times the surface area and is still cheap only until
   `CTR-007`.
3. **P3's own remainder:** `INF-009` — B's counter-signature is the one thing missing and slot A's is already
   written — then the X-16 ownership table (including `P3-X19-6`) and the `GOV-005` gate amendments. The `docs/03-*`
   consolidation stays W6.
4. **Business, unchanged and still the only question that can invalidate a specification rather than refine it:**
   `GATE-8`, asking for `S-OP-1` and `S-OP-2` by name.
