# W2 Plan Slot P1 — Handoff

> Wave 2 · plan slot P1 (verify Wave 1 outputs, queue Wave 2 work). Branch `cursor/w2-plan-p1-0453`, created from
> `cursor/w1-product-ia-9cd1` (`bcfa5ee`).
>
> Constraints observed: no subagents, no pull request, no CI created or weakened, no test removed, no threshold
> lowered, no other slot's file rewritten, no application code written. All output is Markdown under `docs/`.

---

## 1. Branch and SHAs

| Item | Value |
|---|---|
| This slot's branch | `cursor/w2-plan-p1-0453` |
| Base | `cursor/w1-product-ia-9cd1` (`bcfa5ee`) |
| Merged in | `cursor/w1-technical-design-docs-8a32` (`4c73e5e`), `cursor/w1-plan-p3-e16a` (`580e46b`) — octopus, zero file conflicts |
| Transitively present | `cursor/w1-architecture-bed5` (`3692cf5`), `cursor/w1-plan-p3-1d0f` (`3c2b296`), `cursor/w1-plan-p1-1d0f` (`2eedf89`), `cursor/w1-plan-p2-1d0f` (`07cd250`), `cursor/w1-work-a-1d0f` (`f42a67f`), `cursor/w1-work-b-1d0f` (`71d27fe`), `cursor/w1-work-d-1d0f` (`ef9fba5`) |
| Baseline | `main` (`fc1333f`, README only) |

This branch is the first place in the repository where all ten Wave 1 branches coexist. If the integrator wants one
collection point for the Wave 1 baseline, this is it.

The brief named a research slot and a skeleton slot as possibly still in flight. Neither exists on the remote:
`git ls-remote --heads origin` returns exactly the ten Wave 1 branches plus `main`. Nothing was waited for, and no
placeholder was left for them — if they appear, their findings enter through the same conflict register.

---

## 2. Deliverables

| File | Contents |
|---|---|
| `docs/plan/w1-conflict-register.md` | Verification of the Wave 1 self-check claims (VF-1 … VF-13); the full blast radius of corrections A1–A6 (COR-1…COR-6) across every document and task still asserting the superseded version; owners and carriers for the 23 design deltas DM-1…DM-6, PS-1…PS-5, D-AC-1…D-AC-7, MI-1…MI-5; the conflict ledger carried forward as X-01…X-12 plus six new conflicts X-13…X-18; seven identifier-namespace collisions N-1…N-7; the EIS gate and five other gate amendments; the Feishu One Page access boundary and the request package that would close it; 61 open items with owner and target wave |
| `docs/plan/w2-ready-queue.md` | The authoritative W2 execution queue: 24 tasks with owner slot, dependencies, target file, reproducible acceptance criterion and gate; the file-ownership table extended to the three previously unowned documentation trees; 15 new identifiers registered for backlog write-back; 14 amendments to already-planned tasks including one withdrawal and one rewrite; the critical path out of W2; a nine-point self-check |
| `docs/handoff/w2-plan-p1.md` | This file |

---

## 3. What was verified, and what it cost

The Wave 1 slots' own self-checks were re-derived rather than trusted. They hold: `docs/plan/backlog.md` really does
contain 142 tasks with 142 unique identifiers and 258 dependency edges with nothing dangling;
`docs/product/acceptance-criteria.md` really does contain 67 criteria, 14 of them release-blocking; journeys J1–J24
and amendments PA-1…PA-10 are complete and their cross-references resolve. The sampled cross-document references —
`docs/02-information-architecture.md` §10, `docs/12-api-contracts.md` §4.4, `docs/14-quality-gates.md` §5.4,
`docs/11-official-onboarding-checklist.md` A1–A5 and C1–C17 — all exist as cited.

What the octopus merge could not show is the interesting part. Every Wave 1 slot obeyed the rule against editing
another slot's file, so the merge was conflict-free — and every contradiction between them is therefore semantic and
invisible to git. There are eighteen of them. Three matter enough to have reordered the wave:

**The playback contract has no owner and no task.** Correction A4 changed `POST /episodes/{id}/playback-token` from
a signed URL plus quality ladder to a playback descriptor. `docs/12-api-contracts.md` §4.4 still describes the old
shape, and `CTR-007` at W3 would have transcribed it into `contracts/openapi.yaml`, after which `CTR-008` would have
generated types from it and every server task in cycle C3 would have compiled against them. The error would have
surfaced in cycle C3 as a player that cannot be built. `CTR-009` is now the second task in the wave.

