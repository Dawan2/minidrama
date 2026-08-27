# W2 Plan Slot P2 — Handoff

> Wave 2 · plan slot P2 (media plane). Branch `cursor/w2-plan-p2-media-plane-d4a6`, created from
> `cursor/w2-work-b-1a8e` (`455e38b`), which is the first place in the repository where all eleven Wave 1
> documentation branches coexist.
>
> **What this slot was asked to do:** product and research now say the BytePlus/VePlayer media plane may be a
> **pilot**, with non-pilot partners keeping their own storage and player until notified, while architecture
> corrections A1–A3 treat VePlayer as mandatory today and the repository skeleton already bans `<video>`
> mechanically. Write the decision record, queue the P2 tasks without taking files from the VePlayer-contracts or
> webhooks slots that are running, register a gate for the account manager, and hand off.
>
> Constraints observed: **plan and documentation only — no application code**, no pull request, no subagents, no CI
> created or weakened, no test removed, no threshold lowered, no gate weakened, no exemption added, no other slot's
> file rewritten, no calendar estimates.

---

## 1. Branch and SHAs

| Item | Value |
|---|---|
| This slot's branch | `cursor/w2-plan-p2-media-plane-d4a6` |
| Base | `cursor/w2-work-b-1a8e` (`455e38b`) |
| Files created | `docs/plan/media-plane-decision.md`, `docs/handoff/w2-plan-p2.md` |
| Files amended | `docs/plan/w2-ready-queue.md` — additively, under the explicit brief |
| Files rewritten | none |

Reproduce the containment claim:

```bash
git diff --name-status cursor/w2-work-b-1a8e HEAD
# expect two 'A' rows and one 'M' row, and nothing else
git diff cursor/w2-work-b-1a8e HEAD -- docs/plan/w2-ready-queue.md | grep '^-' | grep -v '^---'
# expect six removed lines and no more: the §7 GOV-007 row and five §9 self-check rows,
# each replaced in place by a superset of itself. No task row, acceptance criterion,
# owner, dependency or gate is removed.
```

§1.1, §4.7, §6.1 and the additions to §5, §7, §8 and §10 are pure insertions.

---

## 2. Deliverables

| File | Contents |
|---|---|
| `docs/plan/media-plane-decision.md` | Evidence on both sides of `G-R1` as `E-1`…`E-8`; the three mutually exclusive possibilities `H-1`/`H-2`/`H-3` about whether the `<video>` replacement is live and how it is scoped; four options `MP-A`…`MP-D` with the cost of being wrong for each; the adopted default `D-MP-1`; nine fail-closed standing rules `SR-1`…`SR-9`; seven fail-open holes in the current guardrail set with a proposed check each; the listing-time scenario walked row by row; the plane-independent versus plane-dependent split; `GATE-8`; the six-question ask; eleven consequences registered for other slots |
| `docs/plan/w2-ready-queue.md` §1.1, §4.7, §5, §6.1, §7, §8, §9, §10 | Three P2 tasks added to the wave (27 total), four identifiers registered, eleven amendments registered for their owning slots, and the reason the queue could not wait for `PLN-002` |
| `docs/handoff/w2-plan-p2.md` | This file |

---

## 3. The finding this slot exists to handle

`docs/architecture/system-overview.md` §1.1 corrections **A1–A3** state in the present tense that playback must go
through VePlayer, that masters live in BytePlus, and that the platform enforces playability. Everything downstream
descends from that: `PBK-002` withdrawn, `PLY-001` rewritten, the `media-ops` module added, `CTR-011` created, and
`AC-PL-1` made release-blocking. Then the research slot retrieved the One Page in full and found §3's notice of
2026-06-25: the programme is a **pilot**, and **"developers who are not included in the pilot can continue to use
their own solutions"**, with the switchover date to be announced.

Both statements can be true — the public documentation describes the destination, the One Page describes the
rollout. What was missing is that the assumption was **not recorded as an assumption**, had no gate, and had no
carrier task. `docs/handoff/w2-work-b.md` §10 named adjudicating it as "the largest blast radius open"; this slot
did not adjudicate it, because it cannot be adjudicated from any document we hold. It gave it a gate, a default and
a set of rules instead.

