# Cycle 2 — Integration Plan

> **Slot:** W6, plan slot (cycle C2, architecture / scheme).
> **Date:** 2026-08-27.
> **Branch:** `cursor/w6-plan-cycle-2-963c`, cut from `cursor/w5-verify-cycle-1-7ed1` (`27eec92`) and
> then merged with `cursor/w2-plan-p3-477e` — a docs-only, conflict-free merge — so that every
> `docs/plan/*` cross-reference in this document resolves on the branch that carries it.
> **Input:** `docs/verify/cycle-1-report.md`, verdict **not passed**, §9 Tier 0.
> **Mandate:** decide the scheme. This slot did not perform the code merge, did not open a pull
> request, did not modify any source file, and did not rewrite any origin branch.
> **Method:** every topology claim below was re-derived from the current remote with the command
> quoted next to it. Where the W5 report states a number, it was recomputed rather than copied —
> two branches (`w4-work-q-8f92`, `w4-work-r-d943`) were pushed after the report was written and
> they change the answer.

---

## 0. The headline: the merge is five branches, not sixteen

The W5 report scheduled "merge the sixteen off-trunk branches" as the whole of C2's first implement
wave. Re-derived against the remote as it stands today, that instruction is both out of date and
much too pessimistic.

There are now **18** branches outside the de-facto trunk `cursor/w4-work-p-53de` — the report's 16,
plus `w4-work-q-8f92` and `w4-work-r-d943`, which arrived after it was written. But only **six** of
the 18 are *maximal*: the other twelve are already ancestors of one of the six, so merging the six
merges all eighteen.

```
$ for a in $OFF; do for b in $OFF; do
    git merge-base --is-ancestor origin/cursor/$a origin/cursor/$b && echo "$a ⊂ $b"; done; done
```

| Maximal tip | Commits off trunk | Already contains | What it carries |
|---|---:|---|---|
| `w2-plan-p3-477e` | 31 | `w1-plan-p3-e16a`, `w1-product-ia-9cd1`, `w1-research-official-bb4f`, `w1-technical-design-docs-8a32`, `w2-plan-p1-0453`, `w2-plan-p2-media-plane-d4a6`, `w2-work-a-71b2`, `w2-work-b-1a8e` | 27 documents. **No code.** |
| `w4-work-r-d943` | 18 | `w2-work-d-0d0f`, `w2-work-h-5c79`, `w3-work-o-1f19` | Catalogue + feed server, client data layer, drama detail, search UI, player episode queue |
| `w3-work-m-9b99` | 18 | `w2-work-d-0d0f`, `w2-work-h-5c79` | The same catalogue + feed server, plus watch-history UI, profile, session context |
| `w2-work-j-acf5` | 8 | `w2-work-g-d191` | Server keyword search, favourites, watch-progress |
| `w4-work-q-8f92` | 2 | — | Progress + watch-history server, session store |
| `w3-work-l-8551` | 2 | — | Session-to-user binding, gated test-login port |

**Eight of the eighteen collapse into `w2-plan-p3-477e`, which is documentation only and merges with
no conflict.** That merge has already been taken on this branch (§4 step 1), which is why the
remaining work is five branches.

Two further facts set up everything below:

- **`w4-work-q-8f92` merges into the trunk cleanly.** Verified, not assumed.
- **`origin/main` (`fc1333f`) is an ancestor of every one of the six tips and of the trunk.** So
  landing on `main` is a genuine fast-forward, not a merge. This is the fact the whole of §2 rests
  on, and it has a shelf life — see §2.4.

```
$ for b in <the six tips> trunk; do git merge-base --is-ancestor origin/main $b; done   # all YES
```

So C2's integration job is: **one free docs merge (done), one free code merge, and four
adjudications.** An adjudication is not a merge conflict in the ordinary sense — in four places two
slots built the same module twice, and the resolution is to choose, not to combine (§5).

---

## 1. Decisions

These are scheme decisions, recorded in the four-element form the project uses: decision, reason,
reversal cost, who is bound.

### D-C2-1 — `main` is the trunk. There is no long-lived integration branch.

`docs/verify/cycle-1-report.md` D-09 records that no document identifies the integration branch.
This closes it: **`main` is where the product lands**, and `cursor/w4-work-p-53de` stops being
called the trunk the moment `main` passes it.