**`INF-001` could not have started.** Two documents specify two repository layouts and two backend module maps —
nine modules in `docs/03-tech-architecture.md` §4.1 versus fourteen in `docs/architecture/tech-stack.md` §7 — and
`INF-001`'s acceptance criterion points at the nine-module version, which has no `media-ops` module and defines
`playback` as issuing CDN signed URLs. `INF-009` freezes the fourteen-module map first.

**The technical-design set is written against the wrong player.** `docs/design/player-state-machine.md` is a careful
formal specification of a `<video>` plus hls.js player with a signed-URL token lifecycle and a client-driven quality
ladder — none of which exists under VePlayer. It is also the only formal specification `docs/14-test-plan.md` §1.1
has to test against, so it cannot simply be marked superseded. `PLY-020` restates it, keeping what survives: the
`locked` / `suspended` / retryable-versus-terminal state distinctions, the eleven invariants, the rule that
`errorTerminal` has no outgoing edge, and the property-testing approach.

---

## 4. Key decisions taken by this slot

1. **`docs/architecture/` becomes canonical and `docs/03-*` becomes a summary.** Two canonical architectures is the
   root cause of X-13 and X-15 and would have produced a third disagreement in every subsequent wave. The
   architecture set is the one checked against English platform documentation and the one carrying the correction
   registry, so it wins. Nothing is deleted: superseded statements become correction rows, which is the convention
   `docs/architecture/system-overview.md` §1.1 already established.
2. **The fourteen-module backend map is adopted.** It is the only one containing `media-ops`, which corrections
   A2 and A3 make mandatory, and its `playback` module is not defined in terms of an enforcement mechanism that no
   longer exists.
3. **PS-4 is rejected rather than deferred.** The proposal to add `defaultQuality` and `freeEpisodeMaxQuality` to
   `GET /config` was a good answer to a real cost problem, but A1 removed the delivery mechanism — definition is a
   VePlayer concern now. The proposal is closed and the underlying cost guardrail is re-raised as `GOV-007` against
   BytePlus-side controls, so the concern is not lost with the mechanism.
4. **`CTR-011`, the media-operations contract surface, is deliberately kept off the main contract path.** It is the
   largest new piece of specification in the wave, and nothing in cycles C1 through C5 depends on it. Letting it
   gate `CTR-007` would trade a month of parallelism for no benefit, so it lands as a separate contract document.
5. **The identifier namespaces are renamed now, in one pass.** Seven prefixes collide across the six Wave 1 slots.
   The worst is `C-12`, which means both "accessibility is a release blocker" and "the organization and app names
   are permanent" depending on which document the reader arrived from; `C7` has three meanings; `B-3` means two
   different blockers in two registers that are both cited by the backlog. Every wave that passes adds citations, so
   the cost of this rename only grows.
6. **The W2 queue supersedes `docs/plan/backlog.md` §2 for this wave only**, rather than editing the backlog now.
   The backlog is P1's file and P1 wrote this queue, so editing it would have been permitted — but the C2 planning
   wave (`PLN-002`, W6) is where backlog re-sequencing belongs, and the verification wave `VER-001` at W5 needs a
   stable artefact to check against. All 29 differences are itemized so the write-back is mechanical.

---

## 5. Conflict register

The full register is `docs/plan/w1-conflict-register.md`. Six conflicts are new in this slot and each needs an
adjudication by a slot other than P1:

| # | Conflict | Adjudicator | Carrier | Target |
|---|---|---|---|---|
| X-13 | Two repository layouts and two backend module maps | P3, with A and B | `INF-009` | **W2, blocking `INF-001` and `SRV-001`** |
| X-14 | The technical-design set is written against the superseded media plane | A | `PLY-020` | W2 |
| X-15 | `docs/03-*` and `docs/architecture/*` are both canonical | P3 | `INF-009`, then a consolidation task at W6 | W2 / W6 |
| X-16 | `docs/architecture/`, `docs/product/` and `docs/design/` have no owning slot, so the one-file-one-owner rule cannot be applied to half the documentation | P3 | `GOV-006`; proposal in `docs/plan/w2-ready-queue.md` §2 | W2 |
| X-17 | `docs/plan/backlog.md` is assigned to P1 but was authored by the W1 P3 slot, and it carries the conflict ledger, which the protocol makes a per-slot artefact | P1 | `GOV-006` | W2 |
| X-18 | `docs/plan/backlog.md` §1 rule 1 forbids what `docs/plan/wave-protocol.md` §3.4 explicitly permits — a plan slot writing back an adjudication during an implement wave | P1 | `GOV-006` | W2 |