### 3.1 The sub-question nobody has asked, which is the useful output

Read literally, the two sources cannot both be operating. If the TikTok client replaced every `<video>` in every
Minis bundle today, a non-pilot developer could not "use their own storage and player" — their player would be
replaced with blocked UI on first render. So exactly one of three things is true: the replacement is not yet live
(`H-1`), it is live but scoped only to reviewed mini-drama episodes rather than to self-hosted media (`H-2`), or it
is live and unconditional and the One Page notice is stale (`H-3`).

Under `H-3` the question collapses and corrections A1–A3 are simply correct. Under `H-1` or `H-2` it is a real
choice. **Nobody in this project has tested which holds**, it is not decidable from any document, and it is
decidable in about ten minutes on a real device. The record therefore carries a fenced experiment (§8.3 of the
decision record) alongside the account-manager ask — fenced because it involves rendering the one element the
entire guardrail set exists to forbid.

### 3.2 The asymmetry that decides it, and it is not an engineering one

Holding the question open costs engineering almost nothing: the client is the same artefact either way and the
playback contract already has the right shape. What is expensive is **content lead time** — ingest is asynchronous
and job-polled, normal-lane moderation takes **two weeks** (the 1–3 working day figure in two repository documents
is the urgent lane, capped at 35 shows per organisation per day, per `W2B-D2`), and playability is a property of
the `(album_id, version)` pair so one rejected episode dark-screens the whole version.

So the launch-critical question is not "can the client use VePlayer" — it already does. It is **"from what date may
our `client_key` put content into BytePlus"**. That reordered the ask: `Q-MP-1` is the ingest date, and pilot
membership is only `Q-MP-2`. It also means the decision with money attached belongs to content operations and
business, not to architecture — architecture is indifferent between `MP-A` and `MP-C`.

---

## 4. Decisions taken by this slot

1. **`D-MP-1`: engineering builds `MP-C`** — VePlayer-shaped client, descriptor contract, media operations
   specified but not implemented, no own-media pipeline, staging bucket only, BytePlus pre-registration started.
   It is adopted on **dominance, not preference**: it produces the same artefact as `MP-A` and additionally does
   not spend effort on an ingest pipeline our `client_key` may not be permitted to call. The distinction between
   the two is not what is built but what is *scheduled*.
2. **`MP-D`, the dual-path option, is rejected in writing.** It is the option that sounds most prudent and is the
   most dangerous: it puts a media element in the bundle, which makes the release-blocking `AC-PL-1` unsatisfiable,
   converts every guardrail from a ban into a ban-with-an-exception, risks the platform's upload code scan, and
   gives every future contributor a legitimate-looking reason to add a second playback path. It buys optionality in
   the one dimension where optionality is worthless — the client work is not what makes an own-media plane
   expensive.
3. **The guardrails are stated as fail-closed rules rather than assumed, and reading them found a live
   fail-open.** `app/tools/cli/check-guardrails.ts` prints `note: app/dist is absent, skipping the bundle scan`
   and **exits 0**. A missing artifact is treated as "nothing to scan" rather than "cannot prove compliance", so
   any CI ordering change, cache miss, or — imminently — `INF-009` moving the tree out from under the hard-coded
   `../../dist` path makes the strongest check in the set stop running while the job stays green. That is item 1
   of the seven in §5.3 of the record; the second is replacing the five-package player ban list with an
   **allow-listed runtime dependency set**, which turns an enumeration into a proof. The rest are the forms a
   regex deny-list structurally cannot see: computed tag names, markup in string literals, media APIs that are not
   `createElement`, and shadow-DOM wrappers.
4. **No guardrail is made conditional on the gate, in either direction (`SR-4`).** If the gate resolves against the
   platform plane, an own-media path is a new deliverable behind a new gate, on its own branch; the mainline keeps
   refusing to contain a media element. This is the rule that makes it safe to leave the question open.
5. **`GATE-8` is registered rather than the question being escalated informally.** The gate model is what the
   protocol uses for things engineering effort cannot move, and this is one. Its "explicitly does not block" column
   names cycle C1 in full so that no W2 task can be read as gated by it.