*Reason.* Every consequence the report describes follows from `main` being empty, not from the
absence of a branch to merge into. `.github/workflows/ci.yml` triggers on `push: branches: [main]`,
so CI is unreachable until `main` moves; `docs/14-quality-gates.md` §0 R6 ("`main` is releasable at
all times") is decorative until `main` holds something that could fail. Adopting a long-lived
integration branch instead would preserve both problems and add a second place to be wrong about.

*Reversal cost.* Low, and it falls in one direction only. If a permanently-broken `main` becomes a
problem, a `develop` branch can be introduced later by branching from `main`; nothing in this plan
would have to be undone.

*Binds.* All slots from W7 onward. Slot branches continue to be cut from `main` and pushed, never
merged by their own author (`docs/plan/wave-protocol.md` §8 rule 3).

### D-C2-2 — the integration branch is `cursor/integration-c2-963c`, and it is disposable

Assembly needs somewhere to be wrong for a while. `main` is not that place, because D-C2-1 makes it
the releasable trunk and the assembly involves four adjudications that will each spend time red.

*The name is `cursor/integration-c2-963c`.* It is **staging, not a trunk**: it exists for the
duration of C2's assembly, `main` fast-forwards onto it when it is green (§2), and it is deleted
after. C3 cuts a fresh `cursor/integration-c3-*` from `main` if it needs one. A staging branch that
outlives its cycle becomes the second trunk that D-C2-1 exists to prevent.

*It is cut from `cursor/w6-plan-cycle-2-963c`* — this branch — not from `w4-work-p-53de`, because
this branch is the trunk plus the docs merge plus the verification report, and step 1 of §4 is
therefore already done.

*Reversal cost.* Near zero. It is a branch name.

### D-C2-3 — the integrator is W7's work slot A, and integration is that slot's whole assignment

`docs/plan/wave-protocol.md` §8 rule 3 says merging is the integrator's job and never says who that
is. This names it: **the first work slot of W7 does the merge and does nothing else.**

*Reason.* The report's root-cause finding (D-05) is that sixteen work slots wrote to paths the
protocol assigns to one. Integration is precisely the task that touches every one of those paths at
once, so it cannot run in parallel with anything that writes to `server/src/app.ts`,
`contracts/openapi.yaml` or `packages/shared/src/index.ts`. That is a real constraint on W7's other
slots and §4.3 states it as one.

*Reversal cost.* Low.

### D-C2-4 — where two slots built the same module, one implementation is chosen whole

In four places (§5) two branches contain a module with the same path and different contents. The
resolution rule is: **choose the superset implementation entire, and delete the other, rather than
interleaving them.** The losing branch's distinct *behaviour* is then re-added as a follow-up task
against the winning implementation, if it is wanted at all.

*Reason.* Interleaving two implementations of a store and its routes produces code that neither
author's tests were written against, and the resulting suite passes for reasons nobody chose. The
report's `V-c` result — zero skipped, deleted or weakened tests across 31 branches — is the
cycle's strongest, and it survives a whole-file choice but not a hand-blended one.

*Reversal cost.* Medium and paid once. The discarded implementation stays reachable in git history,
so the reversal is a `git show` away, but re-choosing after downstream code is written against the
winner is expensive.

*Constraint.* R2 (no deleted tests) is about not deleting tests **to make a suite green**. Choosing
implementation A over implementation B removes B's tests with B, which is a scope change, not a
weakening — but it must be recorded as such in the merge commit, with the test count before and
after, or it is indistinguishable from the thing R2 forbids.

---

## 2. Landing on `main` without a pull request

### 2.1 The protocol does not forbid this; it prescribes it

`docs/plan/wave-protocol.md` §8 rule 3, in full:

> **不开 PR**：各槽只 push 分支，合并由集成者执行。
> *(Do not open PRs: slots only push branches; the merge is performed by the integrator.)*

The rule has two halves and the second half is usually dropped when it is quoted. It bans the
**pull request** — the GitHub review artifact — and in the same sentence it assigns the **merge** to
a named role. A protocol that forbade merging entirely could not have an integrator.

So merging with git and pushing the result is not a workaround for rule 3, it is the behaviour rule
3 describes. What is forbidden is `gh pr create` and everything downstream of it. What is required
is that no slot merges its own branch.

**Nothing in this plan requires a pull request at any point.**

### 2.2 The landing is a fast-forward

`origin/main` is `fc1333f`, one commit, `README.md` only, and it is an ancestor of every branch in
the repository. So `main` can be advanced with no merge commit and no possibility of a content
conflict — the operation is "move the pointer".

```
$ git merge-base --is-ancestor origin/main origin/cursor/w4-work-p-53de && echo YES
YES
```

That property is worth more than it looks. A fast-forward cannot introduce a resolution that nobody
reviewed: whatever tree was verified green on the staging branch is bit-for-bit the tree that lands.
There is no "the merge to main went wrong" failure mode available.

### 2.3 The landing sequence

Run by the integrator (D-C2-3), from a clean checkout, after §4 has left
`cursor/integration-c2-963c` green:

```bash
# 1. Prove the tree that is about to land is the tree that was verified.
git checkout cursor/integration-c2-963c
git pull --ff-only origin cursor/integration-c2-963c
pnpm install --frozen-lockfile && pnpm run verify        # must exit 0

# 2. Prove the landing is a fast-forward before attempting it.
git fetch origin main
git merge-base --is-ancestor origin/main HEAD || { echo "NOT a fast-forward — stop"; exit 1; }

# 3. Land. --ff-only is the safety: if main has moved, this fails instead of merging.
git push origin HEAD:main --force-with-lease=main:$(git rev-parse origin/main)
```

Two notes on step 3. `git push origin HEAD:main` is already refused by the server if it would not be
a fast-forward, so the push is safe by default; `--force-with-lease` pinned to the observed `main`
adds the guarantee that nothing landed between step 2 and step 3. And the push updates a branch — it
does not create a pull request, request a review, or notify a reviewer. It is `git`, not GitHub.

Immediately after, CI runs for the first time in the project's history, because `push: branches:
[main]` finally matches something. **Watching that run is part of the landing, not a follow-up.**
The first green run on `main` is the moment the C1 exit condition on gating becomes assessable at
all.

### 2.4 Keep `main` fast-forwardable until then

The fast-forward property is a live constraint, not a permanent fact. **Do not commit anything to
`main` before the landing** — not a README fix, not a CI tweak, not a plan document. One direct
commit to `main` makes `main` diverge from every branch in the repository, and converts a
pointer move into a merge with `README.md` conflicts and a resolution nobody verified.

This plan branch, and the two other documents this slot produced, are on `cursor/w6-plan-cycle-2-963c`
for exactly this reason.

### 2.5 If the push is refused

The repository is private on a plan that does not offer rulesets (`GET /rulesets` → 403 *"Upgrade to
GitHub Pro"*), and branch-protection state could not be read with the available token
(`GET /branches/main/protection` → 403 *"Resource not accessible by integration"*). So protection is
**unlikely but unverified**, and the honest position is that the first push is the probe.

If the push is rejected for a protection reason, do not open a pull request to get around it. The
options, in order:

1. **Ask the repository owner to disable the protection rule**, or to add the integrator to its
   bypass list. This is a one-line settings change and it is the correct fix: the protocol's model
   is an integrator with direct merge rights.
2. **If protection cannot be lifted**, the conflict is between an unwritable trunk and a protocol
   that forbids the only mechanism GitHub offers for writing to one. That is a protocol
   contradiction, and it is resolved by amending `docs/plan/wave-protocol.md` §9 (change log) — not
   by quietly opening a PR and not by leaving `main` empty for a second cycle. Record it as a gate.

Either way the outcome is written into §9 of the protocol, so C3 does not rediscover it.

---

## 3. Topology as it stands

Thirty-four branches. One (`main`) is the trunk-to-be, one is this plan branch, one is the W5
verification branch, thirteen are ancestors of `w4-work-p-53de`, and the rest are the eighteen
described in §0.

```
main (fc1333f, README only)
 └── … 51 commits … ── w4-work-p-53de              ← de-facto trunk, verifies green
      └── w5-verify-cycle-1-7ed1                    ← + the C1 report
           └── w6-plan-cycle-2-963c  ◀ HERE         ← + w2-plan-p3 (docs, merged) + this plan
                └── integration-c2-963c             ← to be cut by W7 slot A

     still outside, five code tips:
       w4-work-q-8f92   (+2)   clean against HERE
       w4-work-r-d943   (+18)  conflicts: shared/index.ts, app.ts, contract.test.ts
       w3-work-m-9b99   (+18)  conflicts: shared/index.ts, app.ts, contract.test.ts
       w2-work-j-acf5   (+8)   conflicts: openapi.yaml, shared/errors.ts, shared/index.ts, app.ts
       w3-work-l-8551   (+2)   conflicts: app.ts, config.ts
```

Thirty-seven unique commits remain to be integrated, from five branches.

`server/src/app.ts` is in every conflict set, for the reason the report gives: it is the composition
root, and every slot registers its routes there. On the trunk it registers six modules; `r` and `m`
register six *different* ones, having dropped `entitlementRoutes` and `unlockRoutes` when they
forked. That is not a conflict to resolve line-by-line — it is a file to rewrite as the union
(§5.6).

---

## 4. The ordered merge

Order is cheapest-first, and each step is separately verifiable. **`pnpm run verify` runs after
every step, not at the end** — the report's finding that no combination of these branches has ever
been compiled together means every step is the first time its combination has existed.

### 4.1 The sequence

| # | Merge | Expected | Gate |
|---:|---|---|---|
| 1 | `w2-plan-p3-477e` | **Clean. Already done on this branch.** 27 docs, 0 code. Retires 8 branches | Docs-only diff confirmed: `git diff --name-only HEAD~1 HEAD \| grep -v '^docs/'` is empty |
| 2 | `w4-work-q-8f92` | **Clean**, verified by `merge-tree` against this branch | `verify` green. Progress + watch-history endpoints answer |
| 3 | `w3-work-l-8551` | Conflict in `app.ts`, `config.ts`. Adjudication **A3** — `q` already contains `l`'s session store *verbatim*, so this reduces to taking `test-login.ts` and its config flag | `verify` green. `MINIDRAMA_TEST_LOGIN` gate still refuses by default |
| 4 | `w4-work-r-d943` | Conflict in `shared/index.ts`, `app.ts`, `contract.test.ts`. Brings the catalogue, feed, drama detail, search UI and player queue in one step (it contains `d`, `h` and `o`) | `verify` green. Union contract holds ≥ 12 paths |
| 5 | `w3-work-m-9b99` | Conflict in 4 **client** files only, against `r` (§5.4). Server side is already in via `r` | `verify` green. Route table holds `home`, `play`, `drama`, `search`, `history`, `me`, `fallback` |
| 6 | `w2-work-j-acf5` | Conflict in `openapi.yaml`, `shared/errors.ts`, `shared/index.ts`, `app.ts`, plus add/add on `discovery/routes.ts`. Adjudications **A1** and **A2** | `verify` green. `GET /v1/search` answers the client that `r` already shipped |
| 7 | Contract reconciliation | Not a merge. One `openapi.yaml`, one `contract.test.ts`, parity re-checked against `docs/12-api-contracts.md` | `verify` green. Adjudication **A5** recorded |
| 8 | Fast-forward `main` | §2.3 | **CI green on `main`.** First run in project history |

### 4.2 Why this order

`q` before `l` because `q` contains `l`'s session store verbatim, so taking `q` first turns step 3
from a merge into a two-file addition. `r` before `m` because `r` is the larger of the two catalogue
descendants and carries the guardrail improvement (`source-rules.ts`, computed-name `createElement`
rejection) that later steps should be gated by rather than added after. `j` last among the code
branches because it is the one that loses two adjudications (A1, A2) and therefore shrinks the most
during the merge — doing it last means it is reconciled against a tree that already holds everything
else, instead of being reconciled twice.

`j` is also the only step whose *value* is contingent: strip its progress module (A1, superseded by
`q`) and its feed-colliding `discovery/routes.ts` (A2), and what remains is server-side search and
favourites. Server-side search is not optional — `r` ships a search **client** in step 4 that calls
an endpoint no other branch implements (§5.2). Step 6 is what stops step 4 from shipping a dead
screen.

### 4.3 What W7's other slots may not do

Integration touches `server/src/app.ts`, `contracts/openapi.yaml`, `packages/shared/src/index.ts`,
`packages/shared/src/errors.ts`, `server/src/contract.test.ts`, `server/src/config.ts` and the client
shell (`App.tsx`, `main.tsx`, `routes.ts`, `testing/render.tsx`).

**No other W7 slot may write to those paths.** This is `docs/plan/wave-protocol.md` §3.1 file
ownership, applied to the one task that legitimately needs all of it at once. A slot that needs a
route registered during W7 registers it in a module file and hands the one-line composition-root
change to the integrator through the conflict register (§3.4), rather than editing `app.ts`.

This is also the first application of the report's Tier 0 item 4 (restore file ownership, D-05) and
it is deliberately being applied to the integration wave first, where the cost of getting it wrong
is highest and most visible.

---

## 5. The four adjudications

These are the decisions the merge cannot make on its own. Each is stated as: what was built twice,
what the evidence says, and the recommendation. **The integrator decides; this plan recommends.**

> **Amended in place after the merge**, as §9 condition 6 requires. Each of A1–A6 below now carries
> a **Decided** note recording what the integrator actually did. A **seventh** adjudication, A7, was
> not foreseen by this plan and is added at the end of this section: two W7 client branches built the
> HTTP transport's write half twice. The full account of the run is
> `docs/handoff/w6-integrate.md`; the merge commits carry the reasoning per step.
>
> All six recommendations here were followed. The one place this plan was materially incomplete is
> that A1–A6 are all about *server* modules and route tables, and the collision that cost the most
> to resolve was in a *client* module — see A7.

### A1 — the progress module: `w4-work-q-8f92` over `w2-work-j-acf5`

Both branches contain `server/src/modules/progress/{progress,store,routes,viewer}.ts` and their
tests, from independent starts. `git merge-tree` reports **add/add** conflicts on all six files.

`q` is the superset: it holds those four plus `history.ts`, `history-routes.ts`, `catalog-port.ts`,
`fixtures.ts` and `test-sessions.ts`, and its `store.ts` extends `j`'s with the bounded
viewer-rows listing that watch-history is built from. `q`'s own comments document the bound
(`WATCH_HISTORY_SCAN_LIMIT`) and why it exists.

**Recommend: take `q`'s progress module whole; drop `j`'s.** Both publish
`/v1/progress/episodes/{episodeId}`, so no endpoint is lost. Record the test-count delta in the
merge commit per D-C2-4.

**Decided: as recommended.** `q`'s six conflicting files taken whole; `progress.ts` and its test
were byte-identical on both sides, so nothing was chosen there. `j`'s 38 discarded progress tests
were replaced by `q`'s 43 in the same three files plus watch history's 72. Both branches publish the
endpoint, so nothing was lost. Recorded in the step-6 merge commit with the counts, per D-C2-4.

### A2 — `server/src/modules/discovery/routes.ts`: two different modules, one path

`j` uses `discovery/` for search, favourites and drama listing (11 files); `r` and `m` use
`discovery/` for the recommendation feed (4 files). The name collides; the contents do not overlap.
This is an add/add conflict that is not a duplicate — **both bodies of work are wanted.**

**Recommend: keep `r`'s `discovery/` as the feed module, and move `j`'s search and favourites into
`server/src/modules/search/`.** `routes.ts` is then two files with one registration each, and
`app.ts` registers both. The alternative — one `discovery` module with two route files — preserves
the OpenAPI `tags: [discovery]` grouping that `j`'s contract already declares, and is acceptable if
the integrator prefers it; what is not acceptable is choosing one file and losing the other's
endpoints.

**Decided: as recommended.** `discovery/` stays the recommendation feed; `j`'s eleven files moved
verbatim to `server/src/modules/search/` and its plugin was renamed `searchRoutes`. `app.ts`
registers both. The move needed no rewriting inside the module — every import it makes is
module-relative or `../../`-relative. One reconciliation was needed: `j`'s favourites were written
against its own viewer seam in `progress/viewer.ts`, which A1 had just discarded, so they now use the
seam that won. Every assertion, token and expected status is unchanged.

### A3 — the identity session: `q` already contains `l`

`w4-work-q-8f92` and `w3-work-l-8551` both add `session-store.ts` and `session-viewer-resolver.ts`
to `server/src/modules/identity/`. They are **byte-identical**:

```
$ diff <(git show origin/cursor/w4-work-q-8f92:server/src/modules/identity/session-store.ts) \
       <(git show origin/cursor/w3-work-l-8551:server/src/modules/identity/session-store.ts)
$                                                                          # no output
```

`git merge-tree` confirms it — merging `q` and `l` conflicts on `app.ts`, `config.ts` and
`identity/routes.ts`, but *not* on the session files, because there is nothing to reconcile.

So `l`'s unique contribution is two files: `test-login.ts` and `test-login.test.ts` — a mock login
port behind a two-condition environment gate (`MINIDRAMA_TEST_LOGIN` must equal a sentence, not a
boolean), deliberately kept out of the real identity port so that no authentication bypass can ship
by flag error.

**Recommend: merge `q` first, then take `l`'s two `test-login` files and its `config.ts` flag.**
This is the one piece of C1 work that makes every authenticated endpoint testable end-to-end, and
after the merge the whole of `q`'s progress and watch-history surface can actually be exercised
with a session. Preserve the gate exactly as written; it is the reason this is safe.

**Decided: as recommended.** The byte-identical claim held — verified, not assumed. `l` reduced to
`test-login.ts`, its test, and the `config.ts` flag. The two-condition gate is preserved verbatim
and still refuses by default.

### A4 — the client shell: `m` and `r` collide in four files, and nowhere else

`m` and `r` share the ancestor `w2-work-h-5c79`, so their **server trees are identical** and their
merge conflicts are entirely in the client shell:

| File | Nature of the conflict |
|---|---|
| `app/src/routes/routes.ts` | `m` declares `me` and `history`; `r` declares `drama` and `search`. Additive — take the union |
| `app/src/main.tsx` | Each wraps the tree in its own data-API provider. Additive — nest both |
| `app/src/App.tsx` | Route table wiring, one line per route. Additive |
| `app/src/testing/render.tsx` | Each adds its own provider to the test harness. Additive |

Plus non-conflicting overlaps in `en.json` / `ar.json`, `styles/app.css`, `components/states.tsx` and
`HomePage.tsx` that git merges cleanly.

**Recommend: take the union in all four.** The report calls the `m`/`r` route tables "a manual
reconciliation, not a fast-forward", and that is right, but the reconciliation is four additive
files rather than a redesign. After it, the client holds 7 of 13 screens.

The one thing to check by hand rather than by merge: `m` and `r` both modify
`app/src/components/states.tsx` and git will merge both. Read the result — two slots' empty/error
states in one file is exactly where a silently-wrong merge hides.

**Decided: as recommended, and the shape recurred three more times.** The union was taken in all
four files, and the same four files conflicted again on each later client branch — the provider
nesting in `main.tsx` and `testing/render.tsx` is now five deep. Two corrections to this section:

- **The route table's dangerous copy is in a test, not in `routes.ts`.**
  `app/src/routes/routes.test.ts` enumerates `Object.keys(ROUTES)` against a literal list, and that
  list is what a merge shortens. It happened: the favourites merge dropped `search` from it. The
  suite went red only because the list was *shorter* than reality; had it lost an entry with no route
  behind it, the merge would have been green and wrong.
- **`app/src/core/i18n/locales/{en,ar}.json` conflict on every client merge**, always additively and
  always in disjoint key namespaces. Worth checking by key count on both files rather than by
  reading: they are 119 keys each and must stay equal.

### A5 — one contract

After steps 2–6 the union is roughly 15 paths across the branches that declared them, and
`contracts/openapi.yaml` will have been merged five times. Step 7 is a **read of the whole file**,
not a diff review:

- Every path registered in `app.ts` appears in the contract, and every contracted path is
  registered. `server/src/contract.test.ts` is the assertion; it conflicted in three of the merges
  and must be re-derived rather than patched.
- The trunk's `/v1/entitlement/episode-access`, `/v1/unlock/coin-orders` and
  `/v1/unlock/coin-orders/{orderId}` **survived**. `r` and `m` both dropped them at their fork
  points, and steps 4 and 5 are where they would silently disappear. Assert their presence
  explicitly.
- `X-19` / `X-20` (`docs/plan/x19-playback-endpoint.md`) — the naming divergence between doc 12's
  `POST /episodes/{episodeId}/playback-token` and the served `POST /v1/playback/sessions`, and
  `/health` sitting outside `/v1` — are now decided in one place, since the document that
  adjudicates them and the code they describe are on the same branch for the first time.
- **D-07**: `docs/12-api-contracts.md` contradicts itself on unlock paths. Fix the document; it is a
  two-line edit and it is blocking parity measurement.

Parity against doc 12's 40 endpoints is *measured and written down* here, not closed. Closing it is
C2 feature work, not integration.

**Decided: done, and this section understated the job in one way.** 19 documented, 19 registered,
sets equal — enumerated from `printRoutes` on the built app, not read off `app.ts`. All three named
survivors are served. Parity is **19 of 40**.

Two things this section did not anticipate:

- **`contract.test.ts` only asserted one direction.** It dispatched every documented operation
  against the real app, so a lost `register` call could not hide — but nothing asserted that a
  *served* route is documented, so dropping a path block from the contract left the suite green. The
  only record of what ought to be there was a hand-written `arrayContaining` list, and that list was
  missing `POST /v1/entitlement/episode-access` when step 7 began. The test now compares both sets
  in both directions, and both halves were probed with the defect they exist to catch.
- **Four schemas were defined twice** (`PageInfo`, `DramaStat`, `DramaSummary`, `ViewerAccess`) after
  five merges of `openapi.yaml`. A repeated YAML key resolves to the last definition, so for four
  names the effective contract was whichever branch merged later. Three were cosmetic. `ViewerAccess`
  was not: the winning block asserted "`UNAVAILABLE` is not returned here" while the server returns
  exactly that from two call sites and `packages/shared` has carried it in the union all along. **A
  duplicate key is how a contract contradicts its own code invisibly** — this is worth a step of its
  own in any future cycle that merges a contract more than twice.

### A6 — `server/src/app.ts` is rewritten, not merged

It appears in all five conflict sets. Resolving it five times line-by-line will produce five
partially-correct composition roots.

**Recommend: after step 6, rewrite `app.ts` once** as the deliberate union — every module registered,
every port wired, registration order chosen rather than inherited from whichever merge won. Then let
`contract.test.ts` prove the result is complete. The specific trap: the trunk registers
`entitlementRoutes` and `unlockRoutes`; `r`'s and `m`'s versions of `app.ts` do not. A three-way
merge that takes "their" side of a hunk drops the unlock economy from the server and every remaining
test still passes, because the tests that covered it came from a branch whose `app.ts` lost.

**Decided: as recommended, and this was the most useful paragraph in the plan.** `app.ts` was
composed once as the deliberate union rather than resolved five times: eleven route plugins, every
port wired, registration order chosen. `entitlementRoutes` and `unlockRoutes` are both registered.
The five branches merged after step 6 added no server route, so it needed no further edit.

The specific trap named above is real and was defused, but the mechanism deserves promoting out of
prose: **the reason a dropped registration would have gone unnoticed is that nothing asserted it.**
A5's new both-directions test is what makes A6 checkable by command instead of by remembering to
read this paragraph. If C3 keeps one thing from this plan, keep that test.

### A7 — `app/src/data/http.ts`: the client transport's write half, built twice

**Not foreseen by this plan. Added after the fact.** A1–A6 concern server modules and route tables;
this is the one collision that was in a client module, and it cost more to resolve than any of them.

`w7-work-unlock-overlay-ec70` and `w7-work-favorites-6ca8` both gave the client transport a write
verb, from independent starts, neither able to see the other:

- **unlock** added `postJson`, and deliberately routed it *around* the single automatic retry: a
  `POST` that opens a payment must not be repeated by the transport, because a transport failure does
  not say whether the request arrived.
- **favourites** added `send(method, path, query)` for `PUT`/`DELETE`, taught `attempt` to skip
  `json()` on a `204`, hoisted the retry into a `withRetry` helper applied to reads and idempotent
  writes alike, and introduced `WRITE_METHODS` as the list the retry may repeat.

**This is A2's shape, not A1's:** the file collides, the contents do not, and both bodies of work are
wanted. So the resolution is a union, not a choice — but per D-C2-4 not a hand-blend either.

**Decided: `http.ts` composed once as the deliberate union.** `attempt(url, request, successBody)`
takes unlock's full request init and favourites' `'JSON' | 'NONE'` success mode; `withRetry` wraps it
for `getJson` and `send`; `postJson` calls `attempt` directly. The two authors' rules turned out to
be one rule stated twice — `POST`'s absence from `WRITE_METHODS` *is* unlock's no-retry rule,
enforced by the type rather than at the call site — and the module comment now says it once.

**The generalisable finding is about test doubles, and it is the failure mode C3 should expect.**
Every API client's double in this codebase is structural: favourites' supplies `{getJson, send}`,
unlock's supplies `{getJson, postJson}`. A single `HttpClient` carrying all three methods makes
*both* sets stop typechecking. The same thing happened one merge earlier, when unlock's `postJson`
broke the read-only doubles in `history-api.test.ts` and `search-api.test.ts`.

Both times the fix was the same and both times an author had reached it independently: **narrow the
consumer to the capability it uses.** `http.ts` now publishes `HttpReader`, `HttpWriter` and
`HttpPoster`, with `HttpClient` extending all three; `createFavoritesApi` takes
`HttpReader & HttpWriter`, `createUnlockApi` takes `HttpReader & HttpPoster`, and the read clients
take `HttpReader`. Only annotations moved — no assertion, fixture or expectation was touched, which
is what keeps this on the right side of §7.

**For C3:** a slot that widens a shared interface should expect to narrow some consumers in the same
change, and an integrator should expect a widened interface to break doubles on every branch that
forked before it. This is not a merge conflict — git merges it cleanly and `tsc` is what objects — so
it will not appear in any `merge-tree` survey done in advance.

---

## 6. Late arrivals

Two slots were in flight when this plan was written. Neither is a blocker; both are listed here so
the integrator recognises them rather than rediscovering them mid-merge.

| Slot | Branch | Status at time of writing | How it lands |
|---|---|---|---|
| **Watch history** | `w4-work-q-8f92` | **Arrived.** 2 commits, +4,575 lines, 35 files. Merges clean | It is step 2. Already in the sequence; no special handling |
| **Catalogue cover** | not yet pushed | **In flight.** Expected to wire the `checkCoverUrl` allowlist into `CoverImage` — the report's D-02 | See below |

**Watch history** is only a "late arrival" in the sense that the W5 report does not know about it.
It is the best-behaved branch in the set: clean against the trunk, and it happens to resolve A1 and
most of A3 by being a superset of two other branches.

**Catalogue cover** has not appeared on the remote. If it lands before step 4, merge it immediately
after `r` — it will touch `app/src/components/CoverImage.tsx`, which arrives with `w2-work-h` inside
`r`, and `packages/config`'s allowlist, which is already on the trunk. If it lands after step 6,
merge it against the assembled tree, where it is easier rather than harder: the caller it needs to
wire into (`CoverImage`) and the allowlist it needs to call (`checkCoverUrl`) are on the same tree
for the first time.

If it does not land at all, **D-02 does not close by itself.** The report's finding is that the
allowlist has 69 tests and no caller, and merging the branches that contain each half does not
connect them. It is carried as a Tier 2 task in `docs/plan/cycle-2-backlog.md` for exactly this
reason.

A third possibility deserves naming: further slots may push branches during W7 while the merge is in
progress. **A branch that appears after the integrator has started step 4 is merged in C3, not
squeezed in.** The cost of this cycle was 31 branches assembled at the end; the fix is not to
assemble 33 at the end.

**What actually happened: the catalogue cover branch landed and was merged, and the "merge in C3"
rule was applied to three branches out of seven.** Seven branches arrived after this plan was
written. Splitting them was a judgement, and the line drawn was *whether deferring costs more than
merging*:

| Branch | Taken? | Why |
|---|---|---|
| `w4-work-s-cover-url-check-6186` | merged | The §6 "in flight" row above. Landed before step 4, merged where this section says. Closes D-02's caller gap |
| `w6-work-jsx-scan-b942` | merged | Remediation: the bundle scan could not see JSX-runtime element calls, so a native player could reach the artifact with `check:guardrails` green |
| `w6-work-ci-074b` | merged | Remediation: CI had never run on anything. Backlog T0-1, §9 condition 4 |
| `w7-work-unlock-overlay-ec70` | merged | The only caller of `/v1/unlock/coin-orders`, which the trunk has served since W2 |
| `w7-work-favorites-6ca8` | merged | The only caller of `j`'s three favourite endpoints, merged one step earlier |
| `w7-work-auth-header-96d6` | **C3** | Arrived after step 7 began |
| `w8-work-favorites-list-a666` | **C3** | Arrived after step 7 began. Adds a 20th endpoint |
| `w8-work-session-viewer-bc30` | **C3** | Arrived after step 7 began |

The rule as written is a good default and the reason given for it — do not assemble 33 at the end —
is the right reason. But it reads as a rule about *timing*, and timing was not what made the
difference. Four of the five branches taken were either remediation or **the missing caller for an
endpoint C1 had already built**, and deferring those reproduces D-02 exactly: an implemented half
with nothing on the other side of it. Deferring the three W8 branches costs nothing, because the work
they extend is now on one tree for the first time.

**Suggested restatement for C3:** a branch that arrives mid-merge is deferred *unless* it is
remediation of a defect the cycle's own report names, or it is the only consumer of something already
merged. Those two exceptions are narrow enough not to reopen the 33-branch problem.

One consequence worth flagging: **`w7-work-auth-header-96d6` conflicts with A7 by construction.** It
rewrites `main.tsx`'s transport wiring and adds its own `transports.ts`, against a base that has
neither `postJson` nor `send`. Read A7 before merging it.

---

## 7. Abort criteria

The merge is a long operation with a green trunk on either side of it. It should be abandoned rather
than pushed through if:

- **Any step leaves `verify` red for longer than the step itself took to merge.** Reset to the
  previous step's commit and re-plan that step. A step that cannot be made green in its own scope is
  an adjudication that was decided wrong.
- **A step requires editing a test to pass.** This is R1–R5 and it is not negotiable. The correct
  move is to change the merge resolution until the test as written passes, or to record the test as
  a scope change under D-C2-4 with its count.
- **The union contract loses an endpoint that the trunk served.** Stop; this is A5/A6's specific
  failure mode and it is silent.
- **`main` stops being fast-forwardable** (§2.4). Stop and re-plan §2; do not paper over it with a
  merge commit that nobody verified.

Rollback at any point is `git reset --hard` to the previous step's commit on
`cursor/integration-c2-963c`. Nothing has landed on `main` until step 8, and no origin branch is
rewritten at any point, so the blast radius of an abandoned merge is one deletable branch.

---

## 8. What this plan deliberately does not do

- **It does not perform the merge.** Steps 2–8 are W7 slot A's. The only merge taken here is step 1,
  which is documentation-only, conflict-free, and taken so this document's own cross-references
  resolve.
- **It does not open a pull request**, and no step in it requires one (§2.1).
- **It does not decide the adjudications.** §5 recommends with evidence; the integrator decides at
  the tree, where the evidence is better.
- **It does not touch `main`** — deliberately, to preserve the fast-forward property (§2.4).
- **It does not schedule feature work.** That is `docs/plan/cycle-2-backlog.md`.
- **It does not re-verify C1.** The W5 report owns the re-verification and the verdict; this plan
  consumes it.

---

## 9. Definition of done for C2 integration

Integration is complete when all of the following are true, each checkable by command:

| # | Condition | Check |
|---:|---|---|
| 1 | `main` contains the assembled product | `git ls-tree -r --name-only origin/main \| wc -l` ≫ 1 |
| 2 | `main` is at or ahead of every C1 branch | `git merge-base --is-ancestor <tip> origin/main` for all six tips |
| 3 | CI has run on `main` and gone green | `gh run list --branch main` shows ≥ 1 `success` |
| 4 | CI runs on feature branches too | `gh run list` shows a run on a `cursor/**` branch (backlog **T0-1**) |
| 5 | One contract, matching the routes | `verify` green, `contract.test.ts` re-derived, A5 recorded |
| 6 | The adjudications are written down | This file's §5 amended in place with what was actually decided |
| 7 | The branches are retired | The five tips deleted from origin, or documented as retained and why |

Conditions 1–3 close **D-03** and **D-09**. Condition 5 closes **D-04**. §4.3 is the first
instalment on **D-05**.