Three findings are defects rather than conflicts, and are cheap: `OBS-001` uses a domain prefix the backlog never
declared; `docs/plan/definition-of-done.md` S-A1 and S-A8 scan panel PNL-05 after the product slot deleted it; and
the backlog's own §7.1 check 13 deferred cross-file reference validation to integration, which is now partly done.

Nothing in this slot changed a threshold, removed a test, weakened a gate or added an exemption. Two of the queued
tasks make requirements **stricter** than the design set proposed: `CTR-004` adopts `AC-MON-6`'s server-side ad
reward grant with quotas and an audit record in place of D-AC-4's "trust the client and log it", and `QA-004` adopts
`AC-CMP-5`'s generated domain allowlist in place of MI-3's post-upload discovery of the E9 restriction.

---

## 6. Blockers

| # | Blocker | Effect | Who can clear it |
|---|---|---|---|
| `GATE-0` / B-1 | The One Page is readable only to §2.5 anonymously. Re-verified 2026-08-27: the URL returns `HTTP 302` to `login.feishu.cn` with zero bytes of document body | The six open questions in `docs/product/compliance-tiktok-minis.md` §9 stay open. Two of them bite in W2: whether the One Page constrains VePlayer beyond the public docs (affects `PLY-020`) and whether it prescribes a media-asset workflow different from `/v2/sg/shortdrama/*` (affects `CTR-011`) | Requester or the TikTok contact. The concrete ask is in `docs/plan/w1-conflict-register.md` §8.4 — an authenticated export of everything after §2.5, or view access for one named account, or answers to the six questions |
| `GATE-7` EIS | Criteria are unpublished and the process starts with an account-manager questionnaire | The largest unknown on the monetized launch path, and it sits upstream of contract signing, which is upstream of all of cycle C8 | Business. Start the conversation now — `GOV-005`, `GOV-003` |
| B-4 region decision | Undecided, and it now also determines whether `GATE-5` and `GATE-7` apply at all | Localization scope, legal URLs, the compliance critical path, and whether conflict X-03's privacy-baseline work must move earlier than cycle C10 | Business |
| `GATE-1` precondition | The organization name, the app name and the app type are permanent and are set before any engineering | Two irreversible, business-visible decisions with no correction path | Business and legal sign-off before creation |
| IAG-14 | The user-report desk has no owner and no rota, against a 72-hour platform SLA that `AC-OPS-6` makes release-blocking | An SLA breach visible to the platform and to users | Operations — name the owner, `GOV-005` |
| IAG-10 | The operations console has no design owner, so journeys J20–J23 are undeliverable | Content operations cannot act on moderation state | `IA-002` gives it an IA; a content-ops slot must then build it |

None of these blocks W2 from starting. `docs/design/minis-integration.md` §9 establishes why: the browse, play,
progress and favourites path depends on no commercially-approved platform capability, so engineering proceeds
against `MockBridge` while the business track runs in parallel.

---

## 7. Interfaces for the other W2 slots

**Slot A (client and bridge).** Your wave is `PLY-020`, `BRG-004`, `INF-001`, `INF-002`, in that order, plus
counter-signing `INF-009`. Do not start `INF-001` until `INF-009` freezes the layout — the ambiguity is real and
building against the wrong tree costs more than waiting a day. `PLY-020` is the one that unblocks other people:
`IA-001`'s state mapping and the W14 rewrite of `PLY-001` both wait on it.

**Slot B (server and contracts).** Eight adjudications must finish in W2 — `CTR-009` first, then `CTR-001` through
`CTR-006` and `CTR-010` — because `CTR-007` transcribes all of them at W3. `CTR-011`, `CTR-012` and `CTR-013` span
into W3; only `CTR-012` and `CTR-013` need to be complete before `CTR-008` generates types at W4. All eight
adjudications are edits to two documents that the conflict ledger has already staged, with the recommended
resolution attached; none of them requires new research.

**Slot C (infrastructure, quality, security).** `INF-000`, `QA-003` and `QA-004`. `QA-004` is new and it is the one
that matters beyond this wave: it turns the release-blocking `build` acceptance criteria into gate specifications
that `INF-003` implements at W3, which is what stops platform code-scan rejections from being discovered after
upload. Note the amended core-module wording in `QA-003`.

**Slot P2.** You had no task in the backlog for this wave, and there are twenty-one items waiting: the five
supersessions in `docs/product/sitemap-and-ia.md` §12, amendments PA-1…PA-10, gaps IAG-9 through IAG-11, and
deltas PS-2, PS-5 and MI-5. `IA-001` and `IA-002` carry them. Take the PS-2 state mapping in W3 as `IA-003` if
`PLY-020` has not landed.