6. **`GOV-008`/`GOV-009` use the existing `GOV` domain with P2 as primary slot** rather than a new media-plane
   prefix. Every existing `GOV` task is P1's, so this is new — but `GOV` is the governance-and-gates domain and a
   gate registration is exactly that, and `GOV-006` is currently remediating seven colliding namespaces. Adding an
   eighth in the same wave would be poor timing.

---

## 5. `GATE-8`, registered

Full four-element form in `docs/plan/media-plane-decision.md` §7. In brief:

| Field | Value |
|---|---|
| Content | Whether this organisation may use the platform media plane at launch: pilot membership, whether `/v2/sg/shortdrama/*` accepts our `client_key`, whether the `<video>` replacement is live and how scoped, and the switchover terms |
| Blocks | Implementation of BytePlus ingest, moderation submission and listing against real APIs; committing catalogue volume to a dated launch; the drift reconciler against real data; scheduling `CTR-011`'s implementation into a wave |
| Explicitly does not block | **The whole of cycle C1**, and Wave 2 in its entirety — the client build, `PLY-020`, `BRG-004`, `INF-001`, `INF-002`, every contract adjudication including `CTR-009` and `CTR-010`, *writing* `CTR-011`, the `QA-004` gate specifications, every Mock-path task, the entire product IA |
| Release condition | A written answer from the account manager or platform, or a retrieved `S-OP-1`, establishing either pilot membership with an ingest-availability date, or non-membership with the switchover terms and the replacement-behaviour scope. A device probe narrows the gate but does not release it: current client behaviour is not policy |
| Status | `[ ]` not started |

Two properties worth carrying forward. It is **the first gate whose unfavourable resolution creates work** —
`GATE-1`…`GATE-7` all block until released, whereas `GATE-8` resolving against us produces a migration and an
own-media build. And `docs/plan/wave-protocol.md` §6 discipline rule 3 (a gate with no movement for two cycles is
escalated to a risk with an alternative) should be read as already applying: the alternative is `MP-B`, and it
should be priced before it is needed rather than during a launch slip.

**Adoption is proposed, not applied.** The authoritative gate table is `docs/plan/wave-protocol.md` §6 (P3) and the
register is `docs/plan/w1-conflict-register.md` §7 (P1). Both are recorded as `P2-MP-6` and `P2-MP-7`.

---

## 6. The ask, and why it is ordered the way it is

Six questions in `docs/plan/media-plane-decision.md` §8.2, each written to be answerable in one sentence and
forwardable verbatim. In priority order: the **ingest availability date** (`Q-MP-1`), pilot membership
(`Q-MP-2`), whether the `<video>` replacement is live and how scoped (`Q-MP-3`), whether pre-listing review assumes
VePlayer (`Q-MP-4`), the concrete switchover terms (`Q-MP-5`), and what the migration ticket actually grants
(`Q-MP-6`).

Three things about the ask are worth surfacing rather than leaving in the record:

- **The prerequisite is the relationship itself.** `G-R20` records that we do not know whether an account-manager
  relationship exists. Establishing one is the same prerequisite as `GATE-6` and as retrieving `S-OP-1`, so a
  single business action unblocks three separate items.
- **One document beats all six questions.** `S-OP-1` (短剧媒资库和播放器接入说明) is what the One Page §3 defers to and
  plausibly answers `Q-MP-1`, `Q-MP-2` and `Q-MP-5` without a conversation. It is already the top item in
  `docs/handoff/w2-work-b.md` §10's next-capture list.
- **One action is available today with no answer needed.** Pre-registering BytePlus account information (One Page
  §3) is free, useful if we are admitted, harmless if we are not, requires no engineering, and may surface
  `Q-MP-1`'s answer as a side effect.

---

## 7. What this slot did **not** take, and why

The brief named two running slots — VePlayer contracts and webhooks — and told this slot not to take their files.
It did not. The mechanism was to keep every consequence for them in a register with an *in flight* marker, which
the repository already uses (`docs/handoff/w2-work-b.md` §5 does the same thing for twelve statements).

| Not touched | Believed owner | What this slot did instead |
|---|---|---|
| `docs/12-api-contracts.md`, `docs/12-domain-model.md`, `docs/12-error-catalog.md`, `contracts/` | VePlayer-contracts / webhooks slots (`CTR-009`…`CTR-013`) | `P2-MP-3` and `P2-MP-4` are inputs in `docs/plan/w2-ready-queue.md` §6.1, marked *in flight*, for the owning slot to accept or reject in its own handoff |
| `docs/design/player-state-machine.md`, `docs/design/minis-integration.md` | slot A (`PLY-020`, `BRG-004`) and the webhooks slot | `P2-MP-5` is an input, same treatment |
| `docs/14-quality-gates.md`, `docs/14-security.md` | slot C (`QA-004`) | `P2-MP-1` and `P2-MP-2` specify six additional build checks; slot C writes them. This slot wrote no gate configuration and no lint rule |
| `docs/architecture/*`, `docs/plan/wave-protocol.md`, `docs/plan/backlog.md`, `docs/plan/w1-conflict-register.md` | P3 and P1 | `P2-MP-6`…`P2-MP-9`, `P2-MP-11` are registered for their owners |
| `app/`, `server/`, `packages/`, `.github/`, `infra/` | slots A and C | Nothing. This is a plan slot and the brief said plan and docs only |

`docs/plan/w2-ready-queue.md` is P1's file and **was** amended, because the brief said to. The amendment is
additive: §§2–4.6 are byte-identical, no task changed owner, wave, dependency, target file, acceptance criterion or
gate, and the change log carries a row saying so.

---

## 8. Explicitly not done

- **No adjudication of `G-R1`.** It cannot be adjudicated from any document in the repository. A slot that
  "decided" it would be inventing an answer, and the expensive failure mode here is a confident wrong answer, not
  an open question with a default.
- **No application code, no lint rule, no CI, no gate configuration.** §5.3 of the record is a specification handed
  to slot C, not an implementation. The `<video>` ban was read from `cursor/w1-repo-skeleton-e7c9` (`322bf9b`) and
  not modified — note that head has moved since `docs/handoff/w2-work-b.md` §8 recorded it at `abfc664`.
- **No `<video>` written anywhere**, including in examples. The fenced device experiment in §8.3 of the record is a
  proposal with three conditions attached, on a branch that is never merged; nothing in this slot's output relaxes
  a guardrail to accommodate it.
- **No exemption, no threshold change, no test removed, no gate weakened.** Two registered amendments make the
  build gates stricter; `SR-4`, `SR-5` and `SR-6` close paths that were previously convention only.
- **No pull request, no merge to `main`, no subagents.**
- **No identifier renames.** `SR-*`, `MP-*`, `D-MP-*`, `H-*`, `E-*`, `Q-MP-*` and `P2-MP-*` are new namespaces
  introduced by this slot; `GOV-006`'s remediation pass should check them, and the record says so.
- **No attempt to contact the platform, TikTok, or any external party.** The ask is written for a human to send.
- **No calendar estimates.** The durations quoted — two weeks' normal moderation, 35 urgent submissions per
  organisation per day, 15–30 US business days for EIS — are platform-published figures, not effort estimates.

---

## 9. Verification performed on this slot's own output