**Slot P3.** Three adjudications are yours: `INF-009` (which you write, A and B counter-sign), the ownership table
in `docs/plan/w2-ready-queue.md` §2 to adopt or amend, and the gate-table amendments that `GOV-005` proposes. The
consolidation of `docs/03-*` into pointers is W6 work, not W2.

**Verification slot at W5 (`VER-001`).** Two of this wave's tasks are reverse-verifiable in the sense
`docs/plan/wave-protocol.md` §4.2 V-b requires — `QA-004`'s gate specifications and, through them, `INF-003` — and
the rest are document adjudications, which V-d covers. The specific things worth checking independently: that no
document still describes the superseded media plane without a correction row; that the renames in `GOV-006` left
every citation resolvable; and that `docs/12-api-contracts.md` §4.4 and `contracts/openapi.yaml` agree on the
playback descriptor.

---

## 8. Explicitly not done

- **No application code.** No `app/`, `server/`, `contracts/`, `packages/`, `infra/` or `.github/` directory was
  created. `INF-001` creates the tree, and it belongs to slot A.
- **No other slot's file was modified.** `docs/plan/backlog.md`, `docs/plan/wave-protocol.md`,
  `docs/plan/definition-of-done.md`, `docs/03-*`, `docs/11-*`, `docs/12-*`, `docs/14-*`, `docs/02-*`,
  `docs/architecture/*`, `docs/product/*` and `docs/design/*` are all unchanged on this branch. Every needed edit is
  registered with an owner and a carrier task.
- **No pull request, no merge to `main`, no CI configuration.** The repository still has no CI; none was added.
- **No renames applied.** N-1 … N-7 are proposed and demonstrated in the register's own prose, but the mechanical
  pass across the repository is `GOV-006`, in this wave, by P1 — after P3 and A have seen the proposal.
- **No attempt to authenticate to Feishu and no bypass attempted.** The access boundary was characterized, not
  circumvented.
- **No calendar estimates.** Sequencing is expressed in waves and dependencies, as the protocol requires.

---

## 9. Verification performed on this slot's own output

| # | Check | Result |
|---|---|---|
| 1 | Every task in the queue has all eight backlog columns filled | Pass — 24 tasks, no empty cell |
| 2 | Every dependency resolves to a task in the queue or to one already `[x]` | Pass |
| 3 | No cross-slot dependency inside W2 | One found (`IA-001` → `PLY-020`) and resolved by splitting `IA-003` out into W3, not by relaxing the rule |
| 4 | Every new identifier is unique against the 142 existing backlog IDs | Pass — re-parsed the backlog's task tables and diffed the 15 new identifiers against them |
| 5 | Every W1 finding has a carrier | Pass — the register's §9 enumerates 65 items, 63 still needing action; each maps to a W2 task, a later wave with a named carrier, or a gate |
| 6 | Numeric claims re-derived rather than copied | Pass — 142 tasks, 258 edges, 67 criteria, 14 release-blocking, J1–J24, PA-1…PA-10 |
| 7 | Feishu access status re-checked rather than inherited | Pass — `HTTP 302` to `login.feishu.cn`, zero body bytes, 2026-08-27 |
| 8 | Nothing lowers a threshold, removes a test or weakens a gate | Pass — two tasks make requirements stricter; none makes any looser |

---

## 10. Suggested next work

1. **Business track, starting immediately and independently of engineering:** open the EIS conversation and pre-fill
   the questionnaire with the account manager; get the organization name, app name and app type signed off before
   the organization is created; decide the launch regions, which settles whether two gates exist at all; request the
   authenticated One Page with the concrete ask in the register's §8.4; name the user-report rota owner.
2. **W3 planning input:** `CTR-007` must transcribe the adjudicated contract, not the current one; `INF-003` must
   implement the gates `QA-004` specified; `BRG-001` must implement the interface `BRG-004` reconciled.
3. **W6 (`PLN-002`) write-back:** apply the 15 new identifiers and 14 task amendments to `docs/plan/backlog.md`, and
   record whether `IA-003` was needed or folded back into `IA-001`.
4. **A standing item for every planning wave:** the register's §9 table is the list to walk. Sixty-three items still
   needing action is a lot, but each has an owner and a target wave, and the failure mode this project should fear
   is not the count — it is an item quietly losing its carrier the way corrections A1–A6 did between Wave 1's
   architecture slot and Wave 1's plan slot.