| # | Check | Method | Result |
|---|---|---|---|
| 1 | The amendment to P1's queue is additive | `git diff` of `docs/plan/w2-ready-queue.md`; every removed line reappears inside its replacement | Pass — no task row deleted, no acceptance criterion edited |
| 2 | No file owned by a running slot is touched | `git diff --name-status` against the base | Pass — two additions and one modification, and the modification is the file the brief named |
| 3 | Every claim about the existing guardrails was read from source | `eslint.config.js`, `app/tools/bundle-scan.ts`, `app/tools/source-rules.ts`, `docs/handoff/w1-skeleton.md` read at `322bf9b` | Pass — the five banned player packages, the AST selectors, the seven bundle-scan rules and mock decision `S2` are quoted as found |
| 4 | The seven fail-open forms are genuinely not caught today | Each traced through the actual rule set rather than assumed | Pass — the AST selector matches only a literal `createElement` argument and a JSX element name; the bundle regexes match `createElement('video')` but no markup string, no computed tag and no unlisted package; `html-integrity.ts` omits `source` and is applied to two known documents; and the CLI's `existsSync(distDir)` branch exits 0 with a note when the artifact is absent |
| 5 | Every quotation is traceable to a source document and section | `E-1`…`E-8` each carry one | Pass. The One Page quotations are second-hand through `docs/research/one-page-feishu.md` and are labelled as transcriptions, not as primary reads |
| 6 | `GATE-8` has all four required elements | Compared against the form `GOV-005` established for `GATE-7` | Pass |
| 7 | The gate blocks nothing in W2 | Walked all 27 queue tasks against `GATE-8`'s blocks column | Pass — none of the 27 implements ingest, listing or moderation submission; `CTR-011` is specification and is explicitly excluded |
| 8 | New identifiers do not collide | Checked `GOV-008`, `GOV-009`, `IA-004`, `IA-005`, `GATE-8`, `SR-*`, `MP-*`, `P2-MP-*` against the backlog's 142 IDs, the queue's 15, and the seven collisions `N-1`…`N-7` | Pass. Flagged for `GOV-006`: this slot adds six new prefixes, and the research slot already added `G-R*` and reused `F-n` without registration |
| 9 | Nothing lowers a threshold, removes a test, weakens a gate or adds an exemption | Review of every rule and amendment | Pass — `P2-MP-1`, `P2-MP-2`, `SR-5` and `SR-6` are strictly stricter; `SR-7` removes an implementation from the schedule, not a check from the build |
| 10 | Cross-references resolve | Every `docs/**` path and every task, gate, risk, gap and criterion identifier cited was checked for existence | Pass — one deliberate exception: `S-OP-1`, `S-OP-2` and `S-OP-3` are named Lark documents that are not in the repository, which is the point of citing them |
| 11 | The correction in §6.3 of the record is fair to the slot it corrects | Re-read `docs/handoff/w2-work-b.md` §7 | Pass — the claim is right about the endpoint and overstated about the payload, and the record says exactly that rather than treating it as an error |

---

## 10. Suggested next work

1. **Business, and it is the only thing that releases `GATE-8`:** establish the account-manager relationship, then
   send the six questions in `media-plane-decision.md` §8.2 — leading with the ingest date, not with pilot
   membership. Start the BytePlus pre-registration in parallel; it needs no answer and no engineering.
2. **Whoever runs the next One Page capture pass:** `S-OP-1` is now the highest-value unretrieved document in the
   project, ahead of `S-OP-11` and `S-OP-14`, because it plausibly closes `GATE-8` without a conversation. The
   method is in `docs/research/sources.md` §5, and the page header read "Modified Today", so it has a shelf life.
3. **Slot C, in `QA-004`, and this one is not media-plane-conditional at all:** take `P2-MP-1` and `P2-MP-2`. Do
   the `app/dist`-absent exit path first — a check that reports success when it did not run is worse than no check,
   because it is believed — and do it before `INF-009` moves the artifact path rather than after. The dependency
   allow-list is second, and it is cheapest before the dependency set grows.
4. **Slot A, on a preview build:** the device probe in §8.3 of the record, under its three conditions. It
   distinguishes `H-1`/`H-2` from `H-3` in minutes and it is the only evidence available to us without an external
   reply. Record the client version and OS with the result, or the result is not reusable.
5. **P3, in the gate table and the architecture set:** adopt `GATE-8` (`P2-MP-6`); add the conditionality note to
   corrections A1–A3 (`P2-MP-8`) — they are not wrong, but reading as present-tense fact is how the pilot notice
   went unnoticed for a whole wave; and consider `SR-4` and `SR-6` for §8's constant prohibitions (`P2-MP-11`).
6. **P1, at `PLN-002`:** four identifiers and eleven amendments to write back, plus the `GOV`-with-P2-primary
   precedent to confirm or reassign.
7. **A standing item for this project's registers, addressed to `VER-001`:** `G-R1` reached Wave 2 with no gate and
   no carrier because it was recorded as a *gap in a research file* rather than as an assumption in the documents
   that depend on it. `SR-9` — conditionality is stated in place, in the sentence that makes the claim — is the
   general form of the fix, and it is worth applying beyond the media plane.
